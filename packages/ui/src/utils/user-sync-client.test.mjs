import test from 'node:test'
import assert from 'node:assert/strict'
import {
  UserSyncError,
  getConfig,
  getMe,
  login,
  logout,
  pullSync,
  pushSync,
  register,
  stripSecretsForSync,
  toDataManagerImportEnvelope,
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
