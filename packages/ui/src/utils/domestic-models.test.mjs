import test from 'node:test'
import assert from 'node:assert/strict'
import {
  OVERSEAS_PROVIDER_IDS,
  PLATFORM_MODEL_ID_PREFIX,
  buildPlatformTextModelConfig,
  extractPlatformModelId,
  filterDomesticImageConfigs,
  filterDomesticProviders,
  filterDomesticTextModels,
  isOverseasProvider,
  isPlatformModelId,
  mergePresetDefaultParams,
  resolveProviderApplyLink,
  syncPlatformModelsToManager,
} from './domestic-models.ts'

test('provider and platform ID predicates classify overseas and platform entries', () => {
  for (const id of ['openai', 'OpenAI', 'gemini', 'anthropic', 'openrouter', 'cloudflare', 'grok', 'chrome-built-in']) {
    assert.equal(OVERSEAS_PROVIDER_IDS.has(id.toLowerCase()), true)
    assert.equal(isOverseasProvider(id), true)
  }

  for (const id of ['deepseek', 'zhipu', 'dashscope', 'siliconflow', 'modelscope', 'minimax', 'seedream', 'ollama', 'openai-compatible', '', null, undefined]) {
    assert.equal(isOverseasProvider(id), false)
  }

  assert.equal(PLATFORM_MODEL_ID_PREFIX, 'platform:')
  assert.equal(isPlatformModelId('platform:deepseek-v3'), true)
  assert.equal(isPlatformModelId('platform:'), false)
  assert.equal(isPlatformModelId('deepseek'), false)
  assert.equal(isPlatformModelId(null), false)

  assert.equal(extractPlatformModelId('platform:glm-4.5'), 'glm-4.5')
  assert.equal(extractPlatformModelId('platform:'), null)
  assert.equal(extractPlatformModelId('deepseek'), null)
})

test('filterDomesticProviders strips overseas providers and admin-disabled domestic presets', () => {
  const providers = [
    { id: 'openai', name: 'OpenAI' },
    { id: 'anthropic', name: 'Anthropic' },
    { id: 'gemini', name: 'Gemini' },
    { id: 'openrouter', name: 'OpenRouter' },
    { id: 'cloudflare', name: 'Cloudflare' },
    { id: 'grok', name: 'Grok' },
    { id: 'chrome-built-in', name: 'Chrome AI' },
    { id: 'deepseek', name: 'DeepSeek' },
    { id: 'zhipu', name: '智谱' },
    { id: 'dashscope', name: '通义千问' },
    { id: 'openai-compatible', name: 'Custom' },
  ]

  const presets = new Map([
    [
      'zhipu',
      {
        providerId: 'zhipu',
        name: '智谱',
        category: 'text',
        applyUrl: null,
        customApplyUrl: null,
        defaultApplyUrl: null,
        applyLabel: '申请 API Key',
        defaultModelId: null,
        defaultParams: {},
        enabled: false,
        updatedAt: null,
      },
    ],
  ])

  const filtered = filterDomesticProviders(providers, presets)
  assert.deepEqual(
    filtered.map((p) => p.id),
    ['deepseek', 'dashscope', 'openai-compatible'],
  )
})

test('filterDomesticTextModels keeps platform models, strips overseas, and respects user-enabled override on disabled preset', () => {
  const models = [
    { id: 'platform:deepseek-v3', enabled: true, providerId: 'openai-compatible', providerMeta: { id: 'openai-compatible' } },
    { id: 'openai', enabled: true, providerId: 'openai', providerMeta: { id: 'openai' } },
    { id: 'chrome-built-in', enabled: false, providerId: 'chrome-built-in', providerMeta: { id: 'chrome-built-in' } },
    { id: 'deepseek', enabled: false, providerId: 'deepseek', providerMeta: { id: 'deepseek' } },
    { id: 'zhipu-disabled', enabled: false, providerId: 'zhipu', providerMeta: { id: 'zhipu' } },
    { id: 'zhipu-user-enabled', enabled: true, providerId: 'zhipu', providerMeta: { id: 'zhipu' } },
    { id: 'legacy-gemini', enabled: true, providerMeta: { id: 'gemini' } },
  ]

  const presets = new Map([
    [
      'zhipu',
      {
        providerId: 'zhipu',
        name: '智谱',
        category: 'text',
        applyUrl: null,
        customApplyUrl: null,
        defaultApplyUrl: null,
        applyLabel: '申请 API Key',
        defaultModelId: null,
        defaultParams: {},
        enabled: false,
        updatedAt: null,
      },
    ],
  ])

  const filtered = filterDomesticTextModels(models, presets)
  assert.deepEqual(
    filtered.map((m) => m.id),
    ['platform:deepseek-v3', 'deepseek', 'zhipu-user-enabled'],
  )
})

test('filterDomesticImageConfigs strips overseas image providers and respects disabled preset rule', () => {
  const configs = [
    { id: 'img-openai', enabled: true, providerId: 'openai', provider: { id: 'openai' } },
    { id: 'img-gemini', enabled: true, providerId: 'gemini', provider: { id: 'gemini' } },
    { id: 'img-openrouter', enabled: false, providerId: 'openrouter', provider: { id: 'openrouter' } },
    { id: 'img-cloudflare', enabled: false, providerId: 'cloudflare', provider: { id: 'cloudflare' } },
    { id: 'img-grok', enabled: false, providerId: 'grok', provider: { id: 'grok' } },
    { id: 'img-seedream', enabled: true, providerId: 'seedream', provider: { id: 'seedream' } },
    { id: 'img-dashscope-off', enabled: false, providerId: 'dashscope', provider: { id: 'dashscope' } },
    { id: 'img-dashscope-on', enabled: true, providerId: 'dashscope', provider: { id: 'dashscope' } },
  ]

  const presets = new Map([
    [
      'dashscope',
      {
        providerId: 'dashscope',
        name: '通义万相',
        category: 'both',
        applyUrl: null,
        customApplyUrl: null,
        defaultApplyUrl: null,
        applyLabel: '申请 API Key',
        defaultModelId: null,
        defaultParams: {},
        enabled: false,
        updatedAt: null,
      },
    ],
  ])

  const filtered = filterDomesticImageConfigs(configs, presets)
  assert.deepEqual(
    filtered.map((c) => c.id),
    ['img-seedream', 'img-dashscope-on'],
  )
})

test('resolveProviderApplyLink prioritizes sanitized preset link and falls back safely', () => {
  const presets = new Map([
    [
      'deepseek',
      {
        providerId: 'deepseek',
        name: 'DeepSeek',
        category: 'text',
        applyUrl: 'https://promo.goprmpt.net/deepseek?ref=1',
        customApplyUrl: 'https://promo.goprmpt.net/deepseek?ref=1',
        defaultApplyUrl: 'https://platform.deepseek.com/',
        applyLabel: '领券申请 Key',
        defaultModelId: null,
        defaultParams: {},
        enabled: true,
        updatedAt: null,
      },
    ],
    [
      'unsafe',
      {
        providerId: 'unsafe',
        name: 'Unsafe',
        category: 'text',
        applyUrl: 'javascript:alert(1)',
        customApplyUrl: null,
        defaultApplyUrl: null,
        applyLabel: '',
        defaultModelId: null,
        defaultParams: {},
        enabled: true,
        updatedAt: null,
      },
    ],
  ])

  assert.deepEqual(
    resolveProviderApplyLink('deepseek', 'https://fallback.example.com/', presets),
    {
      url: 'https://promo.goprmpt.net/deepseek?ref=1',
      label: '领券申请 Key',
    },
  )

  assert.deepEqual(
    resolveProviderApplyLink('unsafe', 'https://fallback.example.com/key', presets),
    {
      url: 'https://fallback.example.com/key',
      label: '申请 API Key',
    },
  )

  assert.deepEqual(
    resolveProviderApplyLink('unsafe', 'javascript:void(0)', presets),
    {
      url: null,
      label: '申请 API Key',
    },
  )
})

test('mergePresetDefaultParams merges base defaults with admin preset overrides winning', () => {
  const presets = new Map([
    [
      'deepseek',
      {
        providerId: 'deepseek',
        name: 'DeepSeek',
        category: 'text',
        applyUrl: null,
        customApplyUrl: null,
        defaultApplyUrl: null,
        applyLabel: '申请 API Key',
        defaultModelId: 'deepseek-chat',
        defaultParams: { temperature: 0.4, max_tokens: 8192 },
        enabled: true,
        updatedAt: null,
      },
    ],
  ])

  const merged = mergePresetDefaultParams(
    'deepseek',
    { temperature: 0.7, top_p: 0.9 },
    presets,
  )
  assert.deepEqual(merged, { temperature: 0.4, top_p: 0.9, max_tokens: 8192 })
  assert.deepEqual(mergePresetDefaultParams('unknown', { temperature: 0.7 }, presets), { temperature: 0.7 })
})

test('buildPlatformTextModelConfig constructs a complete openai-compatible config', () => {
  const config = buildPlatformTextModelConfig(
    {
      id: 'deepseek-v3',
      name: 'DeepSeek V3（平台）',
      providerLabel: 'DeepSeek',
      creditCost: 2,
      minTier: 'standard',
      defaultParams: { temperature: 0.6 },
      applyUrl: 'https://platform.deepseek.com/',
      description: '高速推理模型',
      sortOrder: 1,
      accessible: true,
      accessReason: null,
    },
    { baseURL: 'https://goprmpt.net/user-api/ai/v1', apiKey: '' },
  )

  assert.equal(config.id, 'platform:deepseek-v3')
  assert.equal(config.name, 'DeepSeek V3（平台）')
  assert.equal(config.enabled, true)
  assert.equal(config.providerId, 'openai-compatible')
  assert.equal(config.modelId, 'deepseek-v3')
  assert.equal(config.providerMeta.id, 'openai-compatible')
  assert.equal(config.providerMeta.name, 'DeepSeek')
  assert.equal(config.providerMeta.requiresApiKey, false)
  assert.equal(config.providerMeta.supportsDynamicModels, false)
  assert.equal(config.providerMeta.defaultBaseURL, 'https://goprmpt.net/user-api/ai/v1')
  assert.equal(config.modelMeta.id, 'deepseek-v3')
  assert.equal(config.modelMeta.description, '高速推理模型')
  assert.deepEqual(config.modelMeta.defaultParameterValues, { temperature: 0.6 })
  assert.deepEqual(config.connectionConfig, {
    baseURL: 'https://goprmpt.net/user-api/ai/v1',
    apiKey: '',
    requestStyle: 'chat_completions',
  })
  assert.deepEqual(config.paramOverrides, { temperature: 0.6 })
})

test('syncPlatformModelsToManager is idempotent, preserves user toggles & BYOK models, and cleans up on logout', async () => {
  const store = new Map([
    [
      'my-byok-deepseek',
      {
        id: 'my-byok-deepseek',
        name: 'My DeepSeek',
        enabled: true,
        providerId: 'deepseek',
        modelId: 'deepseek-chat',
        providerMeta: { id: 'deepseek', name: 'DeepSeek' },
        modelMeta: { id: 'deepseek-chat', name: 'DeepSeek Chat', providerId: 'deepseek' },
        connectionConfig: { apiKey: 'sk-user-local-secret', baseURL: 'https://api.deepseek.com/v1' },
        paramOverrides: { temperature: 0.8 },
      },
    ],
  ])

  const calls = { add: 0, update: 0, delete: 0 }
  const modelManager = {
    getAllModels: async () => Array.from(store.values()),
    addModel: async (key, cfg) => {
      calls.add += 1
      store.set(key, structuredClone(cfg))
    },
    updateModel: async (key, updates) => {
      calls.update += 1
      const prev = store.get(key)
      store.set(key, structuredClone({ ...prev, ...updates }))
    },
    deleteModel: async (key) => {
      calls.delete += 1
      store.delete(key)
    },
  }

  const platformCatalog = [
    {
      id: 'ds-chat',
      name: 'DeepSeek 平台版',
      providerLabel: 'DeepSeek',
      creditCost: 1,
      minTier: 'standard',
      defaultParams: { temperature: 0.5 },
      applyUrl: null,
      description: null,
      sortOrder: 1,
      accessible: true,
      accessReason: null,
    },
    {
      id: 'pro-only',
      name: 'Pro 专属模型',
      providerLabel: '智谱',
      creditCost: 5,
      minTier: 'pro',
      defaultParams: {},
      applyUrl: null,
      description: null,
      sortOrder: 2,
      accessible: false,
      accessReason: '仅专业会员可用',
    },
  ]

  // First sync adds accessible model only and leaves BYOK untouched
  const firstChanged = await syncPlatformModelsToManager(modelManager, platformCatalog, {
    baseURL: 'https://goprmpt.net/user-api/ai/v1',
    apiKey: '',
    loggedIn: true,
  })
  assert.equal(firstChanged, true)
  assert.equal(calls.add, 1)
  assert.equal(store.has('platform:ds-chat'), true)
  assert.equal(store.has('platform:pro-only'), false)
  assert.equal(store.get('my-byok-deepseek').connectionConfig.apiKey, 'sk-user-local-secret')

  // Second identical sync is a strict no-op
  const secondChanged = await syncPlatformModelsToManager(modelManager, platformCatalog, {
    baseURL: 'https://goprmpt.net/user-api/ai/v1',
    apiKey: '',
    loggedIn: true,
  })
  assert.equal(secondChanged, false)
  assert.equal(calls.add, 1)
  assert.equal(calls.update, 0)
  assert.equal(calls.delete, 0)

  // User disables platform model locally; refresh updates name/params without re-enabling
  store.get('platform:ds-chat').enabled = false
  store.get('platform:ds-chat').paramOverrides = { custom_flag: true }
  const updatedCatalog = [
    {
      ...platformCatalog[0],
      name: 'DeepSeek 平台版 v2',
      defaultParams: { temperature: 0.5, max_tokens: 4096 },
    },
  ]
  const thirdChanged = await syncPlatformModelsToManager(modelManager, updatedCatalog, {
    baseURL: 'https://goprmpt.net/user-api/ai/v1',
    apiKey: 'ext_token_new',
    loggedIn: true,
  })
  assert.equal(thirdChanged, true)
  assert.equal(calls.update, 1)
  const synced = store.get('platform:ds-chat')
  assert.equal(synced.enabled, false)
  assert.equal(synced.name, 'DeepSeek 平台版 v2')
  assert.equal(synced.connectionConfig.apiKey, 'ext_token_new')
  assert.deepEqual(synced.paramOverrides, { temperature: 0.5, max_tokens: 4096, custom_flag: true })

  // Logout removes all platform:* models while keeping BYOK intact
  const logoutChanged = await syncPlatformModelsToManager(modelManager, updatedCatalog, {
    baseURL: 'https://goprmpt.net/user-api/ai/v1',
    apiKey: '',
    loggedIn: false,
  })
  assert.equal(logoutChanged, true)
  assert.equal(store.has('platform:ds-chat'), false)
  assert.equal(store.has('my-byok-deepseek'), true)

  // Repeated logout is a no-op
  const logoutAgain = await syncPlatformModelsToManager(modelManager, [], {
    baseURL: '',
    apiKey: '',
    loggedIn: false,
  })
  assert.equal(logoutAgain, false)
})
