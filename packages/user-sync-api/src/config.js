import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function parsePositiveInt(value, fallback) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : fallback;
}

export function resolveSecret(envSecret, dbPath) {
  if (typeof envSecret === 'string' && envSecret.trim().length > 0) {
    return envSecret.trim();
  }
  const secretDir = path.dirname(dbPath);
  fs.mkdirSync(secretDir, { recursive: true });
  const secretFile = path.join(secretDir, '.secret');
  if (fs.existsSync(secretFile)) {
    const existing = fs.readFileSync(secretFile, 'utf8').trim();
    if (existing.length >= 32) {
      return existing;
    }
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(secretFile, `${generated}\n`, { encoding: 'utf8', mode: 0o600 });
  return generated;
}

export function loadConfig(env = process.env) {
  const dbPath = (env.USER_SYNC_DB_PATH && env.USER_SYNC_DB_PATH.trim()) || '/data/user-sync/users.db';
  const secret = resolveSecret(env.USER_SYNC_SECRET, dbPath);
  const host = (env.USER_SYNC_HOST && env.USER_SYNC_HOST.trim()) || '127.0.0.1';
  const port = env.USER_SYNC_PORT === '0' ? 0 : parsePositiveInt(env.USER_SYNC_PORT, 3002);

  return {
    host,
    port,
    dbPath,
    secret,
    membershipEnabled: parseBool(env.MEMBERSHIP_ENABLED, false),
    cookieSecure: parseBool(env.COOKIE_SECURE, false),
    adminUsername: (env.ADMIN_USERNAME && env.ADMIN_USERNAME.trim()) || '',
    adminPassword: env.ADMIN_PASSWORD || '',
    rateLimitMax: parsePositiveInt(env.RATE_LIMIT_MAX, 20),
    rateLimitWindowMs: parsePositiveInt(env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    sessionTtlMs: parsePositiveInt(env.SESSION_TTL_MS, 30 * 24 * 60 * 60 * 1000),
  };
}
