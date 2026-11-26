import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ALLOWED_COMMENT_IMAGE_MIMES,
  EXTENSION_SYNC_BASE_URL,
  MAX_COMMENT_IMAGE_BYTES,
  UserSyncError,
  announcementDismissKey,
  changePassword,
  confirmPasswordReset,
  createAnnouncementComment,
  deleteAnnouncementComment,
  getActiveAnnouncements,
  getAnnouncementComments,
  getConfig,
  getCredits,
  getMe,
  getModelPresets,
  getPlatformModels,
  getStoredExtensionToken,
  hydrateExtensionToken,
  isExtensionRuntime,
  login,
  logout,
  pullSync,
  pushSync,
  register,
  requestEmailVerifyCode,
  requestPasswordReset,
  resolveCommentImageUrl,
  resolveDefaultSyncBaseUrl,
  resolvePlatformAiBaseUrl,
  safeAnnouncementUrl,
  stripSecretsForSync,
  toDataManagerImportEnvelope,
  updateProfile,
  validateCommentImageFile,
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

test('announcementDismissKey and safeAnnouncementUrl validate keys and protocols', () => {
  assert.equal(announcementDismissKey({ id: 'ann-1', updatedAt: 1700000001 }), 'ann-1:1700000001')
  assert.notEqual(
    announcementDismissKey({ id: 'ann-1', updatedAt: 1700000001 }),
    announcementDismissKey({ id: 'ann-1', updatedAt: 1700000002 }),
  )

  assert.equal(safeAnnouncementUrl('https://goprmpt.com/guide/'), 'https://goprmpt.com/guide/')
  assert.equal(safeAnnouncementUrl('  http://example.com/promo?a=1  '), 'http://example.com/promo?a=1')
  assert.equal(safeAnnouncementUrl('javascript:alert(1)'), null)
  assert.equal(safeAnnouncementUrl('data:text/html,<script>alert(1)</script>'), null)
  assert.equal(safeAnnouncementUrl('vbscript:msgbox(1)'), null)
  assert.equal(safeAnnouncementUrl('/relative/path'), null)
  assert.equal(safeAnnouncementUrl(''), null)
  assert.equal(safeAnnouncementUrl(null), null)
  assert.equal(safeAnnouncementUrl(undefined), null)
  assert.equal(safeAnnouncementUrl(123), null)
})

test('getActiveAnnouncements parses items, sanitizes links, handles empty shapes, and throws on HTTP error', async () => {
  const seenUrls = []
  const queue = [
    jsonResponse({
      announcements: [
        {
          id: 'a1',
          title: '春季活动',
          content: '全新 151 条词库上线',
          type: 'activity',
          linkUrl: 'https://goprmpt.com/library/',
          linkText: '立即查看',
          isActive: true,
          isPinned: true,
          expiresAt: null,
          commentCount: 4,
          createdAt: 100,
          updatedAt: 200,
        },
        {
          id: 'a2',
          title: '不安全链接测试',
          content: '协议应被剥离',
          type: 'unknown-type',
          linkUrl: 'javascript:alert(1)',
          linkText: '点击',
          isActive: true,
          isPinned: false,
          expiresAt: 9999999999999,
          createdAt: 10,
          updatedAt: 20,
        },
        { id: '', title: '无 ID 应跳过' },
        null,
      ],
    }),
    jsonResponse({}),
    jsonResponse({ announcements: null }),
    jsonResponse({ error: '服务暂不可用' }, 503),
  ]

  const fetchMock = async (url) => {
    seenUrls.push(url)
    return queue.shift()
  }

  const list = await getActiveAnnouncements('/user-api/', fetchMock)
  assert.equal(seenUrls[0], '/user-api/announcements/active')
  assert.equal(list.length, 2)
  assert.deepEqual(list[0], {
    id: 'a1',
    title: '春季活动',
    content: '全新 151 条词库上线',
    type: 'activity',
    linkUrl: 'https://goprmpt.com/library/',
    linkText: '立即查看',
    isActive: true,
    isPinned: true,
    expiresAt: null,
    commentCount: 4,
    createdAt: 100,
    updatedAt: 200,
  })
  assert.equal(list[1].type, 'notice')
  assert.equal(list[1].linkUrl, null)
  assert.equal(list[1].commentCount, 0)

  assert.deepEqual(await getActiveAnnouncements('/user-api', fetchMock), [])
  assert.deepEqual(await getActiveAnnouncements('/user-api', fetchMock), [])

  await assert.rejects(
    () => getActiveAnnouncements('/user-api', fetchMock),
    (err) => {
      assert.ok(err instanceof UserSyncError)
      assert.equal(err.status, 503)
      assert.equal(err.message, '服务暂不可用')
      return true
    },
  )
})

test('getActiveAnnouncements works in extension runtime with goprmpt.net baseUrl', async () => {
  const prevWindow = globalThis.window
  globalThis.window = {
    location: { protocol: 'chrome-extension:' },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
  }

  try {
    const seen = []
    const fetchMock = async (url, init) => {
      seen.push({ url, credentials: init?.credentials, headers: init?.headers })
      return jsonResponse({
        announcements: [
          {
            id: 'ext-1',
            title: '维护通知',
            content: '今晚维护 5 分钟',
            type: 'maintenance',
            linkUrl: null,
            linkText: null,
            isActive: true,
            isPinned: false,
            expiresAt: null,
            createdAt: 1,
            updatedAt: 2,
          },
        ],
      })
    }

    const items = await getActiveAnnouncements(resolveDefaultSyncBaseUrl(), fetchMock)
    assert.equal(items.length, 1)
    assert.equal(items[0].id, 'ext-1')
    assert.equal(seen[0].url, `${EXTENSION_SYNC_BASE_URL}/announcements/active`)
    assert.equal(seen[0].credentials, 'omit')
    assert.equal(seen[0].headers['X-Client-Type'], 'extension')
  } finally {
    if (prevWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = prevWindow
    }
  }
})

test('resolvePlatformAiBaseUrl and getStoredExtensionToken handle web and extension runtimes', async () => {
  const prevWindow = globalThis.window
  const storage = new Map()

  try {
    // Web runtime with same-origin relative baseUrl
    globalThis.window = {
      location: { protocol: 'https:', origin: 'https://goprmpt.net' },
      localStorage: {
        getItem: (k) => (storage.has(k) ? storage.get(k) : null),
        setItem: (k, v) => storage.set(k, String(v)),
        removeItem: (k) => storage.delete(k),
      },
    }
    assert.equal(getStoredExtensionToken(), '')
    assert.equal(resolvePlatformAiBaseUrl(), 'https://goprmpt.net/user-api/ai/v1')
    assert.equal(resolvePlatformAiBaseUrl('/user-api/'), 'https://goprmpt.net/user-api/ai/v1')
    assert.equal(
      resolvePlatformAiBaseUrl('https://custom.example.com/user-api/'),
      'https://custom.example.com/user-api/ai/v1',
    )

    // Extension runtime with stored token
    globalThis.window = {
      location: { protocol: 'chrome-extension:', origin: 'chrome-extension://abcdef' },
      localStorage: {
        getItem: (k) => (storage.has(k) ? storage.get(k) : null),
        setItem: (k, v) => storage.set(k, String(v)),
        removeItem: (k) => storage.delete(k),
      },
    }
    assert.equal(resolvePlatformAiBaseUrl(), 'https://goprmpt.net/user-api/ai/v1')
    assert.equal(getStoredExtensionToken(), '')

    await login('extuser', 'Password123!', EXTENSION_SYNC_BASE_URL, async () =>
      jsonResponse({
        user: {
          id: 'u1',
          username: 'extuser',
          role: 'user',
          tier: 'standard',
          tierExpiresAt: null,
          disabled: false,
          createdAt: 1,
          updatedAt: 1,
        },
        token: 'ext_bearer_123',
      }),
    )
    assert.equal(getStoredExtensionToken(), 'ext_bearer_123')
  } finally {
    if (prevWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = prevWindow
    }
  }
})

test('getCredits normalizes response, clamps numbers, and skips malformed ledger rows', async () => {
  const seen = []
  const fetchMock = async (url, init) => {
    seen.push({ url, method: init?.method })
    return jsonResponse({
      balance: 245,
      tier: 'pro',
      effectiveTier: 'pro',
      tierExpiresAt: 1900000000000,
      monthlyAllowance: 500,
      currentMonth: '2026-11',
      grantedThisMonth: 500,
      monthlyCredits: { free: 0, standard: 100, pro: 500, internal: 1000 },
      ledger: [
        {
          id: 'l1',
          delta: 500,
          balanceAfter: 500,
          reason: 'monthly_grant',
          modelId: null,
          note: '2026-11 月度赠送',
          createdAt: 1700000001000,
        },
        {
          id: 'l2',
          delta: -5,
          balanceAfter: 495,
          reason: 'model_usage',
          modelId: 'deepseek-chat',
          note: null,
          createdAt: 1700000002000,
        },
        { id: '', delta: 10 },
        null,
      ],
    })
  }

  const res = await getCredits('/user-api/', fetchMock)
  assert.deepEqual(seen, [{ url: '/user-api/credits', method: 'GET' }])
  assert.equal(res.balance, 245)
  assert.equal(res.tier, 'pro')
  assert.equal(res.effectiveTier, 'pro')
  assert.equal(res.monthlyAllowance, 500)
  assert.equal(res.grantedThisMonth, 500)
  assert.deepEqual(res.monthlyCredits, { free: 0, standard: 100, pro: 500, internal: 1000 })
  assert.equal(res.ledger.length, 2)
  assert.equal(res.ledger[1].modelId, 'deepseek-chat')
  assert.equal(res.ledger[1].delta, -5)
})

test('getPlatformModels normalizes fields, strips unsafe applyUrl, and sorts by sortOrder', async () => {
  const fetchMock = async () =>
    jsonResponse({
      models: [
        {
          id: 'glm-4.5',
          name: '智谱 GLM-4.5',
          providerLabel: '智谱 AI',
          creditCost: 2,
          minTier: 'standard',
          defaultParams: { temperature: 0.6 },
          applyUrl: 'javascript:alert(1)',
          description: '平台托管',
          sortOrder: 20,
          accessible: true,
          accessReason: null,
        },
        {
          id: 'deepseek-v3',
          name: 'DeepSeek V3',
          providerLabel: 'DeepSeek',
          creditCost: 1,
          minTier: 'free',
          defaultParams: { temperature: 0.7 },
          applyUrl: 'https://platform.deepseek.com/api_keys',
          description: null,
          sortOrder: 10,
          accessible: false,
          accessReason: '请先登录',
        },
        { id: '', name: 'missing-id' },
      ],
    })

  const models = await getPlatformModels('/user-api', fetchMock)
  assert.equal(models.length, 2)
  assert.equal(models[0].id, 'deepseek-v3')
  assert.equal(models[0].applyUrl, 'https://platform.deepseek.com/api_keys')
  assert.equal(models[0].accessible, false)
  assert.equal(models[0].accessReason, '请先登录')
  assert.equal(models[1].id, 'glm-4.5')
  assert.equal(models[1].applyUrl, null)
  assert.equal(models[1].accessible, true)
  assert.deepEqual(models[1].defaultParams, { temperature: 0.6 })
})

test('getModelPresets normalizes domestic presets and rejects non-http apply URLs', async () => {
  const fetchMock = async () =>
    jsonResponse({
      presets: [
        {
          providerId: 'deepseek',
          name: 'DeepSeek',
          category: 'text',
          applyUrl: 'https://promo.example.com/deepseek',
          customApplyUrl: 'https://promo.example.com/deepseek',
          defaultApplyUrl: 'https://platform.deepseek.com/api_keys',
          applyLabel: '领 10 元优惠 Key',
          defaultModelId: 'deepseek-chat',
          defaultParams: { temperature: 0.5, max_tokens: 4096 },
          enabled: true,
          updatedAt: 1700000000000,
        },
        {
          providerId: 'dashscope',
          name: '通义千问',
          category: 'both',
          applyUrl: 'data:text/html,evil',
          customApplyUrl: 'javascript:void(0)',
          defaultApplyUrl: 'https://bailian.console.aliyun.com/',
          applyLabel: '',
          defaultModelId: '',
          defaultParams: 'invalid',
          enabled: false,
          updatedAt: null,
        },
        { providerId: '' },
      ],
    })

  const presets = await getModelPresets('/user-api', fetchMock)
  assert.equal(presets.length, 2)
  assert.deepEqual(presets[0], {
    providerId: 'deepseek',
    name: 'DeepSeek',
    category: 'text',
    applyUrl: 'https://promo.example.com/deepseek',
    customApplyUrl: 'https://promo.example.com/deepseek',
    defaultApplyUrl: 'https://platform.deepseek.com/api_keys',
    applyLabel: '领 10 元优惠 Key',
    defaultModelId: 'deepseek-chat',
    defaultParams: { temperature: 0.5, max_tokens: 4096 },
    featured: false,
    enabled: true,
    updatedAt: 1700000000000,
  })
  assert.equal(presets[1].providerId, 'dashscope')
  assert.equal(presets[1].category, 'both')
  assert.equal(presets[1].applyUrl, null)
  assert.equal(presets[1].customApplyUrl, null)
  assert.equal(presets[1].defaultApplyUrl, 'https://bailian.console.aliyun.com/')
  assert.equal(presets[1].applyLabel, '申请 API Key')
  assert.equal(presets[1].defaultModelId, null)
  assert.deepEqual(presets[1].defaultParams, {})
  assert.equal(presets[1].featured, false)
  assert.equal(presets[1].enabled, false)
})

test('getModelPresets normalizes featured siliconflow preset and default featured applyLabel', async () => {
  const fetchMock = async () =>
    jsonResponse({
      presets: [
        {
          providerId: 'siliconflow',
          name: '硅基流动',
          category: 'both',
          applyUrl: 'https://cloud.siliconflow.cn/i/promo',
          customApplyUrl: 'https://cloud.siliconflow.cn/i/promo',
          defaultApplyUrl: 'https://cloud.siliconflow.cn/account/ak',
          applyLabel: '',
          defaultModelId: 'Qwen/Qwen2.5-72B-Instruct',
          defaultParams: { temperature: 0.7 },
          featured: true,
          enabled: true,
          updatedAt: 1700000005000,
        },
      ],
    })

  const presets = await getModelPresets('/user-api', fetchMock)
  assert.equal(presets.length, 1)
  assert.equal(presets[0].providerId, 'siliconflow')
  assert.equal(presets[0].featured, true)
  assert.equal(presets[0].applyLabel, '主推 · 申请领免费额度')
})

test('announcement comments client lists, creates, deletes, normalizes fields, and propagates 401', async () => {
  const calls = []
  const queue = [
    jsonResponse({
      comments: [
        {
          id: 'c1',
          announcementId: 'ann/1',
          userId: 'u-admin',
          username: 'admin',
          role: 'admin',
          tier: 'internal',
          effectiveTier: 'internal',
          content: '欢迎留言反馈！',
          createdAt: 1750000002000,
        },
        {
          id: 'c2',
          announcementId: 'ann/1',
          userId: 'u-2',
          username: 'bob',
          role: 'weird-role',
          tier: 'pro',
          content: '第二条评论\n支持换行',
          createdAt: 1750000001000,
        },
        { id: '', announcementId: 'ann/1', username: 'bad', content: 'skip' },
        { id: 'c-empty', announcementId: 'ann/1', username: 'bob', content: '   ' },
        null,
      ],
      commentCount: 2,
    }),
    jsonResponse(
      {
        comment: {
          id: 'c3',
          announcementId: 'ann/1',
          userId: 'u-3',
          username: 'alice',
          role: 'user',
          tier: 'standard',
          effectiveTier: 'standard',
          content: '新发表的建议',
          createdAt: 1750000003000,
        },
        commentCount: 3,
      },
      201,
    ),
    jsonResponse({ ok: true, commentCount: 2 }, 200),
    jsonResponse({ error: '请先登录' }, 401),
  ]

  const fetchMock = async (url, init) => {
    calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return queue.shift()
  }

  const listRes = await getAnnouncementComments('ann/1', '/user-api/', fetchMock)
  assert.equal(listRes.commentCount, 2)
  assert.equal(listRes.comments.length, 2)
  assert.deepEqual(listRes.comments[0], {
    id: 'c1',
    announcementId: 'ann/1',
    userId: 'u-admin',
    username: 'admin',
    role: 'admin',
    tier: 'internal',
    effectiveTier: 'internal',
    content: '欢迎留言反馈！',
    imageId: null,
    imageUrl: null,
    imageMime: null,
    imageSize: null,
    createdAt: 1750000002000,
  })
  assert.equal(listRes.comments[1].role, 'user')
  assert.equal(listRes.comments[1].effectiveTier, 'pro')
  assert.equal(listRes.comments[1].content, '第二条评论\n支持换行')

  const createRes = await createAnnouncementComment('ann/1', '新发表的建议', '/user-api', fetchMock)
  assert.equal(createRes.commentCount, 3)
  assert.equal(createRes.comment.id, 'c3')
  assert.equal(createRes.comment.effectiveTier, 'standard')

  const delRes = await deleteAnnouncementComment('ann/1', 'c/3', '/user-api', fetchMock)
  assert.deepEqual(delRes, { ok: true, commentCount: 2 })

  await assert.rejects(
    () => createAnnouncementComment('ann/1', 'guest', '/user-api', fetchMock),
    (err) => err instanceof UserSyncError && err.status === 401,
  )

  assert.deepEqual(calls, [
    { url: '/user-api/announcements/ann%2F1/comments', method: 'GET', body: undefined },
    {
      url: '/user-api/announcements/ann%2F1/comments',
      method: 'POST',
      body: { content: '新发表的建议' },
    },
    { url: '/user-api/announcements/ann%2F1/comments/c%2F3', method: 'DELETE', body: undefined },
    {
      url: '/user-api/announcements/ann%2F1/comments',
      method: 'POST',
      body: { content: 'guest' },
    },
  ])
})

test('validateCommentImageFile enforces allowed image mimes, rejects SVG/PDF/empty, and caps at 2MB', () => {
  assert.equal(MAX_COMMENT_IMAGE_BYTES, 2 * 1024 * 1024)
  assert.deepEqual(ALLOWED_COMMENT_IMAGE_MIMES, [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
  ])

  for (const mime of ALLOWED_COMMENT_IMAGE_MIMES) {
    assert.deepEqual(validateCommentImageFile({ type: mime, size: 1024, name: 'photo.img' }), {
      ok: true,
    })
  }
  assert.deepEqual(
    validateCommentImageFile({ type: 'image/png', size: MAX_COMMENT_IMAGE_BYTES, name: 'exact.png' }),
    { ok: true },
  )

  const svgMime = validateCommentImageFile({ type: 'image/svg+xml', size: 512, name: 'icon.svg' })
  assert.equal(svgMime.ok, false)
  assert.match(svgMime.error, /SVG/)

  const svgSpoofed = validateCommentImageFile({ type: 'image/png', size: 512, name: 'evil.SVG' }, true)
  assert.equal(svgSpoofed.ok, false)
  assert.match(svgSpoofed.error, /SVG/)

  const pdfFile = validateCommentImageFile({ type: 'application/pdf', size: 1024, name: 'doc.pdf' })
  assert.equal(pdfFile.ok, false)
  assert.match(pdfFile.error, /PNG/)

  const emptyFile = validateCommentImageFile({ type: 'image/png', size: 0, name: 'empty.png' })
  assert.equal(emptyFile.ok, false)

  const oversizedZh = validateCommentImageFile({
    type: 'image/jpeg',
    size: MAX_COMMENT_IMAGE_BYTES + 1,
    name: 'huge.jpg',
  })
  assert.equal(oversizedZh.ok, false)
  assert.match(oversizedZh.error, /2MB/)

  const oversizedEn = validateCommentImageFile(
    { type: 'image/webp', size: MAX_COMMENT_IMAGE_BYTES + 10, name: 'huge.webp' },
    true,
  )
  assert.equal(oversizedEn.ok, false)
  assert.match(oversizedEn.error, /2MB/)
})

test('resolveCommentImageUrl validates paths, resolves extension baseUrl, and rejects unsafe URLs', () => {
  assert.equal(
    resolveCommentImageUrl('/user-api/announcements/comment-images/img-abc123'),
    '/user-api/announcements/comment-images/img-abc123',
  )
  assert.equal(
    resolveCommentImageUrl('/user-api/announcements/comment-images/img-abc123', '/user-api'),
    '/user-api/announcements/comment-images/img-abc123',
  )
  assert.equal(
    resolveCommentImageUrl('/user-api/announcements/comment-images/img-abc123', EXTENSION_SYNC_BASE_URL),
    'https://goprmpt.net/user-api/announcements/comment-images/img-abc123',
  )
  assert.equal(
    resolveCommentImageUrl('https://goprmpt.net/user-api/announcements/comment-images/img-99'),
    'https://goprmpt.net/user-api/announcements/comment-images/img-99',
  )
  assert.equal(
    resolveCommentImageUrl(
      'https://staging.example.com/user-api/announcements/comment-images/img-42',
      'https://staging.example.com/user-api',
    ),
    'https://staging.example.com/user-api/announcements/comment-images/img-42',
  )

  const unsafeInputs = [
    'javascript:alert(1)',
    'data:image/png;base64,iVBORw0KGgo=',
    'https://evil.com/user-api/announcements/comment-images/img-1',
    'http://goprmpt.net/user-api/announcements/comment-images/img-1',
    '//goprmpt.net/user-api/announcements/comment-images/img-1',
    '/user-api/announcements/comment-images/img-1?token=leak',
    '/user-api/announcements/comment-images/img-1#frag',
    '/user-api/announcements/comment-images/../secret',
    'https://goprmpt.net/user-api/announcements/comment-images/a/../b',
    '/other/path/img-1',
    '',
    null,
    undefined,
    42,
  ]
  for (const bad of unsafeInputs) {
    assert.equal(resolveCommentImageUrl(bad), null, `expected null for ${String(bad)}`)
  }
})

test('createAnnouncementComment and getAnnouncementComments support image payloads and extension URL resolution', async () => {
  const calls = []
  const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  const queue = [
    jsonResponse(
      {
        comment: {
          id: 'c-img-1',
          announcementId: 'ann-1',
          userId: 'u-1',
          username: 'alice',
          role: 'user',
          tier: 'pro',
          effectiveTier: 'pro',
          content: '',
          imageId: 'img-101',
          imageUrl: '/user-api/announcements/comment-images/img-101',
          imageMime: 'image/png',
          imageSize: 68,
          createdAt: 1750000100000,
        },
        commentCount: 1,
      },
      201,
    ),
    jsonResponse({
      comments: [
        {
          id: 'c-img-1',
          announcementId: 'ann-1',
          userId: 'u-1',
          username: 'alice',
          role: 'user',
          tier: 'pro',
          effectiveTier: 'pro',
          content: '',
          imageId: 'img-101',
          imageUrl: '/user-api/announcements/comment-images/img-101',
          imageMime: 'image/png',
          imageSize: 68,
          createdAt: 1750000100000,
        },
        {
          id: 'c-bad-img',
          announcementId: 'ann-1',
          userId: 'u-2',
          username: 'mallory',
          role: 'user',
          tier: 'free',
          effectiveTier: 'free',
          content: '附带恶意图片应被剥离',
          imageId: 'evil-1',
          imageUrl: 'javascript:alert(1)',
          imageMime: 'image/png',
          imageSize: 100,
          createdAt: 1750000090000,
        },
        {
          id: 'c-only-bad-img',
          announcementId: 'ann-1',
          userId: 'u-2',
          username: 'mallory',
          role: 'user',
          tier: 'free',
          effectiveTier: 'free',
          content: '   ',
          imageId: 'evil-2',
          imageUrl: 'https://evil.example/x.png',
          imageMime: 'image/png',
          imageSize: 100,
          createdAt: 1750000080000,
        },
      ],
      commentCount: 2,
    }),
  ]

  const fetchMock = async (url, init) => {
    calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return queue.shift()
  }

  const created = await createAnnouncementComment(
    'ann-1',
    { content: '', image: { dataUrl } },
    EXTENSION_SYNC_BASE_URL,
    fetchMock,
  )
  assert.equal(created.commentCount, 1)
  assert.equal(created.comment.content, '')
  assert.equal(created.comment.imageId, 'img-101')
  assert.equal(
    created.comment.imageUrl,
    'https://goprmpt.net/user-api/announcements/comment-images/img-101',
  )
  assert.equal(created.comment.imageMime, 'image/png')
  assert.equal(created.comment.imageSize, 68)

  const listed = await getAnnouncementComments('ann-1', EXTENSION_SYNC_BASE_URL, fetchMock)
  assert.equal(listed.comments.length, 2)
  assert.equal(
    listed.comments[0].imageUrl,
    'https://goprmpt.net/user-api/announcements/comment-images/img-101',
  )
  assert.equal(listed.comments[1].id, 'c-bad-img')
  assert.equal(listed.comments[1].imageUrl, null)
  assert.equal(listed.comments[1].imageId, null)
  assert.equal(listed.comments[1].imageMime, null)
  assert.equal(listed.comments[1].imageSize, null)

  assert.deepEqual(calls[0], {
    url: `${EXTENSION_SYNC_BASE_URL}/announcements/ann-1/comments`,
    method: 'POST',
    body: { content: '', image: { dataUrl } },
  })
})

test('extension runtime stores sync token in chrome.storage.local and migrates legacy localStorage token', async () => {
  const prevWindow = globalThis.window
  const prevChrome = globalThis.chrome

  const localStore = new Map()
  const chromeStore = new Map()
  const createChromeLocal = (map) => ({
    get: async (key) => {
      const keys = Array.isArray(key) ? key : [key]
      const out = {}
      for (const k of keys) {
        if (map.has(k)) out[k] = map.get(k)
      }
      return out
    },
    set: async (items) => {
      for (const [k, v] of Object.entries(items)) {
        map.set(k, v)
      }
    },
    remove: async (key) => {
      const keys = Array.isArray(key) ? key : [key]
      for (const k of keys) {
        map.delete(k)
      }
    },
  })

  globalThis.window = {
    location: { protocol: 'chrome-extension:', origin: 'chrome-extension://ijhpdghdlhlfolpnbkjojglpolngpajc' },
    localStorage: {
      getItem: (k) => (localStore.has(k) ? localStore.get(k) : null),
      setItem: (k, v) => localStore.set(k, String(v)),
      removeItem: (k) => localStore.delete(k),
    },
  }
  globalThis.chrome = { storage: { local: createChromeLocal(chromeStore) } }

  try {
    // 1. Legacy token in localStorage migrates into chrome.storage.local and is removed from localStorage
    localStore.set('goprmpt_extension_sync_token', 'legacy_tok_123')
    const seenHeaders = []
    const fetchMock = async (url, init) => {
      seenHeaders.push({ url, authorization: init?.headers?.Authorization })
      if (url.endsWith('/me')) {
        return jsonResponse({
          user: {
            id: 'u-mig',
            username: 'migrated',
            role: 'user',
            tier: 'free',
            tierExpiresAt: null,
            disabled: false,
            createdAt: 1,
            updatedAt: 1,
          },
        })
      }
      if (url.endsWith('/login')) {
        return jsonResponse({
          user: {
            id: 'u-new',
            username: 'fresh',
            role: 'user',
            tier: 'standard',
            tierExpiresAt: null,
            disabled: false,
            createdAt: 1,
            updatedAt: 1,
          },
          token: 'chrome_storage_tok_456',
        })
      }
      return jsonResponse({ ok: true })
    }

    const me = await getMe(EXTENSION_SYNC_BASE_URL, fetchMock)
    assert.equal(me?.username, 'migrated')
    assert.equal(seenHeaders[0].authorization, 'Bearer legacy_tok_123')
    assert.equal(chromeStore.get('goprmpt_extension_sync_token'), 'legacy_tok_123')
    assert.equal(localStore.has('goprmpt_extension_sync_token'), false)
    assert.equal(getStoredExtensionToken(), 'legacy_tok_123')

    // 2. Login overwrites chrome.storage.local without leaving any copy in localStorage
    await login('fresh', 'Password123!', EXTENSION_SYNC_BASE_URL, fetchMock)
    assert.equal(chromeStore.get('goprmpt_extension_sync_token'), 'chrome_storage_tok_456')
    assert.equal(localStore.has('goprmpt_extension_sync_token'), false)
    assert.equal(getStoredExtensionToken(), 'chrome_storage_tok_456')
    assert.equal(await hydrateExtensionToken(), 'chrome_storage_tok_456')

    // 3. Logout removes token from chrome.storage.local and clears cached token
    await logout(EXTENSION_SYNC_BASE_URL, fetchMock)
    assert.equal(chromeStore.has('goprmpt_extension_sync_token'), false)
    assert.equal(localStore.has('goprmpt_extension_sync_token'), false)
    assert.equal(getStoredExtensionToken(), '')
  } finally {
    if (prevWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = prevWindow
    }
    if (prevChrome === undefined) {
      delete globalThis.chrome
    } else {
      globalThis.chrome = prevChrome
    }
  }
})

test('requestEmailVerifyCode and updateProfile with verificationCode send expected payloads', async () => {
  const calls = []
  const mockUser = {
    id: 'u-email',
    username: 'alice',
    email: 'verified@example.com',
    role: 'user',
    tier: 'free',
    tierExpiresAt: null,
    disabled: false,
    createdAt: 1,
    updatedAt: 2,
  }
  const fetchMock = async (url, init) => {
    calls.push({ url, method: init?.method, body: JSON.parse(String(init?.body || '{}')) })
    if (url.endsWith('/me/email/request-code')) {
      return jsonResponse({ ok: true, message: 'sent' }, 200)
    }
    return jsonResponse({ user: mockUser }, 200)
  }

  const codeRes = await requestEmailVerifyCode('verified@example.com', '/user-api', fetchMock)
  assert.deepEqual(codeRes, { ok: true, message: 'sent' })

  const updated = await updateProfile('verified@example.com', '/user-api', fetchMock, '654321')
  assert.equal(updated.email, 'verified@example.com')

  assert.deepEqual(calls, [
    {
      url: '/user-api/me/email/request-code',
      method: 'POST',
      body: { email: 'verified@example.com' },
    },
    {
      url: '/user-api/me/profile',
      method: 'PATCH',
      body: { email: 'verified@example.com', verificationCode: '654321' },
    },
  ])
})
