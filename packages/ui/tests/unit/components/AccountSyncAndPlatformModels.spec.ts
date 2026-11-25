import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { NDialogProvider } from 'naive-ui'
import { TextAdapterRegistry, type ImageModelConfig, type TextModelConfig } from '@prompt-optimizer/core'
import AccountSyncButton from '../../../src/components/app-layout/AccountSyncButton.vue'
import AnnouncementBar, { resetAnnouncementBarState } from '../../../src/components/AnnouncementBar.vue'
import ImageModelManager from '../../../src/components/ImageModelManager.vue'
import TextModelList from '../../../src/components/TextModelList.vue'
import TextModelManager from '../../../src/components/TextModelManager.vue'
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
  resetAnnouncementBarState()
  layout.compact = ref(false)
  i18n.global.locale.value = 'zh-CN'
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  resetPlatformModelCatalogState()
  resetAnnouncementBarState()
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
    expect(optionIds[0]).toBe('siliconflow')
    expect(manager.form.value.providerId).toBe('siliconflow')
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

describe('AccountSyncButton custom event coordination', () => {
  it('dispatches goprmpt:auth-changed on mount and logout, and opens panel on goprmpt:open-account-panel', async () => {
    const authEvents: Array<unknown> = []
    const authHandler = (e: Event) => {
      authEvents.push((e as CustomEvent<{ user: unknown }>).detail?.user)
    }
    window.addEventListener('goprmpt:auth-changed', authHandler)

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/config')) {
          return jsonResponse({ membershipEnabled: true, registrationEnabled: true })
        }
        if (url.endsWith('/me')) {
          return jsonResponse({ error: '请先登录' }, 401)
        }
        if (url.endsWith('/login')) {
          return jsonResponse({
            user: {
              id: 'u-login',
              username: 'tester',
              role: 'user',
              tier: 'standard',
              effectiveTier: 'standard',
              tierExpiresAt: null,
              disabled: false,
              createdAt: 1,
              updatedAt: 1,
            },
          })
        }
        if (url.endsWith('/sync')) {
          return jsonResponse({ version: 0, updatedAt: null, data: null })
        }
        if (url.endsWith('/credits')) {
          return jsonResponse({
            balance: 100,
            tier: 'standard',
            effectiveTier: 'standard',
            tierExpiresAt: null,
            monthlyAllowance: 100,
            currentMonth: '2026-11',
            grantedThisMonth: 100,
            monthlyCredits: { free: 0, standard: 100, pro: 500, internal: 1000 },
            ledger: [],
          })
        }
        if (url.endsWith('/platform-models')) {
          return jsonResponse({ models: [] })
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
        global: { provide: { services: ref(null) } },
      })
      await flushPromises()

      expect(authEvents).toEqual([null])
      expect(wrapper.get('[data-testid="header-account-sync"]').attributes('aria-expanded')).toBe('false')
      expect((wrapper.get('[data-testid="account-sync-inline-panel"]').element as HTMLElement).style.display).toBe('none')

      window.dispatchEvent(new CustomEvent('goprmpt:open-account-panel', { detail: { tab: 'register' } }))
      await flushPromises()

      expect(wrapper.get('[data-testid="header-account-sync"]').attributes('aria-expanded')).toBe('true')
      expect((wrapper.get('[data-testid="account-sync-inline-panel"]').element as HTMLElement).style.display).not.toBe('none')
      expect(wrapper.find('[data-testid="account-sync-register-submit"]').exists()).toBe(true)

      // Switch to login via custom event, sign in, and log out to verify goprmpt:auth-changed lifecycle
      window.dispatchEvent(new CustomEvent('goprmpt:open-account-panel', { detail: { tab: 'login' } }))
      await flushPromises()
      await wrapper.get('[data-testid="account-sync-login-username"] input').setValue('tester')
      await wrapper.get('[data-testid="account-sync-login-password"] input').setValue('Password123!')
      await wrapper.get('[data-testid="account-sync-login-submit"]').trigger('click')
      await flushPromises()

      expect(authEvents).toHaveLength(2)
      expect((authEvents[1] as { username?: string })?.username).toBe('tester')

      await wrapper.get('[data-testid="account-sync-logout"]').trigger('click')
      await flushPromises()
      expect(authEvents).toHaveLength(3)
      expect(authEvents[2]).toBeNull()
      wrapper.unmount()
    } finally {
      window.removeEventListener('goprmpt:auth-changed', authHandler)
    }
  })
})

describe('AnnouncementBar interactive comments', () => {
  it('expands banner comments, prompts guests to sign in, and supports posting/deleting comments safely', async () => {
    const openPanelEvents: Array<unknown> = []
    const openPanelHandler = (e: Event) => {
      openPanelEvents.push((e as CustomEvent).detail)
    }
    window.addEventListener('goprmpt:open-account-panel', openPanelHandler)

    const commentsState = [
      {
        id: 'c1',
        announcementId: 'ann-1',
        userId: 'u-admin',
        username: 'admin',
        role: 'admin',
        tier: 'internal',
        effectiveTier: 'internal',
        content: '欢迎反馈建议',
        createdAt: 1750000000000,
      },
    ]

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method || 'GET'
        if (url.endsWith('/announcements/active')) {
          return jsonResponse({
            announcements: [
              {
                id: 'ann-1',
                title: '评论区上线',
                content: '欢迎大家在公告下方交流',
                type: 'activity',
                linkUrl: null,
                linkText: null,
                isActive: true,
                isPinned: true,
                expiresAt: null,
                commentCount: commentsState.length,
                createdAt: 1750000000000,
                updatedAt: 1750000000000,
              },
            ],
          })
        }
        if (url.endsWith('/me')) {
          return jsonResponse({ error: '请先登录' }, 401)
        }
        if (url.endsWith('/announcements/ann-1/comments') && method === 'GET') {
          return jsonResponse({ comments: [...commentsState], commentCount: commentsState.length })
        }
        if (url.endsWith('/announcements/ann-1/comments') && method === 'POST') {
          const body = JSON.parse(String(init?.body || '{}')) as { content: string }
          const created = {
            id: 'c2',
            announcementId: 'ann-1',
            userId: 'u-alice',
            username: 'alice',
            role: 'user',
            tier: 'pro',
            effectiveTier: 'pro',
            content: body.content,
            createdAt: 1750000060000,
          }
          commentsState.unshift(created)
          return jsonResponse({ comment: created, commentCount: commentsState.length }, 201)
        }
        if (url.endsWith('/announcements/ann-1/comments/c2') && method === 'DELETE') {
          const idx = commentsState.findIndex((c) => c.id === 'c2')
          if (idx >= 0) commentsState.splice(idx, 1)
          return jsonResponse({ ok: true, commentCount: commentsState.length }, 200)
        }
        return jsonResponse({}, 404)
      }),
    )

    try {
      const wrapper = mount(AnnouncementBar, { props: { mode: 'banner' } })
      await flushPromises()

      const commentBtn = wrapper.get('[data-testid="announcement-banner-comments-btn"]')
      expect(commentBtn.text()).toContain('评论 (1)')

      // Expand banner comments and check guest notice + existing admin comment
      await commentBtn.trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-testid="announcement-banner-expanded"]').exists()).toBe(true)
      expect(wrapper.findAll('[data-testid="announcement-comment-item"]')).toHaveLength(1)
      expect(wrapper.get('[data-testid="announcement-comment-badge"]').text()).toBe('管理员')
      expect(wrapper.find('[data-testid="announcement-comment-guest"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="announcement-comment-delete"]').exists()).toBe(false)

      await wrapper.get('[data-testid="announcement-comment-login-btn"]').trigger('click')
      expect(openPanelEvents).toEqual([{ tab: 'register' }])

      // Simulate signing in via goprmpt:auth-changed
      window.dispatchEvent(
        new CustomEvent('goprmpt:auth-changed', {
          detail: {
            user: {
              id: 'u-alice',
              username: 'alice',
              role: 'user',
              tier: 'pro',
              effectiveTier: 'pro',
              tierExpiresAt: null,
              disabled: false,
              createdAt: 1,
              updatedAt: 1,
            },
          },
        }),
      )
      await flushPromises()

      expect(wrapper.find('[data-testid="announcement-comment-composer"]').exists()).toBe(true)
      const xssPayload = '<img src=x onerror=alert(1)> 第一行\n第二行'
      await wrapper.get('[data-testid="announcement-comment-input"]').setValue(xssPayload)
      await wrapper.get('[data-testid="announcement-comment-submit"]').trigger('click')
      await flushPromises()

      // Immediately updated count + comment list + zero raw HTML injection
      expect(commentBtn.text()).toContain('评论 (2)')
      const items = wrapper.findAll('[data-testid="announcement-comment-item"]')
      expect(items).toHaveLength(2)
      expect(items[0].text()).toContain('alice')
      expect(items[0].text()).toContain('专业会员')
      expect(items[0].text()).toContain(xssPayload)
      expect(items[0].find('img').exists()).toBe(false)

      // Author can delete own comment, not admin's comment
      expect(items[0].find('[data-testid="announcement-comment-delete"]').exists()).toBe(true)
      expect(items[1].find('[data-testid="announcement-comment-delete"]').exists()).toBe(false)

      await items[0].get('[data-testid="announcement-comment-delete"]').trigger('click')
      await flushPromises()

      expect(commentBtn.text()).toContain('评论 (1)')
      expect(wrapper.findAll('[data-testid="announcement-comment-item"]')).toHaveLength(1)
      wrapper.unmount()
    } finally {
      window.removeEventListener('goprmpt:open-account-panel', openPanelHandler)
    }
  })
})

describe('SiliconFlow featured promotion across text and image model managers', () => {
  it('highlights SiliconFlow cards in TextModelList and renders spotlight with dynamic promo URL in TextModelManager', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/model-presets')) {
          return jsonResponse({
            presets: [
              {
                providerId: 'siliconflow',
                name: '硅基流动',
                category: 'both',
                applyUrl: 'https://cloud.siliconflow.cn/i/goprmpt',
                customApplyUrl: 'https://cloud.siliconflow.cn/i/goprmpt',
                defaultApplyUrl: 'https://cloud.siliconflow.cn/account/ak',
                applyLabel: '主推 · 申请领免费额度',
                defaultModelId: 'Qwen/Qwen2.5-72B-Instruct',
                defaultParams: {},
                featured: true,
                enabled: true,
                updatedAt: 1,
              },
            ],
          })
        }
        if (url.endsWith('/platform-models')) {
          return jsonResponse({ models: [] })
        }
        return jsonResponse({}, 404)
      }),
    )

    const registry = new TextAdapterRegistry()
    const sfAdapter = registry.getAdapter('siliconflow')
    const dsAdapter = registry.getAdapter('deepseek')
    const models = [
      {
        id: 'deepseek',
        name: 'DeepSeek',
        enabled: false,
        providerId: 'deepseek',
        modelId: 'deepseek-chat',
        providerMeta: dsAdapter.getProvider(),
        modelMeta: dsAdapter.getModels()[0],
        connectionConfig: { baseURL: dsAdapter.getProvider().defaultBaseURL },
        paramOverrides: {},
      },
      {
        id: 'siliconflow',
        name: '硅基流动',
        enabled: false,
        providerId: 'siliconflow',
        modelId: sfAdapter.getModels()[0].id,
        providerMeta: sfAdapter.getProvider(),
        modelMeta: sfAdapter.getModels()[0],
        connectionConfig: { baseURL: sfAdapter.getProvider().defaultBaseURL },
        paramOverrides: {},
      },
    ] as unknown as TextModelConfig[]

    const modelManager = {
      getAllModels: vi.fn(async () => models),
      getModel: vi.fn(async (id: string) => models.find((m) => m.id === id)),
    }

    const Host = defineComponent({
      setup: () => () => h(NDialogProvider, null, { default: () => h(TextModelManager, { active: true }) }),
    })

    const wrapper = mount(Host, {
      global: {
        provide: {
          services: ref({
            modelManager,
            llmService: {},
            textAdapterRegistry: registry,
          }),
        },
        stubs: {
          LocalServiceDiscovery: true,
          TextModelEditModal: true,
        },
      },
    })
    await flushPromises()

    const spotlight = wrapper.get('[data-testid="siliconflow-spotlight"]')
    expect(spotlight.text()).toContain('硅基流动 SiliconFlow')
    const applyBtn = wrapper.get('[data-testid="siliconflow-spotlight-apply"]')
    expect(applyBtn.attributes('href')).toBe('https://cloud.siliconflow.cn/i/goprmpt')
    expect(applyBtn.text()).toContain('主推 · 申请领免费额度')

    // SiliconFlow is sorted first and has featured card styling + badge
    const cards = wrapper.findAll('.model-config-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].classes()).toContain('model-config-card--featured')
    expect(cards[0].get('[data-testid="featured-model-badge"]').text()).toBe('主推')
    expect(cards[1].find('[data-testid="featured-model-badge"]').exists()).toBe(false)

    // Clicking "去配置硅基流动" opens edit modal for existing siliconflow config
    await wrapper.get('[data-testid="siliconflow-spotlight-configure"]').trigger('click')
    await flushPromises()
    expect(modelManager.getModel).toHaveBeenCalledWith('siliconflow')
    wrapper.unmount()
  })

  it('renders SiliconFlow spotlight, sorts SiliconFlow first, and highlights featured cards in ImageModelManager', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/model-presets')) {
          return jsonResponse({
            presets: [
              {
                providerId: 'siliconflow',
                name: '硅基流动',
                category: 'both',
                applyUrl: 'https://cloud.siliconflow.cn/i/img-promo',
                customApplyUrl: 'https://cloud.siliconflow.cn/i/img-promo',
                defaultApplyUrl: 'https://cloud.siliconflow.cn/account/ak',
                applyLabel: '主推 · 申请领免费额度',
                defaultModelId: null,
                defaultParams: {},
                featured: true,
                enabled: true,
                updatedAt: 1,
              },
            ],
          })
        }
        return jsonResponse({}, 404)
      }),
    )

    const imageConfigs = [
      {
        id: 'image-seedream',
        name: 'A Seedream',
        providerId: 'seedream',
        modelId: 'doubao-seedream',
        enabled: false,
        connectionConfig: {},
        paramOverrides: {},
        provider: { id: 'seedream', name: 'Seedream' },
        model: { id: 'doubao-seedream', name: 'Seedream', capabilities: { text2image: true } },
      },
      {
        id: 'image-siliconflow-kolors',
        name: 'SiliconFlow Kolors',
        providerId: 'siliconflow',
        modelId: 'Kwai-Kolors/Kolors',
        enabled: false,
        connectionConfig: {},
        paramOverrides: {},
        provider: { id: 'siliconflow', name: 'SiliconFlow', apiKeyUrl: 'https://cloud.siliconflow.cn/account/ak' },
        model: { id: 'Kwai-Kolors/Kolors', name: 'Kolors', capabilities: { text2image: true } },
      },
    ] as unknown as ImageModelConfig[]

    const editedIds: string[] = []
    const Host = defineComponent({
      setup: () => () =>
        h(NDialogProvider, null, {
          default: () =>
            h(ImageModelManager, {
              onEdit: (id: string) => {
                editedIds.push(id)
              },
            }),
        }),
    })

    const wrapper = mount(Host, {
      global: {
        provide: {
          imageRegistry: { getAllProviders: () => [] },
          imageModelManager: { getAllConfigs: vi.fn(async () => imageConfigs) },
          imageService: { testConnection: vi.fn() },
        },
      },
    })
    await flushPromises()

    const spotlight = wrapper.get('[data-testid="image-siliconflow-spotlight"]')
    expect(spotlight.text()).toContain('主推图像通道')
    const applyBtn = wrapper.get('[data-testid="image-siliconflow-spotlight-apply"]')
    expect(applyBtn.attributes('href')).toBe('https://cloud.siliconflow.cn/i/img-promo')

    const cards = wrapper.findAll('.image-model-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].classes()).toContain('image-model-card--featured')
    expect(cards[0].get('[data-testid="image-featured-model-badge"]').text()).toBe('主推')
    expect(cards[1].find('[data-testid="image-featured-model-badge"]').exists()).toBe(false)

    await wrapper.get('[data-testid="image-siliconflow-spotlight-configure"]').trigger('click')
    expect(editedIds).toEqual(['image-siliconflow-kolors'])
    wrapper.unmount()
  })
})
