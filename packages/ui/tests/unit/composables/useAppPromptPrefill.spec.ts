import { describe, it, expect, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import type { LocationQuery, RouteLocationNormalizedLoaded, RouteLocationRaw } from 'vue-router'

import { createPreferenceServiceStub, createTestPinia } from '../../utils/pinia-test-helpers'
import { useBasicUserSession } from '../../../src/stores/session/useBasicUserSession'
import { useAppPromptPrefill } from '../../../src/composables/app/useAppPromptPrefill'

const makeRoute = (path: string, query: LocationQuery = {}) =>
  ({
    path,
    query,
    fullPath: `${path}?${new URLSearchParams(query as Record<string, string>)}`,
    hash: '',
    params: {},
    name: undefined,
    meta: {},
    matched: [],
    redirectedFrom: undefined,
  }) as RouteLocationNormalizedLoaded

const waitFor = async (predicate: () => boolean) => {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > 1500) throw new Error('Timed out waiting for condition')
    await new Promise((r) => setTimeout(r, 0))
  }
}

const setup = (path: string, query: LocationQuery, restored = true) => {
  const saved = new Map<string, unknown>()
  const { pinia } = createTestPinia({
    preferenceService: createPreferenceServiceStub({
      get: async <T,>(key: string, defaultValue: T) => (saved.has(key) ? (saved.get(key) as T) : defaultValue),
      set: async (key: string, value: unknown) => {
        saved.set(key, JSON.parse(JSON.stringify(value)))
      },
    }),
  })
  const session = useBasicUserSession(pinia)
  const isLoadingExternalData = ref(false)
  const hasRestoredInitialState = ref(restored)
  const currentRoute = ref(makeRoute(path, query))
  const loadingDuringNavigation: boolean[] = []
  const router = {
    currentRoute,
    replace: vi.fn(async (to: RouteLocationRaw) => {
      loadingDuringNavigation.push(isLoadingExternalData.value)
      const target = to as { path: string; query: LocationQuery }
      currentRoute.value = makeRoute(target.path, target.query)
      return undefined
    }),
  }
  effectScope().run(() =>
    useAppPromptPrefill({
      router,
      hasRestoredInitialState,
      isLoadingExternalData,
      basicUserSession: session,
      optimizerCurrentVersions: ref([]),
    })
  )
  return { session, router, currentRoute, hasRestoredInitialState, isLoadingExternalData, loadingDuringNavigation }
}

describe('useAppPromptPrefill', () => {
  it('waits for session restore, then prefills the basic-user prompt and strips ?prompt', async () => {
    const selection = '帮我写一封请假邮件 & 50% off?'
    const ctx = setup('/basic/user', { prompt: selection, lang: 'zh' }, false)

    // Session restore brings back an older workspace after the app opened.
    ctx.session.updatePrompt('restored older prompt')
    ctx.session.updateOptimizedResult({ optimizedPrompt: 'stale result', chainId: 'c1', versionId: 'v1' })
    await new Promise((r) => setTimeout(r, 0))
    expect(ctx.router.replace).not.toHaveBeenCalled()

    ctx.hasRestoredInitialState.value = true
    await waitFor(() => ctx.router.replace.mock.calls.length > 0 && !ctx.isLoadingExternalData.value)

    expect(ctx.session.prompt).toBe(selection)
    expect(ctx.session.optimizedPrompt).toBe('')
    expect(ctx.currentRoute.value.path).toBe('/basic/user')
    expect(ctx.currentRoute.value.query).toEqual({ lang: 'zh' })
    expect(ctx.loadingDuringNavigation).toEqual([true])

    // A reload restores the persisted prompt and the URL no longer re-applies it.
    ctx.session.clearContent({ persist: false })
    await ctx.session.restoreSession()
    expect(ctx.session.prompt).toBe(selection)
    expect(ctx.router.replace).toHaveBeenCalledTimes(1)
  })

  it('switches to the basic-user workspace from another route', async () => {
    const ctx = setup('/pro/variable', { prompt: 'Summarize this' })
    await waitFor(() => ctx.router.replace.mock.calls.length > 0)

    expect(ctx.currentRoute.value.path).toBe('/basic/user')
    expect(ctx.currentRoute.value.query).toEqual({})
    expect(ctx.session.prompt).toBe('Summarize this')
  })

  it('leaves the workspace alone without a non-empty prompt param', async () => {
    const ctx = setup('/basic/user', { prompt: '   ', foo: '1' })
    ctx.session.updatePrompt('keep me')
    await new Promise((r) => setTimeout(r, 0))

    expect(ctx.router.replace).not.toHaveBeenCalled()
    expect(ctx.session.prompt).toBe('keep me')
  })
})
