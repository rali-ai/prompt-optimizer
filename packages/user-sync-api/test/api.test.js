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
    // Public /model-presets works without auth and returns exact 10 providers in order
    const initPublic = await fetch(`${ctx.baseUrl}/user-api/model-presets`);
    assert.equal(initPublic.status, 200);
    const { presets: initPresets } = await initPublic.json();
    assert.deepEqual(
      initPresets.map((p) => p.providerId),
      [
        'deepseek',
        'dashscope',
        'siliconflow',
        'zhipu',
        'modelscope',
        'minimax',
        'xiaomi-mimo-token-plan',
        'seedream',
        'ollama',
        'openai-compatible',
      ],
    );
    assert.equal(initPresets[0].applyUrl, 'https://platform.deepseek.com/api_keys');
    assert.equal(initPresets[0].customApplyUrl, null);
    assert.equal(initPresets[8].applyUrl, null);

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
    assert.equal(html.includes('—'), false, 'admin UI copy should not contain em dashes');
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch);
    assert.doesNotThrow(() => new Function(scriptMatch[1]));
  } finally {
    await ctx.cleanup();
  }
});
