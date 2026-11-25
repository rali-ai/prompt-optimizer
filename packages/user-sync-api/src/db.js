import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './crypto.js';
import { serializeAnnouncement } from './announcements.js';
import {
  DEFAULT_MONTHLY_CREDITS,
  MAX_MONTHLY_CREDITS,
  MONTHLY_CREDIT_SETTING_KEYS,
  TIER_KEYS,
  getChinaMonthKey,
  getEffectiveTier,
  serializeCreditLedgerRow,
} from './membership.js';
import {
  DOMESTIC_MODEL_PRESETS_DEFAULTS,
  DOMESTIC_PRESET_MAP,
  mergeDomesticPreset,
  serializeAdminPlatformModel,
} from './platform-models.js';
import { PayloadError } from './sanitize.js';

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

export function serializeUser(row, now = Date.now()) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email ?? null,
    role: row.role,
    tier: row.tier,
    effectiveTier: getEffectiveTier(row, now),
    tierExpiresAt: row.tier_expires_at ?? null,
    creditBalance: Number(row.credit_balance || 0),
    lastCreditGrantMonth: row.last_credit_grant_month ?? null,
    lastCreditGrantAmount: Number(row.last_credit_grant_amount || 0),
    disabled: Boolean(row.disabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function migrateUsersTableIfNeeded(db) {
  const tableRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get();
  const tableSql = String(tableRow?.sql || '');

  if (!tableSql.includes("'standard'") || !tableSql.includes("'internal'")) {
    const existingCols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
    const emailExpr = existingCols.has('email') ? 'email' : 'NULL';
    const creditBalanceExpr = existingCols.has('credit_balance')
      ? 'COALESCE(credit_balance, 0)'
      : '0';
    const lastGrantMonthExpr = existingCols.has('last_credit_grant_month')
      ? 'last_credit_grant_month'
      : 'NULL';
    const lastGrantAmountExpr = existingCols.has('last_credit_grant_amount')
      ? 'COALESCE(last_credit_grant_amount, 0)'
      : '0';

    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec(`
        DROP TABLE IF EXISTS users_new;
        CREATE TABLE users_new (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          email TEXT,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
          tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'standard', 'pro', 'internal')),
          tier_expires_at INTEGER,
          disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
          credit_balance INTEGER NOT NULL DEFAULT 0,
          last_credit_grant_month TEXT,
          last_credit_grant_amount INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        INSERT INTO users_new (
          id, username, email, password_hash, role, tier, tier_expires_at, disabled,
          credit_balance, last_credit_grant_month, last_credit_grant_amount,
          created_at, updated_at
        )
        SELECT
          id,
          username,
          ${emailExpr},
          password_hash,
          role,
          CASE WHEN tier IN ('free', 'standard', 'pro', 'internal') THEN tier ELSE 'free' END,
          tier_expires_at,
          disabled,
          ${creditBalanceExpr},
          ${lastGrantMonthExpr},
          ${lastGrantAmountExpr},
          created_at,
          updated_at
        FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
          ON users(email)
          WHERE email IS NOT NULL AND email != '';
      `);
      db.exec('COMMIT;');
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        // ignore rollback error
      }
      throw err;
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }
  }

  const userColumns = db.prepare('PRAGMA table_info(users)').all();
  const colNames = new Set(userColumns.map((col) => col.name));
  if (!colNames.has('email')) {
    db.exec('ALTER TABLE users ADD COLUMN email TEXT');
  }
  if (!colNames.has('credit_balance')) {
    db.exec('ALTER TABLE users ADD COLUMN credit_balance INTEGER NOT NULL DEFAULT 0');
  }
  if (!colNames.has('last_credit_grant_month')) {
    db.exec('ALTER TABLE users ADD COLUMN last_credit_grant_month TEXT');
  }
  if (!colNames.has('last_credit_grant_amount')) {
    db.exec('ALTER TABLE users ADD COLUMN last_credit_grant_amount INTEGER NOT NULL DEFAULT 0');
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
    ON users(email)
    WHERE email IS NOT NULL AND email != ''
  `);
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
      tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'standard', 'pro', 'internal')),
      tier_expires_at INTEGER,
      disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
      credit_balance INTEGER NOT NULL DEFAULT 0,
      last_credit_grant_month TEXT,
      last_credit_grant_amount INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'notice' CHECK (type IN ('notice', 'activity', 'maintenance')),
      link_url TEXT,
      link_text TEXT,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
      expires_at INTEGER,
      emailed_at INTEGER,
      emailed_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_announcements_active_sort
      ON announcements(is_active, is_pinned DESC, updated_at DESC);
  `);

  migrateUsersTableIfNeeded(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS credit_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      delta INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      reason TEXT NOT NULL,
      model_id TEXT,
      note TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created
      ON credit_ledger(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS platform_models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider_label TEXT NOT NULL DEFAULT '平台模型',
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      upstream_model TEXT NOT NULL,
      credit_cost INTEGER NOT NULL DEFAULT 1,
      min_tier TEXT NOT NULL DEFAULT 'standard' CHECK (min_tier IN ('free', 'standard', 'pro', 'internal')),
      default_params_json TEXT NOT NULL DEFAULT '{}',
      apply_url TEXT,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_platform_models_sort
      ON platform_models(enabled DESC, sort_order ASC, created_at DESC);

    CREATE TABLE IF NOT EXISTS model_preset_overrides (
      provider_id TEXT PRIMARY KEY,
      apply_url TEXT,
      apply_label TEXT,
      default_model_id TEXT,
      default_params_json TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      updated_at INTEGER NOT NULL
    );
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
      u.credit_balance,
      u.last_credit_grant_month,
      u.last_credit_grant_amount,
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
  const stmtUpdateUserCreditGrant = db.prepare(`
    UPDATE users
    SET credit_balance = ?, last_credit_grant_month = ?, last_credit_grant_amount = ?, updated_at = ?
    WHERE id = ?
  `);
  const stmtUpdateUserCreditBalance = db.prepare(`
    UPDATE users
    SET credit_balance = ?, updated_at = ?
    WHERE id = ?
  `);
  const stmtInsertCreditLedger = db.prepare(`
    INSERT INTO credit_ledger (id, user_id, delta, balance_after, reason, model_id, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const stmtListUserCreditLedger = db.prepare(`
    SELECT * FROM credit_ledger
    WHERE user_id = ?
    ORDER BY created_at DESC, rowid DESC
    LIMIT ?
  `);
  const stmtListActiveAnnouncements = db.prepare(`
    SELECT * FROM announcements
    WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY is_pinned DESC, updated_at DESC, rowid DESC
    LIMIT ?
  `);
  const stmtListAllAnnouncements = db.prepare(`
    SELECT * FROM announcements
    ORDER BY is_pinned DESC, updated_at DESC, rowid DESC
  `);
  const stmtFindAnnouncementById = db.prepare('SELECT * FROM announcements WHERE id = ?');
  const stmtInsertAnnouncement = db.prepare(`
    INSERT INTO announcements (
      id, title, content, type, link_url, link_text,
      is_active, is_pinned, expires_at, emailed_at, emailed_count,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)
  `);
  const stmtUpdateAnnouncement = db.prepare(`
    UPDATE announcements
    SET title = ?, content = ?, type = ?, link_url = ?, link_text = ?,
        is_active = ?, is_pinned = ?, expires_at = ?, updated_at = ?
    WHERE id = ?
  `);
  const stmtDeleteAnnouncement = db.prepare('DELETE FROM announcements WHERE id = ?');
  const stmtRecordAnnouncementEmailed = db.prepare(`
    UPDATE announcements
    SET emailed_at = ?, emailed_count = ?
    WHERE id = ?
  `);
  const stmtListEmailableActiveUsers = db.prepare(`
    SELECT id, username, email
    FROM users
    WHERE disabled = 0 AND email IS NOT NULL AND email != ''
    ORDER BY created_at ASC
  `);
  const stmtListAllPlatformModels = db.prepare(`
    SELECT * FROM platform_models
    ORDER BY sort_order ASC, created_at DESC
  `);
  const stmtListEnabledPlatformModels = db.prepare(`
    SELECT * FROM platform_models
    WHERE enabled = 1
    ORDER BY sort_order ASC, created_at DESC
  `);
  const stmtFindPlatformModelById = db.prepare('SELECT * FROM platform_models WHERE id = ?');
  const stmtInsertPlatformModel = db.prepare(`
    INSERT INTO platform_models (
      id, name, provider_label, base_url, api_key, upstream_model,
      credit_cost, min_tier, default_params_json, apply_url, description,
      sort_order, enabled, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const stmtUpdatePlatformModel = db.prepare(`
    UPDATE platform_models
    SET name = ?, provider_label = ?, base_url = ?, api_key = ?, upstream_model = ?,
        credit_cost = ?, min_tier = ?, default_params_json = ?, apply_url = ?,
        description = ?, sort_order = ?, enabled = ?, updated_at = ?
    WHERE id = ?
  `);
  const stmtDeletePlatformModel = db.prepare('DELETE FROM platform_models WHERE id = ?');
  const stmtListModelPresetOverrides = db.prepare('SELECT * FROM model_preset_overrides');
  const stmtFindModelPresetOverride = db.prepare(
    'SELECT * FROM model_preset_overrides WHERE provider_id = ?',
  );
  const stmtUpsertModelPresetOverride = db.prepare(`
    INSERT INTO model_preset_overrides (
      provider_id, apply_url, apply_label, default_model_id,
      default_params_json, enabled, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider_id) DO UPDATE SET
      apply_url = excluded.apply_url,
      apply_label = excluded.apply_label,
      default_model_id = excluded.default_model_id,
      default_params_json = excluded.default_params_json,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `);

  function readMonthlyCredits() {
    const result = {};
    for (const tier of TIER_KEYS) {
      const settingKey = MONTHLY_CREDIT_SETTING_KEYS[tier];
      const row = stmtGetSetting.get(settingKey);
      if (row) {
        const parsed = Number(row.value);
        result[tier] =
          Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_MONTHLY_CREDITS
            ? parsed
            : DEFAULT_MONTHLY_CREDITS[tier];
      } else {
        result[tier] = DEFAULT_MONTHLY_CREDITS[tier];
      }
    }
    return result;
  }

  function ensureMonthlyCreditGrantInTx(userId, now) {
    const userRow = stmtFindById.get(userId);
    if (!userRow) return null;

    const monthlyCredits = readMonthlyCredits();
    const effectiveTier = getEffectiveTier(userRow, now);
    const allowance = Number(monthlyCredits[effectiveTier] || 0);
    const currentMonth = getChinaMonthKey(now);
    const currentBalance = Number(userRow.credit_balance || 0);
    const lastMonth = userRow.last_credit_grant_month ?? null;
    const lastAmount = Number(userRow.last_credit_grant_amount || 0);

    let grantedDelta = 0;
    if (lastMonth !== currentMonth) {
      grantedDelta = allowance > 0 ? allowance : 0;
      const nextBalance = currentBalance + grantedDelta;
      stmtUpdateUserCreditGrant.run(nextBalance, currentMonth, allowance, now, userId);
      if (grantedDelta > 0) {
        stmtInsertCreditLedger.run(
          crypto.randomUUID(),
          userId,
          grantedDelta,
          nextBalance,
          'monthly_grant',
          null,
          `${currentMonth} 月度会员积分赠送`,
          now,
        );
      }
    } else if (allowance > lastAmount) {
      grantedDelta = allowance - lastAmount;
      const nextBalance = currentBalance + grantedDelta;
      stmtUpdateUserCreditGrant.run(nextBalance, currentMonth, allowance, now, userId);
      stmtInsertCreditLedger.run(
        crypto.randomUUID(),
        userId,
        grantedDelta,
        nextBalance,
        'tier_upgrade_grant',
        null,
        `${currentMonth} 会员升级积分补差`,
        now,
      );
    }

    const freshUser = stmtFindById.get(userId);
    return {
      user: freshUser,
      grantedDelta,
      currentMonth,
      allowance,
      monthlyCredits,
    };
  }

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
      const now = Date.now();
      return stmtListUsersWithSync.all().map((row) => ({
        ...serializeUser(row, now),
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

    getMonthlyCredits() {
      return readMonthlyCredits();
    },

    setMonthlyCredits(patch) {
      const now = Date.now();
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const tier of TIER_KEYS) {
          if (Object.prototype.hasOwnProperty.call(patch, tier)) {
            stmtUpsertSetting.run(MONTHLY_CREDIT_SETTING_KEYS[tier], String(patch[tier]), now);
          }
        }
        db.exec('COMMIT');
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // ignore
        }
        throw err;
      }
      return readMonthlyCredits();
    },

    ensureMonthlyCreditGrant(userId, now = Date.now()) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = ensureMonthlyCreditGrantInTx(userId, now);
        db.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // ignore
        }
        throw err;
      }
    },

    ensureMonthlyCreditGrantsForAllActive(now = Date.now()) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const activeRows = db.prepare('SELECT id FROM users WHERE disabled = 0').all();
        for (const row of activeRows) {
          ensureMonthlyCreditGrantInTx(row.id, now);
        }
        db.exec('COMMIT');
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // ignore
        }
        throw err;
      }
    },

    debitUserCreditsAtomic(userId, cost, { modelId = null, note = null, now = Date.now() } = {}) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const granted = ensureMonthlyCreditGrantInTx(userId, now);
        if (!granted || !granted.user) {
          db.exec('ROLLBACK');
          return { ok: false, reason: 'not_found' };
        }
        const userRow = granted.user;
        if (userRow.disabled) {
          db.exec('ROLLBACK');
          return { ok: false, reason: 'disabled' };
        }
        const balance = Number(userRow.credit_balance || 0);
        const safeCost = Number.isInteger(cost) && cost > 0 ? cost : 0;
        if (safeCost > 0) {
          if (balance < safeCost) {
            db.exec('COMMIT');
            return { ok: false, reason: 'insufficient_credits', balance, required: safeCost };
          }
          const nextBalance = balance - safeCost;
          stmtUpdateUserCreditBalance.run(nextBalance, now, userId);
          stmtInsertCreditLedger.run(
            crypto.randomUUID(),
            userId,
            -safeCost,
            nextBalance,
            'usage_debit',
            modelId,
            note || '平台模型调用扣费',
            now,
          );
          db.exec('COMMIT');
          return { ok: true, balanceAfter: nextBalance, cost: safeCost };
        }
        db.exec('COMMIT');
        return { ok: true, balanceAfter: balance, cost: 0 };
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // ignore
        }
        throw err;
      }
    },

    refundUserCredits(userId, cost, { modelId = null, note = null, now = Date.now() } = {}) {
      const safeCost = Number.isInteger(cost) && cost > 0 ? cost : 0;
      if (safeCost <= 0) {
        const userRow = stmtFindById.get(userId);
        return { balanceAfter: Number(userRow?.credit_balance || 0) };
      }
      db.exec('BEGIN IMMEDIATE');
      try {
        const userRow = stmtFindById.get(userId);
        if (!userRow) {
          db.exec('ROLLBACK');
          return null;
        }
        const nextBalance = Number(userRow.credit_balance || 0) + safeCost;
        stmtUpdateUserCreditBalance.run(nextBalance, now, userId);
        stmtInsertCreditLedger.run(
          crypto.randomUUID(),
          userId,
          safeCost,
          nextBalance,
          'usage_refund',
          modelId,
          note || '模型调用失败自动退回',
          now,
        );
        db.exec('COMMIT');
        return { balanceAfter: nextBalance };
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // ignore
        }
        throw err;
      }
    },

    adjustUserCredits(userId, delta, note = null, now = Date.now()) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const userRow = stmtFindById.get(userId);
        if (!userRow) {
          db.exec('ROLLBACK');
          return { found: false };
        }
        const currentBalance = Number(userRow.credit_balance || 0);
        const nextBalance = currentBalance + delta;
        if (nextBalance < 0) {
          db.exec('ROLLBACK');
          return { found: true, insufficient: true, balance: currentBalance };
        }
        stmtUpdateUserCreditBalance.run(nextBalance, now, userId);
        stmtInsertCreditLedger.run(
          crypto.randomUUID(),
          userId,
          delta,
          nextBalance,
          'admin_adjust',
          null,
          note || (delta > 0 ? '管理员手动增加积分' : '管理员手动扣减积分'),
          now,
        );
        const freshUser = stmtFindById.get(userId);
        db.exec('COMMIT');
        return {
          found: true,
          insufficient: false,
          user: freshUser,
          creditBalance: nextBalance,
        };
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // ignore
        }
        throw err;
      }
    },

    listUserCreditLedger(userId, limit = 20) {
      const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20;
      return stmtListUserCreditLedger.all(userId, safeLimit).map(serializeCreditLedgerRow);
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

    listActiveAnnouncements(now = Date.now(), limit = 10) {
      const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 10;
      return stmtListActiveAnnouncements.all(now, safeLimit).map(serializeAnnouncement);
    },

    listAllAnnouncements() {
      return stmtListAllAnnouncements.all().map(serializeAnnouncement);
    },

    findAnnouncementById(id) {
      return serializeAnnouncement(stmtFindAnnouncementById.get(id) || null);
    },

    createAnnouncement(input) {
      const now = Date.now();
      const id = crypto.randomUUID();
      stmtInsertAnnouncement.run(
        id,
        input.title,
        input.content,
        input.type ?? 'notice',
        input.linkUrl ?? null,
        input.linkText ?? null,
        input.isActive === false ? 0 : 1,
        input.isPinned ? 1 : 0,
        input.expiresAt ?? null,
        now,
        now,
      );
      return serializeAnnouncement(stmtFindAnnouncementById.get(id));
    },

    updateAnnouncement(id, patch) {
      const existing = stmtFindAnnouncementById.get(id);
      if (!existing) return null;

      const nextTitle = patch.title !== undefined ? patch.title : existing.title;
      const nextContent = patch.content !== undefined ? patch.content : existing.content;
      const nextType = patch.type !== undefined ? patch.type : existing.type;
      const nextLinkUrl = patch.linkUrl !== undefined ? patch.linkUrl : existing.link_url;
      const nextLinkText = patch.linkText !== undefined ? patch.linkText : existing.link_text;
      const nextIsActive =
        patch.isActive !== undefined ? (patch.isActive ? 1 : 0) : existing.is_active;
      const nextIsPinned =
        patch.isPinned !== undefined ? (patch.isPinned ? 1 : 0) : existing.is_pinned;
      const nextExpiresAt =
        patch.expiresAt !== undefined ? patch.expiresAt : existing.expires_at;
      const now = Date.now();

      stmtUpdateAnnouncement.run(
        nextTitle,
        nextContent,
        nextType,
        nextLinkUrl,
        nextLinkText,
        nextIsActive,
        nextIsPinned,
        nextExpiresAt,
        now,
        id,
      );
      return serializeAnnouncement(stmtFindAnnouncementById.get(id));
    },

    deleteAnnouncement(id) {
      const result = stmtDeleteAnnouncement.run(id);
      return Number(result?.changes || 0) > 0;
    },

    recordAnnouncementEmailed(id, count) {
      const existing = stmtFindAnnouncementById.get(id);
      if (!existing) return null;
      const safeCount = Number.isInteger(count) && count >= 0 ? count : 0;
      stmtRecordAnnouncementEmailed.run(Date.now(), safeCount, id);
      return serializeAnnouncement(stmtFindAnnouncementById.get(id));
    },

    listEmailableActiveUsers() {
      return stmtListEmailableActiveUsers.all().map((row) => ({
        id: row.id,
        username: row.username,
        email: row.email,
      }));
    },

    listPlatformModelsRaw({ onlyEnabled = false } = {}) {
      return onlyEnabled ? stmtListEnabledPlatformModels.all() : stmtListAllPlatformModels.all();
    },

    findPlatformModelRawById(id) {
      if (!id) return null;
      return stmtFindPlatformModelById.get(id) || null;
    },

    createPlatformModel(input) {
      const now = Date.now();
      let finalId = input.id;
      if (stmtFindPlatformModelById.get(finalId)) {
        if (input.explicitId) {
          throw new PayloadError(`平台模型 ID「${finalId}」已存在`, 409);
        }
        const suffix = crypto.randomBytes(3).toString('hex');
        finalId = `${finalId.slice(0, 56)}-${suffix}`;
      }

      stmtInsertPlatformModel.run(
        finalId,
        input.name,
        input.providerLabel,
        input.baseUrl,
        input.apiKey,
        input.upstreamModel,
        input.creditCost,
        input.minTier,
        JSON.stringify(input.defaultParams || {}),
        input.applyUrl ?? null,
        input.description ?? null,
        input.sortOrder ?? 0,
        input.enabled === false ? 0 : 1,
        now,
        now,
      );
      return serializeAdminPlatformModel(stmtFindPlatformModelById.get(finalId));
    },

    updatePlatformModel(id, patch) {
      const existing = stmtFindPlatformModelById.get(id);
      if (!existing) return null;

      const nextName = patch.name !== undefined ? patch.name : existing.name;
      const nextProviderLabel =
        patch.providerLabel !== undefined ? patch.providerLabel : existing.provider_label;
      const nextBaseUrl = patch.baseUrl !== undefined ? patch.baseUrl : existing.base_url;
      const nextApiKey = patch.apiKey !== undefined ? patch.apiKey : existing.api_key;
      const nextUpstreamModel =
        patch.upstreamModel !== undefined ? patch.upstreamModel : existing.upstream_model;
      const nextCreditCost =
        patch.creditCost !== undefined ? patch.creditCost : existing.credit_cost;
      const nextMinTier = patch.minTier !== undefined ? patch.minTier : existing.min_tier;
      const nextDefaultParamsJson =
        patch.defaultParams !== undefined
          ? JSON.stringify(patch.defaultParams)
          : existing.default_params_json;
      const nextApplyUrl = patch.applyUrl !== undefined ? patch.applyUrl : existing.apply_url;
      const nextDescription =
        patch.description !== undefined ? patch.description : existing.description;
      const nextSortOrder = patch.sortOrder !== undefined ? patch.sortOrder : existing.sort_order;
      const nextEnabled =
        patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : existing.enabled;
      const now = Date.now();

      stmtUpdatePlatformModel.run(
        nextName,
        nextProviderLabel,
        nextBaseUrl,
        nextApiKey,
        nextUpstreamModel,
        nextCreditCost,
        nextMinTier,
        nextDefaultParamsJson,
        nextApplyUrl,
        nextDescription,
        nextSortOrder,
        nextEnabled,
        now,
        id,
      );
      return serializeAdminPlatformModel(stmtFindPlatformModelById.get(id));
    },

    deletePlatformModel(id) {
      const result = stmtDeletePlatformModel.run(id);
      return Number(result?.changes || 0) > 0;
    },

    listModelPresets() {
      const rows = stmtListModelPresetOverrides.all();
      const byId = new Map(rows.map((r) => [r.provider_id, r]));
      return DOMESTIC_MODEL_PRESETS_DEFAULTS.map((def) =>
        mergeDomesticPreset(def, byId.get(def.providerId) || null),
      );
    },

    getModelPreset(providerId) {
      const def = DOMESTIC_PRESET_MAP[providerId];
      if (!def) return null;
      const row = stmtFindModelPresetOverride.get(providerId) || null;
      return mergeDomesticPreset(def, row);
    },

    upsertModelPreset(providerId, patch) {
      const def = DOMESTIC_PRESET_MAP[providerId];
      if (!def) return null;

      const existing = stmtFindModelPresetOverride.get(providerId) || null;
      const nextApplyUrl =
        patch.applyUrl !== undefined ? patch.applyUrl : (existing?.apply_url ?? null);
      const nextApplyLabel =
        patch.applyLabel !== undefined ? patch.applyLabel : (existing?.apply_label ?? null);
      const nextDefaultModelId =
        patch.defaultModelId !== undefined
          ? patch.defaultModelId
          : (existing?.default_model_id ?? null);
      const nextDefaultParamsJson =
        patch.defaultParams !== undefined
          ? JSON.stringify(patch.defaultParams)
          : (existing?.default_params_json ?? '{}');
      const nextEnabled =
        patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : (existing ? existing.enabled : 1);
      const now = Date.now();

      stmtUpsertModelPresetOverride.run(
        providerId,
        nextApplyUrl,
        nextApplyLabel,
        nextDefaultModelId,
        nextDefaultParamsJson,
        nextEnabled,
        now,
      );
      const updated = stmtFindModelPresetOverride.get(providerId);
      return mergeDomesticPreset(def, updated);
    },
  };
}
