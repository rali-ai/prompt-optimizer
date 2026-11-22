import http from 'node:http';
import {
  SESSION_COOKIE_NAME,
  buildClearSessionCookie,
  buildSessionCookie,
  createSessionToken,
  hashPassword,
  parseCookies,
  verifyPassword,
  verifySessionToken,
} from './crypto.js';
import { USERNAME_REGEX, normalizeUsername, openDatabase, serializeUser } from './db.js';
import { createRateLimiter } from './rate-limit.js';
import { MAX_SYNC_BYTES, PayloadError, sanitizeSyncPayload } from './sanitize.js';
import { renderAdminHtml } from './admin-page.js';

const MAX_AUTH_BODY_BYTES = 16 * 1024;
const MAX_SYNC_BODY_BYTES = MAX_SYNC_BYTES + 256 * 1024;

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body, 'utf8'),
    ...extraHeaders,
  });
  res.end(body);
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(html, 'utf8'),
  });
  res.end(html);
}

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function isSecureRequest(req, cookieSecure) {
  if (cookieSecure) return true;
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string' && proto.split(',')[0].trim().toLowerCase() === 'https') {
    return true;
  }
  return Boolean(req.socket?.encrypted);
}

function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.pause();
        fail(new PayloadError('请求体超过大小限制', 413));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      if (total === 0) {
        resolve({});
        return;
      }
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new PayloadError('请求体必须为 JSON 对象', 400));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new PayloadError('请求体不是合法的 JSON', 400));
      }
    });

    req.on('error', (err) => fail(err));
  });
}

function validateCredentials(body) {
  const username = normalizeUsername(body.username);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!USERNAME_REGEX.test(username)) {
    throw new PayloadError('用户名需为 3 到 32 位小写字母、数字、下划线、点或短横线', 400);
  }
  if (password.length < 8 || password.length > 128) {
    throw new PayloadError('密码长度需为 8 到 128 个字符', 400);
  }
  return { username, password };
}

export function createApp(config) {
  const db = openDatabase(config.dbPath);
  if (config.adminUsername && config.adminPassword) {
    db.bootstrapAdmin({
      username: config.adminUsername,
      password: config.adminPassword,
    });
  }

  const authRateLimiter = createRateLimiter({
    max: config.rateLimitMax,
    windowMs: config.rateLimitWindowMs,
  });

  function authenticate(req) {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token) return null;
    const claims = verifySessionToken(token, config.secret);
    if (!claims) return null;
    const row = db.findUserById(claims.userId);
    if (!row) return null;
    return row;
  }

  function requireActiveUser(req, res) {
    const userRow = authenticate(req);
    if (!userRow) {
      sendJson(res, 401, { error: '请先登录' });
      return null;
    }
    if (userRow.disabled) {
      sendJson(res, 403, { error: '账号已被停用' });
      return null;
    }
    return userRow;
  }

  function requireAdmin(req, res) {
    const userRow = requireActiveUser(req, res);
    if (!userRow) return null;
    if (userRow.role !== 'admin') {
      sendJson(res, 403, { error: '需要管理员权限' });
      return null;
    }
    return userRow;
  }

  function checkRateLimit(req, res) {
    const ip = getClientIp(req);
    const result = authRateLimiter.consume(ip);
    if (!result.allowed) {
      sendJson(
        res,
        429,
        { error: '请求过于频繁，请稍后再试' },
        { 'Retry-After': String(result.retryAfterSec) },
      );
      return false;
    }
    return true;
  }

  function setSessionCookieHeader(req, userRow) {
    const token = createSessionToken(
      { userId: userRow.id, role: userRow.role },
      config.secret,
      config.sessionTtlMs,
    );
    return buildSessionCookie(token, {
      secure: isSecureRequest(req, config.cookieSecure),
      maxAgeSec: config.sessionTtlMs / 1000,
    });
  }

  async function handleRequest(req, res) {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = url.pathname;
    const method = (req.method || 'GET').toUpperCase();

    if (method === 'GET' && pathname === '/user-api/healthz') {
      return sendJson(res, 200, { ok: true });
    }

    if (method === 'GET' && pathname === '/user-api/config') {
      return sendJson(res, 200, {
        membershipEnabled: Boolean(config.membershipEnabled),
        registrationEnabled: true,
      });
    }

    if (method === 'POST' && pathname === '/user-api/register') {
      if (!checkRateLimit(req, res)) return;
      const body = await readJsonBody(req, MAX_AUTH_BODY_BYTES);
      const { username, password } = validateCredentials(body);

      if (db.findUserByUsername(username)) {
        return sendJson(res, 409, { error: '用户名已被注册' });
      }

      let userRow;
      try {
        userRow = db.createUser({
          username,
          passwordHash: hashPassword(password),
          role: 'user',
        });
      } catch (err) {
        if (String(err?.message || '').includes('UNIQUE')) {
          return sendJson(res, 409, { error: '用户名已被注册' });
        }
        throw err;
      }

      const cookie = setSessionCookieHeader(req, userRow);
      return sendJson(res, 201, { user: serializeUser(userRow) }, { 'Set-Cookie': cookie });
    }

    if (method === 'POST' && pathname === '/user-api/login') {
      if (!checkRateLimit(req, res)) return;
      const body = await readJsonBody(req, MAX_AUTH_BODY_BYTES);
      const username = normalizeUsername(body.username);
      const password = typeof body.password === 'string' ? body.password : '';
      if (!username || !password) {
        return sendJson(res, 400, { error: '请输入用户名和密码' });
      }

      const userRow = db.findUserByUsername(username);
      if (!userRow || !verifyPassword(password, userRow.password_hash)) {
        return sendJson(res, 401, { error: '用户名或密码错误' });
      }
      if (userRow.disabled) {
        return sendJson(res, 403, { error: '账号已被停用' });
      }

      const cookie = setSessionCookieHeader(req, userRow);
      return sendJson(res, 200, { user: serializeUser(userRow) }, { 'Set-Cookie': cookie });
    }

    if (method === 'POST' && pathname === '/user-api/logout') {
      const clearCookie = buildClearSessionCookie({
        secure: isSecureRequest(req, config.cookieSecure),
      });
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearCookie });
    }

    if (method === 'GET' && pathname === '/user-api/me') {
      const userRow = requireActiveUser(req, res);
      if (!userRow) return;
      return sendJson(res, 200, { user: serializeUser(userRow) });
    }

    if (method === 'GET' && pathname === '/user-api/sync') {
      const userRow = requireActiveUser(req, res);
      if (!userRow) return;
      const blob = db.getSyncBlob(userRow.id);
      return sendJson(res, 200, blob);
    }

    if (method === 'PUT' && pathname === '/user-api/sync') {
      const userRow = requireActiveUser(req, res);
      if (!userRow) return;
      const body = await readJsonBody(req, MAX_SYNC_BODY_BYTES);
      if (body.expectedVersion !== undefined && body.expectedVersion !== null) {
        if (!Number.isInteger(body.expectedVersion) || body.expectedVersion < 0) {
          throw new PayloadError('expectedVersion 必须为非负整数', 400);
        }
      }
      const { json, bytes } = sanitizeSyncPayload(body.data);
      const result = db.putSyncBlob(userRow.id, {
        json,
        bytes,
        expectedVersion: body.expectedVersion,
      });
      if (result.conflict) {
        return sendJson(res, 409, {
          error: '云端已有更新版本，请先拉取最新数据后再同步',
          currentVersion: result.currentVersion,
        });
      }
      return sendJson(res, 200, {
        version: result.version,
        updatedAt: result.updatedAt,
        bytes: result.bytes,
      });
    }

    if (method === 'GET' && (pathname === '/user-api/admin' || pathname === '/user-api/admin/')) {
      const userRow = authenticate(req);
      const authenticated = Boolean(userRow && !userRow.disabled);
      const isAdmin = Boolean(authenticated && userRow.role === 'admin');
      const html = renderAdminHtml({
        authenticated,
        isAdmin,
        username: userRow?.username || '',
        membershipEnabled: Boolean(config.membershipEnabled),
      });
      return sendHtml(res, 200, html);
    }

    if (method === 'GET' && pathname === '/user-api/admin/users') {
      const adminRow = requireAdmin(req, res);
      if (!adminRow) return;
      return sendJson(res, 200, {
        membershipEnabled: Boolean(config.membershipEnabled),
        users: db.listUsersWithSync(),
      });
    }

    const adminUserMatch = pathname.match(/^\/user-api\/admin\/users\/([^/]+)$/);
    if (method === 'PATCH' && adminUserMatch) {
      const adminRow = requireAdmin(req, res);
      if (!adminRow) return;
      const targetId = decodeURIComponent(adminUserMatch[1]);
      const body = await readJsonBody(req, MAX_AUTH_BODY_BYTES);

      const patch = {};
      if (body.tier !== undefined) {
        if (body.tier !== 'free' && body.tier !== 'pro') {
          throw new PayloadError('tier 仅支持 free 或 pro', 400);
        }
        patch.tier = body.tier;
      }
      if (body.tierExpiresAt !== undefined) {
        if (
          body.tierExpiresAt !== null &&
          (!Number.isInteger(body.tierExpiresAt) || body.tierExpiresAt < 0)
        ) {
          throw new PayloadError('tierExpiresAt 必须为毫秒时间戳整数或 null', 400);
        }
        patch.tierExpiresAt = body.tierExpiresAt;
      }
      if (body.disabled !== undefined) {
        if (typeof body.disabled !== 'boolean') {
          throw new PayloadError('disabled 必须为布尔值', 400);
        }
        patch.disabled = body.disabled;
      }

      const updated = db.updateUserAdmin(targetId, patch);
      if (!updated) {
        return sendJson(res, 404, { error: '用户不存在' });
      }
      return sendJson(res, 200, { user: serializeUser(updated) });
    }

    return sendJson(res, 404, { error: 'Not Found' });
  }

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      if (err instanceof PayloadError) {
        return sendJson(res, err.statusCode, { error: err.message });
      }
      console.error('[user-sync-api] Unhandled error:', err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: '服务器内部错误' });
      }
    });
  });

  return {
    server,
    db,
    authRateLimiter,
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.host, () => {
          server.off('error', reject);
          const addr = server.address();
          resolve({
            host: typeof addr === 'object' && addr ? addr.address : config.host,
            port: typeof addr === 'object' && addr ? addr.port : config.port,
          });
        });
      });
    },
    close() {
      return new Promise((resolve) => {
        server.close(() => {
          db.close();
          resolve();
        });
      });
    },
  };
}
