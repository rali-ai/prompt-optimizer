import type { IModelManager, ImageModelConfig, TextModelConfig } from '@prompt-optimizer/core'
import type { DomesticModelPreset, PublicPlatformModel } from './user-sync-client'

export const OVERSEAS_PROVIDER_IDS: ReadonlySet<string> = new Set([
  'openai',
  'gemini',
  'anthropic',
  'openrouter',
  'cloudflare',
  'grok',
  'chrome-built-in',
])

export const PLATFORM_MODEL_ID_PREFIX = 'platform:'

const DEFAULT_APPLY_LABEL = '申请 API Key'

function normalizeProviderId(providerId?: string | null): string {
  return typeof providerId === 'string' ? providerId.trim().toLowerCase() : ''
}

function lookupPreset(
  providerId: string | undefined | null,
  presets?: ReadonlyMap<string, DomesticModelPreset>,
): DomesticModelPreset | undefined {
  if (!presets || !providerId) return undefined
  const direct = presets.get(providerId)
  if (direct) return direct
  const normalized = normalizeProviderId(providerId)
  if (!normalized) return undefined
  return presets.get(normalized)
}

function sanitizeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`
  }
  if (isPlainRecord(value)) {
    const keys = Object.keys(value).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableSerialize(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function isOverseasProvider(providerId?: string | null): boolean {
  const normalized = normalizeProviderId(providerId)
  return normalized.length > 0 && OVERSEAS_PROVIDER_IDS.has(normalized)
}

export function isPlatformModelId(id?: string | null): boolean {
  return (
    typeof id === 'string' &&
    id.startsWith(PLATFORM_MODEL_ID_PREFIX) &&
    id.length > PLATFORM_MODEL_ID_PREFIX.length
  )
}

export function extractPlatformModelId(id: string): string | null {
  if (!isPlatformModelId(id)) return null
  return id.slice(PLATFORM_MODEL_ID_PREFIX.length)
}

export function filterDomesticProviders<T extends { id: string }>(
  providers: readonly T[],
  presets?: ReadonlyMap<string, DomesticModelPreset>,
): T[] {
  return providers.filter((provider) => {
    if (isOverseasProvider(provider.id)) return false
    const preset = lookupPreset(provider.id, presets)
    if (preset && preset.enabled === false) return false
    return true
  })
}

export function filterDomesticTextModels(
  models: readonly TextModelConfig[],
  presets?: ReadonlyMap<string, DomesticModelPreset>,
): TextModelConfig[] {
  return models.filter((model) => {
    if (isPlatformModelId(model.id)) return true
    const providerId = model.providerId ?? model.providerMeta?.id
    if (isOverseasProvider(providerId)) return false
    const preset = lookupPreset(providerId, presets)
    if (preset && preset.enabled === false && !model.enabled) return false
    return true
  })
}

export function filterDomesticImageConfigs(
  configs: readonly ImageModelConfig[],
  presets?: ReadonlyMap<string, DomesticModelPreset>,
): ImageModelConfig[] {
  return configs.filter((config) => {
    const providerId = config.providerId ?? config.provider?.id
    if (isOverseasProvider(providerId)) return false
    const preset = lookupPreset(providerId, presets)
    if (preset && preset.enabled === false && !config.enabled) return false
    return true
  })
}

export function resolveProviderApplyLink(
  providerId: string | undefined | null,
  fallbackUrl: string | undefined | null,
  presets?: ReadonlyMap<string, DomesticModelPreset>,
): { url: string | null; label: string } {
  const preset = lookupPreset(providerId, presets)
  const url = sanitizeHttpUrl(preset?.applyUrl) ?? sanitizeHttpUrl(fallbackUrl)
  const label =
    typeof preset?.applyLabel === 'string' && preset.applyLabel.trim()
      ? preset.applyLabel.trim()
      : DEFAULT_APPLY_LABEL
  return { url, label }
}

export function mergePresetDefaultParams(
  providerId: string | undefined | null,
  baseDefaults: Record<string, unknown> | undefined,
  presets?: ReadonlyMap<string, DomesticModelPreset>,
): Record<string, unknown> {
  const preset = lookupPreset(providerId, presets)
  const base = isPlainRecord(baseDefaults) ? baseDefaults : {}
  const presetParams = isPlainRecord(preset?.defaultParams) ? preset.defaultParams : {}
  return {
    ...base,
    ...presetParams,
  }
}

export function buildPlatformTextModelConfig(
  pm: PublicPlatformModel,
  options: { baseURL: string; apiKey: string },
): TextModelConfig {
  const configId = `${PLATFORM_MODEL_ID_PREFIX}${pm.id}`
  const providerName = pm.providerLabel?.trim() || '平台模型'
  const defaultParams = isPlainRecord(pm.defaultParams) ? { ...pm.defaultParams } : {}
  const description =
    typeof pm.description === 'string' && pm.description.trim()
      ? pm.description.trim()
      : `${providerName} · 每次消耗 ${pm.creditCost} 积分`

  return {
    id: configId,
    name: pm.name,
    enabled: Boolean(pm.accessible),
    providerId: 'openai-compatible',
    modelId: pm.id,
    providerMeta: {
      id: 'openai-compatible',
      name: providerName,
      requiresApiKey: false,
      defaultBaseURL: options.baseURL,
      supportsDynamicModels: false,
      connectionSchema: {
        required: ['baseURL'],
        optional: ['apiKey'],
        fieldTypes: {
          baseURL: 'string',
          apiKey: 'string',
        },
      },
    },
    modelMeta: {
      id: pm.id,
      name: pm.name,
      description,
      providerId: 'openai-compatible',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextLength: 128000,
      },
      parameterDefinitions: [],
      defaultParameterValues: { ...defaultParams },
    },
    connectionConfig: {
      baseURL: options.baseURL,
      apiKey: options.apiKey,
      requestStyle: 'chat_completions',
    },
    paramOverrides: { ...defaultParams },
  }
}

export async function syncPlatformModelsToManager(
  modelManager: Pick<IModelManager, 'getAllModels' | 'addModel' | 'updateModel' | 'deleteModel'>,
  platformModels: readonly PublicPlatformModel[],
  options: { baseURL: string; apiKey: string; loggedIn: boolean },
): Promise<boolean> {
  const existingModels = await modelManager.getAllModels()
  const existingPlatform = new Map<string, TextModelConfig>()
  for (const model of existingModels) {
    if (isPlatformModelId(model.id)) {
      existingPlatform.set(model.id, model)
    }
  }

  let changed = false

  if (!options.loggedIn) {
    for (const id of existingPlatform.keys()) {
      await modelManager.deleteModel(id)
      changed = true
    }
    return changed
  }

  const desiredAccessible = new Map<string, PublicPlatformModel>()
  for (const pm of platformModels) {
    if (!pm.id || !pm.accessible) continue
    desiredAccessible.set(`${PLATFORM_MODEL_ID_PREFIX}${pm.id}`, pm)
  }

  for (const id of existingPlatform.keys()) {
    if (!desiredAccessible.has(id)) {
      await modelManager.deleteModel(id)
      changed = true
    }
  }

  for (const [configId, pm] of desiredAccessible.entries()) {
    const desired = buildPlatformTextModelConfig(pm, {
      baseURL: options.baseURL,
      apiKey: options.apiKey,
    })
    const existing = existingPlatform.get(configId)

    if (!existing) {
      await modelManager.addModel(configId, { ...desired, enabled: true })
      changed = true
      continue
    }

    const nextConnectionConfig = {
      ...(existing.connectionConfig || {}),
      baseURL: options.baseURL,
      apiKey: options.apiKey,
      requestStyle: 'chat_completions',
    }
    const nextParamOverrides = {
      ...(desired.paramOverrides || {}),
      ...(existing.paramOverrides || {}),
    }

    const nextSnapshot = {
      name: desired.name,
      enabled: existing.enabled,
      providerId: desired.providerId,
      modelId: desired.modelId,
      providerMeta: desired.providerMeta,
      modelMeta: desired.modelMeta,
      connectionConfig: nextConnectionConfig,
      paramOverrides: nextParamOverrides,
    }
    const prevSnapshot = {
      name: existing.name,
      enabled: existing.enabled,
      providerId: existing.providerId,
      modelId: existing.modelId,
      providerMeta: existing.providerMeta,
      modelMeta: existing.modelMeta,
      connectionConfig: existing.connectionConfig || {},
      paramOverrides: existing.paramOverrides || {},
    }

    if (stableSerialize(nextSnapshot) !== stableSerialize(prevSnapshot)) {
      await modelManager.updateModel(configId, nextSnapshot)
      changed = true
    }
  }

  return changed
}
