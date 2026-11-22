import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './crypto.js';

export const USERNAME_REGEX = /^[a-z0-9_.-]{3,32}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeUsername(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

export function normalizeEmail(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

export function serializeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email ?? null,
    role: row.role,
    tier: row.tier,
    tierExpiresAt: row.tier_expires_at ?? null,
    disabled: Boolean(row.disabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function openDatabase(dbPath) {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro')),
      tier_expires_at INTEGER,
      disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_sync_blobs (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      payload_json TEXT NOT NULL,
      version INTEGER NOT NULL,
      bytes INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS redemption_codes (
      code TEXT PRIMARY KEY,
      tier TEXT NOT NULL,
      duration_days INTEGER NOT NULL,
      used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_reset_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reset_codes_email_created
      ON password_reset_codes(email, created_at DESC);
  `);

  const userColumns = db.prepare('PRAGMA table_info(users)').all();
  if (!userColumns.some((col) => col.name === 'email')) {
    db.exec('ALTER TABLE users ADD COLUMN email TEXT');
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
    ON users(email)
    WHERE email IS NOT NULL AND email != ''
  `);

  const stmtFindByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
  const stmtFindByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
  const stmtFindById = db.prepare('SELECT * FROM users WHERE id = ?');
  const stmtGetSetting = db.prepare('SELECT value, updated_at FROM app_settings WHERE key = ?');
  const stmtUpsertSetting = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);
  const stmtDeleteSetting = db.prepare('DELETE FROM app_settings WHERE key = ?');
  const stmtGetLatestResetCode = db.prepare(`
    SELECT * FROM password_reset_codes
    WHERE email = ? AND used_at IS NULL AND expires_at > ?
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const stmtInvalidateUserResetCodes = db.prepare(`
    UPDATE password_reset_codes
    SET used_at = ?
    WHERE user_id = ? AND used_at IS NULL
  `);
  const stmtInsertResetCode = db.prepare(`
    INSERT INTO password_reset_codes (id, user_id, email, code_hash, attempts, expires_at, used_at, created_at)
    VALUES (?, ?, ?, ?, 0, ?, NULL, ?)
  `);
  const stmtIncrementResetAttempts = db.prepare(`
    UPDATE password_reset_codes
    SET attempts = attempts + 1
    WHERE id = ?
  `);
  const stmtInsertUser = db.prepare(`
    INSERT INTO users (id, username, email, password_hash, role, tier, tier_expires_at, disabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'free', NULL, 0, ?, ?)
  `);
  const stmtGetSync = db.prepare(
    'SELECT payload_json, version, bytes, updated_at FROM user_sync_blobs WHERE user_id = ?',
  );
  const stmtUpsertSync = db.prepare(`
    INSERT INTO user_sync_blobs (user_id, payload_json, version, bytes, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      payload_json = excluded.payload_json,
      version = excluded.version,
      bytes = excluded.bytes,
      updated_at = excluded.updated_at
  `);
  const stmtListUsersWithSync = db.prepare(`
    SELECT
      u.id,
      u.username,
      u.email,
      u.role,
      u.tier,
      u.tier_expires_at,
      u.disabled,
      u.created_at,
      u.updated_at,
      b.bytes AS sync_bytes,
      b.version AS sync_version,
      b.updated_at AS sync_updated_at
    FROM users u
    LEFT JOIN user_sync_blobs b ON b.user_id = u.id
    ORDER BY u.created_at DESC
  `);
  const stmtUpdateUserAdmin = db.prepare(`
    UPDATE users
    SET tier = ?, tier_expires_at = ?, disabled = ?, updated_at = ?
    WHERE id = ?
  `);
  const stmtUpdateUserEmail = db.prepare(`
    UPDATE users
    SET email = ?, updated_at = ?
    WHERE id = ?
  `);
  const stmtUpdateUserPassword = db.prepare(`
    UPDATE users
    SET password_hash = ?, updated_at = ?
    WHERE id = ?
  `);

  return {
    raw: db,

    close() {
      db.close();
    },

    findUserByUsername(username) {
      return stmtFindByUsername.get(username) || null;
    },

    findUserByEmail(email) {
      if (!email) return null;
      return stmtFindByEmail.get(email) || null;
    },

    findUserById(id) {
      return stmtFindById.get(id) || null;
    },

    createUser({ username, email = null, passwordHash, role = 'user' }) {
      const now = Date.now();
      const id = crypto.randomUUID();
      stmtInsertUser.run(id, username, email, passwordHash, role, now, now);
      return stmtFindById.get(id);
    },

    updateUserEmail(userId, email) {
      const existing = stmtFindById.get(userId);
      if (!existing) return null;
      stmtUpdateUserEmail.run(email, Date.now(), userId);
      return stmtFindById.get(userId);
    },

    updateUserPassword(userId, passwordHash) {
      const existing = stmtFindById.get(userId);
      if (!existing) return null;
      stmtUpdateUserPassword.run(passwordHash, Date.now(), userId);
      return stmtFindById.get(userId);
    },

    bootstrapAdmin({ username, password }) {
      const normalized = normalizeUsername(username);
      if (!normalized || !password) return null;
      if (!USERNAME_REGEX.test(normalized)) {
        throw new Error(`ADMIN_USERNAME 格式无效: "${username}"`);
      }
      if (password.length < 8) {
        throw new Error('ADMIN_PASSWORD 长度至少需要 8 位');
      }
      const existing = stmtFindByUsername.get(normalized);
      if (existing) return existing;
      return this.createUser({
        username: normalized,
        passwordHash: hashPassword(password),
        role: 'admin',
      });
    },

    getSyncBlob(userId) {
      const row = stmtGetSync.get(userId);
      if (!row) {
        return { version: 0, updatedAt: null, data: null };
      }
      return {
        version: row.version,
        updatedAt: row.updated_at,
        data: JSON.parse(row.payload_json),
      };
    },

    putSyncBlob(userId, { json, bytes, expectedVersion }) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const existing = stmtGetSync.get(userId);
        const currentVersion = existing ? existing.version : 0;
        if (
          expectedVersion !== undefined &&
          expectedVersion !== null &&
          currentVersion !== expectedVersion
        ) {
          db.exec('ROLLBACK');
          return { conflict: true, currentVersion };
        }
        const nextVersion = currentVersion + 1;
        const now = Date.now();
        stmtUpsertSync.run(userId, json, nextVersion, bytes, now);
        db.exec('COMMIT');
        return { conflict: false, version: nextVersion, updatedAt: now, bytes };
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // ignore rollback error
        }
        throw err;
      }
    },

    listUsersWithSync() {
      return stmtListUsersWithSync.all().map((row) => ({
        ...serializeUser(row),
        syncBytes: row.sync_bytes ?? 0,
        syncVersion: row.sync_version ?? 0,
        syncUpdatedAt: row.sync_updated_at ?? null,
      }));
    },

    updateUserAdmin(userId, patch) {
      const existing = stmtFindById.get(userId);
      if (!existing) return null;

      const nextTier = patch.tier !== undefined ? patch.tier : existing.tier;
      const nextTierExpiresAt =
        patch.tierExpiresAt !== undefined ? patch.tierExpiresAt : existing.tier_expires_at;
      const nextDisabled =
        patch.disabled !== undefined ? (patch.disabled ? 1 : 0) : existing.disabled;
      const now = Date.now();

      stmtUpdateUserAdmin.run(nextTier, nextTierExpiresAt, nextDisabled, now, userId);
      return stmtFindById.get(userId);
    },

    getMembershipEnabled(fallback = false) {
      const row = stmtGetSetting.get('membership_enabled');
      if (!row) return Boolean(fallback);
      return row.value === '1';
    },

    setMembershipEnabled(enabled) {
      const normalized = Boolean(enabled);
      stmtUpsertSetting.run('membership_enabled', normalized ? '1' : '0', Date.now());
      return normalized;
    },

    getMailSettings({ resendApiKey = '', mailFrom = '' } = {}) {
      const dbKeyRow = stmtGetSetting.get('resend_api_key');
      const dbFromRow = stmtGetSetting.get('mail_from');
      const apiKey = dbKeyRow ? dbKeyRow.value.trim() : String(resendApiKey || '').trim();
      const from = dbFromRow ? dbFromRow.value.trim() : String(mailFrom || '').trim();
      const source = dbKeyRow ? 'db' : apiKey ? 'env' : 'none';
      return { apiKey, from, source };
    },

    saveMailSettings({ apiKey, from }) {
      const now = Date.now();
      if (apiKey !== undefined) {
        const cleanKey = String(apiKey ?? '').trim();
        if (!cleanKey) {
          stmtDeleteSetting.run('resend_api_key');
        } else {
          stmtUpsertSetting.run('resend_api_key', cleanKey, now);
        }
      }
      if (from !== undefined) {
        const cleanFrom = String(from ?? '').trim();
        if (!cleanFrom) {
          stmtDeleteSetting.run('mail_from');
        } else {
          stmtUpsertSetting.run('mail_from', cleanFrom, now);
        }
      }
    },

    getLatestActiveResetCode(email, now = Date.now()) {
      if (!email) return null;
      return stmtGetLatestResetCode.get(email, now) || null;
    },

    createPasswordResetCode({ userId, email, codeHash, ttlMs }) {
      const now = Date.now();
      const id = crypto.randomUUID();
      db.exec('BEGIN IMMEDIATE');
      try {
        stmtInvalidateUserResetCodes.run(now, userId);
        stmtInsertResetCode.run(id, userId, email, codeHash, now + ttlMs, now);
        db.exec('COMMIT');
        return { id, expiresAt: now + ttlMs, createdAt: now };
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // ignore
        }
        throw err;
      }
    },

    incrementResetCodeAttempts(id) {
      stmtIncrementResetAttempts.run(id);
    },

    markResetCodesUsed(userId) {
      stmtInvalidateUserResetCodes.run(Date.now(), userId);
    },
  };
}
