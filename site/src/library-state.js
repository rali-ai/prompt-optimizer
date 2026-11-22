export const PAGE_SIZE = 24
export const POPULAR_TAG_LIMIT = 12

export const TARGET_KINDS = {
  'basic-user': 'text',
  'basic-system': 'text',
  'image-text2image': 'image'
}

const VALID_KINDS = new Set(['all', 'text', 'image'])
const LIMITATION_PREFIX = /^(?:已知局限|实测边界)[：:]\s*/u

export function resolvePromptKind(prompt, categoryById) {
  return categoryById.get(prompt.category)?.kind ?? TARGET_KINDS[prompt.target] ?? 'text'
}

export function buildLibraryEntries(prompts, categories) {
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  return prompts.map((prompt) => {
    const category = categoryById.get(prompt.category)
    const kind = resolvePromptKind(prompt, categoryById)
    const haystack = [
      prompt.id,
      prompt.importCodes?.en ?? `${prompt.id}-en`,
      prompt.locales.zh.title,
      prompt.locales.zh.summary,
      prompt.locales.en.title,
      prompt.locales.en.summary,
      category?.name ?? '',
      category?.en?.name ?? '',
      ...prompt.tags
    ]
      .join('\n')
      .toLowerCase()
    return { ...prompt, kind, haystack }
  })
}

export function popularTagsFor(entries, { kind = 'all', limit = POPULAR_TAG_LIMIT, activeTag = '' } = {}) {
  const counts = new Map()
  for (const entry of entries) {
    if (kind !== 'all' && entry.kind !== kind) continue
    for (const tag of entry.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }))

  if (activeTag && !top.some((item) => item.tag === activeTag)) {
    top.unshift({ tag: activeTag, count: counts.get(activeTag) ?? 0 })
  }
  return top
}

export function parseLibraryUrlState(search = '', hash = '', categories = []) {
  const params = new URLSearchParams(search)
  const categoryById = new Map(categories.map((category) => [category.id, category]))

  const rawKind = (params.get('kind') ?? params.get('type') ?? 'all').trim()
  const kind = VALID_KINDS.has(rawKind) ? rawKind : 'all'

  const rawCategory = (params.get('category') ?? 'all').trim()
  const matchedCategory = categoryById.get(rawCategory)
  const category =
    matchedCategory && (kind === 'all' || !matchedCategory.kind || matchedCategory.kind === kind)
      ? matchedCategory.id
      : 'all'

  const tag = (params.get('tag') ?? '').trim()
  const q = (params.get('q') ?? '').trim()

  let hashId = ''
  if (hash && hash.length > 1) {
    try {
      hashId = decodeURIComponent(hash.replace(/^#/, '')).trim()
    } catch {
      hashId = hash.replace(/^#/, '').trim()
    }
  }
  const id = (params.get('id') ?? '').trim() || hashId

  return { kind, category, tag, q, id }
}

export function buildLibraryUrlSearch(state) {
  const params = new URLSearchParams()
  if (state.kind && state.kind !== 'all') params.set('kind', state.kind)
  if (state.category && state.category !== 'all') params.set('category', state.category)
  if (state.tag) params.set('tag', state.tag)
  if (state.q) params.set('q', state.q)
  if (state.id) params.set('id', state.id)
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

export function filterLibraryEntries(entries, categories, state) {
  const terms = (state.q ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const kindCounts = { all: 0, text: 0, image: 0 }
  const categoryCounts = Object.fromEntries([['all', 0], ...categories.map((category) => [category.id, 0])])
  const visible = []

  for (const entry of entries) {
    if (terms.length > 0 && !terms.every((term) => entry.haystack.includes(term))) continue
    if (state.tag && !entry.tags.includes(state.tag)) continue

    const kindMatches = state.kind === 'all' || entry.kind === state.kind
    const categoryMatches = state.category === 'all' || entry.category === state.category

    if (categoryMatches) {
      kindCounts.all += 1
      kindCounts[entry.kind] += 1
    }
    if (kindMatches) {
      categoryCounts.all += 1
      categoryCounts[entry.category] = (categoryCounts[entry.category] ?? 0) + 1
    }
    if (kindMatches && categoryMatches) {
      visible.push(entry)
    }
  }

  return { visible, kindCounts, categoryCounts }
}

export function buildOptimizerHref(entry, language = 'zh', baseUrl = 'https://goprmpt.net') {
  const [mode, subMode] = entry.target.split('-')
  const importCode = entry.importCodes?.[language] ?? (language === 'en' ? `${entry.id}-en` : entry.id)
  const query = new URLSearchParams({ importCode, subModeKey: entry.target })
  return `${baseUrl.replace(/\/+$/, '')}/#/${mode}/${subMode}?${query}`
}

export function splitPromptExample(example) {
  if (!example) return { body: '', limitation: '' }
  const lines = String(example).replace(/\r\n?/g, '\n').split('\n')
  const bodyLines = []
  const limitLines = []

  for (const line of lines) {
    if (LIMITATION_PREFIX.test(line.trim())) {
      limitLines.push(line.trim().replace(LIMITATION_PREFIX, ''))
    } else if (line.trim()) {
      bodyLines.push(line)
    }
  }

  return {
    body: bodyLines.join('\n'),
    limitation: limitLines.join('\n')
  }
}
