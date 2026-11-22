import './styles.css'
import './pages.css'
import { categories, prompts } from 'virtual:library/prompts'
import { OPTIMIZER_URL, initSiteChrome, renderSiteFooter, renderSiteHeader, siteBackground } from './shell.js'
import { escapeHtml } from './html.js'
import {
  applyDocumentMeta,
  categoryCopy,
  contentLanguage,
  getInitialLocale,
  htmlLang,
  localeFocusRegion,
  renderSourceCredit,
  restoreLocaleFocus,
  toggleLocale
} from './locale.js'
import {
  PAGE_SIZE,
  buildLibraryEntries,
  buildLibraryUrlSearch,
  buildOptimizerHref,
  filterLibraryEntries,
  parseLibraryUrlState,
  popularTagsFor,
  splitPromptExample
} from './library-state.js'

const PLACEHOLDER = /\{\{\s*([^{}\s]+)\s*\}\}/g

const copyByLocale = {
  'zh-CN': {
    metaTitle: '提示词库 · 提示词优化器',
    metaDescription: '现成可用的中英双语提示词，支持按类型、分类和标签筛选，可填变量复制或一键带进优化器。',
    heading: '提示词库',
    lead: '挑一条现成的提示词，填好变量就能复制，也可以一键带进优化器接着改。',
    listAria: '提示词列表',
    searchPlaceholder: '搜索标题、简介、标签或编号',
    searchAria: '搜索提示词',
    kindAria: '类型筛选',
    kinds: { all: '全部', text: '文本', image: '图像' },
    targets: {
      'basic-user': '用户提示词',
      'basic-system': '系统提示词',
      'image-text2image': '图像提示词'
    },
    categoryAria: '分类筛选',
    allCategory: '全部分类',
    tagAria: '热门标签',
    tagLabel: '热门标签',
    clearTag: '清除标签',
    resultTotal: (shown, total) => (shown < total ? `共 ${total} 条，当前显示 ${shown} 条` : `共 ${total} 条`),
    resultFiltered: (shown, total) => (shown < total ? `找到 ${total} 条，当前显示 ${shown} 条` : `找到 ${total} 条`),
    loadMore: (remaining) => `加载更多（还有 ${remaining} 条）`,
    emptyLibrary: '提示词还在整理中。',
    emptyLibraryCta: '先去优化器写一条',
    emptyFiltered: '没有找到符合条件的提示词，换个关键词或清除筛选试试。',
    clearFilters: '清除筛选',
    notFoundTitle: '没有找到这条提示词',
    notFoundBody: '链接里的提示词不存在，可能已经调整。回到列表看看别的吧。',
    closeAria: '关闭',
    variablesTitle: '变量说明与填写',
    varNameCol: '变量',
    varDescCol: '说明',
    varDefaultCol: '默认值',
    promptTitle: '提示词正文',
    fillProgress: (filled, total) => `已填 ${filled} / ${total} 个变量`,
    exampleTitle: '使用示例',
    limitationTitle: '已知局限',
    importCodeLabel: '导入码',
    copyPrompt: '复制提示词',
    copyPromptDone: '已复制提示词',
    copyCode: '复制导入码',
    copyCodeDone: '已复制导入码',
    copyFailed: '复制失败，请手动复制',
    openOptimizer: '在优化器中使用',
    optimizerNote: '优化器会按导入码加载模板原文，这里填写的临时变量值不会带过去。'
  },
  en: {
    metaTitle: 'Prompt Library · Prompt Optimizer',
    metaDescription: 'Bilingual ready-to-use prompts for text and image tasks. Filter by type, category or tag, fill variables, copy, or open directly in the optimizer.',
    heading: 'Prompt Library',
    lead: 'Pick a ready-made prompt, fill in the variables, copy it, or open it directly in the optimizer.',
    listAria: 'Prompt list',
    searchPlaceholder: 'Search title, summary, tag, or ID',
    searchAria: 'Search prompts',
    kindAria: 'Filter by type',
    kinds: { all: 'All', text: 'Text', image: 'Image' },
    targets: {
      'basic-user': 'User prompt',
      'basic-system': 'System prompt',
      'image-text2image': 'Image prompt'
    },
    categoryAria: 'Filter by category',
    allCategory: 'All categories',
    tagAria: 'Popular tags',
    tagLabel: 'Popular tags',
    clearTag: 'Clear tag',
    resultTotal: (shown, total) => (shown < total ? `${total} prompts · showing ${shown}` : `${total} prompts`),
    resultFiltered: (shown, total) => (shown < total ? `${total} matches · showing ${shown}` : `${total} matches`),
    loadMore: (remaining) => `Load more (${remaining} remaining)`,
    emptyLibrary: 'Prompts are being prepared.',
    emptyLibraryCta: 'Write one in Optimizer',
    emptyFiltered: 'No prompts match these filters. Try another keyword or clear filters.',
    clearFilters: 'Clear filters',
    notFoundTitle: 'Prompt not found',
    notFoundBody: 'This prompt link does not match any item in the library. Return to the list to browse.',
    closeAria: 'Close',
    variablesTitle: 'Variables',
    varNameCol: 'Variable',
    varDescCol: 'Description',
    varDefaultCol: 'Default',
    promptTitle: 'Prompt',
    fillProgress: (filled, total) => `${filled} / ${total} filled`,
    exampleTitle: 'Example',
    limitationTitle: 'Known limitations',
    importCodeLabel: 'Import code',
    copyPrompt: 'Copy prompt',
    copyPromptDone: 'Prompt copied',
    copyCode: 'Copy import code',
    copyCodeDone: 'Import code copied',
    copyFailed: 'Copy failed',
    openOptimizer: 'Use in Optimizer',
    optimizerNote: 'The optimizer loads the original template via import code; temporary edits made here are not transferred.'
  }
}

const categoryById = new Map(categories.map((category) => [category.id, category]))
const entries = buildLibraryEntries(prompts, categories)
const entryById = new Map(entries.map((entry) => [entry.id, entry]))
const showKindFilter = new Set(entries.map((entry) => entry.kind)).size > 1

let locale = getInitialLocale()
const initialUrl = parseLibraryUrlState(window.location.search, window.location.hash, categories)
const state = {
  kind: initialUrl.kind,
  category: initialUrl.category,
  tag: initialUrl.tag,
  q: initialUrl.q,
  id: initialUrl.id
}
let visibleLimit = PAGE_SIZE
const filledValues = new Map()
let openEntry = null
let openedFromList = false

const searchIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8" />
    <path d="m16 16 4.5 4.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" />
  </svg>
`

const closeIcon = `
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false">
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
`

const currentCopy = () => copyByLocale[locale] ?? copyByLocale['zh-CN']
const activeLang = () => contentLanguage(locale)

function syncUrl({ push = false } = {}) {
  const search = buildLibraryUrlSearch(state)
  const targetUrl = `${window.location.pathname}${search}`
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (targetUrl === currentUrl) return
  if (push) {
    window.history.pushState(null, '', targetUrl)
  } else {
    window.history.replaceState(window.history.state, '', targetUrl)
  }
}

function valuesFor(entry) {
  const lang = activeLang()
  const key = `${entry.id}:${lang}`
  if (!filledValues.has(key)) {
    const variables = entry.locales[lang].variables
    filledValues.set(key, new Map(variables.map((variable) => [variable.name, variable.defaultValue])))
  }
  return filledValues.get(key)
}

function renderPromptHtml(text, values) {
  let html = ''
  let last = 0
  for (const match of text.matchAll(PLACEHOLDER)) {
    html += escapeHtml(text.slice(last, match.index))
    const value = values.get(match[1])
    html += value
      ? `<mark class="var-value">${escapeHtml(value)}</mark>`
      : `<span class="var-slot">${escapeHtml(match[0])}</span>`
    last = match.index + match[0].length
  }
  return html + escapeHtml(text.slice(last))
}

function renderPromptText(text, values) {
  return text.replace(PLACEHOLDER, (placeholder, name) => values.get(name) || placeholder)
}

function updateDocumentMeta() {
  const copy = currentCopy()
  const lang = activeLang()
  const title = openEntry
    ? `${openEntry.locales[lang].title} · ${copy.metaTitle}`
    : copy.metaTitle
  applyDocumentMeta({ locale, title, description: copy.metaDescription })
}

function renderPage() {
  const copy = currentCopy()
  const lang = activeLang()
  const menuExpanded = document.querySelector('.site-menu-button')?.getAttribute('aria-expanded') ?? 'false'
  const visibleCategories = categories.filter((category) => state.kind === 'all' || !category.kind || category.kind === state.kind)

  document.querySelector('#app').innerHTML = `
    <div class="site-shell">
      ${siteBackground}
      ${renderSiteHeader({ locale, current: '/library/', showLocale: true, menuExpanded })}

      <main class="page">
        <section class="page-head">
          <h1>${copy.heading}</h1>
          <p class="page-lead">${copy.lead}</p>
        </section>

        <section class="section library" aria-label="${copy.listAria}">
          <div class="library-toolbar">
            <label class="search-field">
              ${searchIcon}
              <input
                type="search"
                data-search
                value="${escapeHtml(state.q)}"
                placeholder="${escapeHtml(copy.searchPlaceholder)}"
                aria-label="${escapeHtml(copy.searchAria)}"
                autocomplete="off"
              />
            </label>
            ${showKindFilter ? `
              <div class="library-toolbar__switches">
                <div class="segmented" role="group" aria-label="${escapeHtml(copy.kindAria)}">
                  ${Object.entries(copy.kinds).map(([id, label]) => `
                    <button type="button" data-kind="${id}" aria-pressed="${id === state.kind}">
                      ${escapeHtml(label)} <span class="count" data-kind-count="${id}"></span>
                    </button>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>

          <div class="chip-row" role="group" aria-label="${escapeHtml(copy.categoryAria)}" data-category-row>
            <button type="button" class="chip" data-category="all" aria-pressed="${state.category === 'all'}">
              ${escapeHtml(copy.allCategory)} <span class="count" data-category-count="all"></span>
            </button>
            ${visibleCategories.map((category) => {
              const cat = categoryCopy(category, lang)
              return `
                <button
                  type="button"
                  class="chip"
                  data-category="${category.id}"
                  aria-pressed="${state.category === category.id}"
                  title="${escapeHtml(cat.description)}"
                >${escapeHtml(cat.name)} <span class="count" data-category-count="${category.id}"></span></button>
              `
            }).join('')}
          </div>

          <div class="tag-filter-row" role="group" aria-label="${escapeHtml(copy.tagAria)}" data-tag-row></div>

          <p class="result-count" aria-live="polite" data-result-count></p>
          <ul class="prompt-grid" data-prompt-grid></ul>
          <div class="load-more-wrap" data-load-more-wrap></div>
        </section>
      </main>

      ${renderSiteFooter({ locale, current: '/library/', showLocale: true })}
    </div>

    <dialog class="drawer" id="prompt-drawer" aria-labelledby="drawer-title"></dialog>
  `
}

function renderCard(entry) {
  const copy = currentCopy()
  const lang = activeLang()
  const content = entry.locales[lang]
  const cat = categoryCopy(categoryById.get(entry.category), lang)
  const href = `/library/${buildLibraryUrlSearch({ ...state, id: entry.id })}`

  return `
    <li>
      <a class="prompt-card" href="${escapeHtml(href)}" data-prompt-link="${escapeHtml(entry.id)}">
        <span class="prompt-card__meta">
          <span class="pill">${escapeHtml(cat.name)}</span>
          <span class="pill pill--quiet">${escapeHtml(copy.targets[entry.target] ?? entry.target)}</span>
        </span>
        <strong class="prompt-card__title" lang="${htmlLang(locale)}">${escapeHtml(content.title)}</strong>
        <span class="prompt-card__summary" lang="${htmlLang(locale)}">${escapeHtml(content.summary)}</span>
        ${entry.tags.length ? `<span class="tag-list">${entry.tags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join('')}</span>` : ''}
      </a>
    </li>
  `
}

function renderEmptyResults() {
  const copy = currentCopy()
  if (entries.length === 0) {
    return `
      <li class="empty-state">
        <p>${escapeHtml(copy.emptyLibrary)}</p>
        <a class="button" href="${OPTIMIZER_URL}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.emptyLibraryCta)}</a>
      </li>
    `
  }
  return `
    <li class="empty-state">
      <p>${escapeHtml(copy.emptyFiltered)}</p>
      <button class="button" type="button" data-clear-filters>${escapeHtml(copy.clearFilters)}</button>
    </li>
  `
}

function renderCategoryChips(categoryCounts) {
  const copy = currentCopy()
  const lang = activeLang()
  const row = document.querySelector('[data-category-row]')
  if (!row) return

  const visibleCategories = categories.filter((category) => state.kind === 'all' || !category.kind || category.kind === state.kind)
  row.innerHTML = `
    <button type="button" class="chip" data-category="all" aria-pressed="${state.category === 'all'}">
      ${escapeHtml(copy.allCategory)} <span class="count" data-category-count="all">${categoryCounts.all ?? 0}</span>
    </button>
    ${visibleCategories.map((category) => {
      const cat = categoryCopy(category, lang)
      const count = categoryCounts[category.id] ?? 0
      return `
        <button
          type="button"
          class="chip${count === 0 ? ' chip--empty' : ''}"
          data-category="${category.id}"
          aria-pressed="${state.category === category.id}"
          title="${escapeHtml(cat.description)}"
        >${escapeHtml(cat.name)} <span class="count" data-category-count="${category.id}">${count}</span></button>
      `
    }).join('')}
  `
}

function renderTagChips() {
  const copy = currentCopy()
  const row = document.querySelector('[data-tag-row]')
  if (!row) return
  const tags = popularTagsFor(entries, { kind: state.kind, activeTag: state.tag })
  if (tags.length === 0) {
    row.innerHTML = ''
    return
  }

  row.innerHTML = `
    <span class="tag-filter-row__label">${escapeHtml(copy.tagLabel)}</span>
    ${tags.map(({ tag, count }) => `
      <button
        type="button"
        class="tag-chip"
        data-tag="${escapeHtml(tag)}"
        aria-pressed="${state.tag === tag}"
      >#${escapeHtml(tag)} <span class="count">${count}</span></button>
    `).join('')}
    ${state.tag ? `<button type="button" class="tag-chip tag-chip--clear" data-clear-tag>${escapeHtml(copy.clearTag)}</button>` : ''}
  `
}

function renderResults() {
  const copy = currentCopy()
  const lang = activeLang()
  const { visible, kindCounts, categoryCounts } = filterLibraryEntries(entries, categories, state)

  document.querySelectorAll('[data-kind]').forEach((button) => {
    const kind = button.dataset.kind
    button.setAttribute('aria-pressed', String(kind === state.kind))
    const countEl = button.querySelector('[data-kind-count]')
    if (countEl) countEl.textContent = kindCounts[kind] ?? 0
  })

  renderCategoryChips(categoryCounts)
  renderTagChips()

  const shown = visible.slice(0, visibleLimit)
  const remaining = Math.max(0, visible.length - shown.length)
  const filtered = Boolean(state.q || state.category !== 'all' || state.kind !== 'all' || state.tag)
  const categoryDesc = state.category === 'all' ? '' : categoryCopy(categoryById.get(state.category), lang).description

  document.querySelector('[data-result-count]').innerHTML = `
    ${escapeHtml(filtered ? copy.resultFiltered(shown.length, visible.length) : copy.resultTotal(shown.length, visible.length))}
    ${categoryDesc ? `<span class="result-count__note">${escapeHtml(categoryDesc)}</span>` : ''}
  `

  document.querySelector('[data-prompt-grid]').innerHTML = shown.length > 0
    ? shown.map(renderCard).join('')
    : renderEmptyResults()

  const loadMoreWrap = document.querySelector('[data-load-more-wrap]')
  loadMoreWrap.innerHTML = remaining > 0
    ? `<button type="button" class="button" data-load-more>${escapeHtml(copy.loadMore(remaining))}</button>`
    : ''
}

function renderDrawer(entry) {
  const copy = currentCopy()
  if (!entry) {
    return `
      <header class="drawer__header">
        <div class="drawer__heading">
          <h2 id="drawer-title">${escapeHtml(copy.notFoundTitle)}</h2>
        </div>
        <button class="icon-button" type="button" data-drawer-close aria-label="${escapeHtml(copy.closeAria)}">${closeIcon}</button>
      </header>
      <div class="drawer__body">
        <p class="drawer__summary">${escapeHtml(copy.notFoundBody)}</p>
      </div>
    `
  }

  const lang = activeLang()
  const content = entry.locales[lang]
  const values = valuesFor(entry)
  const cat = categoryCopy(categoryById.get(entry.category), lang)
  const importCode = entry.importCodes[lang]
  const exampleParts = splitPromptExample(entry.example)
  const creditHtml = renderSourceCredit(entry.source, locale)
  const docLang = htmlLang(locale)

  return `
    <header class="drawer__header">
      <div class="drawer__heading">
        <p class="drawer__meta">${escapeHtml(cat.name)} · ${escapeHtml(copy.targets[entry.target] ?? entry.target)}</p>
        <h2 id="drawer-title" lang="${docLang}">${escapeHtml(content.title)}</h2>
      </div>
      <div class="drawer__tools">
        <button class="icon-button" type="button" data-drawer-close aria-label="${escapeHtml(copy.closeAria)}">${closeIcon}</button>
      </div>
    </header>

    <div class="drawer__body">
      <p class="drawer__summary" lang="${docLang}">${escapeHtml(content.summary)}</p>

      <div class="drawer__submeta">
        <span class="import-code-badge">
          <span class="import-code-badge__label">${escapeHtml(copy.importCodeLabel)}</span>
          <code>${escapeHtml(importCode)}</code>
        </span>
        ${entry.tags.length ? `
          <div class="drawer__tags">
            ${entry.tags.map((tag) => `<button type="button" class="tag-chip tag-chip--inline" data-drawer-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`).join('')}
          </div>
        ` : ''}
      </div>

      ${content.variables.length ? `
        <section class="drawer__section">
          <h3>${escapeHtml(copy.variablesTitle)}</h3>
          <div class="var-table-wrap">
            <table class="var-table">
              <thead>
                <tr>
                  <th>${escapeHtml(copy.varNameCol)}</th>
                  <th>${escapeHtml(copy.varDescCol)}</th>
                  <th>${escapeHtml(copy.varDefaultCol)}</th>
                </tr>
              </thead>
              <tbody>
                ${content.variables.map((variable) => `
                  <tr>
                    <td><code>{{${escapeHtml(variable.name)}}}</code></td>
                    <td>${escapeHtml(variable.description)}</td>
                    <td>${escapeHtml(variable.defaultValue || '—')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div class="var-form">
            ${content.variables.map((variable) => `
              <label class="var-field">
                <span class="var-field__name" lang="${docLang}">${escapeHtml(variable.name)}</span>
                ${variable.description ? `<span class="var-field__hint" lang="${docLang}">${escapeHtml(variable.description)}</span>` : ''}
                <textarea rows="2" data-variable="${escapeHtml(variable.name)}" lang="${docLang}">${escapeHtml(values.get(variable.name) ?? '')}</textarea>
              </label>
            `).join('')}
          </div>
        </section>
      ` : ''}

      <section class="drawer__section">
        <div class="drawer__section-head">
          <h3>${escapeHtml(copy.promptTitle)}</h3>
          <span class="drawer__progress" data-fill-progress></span>
        </div>
        <pre class="prompt-preview" lang="${docLang}" data-prompt-preview></pre>
      </section>

      ${exampleParts.body ? `
        <section class="drawer__section">
          <h3>${escapeHtml(copy.exampleTitle)}</h3>
          <p class="drawer__example">${escapeHtml(exampleParts.body)}</p>
        </section>
      ` : ''}

      ${exampleParts.limitation ? `
        <section class="drawer__section drawer__limitation">
          <h3>${escapeHtml(copy.limitationTitle)}</h3>
          <p class="drawer__example">${escapeHtml(exampleParts.limitation)}</p>
        </section>
      ` : ''}

      ${creditHtml ? `<p class="drawer__credit">${creditHtml}</p>` : ''}
    </div>

    <footer class="drawer__actions">
      <button class="button button--primary" type="button" data-copy-prompt>${escapeHtml(copy.copyPrompt)}</button>
      <button class="button" type="button" data-copy-code>${escapeHtml(copy.copyCode)}</button>
      <a class="button" href="${escapeHtml(buildOptimizerHref(entry, lang, OPTIMIZER_URL))}" target="_blank" rel="noopener noreferrer" data-open-optimizer>${escapeHtml(copy.openOptimizer)}</a>
      ${content.variables.length ? `<p class="drawer__note">${escapeHtml(copy.optimizerNote)}</p>` : ''}
    </footer>
  `
}

function updatePreview() {
  if (!openEntry) return
  const copy = currentCopy()
  const content = openEntry.locales[activeLang()]
  const values = valuesFor(openEntry)
  const drawer = document.getElementById('prompt-drawer')
  const preview = drawer?.querySelector('[data-prompt-preview]')
  if (preview) preview.innerHTML = renderPromptHtml(content.prompt, values)
  const progress = drawer?.querySelector('[data-fill-progress]')
  if (progress) {
    const filled = content.variables.filter((variable) => values.get(variable.name)).length
    progress.textContent = content.variables.length ? copy.fillProgress(filled, content.variables.length) : ''
  }
}

function renderOpenDrawer() {
  const drawer = document.getElementById('prompt-drawer')
  if (!drawer) return
  drawer.innerHTML = renderDrawer(openEntry)
  updatePreview()
}

function syncDrawerFromState() {
  const drawer = document.getElementById('prompt-drawer')
  if (!drawer) return

  if (!state.id) {
    openedFromList = false
    openEntry = null
    if (drawer.open) drawer.close()
    updateDocumentMeta()
    return
  }

  openEntry = entryById.get(state.id) ?? null
  renderOpenDrawer()
  if (!drawer.open) drawer.showModal()
  const body = drawer.querySelector('.drawer__body')
  if (body) body.scrollTop = 0
  updateDocumentMeta()
}

function requestCloseDrawer() {
  if (openedFromList) {
    openedFromList = false
    window.history.back()
    return
  }
  state.id = ''
  syncUrl({ push: false })
  syncDrawerFromState()
}

async function copyText(text, container) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.className = 'copy-buffer'
    ;(container ?? document.body).append(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    textarea.remove()
    return copied
  }
}

async function handleCopyButton(button, text, { doneLabel, defaultLabel }) {
  const copy = currentCopy()
  const drawer = document.getElementById('prompt-drawer')
  const copied = await copyText(text, drawer?.open ? drawer : document.body)
  button.textContent = copied ? doneLabel : copy.copyFailed
  button.dataset.state = copied ? 'done' : 'failed'
  window.clearTimeout(button.resetTimer)
  button.resetTimer = window.setTimeout(() => {
    button.textContent = defaultLabel
    delete button.dataset.state
  }, 1800)
}

function applyUrlFromLocation() {
  const parsed = parseLibraryUrlState(window.location.search, window.location.hash, categories)
  const filterChanged =
    parsed.kind !== state.kind ||
    parsed.category !== state.category ||
    parsed.tag !== state.tag ||
    parsed.q !== state.q

  state.kind = parsed.kind
  state.category = parsed.category
  state.tag = parsed.tag
  state.q = parsed.q
  state.id = parsed.id

  if (filterChanged) {
    visibleLimit = PAGE_SIZE
    const searchInput = document.querySelector('[data-search]')
    if (searchInput && searchInput.value !== state.q) searchInput.value = state.q
    renderResults()
  }
  syncDrawerFromState()
}

function renderAll({ preserveFocus = false } = {}) {
  const focusRegion = preserveFocus ? localeFocusRegion() : null
  const wasOpen = Boolean(state.id)
  renderPage()
  renderResults()
  bindDrawerListeners()
  if (wasOpen) {
    syncDrawerFromState()
  } else {
    updateDocumentMeta()
  }
  if (focusRegion) restoreLocaleFocus(focusRegion)
}

function bindDrawerListeners() {
  const drawer = document.getElementById('prompt-drawer')
  if (!drawer || drawer.dataset.bound === 'true') return
  drawer.dataset.bound = 'true'

  drawer.addEventListener('click', (event) => {
    if (event.target === drawer || event.target.closest('[data-drawer-close]')) {
      requestCloseDrawer()
      return
    }

    const copyPromptButton = event.target.closest('[data-copy-prompt]')
    if (copyPromptButton && openEntry) {
      const copy = currentCopy()
      const content = openEntry.locales[activeLang()]
      handleCopyButton(copyPromptButton, renderPromptText(content.prompt, valuesFor(openEntry)), {
        doneLabel: copy.copyPromptDone,
        defaultLabel: copy.copyPrompt
      })
      return
    }

    const copyCodeButton = event.target.closest('[data-copy-code]')
    if (copyCodeButton && openEntry) {
      const copy = currentCopy()
      const code = openEntry.importCodes[activeLang()]
      handleCopyButton(copyCodeButton, code, {
        doneLabel: copy.copyCodeDone,
        defaultLabel: copy.copyCode
      })
      return
    }

    const drawerTag = event.target.closest('[data-drawer-tag]')
    if (drawerTag) {
      state.tag = drawerTag.dataset.drawerTag
      state.id = ''
      openedFromList = false
      visibleLimit = PAGE_SIZE
      syncUrl({ push: false })
      syncDrawerFromState()
      renderResults()
    }
  })

  drawer.addEventListener('input', (event) => {
    const field = event.target.closest('[data-variable]')
    if (!field || !openEntry) return
    valuesFor(openEntry).set(field.dataset.variable, field.value)
    updatePreview()
  })

  drawer.addEventListener('cancel', (event) => {
    event.preventDefault()
    requestCloseDrawer()
  })

  drawer.addEventListener('close', () => {
    const closedId = openEntry?.id
    openEntry = null
    if (closedId) {
      document.querySelector(`[data-prompt-grid] a[data-prompt-link="${CSS.escape(closedId)}"]`)?.focus({ preventScroll: true })
    }
    if (state.id) {
      state.id = ''
      syncUrl({ push: false })
      updateDocumentMeta()
    }
  })
}

function bindGlobalEvents() {
  document.addEventListener('input', (event) => {
    const searchInput = event.target.closest('[data-search]')
    if (!searchInput) return
    state.q = searchInput.value.trim()
    visibleLimit = PAGE_SIZE
    syncUrl({ push: false })
    renderResults()
  })

  document.addEventListener('click', (event) => {
    const target = event.target
    const kindButton = target.closest('[data-kind]')
    const categoryButton = target.closest('[data-category]')
    const tagButton = target.closest('[data-tag]')
    const clearTagButton = target.closest('[data-clear-tag]')
    const loadMoreButton = target.closest('[data-load-more]')
    const clearButton = target.closest('[data-clear-filters]')
    const promptLink = target.closest('[data-prompt-link]')

    if (kindButton) {
      state.kind = kindButton.dataset.kind
      if (state.category !== 'all') {
        const currentCategory = categoryById.get(state.category)
        if (state.kind !== 'all' && currentCategory?.kind && currentCategory.kind !== state.kind) {
          state.category = 'all'
        }
      }
      visibleLimit = PAGE_SIZE
      syncUrl({ push: false })
      renderResults()
    } else if (categoryButton) {
      state.category = categoryButton.dataset.category
      visibleLimit = PAGE_SIZE
      syncUrl({ push: false })
      renderResults()
    } else if (tagButton) {
      const clickedTag = tagButton.dataset.tag
      state.tag = state.tag === clickedTag ? '' : clickedTag
      visibleLimit = PAGE_SIZE
      syncUrl({ push: false })
      renderResults()
    } else if (clearTagButton) {
      state.tag = ''
      visibleLimit = PAGE_SIZE
      syncUrl({ push: false })
      renderResults()
    } else if (loadMoreButton) {
      visibleLimit += PAGE_SIZE
      renderResults()
    } else if (clearButton) {
      state.q = ''
      state.kind = 'all'
      state.category = 'all'
      state.tag = ''
      visibleLimit = PAGE_SIZE
      const searchInput = document.querySelector('[data-search]')
      if (searchInput) searchInput.value = ''
      syncUrl({ push: false })
      renderResults()
    } else if (promptLink && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault()
      openedFromList = true
      state.id = promptLink.dataset.promptLink
      syncUrl({ push: true })
      syncDrawerFromState()
    }
  })

  window.addEventListener('popstate', applyUrlFromLocation)
  window.addEventListener('hashchange', applyUrlFromLocation)
}

initSiteChrome({
  onLocaleToggle: () => {
    locale = toggleLocale(locale)
    renderAll({ preserveFocus: true })
  }
})

bindGlobalEvents()
renderAll()
