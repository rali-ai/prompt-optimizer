import './styles.css'
import './pages.css'
import { lessons } from 'virtual:library/lessons'
import { OPTIMIZER_URL, initSiteChrome, renderSiteFooter, renderSiteHeader, siteBackground } from './shell.js'
import { escapeHtml } from './html.js'
import { renderMarkdown } from './markdown.js'

const PAGE_TITLE = document.title
const lessonIndexById = new Map(lessons.map((lesson, index) => [lesson.id, index]))
let currentView = null

function renderListView() {
  if (lessons.length === 0) {
    return `
      <section class="section learn-empty">
        <h2>课程正在准备中</h2>
        <p>第一批课程还在写。等不及的话，先从提示词库挑一条现成的，再拿到优化器里改改看。</p>
        <div class="learn-empty__actions">
          <a class="button button--primary" href="/library/">去提示词库</a>
          <a class="button" href="${OPTIMIZER_URL}" target="_blank" rel="noopener">打开优化器</a>
        </div>
      </section>
    `
  }

  return `
    <section class="section" aria-label="课程列表">
      <ol class="lesson-list">
        ${lessons.map((lesson) => `
          <li>
            <a class="lesson-card" href="#${lesson.id}">
              <strong>${escapeHtml(lesson.title)}</strong>
              ${lesson.summary ? `<span>${escapeHtml(lesson.summary)}</span>` : ''}
            </a>
          </li>
        `).join('')}
      </ol>
    </section>
  `
}

function renderCompare(lesson) {
  if (!lesson.before && !lesson.after) return ''
  return `
    <section class="lesson__section lesson__section--wide">
      <h2>改写前后</h2>
      <div class="compare">
        ${lesson.before ? `
          <figure class="compare__item">
            <figcaption>改写前</figcaption>
            <pre>${escapeHtml(lesson.before)}</pre>
          </figure>
        ` : ''}
        ${lesson.after ? `
          <figure class="compare__item compare__item--after">
            <figcaption>改写后</figcaption>
            <pre>${escapeHtml(lesson.after)}</pre>
          </figure>
        ` : ''}
      </div>
    </section>
  `
}

function renderPagerLink(lesson, label, modifier) {
  if (!lesson) return ''
  return `
    <a class="lesson-pager__link ${modifier}" href="#${lesson.id}">
      <span>${label}</span>
      <strong>${escapeHtml(lesson.title)}</strong>
    </a>
  `
}

function renderLessonView(lesson) {
  if (!lesson) {
    return `
      <div class="lesson-topbar"><a class="back-link" href="/learn/" data-back>← 全部课程</a></div>
      <section class="section learn-empty">
        <h2>没有找到这节课</h2>
        <p>链接里的课程不存在，可能已经调整。回到课程列表看看吧。</p>
      </section>
    `
  }

  const index = lessonIndexById.get(lesson.id)
  return `
    <div class="lesson-topbar">
      <a class="back-link" href="/learn/" data-back>← 全部课程</a>
      <span class="lesson-progress">${index + 1} / ${lessons.length}</span>
    </div>

    <article class="section lesson">
      <header class="lesson__head">
        <h1>${escapeHtml(lesson.title)}</h1>
        ${lesson.summary ? `<p class="page-lead">${escapeHtml(lesson.summary)}</p>` : ''}
      </header>

      ${lesson.sections.map((section) => `
        <section class="lesson__section">
          <h2>${escapeHtml(section.heading)}</h2>
          <div class="prose">${renderMarkdown(section.body)}</div>
        </section>
      `).join('')}

      ${renderCompare(lesson)}

      ${lesson.exercise ? `
        <aside class="exercise">
          <h2>练习</h2>
          <div class="prose">${renderMarkdown(lesson.exercise)}</div>
          <a class="button" href="${OPTIMIZER_URL}" target="_blank" rel="noopener">去优化器里试试</a>
        </aside>
      ` : ''}
    </article>

    <nav class="lesson-pager" aria-label="课程翻页">
      ${renderPagerLink(lessons[index - 1], '上一课', 'lesson-pager__link--previous')}
      ${renderPagerLink(lessons[index + 1], '下一课', 'lesson-pager__link--next')}
    </nav>
  `
}

function renderMain() {
  const id = decodeURIComponent(window.location.hash.slice(1))
  if (id === currentView) return
  currentView = id

  const lesson = id ? lessons[lessonIndexById.get(id)] : undefined
  const main = document.querySelector('[data-learn-main]')
  main.innerHTML = id
    ? renderLessonView(lesson)
    : `
      <section class="page-head">
        <h1>学习写提示词</h1>
        <p class="page-lead">一课讲一个方法，每课都有改写前后的对比和一道练习。</p>
      </section>
      ${renderListView()}
    `
  document.title = lesson ? `${lesson.title} · ${PAGE_TITLE}` : PAGE_TITLE
  window.scrollTo({ top: 0, behavior: 'instant' })
}

initSiteChrome()

document.querySelector('#app').innerHTML = `
  <div class="site-shell">
    ${siteBackground}
    ${renderSiteHeader({ current: '/learn/' })}
    <main class="page" data-learn-main></main>
    ${renderSiteFooter({ current: '/learn/' })}
  </div>
`

document.addEventListener('click', (event) => {
  const back = event.target.closest('[data-back]')
  if (!back || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  window.history.pushState(null, '', window.location.pathname + window.location.search)
  renderMain()
})

window.addEventListener('hashchange', renderMain)
window.addEventListener('popstate', renderMain)

renderMain()
