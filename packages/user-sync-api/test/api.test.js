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
    assert.deepEqual(await enableRes.json(), { membershipEnabled: true });

    // /config and /admin/users reflect enabled state immediately
    const cfgAfterEnable = await fetch(`${base1}/user-api/config`);
    assert.deepEqual(await cfgAfterEnable.json(), {
      membershipEnabled: true,
      registrationEnabled: true,
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
    assert.deepEqual(await disableRes.json(), { membershipEnabled: false });

    const cfgFinal = await fetch(`${base2}/user-api/config`);
    assert.deepEqual(await cfgFinal.json(), {
      membershipEnabled: false,
      registrationEnabled: true,
    });
  } finally {
    if (app1) await app1.close();
    if (app2) await app2.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
