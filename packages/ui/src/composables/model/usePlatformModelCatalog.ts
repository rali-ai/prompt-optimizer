import { computed, ref } from 'vue'
import type { IModelManager } from '@prompt-optimizer/core'
import {
  UserSyncError,
  getCredits,
  getModelPresets,
  getPlatformModels,
  getStoredExtensionToken,
  resolveDefaultSyncBaseUrl,
  resolvePlatformAiBaseUrl,
  type DomesticModelPreset,
  type MembershipTier,
  type PublicPlatformModel,
  type UserCreditsResponse,
} from '../../utils/user-sync-client'
import {
  PLATFORM_MODEL_ID_PREFIX,
  syncPlatformModelsToManager,
} from '../../utils/domestic-models'

export const MODELS_SYNCED_EVENT = 'goprmpt:models-synced'

type PlatformSyncModelManager = Pick<
  IModelManager,
  'getAllModels' | 'addModel' | 'updateModel' | 'deleteModel'
>

const modelPresets = ref<DomesticModelPreset[]>([])
const platformModels = ref<PublicPlatformModel[]>([])
const credits = ref<UserCreditsResponse | null>(null)
const loadingCredits = ref(false)
const loadedPresets = ref(false)
const loadedPlatformModels = ref(false)

let presetsInFlight: Promise<DomesticModelPreset[]> | null = null
let platformModelsInFlight: Promise<PublicPlatformModel[]> | null = null

const presetsByProviderId = computed<ReadonlyMap<string, DomesticModelPreset>>(() => {
  const map = new Map<string, DomesticModelPreset>()
  for (const preset of modelPresets.value) {
    const key = preset.providerId.trim().toLowerCase()
    if (key) {
      map.set(key, preset)
    }
  }
  return map
})

const platformMetaByConfigId = computed<ReadonlyMap<string, PublicPlatformModel>>(() => {
  const map = new Map<string, PublicPlatformModel>()
  for (const model of platformModels.value) {
    if (model.id) {
      map.set(`${PLATFORM_MODEL_ID_PREFIX}${model.id}`, model)
    }
  }
  return map
})

function dispatchModelsSyncedEvent(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(MODELS_SYNCED_EVENT))
}

export async function loadModelPresets(
  baseUrl?: string,
  force = false,
): Promise<DomesticModelPreset[]> {
  if (loadedPresets.value && !force) {
    return modelPresets.value
  }
  if (presetsInFlight && !force) {
    return presetsInFlight
  }

  const effectiveBaseUrl = baseUrl || resolveDefaultSyncBaseUrl()
  const task = (async () => {
    try {
      const presets = await getModelPresets(effectiveBaseUrl)
      modelPresets.value = presets
      loadedPresets.value = true
      return presets
    } catch {
      loadedPresets.value = true
      return modelPresets.value
    }
  })()

  presetsInFlight = task
  void task.finally(() => {
    if (presetsInFlight === task) {
      presetsInFlight = null
    }
  })
  return task
}

export async function loadPlatformModels(
  baseUrl?: string,
  force = false,
): Promise<PublicPlatformModel[]> {
  if (loadedPlatformModels.value && !force) {
    return platformModels.value
  }
  if (platformModelsInFlight && !force) {
    return platformModelsInFlight
  }

  const effectiveBaseUrl = baseUrl || resolveDefaultSyncBaseUrl()
  const task = (async () => {
    try {
      const models = await getPlatformModels(effectiveBaseUrl)
      platformModels.value = models
      loadedPlatformModels.value = true
      return models
    } catch {
      loadedPlatformModels.value = true
      return platformModels.value
    }
  })()

  platformModelsInFlight = task
  void task.finally(() => {
    if (platformModelsInFlight === task) {
      platformModelsInFlight = null
    }
  })
  return task
}

export async function loadUserCredits(baseUrl?: string): Promise<UserCreditsResponse | null> {
  loadingCredits.value = true
  try {
    const effectiveBaseUrl = baseUrl || resolveDefaultSyncBaseUrl()
    const result = await getCredits(effectiveBaseUrl)
    credits.value = result
    return result
  } catch (err) {
    if (err instanceof UserSyncError && err.status === 401) {
      credits.value = null
    }
    return null
  } finally {
    loadingCredits.value = false
  }
}

export async function syncUserPlatformModels(
  modelManager: PlatformSyncModelManager | null | undefined,
  baseUrl?: string,
  loggedIn = true,
): Promise<boolean> {
  const effectiveBaseUrl = baseUrl || resolveDefaultSyncBaseUrl()
  const models = loggedIn ? await loadPlatformModels(effectiveBaseUrl, true) : []

  if (!modelManager) {
    return false
  }

  try {
    const changed = await syncPlatformModelsToManager(modelManager, models, {
      baseURL: resolvePlatformAiBaseUrl(effectiveBaseUrl),
      apiKey: getStoredExtensionToken(),
      loggedIn,
    })
    if (changed) {
      dispatchModelsSyncedEvent()
    }
    return changed
  } catch (error) {
    console.warn('[usePlatformModelCatalog] Failed to sync platform models:', error)
    return false
  }
}

export async function clearUserPlatformState(
  modelManager?: PlatformSyncModelManager | null,
): Promise<boolean> {
  credits.value = null
  loadedPlatformModels.value = false
  if (platformModels.value.length > 0) {
    platformModels.value = platformModels.value.map((model) => ({
      ...model,
      accessible: false,
    }))
  }

  if (!modelManager) {
    return false
  }

  try {
    const changed = await syncPlatformModelsToManager(modelManager, [], {
      baseURL: '',
      apiKey: '',
      loggedIn: false,
    })
    if (changed) {
      dispatchModelsSyncedEvent()
    }
    return changed
  } catch (error) {
    console.warn('[usePlatformModelCatalog] Failed to clear platform models:', error)
    return false
  }
}

export function formatTierLabel(
  tier: MembershipTier | string | undefined | null,
  isZh: boolean,
): string {
  switch (tier) {
    case 'standard':
      return isZh ? '标准会员' : 'Standard'
    case 'pro':
      return isZh ? '专业会员' : 'Pro'
    case 'internal':
      return isZh ? '内部会员' : 'Internal'
    default:
      return isZh ? '非会员' : 'Free'
  }
}

export function tierTagType(
  tier: MembershipTier | string | undefined | null,
): 'default' | 'info' | 'success' | 'warning' {
  switch (tier) {
    case 'standard':
      return 'info'
    case 'pro':
      return 'success'
    case 'internal':
      return 'warning'
    default:
      return 'default'
  }
}

export function resetPlatformModelCatalogState(): void {
  modelPresets.value = []
  platformModels.value = []
  credits.value = null
  loadingCredits.value = false
  loadedPresets.value = false
  loadedPlatformModels.value = false
  presetsInFlight = null
  platformModelsInFlight = null
}

export function usePlatformModelCatalog() {
  return {
    modelPresets,
    presetsByProviderId,
    platformModels,
    platformMetaByConfigId,
    credits,
    loadingCredits,
    loadedPresets,
    loadedPlatformModels,
    loadModelPresets,
    loadPlatformModels,
    loadUserCredits,
    syncUserPlatformModels,
    clearUserPlatformState,
    formatTierLabel,
    tierTagType,
  }
}
