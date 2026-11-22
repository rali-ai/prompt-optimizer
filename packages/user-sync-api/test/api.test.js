import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/server.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'user-sync-api-test-'));
}

function extractCookieHeader(res) {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return '';
  return setCookie.split(';')[0];
}

async function startTestApp(envOverrides = {}) {
  const tmpDir = makeTempDir();
  const dbPath = path.join(tmpDir, 'nested', 'users.db');
  const config = loadConfig({
    USER_SYNC_HOST: '127.0.0.1',
    USER_SYNC_PORT: '0',
    USER_SYNC_DB_PATH: dbPath,
    ADMIN_USERNAME: 'root_admin',
    ADMIN_PASSWORD: 'AdminPassword123!',
    RATE_LIMIT_MAX: '50',
    RATE_LIMIT_WINDOW_MS: '60000',
    ...envOverrides,
  });
  const app = createApp(config);
  const { host, port } = await app.listen();
  const baseUrl = `http://${host}:${port}`;

  return {
    app,
    config,
    tmpDir,
    dbPath,
    baseUrl,
    async cleanup() {
      await app.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

test('healthz, default config (MEMBERSHIP_ENABLED=false), and auto-persisted .secret', async () => {
  const ctx = await startTestApp({ USER_SYNC_SECRET: '' });
  try {
    const secretFile = path.join(path.dirname(ctx.dbPath), '.secret');
    assert.equal(fs.existsSync(secretFile), true);
    assert.ok(fs.readFileSync(secretFile, 'utf8').trim().length >= 32);

    const healthRes = await fetch(`${ctx.baseUrl}/user-api/healthz`);
    assert.equal(healthRes.status, 200);
    assert.deepEqual(await healthRes.json(), { ok: true });

    const cfgRes = await fetch(`${ctx.baseUrl}/user-api/config`);
    assert.equal(cfgRes.status, 200);
    assert.deepEqual(await cfgRes.json(), {
      membershipEnabled: false,
      registrationEnabled: true,
      emailResetEnabled: false,
    });
  } finally {
    await ctx.cleanup();
  }
});

test('register, duplicate 409, cookie flags, me, logout, login, wrong password 401', async () => {
  const ctx = await startTestApp();
  try {
    // Unauthenticated /me -> 401
    const anonMe = await fetch(`${ctx.baseUrl}/user-api/me`);
    assert.equal(anonMe.status, 401);

    // Invalid password -> 400
    const shortPw = await fetch(`${ctx.baseUrl}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: '123' }),
    });
    assert.equal(shortPw.status, 400);

    // Register with X-Forwarded-Proto: https -> Secure cookie
    const regRes = await fetch(`${ctx.baseUrl}/user-api/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-Proto': 'https',
      },
      body: JSON.stringify({ username: 'Alice_01', password: 'Password123!' }),
    });
    assert.equal(regRes.status, 201);
    const setCookie = regRes.headers.get('set-cookie') || '';
    assert.match(setCookie, /^goprmpt_session=/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.match(setCookie, /Secure/);

    const regBody = await regRes.json();
    assert.equal(regBody.user.username, 'alice_01');
    assert.equal(regBody.user.role, 'user');
    assert.equal(regBody.user.tier, 'free');
    assert.equal('password_hash' in regBody.user, false);

    // Duplicate username -> 409
    const dupRes = await fetch(`${ctx.baseUrl}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice_01', password: 'Password123!' }),
    });
    assert.equal(dupRes.status, 409);

    const cookie = extractCookieHeader(regRes);

    // /me with valid session
    const meRes = await fetch(`${ctx.baseUrl}/user-api/me`, {
      headers: { Cookie: cookie },
    });
    assert.equal(meRes.status, 200);
    const meBody = await meRes.json();
    assert.equal(meBody.user.username, 'alice_01');

    // Logout clears cookie
    const logoutRes = await fetch(`${ctx.baseUrl}/user-api/logout`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    assert.equal(logoutRes.status, 200);
    assert.match(logoutRes.headers.get('set-cookie') || '', /Max-Age=0/);

    // Wrong password -> 401
    const badLogin = await fetch(`${ctx.baseUrl}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice_01', password: 'WrongPassword!' }),
    });
    assert.equal(badLogin.status, 401);

    // Valid login -> 200
    const goodLogin = await fetch(`${ctx.baseUrl}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice_01', password: 'Password123!' }),
    });
    assert.equal(goodLogin.status, 200);
    assert.ok(extractCookieHeader(goodLogin).startsWith('goprmpt_session='));
  } finally {
    await ctx.cleanup();
  }
});

test('sync GET/PUT roundtrip, optimistic locking 409, and BYOK secret stripping', async () => {
  const ctx = await startTestApp();
  try {
    const regRes = await fetch(`${ctx.baseUrl}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'syncuser', password: 'Password123!' }),
    });
    const cookie = extractCookieHeader(regRes);
    const { user } = await regRes.json();

    // Initial GET sync -> empty version 0
    const emptyRes = await fetch(`${ctx.baseUrl}/user-api/sync`, {
      headers: { Cookie: cookie },
    });
    assert.equal(emptyRes.status, 200);
    assert.deepEqual(await emptyRes.json(), {
      version: 0,
      updatedAt: null,
      data: null,
    });

    // PUT sync with forbidden BYOK fields at top-level and nested levels
    const dirtyPayload = {
      models: [{ key: 'openai', apiKey: 'sk-live-TOP-SECRET-111' }],
      imageModels: [{ key: 'flux', api_key: 'img-secret-222' }],
      favorites: [
        {
          id: 'fav-1',
          title: '周报助手',
          apiKey: 'sk-nested-fav-333',
          nested: { secretKey: 'nested-secret-444', safe: 'keep-me' },
        },
      ],
      history: [{ id: 'h-1', originalPrompt: 'hello', api_key: 'sk-hist-555' }],
      templates: [{ id: 't-1', name: '代码评审' }],
      variables: { role: '架构师' },
      preferences: { theme: 'dark', apiKey: 'sk-pref-666' },
      unexpectedSection: { shouldBeDropped: true },
    };

    const put1 = await fetch(`${ctx.baseUrl}/user-api/sync`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ data: dirtyPayload, expectedVersion: 0 }),
    });
    assert.equal(put1.status, 200);
    const put1Body = await put1.json();
    assert.equal(put1Body.version, 1);
    assert.ok(put1Body.bytes > 0);
    assert.equal(typeof put1Body.updatedAt, 'number');

    // Verify GET sync returns sanitized data without any secrets or models
    const get1 = await fetch(`${ctx.baseUrl}/user-api/sync`, {
      headers: { Cookie: cookie },
    });
    assert.equal(get1.status, 200);
    const get1Body = await get1.json();
    assert.equal(get1Body.version, 1);
    assert.equal('models' in get1Body.data, false);
    assert.equal('imageModels' in get1Body.data, false);
    assert.equal('unexpectedSection' in get1Body.data, false);
    assert.deepEqual(get1Body.data, {
      favorites: [{ id: 'fav-1', title: '周报助手', nested: { safe: 'keep-me' } }],
      history: [{ id: 'h-1', originalPrompt: 'hello' }],
      templates: [{ id: 't-1', name: '代码评审' }],
      variables: { role: '架构师' },
      preferences: { theme: 'dark' },
    });

    // Verify raw SQLite storage never persisted any secret string
    const rawRow = ctx.app.db.raw
      .prepare('SELECT payload_json FROM user_sync_blobs WHERE user_id = ?')
      .get(user.id);
    assert.equal(rawRow.payload_json.includes('sk-live'), false);
    assert.equal(rawRow.payload_json.includes('apiKey'), false);
    assert.equal(rawRow.payload_json.includes('api_key'), false);
    assert.equal(rawRow.payload_json.includes('secretKey'), false);
    assert.equal(rawRow.payload_json.includes('models'), false);

    // Optimistic locking: stale expectedVersion=0 -> 409
    const stalePut = await fetch(`${ctx.baseUrl}/user-api/sync`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ data: { favorites: [] }, expectedVersion: 0 }),
    });
    assert.equal(stalePut.status, 409);
    const staleBody = await stalePut.json();
    assert.equal(staleBody.currentVersion, 1);

    // Matching expectedVersion=1 -> 200 version=2
    const put2 = await fetch(`${ctx.baseUrl}/user-api/sync`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ data: { favorites: [{ id: 'fav-2' }] }, expectedVersion: 1 }),
    });
    assert.equal(put2.status, 200);
    assert.equal((await put2.json()).version, 2);
  } finally {
    await ctx.cleanup();
  }
});

test('admin bootstrap, non-admin 403, PATCH tier/disabled, and disabled user 403', async () => {
  const ctx = await startTestApp();
  try {
    // Register a normal user
    const userReg = await fetch(`${ctx.baseUrl}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'bob', password: 'Password123!' }),
    });
    const userCookie = extractCookieHeader(userReg);
    const { user: bob } = await userReg.json();

    // Non-admin blocked from admin endpoints
    const nonAdminList = await fetch(`${ctx.baseUrl}/user-api/admin/users`, {
      headers: { Cookie: userCookie },
    });
    assert.equal(nonAdminList.status, 403);

    const nonAdminPatch = await fetch(`${ctx.baseUrl}/user-api/admin/users/${bob.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({ tier: 'pro' }),
    });
    assert.equal(nonAdminPatch.status, 403);

    // Admin HTML unauthenticated renders login prompt
    const anonHtml = await fetch(`${ctx.baseUrl}/user-api/admin`);
    assert.equal(anonHtml.status, 200);
    assert.match(await anonHtml.text(), /管理员用户名/);

    // Login as bootstrapped admin
    const adminLogin = await fetch(`${ctx.baseUrl}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'root_admin', password: 'AdminPassword123!' }),
    });
    assert.equal(adminLogin.status, 200);
    const adminCookie = extractCookieHeader(adminLogin);

    // Admin HTML authenticated renders console
    const adminHtml = await fetch(`${ctx.baseUrl}/user-api/admin`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(adminHtml.status, 200);
    assert.match(await adminHtml.text(), /设为 Pro \+30天/);

    // Admin lists users
    const listRes = await fetch(`${ctx.baseUrl}/user-api/admin/users`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.membershipEnabled, false);
    const listedBob = listBody.users.find((u) => u.id === bob.id);
    assert.ok(listedBob);
    assert.equal(listedBob.syncBytes, 0);

    // Admin upgrades bob to pro and disables bob
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const patchRes = await fetch(`${ctx.baseUrl}/user-api/admin/users/${bob.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ tier: 'pro', tierExpiresAt: expiresAt, disabled: true }),
    });
    assert.equal(patchRes.status, 200);
    const patchBody = await patchRes.json();
    assert.equal(patchBody.user.tier, 'pro');
    assert.equal(patchBody.user.tierExpiresAt, expiresAt);
    assert.equal(patchBody.user.disabled, true);

    // Disabled user cannot access /me or login
    const bobMe = await fetch(`${ctx.baseUrl}/user-api/me`, {
      headers: { Cookie: userCookie },
    });
    assert.equal(bobMe.status, 403);

    const bobLogin = await fetch(`${ctx.baseUrl}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'bob', password: 'Password123!' }),
    });
    assert.equal(bobLogin.status, 403);
  } finally {
    await ctx.cleanup();
  }
});

test('rate limit returns 429 on repeated register/login attempts', async () => {
  const ctx = await startTestApp({
    RATE_LIMIT_MAX: '3',
    RATE_LIMIT_WINDOW_MS: '60000',
  });
  try {
    for (let i = 0; i < 3; i += 1) {
      const res = await fetch(`${ctx.baseUrl}/user-api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '203.0.113.9',
        },
        body: JSON.stringify({ username: 'nobody', password: 'Password123!' }),
      });
      assert.equal(res.status, 401);
    }

    const blocked = await fetch(`${ctx.baseUrl}/user-api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.9',
      },
      body: JSON.stringify({ username: 'nobody', password: 'Password123!' }),
    });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
  } finally {
    await ctx.cleanup();
  }
});

test('admin membership toggle persists across restarts and updates /config and /admin', async () => {
  const tmpDir = makeTempDir();
  const dbPath = path.join(tmpDir, 'persist', 'users.db');
  const env = {
    USER_SYNC_HOST: '127.0.0.1',
    USER_SYNC_PORT: '0',
    USER_SYNC_DB_PATH: dbPath,
    ADMIN_USERNAME: 'root_admin',
    ADMIN_PASSWORD: 'AdminPassword123!',
    MEMBERSHIP_ENABLED: 'false',
    RATE_LIMIT_MAX: '50',
    RATE_LIMIT_WINDOW_MS: '60000',
  };

  let app1 = createApp(loadConfig(env));
  let app2 = null;
  try {
    const addr1 = await app1.listen();
    const base1 = `http://${addr1.host}:${addr1.port}`;

    // HEAD /user-api/admin -> 200
    const headRes = await fetch(`${base1}/user-api/admin`, { method: 'HEAD' });
    assert.equal(headRes.status, 200);

    // Register normal user and ensure 403 on PATCH /admin/settings
    const userReg = await fetch(`${base1}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'normal_member', password: 'Password123!' }),
    });
    const userCookie = extractCookieHeader(userReg);
    const nonAdminSettings = await fetch(`${base1}/user-api/admin/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({ membershipEnabled: true }),
    });
    assert.equal(nonAdminSettings.status, 403);

    // Login as admin
    const adminLogin = await fetch(`${base1}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'root_admin', password: 'AdminPassword123!' }),
    });
    const adminCookie = extractCookieHeader(adminLogin);

    // Invalid payload -> 400
    const badPatch = await fetch(`${base1}/user-api/admin/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ membershipEnabled: 'yes' }),
    });
    assert.equal(badPatch.status, 400);

    // Enable membership -> 200
    const enableRes = await fetch(`${base1}/user-api/admin/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ membershipEnabled: true }),
    });
    assert.equal(enableRes.status, 200);
    assert.equal((await enableRes.json()).membershipEnabled, true);

    // /config and /admin/users reflect enabled state immediately
    const cfgAfterEnable = await fetch(`${base1}/user-api/config`);
    assert.deepEqual(await cfgAfterEnable.json(), {
      membershipEnabled: true,
      registrationEnabled: true,
      emailResetEnabled: false,
    });
    const usersAfterEnable = await fetch(`${base1}/user-api/admin/users`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal((await usersAfterEnable.json()).membershipEnabled, true);
    const adminHtmlAfterEnable = await fetch(`${base1}/user-api/admin`, {
      headers: { Cookie: adminCookie },
    });
    const htmlText = await adminHtmlAfterEnable.text();
    assert.match(htmlText, /会员功能总开关/);
    assert.match(htmlText, /会员体系：已启用/);

    // Restart server with same DB (env still says MEMBERSHIP_ENABLED=false) -> DB wins!
    await app1.close();
    app1 = null;

    app2 = createApp(loadConfig(env));
    const addr2 = await app2.listen();
    const base2 = `http://${addr2.host}:${addr2.port}`;

    const cfgAfterRestart = await fetch(`${base2}/user-api/config`);
    assert.deepEqual(await cfgAfterRestart.json(), {
      membershipEnabled: true,
      registrationEnabled: true,
      emailResetEnabled: false,
    });

    // Toggle back to false
    const adminLogin2 = await fetch(`${base2}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'root_admin', password: 'AdminPassword123!' }),
    });
    const adminCookie2 = extractCookieHeader(adminLogin2);
    const disableRes = await fetch(`${base2}/user-api/admin/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie2 },
      body: JSON.stringify({ membershipEnabled: false }),
    });
    assert.equal(disableRes.status, 200);
    assert.equal((await disableRes.json()).membershipEnabled, false);

    const cfgFinal = await fetch(`${base2}/user-api/config`);
    assert.deepEqual(await cfgFinal.json(), {
      membershipEnabled: false,
      registrationEnabled: true,
      emailResetEnabled: false,
    });
  } finally {
    if (app1) await app1.close();
    if (app2) await app2.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('optional email registration, profile update, self password change, admin password reset, and legacy DB migration', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const tmpDir = makeTempDir();
  const dbPath = path.join(tmpDir, 'legacy', 'users.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  // Simulate an existing pre-email database to verify live ALTER TABLE migration
  const legacyDb = new DatabaseSync(dbPath);
  legacyDb.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      tier TEXT NOT NULL DEFAULT 'free',
      tier_expires_at INTEGER,
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  legacyDb.close();

  const ctxApp = createApp(
    loadConfig({
      USER_SYNC_HOST: '127.0.0.1',
      USER_SYNC_PORT: '0',
      USER_SYNC_DB_PATH: dbPath,
      ADMIN_USERNAME: 'root_admin',
      ADMIN_PASSWORD: 'AdminPassword123!',
      RATE_LIMIT_MAX: '50',
      RATE_LIMIT_WINDOW_MS: '60000',
    }),
  );

  try {
    const addr = await ctxApp.listen();
    const baseUrl = `http://${addr.host}:${addr.port}`;

    // Invalid email on register -> 400
    const badEmailReg = await fetch(`${baseUrl}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'carol', password: 'Password123!', email: 'not-an-email' }),
    });
    assert.equal(badEmailReg.status, 400);

    // Valid optional email registration -> 201 and email lowercased
    const regCarol = await fetch(`${baseUrl}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'carol', password: 'Password123!', email: 'Carol@Example.COM' }),
    });
    assert.equal(regCarol.status, 201);
    const carolCookie = extractCookieHeader(regCarol);
    const { user: carol } = await regCarol.json();
    assert.equal(carol.email, 'carol@example.com');

    // Duplicate email -> 409
    const dupEmailReg = await fetch(`${baseUrl}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'dave', password: 'Password123!', email: 'carol@example.com' }),
    });
    assert.equal(dupEmailReg.status, 409);

    // Register without email -> 201 with email: null
    const regDave = await fetch(`${baseUrl}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'dave', password: 'Password123!' }),
    });
    assert.equal(regDave.status, 201);
    const daveCookie = extractCookieHeader(regDave);
    const { user: dave } = await regDave.json();
    assert.equal(dave.email, null);

    // User updates own email -> 200; duplicate fails 409
    const dupProfile = await fetch(`${baseUrl}/user-api/me/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: daveCookie },
      body: JSON.stringify({ email: 'carol@example.com' }),
    });
    assert.equal(dupProfile.status, 409);

    const bindEmail = await fetch(`${baseUrl}/user-api/me/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: daveCookie },
      body: JSON.stringify({ email: 'dave@example.com' }),
    });
    assert.equal(bindEmail.status, 200);
    assert.equal((await bindEmail.json()).user.email, 'dave@example.com');

    // Login using bound email works
    const emailLogin = await fetch(`${baseUrl}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'dave@example.com', password: 'Password123!' }),
    });
    assert.equal(emailLogin.status, 200);
    assert.equal((await emailLogin.json()).user.username, 'dave');

    // Self password change: wrong current password -> 401
    const badPwd = await fetch(`${baseUrl}/user-api/me/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: carolCookie },
      body: JSON.stringify({ currentPassword: 'WrongPassword!', newPassword: 'NewPassword456!' }),
    });
    assert.equal(badPwd.status, 401);

    // Self password change: valid -> 200 and new password logs in
    const okPwd = await fetch(`${baseUrl}/user-api/me/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: carolCookie },
      body: JSON.stringify({ currentPassword: 'Password123!', newPassword: 'NewPassword456!' }),
    });
    assert.equal(okPwd.status, 200);

    const carolNewLogin = await fetch(`${baseUrl}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'carol', password: 'NewPassword456!' }),
    });
    assert.equal(carolNewLogin.status, 200);

    // Non-admin reset-password -> 403
    const nonAdminReset = await fetch(`${baseUrl}/user-api/admin/users/${dave.id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: carolCookie },
      body: '{}',
    });
    assert.equal(nonAdminReset.status, 403);

    // Admin login & reset Dave's password -> 200 with 12-char temporaryPassword
    const adminLogin = await fetch(`${baseUrl}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'root_admin', password: 'AdminPassword123!' }),
    });
    const adminCookie = extractCookieHeader(adminLogin);
    const { user: adminUser } = await adminLogin.json();

    // Admin cannot self-reset via reset-password route -> 400
    const selfReset = await fetch(`${baseUrl}/user-api/admin/users/${adminUser.id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: '{}',
    });
    assert.equal(selfReset.status, 400);

    // Admin resets Dave's password
    const resetRes = await fetch(`${baseUrl}/user-api/admin/users/${dave.id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: '{}',
    });
    assert.equal(resetRes.status, 200);
    const resetBody = await resetRes.json();
    assert.equal(resetBody.temporaryPassword.length, 12);

    // Dave can log in with temporaryPassword and old password fails
    const oldDaveLogin = await fetch(`${baseUrl}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'dave', password: 'Password123!' }),
    });
    assert.equal(oldDaveLogin.status, 401);

    const tempDaveLogin = await fetch(`${baseUrl}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'dave', password: resetBody.temporaryPassword }),
    });
    assert.equal(tempDaveLogin.status, 200);

    // Admin list returns emails
    const listRes = await fetch(`${baseUrl}/user-api/admin/users`, {
      headers: { Cookie: adminCookie },
    });
    const listedDave = (await listRes.json()).users.find((u) => u.id === dave.id);
    assert.equal(listedDave.email, 'dave@example.com');
  } finally {
    await ctxApp.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Resend mail config via admin UI, test-email, password-reset request/confirm, cooldown, lockout & single-use', async () => {
  const tmpDir = makeTempDir();
  const dbPath = path.join(tmpDir, 'mail', 'users.db');
  const sentEmails = [];
  const mockFetch = async (url, init) => {
    assert.equal(url, 'https://api.resend.com/emails');
    const authHeader = init?.headers?.Authorization || '';
    const payload = JSON.parse(String(init?.body || '{}'));
    sentEmails.push({ authHeader, payload });
    return new Response(JSON.stringify({ id: `re_msg_${sentEmails.length}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const app = createApp(
    loadConfig({
      USER_SYNC_HOST: '127.0.0.1',
      USER_SYNC_PORT: '0',
      USER_SYNC_DB_PATH: dbPath,
      ADMIN_USERNAME: 'root_admin',
      ADMIN_PASSWORD: 'AdminPassword123!',
      RATE_LIMIT_MAX: '50',
      RATE_LIMIT_WINDOW_MS: '60000',
      PASSWORD_RESET_COOLDOWN_MS: '60000',
    }),
    { fetchImpl: mockFetch },
  );

  try {
    const addr = await app.listen();
    const baseUrl = `http://${addr.host}:${addr.port}`;

    // Before configuring Resend: password-reset returns 503
    const unconfiguredReq = await fetch(`${baseUrl}/user-api/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'erin@example.com' }),
    });
    assert.equal(unconfiguredReq.status, 503);

    // Register user with email
    const regRes = await fetch(`${baseUrl}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'erin',
        email: 'erin@example.com',
        password: 'OldPassword123!',
      }),
    });
    assert.equal(regRes.status, 201);

    // Login as admin and configure Resend via PATCH /admin/settings
    const adminLogin = await fetch(`${baseUrl}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'root_admin', password: 'AdminPassword123!' }),
    });
    const adminCookie = extractCookieHeader(adminLogin);

    const saveMailRes = await fetch(`${baseUrl}/user-api/admin/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        resendApiKey: 're_live_secret_987654321',
        mailFrom: '高词 · GoPrmpt <noreply@goprmpt.com>',
      }),
    });
    assert.equal(saveMailRes.status, 200);
    const savedSettings = await saveMailRes.json();
    assert.equal(savedSettings.emailResetEnabled, true);
    assert.equal(savedSettings.resendKeyHint, 're_l••••4321');
    assert.equal(JSON.stringify(savedSettings).includes('re_live_secret_987654321'), false);

    // Public /config now exposes emailResetEnabled: true
    const cfgRes = await fetch(`${baseUrl}/user-api/config`);
    assert.equal((await cfgRes.json()).emailResetEnabled, true);

    // Admin sends a test email
    const testMailRes = await fetch(`${baseUrl}/user-api/admin/test-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ to: 'owner@example.com' }),
    });
    assert.equal(testMailRes.status, 200);
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].authHeader, 'Bearer re_live_secret_987654321');
    assert.deepEqual(sentEmails[0].payload.to, ['owner@example.com']);

    // Unknown email still returns 200 anti-enumeration and sends NO email
    const ghostRes = await fetch(`${baseUrl}/user-api/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com' }),
    });
    assert.equal(ghostRes.status, 200);
    assert.equal(sentEmails.length, 1);

    // Known email sends a 6-digit code via Resend
    const reqRes = await fetch(`${baseUrl}/user-api/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'erin@example.com' }),
    });
    assert.equal(reqRes.status, 200);
    assert.equal(sentEmails.length, 2);
    const codeMatch = sentEmails[1].payload.text.match(/(\d{6})/);
    assert.ok(codeMatch, 'reset email should contain a 6-digit code');
    const code = codeMatch[1];

    // Raw DB must never store plaintext 6-digit code
    const rawResetRow = app.db.raw
      .prepare('SELECT code_hash FROM password_reset_codes WHERE email = ?')
      .get('erin@example.com');
    assert.ok(rawResetRow);
    assert.equal(rawResetRow.code_hash.includes(code), false);

    // Immediate second request hits 60s cooldown -> 429
    const cooldownRes = await fetch(`${baseUrl}/user-api/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'erin@example.com' }),
    });
    assert.equal(cooldownRes.status, 429);

    // Wrong code -> 400
    const wrongConfirm = await fetch(`${baseUrl}/user-api/password-reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'erin@example.com',
        code: code === '000000' ? '111111' : '000000',
        newPassword: 'ResetPassword789!',
      }),
    });
    assert.equal(wrongConfirm.status, 400);

    // Correct code -> 200 and updates password
    const okConfirm = await fetch(`${baseUrl}/user-api/password-reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'erin@example.com',
        code,
        newPassword: 'ResetPassword789!',
      }),
    });
    assert.equal(okConfirm.status, 200);

    // Replay same code -> 400
    const replayConfirm = await fetch(`${baseUrl}/user-api/password-reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'erin@example.com',
        code,
        newPassword: 'AnotherPassword999!',
      }),
    });
    assert.equal(replayConfirm.status, 400);

    // Old password rejected, new password succeeds
    const oldLogin = await fetch(`${baseUrl}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'erin', password: 'OldPassword123!' }),
    });
    assert.equal(oldLogin.status, 401);

    const newLogin = await fetch(`${baseUrl}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'erin@example.com', password: 'ResetPassword789!' }),
    });
    assert.equal(newLogin.status, 200);

    // Clearing key disables emailResetEnabled again
    const clearRes = await fetch(`${baseUrl}/user-api/admin/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ resendApiKey: '' }),
    });
    assert.equal(clearRes.status, 200);
    assert.equal((await clearRes.json()).emailResetEnabled, false);
  } finally {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
