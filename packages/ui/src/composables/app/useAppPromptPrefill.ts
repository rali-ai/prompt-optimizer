/**
 * Prefill the basic-user workspace from a `?prompt=` route query.
 *
 * Used by the browser extension context menu ("optimize selected text") and by plain
 * links such as `#/basic/user?prompt=...`. Like the Prompt Garden import, it waits for
 * the initial session restore and holds isLoadingExternalData while it navigates, so a
 * route-driven restore cannot overwrite the prefilled text. The query param is removed
 * afterwards so a reload does not apply it again.
 */

import { watch, nextTick, type Ref } from 'vue'
import type { Router } from 'vue-router'
import type { PromptRecordChain } from '@prompt-optimizer/core'

import type { BasicUserSessionApi } from '../../stores/session/useBasicUserSession'
import { clearWorkspaceContentForExternalApply } from '../../utils/workspace-external-apply'

export interface AppPromptPrefillOptions {
  router: Pick<Router, 'currentRoute' | 'replace'>
  hasRestoredInitialState: Ref<boolean>
  isLoadingExternalData: Ref<boolean>
  basicUserSession: BasicUserSessionApi
  optimizerCurrentVersions: Ref<PromptRecordChain['versions']>
}

export function useAppPromptPrefill(options: AppPromptPrefillOptions) {
  const { router, hasRestoredInitialState, isLoadingExternalData, basicUserSession, optimizerCurrentVersions } = options

  watch(
    () => [router.currentRoute.value.fullPath, hasRestoredInitialState.value] as const,
    async ([, restored]) => {
      const { prompt, ...query } = router.currentRoute.value.query
      if (!restored || typeof prompt !== 'string' || !prompt.trim()) return

      isLoadingExternalData.value = true
      try {
        clearWorkspaceContentForExternalApply('basic-user', { basicUserSession, optimizerCurrentVersions })
        basicUserSession.updatePrompt(prompt)
        await basicUserSession.saveSession()
        await router.replace({ path: '/basic/user', query })
        await nextTick()
      } finally {
        isLoadingExternalData.value = false
      }
    },
    { immediate: true }
  )
}
