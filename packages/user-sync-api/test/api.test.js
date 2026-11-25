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
      monthlyCredits: { free: 0, standard: 100, pro: 500, internal: 1000 },
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
    assert.match(await adminHtml.text(), /设为专业\+30天/);

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
      monthlyCredits: { free: 0, standard: 100, pro: 500, internal: 1000 },
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
      monthlyCredits: { free: 0, standard: 100, pro: 500, internal: 1000 },
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
      monthlyCredits: { free: 0, standard: 100, pro: 500, internal: 1000 },
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

test('browser extension CORS allowlist and Bearer token bidirectional sync (web origin stays cookie-only)', async () => {
  const ctx = await startTestApp();
  try {
    const extOrigin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

    // Preflight from Chrome/Edge extension origin -> 204 with exact ACAO
    const preflight = await fetch(`${ctx.baseUrl}/user-api/sync`, {
      method: 'OPTIONS',
      headers: { Origin: extOrigin },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), extOrigin);
    assert.match(preflight.headers.get('access-control-allow-headers') || '', /Authorization/);

    // Untrusted web origin gets NO CORS header
    const evilPreflight = await fetch(`${ctx.baseUrl}/user-api/config`, {
      headers: { Origin: 'https://evil.example' },
    });
    assert.equal(evilPreflight.status, 200);
    assert.equal(evilPreflight.headers.get('access-control-allow-origin'), null);

    // Web register does NOT leak bearer token in JSON body
    const webReg = await fetch(`${ctx.baseUrl}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'extsyncuser', password: 'Password123!' }),
    });
    assert.equal(webReg.status, 201);
    const webRegBody = await webReg.json();
    assert.equal('token' in webRegBody, false);

    // Extension login returns Bearer token and CORS header
    const extLogin = await fetch(`${ctx.baseUrl}/user-api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: extOrigin,
        'X-Client-Type': 'extension',
      },
      body: JSON.stringify({ username: 'extsyncuser', password: 'Password123!' }),
    });
    assert.equal(extLogin.status, 200);
    assert.equal(extLogin.headers.get('access-control-allow-origin'), extOrigin);
    const extLoginBody = await extLogin.json();
    assert.equal(typeof extLoginBody.token, 'string');
    assert.ok(extLoginBody.token.length > 20);

    // Extension uses ONLY Authorization: Bearer (zero Cookie) to push & pull sync
    const meRes = await fetch(`${ctx.baseUrl}/user-api/me`, {
      headers: {
        Origin: extOrigin,
        Authorization: `Bearer ${extLoginBody.token}`,
      },
    });
    assert.equal(meRes.status, 200);
    assert.equal((await meRes.json()).user.username, 'extsyncuser');

    const pushRes = await fetch(`${ctx.baseUrl}/user-api/sync`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Origin: extOrigin,
        Authorization: `Bearer ${extLoginBody.token}`,
      },
      body: JSON.stringify({
        expectedVersion: 0,
        data: {
          favorites: [{ id: 'ext-fav-1', title: '插件收藏' }],
          models: [{ apiKey: 'sk-must-strip' }],
        },
      }),
    });
    assert.equal(pushRes.status, 200);
    assert.equal((await pushRes.json()).version, 1);

    // Website Cookie session reads the exact data pushed from the extension!
    const webCookie = extractCookieHeader(webReg);
    const webPull = await fetch(`${ctx.baseUrl}/user-api/sync`, {
      headers: { Cookie: webCookie },
    });
    assert.equal(webPull.status, 200);
    const webPullBody = await webPull.json();
    assert.equal(webPullBody.version, 1);
    assert.deepEqual(webPullBody.data, {
      favorites: [{ id: 'ext-fav-1', title: '插件收藏' }],
    });
  } finally {
    await ctx.cleanup();
  }
});

test('announcements CRUD, validation/XSS rejection, non-admin 403, active/pinned/expiry filtering, and admin HTML', async () => {
  const ctx = await startTestApp();
  try {
    // Public active endpoint works without auth and starts empty
    const initActive = await fetch(`${ctx.baseUrl}/user-api/announcements/active`);
    assert.equal(initActive.status, 200);
    assert.deepEqual(await initActive.json(), { announcements: [] });

    // Unauthenticated admin announcements -> 401
    const anonAdminList = await fetch(`${ctx.baseUrl}/user-api/admin/announcements`);
    assert.equal(anonAdminList.status, 401);

    // Register normal user and verify 403 on all admin announcement endpoints
    const userReg = await fetch(`${ctx.baseUrl}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'normal_reader', password: 'Password123!' }),
    });
    const userCookie = extractCookieHeader(userReg);

    const nonAdminGet = await fetch(`${ctx.baseUrl}/user-api/admin/announcements`, {
      headers: { Cookie: userCookie },
    });
    assert.equal(nonAdminGet.status, 403);

    const nonAdminPost = await fetch(`${ctx.baseUrl}/user-api/admin/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({ title: 'nope', content: 'nope' }),
    });
    assert.equal(nonAdminPost.status, 403);

    const nonAdminPatch = await fetch(`${ctx.baseUrl}/user-api/admin/announcements/fake-id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({ title: 'nope' }),
    });
    assert.equal(nonAdminPatch.status, 403);

    const nonAdminDelete = await fetch(`${ctx.baseUrl}/user-api/admin/announcements/fake-id`, {
      method: 'DELETE',
      headers: { Cookie: userCookie },
    });
    assert.equal(nonAdminDelete.status, 403);

    const nonAdminEmail = await fetch(`${ctx.baseUrl}/user-api/admin/announcements/fake-id/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: '{}',
    });
    assert.equal(nonAdminEmail.status, 403);

    // Login as admin
    const adminLogin = await fetch(`${ctx.baseUrl}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'root_admin', password: 'AdminPassword123!' }),
    });
    assert.equal(adminLogin.status, 200);
    const adminCookie = extractCookieHeader(adminLogin);

    // Validation & XSS / URL safety checks -> 400
    const badPayloads = [
      { title: '   ', content: 'valid content' },
      { title: 'a'.repeat(81), content: 'valid content' },
      { title: 'valid title', content: '   ' },
      { title: 'valid title', content: 'b'.repeat(801) },
      { title: 'valid title', content: 'valid content', type: 'unknown_type' },
      { title: 'xss js', content: 'body', linkUrl: 'javascript:alert(1)' },
      { title: 'xss data', content: 'body', linkUrl: 'data:text/html,<script>alert(1)</script>' },
      { title: 'bad proto', content: 'body', linkUrl: 'ftp://example.com/file' },
      { title: 'bad url', content: 'body', linkUrl: 'not-a-url' },
      { title: 'long url', content: 'body', linkUrl: `https://goprmpt.com/${'x'.repeat(500)}` },
      { title: 'long linkText', content: 'body', linkText: 't'.repeat(33) },
      { title: 'bad active', content: 'body', isActive: 'yes' },
      { title: 'bad pinned', content: 'body', isPinned: 1 },
      { title: 'zero expiry', content: 'body', expiresAt: 0 },
      { title: 'neg expiry', content: 'body', expiresAt: -100 },
      { title: 'str expiry', content: 'body', expiresAt: '2099-01-01' },
    ];
    for (const payload of badPayloads) {
      const res = await fetch(`${ctx.baseUrl}/user-api/admin/announcements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify(payload),
      });
      assert.equal(res.status, 400, `expected 400 for payload ${JSON.stringify(payload)}`);
    }

    // Create 5 announcements: normal, pinned, future-expiring, already-expired, inactive
    const createNotice = await fetch(`${ctx.baseUrl}/user-api/admin/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        title: '  普通重要通知  ',
        content: '  第一行内容\n第二行内容  ',
        type: 'notice',
        linkUrl: 'https://goprmpt.com/changelog',
        linkText: '  查看更新日志  ',
      }),
    });
    assert.equal(createNotice.status, 201);
    const { announcement: noticeAnn } = await createNotice.json();
    assert.equal(noticeAnn.title, '普通重要通知');
    assert.equal(noticeAnn.content, '第一行内容\n第二行内容');
    assert.equal(noticeAnn.type, 'notice');
    assert.equal(noticeAnn.linkUrl, 'https://goprmpt.com/changelog');
    assert.equal(noticeAnn.linkText, '查看更新日志');
    assert.equal(noticeAnn.isActive, true);
    assert.equal(noticeAnn.isPinned, false);
    assert.equal(noticeAnn.expiresAt, null);
    assert.equal(noticeAnn.emailedAt, null);
    assert.equal(noticeAnn.emailedCount, 0);
    assert.equal(typeof noticeAnn.createdAt, 'number');
    assert.equal(typeof noticeAnn.updatedAt, 'number');

    const createPinned = await fetch(`${ctx.baseUrl}/user-api/admin/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        title: '置顶春季活动',
        content: '限时活动说明',
        type: 'activity',
        isPinned: true,
        isActive: true,
      }),
    });
    assert.equal(createPinned.status, 201);
    const { announcement: pinnedAnn } = await createPinned.json();

    const futureExpiry = Date.now() + 3 * 24 * 60 * 60 * 1000;
    const createFuture = await fetch(`${ctx.baseUrl}/user-api/admin/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        title: '即将维护提示',
        content: '本周日凌晨例行维护',
        type: 'maintenance',
        expiresAt: futureExpiry,
      }),
    });
    assert.equal(createFuture.status, 201);
    const { announcement: futureAnn } = await createFuture.json();

    const createExpired = await fetch(`${ctx.baseUrl}/user-api/admin/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        title: '已过期活动',
        content: '不应出现在公开列表',
        type: 'activity',
        expiresAt: Date.now() - 10_000,
      }),
    });
    assert.equal(createExpired.status, 201);
    const { announcement: expiredAnn } = await createExpired.json();

    const createInactive = await fetch(`${ctx.baseUrl}/user-api/admin/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        title: '草稿未发布',
        content: '不应出现在公开列表',
        isActive: false,
        isPinned: true,
      }),
    });
    assert.equal(createInactive.status, 201);
    const { announcement: inactiveAnn } = await createInactive.json();

    // Public active list returns ONLY active & non-expired, pinned first then newest updated
    const activeRes = await fetch(`${ctx.baseUrl}/user-api/announcements/active`);
    assert.equal(activeRes.status, 200);
    const { announcements: activeList } = await activeRes.json();
    assert.deepEqual(
      activeList.map((a) => a.id),
      [pinnedAnn.id, futureAnn.id, noticeAnn.id],
    );

    // Admin list returns all 5 announcements + emailable count & email status
    const adminListRes = await fetch(`${ctx.baseUrl}/user-api/admin/announcements`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(adminListRes.status, 200);
    const adminListBody = await adminListRes.json();
    assert.equal(adminListBody.announcements.length, 5);
    assert.equal(adminListBody.emailableUsersCount, 0);
    assert.equal(adminListBody.emailEnabled, false);

    // PATCH validation: reject empty patch & javascript: URL & 404 unknown id
    const emptyPatch = await fetch(`${ctx.baseUrl}/user-api/admin/announcements/${noticeAnn.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({}),
    });
    assert.equal(emptyPatch.status, 400);

    const xssPatch = await fetch(`${ctx.baseUrl}/user-api/admin/announcements/${noticeAnn.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ linkUrl: 'javascript:void(0)' }),
    });
    assert.equal(xssPatch.status, 400);

    const missingPatch = await fetch(`${ctx.baseUrl}/user-api/admin/announcements/nonexistent-id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ title: 'updated' }),
    });
    assert.equal(missingPatch.status, 404);

    // PATCH update: unpin pinnedAnn, pin noticeAnn, clear linkUrl, and publish inactiveAnn
    const unpinRes = await fetch(`${ctx.baseUrl}/user-api/admin/announcements/${pinnedAnn.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ isPinned: false, isActive: false }),
    });
    assert.equal(unpinRes.status, 200);
    const { announcement: updatedPinned } = await unpinRes.json();
    assert.equal(updatedPinned.isPinned, false);
    assert.equal(updatedPinned.isActive, false);

    const pinNoticeRes = await fetch(`${ctx.baseUrl}/user-api/admin/announcements/${noticeAnn.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ title: '已置顶的重要通知', isPinned: true, linkUrl: null, linkText: '' }),
    });
    assert.equal(pinNoticeRes.status, 200);
    const { announcement: updatedNotice } = await pinNoticeRes.json();
    assert.equal(updatedNotice.title, '已置顶的重要通知');
    assert.equal(updatedNotice.isPinned, true);
    assert.equal(updatedNotice.linkUrl, null);
    assert.equal(updatedNotice.linkText, null);

    // Public active list reflects updates immediately
    const activeAfterPatch = await fetch(`${ctx.baseUrl}/user-api/announcements/active`);
    const activeIdsAfterPatch = (await activeAfterPatch.json()).announcements.map((a) => a.id);
    assert.deepEqual(activeIdsAfterPatch, [noticeAnn.id, futureAnn.id]);

    // DELETE announcement & verify 404 on second delete
    const delRes = await fetch(`${ctx.baseUrl}/user-api/admin/announcements/${expiredAnn.id}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    });
    assert.equal(delRes.status, 200);
    assert.deepEqual(await delRes.json(), { ok: true });

    const delAgain = await fetch(`${ctx.baseUrl}/user-api/admin/announcements/${expiredAnn.id}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    });
    assert.equal(delAgain.status, 404);

    // Confirm admin list now has 4 announcements (inactiveAnn still present)
    const adminAfterDel = await fetch(`${ctx.baseUrl}/user-api/admin/announcements`, {
      headers: { Cookie: adminCookie },
    });
    const remainingIds = (await adminAfterDel.json()).announcements.map((a) => a.id);
    assert.equal(remainingIds.length, 4);
    assert.ok(remainingIds.includes(inactiveAnn.id));
    assert.equal(remainingIds.includes(expiredAnn.id), false);

    // Admin console HTML renders the announcements card and valid inline JS
    const adminHtmlRes = await fetch(`${ctx.baseUrl}/user-api/admin`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(adminHtmlRes.status, 200);
    const adminHtml = await adminHtmlRes.text();
    assert.match(adminHtml, /id="announcementsCard"/);
    assert.match(adminHtml, /站内通知与活动公告/);
    assert.match(adminHtml, /id="announcementForm"/);
    assert.equal(adminHtml.includes('—'), false, 'admin UI copy should not contain em dashes');
    const scriptMatch = adminHtml.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch, 'admin console should contain inline script');
    assert.doesNotThrow(() => new Function(scriptMatch[1]), 'admin inline script should parse cleanly');
  } finally {
    await ctx.cleanup();
  }
});

test('announcements public CORS allowlist for goprmpt.com and extension origins', async () => {
  const ctx = await startTestApp();
  try {
    // Allowed: https://goprmpt.com on OPTIONS and GET /user-api/announcements/active
    const preflightRoot = await fetch(`${ctx.baseUrl}/user-api/announcements/active`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://goprmpt.com' },
    });
    assert.equal(preflightRoot.status, 204);
    assert.equal(preflightRoot.headers.get('access-control-allow-origin'), 'https://goprmpt.com');
    assert.equal(preflightRoot.headers.get('vary'), 'Origin');
    assert.equal(preflightRoot.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
    assert.equal(preflightRoot.headers.get('access-control-allow-headers'), 'Accept');
    assert.equal(preflightRoot.headers.get('access-control-allow-credentials'), null);

    const getWww = await fetch(`${ctx.baseUrl}/user-api/announcements/active`, {
      headers: { Origin: 'https://www.goprmpt.com' },
    });
    assert.equal(getWww.status, 200);
    assert.equal(getWww.headers.get('access-control-allow-origin'), 'https://www.goprmpt.com');
    assert.equal(getWww.headers.get('vary'), 'Origin');
    assert.equal(getWww.headers.get('access-control-allow-credentials'), null);

    // Rejected origins on /user-api/announcements/active
    for (const badOrigin of [
      'http://goprmpt.com',
      'https://evil.example',
      'https://goprmpt.com.evil.example',
      'https://sub.goprmpt.com',
    ]) {
      const res = await fetch(`${ctx.baseUrl}/user-api/announcements/active`, {
        headers: { Origin: badOrigin },
      });
      assert.equal(res.status, 200);
      assert.equal(
        res.headers.get('access-control-allow-origin'),
        null,
        `origin ${badOrigin} must not get ACAO`,
      );
    }

    // https://goprmpt.com must NOT get CORS on other routes or non-GET/OPTIONS methods
    const otherRouteRes = await fetch(`${ctx.baseUrl}/user-api/config`, {
      headers: { Origin: 'https://goprmpt.com' },
    });
    assert.equal(otherRouteRes.status, 200);
    assert.equal(otherRouteRes.headers.get('access-control-allow-origin'), null);

    const adminRouteRes = await fetch(`${ctx.baseUrl}/user-api/admin/announcements`, {
      headers: { Origin: 'https://goprmpt.com' },
    });
    assert.equal(adminRouteRes.status, 401);
    assert.equal(adminRouteRes.headers.get('access-control-allow-origin'), null);

    const postActiveRes = await fetch(`${ctx.baseUrl}/user-api/announcements/active`, {
      method: 'POST',
      headers: { Origin: 'https://goprmpt.com' },
    });
    assert.equal(postActiveRes.status, 404);
    assert.equal(postActiveRes.headers.get('access-control-allow-origin'), null);

    // Extension origins continue working on /user-api/announcements/active
    const chromeOrigin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
    const extRes = await fetch(`${ctx.baseUrl}/user-api/announcements/active`, {
      headers: { Origin: chromeOrigin },
    });
    assert.equal(extRes.status, 200);
    assert.equal(extRes.headers.get('access-control-allow-origin'), chromeOrigin);
  } finally {
    await ctx.cleanup();
  }
});

test('announcements Resend test/broadcast email push, HTML escaping, partial failures, and restart persistence', async () => {
  const tmpDir = makeTempDir();
  const dbPath = path.join(tmpDir, 'ann-mail', 'users.db');
  const env = {
    USER_SYNC_HOST: '127.0.0.1',
    USER_SYNC_PORT: '0',
    USER_SYNC_DB_PATH: dbPath,
    ADMIN_USERNAME: 'root_admin',
    ADMIN_PASSWORD: 'AdminPassword123!',
    RATE_LIMIT_MAX: '50',
    RATE_LIMIT_WINDOW_MS: '60000',
  };

  const sentEmails = [];
  let failRecipientEmail = null;
  const mockFetch = async (url, init) => {
    assert.equal(url, 'https://api.resend.com/emails');
    const payload = JSON.parse(String(init?.body || '{}'));
    if (failRecipientEmail && payload.to?.includes(failRecipientEmail)) {
      return new Response(JSON.stringify({ message: 'Simulated bounce' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    sentEmails.push({
      authHeader: init?.headers?.Authorization || '',
      payload,
    });
    return new Response(JSON.stringify({ id: `re_ann_${sentEmails.length}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  let app1 = createApp(loadConfig(env), { fetchImpl: mockFetch });
  let app2 = null;
  try {
    const addr1 = await app1.listen();
    const base1 = `http://${addr1.host}:${addr1.port}`;

    // Login as admin
    const adminLogin = await fetch(`${base1}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'root_admin', password: 'AdminPassword123!' }),
    });
    const adminCookie = extractCookieHeader(adminLogin);

    // Create announcement with HTML-sensitive characters and CTA link
    const createRes = await fetch(`${base1}/user-api/admin/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        title: '春季活动 <Pro 福利>',
        content: '第一行 <script>alert(1)</script>\n第二行：欢迎参与',
        type: 'activity',
        linkUrl: 'https://goprmpt.com/spring?ref=mail',
        linkText: '立即参与',
        isPinned: true,
      }),
    });
    assert.equal(createRes.status, 201);
    const { announcement: ann1 } = await createRes.json();

    // Before Resend configured -> 400
    const unconfiguredSend = await fetch(
      `${base1}/user-api/admin/announcements/${ann1.id}/send-email`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: '{}',
      },
    );
    assert.equal(unconfiguredSend.status, 400);

    // Configure Resend
    const mailSave = await fetch(`${base1}/user-api/admin/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        resendApiKey: 're_live_ann_secret_5555',
        mailFrom: '高词 · GoPrmpt <noreply@goprmpt.com>',
      }),
    });
    assert.equal(mailSave.status, 200);

    // Broadcast when no active bound-email users -> 400
    const noUsersSend = await fetch(
      `${base1}/user-api/admin/announcements/${ann1.id}/send-email`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: '{}',
      },
    );
    assert.equal(noUsersSend.status, 400);
    assert.equal((await noUsersSend.json()).error, '当前没有已绑定邮箱的活跃用户可推送');

    // Invalid testTo -> 400 (must NOT broadcast)
    const badTestTo = await fetch(
      `${base1}/user-api/admin/announcements/${ann1.id}/send-email`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ testTo: 'invalid-email' }),
      },
    );
    assert.equal(badTestTo.status, 400);

    const emptyTestTo = await fetch(
      `${base1}/user-api/admin/announcements/${ann1.id}/send-email`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ testTo: '   ' }),
      },
    );
    assert.equal(emptyTestTo.status, 400);
    assert.equal(sentEmails.length, 0);

    // Valid testTo sends ONLY to [testTo] and does NOT mutate emailedAt / emailedCount
    const testSend = await fetch(
      `${base1}/user-api/admin/announcements/${ann1.id}/send-email`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ testTo: 'Preview@Example.com' }),
      },
    );
    assert.equal(testSend.status, 200);
    assert.deepEqual(await testSend.json(), {
      ok: true,
      mode: 'test',
      sent: 1,
      failed: 0,
      total: 1,
      to: 'preview@example.com',
    });
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].authHeader, 'Bearer re_live_ann_secret_5555');
    assert.deepEqual(sentEmails[0].payload.to, ['preview@example.com']);
    assert.match(sentEmails[0].payload.subject, /活动公告/);
    assert.match(sentEmails[0].payload.html, /#FAF9F5/);
    assert.match(sentEmails[0].payload.html, /#0F766E/);
    assert.match(sentEmails[0].payload.html, /活动公告/);
    assert.equal(sentEmails[0].payload.html.includes('<script>'), false);
    assert.ok(sentEmails[0].payload.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;<br />第二行'));
    assert.ok(sentEmails[0].payload.html.includes('href="https://goprmpt.com/spring?ref=mail"'));
    assert.ok(sentEmails[0].payload.html.includes('立即参与'));

    const afterTestCheck = await fetch(`${base1}/user-api/admin/announcements`, {
      headers: { Cookie: adminCookie },
    });
    const annAfterTest = (await afterTestCheck.json()).announcements.find((a) => a.id === ann1.id);
    assert.equal(annAfterTest.emailedAt, null);
    assert.equal(annAfterTest.emailedCount, 0);

    // Register 4 users: 2 active with email, 1 active without email, 1 disabled with email
    await fetch(`${base1}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'u_alpha', email: 'alpha@example.com', password: 'Password123!' }),
    });
    await fetch(`${base1}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'u_beta', email: 'beta@example.com', password: 'Password123!' }),
    });
    await fetch(`${base1}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'u_noemail', password: 'Password123!' }),
    });
    const disabledReg = await fetch(`${base1}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'u_disabled', email: 'disabled@example.com', password: 'Password123!' }),
    });
    const { user: disabledUser } = await disabledReg.json();
    await fetch(`${base1}/user-api/admin/users/${disabledUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ disabled: true }),
    });

    // emailableUsersCount should be exactly 2
    const beforeBroadcast = await fetch(`${base1}/user-api/admin/announcements`, {
      headers: { Cookie: adminCookie },
    });
    const beforeBroadcastBody = await beforeBroadcast.json();
    assert.equal(beforeBroadcastBody.emailableUsersCount, 2);
    assert.equal(beforeBroadcastBody.emailEnabled, true);

    // Broadcast sends sequentially to ONLY alpha and beta
    sentEmails.length = 0;
    const broadcastRes = await fetch(
      `${base1}/user-api/admin/announcements/${ann1.id}/send-email`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: '{}',
      },
    );
    assert.equal(broadcastRes.status, 200);
    const broadcastBody = await broadcastRes.json();
    assert.equal(broadcastBody.ok, true);
    assert.equal(broadcastBody.mode, 'broadcast');
    assert.equal(broadcastBody.sent, 2);
    assert.equal(broadcastBody.failed, 0);
    assert.equal(broadcastBody.total, 2);
    assert.equal(broadcastBody.announcement.emailedCount, 2);
    assert.equal(typeof broadcastBody.announcement.emailedAt, 'number');
    assert.deepEqual(
      sentEmails.map((e) => e.payload.to[0]),
      ['alpha@example.com', 'beta@example.com'],
    );

    // Partial failure test on a second announcement without linkUrl (verifies no CTA button)
    const createRes2 = await fetch(`${base1}/user-api/admin/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        title: '系统维护通知',
        content: '预计维护 10 分钟',
        type: 'maintenance',
      }),
    });
    const { announcement: ann2 } = await createRes2.json();

    sentEmails.length = 0;
    failRecipientEmail = 'beta@example.com';
    const partialRes = await fetch(
      `${base1}/user-api/admin/announcements/${ann2.id}/send-email`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: '{}',
      },
    );
    assert.equal(partialRes.status, 200);
    const partialBody = await partialRes.json();
    assert.equal(partialBody.sent, 1);
    assert.equal(partialBody.failed, 1);
    assert.equal(partialBody.total, 2);
    assert.equal(partialBody.announcement.emailedCount, 1);
    assert.equal(typeof partialBody.announcement.emailedAt, 'number');
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].payload.html.includes('查看详情'), false);
    failRecipientEmail = null;

    // Restart server on the same DB file and verify announcements & emailed stats persist
    await app1.close();
    app1 = null;

    app2 = createApp(loadConfig(env), { fetchImpl: mockFetch });
    const addr2 = await app2.listen();
    const base2 = `http://${addr2.host}:${addr2.port}`;

    const activeAfterRestart = await fetch(`${base2}/user-api/announcements/active`);
    assert.equal(activeAfterRestart.status, 200);
    const { announcements: persisted } = await activeAfterRestart.json();
    assert.equal(persisted.length, 2);
    assert.equal(persisted[0].id, ann1.id);
    assert.equal(persisted[0].emailedCount, 2);
    assert.equal(persisted[0].emailedAt, broadcastBody.announcement.emailedAt);
    assert.equal(persisted[0].linkUrl, 'https://goprmpt.com/spring?ref=mail');
    assert.equal(persisted[1].id, ann2.id);
    assert.equal(persisted[1].emailedCount, 1);
    assert.equal(persisted[1].emailedAt, partialBody.announcement.emailedAt);
  } finally {
    if (app1) await app1.close();
    if (app2) await app2.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});


test('legacy prod DB migration from CHECK (tier IN (free, pro)) preserves users & sync blobs and enables 4 tiers + credits', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { hashPassword } = await import('../src/crypto.js');
  const tmpDir = makeTempDir();
  const dbPath = path.join(tmpDir, 'legacy-prod', 'users.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const now = Date.now();
  const existingUserId = 'legacy-user-001';
  const legacyDb = new DatabaseSync(dbPath);
  legacyDb.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (
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
    CREATE UNIQUE INDEX idx_users_email_unique
      ON users(email)
      WHERE email IS NOT NULL AND email != '';
    CREATE TABLE user_sync_blobs (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      payload_json TEXT NOT NULL,
      version INTEGER NOT NULL,
      bytes INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  legacyDb
    .prepare(
      `INSERT INTO users (id, username, email, password_hash, role, tier, tier_expires_at, disabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'user', 'pro', NULL, 0, ?, ?)`,
    )
    .run(existingUserId, 'legacy_pro', 'legacy@example.com', hashPassword('LegacyPass123!'), now, now);
  const blobJson = JSON.stringify({ favorites: [{ id: 'keep-1', title: '保留收藏' }] });
  legacyDb
    .prepare(
      `INSERT INTO user_sync_blobs (user_id, payload_json, version, bytes, updated_at)
       VALUES (?, ?, 7, ?, ?)`,
    )
    .run(existingUserId, blobJson, Buffer.byteLength(blobJson, 'utf8'), now);
  legacyDb.close();

  const env = {
    USER_SYNC_HOST: '127.0.0.1',
    USER_SYNC_PORT: '0',
    USER_SYNC_DB_PATH: dbPath,
    ADMIN_USERNAME: 'root_admin',
    ADMIN_PASSWORD: 'AdminPassword123!',
    RATE_LIMIT_MAX: '50',
    RATE_LIMIT_WINDOW_MS: '60000',
  };

  let app1 = createApp(loadConfig(env));
  let app2 = null;
  try {
    const addr1 = await app1.listen();
    const base1 = `http://${addr1.host}:${addr1.port}`;

    // Verify table SQL upgraded and foreign keys remain completely valid
    const schemaRow = app1.db.raw
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
      .get();
    assert.ok(schemaRow.sql.includes("'standard'"));
    assert.ok(schemaRow.sql.includes("'internal'"));
    assert.deepEqual(app1.db.raw.prepare('PRAGMA foreign_key_check').all(), []);

    // Migrated user logs in, receives monthly pro credits, and keeps exact sync blob
    const userLogin = await fetch(`${base1}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'legacy_pro', password: 'LegacyPass123!' }),
    });
    assert.equal(userLogin.status, 200);
    const userCookie = extractCookieHeader(userLogin);
    const userLoginBody = await userLogin.json();
    assert.equal(userLoginBody.user.id, existingUserId);
    assert.equal(userLoginBody.user.email, 'legacy@example.com');
    assert.equal(userLoginBody.user.tier, 'pro');
    assert.equal(userLoginBody.user.effectiveTier, 'pro');
    assert.equal(userLoginBody.user.creditBalance, 500);

    const syncRes = await fetch(`${base1}/user-api/sync`, {
      headers: { Cookie: userCookie },
    });
    assert.equal(syncRes.status, 200);
    const syncBody = await syncRes.json();
    assert.equal(syncBody.version, 7);
    assert.deepEqual(syncBody.data, { favorites: [{ id: 'keep-1', title: '保留收藏' }] });

    // Admin can now assign standard and internal tiers without CHECK constraint failure
    const adminLogin = await fetch(`${base1}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'root_admin', password: 'AdminPassword123!' }),
    });
    const adminCookie = extractCookieHeader(adminLogin);

    const toStd = await fetch(`${base1}/user-api/admin/users/${existingUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ tier: 'standard', tierExpiresAt: Date.now() + 86_400_000 }),
    });
    assert.equal(toStd.status, 200);
    assert.equal((await toStd.json()).user.tier, 'standard');

    const toInternal = await fetch(`${base1}/user-api/admin/users/${existingUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ tier: 'internal', tierExpiresAt: null }),
    });
    assert.equal(toInternal.status, 200);
    const internalBody = await toInternal.json();
    assert.equal(internalBody.user.tier, 'internal');
    assert.equal(internalBody.user.creditBalance, 1000);

    // Reopen migrated DB cleanly (migration is idempotent)
    await app1.close();
    app1 = null;
    app2 = createApp(loadConfig(env));
    const addr2 = await app2.listen();
    const base2 = `http://${addr2.host}:${addr2.port}`;

    const syncAfterRestart = await fetch(`${base2}/user-api/sync`, {
      headers: { Cookie: userCookie },
    });
    assert.equal(syncAfterRestart.status, 200);
    assert.equal((await syncAfterRestart.json()).version, 7);
  } finally {
    if (app1) await app1.close();
    if (app2) await app2.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('4-tier monthly credits config, idempotent monthly grants, mid-month upgrade diff top-up, and manual adjust', async () => {
  const tmpDir = makeTempDir();
  const dbPath = path.join(tmpDir, 'credits', 'users.db');
  const env = {
    USER_SYNC_HOST: '127.0.0.1',
    USER_SYNC_PORT: '0',
    USER_SYNC_DB_PATH: dbPath,
    ADMIN_USERNAME: 'root_admin',
    ADMIN_PASSWORD: 'AdminPassword123!',
    RATE_LIMIT_MAX: '100',
    RATE_LIMIT_WINDOW_MS: '60000',
  };

  let app1 = createApp(loadConfig(env));
  let app2 = null;
  try {
    const addr1 = await app1.listen();
    const base1 = `http://${addr1.host}:${addr1.port}`;

    const adminLogin = await fetch(`${base1}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'root_admin', password: 'AdminPassword123!' }),
    });
    assert.equal(adminLogin.status, 200);
    const adminCookie = extractCookieHeader(adminLogin);
    const adminLoginBody = await adminLogin.json();
    // Admin has effectiveTier 'internal' and receives internal monthly credits (1000)
    assert.equal(adminLoginBody.user.effectiveTier, 'internal');
    assert.equal(adminLoginBody.user.creditBalance, 1000);

    // Invalid monthlyCredits patches rejected -> 400
    for (const badCredits of [
      { standard: -1 },
      { pro: 1.5 },
      { internal: 1_000_001 },
      { ultra: 999 },
      {},
    ]) {
      const badRes = await fetch(`${base1}/user-api/admin/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ monthlyCredits: badCredits }),
      });
      assert.equal(badRes.status, 400, `expected 400 for ${JSON.stringify(badCredits)}`);
    }

    // Update monthly credits and verify persistence across restart
    const updateCredits = await fetch(`${base1}/user-api/admin/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ monthlyCredits: { standard: 120, pro: 600 } }),
    });
    assert.equal(updateCredits.status, 200);
    assert.deepEqual((await updateCredits.json()).monthlyCredits, {
      free: 0,
      standard: 120,
      pro: 600,
      internal: 1000,
    });

    await app1.close();
    app1 = null;
    app2 = createApp(loadConfig(env));
    const addr2 = await app2.listen();
    const base2 = `http://${addr2.host}:${addr2.port}`;

    const cfgAfterRestart = await (await fetch(`${base2}/user-api/config`)).json();
    assert.deepEqual(cfgAfterRestart.monthlyCredits, {
      free: 0,
      standard: 120,
      pro: 600,
      internal: 1000,
    });

    // Register normal user (free -> 0 credits)
    const regRes = await fetch(`${base2}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'credit_user', password: 'Password123!' }),
    });
    assert.equal(regRes.status, 201);
    const userCookie = extractCookieHeader(regRes);
    const { user } = await regRes.json();
    assert.equal(user.creditBalance, 0);
    assert.equal(user.effectiveTier, 'free');

    // Upgrade free -> standard (+30d): grants 120 immediately
    const upStd = await fetch(`${base2}/user-api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ tier: 'standard', tierExpiresAt: Date.now() + 30 * 86_400_000 }),
    });
    assert.equal(upStd.status, 200);
    assert.equal((await upStd.json()).user.creditBalance, 120);

    // Repeated /me and /credits in the same month are idempotent (still 120)
    await fetch(`${base2}/user-api/me`, { headers: { Cookie: userCookie } });
    const cred1 = await (await fetch(`${base2}/user-api/credits`, { headers: { Cookie: userCookie } })).json();
    assert.equal(cred1.balance, 120);
    assert.equal(cred1.effectiveTier, 'standard');
    assert.equal(cred1.monthlyAllowance, 120);
    assert.equal(cred1.grantedThisMonth, 120);
    assert.equal(cred1.ledger.length, 1);

    // Mid-month upgrade standard -> pro: tops up diff (600 - 120 = +480)
    const upPro = await fetch(`${base2}/user-api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ tier: 'pro', tierExpiresAt: Date.now() + 30 * 86_400_000 }),
    });
    assert.equal(upPro.status, 200);
    assert.equal((await upPro.json()).user.creditBalance, 600);

    // Mid-month upgrade pro -> internal: tops up diff (1000 - 600 = +400)
    const upInt = await fetch(`${base2}/user-api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ tier: 'internal', tierExpiresAt: null }),
    });
    assert.equal(upInt.status, 200);
    assert.equal((await upInt.json()).user.creditBalance, 1000);

    // Downgrade internal -> standard: NEVER deducts credits, re-upgrade does NOT double grant
    const downStd = await fetch(`${base2}/user-api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ tier: 'standard', tierExpiresAt: Date.now() + 30 * 86_400_000 }),
    });
    assert.equal(downStd.status, 200);
    assert.equal((await downStd.json()).user.creditBalance, 1000);

    const reUpInt = await fetch(`${base2}/user-api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ tier: 'internal', tierExpiresAt: null }),
    });
    assert.equal(reUpInt.status, 200);
    assert.equal((await reUpInt.json()).user.creditBalance, 1000);

    // Simulate next month rollover -> grants fresh 1000 credits
    app2.db.raw
      .prepare("UPDATE users SET last_credit_grant_month = '2020-01' WHERE id = ?")
      .run(user.id);
    const nextMonthCredits = await (
      await fetch(`${base2}/user-api/credits`, { headers: { Cookie: userCookie } })
    ).json();
    assert.equal(nextMonthCredits.balance, 2000);
    assert.equal(nextMonthCredits.ledger[0].reason, 'monthly_grant');
    assert.equal(nextMonthCredits.ledger[0].delta, 1000);

    // Admin manual credit adjust: non-admin 403, +50, -200, reject negative -> 400
    const nonAdminAdj = await fetch(`${base2}/user-api/admin/users/${user.id}/credits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({ delta: 50 }),
    });
    assert.equal(nonAdminAdj.status, 403);

    const zeroAdj = await fetch(`${base2}/user-api/admin/users/${user.id}/credits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ delta: 0 }),
    });
    assert.equal(zeroAdj.status, 400);

    const addAdj = await fetch(`${base2}/user-api/admin/users/${user.id}/credits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ delta: 50, note: '活动补偿' }),
    });
    assert.equal(addAdj.status, 200);
    assert.equal((await addAdj.json()).creditBalance, 2050);

    const subAdj = await fetch(`${base2}/user-api/admin/users/${user.id}/credits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ delta: -200, note: '手动核减' }),
    });
    assert.equal(subAdj.status, 200);
    assert.equal((await subAdj.json()).creditBalance, 1850);

    const negAdj = await fetch(`${base2}/user-api/admin/users/${user.id}/credits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ delta: -9999 }),
    });
    assert.equal(negAdj.status, 400);

    // Expired tier user falls back to free effectiveTier
    const regExpired = await fetch(`${base2}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'expired_user', password: 'Password123!' }),
    });
    const expiredCookie = extractCookieHeader(regExpired);
    const { user: expUser } = await regExpired.json();
    await fetch(`${base2}/user-api/admin/users/${expUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ tier: 'pro', tierExpiresAt: Date.now() - 60_000 }),
    });
    const expMe = await (await fetch(`${base2}/user-api/me`, { headers: { Cookie: expiredCookie } })).json();
    assert.equal(expMe.user.tier, 'pro');
    assert.equal(expMe.user.effectiveTier, 'free');
    assert.equal(expMe.user.creditBalance, 0);
  } finally {
    if (app1) await app1.close();
    if (app2) await app2.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('platform models CRUD, key masking, test endpoint, tier gate 403, 402 credits, non-stream & SSE stream proxy, and auto-refund on 500', async () => {
  const tmpDir = makeTempDir();
  const dbPath = path.join(tmpDir, 'platform-models', 'users.db');
  const upstreamCalls = [];
  let nextUpstreamMode = 'ok-json';

  const mockFetch = async (url, init) => {
    const authHeader = init?.headers?.Authorization || '';
    const body = JSON.parse(String(init?.body || '{}'));
    upstreamCalls.push({ url, authHeader, body });

    if (nextUpstreamMode === 'fail-500') {
      return new Response(
        JSON.stringify({
          error: { message: 'Upstream overloaded with key sk-platform-secret-123456789' },
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (nextUpstreamMode === 'sse') {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode('data: {"id":"cmpl-1","choices":[{"delta":{"content":"你好"}}]}\n\n'),
          );
          controller.enqueue(
            encoder.encode('data: {"id":"cmpl-1","choices":[{"delta":{"content":"世界"}}]}\n\n'),
          );
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      });
    }

    return new Response(
      JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        model: body.model,
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hello from upstream!' } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const app = createApp(
    loadConfig({
      USER_SYNC_HOST: '127.0.0.1',
      USER_SYNC_PORT: '0',
      USER_SYNC_DB_PATH: dbPath,
      ADMIN_USERNAME: 'root_admin',
      ADMIN_PASSWORD: 'AdminPassword123!',
      RATE_LIMIT_MAX: '100',
      RATE_LIMIT_WINDOW_MS: '60000',
    }),
    { fetchImpl: mockFetch },
  );

  try {
    const addr = await app.listen();
    const baseUrl = `http://${addr.host}:${addr.port}`;

    // Register normal user and login as admin
    const regRes = await fetch(`${baseUrl}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'std_member', password: 'Password123!' }),
    });
    const userCookie = extractCookieHeader(regRes);
    const { user: stdUser } = await regRes.json();

    const adminLogin = await fetch(`${baseUrl}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'root_admin', password: 'AdminPassword123!' }),
    });
    const adminCookie = extractCookieHeader(adminLogin);

    // Upgrade std_member to standard (+100 credits)
    await fetch(`${baseUrl}/user-api/admin/users/${stdUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ tier: 'standard', tierExpiresAt: Date.now() + 30 * 86_400_000 }),
    });

    // Non-admin blocked from admin platform-models routes -> 403
    const nonAdminCreate = await fetch(`${baseUrl}/user-api/admin/platform-models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({ name: 'x' }),
    });
    assert.equal(nonAdminCreate.status, 403);

    // Reject bad URL and prototype pollution in defaultParams
    const badProto = await fetch(`${baseUrl}/user-api/admin/platform-models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: '{"name":"Bad","baseUrl":"https://api.example.com/v1","apiKey":"sk-1","upstreamModel":"m","defaultParams":{"__proto__":{"x":1}}}',
    });
    assert.equal(badProto.status, 400);

    const badUrl = await fetch(`${baseUrl}/user-api/admin/platform-models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        name: 'BadUrl',
        baseUrl: 'javascript:alert(1)',
        apiKey: 'sk-1',
        upstreamModel: 'm',
      }),
    });
    assert.equal(badUrl.status, 400);

    // Create 3 models: standard model, pro model (auto slug), disabled model
    const createStd = await fetch(`${baseUrl}/user-api/admin/platform-models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        id: 'platform-deepseek-v3',
        name: 'DeepSeek V3 平台版',
        providerLabel: 'DeepSeek 平台',
        baseUrl: 'https://api.deepseek.example/v1/',
        apiKey: 'sk-platform-secret-123456789',
        upstreamModel: 'deepseek-chat',
        creditCost: 10,
        minTier: 'standard',
        defaultParams: { temperature: 0.6, enable_thinking: false },
        applyUrl: 'https://platform.deepseek.com/?ref=goprmpt',
        description: '中文优化主力',
        sortOrder: 1,
        enabled: true,
      }),
    });
    assert.equal(createStd.status, 201);
    const { model: stdModel } = await createStd.json();
    assert.equal(stdModel.id, 'platform-deepseek-v3');
    assert.equal(stdModel.apiKeyHint, 'sk-p••••6789');
    assert.equal(stdModel.hasApiKey, true);
    assert.equal('apiKey' in stdModel, false);
    assert.equal(JSON.stringify(stdModel).includes('sk-platform-secret-123456789'), false);

    const createPro = await fetch(`${baseUrl}/user-api/admin/platform-models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        name: 'Qwen3 Max 专业版',
        baseUrl: 'https://dashscope.example/compatible-mode/v1',
        apiKey: 'sk-pro-secret-99998888',
        upstreamModel: 'qwen3-max',
        creditCost: 25,
        minTier: 'pro',
        sortOrder: 2,
      }),
    });
    assert.equal(createPro.status, 201);
    const { model: proModel } = await createPro.json();
    assert.match(proModel.id, /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}$/);

    const createDisabled = await fetch(`${baseUrl}/user-api/admin/platform-models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        id: 'disabled-model',
        name: '已停用模型',
        baseUrl: 'https://disabled.example/v1',
        apiKey: 'sk-disabled-123456',
        upstreamModel: 'x',
        enabled: false,
      }),
    });
    assert.equal(createDisabled.status, 201);

    // PATCH with empty apiKey keeps existing stored key intact
    const patchKeepKey = await fetch(`${baseUrl}/user-api/admin/platform-models/${stdModel.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ description: '已更新说明', apiKey: '' }),
    });
    assert.equal(patchKeepKey.status, 200);
    const patchedModel = (await patchKeepKey.json()).model;
    assert.equal(patchedModel.description, '已更新说明');
    assert.equal(patchedModel.apiKeyHint, 'sk-p••••6789');

    // Admin list never returns plaintext key
    const adminList = await (
      await fetch(`${baseUrl}/user-api/admin/platform-models`, { headers: { Cookie: adminCookie } })
    ).json();
    assert.equal(adminList.models.length, 3);
    assert.equal(JSON.stringify(adminList).includes('sk-platform-secret-123456789'), false);

    // Connectivity test endpoint
    upstreamCalls.length = 0;
    const testRes = await fetch(`${baseUrl}/user-api/admin/platform-models/${stdModel.id}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: '{}',
    });
    assert.equal(testRes.status, 200);
    const testBody = await testRes.json();
    assert.equal(testBody.ok, true);
    assert.equal(testBody.upstreamModel, 'deepseek-chat');
    assert.equal(testBody.replyPreview, 'Hello from upstream!');
    assert.equal(upstreamCalls.length, 1);
    assert.equal(upstreamCalls[0].url, 'https://api.deepseek.example/v1/chat/completions');
    assert.equal(upstreamCalls[0].authHeader, 'Bearer sk-platform-secret-123456789');
    assert.equal(upstreamCalls[0].body.enable_thinking, false);
    assert.equal(upstreamCalls[0].body.max_tokens, 16);

    // Public /platform-models strips secrets & baseUrl and excludes disabled
    const anonModels = await (await fetch(`${baseUrl}/user-api/platform-models`)).json();
    assert.equal(anonModels.models.length, 2);
    assert.equal('apiKey' in anonModels.models[0], false);
    assert.equal('apiKeyHint' in anonModels.models[0], false);
    assert.equal('baseUrl' in anonModels.models[0], false);
    assert.equal(anonModels.models[0].accessible, false);
    assert.equal(anonModels.models[0].accessReason, 'login_required');

    const stdPublicModels = await (
      await fetch(`${baseUrl}/user-api/platform-models`, { headers: { Cookie: userCookie } })
    ).json();
    const pubStd = stdPublicModels.models.find((m) => m.id === stdModel.id);
    const pubPro = stdPublicModels.models.find((m) => m.id === proModel.id);
    assert.equal(pubStd.accessible, true);
    assert.equal(pubStd.accessReason, null);
    assert.equal(pubPro.accessible, false);
    assert.equal(pubPro.accessReason, 'tier_required');

    // OpenAI /ai/v1/models lists ONLY accessible enabled models
    const aiModelsStd = await (
      await fetch(`${baseUrl}/user-api/ai/v1/models`, { headers: { Cookie: userCookie } })
    ).json();
    assert.equal(aiModelsStd.object, 'list');
    assert.deepEqual(
      aiModelsStd.data.map((m) => m.id),
      [stdModel.id],
    );

    const aiModelsAdmin = await (
      await fetch(`${baseUrl}/user-api/ai/v1/models`, { headers: { Cookie: adminCookie } })
    ).json();
    assert.equal(aiModelsAdmin.data.length, 2);

    // Tier gate 403 when standard user calls pro model
    const tierGateRes = await fetch(`${baseUrl}/user-api/ai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({
        model: proModel.id,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    assert.equal(tierGateRes.status, 403);
    assert.match((await tierGateRes.json()).error, /专业会员/);

    // Disabled model -> 404
    const disabledCall = await fetch(`${baseUrl}/user-api/ai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ model: 'disabled-model', messages: [{ role: 'user', content: 'hi' }] }),
    });
    assert.equal(disabledCall.status, 404);

    // Non-streaming proxy merges defaultParams, forces upstream model, deducts 10 credits & returns headers
    upstreamCalls.length = 0;
    const extOrigin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
    const chatRes = await fetch(`${baseUrl}/user-api/ai/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userCookie,
        Origin: extOrigin,
      },
      body: JSON.stringify({
        model: stdModel.id,
        temperature: 0.9,
        messages: [{ role: 'user', content: '优化提示词' }],
      }),
    });
    assert.equal(chatRes.status, 200);
    assert.equal(chatRes.headers.get('x-goprmpt-credits-remaining'), '90');
    assert.equal(chatRes.headers.get('x-goprmpt-credits-cost'), '10');
    assert.match(
      chatRes.headers.get('access-control-expose-headers') || '',
      /X-GoPrmpt-Credits-Remaining/,
    );
    assert.match(chatRes.headers.get('access-control-allow-methods') || '', /DELETE/);
    const chatBody = await chatRes.json();
    assert.equal(chatBody.choices[0].message.content, 'Hello from upstream!');
    assert.equal(upstreamCalls.length, 1);
    assert.equal(upstreamCalls[0].body.model, 'deepseek-chat');
    assert.equal(upstreamCalls[0].body.temperature, 0.9);
    assert.equal(upstreamCalls[0].body.enable_thinking, false);

    // SSE streaming proxy streams chunks and deducts 10 credits (90 -> 80)
    nextUpstreamMode = 'sse';
    const sseRes = await fetch(`${baseUrl}/user-api/ai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({
        model: stdModel.id,
        stream: true,
        messages: [{ role: 'user', content: '流式测试' }],
      }),
    });
    assert.equal(sseRes.status, 200);
    assert.match(sseRes.headers.get('content-type') || '', /text\/event-stream/);
    assert.equal(sseRes.headers.get('x-goprmpt-credits-remaining'), '80');
    assert.equal(sseRes.headers.get('x-goprmpt-credits-cost'), '10');
    const sseText = await sseRes.text();
    assert.ok(sseText.includes('你好'));
    assert.ok(sseText.includes('世界'));
    assert.ok(sseText.includes('[DONE]'));

    // Upstream 500 error automatically refunds 10 credits (remains 80) and scrubs secret
    nextUpstreamMode = 'fail-500';
    const failRes = await fetch(`${baseUrl}/user-api/ai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({
        model: stdModel.id,
        messages: [{ role: 'user', content: '触发故障' }],
      }),
    });
    assert.equal(failRes.status, 500);
    const failBody = await failRes.json();
    assert.equal(failBody.error.includes('sk-platform-secret-123456789'), false);

    const creditsAfterRefund = await (
      await fetch(`${baseUrl}/user-api/credits`, { headers: { Cookie: userCookie } })
    ).json();
    assert.equal(creditsAfterRefund.balance, 80);
    assert.equal(creditsAfterRefund.ledger[0].reason, 'usage_refund');
    assert.equal(creditsAfterRefund.ledger[0].delta, 10);
    assert.equal(creditsAfterRefund.ledger[1].reason, 'usage_debit');
    assert.equal(creditsAfterRefund.ledger[1].delta, -10);

    // Insufficient credits -> 402 and upstream is NOT called
    await fetch(`${baseUrl}/user-api/admin/users/${stdUser.id}/credits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ delta: -75, note: '扣减至 5 积分测试' }),
    });
    nextUpstreamMode = 'ok-json';
    upstreamCalls.length = 0;
    const lowCreditRes = await fetch(`${baseUrl}/user-api/ai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({
        model: stdModel.id,
        messages: [{ role: 'user', content: '余额不足' }],
      }),
    });
    assert.equal(lowCreditRes.status, 402);
    const lowCreditBody = await lowCreditRes.json();
    assert.equal(lowCreditBody.balance, 5);
    assert.equal(lowCreditBody.required, 10);
    assert.equal(upstreamCalls.length, 0);

    // Delete platform model -> 200, second delete -> 404
    const delModel = await fetch(`${baseUrl}/user-api/admin/platform-models/${proModel.id}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    });
    assert.equal(delModel.status, 200);
    const delModelAgain = await fetch(`${baseUrl}/user-api/admin/platform-models/${proModel.id}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    });
    assert.equal(delModelAgain.status, 404);
  } finally {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('domestic model presets GET/PATCH, promo links with query params, XSS rejection, and upgraded admin HTML controls', async () => {
  const ctx = await startTestApp();
  try {
    // Public /model-presets works without auth and returns exact 10 providers in order (SiliconFlow #1)
    const initPublic = await fetch(`${ctx.baseUrl}/user-api/model-presets`);
    assert.equal(initPublic.status, 200);
    const { presets: initPresets } = await initPublic.json();
    assert.deepEqual(
      initPresets.map((p) => p.providerId),
      [
        'siliconflow',
        'deepseek',
        'dashscope',
        'zhipu',
        'modelscope',
        'minimax',
        'xiaomi-mimo-token-plan',
        'seedream',
        'ollama',
        'openai-compatible',
      ],
    );
    assert.equal(initPresets[0].providerId, 'siliconflow');
    assert.equal(initPresets[0].featured, true);
    assert.equal(initPresets[0].applyUrl, 'https://cloud.siliconflow.cn/account/ak');
    assert.equal(initPresets[0].applyLabel, '主推 · 申请领免费额度');
    const initDeepseek = initPresets.find((p) => p.providerId === 'deepseek');
    const initOllama = initPresets.find((p) => p.providerId === 'ollama');
    assert.equal(initDeepseek.featured, false);
    assert.equal(initDeepseek.applyUrl, 'https://platform.deepseek.com/api_keys');
    assert.equal(initDeepseek.customApplyUrl, null);
    assert.equal(initDeepseek.applyLabel, '申请 API Key');
    assert.equal(initOllama.applyUrl, null);
    assert.equal(initOllama.featured, false);

    // Non-admin blocked from admin preset endpoints -> 403
    const userReg = await fetch(`${ctx.baseUrl}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'preset_user', password: 'Password123!' }),
    });
    const userCookie = extractCookieHeader(userReg);
    const nonAdminPresetGet = await fetch(`${ctx.baseUrl}/user-api/admin/model-presets`, {
      headers: { Cookie: userCookie },
    });
    assert.equal(nonAdminPresetGet.status, 403);

    // Login as admin
    const adminLogin = await fetch(`${ctx.baseUrl}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'root_admin', password: 'AdminPassword123!' }),
    });
    const adminCookie = extractCookieHeader(adminLogin);

    // Unknown providerId -> 404
    const unknownPatch = await fetch(`${ctx.baseUrl}/user-api/admin/model-presets/nonexistent`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(unknownPatch.status, 404);

    // Reject javascript: / data: URLs and invalid defaultParams -> 400
    for (const badBody of [
      JSON.stringify({ applyUrl: 'javascript:alert(1)' }),
      JSON.stringify({ customApplyUrl: 'data:text/html,<script>1</script>' }),
      '{"defaultParams":{"__proto__":{"bad":1}}}',
      JSON.stringify({}),
    ]) {
      const badRes = await fetch(`${ctx.baseUrl}/user-api/admin/model-presets/deepseek`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: badBody,
      });
      assert.equal(badRes.status, 400);
    }

    // Update deepseek with affiliate/promo link (with query params), label, defaultModelId & defaultParams
    const promoUrl = 'https://platform.deepseek.com/sign_up?ref=goprmpt_vip&channel=web';
    const patch1 = await fetch(`${ctx.baseUrl}/user-api/admin/model-presets/deepseek`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        applyUrl: promoUrl,
        applyLabel: '领取免费额度',
        defaultModelId: 'deepseek-reasoner',
        defaultParams: { temperature: 0.5, max_tokens: 4096, enable_thinking: true },
      }),
    });
    assert.equal(patch1.status, 200);
    const { preset: updated1 } = await patch1.json();
    assert.equal(updated1.applyUrl, promoUrl);
    assert.equal(updated1.customApplyUrl, promoUrl);
    assert.equal(updated1.defaultApplyUrl, 'https://platform.deepseek.com/api_keys');
    assert.equal(updated1.applyLabel, '领取免费额度');
    assert.equal(updated1.defaultModelId, 'deepseek-reasoner');
    assert.deepEqual(updated1.defaultParams, {
      temperature: 0.5,
      max_tokens: 4096,
      enable_thinking: true,
    });
    assert.equal(updated1.enabled, true);

    // Partial PATCH preserves previously saved fields
    const patch2 = await fetch(`${ctx.baseUrl}/user-api/admin/model-presets/deepseek`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(patch2.status, 200);
    const { preset: updated2 } = await patch2.json();
    assert.equal(updated2.enabled, false);
    assert.equal(updated2.applyUrl, promoUrl);
    assert.equal(updated2.defaultModelId, 'deepseek-reasoner');
    assert.deepEqual(updated2.defaultParams, {
      temperature: 0.5,
      max_tokens: 4096,
      enable_thinking: true,
    });

    // Clearing custom applyUrl falls back cleanly to defaultApplyUrl
    const patchResetUrl = await fetch(`${ctx.baseUrl}/user-api/admin/model-presets/deepseek`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ applyUrl: '', enabled: true }),
    });
    assert.equal(patchResetUrl.status, 200);
    const { preset: resetPreset } = await patchResetUrl.json();
    assert.equal(resetPreset.customApplyUrl, null);
    assert.equal(resetPreset.applyUrl, 'https://platform.deepseek.com/api_keys');
    assert.equal(resetPreset.enabled, true);

    // Public /model-presets matches admin state
    const pubAfter = await (await fetch(`${ctx.baseUrl}/user-api/model-presets`)).json();
    const adminAfter = await (
      await fetch(`${ctx.baseUrl}/user-api/admin/model-presets`, { headers: { Cookie: adminCookie } })
    ).json();
    assert.deepEqual(pubAfter.presets, adminAfter.presets);

    // Verify upgraded admin console HTML renders all new cards, 4-tier controls, zero em dashes, and valid JS
    const adminHtmlRes = await fetch(`${ctx.baseUrl}/user-api/admin`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(adminHtmlRes.status, 200);
    const html = await adminHtmlRes.text();
    assert.match(html, /id="platformModelsCard"/);
    assert.match(html, /id="modelPresetsCard"/);
    assert.match(html, /id="creditsFreeInput"/);
    assert.match(html, /id="creditsStandardInput"/);
    assert.match(html, /id="creditsProInput"/);
    assert.match(html, /id="creditsInternalInput"/);
    assert.match(html, /保存积分设置/);
    assert.match(html, /设为标准\+30天/);
    assert.match(html, /设为专业\+30天/);
    assert.match(html, /设为内部\(永久\)/);
    assert.match(html, /调积分/);
    assert.equal(html.includes('普通用户'), false, 'admin user table should not render conflicting 普通用户 badge next to membership tier');
    assert.equal(html.includes('—'), false, 'admin UI copy should not contain em dashes');
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch);
    assert.doesNotThrow(() => new Function(scriptMatch[1]));

    // Verify GET /user-api/admin/users ensures active members have received current-month credits
    const legacyProRow = ctx.app.db.createUser({
      username: 'preexisting_pro',
      passwordHash: ctx.app.db.findUserByUsername('root_admin').password_hash,
      role: 'user',
    });
    ctx.app.db.updateUserAdmin(legacyProRow.id, {
      tier: 'pro',
      tierExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
    const listUsersRes = await fetch(`${ctx.baseUrl}/user-api/admin/users`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(listUsersRes.status, 200);
    const { users: listedUsers } = await listUsersRes.json();
    const listedLegacyPro = listedUsers.find((u) => u.username === 'preexisting_pro');
    assert.equal(listedLegacyPro.tier, 'pro');
    assert.equal(listedLegacyPro.creditBalance, 500);
  } finally {
    await ctx.cleanup();
  }
});

test('announcement comments public read/CORS, member posting/validation, delete permissions, cascade, SiliconFlow #1 & admin UI', async () => {
  const ctx = await startTestApp();
  try {
    // Login as admin
    const adminLogin = await fetch(`${ctx.baseUrl}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'root_admin', password: 'AdminPassword123!' }),
    });
    assert.equal(adminLogin.status, 200);
    const adminCookie = extractCookieHeader(adminLogin);

    // Register two regular members (alice -> pro, bob -> free) and one disabled user
    const aliceReg = await fetch(`${ctx.baseUrl}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'comment_alice', password: 'Password123!' }),
    });
    assert.equal(aliceReg.status, 201);
    const aliceCookie = extractCookieHeader(aliceReg);
    const { user: alice } = await aliceReg.json();

    await fetch(`${ctx.baseUrl}/user-api/admin/users/${alice.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ tier: 'pro', tierExpiresAt: Date.now() + 30 * 86_400_000 }),
    });

    const bobReg = await fetch(`${ctx.baseUrl}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'comment_bob', password: 'Password123!' }),
    });
    assert.equal(bobReg.status, 201);
    const bobCookie = extractCookieHeader(bobReg);

    const disabledReg = await fetch(`${ctx.baseUrl}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'comment_disabled', password: 'Password123!' }),
    });
    const disabledCookie = extractCookieHeader(disabledReg);
    const { user: disabledUser } = await disabledReg.json();
    await fetch(`${ctx.baseUrl}/user-api/admin/users/${disabledUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ disabled: true }),
    });

    // Create one active announcement and one inactive announcement
    const createActive = await fetch(`${ctx.baseUrl}/user-api/admin/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        title: '高词新版本发布',
        content: '欢迎各位注册会员在评论区交流反馈。',
        type: 'notice',
        isActive: true,
      }),
    });
    assert.equal(createActive.status, 201);
    const { announcement: activeAnn } = await createActive.json();
    assert.equal(activeAnn.commentCount, 0);

    const createDraft = await fetch(`${ctx.baseUrl}/user-api/admin/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        title: '草稿公告',
        content: '尚未发布',
        isActive: false,
      }),
    });
    assert.equal(createDraft.status, 201);
    const { announcement: draftAnn } = await createDraft.json();

    // Public GET & OPTIONS CORS allowlist for https://goprmpt.com on /announcements/:id/comments
    const commentsPreflight = await fetch(
      `${ctx.baseUrl}/user-api/announcements/${activeAnn.id}/comments`,
      {
        method: 'OPTIONS',
        headers: { Origin: 'https://goprmpt.com' },
      },
    );
    assert.equal(commentsPreflight.status, 204);
    assert.equal(
      commentsPreflight.headers.get('access-control-allow-origin'),
      'https://goprmpt.com',
    );
    assert.equal(commentsPreflight.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
    assert.equal(commentsPreflight.headers.get('vary'), 'Origin');

    const publicGet = await fetch(
      `${ctx.baseUrl}/user-api/announcements/${activeAnn.id}/comments`,
      { headers: { Origin: 'https://www.goprmpt.com' } },
    );
    assert.equal(publicGet.status, 200);
    assert.equal(publicGet.headers.get('access-control-allow-origin'), 'https://www.goprmpt.com');
    assert.deepEqual(await publicGet.json(), { comments: [], commentCount: 0 });

    const evilOriginGet = await fetch(
      `${ctx.baseUrl}/user-api/announcements/${activeAnn.id}/comments`,
      { headers: { Origin: 'https://evil.example' } },
    );
    assert.equal(evilOriginGet.status, 200);
    assert.equal(evilOriginGet.headers.get('access-control-allow-origin'), null);

    // Non-admin cannot read comments on inactive announcement (404), admin can (200)
    const draftPublicGet = await fetch(
      `${ctx.baseUrl}/user-api/announcements/${draftAnn.id}/comments`,
    );
    assert.equal(draftPublicGet.status, 404);

    const draftUserGet = await fetch(
      `${ctx.baseUrl}/user-api/announcements/${draftAnn.id}/comments`,
      { headers: { Cookie: aliceCookie } },
    );
    assert.equal(draftUserGet.status, 404);

    const draftAdminGet = await fetch(
      `${ctx.baseUrl}/user-api/announcements/${draftAnn.id}/comments`,
      { headers: { Cookie: adminCookie } },
    );
    assert.equal(draftAdminGet.status, 200);
    assert.deepEqual(await draftAdminGet.json(), { comments: [], commentCount: 0 });

    // Unauthenticated POST -> 401 (and no public CORS header on POST)
    const anonPost = await fetch(
      `${ctx.baseUrl}/user-api/announcements/${activeAnn.id}/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://goprmpt.com',
        },
        body: JSON.stringify({ content: '未登录评论' }),
      },
    );
    assert.equal(anonPost.status, 401);
    assert.equal(anonPost.headers.get('access-control-allow-origin'), null);
    assert.equal((await anonPost.json()).error, '请先注册并登录会员账号后再发表评论');

    // Disabled user POST -> 403
    const disabledPost = await fetch(
      `${ctx.baseUrl}/user-api/announcements/${activeAnn.id}/comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: disabledCookie },
        body: JSON.stringify({ content: '停用账号评论' }),
      },
    );
    assert.equal(disabledPost.status, 403);

    // POST to inactive or nonexistent announcement -> 404
    const draftPost = await fetch(
      `${ctx.baseUrl}/user-api/announcements/${draftAnn.id}/comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ content: '评论草稿' }),
      },
    );
    assert.equal(draftPost.status, 404);

    // Validation rejects empty, >500 chars, non-string, and NUL/control chars -> 400
    for (const badBody of [
      {},
      { content: '' },
      { content: '   \n\t  ' },
      { content: 12345 },
      { content: 'a'.repeat(501) },
      { content: 'hello\u0000world' },
      { content: 'bell\u0007char' },
      { content: 'vtab\u000bchar' },
      { content: 'ff\u000cchar' },
      { content: 'ctrl\u001fchar' },
      { content: 'del\u007fchar' },
    ]) {
      const res = await fetch(
        `${ctx.baseUrl}/user-api/announcements/${activeAnn.id}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
          body: JSON.stringify(badBody),
        },
      );
      assert.equal(res.status, 400, `expected 400 for comment payload ${JSON.stringify(badBody)}`);
    }

    // Registered member alice posts comment (with newline & surrounding spaces trimmed) -> 201
    const alicePost = await fetch(
      `${ctx.baseUrl}/user-api/announcements/${activeAnn.id}/comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ content: '  第一行支持换行\n第二行很赞！  ' }),
      },
    );
    assert.equal(alicePost.status, 201);
    const alicePostBody = await alicePost.json();
    assert.equal(alicePostBody.commentCount, 1);
    assert.equal(alicePostBody.comment.announcementId, activeAnn.id);
    assert.equal(alicePostBody.comment.userId, alice.id);
    assert.equal(alicePostBody.comment.username, 'comment_alice');
    assert.equal(alicePostBody.comment.role, 'user');
    assert.equal(alicePostBody.comment.tier, 'pro');
    assert.equal(alicePostBody.comment.effectiveTier, 'pro');
    assert.equal(alicePostBody.comment.content, '第一行支持换行\n第二行很赞！');
    assert.equal(typeof alicePostBody.comment.createdAt, 'number');

    // Bob posts an exact 500-char comment -> 201
    const exact500 = '赞'.repeat(500);
    const bobPost = await fetch(
      `${ctx.baseUrl}/user-api/announcements/${activeAnn.id}/comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: bobCookie },
        body: JSON.stringify({ content: exact500 }),
      },
    );
    assert.equal(bobPost.status, 201);
    const bobPostBody = await bobPost.json();
    assert.equal(bobPostBody.commentCount, 2);
    assert.equal(bobPostBody.comment.username, 'comment_bob');
    assert.equal(bobPostBody.comment.effectiveTier, 'free');

    // Public GET returns both newest-first, and ?limit=1 clamps while reporting total commentCount
    const listAll = await (
      await fetch(`${ctx.baseUrl}/user-api/announcements/${activeAnn.id}/comments`)
    ).json();
    assert.equal(listAll.commentCount, 2);
    assert.equal(listAll.comments.length, 2);
    assert.equal(listAll.comments[0].id, bobPostBody.comment.id);
    assert.equal(listAll.comments[1].id, alicePostBody.comment.id);

    const listLimited = await (
      await fetch(`${ctx.baseUrl}/user-api/announcements/${activeAnn.id}/comments?limit=1`)
    ).json();
    assert.equal(listLimited.commentCount, 2);
    assert.equal(listLimited.comments.length, 1);
    assert.equal(listLimited.comments[0].id, bobPostBody.comment.id);

    // /announcements/active and /admin/announcements reflect commentCount: 2
    const activeAfterComment = await (
      await fetch(`${ctx.baseUrl}/user-api/announcements/active`)
    ).json();
    assert.equal(activeAfterComment.announcements[0].commentCount, 2);

    const adminAfterComment = await (
      await fetch(`${ctx.baseUrl}/user-api/admin/announcements`, { headers: { Cookie: adminCookie } })
    ).json();
    const adminFoundAnn = adminAfterComment.announcements.find((a) => a.id === activeAnn.id);
    assert.equal(adminFoundAnn.commentCount, 2);

    // Delete permission checks: bob cannot delete alice's comment (403); wrong announcementId -> 404
    const bobDelAlice = await fetch(
      `${ctx.baseUrl}/user-api/announcements/${activeAnn.id}/comments/${alicePostBody.comment.id}`,
      {
        method: 'DELETE',
        headers: { Cookie: bobCookie },
      },
    );
    assert.equal(bobDelAlice.status, 403);

    const wrongAnnDel = await fetch(
      `${ctx.baseUrl}/user-api/announcements/${draftAnn.id}/comments/${alicePostBody.comment.id}`,
      {
        method: 'DELETE',
        headers: { Cookie: aliceCookie },
      },
    );
    assert.equal(wrongAnnDel.status, 404);

    // Alice deletes own comment -> 200, commentCount becomes 1
    const aliceDelOwn = await fetch(
      `${ctx.baseUrl}/user-api/announcements/${activeAnn.id}/comments/${alicePostBody.comment.id}`,
      {
        method: 'DELETE',
        headers: { Cookie: aliceCookie },
      },
    );
    assert.equal(aliceDelOwn.status, 200);
    assert.deepEqual(await aliceDelOwn.json(), { ok: true, commentCount: 1 });

    // Admin deletes bob's comment -> 200, commentCount becomes 0
    const adminDelBob = await fetch(
      `${ctx.baseUrl}/user-api/announcements/${activeAnn.id}/comments/${bobPostBody.comment.id}`,
      {
        method: 'DELETE',
        headers: { Cookie: adminCookie },
      },
    );
    assert.equal(adminDelBob.status, 200);
    assert.deepEqual(await adminDelBob.json(), { ok: true, commentCount: 0 });

    // Post another comment then delete announcement -> ON DELETE CASCADE cleans announcement_comments
    const cascadePost = await fetch(
      `${ctx.baseUrl}/user-api/announcements/${activeAnn.id}/comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: bobCookie },
        body: JSON.stringify({ content: '将被级联删除的评论' }),
      },
    );
    assert.equal(cascadePost.status, 201);
    assert.equal(
      ctx.app.db.raw
        .prepare('SELECT COUNT(*) AS c FROM announcement_comments WHERE announcement_id = ?')
        .get(activeAnn.id).c,
      1,
    );

    const delAnnRes = await fetch(`${ctx.baseUrl}/user-api/admin/announcements/${activeAnn.id}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    });
    assert.equal(delAnnRes.status, 200);
    assert.equal(
      ctx.app.db.raw
        .prepare('SELECT COUNT(*) AS c FROM announcement_comments WHERE announcement_id = ?')
        .get(activeAnn.id).c,
      0,
    );

    // Verify SiliconFlow is #1 in /user-api/model-presets with featured: true & default applyLabel
    const presetsRes = await fetch(`${ctx.baseUrl}/user-api/model-presets`);
    assert.equal(presetsRes.status, 200);
    const { presets } = await presetsRes.json();
    assert.equal(presets[0].providerId, 'siliconflow');
    assert.equal(presets[0].name, '硅基流动 SiliconFlow');
    assert.equal(presets[0].featured, true);
    assert.equal(presets[0].applyLabel, '主推 · 申请领免费额度');
    for (const other of presets.slice(1)) {
      assert.equal(other.featured, false);
      assert.equal(other.applyLabel, '申请 API Key');
    }

    // Clearing custom applyLabel falls back to SiliconFlow's defaultApplyLabel
    await fetch(`${ctx.baseUrl}/user-api/admin/model-presets/siliconflow`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ applyLabel: '自定义硅基文案' }),
    });
    const clearedSf = await (
      await fetch(`${ctx.baseUrl}/user-api/admin/model-presets/siliconflow`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ applyLabel: '' }),
      })
    ).json();
    assert.equal(clearedSf.preset.applyLabel, '主推 · 申请领免费额度');

    // Admin HTML renders #announcementCommentsPanel, 主推 badge, SiliconFlow placeholders, zero em dashes, valid JS
    const adminHtmlRes = await fetch(`${ctx.baseUrl}/user-api/admin`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(adminHtmlRes.status, 200);
    const html = await adminHtmlRes.text();
    assert.match(html, /id="announcementCommentsPanel"/);
    assert.match(html, /data-ann-act="comments"/);
    assert.match(html, /<span class="badge badge-pin">主推<\/span>/);
    assert.match(html, /例如：硅基流动 DeepSeek-V3/);
    assert.match(html, /https:\/\/api\.siliconflow\.cn\/v1/);
    assert.match(html, /deepseek-ai\/DeepSeek-V3/);
    assert.equal(html.includes('—'), false, 'admin UI copy should not contain em dashes');
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch);
    assert.doesNotThrow(() => new Function(scriptMatch[1]));
  } finally {
    await ctx.cleanup();
  }
});

test('legacy platform_models table migrates idempotently to add failover and cooldown columns', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const tmpDir = makeTempDir();
  const dbPath = path.join(tmpDir, 'legacy-platform-models', 'users.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const now = Date.now();
  const legacyDb = new DatabaseSync(dbPath);
  legacyDb.exec(`
    CREATE TABLE platform_models (
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
  `);
  legacyDb
    .prepare(
      `INSERT INTO platform_models (
        id, name, provider_label, base_url, api_key, upstream_model,
        credit_cost, min_tier, default_params_json, apply_url, description,
        sort_order, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'legacy-model-a',
      'Legacy Model A',
      'Legacy Provider',
      'https://legacy.example/v1',
      'sk-legacy-key-987654321',
      'legacy-chat',
      5,
      'standard',
      '{}',
      null,
      'pre-failover model',
      1,
      1,
      now,
      now,
    );
  legacyDb.close();

  const env = {
    USER_SYNC_HOST: '127.0.0.1',
    USER_SYNC_PORT: '0',
    USER_SYNC_DB_PATH: dbPath,
    ADMIN_USERNAME: 'root_admin',
    ADMIN_PASSWORD: 'AdminPassword123!',
    RATE_LIMIT_MAX: '50',
    RATE_LIMIT_WINDOW_MS: '60000',
  };

  let app1 = createApp(loadConfig(env));
  let app2 = null;
  try {
    const addr1 = await app1.listen();
    const base1 = `http://${addr1.host}:${addr1.port}`;

    const colNames = new Set(
      app1.db.raw.prepare('PRAGMA table_info(platform_models)').all().map((c) => c.name),
    );
    assert.equal(colNames.has('auto_fallback'), true);
    assert.equal(colNames.has('fallback_model_id'), true);
    assert.equal(colNames.has('cooldown_until'), true);
    assert.equal(colNames.has('last_error_reason'), true);
    assert.equal(colNames.has('last_error_at'), true);

    const adminLogin = await fetch(`${base1}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'root_admin', password: 'AdminPassword123!' }),
    });
    const adminCookie = extractCookieHeader(adminLogin);

    const list1 = await (
      await fetch(`${base1}/user-api/admin/platform-models`, { headers: { Cookie: adminCookie } })
    ).json();
    assert.equal(list1.models.length, 1);
    const migrated = list1.models[0];
    assert.equal(migrated.id, 'legacy-model-a');
    assert.equal(migrated.autoFallback, true);
    assert.equal(migrated.fallbackModelId, null);
    assert.equal(migrated.cooldownUntil, null);
    assert.equal(migrated.inCooldown, false);
    assert.equal(migrated.lastErrorReason, null);
    assert.equal(migrated.lastErrorAt, null);

    // Reopen same migrated DB cleanly to confirm idempotency
    await app1.close();
    app1 = null;
    app2 = createApp(loadConfig(env));
    const addr2 = await app2.listen();
    const base2 = `http://${addr2.host}:${addr2.port}`;

    const pubList = await (await fetch(`${base2}/user-api/platform-models`)).json();
    assert.equal(pubList.models.length, 1);
    assert.equal(pubList.models[0].id, 'legacy-model-a');
    assert.equal(pubList.models[0].autoFallback, true);
    assert.equal(pubList.models[0].fallbackModelId, null);
    assert.equal(pubList.models[0].inCooldown, false);
    assert.equal('lastErrorReason' in pubList.models[0], false);
    assert.equal('baseUrl' in pubList.models[0], false);
    assert.equal('apiKey' in pubList.models[0], false);
  } finally {
    if (app1) await app1.close();
    if (app2) await app2.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('platform model quota failover, cooldown skip, single credit charge, ledger note, SSE failover, explicit fallback, tier isolation, and admin clear-cooldown/test recovery', async () => {
  const {
    buildFailoverCandidateChain,
    classifyUpstreamFailure,
  } = await import('../src/platform-models.js');

  // Verify pure failure classification for quota/rate-limit/unavailable/client errors
  assert.deepEqual(classifyUpstreamFailure(402, '{"error":"Payment Required"}'), {
    kind: 'quota_exhausted',
    retryable: true,
    reason: '上游模型额度或余额不足',
  });
  assert.equal(classifyUpstreamFailure(400, '{"code":"Arrearage","message":"账户欠费"}').kind, 'quota_exhausted');
  assert.equal(classifyUpstreamFailure(429, '{"error":{"message":"余额不足"}}').kind, 'quota_exhausted');
  assert.equal(classifyUpstreamFailure(429, '{"error":{"message":"rate limit"}}').kind, 'rate_limited');
  assert.equal(classifyUpstreamFailure(503, 'service unavailable').kind, 'upstream_unavailable');
  assert.equal(classifyUpstreamFailure(401, 'invalid api key').retryable, true);
  assert.equal(classifyUpstreamFailure(400, '{"error":{"message":"invalid messages format"}}').retryable, false);

  // Verify pure candidate chain respects maxAttempts cap and cooled ordering
  const mockChain = buildFailoverCandidateChain(
    { id: 'm1', enabled: 1, min_tier: 'free', auto_fallback: 1, cooldown_until: null, sort_order: 1, created_at: 1 },
    [
      { id: 'm1', enabled: 1, min_tier: 'free', sort_order: 1, created_at: 1 },
      { id: 'm2', enabled: 1, min_tier: 'free', sort_order: 2, created_at: 2 },
      { id: 'm3', enabled: 1, min_tier: 'free', sort_order: 3, created_at: 3 },
      { id: 'm4', enabled: 1, min_tier: 'free', sort_order: 4, created_at: 4 },
      { id: 'm5', enabled: 1, min_tier: 'free', sort_order: 5, created_at: 5 },
      { id: 'm6', enabled: 1, min_tier: 'free', sort_order: 6, created_at: 6 },
    ],
    { role: 'user', tier: 'free', tier_expires_at: null },
    { now: 1000 },
  );
  assert.deepEqual(mockChain.map((m) => m.id), ['m1', 'm2', 'm3', 'm4', 'm5']);

  const tmpDir = makeTempDir();
  const dbPath = path.join(tmpDir, 'failover', 'users.db');
  const upstreamCalls = [];
  const behaviorByUpstreamModel = new Map();

  const mockFetch = async (url, init) => {
    const body = JSON.parse(String(init?.body || '{}'));
    const upstreamModel = body.model;
    upstreamCalls.push({
      url,
      authHeader: init?.headers?.Authorization || '',
      upstreamModel,
      stream: Boolean(body.stream),
    });

    const mode = behaviorByUpstreamModel.get(upstreamModel) || 'ok';
    if (mode === 'throw-network') {
      throw new Error('ECONNREFUSED upstream down');
    }
    if (mode === 'quota-402') {
      return new Response(
        JSON.stringify({ error: { message: '余额不足，请充值' } }),
        { status: 402, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (mode === 'quota-400-arrearage') {
      return new Response(
        JSON.stringify({ error: { code: 'Arrearage', message: '账户欠费，请及时缴费' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (mode === 'client-400') {
      return new Response(
        JSON.stringify({ error: { message: 'messages must be a non-empty array' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (mode === 'fail-503') {
      return new Response(
        JSON.stringify({ error: { message: 'upstream service overloaded' } }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (mode === 'ok-sse') {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(`data: {"choices":[{"delta":{"content":"stream-from-${upstreamModel}"}}]}\n\n`),
          );
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      });
    }
    return new Response(
      JSON.stringify({
        id: `chatcmpl-${upstreamModel}`,
        object: 'chat.completion',
        model: upstreamModel,
        choices: [{ index: 0, message: { role: 'assistant', content: `reply-from-${upstreamModel}` } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const config = {
    ...loadConfig({
      USER_SYNC_HOST: '127.0.0.1',
      USER_SYNC_PORT: '0',
      USER_SYNC_DB_PATH: dbPath,
      ADMIN_USERNAME: 'root_admin',
      ADMIN_PASSWORD: 'AdminPassword123!',
      RATE_LIMIT_MAX: '100',
      RATE_LIMIT_WINDOW_MS: '60000',
    }),
    quotaCooldownMs: 60_000,
    transientCooldownMs: 30_000,
  };
  const app = createApp(config, { fetchImpl: mockFetch });

  try {
    const addr = await app.listen();
    const baseUrl = `http://${addr.host}:${addr.port}`;

    // Login as admin and create a standard user with 100 credits
    const adminLogin = await fetch(`${baseUrl}/user-api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'root_admin', password: 'AdminPassword123!' }),
    });
    const adminCookie = extractCookieHeader(adminLogin);

    const userReg = await fetch(`${baseUrl}/user-api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'failover_std', password: 'Password123!' }),
    });
    const userCookie = extractCookieHeader(userReg);
    const { user: stdUser } = await userReg.json();

    await fetch(`${baseUrl}/user-api/admin/users/${stdUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ tier: 'standard', tierExpiresAt: Date.now() + 30 * 86_400_000 }),
    });

    // Reject self-referencing fallbackModelId on POST -> 400
    const badSelfCreate = await fetch(`${baseUrl}/user-api/admin/platform-models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        id: 'self-loop',
        name: 'Self Loop',
        baseUrl: 'https://self.example/v1',
        apiKey: 'sk-self-1234',
        upstreamModel: 'up-self',
        fallbackModelId: 'self-loop',
      }),
    });
    assert.equal(badSelfCreate.status, 400);

    // Create Model A (standard, cost=10, sortOrder=1), Model B (standard, cost=30, sortOrder=2),
    // Model C (internal-only, cost=5, sortOrder=0 -> lower sortOrder than B!)
    const createModel = async (payload) => {
      const res = await fetch(`${baseUrl}/user-api/admin/platform-models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify(payload),
      });
      assert.equal(res.status, 201, `create ${payload.id} failed`);
      return (await res.json()).model;
    };

    await createModel({
      id: 'model-a',
      name: '主力模型 A',
      baseUrl: 'https://a.example/v1',
      apiKey: 'sk-model-a-secret',
      upstreamModel: 'up-a',
      creditCost: 10,
      minTier: 'standard',
      sortOrder: 1,
      autoFallback: true,
    });

    await createModel({
      id: 'model-b',
      name: '备用模型 B',
      baseUrl: 'https://b.example/v1',
      apiKey: 'sk-model-b-secret',
      upstreamModel: 'up-b',
      creditCost: 30,
      minTier: 'standard',
      sortOrder: 2,
      autoFallback: true,
    });

    await createModel({
      id: 'model-c-internal',
      name: '内部专属模型 C',
      baseUrl: 'https://c.example/v1',
      apiKey: 'sk-model-c-secret',
      upstreamModel: 'up-c',
      creditCost: 5,
      minTier: 'internal',
      sortOrder: 0,
      autoFallback: true,
    });

    // Reject self-referencing fallbackModelId on PATCH -> 400
    const badSelfPatch = await fetch(`${baseUrl}/user-api/admin/platform-models/model-a`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ fallbackModelId: 'model-a' }),
    });
    assert.equal(badSelfPatch.status, 400);

    // Scenario 2 & 4: Model A returns 402 (余额不足). Even though Model C (internal) has sortOrder 0,
    // standard user MUST NOT fail over to Model C; MUST fail over to Model B and pay ONLY Model A's 10 credits ONCE!
    behaviorByUpstreamModel.set('up-a', 'quota-402');
    behaviorByUpstreamModel.set('up-b', 'ok');
    behaviorByUpstreamModel.set('up-c', 'ok');
    upstreamCalls.length = 0;

    const extOrigin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
    const res1 = await fetch(`${baseUrl}/user-api/ai/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userCookie,
        Origin: extOrigin,
      },
      body: JSON.stringify({
        model: 'model-a',
        messages: [{ role: 'user', content: '测试自动切替' }],
      }),
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.headers.get('x-goprmpt-failover'), '1');
    assert.equal(res1.headers.get('x-goprmpt-requested-model'), 'model-a');
    assert.equal(res1.headers.get('x-goprmpt-actual-model'), 'model-b');
    assert.equal(res1.headers.get('x-goprmpt-credits-cost'), '10');
    assert.equal(res1.headers.get('x-goprmpt-credits-remaining'), '90');
    assert.match(
      res1.headers.get('access-control-expose-headers') || '',
      /X-GoPrmpt-Failover/,
    );
    const body1 = await res1.json();
    assert.equal(body1.choices[0].message.content, 'reply-from-up-b');
    assert.deepEqual(
      upstreamCalls.map((c) => c.upstreamModel),
      ['up-a', 'up-b'],
    );

    // Check ledger note recorded the failover cleanly and only debited once (-10)
    const creditsAfter1 = await (
      await fetch(`${baseUrl}/user-api/credits`, { headers: { Cookie: userCookie } })
    ).json();
    assert.equal(creditsAfter1.balance, 90);
    assert.equal(creditsAfter1.ledger[0].reason, 'usage_debit');
    assert.equal(creditsAfter1.ledger[0].delta, -10);
    assert.match(creditsAfter1.ledger[0].note, /自动切替至 备用模型 B/);

    // Check admin vs public visibility of cooldown state (public never exposes lastErrorReason)
    const adminModelsAfterFail = await (
      await fetch(`${baseUrl}/user-api/admin/platform-models`, { headers: { Cookie: adminCookie } })
    ).json();
    const adminModelA = adminModelsAfterFail.models.find((m) => m.id === 'model-a');
    assert.equal(adminModelA.inCooldown, true);
    assert.equal(typeof adminModelA.cooldownUntil, 'number');
    assert.equal(adminModelA.lastErrorReason, '上游模型额度或余额不足');
    assert.equal(typeof adminModelA.lastErrorAt, 'number');

    const publicModelsAfterFail = await (
      await fetch(`${baseUrl}/user-api/platform-models`, { headers: { Cookie: userCookie } })
    ).json();
    const pubModelA = publicModelsAfterFail.models.find((m) => m.id === 'model-a');
    assert.equal(pubModelA.inCooldown, true);
    assert.equal('lastErrorReason' in pubModelA, false);
    assert.equal('cooldownUntil' in pubModelA, false);
    assert.equal('baseUrl' in pubModelA, false);
    assert.equal('apiKey' in pubModelA, false);

    // 2nd request while Model A is in cooldown MUST skip Model A directly (0 upstream calls to up-a!)
    upstreamCalls.length = 0;
    const res2 = await fetch(`${baseUrl}/user-api/ai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({
        model: 'model-a',
        messages: [{ role: 'user', content: '冷却期内直接跳过主模型' }],
      }),
    });
    assert.equal(res2.status, 200);
    assert.equal(res2.headers.get('x-goprmpt-failover'), '1');
    assert.equal(res2.headers.get('x-goprmpt-requested-model'), 'model-a');
    assert.equal(res2.headers.get('x-goprmpt-actual-model'), 'model-b');
    assert.equal(res2.headers.get('x-goprmpt-credits-remaining'), '80');
    assert.deepEqual(
      upstreamCalls.map((c) => c.upstreamModel),
      ['up-b'],
    );

    // SSE streaming failover also works cleanly while skipping cooled primary
    behaviorByUpstreamModel.set('up-b', 'ok-sse');
    upstreamCalls.length = 0;
    const sseFailoverRes = await fetch(`${baseUrl}/user-api/ai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({
        model: 'model-a',
        stream: true,
        messages: [{ role: 'user', content: '流式自动切替' }],
      }),
    });
    assert.equal(sseFailoverRes.status, 200);
    assert.equal(sseFailoverRes.headers.get('x-goprmpt-failover'), '1');
    assert.equal(sseFailoverRes.headers.get('x-goprmpt-actual-model'), 'model-b');
    assert.ok((await sseFailoverRes.text()).includes('stream-from-up-b'));
    assert.deepEqual(
      upstreamCalls.map((c) => c.upstreamModel),
      ['up-b'],
    );
    behaviorByUpstreamModel.set('up-b', 'ok');

    // Scenario 8a: clear-cooldown requires admin (403 for user, 404 for unknown)
    const nonAdminClear = await fetch(
      `${baseUrl}/user-api/admin/platform-models/model-a/clear-cooldown`,
      { method: 'POST', headers: { Cookie: userCookie } },
    );
    assert.equal(nonAdminClear.status, 403);

    const missingClear = await fetch(
      `${baseUrl}/user-api/admin/platform-models/does-not-exist/clear-cooldown`,
      { method: 'POST', headers: { Cookie: adminCookie } },
    );
    assert.equal(missingClear.status, 404);

    // Admin clears cooldown on Model A -> next request targets Model A again!
    const clearRes = await fetch(
      `${baseUrl}/user-api/admin/platform-models/model-a/clear-cooldown`,
      { method: 'POST', headers: { Cookie: adminCookie } },
    );
    assert.equal(clearRes.status, 200);
    const clearedModel = (await clearRes.json()).model;
    assert.equal(clearedModel.inCooldown, false);
    assert.equal(clearedModel.cooldownUntil, null);
    assert.equal(clearedModel.lastErrorReason, null);
    assert.equal(clearedModel.lastErrorAt, null);

    behaviorByUpstreamModel.set('up-a', 'ok');
    upstreamCalls.length = 0;
    const resAfterClear = await fetch(`${baseUrl}/user-api/ai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({
        model: 'model-a',
        messages: [{ role: 'user', content: '恢复后命中主模型' }],
      }),
    });
    assert.equal(resAfterClear.status, 200);
    assert.equal(resAfterClear.headers.get('x-goprmpt-failover'), null);
    assert.equal(resAfterClear.headers.get('x-goprmpt-requested-model'), 'model-a');
    assert.equal(resAfterClear.headers.get('x-goprmpt-actual-model'), 'model-a');
    assert.deepEqual(
      upstreamCalls.map((c) => c.upstreamModel),
      ['up-a'],
    );

    // Scenario 3: Explicit fallbackModelId takes priority over lower sortOrder model
    await createModel({
      id: 'model-d-preferred',
      name: '指定备用模型 D',
      baseUrl: 'https://d.example/v1',
      apiKey: 'sk-model-d-secret',
      upstreamModel: 'up-d',
      creditCost: 20,
      minTier: 'standard',
      sortOrder: 99,
      autoFallback: true,
    });
    const setFallbackRes = await fetch(`${baseUrl}/user-api/admin/platform-models/model-a`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ fallbackModelId: 'model-d-preferred' }),
    });
    assert.equal(setFallbackRes.status, 200);
    assert.equal((await setFallbackRes.json()).model.fallbackModelId, 'model-d-preferred');

    // Trigger 400 Arrearage on Model A -> must pick model-d-preferred (sortOrder 99) BEFORE model-b (sortOrder 2)
    behaviorByUpstreamModel.set('up-a', 'quota-400-arrearage');
    behaviorByUpstreamModel.set('up-d', 'ok');
    upstreamCalls.length = 0;
    const preferredRes = await fetch(`${baseUrl}/user-api/ai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({
        model: 'model-a',
        messages: [{ role: 'user', content: '验证优先备用模型' }],
      }),
    });
    assert.equal(preferredRes.status, 200);
    assert.equal(preferredRes.headers.get('x-goprmpt-failover'), '1');
    assert.equal(preferredRes.headers.get('x-goprmpt-actual-model'), 'model-d-preferred');
    assert.deepEqual(
      upstreamCalls.map((c) => c.upstreamModel),
      ['up-a', 'up-d'],
    );

    // Scenario 8b: POST /test success automatically clears Model A's cooldown!
    behaviorByUpstreamModel.set('up-a', 'ok');
    const testRecoveryRes = await fetch(
      `${baseUrl}/user-api/admin/platform-models/model-a/test`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: '{}',
      },
    );
    assert.equal(testRecoveryRes.status, 200);
    const adminAfterTest = await (
      await fetch(`${baseUrl}/user-api/admin/platform-models`, { headers: { Cookie: adminCookie } })
    ).json();
    assert.equal(
      adminAfterTest.models.find((m) => m.id === 'model-a').inCooldown,
      false,
    );

    // Scenario 6: Non-retryable 400 client error does NOT put Model A in cooldown, does NOT fail over, and refunds credits
    const creditsBeforeBad400 = (
      await (await fetch(`${baseUrl}/user-api/credits`, { headers: { Cookie: userCookie } })).json()
    ).balance;
    behaviorByUpstreamModel.set('up-a', 'client-400');
    upstreamCalls.length = 0;
    const bad400Res = await fetch(`${baseUrl}/user-api/ai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({
        model: 'model-a',
        messages: [],
      }),
    });
    assert.equal(bad400Res.status, 400);
    const bad400Body = await bad400Res.json();
    assert.deepEqual(bad400Body.attemptedModels, ['model-a']);
    assert.deepEqual(
      upstreamCalls.map((c) => c.upstreamModel),
      ['up-a'],
    );
    const creditsAfterBad400 = (
      await (await fetch(`${baseUrl}/user-api/credits`, { headers: { Cookie: userCookie } })).json()
    ).balance;
    assert.equal(creditsAfterBad400, creditsBeforeBad400);
    const adminAfterBad400 = await (
      await fetch(`${baseUrl}/user-api/admin/platform-models`, { headers: { Cookie: adminCookie } })
    ).json();
    assert.equal(
      adminAfterBad400.models.find((m) => m.id === 'model-a').inCooldown,
      false,
    );

    // Scenario 5: autoFallback: false does NOT fail over and immediately refunds credits
    await fetch(`${baseUrl}/user-api/admin/platform-models/model-a`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ autoFallback: false }),
    });
    behaviorByUpstreamModel.set('up-a', 'quota-402');
    upstreamCalls.length = 0;
    const noFallbackRes = await fetch(`${baseUrl}/user-api/ai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({
        model: 'model-a',
        messages: [{ role: 'user', content: '禁用自动切替' }],
      }),
    });
    assert.equal(noFallbackRes.status, 402);
    assert.deepEqual((await noFallbackRes.json()).attemptedModels, ['model-a']);
    assert.deepEqual(
      upstreamCalls.map((c) => c.upstreamModel),
      ['up-a'],
    );
    const creditsAfterNoFallback = (
      await (await fetch(`${baseUrl}/user-api/credits`, { headers: { Cookie: userCookie } })).json()
    ).balance;
    assert.equal(creditsAfterNoFallback, creditsBeforeBad400);

    // Re-enable autoFallback, clear cooldown, and test network error failover + Scenario 7 (all candidates exhausted)
    await fetch(`${baseUrl}/user-api/admin/platform-models/model-a`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ autoFallback: true, fallbackModelId: 'model-c-internal' }),
    });
    await fetch(`${baseUrl}/user-api/admin/platform-models/model-a/clear-cooldown`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });

    // Even when fallbackModelId explicitly points to internal-only model-c-internal,
    // standard user MUST NOT call model-c-internal; all eligible candidates (a, b, d) fail -> refund once & return attemptedModels!
    behaviorByUpstreamModel.set('up-a', 'throw-network');
    behaviorByUpstreamModel.set('up-b', 'quota-402');
    behaviorByUpstreamModel.set('up-d', 'fail-503');
    behaviorByUpstreamModel.set('up-c', 'ok');
    upstreamCalls.length = 0;

    const allFailRes = await fetch(`${baseUrl}/user-api/ai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({
        model: 'model-a',
        messages: [{ role: 'user', content: '所有可用候选均失败' }],
      }),
    });
    assert.equal(allFailRes.status, 503);
    const allFailBody = await allFailRes.json();
    assert.deepEqual(allFailBody.attemptedModels, ['model-a', 'model-b', 'model-d-preferred']);
    assert.equal(allFailBody.attemptedModels.includes('model-c-internal'), false);
    assert.deepEqual(
      upstreamCalls.map((c) => c.upstreamModel),
      ['up-a', 'up-b', 'up-d'],
    );

    const creditsAfterAllFail = await (
      await fetch(`${baseUrl}/user-api/credits`, { headers: { Cookie: userCookie } })
    ).json();
    assert.equal(creditsAfterAllFail.balance, creditsBeforeBad400);
    assert.equal(creditsAfterAllFail.ledger[0].reason, 'usage_refund');
    assert.equal(creditsAfterAllFail.ledger[0].delta, 10);

    // Scenario 4b: Disable B and D so ONLY internal Model C remains besides Model A -> standard user fails cleanly & refunds!
    await fetch(`${baseUrl}/user-api/admin/platform-models/model-b`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ enabled: false }),
    });
    await fetch(`${baseUrl}/user-api/admin/platform-models/model-d-preferred`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ enabled: false }),
    });
    await fetch(`${baseUrl}/user-api/admin/platform-models/model-a/clear-cooldown`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });
    behaviorByUpstreamModel.set('up-a', 'quota-402');
    upstreamCalls.length = 0;

    const onlyInternalLeft = await fetch(`${baseUrl}/user-api/ai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({
        model: 'model-a',
        messages: [{ role: 'user', content: '仅剩内部模型不可越权切替' }],
      }),
    });
    assert.equal(onlyInternalLeft.status, 402);
    assert.deepEqual((await onlyInternalLeft.json()).attemptedModels, ['model-a']);
    assert.deepEqual(
      upstreamCalls.map((c) => c.upstreamModel),
      ['up-a'],
    );
    const creditsAfterInternalBlock = (
      await (await fetch(`${baseUrl}/user-api/credits`, { headers: { Cookie: userCookie } })).json()
    ).balance;
    assert.equal(creditsAfterInternalBlock, creditsBeforeBad400);

    // Scenario 8c: Admin HTML renders #pmAutoFallback, #pmFallbackModelId, clear-cooldown control, zero em dashes, valid JS
    const adminHtmlRes = await fetch(`${baseUrl}/user-api/admin`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(adminHtmlRes.status, 200);
    const html = await adminHtmlRes.text();
    assert.match(html, /id="pmAutoFallback"/);
    assert.match(html, /id="pmFallbackModelId"/);
    assert.match(html, /data-pm-act="clear-cooldown"/);
    assert.match(html, /额度\/异常冷却中/);
    assert.match(html, /恢复可用/);
    assert.equal(html.includes('—'), false, 'admin UI copy should not contain em dashes');
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch);
    assert.doesNotThrow(() => new Function(scriptMatch[1]), 'admin inline script should parse cleanly');
  } finally {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
