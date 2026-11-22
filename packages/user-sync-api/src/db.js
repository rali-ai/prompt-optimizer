import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './crypto.js';

export const USERNAME_REGEX = /^[a-z0-9_.-]{3,32}$/;

export function normalizeUsername(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

export function serializeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
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
  `);

  const stmtFindByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
  const stmtFindById = db.prepare('SELECT * FROM users WHERE id = ?');
  const stmtInsertUser = db.prepare(`
    INSERT INTO users (id, username, password_hash, role, tier, tier_expires_at, disabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'free', NULL, 0, ?, ?)
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

  return {
    raw: db,

    close() {
      db.close();
    },

    findUserByUsername(username) {
      return stmtFindByUsername.get(username) || null;
    },

    findUserById(id) {
      return stmtFindById.get(id) || null;
    },

    createUser({ username, passwordHash, role = 'user' }) {
      const now = Date.now();
      const id = crypto.randomUUID();
      stmtInsertUser.run(id, username, passwordHash, role, now, now);
      return stmtFindById.get(id);
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
  };
}
