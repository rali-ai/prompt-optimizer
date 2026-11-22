export type PromptGardenSuggestionSource =
  | 'latest'
  | 'random'
  | 'featured'
  | 'related'

export interface PromptGardenSuggestionItem {
  id: string
  title: string
  summary: string
  excerpt?: string
  categoryPath?: string[]
  importCode: string
  tags: string[]
  mode: string | null
  thumbnailUrl: string | null
  previewUrl?: string
  updatedAt: string | null
  source: PromptGardenSuggestionSource | null
}

export interface PromptGardenSuggestionResponse {
  items: PromptGardenSuggestionItem[]
  browseUrl: string
  nextExclude: string[]
  ttlSeconds: number | null
}

export interface FetchPromptGardenSuggestionsOptions {
  gardenBaseUrl: string
  mode: string
  limit?: number
  exclude?: string[]
  locale?: string
  timeoutMs?: number
}

const DEFAULT_LIMIT = 3
const DEFAULT_TIMEOUT_MS = 2500
const SOURCE_VALUES = new Set<PromptGardenSuggestionSource>([
  'latest',
  'random',
  'featured',
  'related',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const normalizeBaseUrl = (value: string): string =>
  value.trim().replace(/\/+$/, '')

const normalizeString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

const resolveGardenUrl = (
  gardenBaseUrl: string,
  value: unknown,
): string | null => {
  const raw = normalizeString(value)
  if (!raw) return null

  try {
    return new URL(raw, `${gardenBaseUrl}/`).toString()
  } catch {
    return null
  }
}

const normalizeTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map((item) => normalizeString(item))
        .filter(Boolean)
        .slice(0, 3),
    ),
  )
}

const normalizeSuggestionItem = (
  value: unknown,
  gardenBaseUrl: string,
): PromptGardenSuggestionItem | null => {
  if (!isRecord(value)) return null

  const id = normalizeString(value.id)
  const title = normalizeString(value.title)
  const summary = normalizeString(value.summary)
  const importCode = normalizeString(value.importCode)

  if (!id || !title || !summary || !importCode) return null

  const source = normalizeString(value.source)
  const mode = normalizeString(value.mode)

  return {
    id,
    title,
    summary,
    ...(normalizeString(value.excerpt)
      ? { excerpt: normalizeString(value.excerpt) }
      : {}),
    ...(Array.isArray(value.categoryPath)
      ? {
          categoryPath: value.categoryPath.map(normalizeString).filter(Boolean),
        }
      : {}),
    importCode,
    tags: normalizeTags(value.tags),
    mode: mode || null,
    thumbnailUrl: resolveGardenUrl(gardenBaseUrl, value.thumbnailUrl),
    ...(resolveGardenUrl(gardenBaseUrl, value.previewUrl)
      ? { previewUrl: resolveGardenUrl(gardenBaseUrl, value.previewUrl)! }
      : {}),
    updatedAt: normalizeString(value.updatedAt) || null,
    source: SOURCE_VALUES.has(source as PromptGardenSuggestionSource)
      ? (source as PromptGardenSuggestionSource)
      : null,
  }
}

export const buildPromptLibraryUrl = (gardenBaseUrl: string): string => {
  const baseUrl = normalizeBaseUrl(gardenBaseUrl)
  return baseUrl ? `${baseUrl}/library/` : ''
}

// The prompt library is a static site, so it publishes one catalog file per
// content language and workspace; search, paging and picking suggestions happen here.
export const toPromptCatalogLanguage = (locale?: string): 'zh' | 'en' =>
  /^zh/i.test(normalizeString(locale)) ? 'zh' : 'en'

export const buildPromptGardenCatalogUrl = (
  gardenBaseUrl: string,
  mode: string,
  locale?: string,
): string => {
  const baseUrl = normalizeBaseUrl(gardenBaseUrl)
  if (!baseUrl) {
    throw new Error('Missing Prompt Garden base URL')
  }
  return `${baseUrl}/api/public/prompts/catalog/${toPromptCatalogLanguage(locale)}/${encodeURIComponent(mode)}.json`
}

const fetchGardenJson = async (
  url: string,
  timeoutMs: number,
): Promise<Record<string, unknown>> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok)
      throw new Error(`Garden request failed: ${response.status}`)
    const data: unknown = await response.json()
    if (!isRecord(data)) throw new Error('Garden response must be an object')
    return data
  } finally {
    clearTimeout(timeout)
  }
}

const fetchCatalog = async (
  options: { gardenBaseUrl: string; mode: string; locale?: string },
  timeoutMs: number,
): Promise<{ items: PromptGardenSuggestionItem[]; browseUrl: string }> => {
  const baseUrl = normalizeBaseUrl(options.gardenBaseUrl)
  const data = await fetchGardenJson(
    buildPromptGardenCatalogUrl(baseUrl, options.mode, options.locale),
    timeoutMs,
  )
  if (!Array.isArray(data.items)) {
    throw new Error('Invalid Garden catalog response')
  }
  return {
    items: data.items
      .map((item) => normalizeSuggestionItem(item, baseUrl))
      .filter((item): item is PromptGardenSuggestionItem => Boolean(item)),
    browseUrl:
      resolveGardenUrl(baseUrl, data.browseUrl) ||
      buildPromptLibraryUrl(baseUrl),
  }
}

const shuffle = <T>(items: T[]): T[] => {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

// Random picks from the workspace catalog; already shown prompts come last,
// so refreshing cycles through the catalog before repeating.
export const fetchPromptGardenSuggestions = async (
  options: FetchPromptGardenSuggestionsOptions,
): Promise<PromptGardenSuggestionResponse> => {
  const { items, browseUrl } = await fetchCatalog(
    options,
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  )
  const exclude = new Set(
    (options.exclude ?? []).map((item) => item.trim()).filter(Boolean),
  )
  const shuffled = shuffle(items)
  return {
    items: [
      ...shuffled.filter((item) => !exclude.has(item.importCode)),
      ...shuffled.filter((item) => exclude.has(item.importCode)),
    ].slice(0, options.limit ?? DEFAULT_LIMIT),
    browseUrl,
    nextExclude: [],
    ttlSeconds: null,
  }
}

export interface FetchPromptGardenCatalogOptions {
  gardenBaseUrl: string
  mode: string
  locale?: string
  query?: string
  offset?: number
  limit?: number
  timeoutMs?: number
}

export interface PromptGardenCatalogResponse {
  items: PromptGardenSuggestionItem[]
  total: number
  nextOffset: number | null
  browseUrl: string
}

const matchesQuery = (item: PromptGardenSuggestionItem, terms: string[]) => {
  const haystack = [
    item.title,
    item.summary,
    item.excerpt ?? '',
    ...item.tags,
    ...(item.categoryPath ?? []),
  ]
    .join('\n')
    .toLowerCase()
  return terms.every((term) => haystack.includes(term))
}

export const fetchPromptGardenCatalog = async (
  options: FetchPromptGardenCatalogOptions,
): Promise<PromptGardenCatalogResponse> => {
  const { items, browseUrl } = await fetchCatalog(
    options,
    options.timeoutMs ?? 8000,
  )
  const terms = (options.query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const matches = items.filter((item) => matchesQuery(item, terms))
  const offset = Math.max(0, options.offset ?? 0)
  const end = offset + (options.limit ?? 20)
  return {
    items: matches.slice(offset, end),
    total: matches.length,
    nextOffset: end < matches.length ? end : null,
    browseUrl,
  }
}

export const fetchPromptGardenPreview = async (
  gardenBaseUrl: string,
  importCode: string,
): Promise<string> => {
  const url = `${normalizeBaseUrl(gardenBaseUrl)}/api/public/prompt-source/${encodeURIComponent(importCode)}`
  const data = await fetchGardenJson(url, 8000)
  const prompt = data.prompt
  if (
    data.schema !== 'prompt-garden.prompt.v1' ||
    data.schemaVersion !== 1 ||
    !isRecord(prompt)
  ) {
    throw new Error('Invalid Garden prompt source')
  }
  const text =
    prompt.format === 'text'
      ? normalizeString(prompt.text)
      : prompt.format === 'messages' && Array.isArray(prompt.messages)
        ? prompt.messages
            .map((message) =>
              isRecord(message) ? normalizeString(message.content) : '',
            )
            .filter(Boolean)
            .join('\n\n')
        : ''
  if (!text) throw new Error('Garden prompt source is empty')
  return text
}
