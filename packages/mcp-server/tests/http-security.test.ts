import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  createMcpHttpApp,
  resolveAllowedOrigins,
  verifyBearerToken,
  type McpHttpAppInstance
} from '../src/http-app.js';
import { setupServerHandlers } from '../src/index.js';
import type { CoreServicesManager } from '../src/adapters/core-services.js';

const INIT_REQUEST = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' }
  }
};

function makeStubHealthProvider() {
  return {
    getHealthStatus: vi.fn().mockResolvedValue({
      initialized: true,
      services: { modelManager: true }
    })
  };
}

function makeStubMcpServer(): McpServer {
  return new McpServer(
    { name: 'test-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );
}

async function startTestMcpServer(
  env: NodeJS.ProcessEnv,
  createSessionServer?: () => Promise<McpServer>
): Promise<{
  httpServer: HttpServer;
  instance: McpHttpAppInstance;
  baseUrl: string;
  createSpy: ReturnType<typeof vi.fn>;
}> {
  const createSpy = vi.fn(createSessionServer ?? (async () => makeStubMcpServer()));
  const instance = createMcpHttpApp({
    env,
    healthProvider: makeStubHealthProvider(),
    createSessionServer: createSpy
  });

  const httpServer = await new Promise<HttpServer>((resolve) => {
    const srv = instance.app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const { port } = httpServer.address() as AddressInfo;
  return {
    httpServer,
    instance,
    baseUrl: `http://127.0.0.1:${port}`,
    createSpy
  };
}

describe('MCP HTTP security hardening (H1, L4)', () => {
  let activeHttp: HttpServer | undefined;
  let activeInstance: McpHttpAppInstance | undefined;

  afterEach(async () => {
    if (activeInstance) {
      await activeInstance.cleanup();
      activeInstance = undefined;
    }
    if (activeHttp) {
      await new Promise<void>((resolve) => activeHttp!.close(() => resolve()));
      activeHttp = undefined;
    }
  });

  it('fails closed on /mcp when MCP_API_TOKEN is unset and MCP_ALLOW_UNAUTHENTICATED != 1', async () => {
    const running = await startTestMcpServer({});
    activeHttp = running.httpServer;
    activeInstance = running.instance;

    const res = await fetch(`${running.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream'
      },
      body: JSON.stringify(INIT_REQUEST)
    });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error?.message).toBe('Authentication is not configured');
    expect(running.createSpy).not.toHaveBeenCalled();

    // /healthz still returns minimal { ok: true }
    const health = await fetch(`${running.baseUrl}/healthz`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });
  });

  it('enforces constant-time Bearer token auth on /mcp when MCP_API_TOKEN is configured', async () => {
    expect(verifyBearerToken('Bearer secret-token', 'secret-token')).toBe(true);
    expect(verifyBearerToken('Bearer wrong', 'secret-token')).toBe(false);
    expect(verifyBearerToken(undefined, 'secret-token')).toBe(false);

    const running = await startTestMcpServer({ MCP_API_TOKEN: 'mcp-top-secret-token' });
    activeHttp = running.httpServer;
    activeInstance = running.instance;

    const noAuth = await fetch(`${running.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream'
      },
      body: JSON.stringify(INIT_REQUEST)
    });
    expect(noAuth.status).toBe(401);
    expect(noAuth.headers.get('www-authenticate')).toBe('Bearer');

    const badAuth = await fetch(`${running.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer wrong-token'
      },
      body: JSON.stringify(INIT_REQUEST)
    });
    expect(badAuth.status).toBe(401);
    expect(running.createSpy).not.toHaveBeenCalled();

    const goodAuth = await fetch(`${running.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer mcp-top-secret-token'
      },
      body: JSON.stringify(INIT_REQUEST)
    });
    expect(goodAuth.status).toBe(200);
    expect(goodAuth.headers.get('mcp-session-id')).toBeTruthy();
    expect(goodAuth.headers.get('access-control-allow-origin')).toBeNull();
    expect(running.createSpy).toHaveBeenCalledTimes(1);
  });

  it('enforces DNS rebinding / Origin allowlist and never emits wildcard CORS', async () => {
    expect(resolveAllowedOrigins({ MCP_ALLOWED_ORIGINS: '*' }, 3000)).not.toContain('*');

    const running = await startTestMcpServer({
      MCP_API_TOKEN: 'tok',
      MCP_ALLOWED_ORIGINS: 'http://127.0.0.1:5173,https://trusted.example'
    });
    activeHttp = running.httpServer;
    activeInstance = running.instance;

    const evilOrigin = await fetch(`${running.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer tok',
        Origin: 'https://evil.example'
      },
      body: JSON.stringify(INIT_REQUEST)
    });
    expect(evilOrigin.status).toBe(403);
    expect(evilOrigin.headers.get('access-control-allow-origin')).toBeNull();

    const okOrigin = await fetch(`${running.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer tok',
        Origin: 'https://trusted.example'
      },
      body: JSON.stringify(INIT_REQUEST)
    });
    expect(okOrigin.status).toBe(200);
    expect(okOrigin.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('caps active sessions via MCP_MAX_SESSIONS and prunes idle sessions after MCP_SESSION_IDLE_TTL_MS', async () => {
    const running = await startTestMcpServer({
      MCP_ALLOW_UNAUTHENTICATED: '1',
      MCP_MAX_SESSIONS: '2',
      MCP_SESSION_IDLE_TTL_MS: '60'
    });
    activeHttp = running.httpServer;
    activeInstance = running.instance;

    const init = () =>
      fetch(`${running.baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream'
        },
        body: JSON.stringify(INIT_REQUEST)
      });

    const s1 = await init();
    expect(s1.status).toBe(200);
    const sid1 = s1.headers.get('mcp-session-id');
    expect(sid1).toBeTruthy();

    const s2 = await init();
    expect(s2.status).toBe(200);
    expect(running.instance.getActiveSessionCount()).toBe(2);

    // 3rd session exceeds MCP_MAX_SESSIONS -> 503
    const s3 = await init();
    expect(s3.status).toBe(503);

    // Wait past idle TTL -> expired sessions are pruned and new session succeeds
    await new Promise((resolve) => setTimeout(resolve, 90));

    const expiredAccess = await fetch(`${running.baseUrl}/mcp`, {
      method: 'GET',
      headers: { 'mcp-session-id': sid1! }
    });
    expect(expiredAccess.status).toBe(400);

    const s4 = await init();
    expect(s4.status).toBe(200);
    expect(running.instance.getActiveSessionCount()).toBe(1);
  });

  it('enforces bounded per-IP rate limiting on /mcp', async () => {
    const running = await startTestMcpServer({
      MCP_API_TOKEN: 'tok',
      MCP_RATE_LIMIT_MAX: '2',
      MCP_RATE_LIMIT_WINDOW_MS: '60000',
      MCP_RATE_LIMIT_MAX_ENTRIES: '10'
    });
    activeHttp = running.httpServer;
    activeInstance = running.instance;

    for (let i = 0; i < 2; i += 1) {
      const r = await fetch(`${running.baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Real-Ip': '198.51.100.50'
        },
        body: JSON.stringify({})
      });
      expect(r.status).toBe(401);
    }

    const limited = await fetch(`${running.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Real-Ip': '198.51.100.50'
      },
      body: JSON.stringify({})
    });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);

    // Separate IP is unaffected
    const otherIp = await fetch(`${running.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Real-Ip': '198.51.100.51'
      },
      body: JSON.stringify({})
    });
    expect(otherIp.status).toBe(401);
  });

  it('L4: sanitizes raw internal error messages thrown during MCP tool execution', async () => {
    const mcpServer = makeStubMcpServer();
    const fakeTemplateManager = {
      listTemplatesByType: vi.fn().mockResolvedValue([
        { id: 'tpl-1', name: 'Default', metadata: { description: 'desc' } }
      ])
    };
    const fakeCoreServices = {
      getTemplateManager: () => fakeTemplateManager,
      getModelManager: () => ({
        getModel: vi.fn().mockResolvedValue({ enabled: true })
      }),
      getPromptService: () => ({
        optimizePrompt: vi.fn().mockRejectedValue(
          new Error('Upstream boom: invalid key sk-live-SUPER-SECRET-LEAK-999')
        )
      })
    } as unknown as CoreServicesManager;

    await setupServerHandlers(mcpServer, fakeCoreServices);

    const requestHandlers = (
      mcpServer as unknown as {
        _requestHandlers: Map<string, (req: unknown) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>>;
      }
    )._requestHandlers;
    const callToolHandler = requestHandlers.get(CallToolRequestSchema.shape.method.value);
    expect(callToolHandler).toBeDefined();

    const result = await callToolHandler!({
      method: 'tools/call',
      params: {
        name: 'optimize-user-prompt',
        arguments: { prompt: 'hello world' }
      }
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toContain('sk-live-SUPER-SECRET-LEAK-999');
    expect(result.content[0].text).not.toContain('Upstream boom');
  });
});
