import './styles.css'
import './pages.css'
import { categories, prompts } from 'virtual:library/prompts'
import { OPTIMIZER_URL, initSiteChrome, renderSiteFooter, renderSiteHeader, siteBackground } from './shell.js'
import { escapeHtml } from './html.js'

const LANGUAGE_STORAGE_KEY = 'prompt-optimizer-site-library-language'
const LANGUAGES = {
  zh: { label: '中文', htmlLang: 'zh-CN' },
  en: { label: 'English', htmlLang: 'en' }
}
const TARGETS = {
  'basic-user': { kind: 'text', label: '用户提示词' },
  'basic-system': { kind: 'text', label: '系统提示词' },
  'image-text2image': { kind: 'image', label: 'AI 绘图' }
}
const KINDS = { all: '全部', text: '文字', image: '图片' }
const PLACEHOLDER = /\{\{\s*([^{}\s]+)\s*\}\}/g

const categoryById = new Map(categories.map((category) => [category.id, category]))
const entries = prompts.map((prompt) => ({
  ...prompt,
  kind: TARGETS[prompt.target].kind,
  haystack: [
    prompt.locales.zh.title,
    prompt.locales.zh.summary,
    prompt.locales.en.title,
    prompt.locales.en.summary,
    ...prompt.tags
  ].join('\n').toLowerCase()
}))
const entryById = new Map(entries.map((entry) => [entry.id, entry]))
const showKindFilter = new Set(entries.map((entry) => entry.kind)).size > 1

const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
const state = {
  query: '',
  category: 'all',
  kind: 'all',
  language: storedLanguage in LANGUAGES ? storedLanguage : 'zh'
}
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

function htmlLang() {
  return LANGUAGES[state.language].htmlLang
}

function optimizerHref(entry) {
  const [mode, subMode] = entry.target.split('-')
  const query = new URLSearchParams({ importCode: entry.importCodes[state.language], subModeKey: entry.target })
  return `${OPTIMIZER_URL}/#/${mode}/${subMode}?${query}`
}

function valuesFor(entry) {
  const key = `${entry.id}:${state.language}`
  if (!filledValues.has(key)) {
    const variables = entry.locales[state.language].variables
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

function renderLanguageSwitch() {
  return `
    <div class="segmented" role="group" aria-label="提示词语言">
      ${Object.entries(LANGUAGES).map(([id, language]) => `
        <button type="button" data-language="${id}" aria-pressed="${id === state.language}" lang="${language.htmlLang}">${language.label}</button>
      `).join('')}
    </div>
  `
}

function renderPage() {
  document.querySelector('#app').innerHTML = `
    <div class="site-shell">
      ${siteBackground}
      ${renderSiteHeader({ current: '/library/' })}

      <main class="page">
        <section class="page-head">
          <h1>提示词库</h1>
          <p class="page-lead">挑一条现成的提示词，填好变量就能复制使用，也可以带进优化器接着改。</p>
        </section>

        <section class="section library" aria-label="提示词列表">
          <div class="library-toolbar">
            <label class="search-field">
              ${searchIcon}
              <input type="search" data-search placeholder="搜索标题、简介或标签" aria-label="搜索提示词" autocomplete="off" />
            </label>
            <div class="library-toolbar__switches">
              ${showKindFilter ? `
                <div class="segmented" role="group" aria-label="类型">
                  ${Object.entries(KINDS).map(([id, label]) => `
                    <button type="button" data-kind="${id}" aria-pressed="${id === state.kind}">${label} <span class="count" data-kind-count="${id}"></span></button>
                  `).join('')}
                </div>
              ` : ''}
              ${renderLanguageSwitch()}
            </div>
          </div>

          <div class="chip-row" role="group" aria-label="分类">
            <button type="button" class="chip" data-category="all" aria-pressed="true">全部 <span class="count" data-category-count="all"></span></button>
            ${categories.map((category) => `
              <button type="button" class="chip" data-category="${category.id}" aria-pressed="false" title="${escapeHtml(category.description)}">${escapeHtml(category.name)} <span class="count" data-category-count="${category.id}"></span></button>
            `).join('')}
          </div>

          <p class="result-count" aria-live="polite" data-result-count></p>
          <ul class="prompt-grid" data-prompt-grid></ul>
        </section>
      </main>

      ${renderSiteFooter({ current: '/library/' })}
    </div>

    <dialog class="drawer" id="prompt-drawer" aria-labelledby="drawer-title"></dialog>
  `
}

function renderCard(entry) {
  const content = entry.locales[state.language]
  return `
    <li>
      <a class="prompt-card" href="#${entry.id}" data-prompt-link>
        <span class="prompt-card__meta">
          <span class="pill">${escapeHtml(categoryById.get(entry.category).name)}</span>
          <span class="pill pill--quiet">${TARGETS[entry.target].label}</span>
        </span>
        <strong class="prompt-card__title" lang="${htmlLang()}">${escapeHtml(content.title)}</strong>
        <span class="prompt-card__summary" lang="${htmlLang()}">${escapeHtml(content.summary)}</span>
        ${entry.tags.length ? `<span class="tag-list">${entry.tags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join('')}</span>` : ''}
      </a>
    </li>
  `
}

function renderEmptyResults() {
  if (entries.length === 0) {
    return `
      <li class="empty-state">
        <p>提示词还在整理中。</p>
        <a class="button" href="${OPTIMIZER_URL}" target="_blank" rel="noopener">先去优化器写一条</a>
      </li>
    `
  }
  return `
    <li class="empty-state">
      <p>没有找到相关的提示词，换个关键词试试。</p>
      <button class="button" type="button" data-clear-filters>清除筛选</button>
    </li>
  `
}

function renderResults() {
  const terms = state.query.toLowerCase().split(/\s+/).filter(Boolean)
  const kindCounts = { all: 0, text: 0, image: 0 }
  const categoryCounts = Object.fromEntries([['all', 0], ...categories.map((category) => [category.id, 0])])
  const visible = []

  for (const entry of entries) {
    if (!terms.every((term) => entry.haystack.includes(term))) continue
    const kindMatches = state.kind === 'all' || entry.kind === state.kind
    const categoryMatches = state.category === 'all' || entry.category === state.category
    if (categoryMatches) {
      kindCounts.all += 1
      kindCounts[entry.kind] += 1
    }
    if (kindMatches) {
      categoryCounts.all += 1
      categoryCounts[entry.category] += 1
    }
    if (kindMatches && categoryMatches) visible.push(entry)
  }

  document.querySelectorAll('[data-kind]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.kind === state.kind))
    button.querySelector('[data-kind-count]').textContent = kindCounts[button.dataset.kind]
  })
  document.querySelectorAll('[data-category]').forEach((button) => {
    const count = categoryCounts[button.dataset.category]
    button.setAttribute('aria-pressed', String(button.dataset.category === state.category))
    button.classList.toggle('chip--empty', count === 0)
    button.querySelector('[data-category-count]').textContent = count
  })

  const filtered = terms.length > 0 || state.category !== 'all' || state.kind !== 'all'
  const description = state.category === 'all' ? '' : categoryById.get(state.category).description
  document.querySelector('[data-result-count]').innerHTML = `
    ${filtered ? `找到 ${visible.length} 条` : `共 ${visible.length} 条`}
    ${description ? `<span class="result-count__note">${escapeHtml(description)}</span>` : ''}
  `
  document.querySelector('[data-prompt-grid]').innerHTML = visible.length > 0
    ? visible.map(renderCard).join('')
    : renderEmptyResults()
}

function renderDrawer(entry) {
  if (!entry) {
    return `
      <header class="drawer__header">
        <div class="drawer__heading">
          <h2 id="drawer-title">没有找到这条提示词</h2>
        </div>
        <button class="icon-button" type="button" data-drawer-close aria-label="关闭">${closeIcon}</button>
      </header>
      <div class="drawer__body">
        <p class="drawer__summary">链接里的提示词不存在，可能已经下线。回到列表看看别的吧。</p>
      </div>
    `
  }

  const content = entry.locales[state.language]
  const values = valuesFor(entry)
  const lang = htmlLang()
  return `
    <header class="drawer__header">
      <div class="drawer__heading">
        <p class="drawer__meta">${escapeHtml(categoryById.get(entry.category).name)} · ${TARGETS[entry.target].label}</p>
        <h2 id="drawer-title" lang="${lang}">${escapeHtml(content.title)}</h2>
      </div>
      <div class="drawer__tools">
        ${renderLanguageSwitch()}
        <button class="icon-button" type="button" data-drawer-close aria-label="关闭">${closeIcon}</button>
      </div>
    </header>

    <div class="drawer__body">
      <p class="drawer__summary" lang="${lang}">${escapeHtml(content.summary)}</p>
      ${entry.tags.length ? `<p class="tag-list">${entry.tags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join('')}</p>` : ''}

      ${content.variables.length ? `
        <section class="drawer__section">
          <h3>填写变量</h3>
          <div class="var-form">
            ${content.variables.map((variable) => `
              <label class="var-field">
                <span class="var-field__name" lang="${lang}">${escapeHtml(variable.name)}</span>
                ${variable.description ? `<span class="var-field__hint" lang="${lang}">${escapeHtml(variable.description)}</span>` : ''}
                <textarea rows="3" data-variable="${escapeHtml(variable.name)}" lang="${lang}">${escapeHtml(values.get(variable.name) ?? '')}</textarea>
              </label>
            `).join('')}
          </div>
        </section>
      ` : ''}

      <section class="drawer__section">
        <div class="drawer__section-head">
          <h3>提示词</h3>
          <span class="drawer__progress" data-fill-progress></span>
        </div>
        <pre class="prompt-preview" lang="${lang}" data-prompt-preview></pre>
      </section>

      ${entry.example ? `
        <section class="drawer__section">
          <h3>示例</h3>
          <p class="drawer__example">${escapeHtml(entry.example)}</p>
        </section>
      ` : ''}

      ${entry.credit ? `<p class="drawer__credit">${escapeHtml(entry.credit)}</p>` : ''}
    </div>

    <footer class="drawer__actions">
      <button class="button button--primary" type="button" data-copy-prompt>复制</button>
      <a class="button" href="${optimizerHref(entry)}" target="_blank" rel="noopener" data-open-optimizer>在优化器中打开</a>
      ${content.variables.length ? '<p class="drawer__note">优化器里打开的是模板原文，这里填的变量不会带过去。</p>' : ''}
    </footer>
  `
}

function updatePreview() {
  if (!openEntry) return
  const content = openEntry.locales[state.language]
  const values = valuesFor(openEntry)
  const drawer = document.getElementById('prompt-drawer')
  drawer.querySelector('[data-prompt-preview]').innerHTML = renderPromptHtml(content.prompt, values)
  const filled = content.variables.filter((variable) => values.get(variable.name)).length
  drawer.querySelector('[data-fill-progress]').textContent = content.variables.length
    ? `已填 ${filled} / ${content.variables.length} 个变量`
    : ''
}

function renderOpenDrawer() {
  const drawer = document.getElementById('prompt-drawer')
  drawer.innerHTML = renderDrawer(openEntry)
  updatePreview()
}

function syncDrawer() {
  const drawer = document.getElementById('prompt-drawer')
  const id = decodeURIComponent(window.location.hash.slice(1))

  if (!id) {
    openedFromList = false
    if (drawer.open) drawer.close()
    return
  }

  openEntry = entryById.get(id) ?? null
  renderOpenDrawer()
  if (!drawer.open) drawer.showModal()
  drawer.querySelector('.drawer__body').scrollTop = 0
}

function requestClose() {
  if (openedFromList) {
    openedFromList = false
    window.history.back()
    return
  }
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  syncDrawer()
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older in-app browsers: copy through a selected textarea. It must sit inside
    // the open modal dialog, because everything outside it is inert.
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.className = 'copy-buffer'
    document.getElementById('prompt-drawer').append(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    textarea.remove()
    return copied
  }
}

async function handleCopy(button) {
  const content = openEntry.locales[state.language]
  const copied = await copyText(renderPromptText(content.prompt, valuesFor(openEntry)))
  button.textContent = copied ? '已复制' : '复制失败，请手动选择文本'
  button.dataset.state = copied ? 'done' : 'failed'
  window.clearTimeout(button.resetTimer)
  button.resetTimer = window.setTimeout(() => {
    button.textContent = '复制'
    delete button.dataset.state
  }, 1800)
}

function setLanguage(language, focusTarget) {
  state.language = language
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  document.querySelectorAll('[data-language]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.language === language))
  })
  renderResults()

  const drawer = document.getElementById('prompt-drawer')
  if (drawer.open && openEntry) {
    renderOpenDrawer()
    if (focusTarget) drawer.querySelector(`[data-language="${language}"]`)?.focus()
  }
}

function bindEvents() {
  const drawer = document.getElementById('prompt-drawer')

  document.querySelector('[data-search]').addEventListener('input', (event) => {
    state.query = event.target.value.trim()
    renderResults()
  })

  document.addEventListener('click', (event) => {
    const target = event.target
    const kindButton = target.closest('[data-kind]')
    const categoryButton = target.closest('[data-category]')
    const languageButton = target.closest('[data-language]')
    const promptLink = target.closest('[data-prompt-link]')

    if (kindButton) {
      state.kind = kindButton.dataset.kind
      renderResults()
    } else if (categoryButton) {
      state.category = categoryButton.dataset.category
      renderResults()
    } else if (languageButton) {
      if (languageButton.dataset.language !== state.language) {
        setLanguage(languageButton.dataset.language, drawer.contains(languageButton))
      }
    } else if (target.closest('[data-clear-filters]')) {
      state.query = ''
      state.category = 'all'
      state.kind = 'all'
      document.querySelector('[data-search]').value = ''
      renderResults()
    } else if (promptLink && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      openedFromList = true
    }
  })

  drawer.addEventListener('click', (event) => {
    if (event.target === drawer || event.target.closest('[data-drawer-close]')) {
      requestClose()
      return
    }
    const copyButton = event.target.closest('[data-copy-prompt]')
    if (copyButton) handleCopy(copyButton)
  })

  drawer.addEventListener('input', (event) => {
    const field = event.target.closest('[data-variable]')
    if (!field) return
    valuesFor(openEntry).set(field.dataset.variable, field.value)
    updatePreview()
  })

  drawer.addEventListener('cancel', (event) => {
    event.preventDefault()
    requestClose()
  })

  drawer.addEventListener('close', () => {
    const closedId = openEntry?.id
    openEntry = null
    if (closedId) document.querySelector(`[data-prompt-grid] a[href="#${CSS.escape(closedId)}"]`)?.focus({ preventScroll: true })
    // The browser can force-close a modal (e.g. repeated Escape); keep the URL in step.
    if (window.location.hash) requestClose()
  })

  window.addEventListener('hashchange', syncDrawer)
}

initSiteChrome()
renderPage()
renderResults()
bindEvents()
syncDrawer()
