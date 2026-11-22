import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EXTENSION_SYNC_BASE_URL,
  UserSyncError,
  changePassword,
  confirmPasswordReset,
  getConfig,
  getMe,
  isExtensionRuntime,
  login,
  logout,
  pullSync,
  pushSync,
  register,
  requestPasswordReset,
  resolveDefaultSyncBaseUrl,
  stripSecretsForSync,
  toDataManagerImportEnvelope,
  updateProfile,
} from './user-sync-client.ts'

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('stripSecretsForSync strips models, imageModels, and nested secret keys', () => {
  const exported = {
    version: 1,
    data: {
      models: [{ key: 'openai', apiKey: 'sk-openai-secret' }],
      imageModels: [{ key: 'flux', api_key: 'sk-flux-secret' }],
      history: [{ id: 'h1', originalPrompt: 'hi', apiKey: 'sk-nested-hist' }],
      userTemplates: [{ id: 't1', name: '评审', nested: { secretKey: 'sec-1', keep: true } }],
      userSettings: { theme: 'dark', api_key: 'sk-pref' },
      contexts: [{ id: 'c1', vars: { role: 'dev', privateKey: 'pk-1' } }],
    },
    favorites: [{ id: 'f1', title: '收藏', apiKey: 'sk-fav' }],
  }

  const clean = stripSecretsForSync(exported)
  const serialized = JSON.stringify(clean)

  assert.equal(serialized.includes('sk-openai-secret'), false)
  assert.equal(serialized.includes('sk-flux-secret'), false)
  assert.equal(serialized.includes('sk-nested-hist'), false)
  assert.equal(serialized.includes('sec-1'), false)
  assert.equal(serialized.includes('sk-pref'), false)
  assert.equal(serialized.includes('pk-1'), false)
  assert.equal(serialized.includes('sk-fav'), false)
  assert.deepEqual(clean, {
    favorites: [{ id: 'f1', title: '收藏' }],
    history: [{ id: 'h1', originalPrompt: 'hi' }],
    templates: [{ id: 't1', name: '评审', nested: { keep: true } }],
    variables: [{ id: 'c1', vars: { role: 'dev' } }],
    preferences: { theme: 'dark' },
  })
})

test('stripSecretsForSync handles non-object inputs and toDataManagerImportEnvelope omits models', () => {
  assert.deepEqual(stripSecretsForSync(null), {})
  assert.deepEqual(stripSecretsForSync('bad'), {})
  assert.deepEqual(stripSecretsForSync([]), {})

  const envelope = toDataManagerImportEnvelope({
    history: [{ id: 'h1' }],
    templates: [{ id: 't1' }],
    preferences: { theme: 'light' },
    variables: [{ id: 'c1' }],
  })
  assert.deepEqual(envelope, {
    version: 1,
    data: {
      history: [{ id: 'h1' }],
      userTemplates: [{ id: 't1' }],
      userSettings: { theme: 'light' },
      contexts: [{ id: 'c1' }],
    },
  })
  assert.equal(toDataManagerImportEnvelope({ favorites: [] }), null)
})

test('user-sync-client HTTP methods handle config, auth, 401 -> null, logout', async () => {
  const mockUser = {
    id: 'u1',
    username: 'alice',
    role: 'user',
    tier: 'free',
    tierExpiresAt: null,
    disabled: false,
    createdAt: 1,
    updatedAt: 1,
  }

  const queue = [
    jsonResponse({ membershipEnabled: false, registrationEnabled: true }),
    jsonResponse({ error: '请先登录' }, 401),
    jsonResponse({ user: mockUser }, 201),
    jsonResponse({ user: mockUser }, 200),
    jsonResponse({ ok: true }, 200),
  ]
  const fetchMock = async () => queue.shift()

  const cfg = await getConfig('/user-api', fetchMock)
  assert.deepEqual(cfg, { membershipEnabled: false, registrationEnabled: true })

  const me = await getMe('/user-api', fetchMock)
  assert.equal(me, null)

  const regUser = await register('alice', 'Password123!', '/user-api', fetchMock)
  assert.equal(regUser.username, 'alice')

  const loggedIn = await login('alice', 'Password123!', '/user-api', fetchMock)
  assert.equal(loggedIn.id, 'u1')

  await logout('/user-api', fetchMock)
  assert.equal(queue.length, 0)
})

test('pushSync strips secrets before upload and propagates 409 currentVersion', async () => {
  let sentBody = ''
  const fetchMock = async (_url, init) => {
    sentBody = String(init?.body || '')
    return jsonResponse({ error: '版本冲突', currentVersion: 4 }, 409)
  }

  await assert.rejects(
    () =>
      pushSync(
        {
          models: [{ apiKey: 'sk-never-send' }],
          favorites: [{ id: 'f1', apiKey: 'sk-inner' }],
        },
        2,
        '/user-api',
        fetchMock,
      ),
    (err) => {
      assert.ok(err instanceof UserSyncError)
      assert.equal(err.status, 409)
      assert.equal(err.currentVersion, 4)
      return true
    },
  )

  assert.equal(sentBody.includes('sk-never-send'), false)
  assert.equal(sentBody.includes('sk-inner'), false)
  assert.deepEqual(JSON.parse(sentBody), {
    data: { favorites: [{ id: 'f1' }] },
    expectedVersion: 2,
  })
})

test('pullSync wraps network failure into UserSyncError with status 0', async () => {
  const fetchMock = async () => {
    throw new Error('offline')
  }
  await assert.rejects(
    () => pullSync('/user-api', fetchMock),
    (err) => {
      assert.ok(err instanceof UserSyncError)
      assert.equal(err.status, 0)
      return true
    },
  )
})

test('register with optional email, updateProfile, and changePassword send expected payloads', async () => {
  const calls = []
  const mockUser = {
    id: 'u2',
    username: 'bob',
    email: 'bob@example.com',
    role: 'user',
    tier: 'free',
    tierExpiresAt: null,
    disabled: false,
    createdAt: 1,
    updatedAt: 2,
  }
  const fetchMock = async (url, init) => {
    calls.push({ url, method: init?.method, body: JSON.parse(String(init?.body || '{}')) })
    return jsonResponse({ ok: true, user: mockUser }, 200)
  }

  const u1 = await register('bob', 'Password123!', '/user-api', fetchMock, 'bob@example.com')
  assert.equal(u1.email, 'bob@example.com')

  const u2 = await updateProfile('new@example.com', '/user-api', fetchMock)
  assert.equal(u2.id, 'u2')

  const u3 = await changePassword('Password123!', 'NewPass456!', '/user-api', fetchMock)
  assert.equal(u3.id, 'u2')

  const r1 = await requestPasswordReset('bob@example.com', '/user-api', fetchMock)
  assert.equal(r1.ok, true)

  const r2 = await confirmPasswordReset('bob@example.com', '123456', 'ResetPass789!', '/user-api', fetchMock)
  assert.equal(r2.ok, true)

  assert.deepEqual(calls, [
    {
      url: '/user-api/register',
      method: 'POST',
      body: { username: 'bob', password: 'Password123!', email: 'bob@example.com' },
    },
    {
      url: '/user-api/me/profile',
      method: 'PATCH',
      body: { email: 'new@example.com' },
    },
    {
      url: '/user-api/me/password',
      method: 'POST',
      body: { currentPassword: 'Password123!', newPassword: 'NewPass456!' },
    },
    {
      url: '/user-api/password-reset/request',
      method: 'POST',
      body: { email: 'bob@example.com' },
    },
    {
      url: '/user-api/password-reset/confirm',
      method: 'POST',
      body: { email: 'bob@example.com', code: '123456', newPassword: 'ResetPass789!' },
    },
  ])
})

test('extension runtime resolves goprmpt.net baseUrl and authenticates with stored Bearer token', async () => {
  const prevWindow = globalThis.window
  const storage = new Map()
  globalThis.window = {
    location: { protocol: 'chrome-extension:' },
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
  }

  try {
    assert.equal(isExtensionRuntime(), true)
    assert.equal(resolveDefaultSyncBaseUrl(), EXTENSION_SYNC_BASE_URL)

    // Without token stored, getMe skips network call and returns null
    let fetchCalls = 0
    const emptyMe = await getMe(EXTENSION_SYNC_BASE_URL, async () => {
      fetchCalls += 1
      return jsonResponse({})
    })
    assert.equal(emptyMe, null)
    assert.equal(fetchCalls, 0)

    const seen = []
    const fetchMock = async (url, init) => {
      seen.push({ url, credentials: init?.credentials, headers: init?.headers })
      if (url.endsWith('/login')) {
        return jsonResponse({
          user: { id: 'u9', username: 'extuser', role: 'user', tier: 'free', tierExpiresAt: null, disabled: false, createdAt: 1, updatedAt: 1 },
          token: 'ext_signed_token_xyz',
        })
      }
      if (url.endsWith('/me')) {
        return jsonResponse({
          user: { id: 'u9', username: 'extuser', role: 'user', tier: 'free', tierExpiresAt: null, disabled: false, createdAt: 1, updatedAt: 1 },
        })
      }
      return jsonResponse({ ok: true })
    }

    const user = await login('extuser', 'Password123!', EXTENSION_SYNC_BASE_URL, fetchMock)
    assert.equal(user.username, 'extuser')

    const me = await getMe(EXTENSION_SYNC_BASE_URL, fetchMock)
    assert.equal(me?.username, 'extuser')

    await logout(EXTENSION_SYNC_BASE_URL, fetchMock)

    assert.equal(seen[0].credentials, 'omit')
    assert.equal(seen[0].headers['X-Client-Type'], 'extension')
    assert.equal(seen[1].headers.Authorization, 'Bearer ext_signed_token_xyz')
    assert.equal(storage.size, 0)
  } finally {
    if (prevWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = prevWindow
    }
  }
})
