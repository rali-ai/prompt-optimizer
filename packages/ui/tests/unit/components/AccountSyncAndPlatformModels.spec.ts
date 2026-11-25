import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { TextAdapterRegistry, type TextModelConfig } from '@prompt-optimizer/core'
import AccountSyncButton from '../../../src/components/app-layout/AccountSyncButton.vue'
import TextModelList from '../../../src/components/TextModelList.vue'
import { useTextModelManager } from '../../../src/composables/model/useTextModelManager'
import {
  MODELS_SYNCED_EVENT,
  resetPlatformModelCatalogState,
  usePlatformModelCatalog,
} from '../../../src/composables/model/usePlatformModelCatalog'
import { i18n } from '../../../src/plugins/i18n'

const layout = vi.hoisted(() => ({ compact: null as unknown }))
vi.mock('../../../src/composables/ui/useWorkspaceLayout', () => ({
  useWorkspaceLayout: () => ({ isCompact: layout.compact }),
}))
vi.mock('../../../src/composables/ui/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  resetPlatformModelCatalogState()
  layout.compact = ref(false)
  i18n.global.locale.value = 'zh-CN'
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  resetPlatformModelCatalogState()
})

describe('AccountSyncButton credits card and platform model sync', () => {
  it('renders 4-tier badge, credits balance/ledger, syncs platform models, and cleans up on logout without touching BYOK', async () => {
    const store = new Map<string, TextModelConfig>([
      [
        'byok-deepseek',
        {
          id: 'byok-deepseek',
          name: 'My Local DeepSeek',
          enabled: true,
          providerId: 'deepseek',
          modelId: 'deepseek-chat',
          providerMeta: {
            id: 'deepseek',
            name: 'DeepSeek',
            requiresApiKey: true,
            defaultBaseURL: 'https://api.deepseek.com/v1',
            supportsDynamicModels: false,
            connectionSchema: { required: ['apiKey'], optional: ['baseURL'], fieldTypes: { apiKey: 'string', baseURL: 'string' } },
          },
          modelMeta: {
            id: 'deepseek-chat',
            name: 'DeepSeek Chat',
            providerId: 'deepseek',
            capabilities: { supportsTools: true },
            parameterDefinitions: [],
            defaultParameterValues: {},
          },
          connectionConfig: { apiKey: 'sk-local-byok', baseURL: 'https://api.deepseek.com/v1' },
          paramOverrides: {},
        },
      ],
    ])

    const modelManager = {
      getAllModels: vi.fn(async () => Array.from(store.values())),
      addModel: vi.fn(async (key: string, cfg: TextModelConfig) => {
        store.set(key, structuredClone(cfg))
      }),
      updateModel: vi.fn(async (key: string, patch: Partial<TextModelConfig>) => {
        const prev = store.get(key)
        if (prev) store.set(key, structuredClone({ ...prev, ...patch }))
      }),
      deleteModel: vi.fn(async (key: string) => {
        store.delete(key)
      }),
    }

    const syncedListener = vi.fn()
    window.addEventListener(MODELS_SYNCED_EVENT, syncedListener)

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/config')) {
          return jsonResponse({
            membershipEnabled: true,
            registrationEnabled: true,
            monthlyCredits: { free: 0, standard: 100, pro: 500, internal: 1000 },
          })
        }
        if (url.endsWith('/me')) {
          return jsonResponse({
            user: {
              id: 'u1',
              username: 'alice',
              email: 'alice@example.com',
              role: 'user',
              tier: 'pro',
              effectiveTier: 'pro',
              tierExpiresAt: null,
              creditBalance: 480,
              disabled: false,
              createdAt: 1,
              updatedAt: 1,
            },
          })
        }
        if (url.endsWith('/sync')) {
          return jsonResponse({ version: 3, updatedAt: 1700000000000, data: null })
        }
        if (url.endsWith('/credits')) {
          return jsonResponse({
            balance: 480,
            tier: 'pro',
            effectiveTier: 'pro',
            tierExpiresAt: null,
            monthlyAllowance: 500,
            currentMonth: '2026-11',
            grantedThisMonth: 500,
            monthlyCredits: { free: 0, standard: 100, pro: 500, internal: 1000 },
            ledger: [
              {
                id: 'led-1',
                delta: 500,
                balanceAfter: 500,
                reason: 'monthly_grant',
                modelId: null,
                note: '2026-11 月度赠送',
                createdAt: 1700000001000,
              },
              {
                id: 'led-2',
                delta: -20,
                balanceAfter: 480,
                reason: 'model_usage',
                modelId: 'deepseek-v3',
                note: null,
                createdAt: 1700000002000,
              },
            ],
          })
        }
        if (url.endsWith('/platform-models')) {
          return jsonResponse({
            models: [
              {
                id: 'deepseek-v3',
                name: 'DeepSeek V3 平台版',
                providerLabel: 'DeepSeek',
                creditCost: 2,
                minTier: 'standard',
                defaultParams: { temperature: 0.6 },
                applyUrl: 'https://platform.deepseek.com/',
                description: '高速模型',
                sortOrder: 1,
                accessible: true,
                accessReason: null,
              },
            ],
          })
        }
        if (url.endsWith('/logout')) {
          return jsonResponse({ ok: true })
        }
        return jsonResponse({}, 404)
      }),
    )

    try {
      const wrapper = mount(AccountSyncButton, {
        props: { baseUrl: '/user-api' },
        global: {
          provide: {
            services: ref({ modelManager }),
          },
        },
      })

      await flushPromises()

      // Platform model synced into modelManager and BYOK untouched
      expect(store.has('platform:deepseek-v3')).toBe(true)
      expect(store.has('byok-deepseek')).toBe(true)
      expect(syncedListener).toHaveBeenCalledTimes(1)

      // Open drawer and verify 4-tier badge + credits card + collapsible ledger
      await wrapper.get('[data-testid="header-account-sync"]').trigger('click')
      await flushPromises()

      expect(wrapper.get('[data-testid="account-sync-tier-badge"]').text()).toContain('专业会员')
      expect(wrapper.get('[data-testid="account-sync-credit-balance"]').text().trim()).toBe('480')
      expect(wrapper.get('[data-testid="account-sync-credits-card"]').text()).toContain('已赠 500 / 500')

      await wrapper.get('[data-testid="account-sync-ledger-toggle"]').trigger('click')
      const ledgerText = wrapper.get('[data-testid="account-sync-ledger-list"]').text()
      expect(ledgerText).toContain('月度赠送')
      expect(ledgerText).toContain('模型调用')
      expect(ledgerText).toContain('+500')
      expect(ledgerText).toContain('-20')

      // Logout removes platform:* models and preserves BYOK model
      await wrapper.get('[data-testid="account-sync-logout"]').trigger('click')
      await flushPromises()

      expect(store.has('platform:deepseek-v3')).toBe(false)
      expect(store.has('byok-deepseek')).toBe(true)
      expect(syncedListener).toHaveBeenCalledTimes(2)
      wrapper.unmount()
    } finally {
      window.removeEventListener(MODELS_SYNCED_EVENT, syncedListener)
    }
  })
})

describe('TextModelList platform badges and BYOK promo links', () => {
  it('hides edit/clone/delete for platform models and renders admin promo link for domestic BYOK cards', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/platform-models')) {
          return jsonResponse({
            models: [
              {
                id: 'deepseek-v3',
                name: 'DeepSeek V3 平台版',
                providerLabel: 'DeepSeek',
                creditCost: 3,
                minTier: 'standard',
                defaultParams: {},
                applyUrl: null,
                description: null,
                sortOrder: 1,
                accessible: true,
                accessReason: null,
              },
            ],
          })
        }
        if (url.endsWith('/model-presets')) {
          return jsonResponse({
            presets: [
              {
                providerId: 'deepseek',
                name: 'DeepSeek',
                category: 'text',
                applyUrl: 'https://promo.goprmpt.net/deepseek',
                customApplyUrl: 'https://promo.goprmpt.net/deepseek',
                defaultApplyUrl: 'https://platform.deepseek.com/',
                applyLabel: '领券申请 Key',
                defaultModelId: 'deepseek-chat',
                defaultParams: { temperature: 0.4 },
                enabled: true,
                updatedAt: 1,
              },
            ],
          })
        }
        return jsonResponse({}, 404)
      }),
    )

    const catalog = usePlatformModelCatalog()
    await Promise.all([catalog.loadPlatformModels('/user-api', true), catalog.loadModelPresets('/user-api', true)])

    const models = [
      {
        id: 'platform:deepseek-v3',
        name: 'DeepSeek V3 平台版',
        enabled: true,
        providerId: 'openai-compatible',
        modelId: 'deepseek-v3',
        providerMeta: { id: 'openai-compatible', name: 'DeepSeek' },
        modelMeta: { id: 'deepseek-v3', name: 'DeepSeek V3 平台版', capabilities: { supportsTools: true } },
        connectionConfig: { baseURL: 'https://goprmpt.net/user-api/ai/v1', apiKey: '' },
      },
      {
        id: 'byok-deepseek',
        name: 'DeepSeek 本地 Key',
        enabled: true,
        providerId: 'deepseek',
        modelId: 'deepseek-chat',
        providerMeta: { id: 'deepseek', name: 'DeepSeek', apiKeyUrl: 'https://platform.deepseek.com/' },
        modelMeta: { id: 'deepseek-chat', name: 'DeepSeek Chat', capabilities: { supportsTools: true } },
        connectionConfig: { baseURL: 'https://api.deepseek.com/v1', apiKey: 'sk-123' },
      },
    ] as unknown as TextModelConfig[]

    const wrapper = mount(TextModelList, {
      props: {
        models,
        isTestingConnectionFor: () => false,
        isDefaultModel: () => false,
      },
    })

    const cards = wrapper.findAll('.model-config-card')
    expect(cards).toHaveLength(2)

    // Platform card: shows badges and hides Edit / Clone / Delete
    expect(cards[0].text()).toContain('网站提供')
    expect(cards[0].text()).toContain('每次 3 积分')
    expect(cards[0].text()).toContain('标准会员')
    expect(cards[0].text()).not.toContain('编辑')
    expect(cards[0].text()).not.toContain('克隆')
    expect(cards[0].text()).not.toContain('删除')

    // Domestic BYOK card: shows promo apply link with custom label and href
    const link = cards[1].get('[data-testid="text-model-card-apply-link"]')
    expect(link.text()).toContain('领券申请 Key')
    expect(link.attributes('href')).toBe('https://promo.goprmpt.net/deepseek')
    wrapper.unmount()
  })
})

describe('useTextModelManager domestic provider filtering and preset defaults', () => {
  it('excludes overseas providers from providerOptions and applies admin preset defaultModelId & defaultParams', async () => {
    const registry = new TextAdapterRegistry()
    const deepseekModels = registry.getStaticModels('deepseek')
    const targetPresetModelId = deepseekModels[deepseekModels.length - 1]!.id
    expect(targetPresetModelId).not.toBe(deepseekModels[0]!.id)

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/model-presets')) {
          return jsonResponse({
            presets: [
              {
                providerId: 'deepseek',
                name: 'DeepSeek',
                category: 'text',
                applyUrl: 'https://promo.goprmpt.net/ds',
                customApplyUrl: 'https://promo.goprmpt.net/ds',
                defaultApplyUrl: null,
                applyLabel: '申请 Key',
                defaultModelId: targetPresetModelId,
                defaultParams: { temperature: 0.3, max_tokens: 4096 },
                enabled: true,
                updatedAt: 1,
              },
            ],
          })
        }
        return jsonResponse({}, 404)
      }),
    )

    const Harness = defineComponent({
      setup: () => ({ manager: useTextModelManager() }),
      template: '<div />',
    })
    const wrapper = mount(Harness, {
      global: {
        provide: {
          services: ref({
            modelManager: { getAllModels: vi.fn().mockResolvedValue([]) },
            llmService: {},
            textAdapterRegistry: registry,
          }),
        },
      },
    })

    const manager = wrapper.vm.manager
    await manager.prepareForCreate()
    await flushPromises()

    const optionIds = manager.providerOptions.value.map((o) => o.value)
    for (const overseas of ['openai', 'gemini', 'anthropic', 'openrouter', 'cloudflare', 'grok', 'chrome-built-in']) {
      expect(optionIds).not.toContain(overseas)
    }
    expect(optionIds).toContain('deepseek')

    manager.selectProvider('deepseek')
    expect(manager.form.value.modelId).toBe(targetPresetModelId)
    expect(manager.form.value.paramOverrides).toMatchObject({
      temperature: 0.3,
      max_tokens: 4096,
    })
    wrapper.unmount()
  })
})
