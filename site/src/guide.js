import './styles.css'
import './pages.css'
import userManualRaw from './guide-docs/user-manual.md?raw'
import trainingManualRaw from './guide-docs/training-manual.md?raw'
import { OPTIMIZER_URL, initSiteChrome, renderSiteFooter, renderSiteHeader, siteBackground } from './shell.js'
import { escapeHtml } from './html.js'
import { renderGuideDocument } from './guide-markdown.js'
import {
  applyDocumentMeta,
  getInitialLocale,
  localeFocusRegion,
  restoreLocaleFocus,
  toggleLocale
} from './locale.js'

const DOCS = [
  {
    id: 'user',
    raw: userManualRaw,
    badge: { 'zh-CN': '日常使用', en: 'User Guide' },
    label: { 'zh-CN': '完整使用手册', en: 'User Manual' },
    summary: {
      'zh-CN': '零基础 5 分钟上手官网、工作台、浏览器右侧栏插件与云同步，附 5 个真实案例和配图。',
      en: 'Get started in 5 minutes with the website, workbench, side-panel extension, and cloud sync.'
    }
  },
  {
    id: 'training',
    raw: trainingManualRaw,
    badge: { 'zh-CN': '内训与自学', en: 'Workshop' },
    label: { 'zh-CN': '实战培训手册', en: 'Training Handbook' },
    summary: {
      'zh-CN': '90 分钟标准工作坊教案，包含分模块演示脚本、4 组岗位演练题、评分卡与 7 天打卡表。',
      en: 'A 90-minute workshop playbook with module walkthroughs, role exercises, rubric, and 7-day plan.'
    }
  }
]

const DOC_IDS = DOCS.map((doc) => doc.id)
const DOC_BY_ID = new Map(DOCS.map((doc) => [doc.id, doc]))

const copyByLocale = {
  'zh-CN': {
    metaTitle: '使用与培训手册 · 高词 GoPrmpt',
    metaDescription: '高词（GoPrmpt）完整使用手册与 90 分钟实战培训手册，配真实界面截图与可复制案例，普通用户 5 分钟即可上手。',
    eyebrow: '在线手册 · 配图版',
    heading: '使用与培训手册',
    lead: '不需要懂技术术语，照着步骤和真实截图就能快速上手高词全屏工作台、151 条提示词库、26 节教程与浏览器右侧栏插件。',
    docSwitchAria: '切换手册版本',
    tocTitle: '本页目录',
    tocMobileSummary: '展开本页目录',
    printBtn: '打印 / 存为 PDF',
    openWorkbench: '打开全屏工作台',
    downloadExt: '下载浏览器插件',
    browseLibrary: '浏览 151 条词库',
    copy: '复制示例',
    copied: '已复制',
    copyFailed: '复制失败',
    zoomLabel: '点击查看大图',
    closeLightbox: '关闭大图预览',
    nextTitle: '看完手册，马上动手试一试',
    nextBody: '打开工作台直接改写一条你今天要用的指令，或者去提示词库找一个现成模板。',
    switchOther: (name) => `切换到《${name}》`,
    langNotice: ''
  },
  en: {
    metaTitle: 'User & Training Guide · GoPrmpt',
    metaDescription: 'Illustrated GoPrmpt user manual and 90-minute hands-on training handbook with real screenshots and copyable examples.',
    eyebrow: 'Illustrated Online Guide',
    heading: 'User & Training Guide',
    lead: 'Step-by-step illustrated walkthroughs for the GoPrmpt workbench, 151-prompt library, 26 lessons, browser side-panel extension, and cloud sync.',
    docSwitchAria: 'Switch handbook',
    tocTitle: 'On this page',
    tocMobileSummary: 'Table of contents',
    printBtn: 'Print / Save PDF',
    openWorkbench: 'Open Workbench',
    downloadExt: 'Download Extension',
    browseLibrary: 'Browse 151 Prompts',
    copy: 'Copy',
    copied: 'Copied',
    copyFailed: 'Copy failed',
    zoomLabel: 'Click to zoom',
    closeLightbox: 'Close preview',
    nextTitle: 'Ready to try it yourself?',
    nextBody: 'Open the full-screen workbench to rewrite a real prompt, or pick a ready-made template from the library.',
    switchOther: (name) => `Switch to ${name}`,
    langNotice: 'The detailed handbook chapters below are currently written in Simplified Chinese.'
  }
}

let locale = getInitialLocale()
let activeDocId = parseDocFromSearch(window.location.search)
let activeCopyBlocks = []
let headingObserver = null

function parseDocFromSearch(search) {
  const params = new URLSearchParams(search)
  const raw = params.get('doc')
  return DOC_IDS.includes(raw) ? raw : 'user'
}

function currentCopy() {
  return copyByLocale[locale] ?? copyByLocale['zh-CN']
}

function syncUrl(docId, { push = false } = {}) {
  const params = new URLSearchParams()
  if (docId !== 'user') params.set('doc', docId)
  const query = params.toString()
  const targetUrl = `${window.location.pathname}${query ? `?${query}` : ''}`
  if (push) {
    window.history.pushState(null, '', targetUrl)
  } else {
    window.history.replaceState(window.history.state, '', targetUrl)
  }
}

function renderTocItems(toc) {
  return toc
    .map(
      (item) => `
        <li class="guide-toc__item guide-toc__item--${item.level}">
          <a href="#${escapeHtml(item.id)}" data-toc-link="${escapeHtml(item.id)}">${escapeHtml(item.text)}</a>
        </li>
      `
    )
    .join('')
}

function bindActiveTocTracking() {
  if (headingObserver) {
    headingObserver.disconnect()
    headingObserver = null
  }
  const links = Array.from(document.querySelectorAll('.guide-toc--desktop [data-toc-link]'))
  if (!links.length || typeof IntersectionObserver === 'undefined') return

  const linkMap = new Map(links.map((link) => [link.dataset.tocLink, link]))
  const setActive = (id) => {
    links.forEach((link) => {
      link.classList.toggle('is-active', link.dataset.tocLink === id)
    })
  }
  setActive(links[0].dataset.tocLink)

  headingObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]?.target?.id && linkMap.has(visible[0].target.id)) {
        setActive(visible[0].target.id)
      }
    },
    { rootMargin: '-96px 0px -65% 0px', threshold: 0 }
  )

  document.querySelectorAll('.guide-article h2[id], .guide-article h3[id]').forEach((heading) => {
    headingObserver.observe(heading)
  })
}

function renderMain({ scrollTop = false } = {}) {
  const copy = currentCopy()
  const doc = DOC_BY_ID.get(activeDocId) ?? DOCS[0]
  const otherDoc = DOCS.find((item) => item.id !== doc.id) ?? DOCS[0]
  const parsed = renderGuideDocument(doc.raw, {
    imageBaseUrl: '/images/guide',
    copyLabel: copy.copy,
    zoomLabel: copy.zoomLabel
  })
  activeCopyBlocks = parsed.copyBlocks

  applyDocumentMeta({
    locale,
    title: `${doc.label[locale] ?? doc.label['zh-CN']} · ${copy.metaTitle}`,
    description: copy.metaDescription
  })

  const main = document.querySelector('[data-guide-main]')
  if (!main) return

  main.innerHTML = `
    <section class="page-head guide-hero">
      <p class="eyebrow">${escapeHtml(copy.eyebrow)}</p>
      <div class="guide-hero__row">
        <div>
          <h1>${escapeHtml(copy.heading)}</h1>
          <p class="page-lead">${escapeHtml(copy.lead)}</p>
        </div>
        <div class="guide-hero__actions">
          <button type="button" class="button" data-print-guide>${escapeHtml(copy.printBtn)}</button>
          <a class="button button--primary" href="${OPTIMIZER_URL}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.openWorkbench)}</a>
        </div>
      </div>

      <div class="guide-switcher" role="tablist" aria-label="${escapeHtml(copy.docSwitchAria)}">
        ${DOCS.map((item) => {
          const selected = item.id === doc.id
          return `
            <button
              type="button"
              role="tab"
              class="guide-switch-card"
              data-doc-tab="${item.id}"
              aria-selected="${selected}"
            >
              <span class="guide-switch-card__badge">${escapeHtml(item.badge[locale] ?? item.badge['zh-CN'])}</span>
              <strong>${escapeHtml(item.label[locale] ?? item.label['zh-CN'])}</strong>
              <span>${escapeHtml(item.summary[locale] ?? item.summary['zh-CN'])}</span>
            </button>
          `
        }).join('')}
      </div>
      ${copy.langNotice ? `<p class="guide-lang-notice">${escapeHtml(copy.langNotice)}</p>` : ''}
    </section>

    <section class="section guide-layout">
      <aside class="guide-toc guide-toc--desktop" aria-label="${escapeHtml(copy.tocTitle)}">
        <p class="guide-toc__title">${escapeHtml(copy.tocTitle)}</p>
        <ol class="guide-toc__list">${renderTocItems(parsed.toc)}</ol>
      </aside>

      <div class="guide-content">
        <details class="guide-toc-mobile">
          <summary>${escapeHtml(copy.tocMobileSummary)}</summary>
          <ol class="guide-toc__list">${renderTocItems(parsed.toc)}</ol>
        </details>

        <article class="guide-article prose" lang="zh-CN">
          <header class="guide-article__head">
            <span class="pill">${escapeHtml(doc.badge[locale] ?? doc.badge['zh-CN'])}</span>
            <h2>${escapeHtml(parsed.title)}</h2>
          </header>
          ${parsed.html}
        </article>

        <aside class="guide-next">
          <div>
            <h3>${escapeHtml(copy.nextTitle)}</h3>
            <p>${escapeHtml(copy.nextBody)}</p>
          </div>
          <div class="guide-next__actions">
            <button type="button" class="button" data-doc-tab="${otherDoc.id}">${escapeHtml(copy.switchOther(otherDoc.label[locale] ?? otherDoc.label['zh-CN']))}</button>
            <a class="button button--primary" href="${OPTIMIZER_URL}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.openWorkbench)}</a>
            <a class="button" href="/library/">${escapeHtml(copy.browseLibrary)}</a>
            <a class="button" href="/#extension">${escapeHtml(copy.downloadExt)}</a>
          </div>
        </aside>
      </div>
    </section>

    <dialog class="guide-lightbox" data-guide-lightbox aria-label="${escapeHtml(copy.zoomLabel)}">
      <div class="guide-lightbox__inner">
        <button type="button" class="icon-button guide-lightbox__close" data-close-lightbox aria-label="${escapeHtml(copy.closeLightbox)}">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
        <img class="guide-lightbox__img" data-lightbox-img src="" alt="" />
        <p class="guide-lightbox__caption" data-lightbox-caption></p>
      </div>
    </dialog>
  `

  bindActiveTocTracking()
  if (scrollTop) window.scrollTo({ top: 0, behavior: 'instant' })
}

function renderShell({ preserveFocus = false } = {}) {
  const focusRegion = preserveFocus ? localeFocusRegion() : null
  const menuExpanded = document.querySelector('.site-menu-button')?.getAttribute('aria-expanded') ?? 'false'

  document.querySelector('#app').innerHTML = `
    <div class="site-shell">
      ${siteBackground}
      ${renderSiteHeader({ locale, current: '/guide/', showLocale: true, menuExpanded })}
      <main class="page" data-guide-main></main>
      ${renderSiteFooter({ locale, current: '/guide/', showLocale: true })}
    </div>
  `
  renderMain()
  if (focusRegion) restoreLocaleFocus(focusRegion)
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.className = 'copy-buffer'
    document.body.append(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    textarea.remove()
    return copied
  }
}

initSiteChrome({
  onLocaleToggle: () => {
    locale = toggleLocale(locale)
    renderShell({ preserveFocus: true })
  }
})

document.addEventListener('click', async (event) => {
  const target = event.target

  const docTab = target.closest('[data-doc-tab]')
  if (docTab) {
    const nextId = docTab.dataset.docTab
    if (DOC_IDS.includes(nextId) && nextId !== activeDocId) {
      activeDocId = nextId
      syncUrl(nextId, { push: true })
      renderMain({ scrollTop: true })
    }
    return
  }

  if (target.closest('[data-print-guide]')) {
    window.print()
    return
  }

  const copyBtn = target.closest('[data-copy-snippet]')
  if (copyBtn) {
    const idx = Number(copyBtn.dataset.copySnippet)
    const text = activeCopyBlocks[idx]
    if (typeof text === 'string') {
      const copy = currentCopy()
      const ok = await copyText(text)
      copyBtn.textContent = ok ? copy.copied : copy.copyFailed
      window.clearTimeout(copyBtn.resetTimer)
      copyBtn.resetTimer = window.setTimeout(() => {
        copyBtn.textContent = copy.copy
      }, 1800)
    }
    return
  }

  const zoomTrigger = target.closest('[data-zoom-src]')
  if (zoomTrigger) {
    const dialog = document.querySelector('[data-guide-lightbox]')
    const img = document.querySelector('[data-lightbox-img]')
    const caption = document.querySelector('[data-lightbox-caption]')
    if (dialog && img && caption) {
      img.src = zoomTrigger.dataset.zoomSrc
      img.alt = zoomTrigger.dataset.zoomAlt ?? ''
      caption.textContent = zoomTrigger.dataset.zoomAlt ?? ''
      dialog.showModal()
    }
    return
  }

  if (target.closest('[data-close-lightbox]')) {
    document.querySelector('[data-guide-lightbox]')?.close()
    return
  }

  const lightbox = target.closest('[data-guide-lightbox]')
  if (lightbox && target === lightbox) {
    lightbox.close()
    return
  }

  const mobileTocLink = target.closest('.guide-toc-mobile a')
  if (mobileTocLink) {
    const details = mobileTocLink.closest('details')
    if (details) details.open = false
  }
})

window.addEventListener('popstate', () => {
  const nextId = parseDocFromSearch(window.location.search)
  if (nextId !== activeDocId) {
    activeDocId = nextId
    renderMain({ scrollTop: true })
  }
})

renderShell()
