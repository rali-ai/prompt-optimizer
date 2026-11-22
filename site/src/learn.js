import './styles.css'
import './pages.css'
import { lessons as libraryLessons } from 'virtual:library/lessons'
import { OPTIMIZER_URL, initSiteChrome, renderSiteFooter, renderSiteHeader, siteBackground } from './shell.js'
import { escapeHtml } from './html.js'
import { renderMarkdown } from './markdown.js'
import {
  applyDocumentMeta,
  contentLanguage,
  getInitialLocale,
  htmlLang,
  localeFocusRegion,
  renderSourceCredit,
  restoreLocaleFocus,
  toggleLocale
} from './locale.js'
import { TRACK_IDS, buildLearnUrlSearch, parseLearnUrlState } from './learn-state.js'

const copyByLocale = {
  'zh-CN': {
    metaTitle: '教程与写法 · 提示词优化器',
    metaDescription: '14 节入门课程与 12 节进阶写法，每课都有改写前后对比和一道练习，支持中英双语切换。',
    heading: '教程与写法',
    lead: '先用入门课程打通基本写法，再用进阶写法解决具体难题。每课都有改写前后对比和一道练习。',
    trackAria: '课程轨道切换',
    tracks: {
      course: {
        label: '入门课程',
        lead: '从四要素、背景交代到输出格式与迭代改写，按顺序读完就能稳稳写出清晰指令。'
      },
      pattern: {
        label: '进阶写法',
        lead: '从实战案例提炼出的 12 种常见结构：正反界定、变量槽位、骨架分区、负面清单与多图一致性。'
      }
    },
    listAria: '课程列表',
    emptyTitle: '课程正在准备中',
    emptyBody: '这一组课程还在整理。可以先去提示词库挑一条现成的，再拿到优化器里试试。',
    emptyLibrary: '去提示词库',
    emptyOptimizer: '打开优化器',
    backToList: (trackLabel) => `← 返回${trackLabel}`,
    notFoundTitle: '没有找到这节课',
    notFoundBody: '链接里的课程不存在，可能已经调整。回到列表看看别的吧。',
    compareTitle: '改写前后',
    beforeLabel: '改写前',
    afterLabel: '改写后',
    copy: '复制',
    copied: '已复制',
    copyFailed: '复制失败',
    exerciseTitle: '练习',
    tryOptimizer: '去优化器里试试',
    pagerAria: '课程翻页',
    previous: '上一课',
    next: '下一课'
  },
  en: {
    metaTitle: 'Learn · Prompt Optimizer',
    metaDescription: '14 starter lessons and 12 prompt patterns with before/after comparisons and hands-on exercises.',
    heading: 'Learn Prompting',
    lead: 'Start with the fundamentals, then pick up reusable patterns for harder tasks. Every lesson includes a before/after rewrite and an exercise.',
    trackAria: 'Switch learning track',
    tracks: {
      course: {
        label: 'Starter Course',
        lead: 'Work through the four core elements, context, formatting, and iteration in order to write clear prompts reliably.'
      },
      pattern: {
        label: 'Prompt Patterns',
        lead: '12 reusable structures distilled from real prompts: positive/negative framing, variable slots, skeletons, negative checklists, and multi-image consistency.'
      }
    },
    listAria: 'Lesson list',
    emptyTitle: 'Lessons are on the way',
    emptyBody: 'This track is still being prepared. Meanwhile, browse the prompt library or try an idea in the optimizer.',
    emptyLibrary: 'Browse Prompt Library',
    emptyOptimizer: 'Open Optimizer',
    backToList: (trackLabel) => `← Back to ${trackLabel}`,
    notFoundTitle: 'Lesson not found',
    notFoundBody: 'This lesson link does not match any lesson. Return to the track list to keep reading.',
    compareTitle: 'Before & After',
    beforeLabel: 'Before',
    afterLabel: 'After',
    copy: 'Copy',
    copied: 'Copied',
    copyFailed: 'Copy failed',
    exerciseTitle: 'Exercise',
    tryOptimizer: 'Try in Optimizer',
    pagerAria: 'Lesson navigation',
    previous: 'Previous',
    next: 'Next'
  }
}

const lessonById = new Map(libraryLessons.map((lesson) => [lesson.id, lesson]))
const lessonsByTrack = Object.fromEntries(
  TRACK_IDS.map((track) => [track, libraryLessons.filter((lesson) => lesson.track === track)])
)

let locale = getInitialLocale()
const initialState = parseLearnUrlState(window.location.search, window.location.hash, lessonById)
const state = {
  track: initialState.track,
  id: initialState.id
}

const currentCopy = () => copyByLocale[locale] ?? copyByLocale['zh-CN']
const activeLang = () => contentLanguage(locale)

function syncUrl({ push = false } = {}) {
  const search = buildLearnUrlSearch(state)
  const targetUrl = `${window.location.pathname}${search}`
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (targetUrl === currentUrl) return
  if (push) {
    window.history.pushState(null, '', targetUrl)
  } else {
    window.history.replaceState(window.history.state, '', targetUrl)
  }
}

function updateDocumentMeta(activeLesson) {
  const copy = currentCopy()
  const lang = activeLang()
  const title = activeLesson
    ? `${activeLesson.locales[lang].title} · ${copy.metaTitle}`
    : `${copy.tracks[state.track].label} · ${copy.metaTitle}`
  applyDocumentMeta({ locale, title, description: copy.metaDescription })
}

function renderTrackTabs() {
  const copy = currentCopy()
  return `
    <div class="learn-tabs" role="tablist" aria-label="${escapeHtml(copy.trackAria)}">
      ${TRACK_IDS.map((track) => `
        <button
          type="button"
          role="tab"
          class="learn-tab"
          data-track="${track}"
          aria-selected="${state.track === track}"
        >
          <span>${escapeHtml(copy.tracks[track].label)}</span>
          <span class="count">${lessonsByTrack[track].length}</span>
        </button>
      `).join('')}
    </div>
  `
}

function renderListView() {
  const copy = currentCopy()
  const lang = activeLang()
  const trackLessons = lessonsByTrack[state.track] ?? []

  if (trackLessons.length === 0) {
    return `
      <section class="section learn-empty">
        <h2>${escapeHtml(copy.emptyTitle)}</h2>
        <p>${escapeHtml(copy.emptyBody)}</p>
        <div class="learn-empty__actions">
          <a class="button button--primary" href="/library/">${escapeHtml(copy.emptyLibrary)}</a>
          <a class="button" href="${OPTIMIZER_URL}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.emptyOptimizer)}</a>
        </div>
      </section>
    `
  }

  return `
    <section class="section" aria-label="${escapeHtml(copy.listAria)}">
      <div class="learn-track-head">
        ${renderTrackTabs()}
        <p class="learn-track-lead">${escapeHtml(copy.tracks[state.track].lead)}</p>
      </div>
      <ol class="lesson-list">
        ${trackLessons.map((lesson, index) => {
          const content = lesson.locales[lang]
          const href = `/learn/${buildLearnUrlSearch({ track: lesson.track, id: lesson.id })}`
          const num = String(lesson.order ?? index + 1).padStart(2, '0')
          return `
            <li>
              <a class="lesson-card" href="${escapeHtml(href)}" data-lesson-link="${escapeHtml(lesson.id)}">
                <span class="lesson-card__index">${num}</span>
                <strong lang="${htmlLang(locale)}">${escapeHtml(content.title)}</strong>
                ${content.summary ? `<span lang="${htmlLang(locale)}">${escapeHtml(content.summary)}</span>` : ''}
              </a>
            </li>
          `
        }).join('')}
      </ol>
    </section>
  `
}

function renderCompare(content) {
  const copy = currentCopy()
  if (!content.before && !content.after) return ''
  return `
    <section class="lesson__section lesson__section--wide">
      <h2>${escapeHtml(copy.compareTitle)}</h2>
      <div class="compare">
        ${content.before ? `
          <figure class="compare__item">
            <div class="compare__head">
              <figcaption>${escapeHtml(copy.beforeLabel)}</figcaption>
              <button type="button" class="copy-mini" data-copy-compare="before">${escapeHtml(copy.copy)}</button>
            </div>
            <pre lang="${htmlLang(locale)}">${escapeHtml(content.before)}</pre>
          </figure>
        ` : ''}
        ${content.after ? `
          <figure class="compare__item compare__item--after">
            <div class="compare__head">
              <figcaption>${escapeHtml(copy.afterLabel)}</figcaption>
              <button type="button" class="copy-mini" data-copy-compare="after">${escapeHtml(copy.copy)}</button>
            </div>
            <pre lang="${htmlLang(locale)}">${escapeHtml(content.after)}</pre>
          </figure>
        ` : ''}
      </div>
    </section>
  `
}

function renderPagerLink(lesson, label, modifier) {
  if (!lesson) return ''
  const content = lesson.locales[activeLang()]
  const href = `/learn/${buildLearnUrlSearch({ track: lesson.track, id: lesson.id })}`
  return `
    <a class="lesson-pager__link ${modifier}" href="${escapeHtml(href)}" data-lesson-link="${escapeHtml(lesson.id)}">
      <span>${escapeHtml(label)}</span>
      <strong lang="${htmlLang(locale)}">${escapeHtml(content.title)}</strong>
    </a>
  `
}

function renderLessonView(lesson) {
  const copy = currentCopy()
  const backHref = `/learn/${buildLearnUrlSearch({ track: state.track })}`
  const trackLabel = copy.tracks[state.track].label

  if (!lesson) {
    return `
      <div class="lesson-topbar"><a class="back-link" href="${escapeHtml(backHref)}" data-back>${escapeHtml(copy.backToList(trackLabel))}</a></div>
      <section class="section learn-empty">
        <h2>${escapeHtml(copy.notFoundTitle)}</h2>
        <p>${escapeHtml(copy.notFoundBody)}</p>
      </section>
    `
  }

  const lang = activeLang()
  const content = lesson.locales[lang]
  const trackLessons = lessonsByTrack[lesson.track] ?? []
  const index = trackLessons.findIndex((item) => item.id === lesson.id)
  const creditHtml = renderSourceCredit(lesson.source, locale)
  const docLang = htmlLang(locale)

  return `
    <div class="lesson-topbar">
      <a class="back-link" href="${escapeHtml(backHref)}" data-back>${escapeHtml(copy.backToList(copy.tracks[lesson.track].label))}</a>
      <span class="lesson-progress">${index + 1} / ${trackLessons.length}</span>
    </div>

    <article class="section lesson">
      <header class="lesson__head">
        <p class="lesson__track-badge">${escapeHtml(copy.tracks[lesson.track].label)}</p>
        <h1 lang="${docLang}">${escapeHtml(content.title)}</h1>
        ${content.summary ? `<p class="page-lead" lang="${docLang}">${escapeHtml(content.summary)}</p>` : ''}
      </header>

      ${content.sections.map((section) => `
        <section class="lesson__section">
          <h2 lang="${docLang}">${escapeHtml(section.heading)}</h2>
          <div class="prose" lang="${docLang}">${renderMarkdown(section.body)}</div>
        </section>
      `).join('')}

      ${renderCompare(content)}

      ${content.exercise ? `
        <aside class="exercise">
          <h2>${escapeHtml(copy.exerciseTitle)}</h2>
          <div class="prose" lang="${docLang}">${renderMarkdown(content.exercise)}</div>
          <a class="button" href="${OPTIMIZER_URL}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.tryOptimizer)}</a>
        </aside>
      ` : ''}

      ${creditHtml ? `<p class="lesson__credit">${creditHtml}</p>` : ''}
    </article>

    <nav class="lesson-pager" aria-label="${escapeHtml(copy.pagerAria)}">
      ${renderPagerLink(trackLessons[index - 1], copy.previous, 'lesson-pager__link--previous')}
      ${renderPagerLink(trackLessons[index + 1], copy.next, 'lesson-pager__link--next')}
    </nav>
  `
}

function renderMain({ scrollTop = false } = {}) {
  const copy = currentCopy()
  const activeLesson = state.id ? lessonById.get(state.id) : undefined
  if (activeLesson) state.track = activeLesson.track

  const main = document.querySelector('[data-learn-main]')
  if (!main) return

  main.innerHTML = state.id
    ? renderLessonView(activeLesson)
    : `
      <section class="page-head">
        <h1>${escapeHtml(copy.heading)}</h1>
        <p class="page-lead">${escapeHtml(copy.lead)}</p>
      </section>
      ${renderListView()}
    `

  updateDocumentMeta(activeLesson)
  if (scrollTop) window.scrollTo({ top: 0, behavior: 'instant' })
}

function renderShell({ preserveFocus = false } = {}) {
  const focusRegion = preserveFocus ? localeFocusRegion() : null
  const menuExpanded = document.querySelector('.site-menu-button')?.getAttribute('aria-expanded') ?? 'false'

  document.querySelector('#app').innerHTML = `
    <div class="site-shell">
      ${siteBackground}
      ${renderSiteHeader({ locale, current: '/learn/', showLocale: true, menuExpanded })}
      <main class="page" data-learn-main></main>
      ${renderSiteFooter({ locale, current: '/learn/', showLocale: true })}
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

function applyUrlFromLocation() {
  const parsed = parseLearnUrlState(window.location.search, window.location.hash, lessonById)
  state.track = parsed.track
  state.id = parsed.id
  renderMain({ scrollTop: true })
}

initSiteChrome({
  onLocaleToggle: () => {
    locale = toggleLocale(locale)
    renderShell({ preserveFocus: true })
  }
})

document.addEventListener('click', async (event) => {
  const target = event.target

  const trackTab = target.closest('[data-track]')
  if (trackTab) {
    const nextTrack = trackTab.dataset.track
    if (TRACK_IDS.includes(nextTrack) && (nextTrack !== state.track || state.id)) {
      state.track = nextTrack
      state.id = ''
      syncUrl({ push: false })
      renderMain()
    }
    return
  }

  const copyCompare = target.closest('[data-copy-compare]')
  if (copyCompare && state.id) {
    const lesson = lessonById.get(state.id)
    const content = lesson?.locales[activeLang()]
    const text = copyCompare.dataset.copyCompare === 'before' ? content?.before : content?.after
    if (text) {
      const copy = currentCopy()
      const ok = await copyText(text)
      copyCompare.textContent = ok ? copy.copied : copy.copyFailed
      window.clearTimeout(copyCompare.resetTimer)
      copyCompare.resetTimer = window.setTimeout(() => {
        copyCompare.textContent = copy.copy
      }, 1800)
    }
    return
  }

  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

  const lessonLink = target.closest('[data-lesson-link]')
  if (lessonLink) {
    event.preventDefault()
    const id = lessonLink.dataset.lessonLink
    const lesson = lessonById.get(id)
    if (lesson) state.track = lesson.track
    state.id = id
    syncUrl({ push: true })
    renderMain({ scrollTop: true })
    return
  }

  const back = target.closest('[data-back]')
  if (back) {
    event.preventDefault()
    state.id = ''
    syncUrl({ push: true })
    renderMain({ scrollTop: true })
  }
})

window.addEventListener('popstate', applyUrlFromLocation)
window.addEventListener('hashchange', applyUrlFromLocation)

renderShell()
