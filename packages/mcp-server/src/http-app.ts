import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import net from 'node:net';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { CoreServicesManager } from './adapters/core-services.js';
import { registerHealthzRoute } from './health.js';
import * as logger from './utils/logging.js';

const DEFAULT_MAX_SESSIONS = 100;
const DEFAULT_SESSION_IDLE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_RATE_LIMIT_MAX = 60;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_RATE_LIMIT_MAX_ENTRIES = 2000;

export interface McpHttpAppOptions {
  port?: number;
  env?: NodeJS.ProcessEnv;
  healthProvider: Pick<CoreServicesManager, 'getHealthStatus'>;
  createSessionServer: () => Promise<Server>;
}

export interface McpHttpAppInstance {
  app: Express;
  getActiveSessionCount: () => number;
  pruneIdleSessions: (now?: number) => number;
  cleanup: () => Promise<void>;
}

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  lastActiveAt: number;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sha256Digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function verifyBearerToken(authHeader: string | undefined, expectedToken: string): boolean {
  if (!authHeader || !expectedToken) return false;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const provided = match[1].trim();
  if (!provided) return false;
  return timingSafeEqual(sha256Digest(provided), sha256Digest(expectedToken));
}

function normalizeIp(raw: string | undefined): string {
  if (!raw) return '';
  const candidate = raw.trim();
  if (!candidate) return '';
  if (/^::ffff:/i.test(candidate)) {
    const mapped = candidate.slice(7);
    if (net.isIPv4(mapped)) return mapped;
  }
  return net.isIP(candidate) !== 0 ? candidate : '';
}

export function getMcpClientIp(req: Request): string {
  const realIpHeader = req.headers['x-real-ip'];
  const rawRealIp = Array.isArray(realIpHeader) ? realIpHeader[0] : realIpHeader;
  const realIp = normalizeIp(rawRealIp);
  if (realIp) return realIp;

  const remote = req.socket?.remoteAddress;
  return normalizeIp(remote) || remote || 'unknown';
}

export function resolveAllowedOrigins(env: NodeJS.ProcessEnv, port?: number): string[] {
  const raw = env.MCP_ALLOWED_ORIGINS?.trim();
  if (raw) {
    const parsed = raw
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0 && origin !== '*');
    if (parsed.length > 0) {
      return Array.from(new Set(parsed));
    }
  }

  const defaults = ['http://localhost', 'http://127.0.0.1', 'http://[::1]'];
  if (typeof port === 'number' && port > 0) {
    defaults.push(
      `http://localhost:${port}`,
      `http://127.0.0.1:${port}`,
      `http://[::1]:${port}`
    );
  }
  return defaults;
}

function createBoundedIpRateLimiter(max: number, windowMs: number, maxEntries: number) {
  const buckets = new Map<string, RateLimitBucket>();

  function pruneExpired(now: number): void {
    for (const [key, entry] of buckets.entries()) {
      if (entry.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }

  function ensureCapacity(now: number): void {
    if (buckets.size < maxEntries) return;
    pruneExpired(now);
    while (buckets.size >= maxEntries) {
      const oldest = buckets.keys().next().value;
      if (oldest === undefined) break;
      buckets.delete(oldest);
    }
  }

  return {
    consume(key: string): { allowed: boolean; retryAfterSec: number } {
      const now = Date.now();
      let entry = buckets.get(key);
      if (entry && entry.resetAt <= now) {
        buckets.delete(key);
        entry = undefined;
      }
      if (!entry) {
        ensureCapacity(now);
        entry = { count: 0, resetAt: now + windowMs };
        buckets.set(key, entry);
      }
      entry.count += 1;
      return {
        allowed: entry.count <= max,
        retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
      };
    }
  };
}

function sendJsonRpcError(res: Response, statusCode: number, message: string, code = -32000): void {
  res.status(statusCode).json({
    jsonrpc: '2.0',
    error: { code, message },
    id: null
  });
}

export function createMcpHttpApp(options: McpHttpAppOptions): McpHttpAppInstance {
  const env = options.env ?? process.env;
  const apiToken = (env.MCP_API_TOKEN ?? '').trim();
  const allowUnauthenticated = env.MCP_ALLOW_UNAUTHENTICATED === '1';
  const maxSessions = parsePositiveInt(env.MCP_MAX_SESSIONS, DEFAULT_MAX_SESSIONS);
  const sessionIdleTtlMs = parsePositiveInt(env.MCP_SESSION_IDLE_TTL_MS, DEFAULT_SESSION_IDLE_TTL_MS);
  const rateLimitMax = parsePositiveInt(env.MCP_RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX);
  const rateLimitWindowMs = parsePositiveInt(env.MCP_RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_WINDOW_MS);
  const rateLimitMaxEntries = parsePositiveInt(env.MCP_RATE_LIMIT_MAX_ENTRIES, DEFAULT_RATE_LIMIT_MAX_ENTRIES);
  const allowedOrigins = resolveAllowedOrigins(env, options.port);
  const allowedOriginSet = new Set(allowedOrigins);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err && typeof err === 'object' && 'status' in err) {
      const status = Number((err as { status?: number }).status) || 400;
      if (status === 413) {
        sendJsonRpcError(res, 413, 'Payload too large');
        return;
      }
      sendJsonRpcError(res, 400, 'Invalid JSON request body', -32700);
      return;
    }
    next(err);
  });

  registerHealthzRoute(app, options.healthProvider);

  const ipRateLimiter = createBoundedIpRateLimiter(
    rateLimitMax,
    rateLimitWindowMs,
    rateLimitMaxEntries
  );

  const sessions = new Map<string, SessionEntry>();
  let pendingSessions = 0;

  function pruneIdleSessions(now = Date.now()): number {
    let pruned = 0;
    for (const [sessionId, entry] of sessions.entries()) {
      if (now - entry.lastActiveAt > sessionIdleTtlMs) {
        sessions.delete(sessionId);
        pruned += 1;
        entry.transport.close().catch(() => {});
      }
    }
    return pruned;
  }

  function getActiveSession(sessionId: string | undefined): StreamableHTTPServerTransport | null {
    if (!sessionId) return null;
    const entry = sessions.get(sessionId);
    if (!entry) return null;
    const now = Date.now();
    if (now - entry.lastActiveAt > sessionIdleTtlMs) {
      sessions.delete(sessionId);
      entry.transport.close().catch(() => {});
      return null;
    }
    entry.lastActiveAt = now;
    return entry.transport;
  }

  const cleanupIntervalMs = Math.min(60_000, Math.max(1000, Math.floor(sessionIdleTtlMs / 2)));
  const cleanupTimer = setInterval(() => {
    pruneIdleSessions();
  }, cleanupIntervalMs);
  cleanupTimer.unref();

  app.use('/mcp', (req: Request, res: Response, next: NextFunction) => {
    const clientIp = getMcpClientIp(req);
    const limitResult = ipRateLimiter.consume(clientIp);
    if (!limitResult.allowed) {
      res.setHeader('Retry-After', String(limitResult.retryAfterSec));
      sendJsonRpcError(res, 429, 'Too Many Requests');
      return;
    }

    const origin = req.headers.origin;
    if (typeof origin === 'string' && origin.length > 0 && !allowedOriginSet.has(origin)) {
      sendJsonRpcError(res, 403, 'Forbidden origin');
      return;
    }

    if (!apiToken) {
      if (!allowUnauthenticated) {
        sendJsonRpcError(res, 503, 'Authentication is not configured');
        return;
      }
      next();
      return;
    }

    if (!verifyBearerToken(req.headers.authorization, apiToken)) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      sendJsonRpcError(res, 401, 'Unauthorized');
      return;
    }

    next();
  });

  app.post('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    try {
      let httpTransport: StreamableHTTPServerTransport;

      if (sessionId) {
        const existing = getActiveSession(sessionId);
        if (!existing) {
          sendJsonRpcError(res, 400, 'Bad Request: No valid session ID provided');
          return;
        }
        httpTransport = existing;
      } else if (isInitializeRequest(req.body)) {
        pruneIdleSessions();
        if (sessions.size + pendingSessions >= maxSessions) {
          sendJsonRpcError(res, 503, 'Service Unavailable: Session capacity exceeded');
          return;
        }

        pendingSessions += 1;
        try {
          httpTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (initializedSessionId) => {
              sessions.set(initializedSessionId, {
                transport: httpTransport,
                lastActiveAt: Date.now()
              });
            },
            allowedOrigins,
            enableDnsRebindingProtection: true
          });

          httpTransport.onclose = () => {
            if (httpTransport.sessionId) {
              sessions.delete(httpTransport.sessionId);
            }
          };

          const server = await options.createSessionServer();
          await server.connect(httpTransport);
          await httpTransport.handleRequest(req, res, req.body);
          return;
        } finally {
          pendingSessions = Math.max(0, pendingSessions - 1);
        }
      } else {
        sendJsonRpcError(res, 400, 'Bad Request: No valid session ID provided');
        return;
      }

      await httpTransport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error('HTTP POST /mcp failed:', error as Error);
      if (!res.headersSent) {
        sendJsonRpcError(res, 500, 'Internal server error');
      }
    }
  });

  app.get('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const httpTransport = getActiveSession(sessionId);
    if (!httpTransport) {
      sendJsonRpcError(res, 400, 'Invalid or missing session ID');
      return;
    }

    try {
      await httpTransport.handleRequest(req, res);
    } catch (error) {
      logger.error('HTTP GET /mcp failed:', error as Error);
      if (!res.headersSent) {
        sendJsonRpcError(res, 500, 'Internal server error');
      }
    }
  });

  app.delete('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const httpTransport = getActiveSession(sessionId);
    if (!httpTransport) {
      sendJsonRpcError(res, 400, 'Invalid or missing session ID');
      return;
    }

    try {
      await httpTransport.handleRequest(req, res);
    } catch (error) {
      logger.error('HTTP DELETE /mcp failed:', error as Error);
      if (!res.headersSent) {
        sendJsonRpcError(res, 500, 'Internal server error');
      }
    }
  });

  return {
    app,
    getActiveSessionCount: () => sessions.size,
    pruneIdleSessions,
    async cleanup() {
      clearInterval(cleanupTimer);
      const active = Array.from(sessions.values());
      sessions.clear();
      await Promise.allSettled(active.map((entry) => entry.transport.close()));
    }
  };
}
