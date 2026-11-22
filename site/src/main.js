import './styles.css'
import { OPTIMIZER_URL, initSiteChrome, renderSiteFooter, renderSiteHeader, siteBackground } from './shell.js'

const STORAGE_KEY = 'prompt-optimizer-site-locale'
const SUPPORTED_LOCALES = ['zh-CN', 'en']

const translations = {
  'zh-CN': {
    htmlLang: 'zh-CN',
    title: '提示词优化器',
    description: '开源提示词工具。用自己的模型改写给 AI 的指令，并排比较改写前后的回答，保存满意的版本。',
    hero: {
      title: '提示词优化器',
      lead: '贴入你准备发给 AI 的指令，改写后用同一个模型测试两版，看看哪份回答更符合你的要求。',
      primary: '打开优化器',
      setupNote: '首次使用需配置 API Key 或连接已运行的本地模型。',
      visualTitle: '左侧改写提示词，右侧对比两版回答',
      screenshotLabel: '点击放大工作区截图',
      screenshotAlt: '提示词优化器工作区截图，右侧并排展示改写前后的回答',
      screenshot: 'system-workspace-zh-CN.jpg'
    },
    imagePreview: {
      title: '截图预览',
      hint: '点击放大',
      actualSize: '查看原尺寸',
      fit: '适应窗口',
      close: '关闭预览'
    },
    workflow: {
      title: '怎样优化一条提示词',
      steps: [
        {
          title: '填入提示词',
          body: '粘贴你准备发给 AI 的指令，也可以从模板或文件导入。'
        },
        {
          title: '改写任务要求',
          body: '用你选的模型补清楚任务目标、约束和输出格式。'
        },
        {
          title: '比较两版回答',
          body: '用同一个模型测试两版提示词，看改写是否解决了原来的问题。'
        },
        {
          title: '保存并复用',
          body: '把满意的提示词和测试示例存入收藏，下次接着用。'
        }
      ]
    },
    workspaces: {
      title: '按任务选择工作区',
      items: [
        {
          title: '单条提示词',
          body: '改写一条系统或用户提示词，明确角色、规则和输出格式。'
        },
        {
          title: '变量模板',
          body: '同一套提示词需要反复替换输入时，用真实数据测试模板。'
        },
        {
          title: '多消息上下文',
          body: '把系统指令、用户消息和对话历史放在一起，测试它们如何影响回答。'
        },
        {
          title: '图像提示词',
          body: '改写并测试文生图、图生图和多图提示词，对比生成结果。'
        }
      ]
    },
    arena: {
      title: '在竞技场比较模型和参数',
      lead: '用同一道题比较不同模型，或比较同一模型在不同设置（例如思考强度）下的回答。',
      screenshot: 'arena-comparison-zh-CN.jpg',
      screenshotLabel: '点击放大竞技场截图',
      screenshotAlt: '竞技场并排展示三个模型绘制的机械鲸鱼场景',
      caption: '同一道 HTML/SVG 绘图题，结果从左到右：GPT-6.2 Astra、GPT-6.2 Sol、DeepSeek Flash。',
      action: '了解竞技场'
    },
    access: {
      title: '选择使用方式',
      repository: 'GitHub 开源仓库',
      dataNote: '配置、历史和收藏默认保存在当前使用环境。相关输入会发给你配置的模型服务，远程备份会发到你配置的存储。',
      entries: [
        {
          title: '在线使用',
          body: '在浏览器打开工作区。',
          href: 'https://goprmpt.net'
        },
        {
          title: 'Docker 部署',
          body: '运行自己的实例。',
          href: 'https://github.com/rali-ai/prompt-optimizer'
        }
      ]
    }
  },
  en: {
    htmlLang: 'en',
    title: '提示词优化器 | Rewrite and test AI prompts',
    description: 'An open-source tool to rewrite prompts with your own models, compare actual responses, and save prompts for reuse.',
    hero: {
      title: '提示词优化器',
      lead: 'Paste a prompt, rewrite it, and test both versions with the same model. See which answer fits your task better.',
      primary: 'Open Optimizer',
      setupNote: 'To get started, add an API key or connect to a running local model.',
      visualTitle: 'Edit on the left, compare answers on the right',
      screenshotLabel: 'Click to enlarge the workspace screenshot',
      screenshotAlt: 'Workspace with answers before and after rewriting shown side by side',
      screenshot: 'system-workspace-en.jpg'
    },
    imagePreview: {
      title: 'Screenshot preview',
      hint: 'Click to enlarge',
      actualSize: 'View actual size',
      fit: 'Fit to window',
      close: 'Close preview'
    },
    workflow: {
      title: 'How to improve a prompt',
      steps: [
        {
          title: 'Start with a prompt',
          body: 'Paste your own prompt or import one from a template or file.'
        },
        {
          title: 'Clarify the instructions',
          body: 'Use a model you choose to make the task, constraints, and output format more specific.'
        },
        {
          title: 'Compare responses',
          body: 'Test both prompts with the same model to see whether the rewrite helped.'
        },
        {
          title: 'Save the version you prefer',
          body: 'Keep the prompt and its test examples in Favorites for next time.'
        }
      ]
    },
    workspaces: {
      title: 'Choose a workspace',
      items: [
        {
          title: 'Single prompt',
          body: 'Rewrite a system or user prompt to clarify its role, rules, and output format.'
        },
        {
          title: 'Variable templates',
          body: 'Test a reusable prompt with the real values you plan to swap in.'
        },
        {
          title: 'Multi-message context',
          body: 'Test how system instructions, user messages, and conversation history affect the answer together.'
        },
        {
          title: 'Image prompts',
          body: 'Rewrite prompts and compare results for text-to-image, image-to-image, and multi-image tasks.'
        }
      ]
    },
    arena: {
      title: 'Compare models and settings in Arena',
      lead: 'Give different models the same task, or compare one model at different settings, such as reasoning effort.',
      screenshot: 'arena-comparison-en.jpg',
      screenshotLabel: 'Click to enlarge the Arena screenshot',
      screenshotAlt: 'Arena showing three models’ drawings of a mechanical whale side by side',
      caption: 'Same HTML/SVG drawing task. From left to right: GPT-6.2 Astra, GPT-6.2 Sol, and DeepSeek Flash.',
      action: 'Explore Arena'
    },
    access: {
      title: 'Ways to use it',
      repository: 'GitHub repository',
      dataNote: 'Settings, history, and favorites stay in your current environment by default. Model requests and remote backups go to the model service and storage you configure.',
      entries: [
        {
          title: 'Web app',
          body: 'Open the workspace in your browser.',
          href: 'https://goprmpt.net'
        },
        {
          title: 'Docker deployment',
          body: 'Host your own instance.',
          href: 'https://github.com/rali-ai/prompt-optimizer'
        }
      ]
    }
  }
}

function normalizeLocale(locale) {
  if (!locale) return 'zh-CN'
  if (locale.startsWith('zh')) return 'zh-CN'
  return 'en'
}

function getInitialLocale() {
  const storedLocale = window.localStorage.getItem(STORAGE_KEY)
  if (storedLocale && SUPPORTED_LOCALES.includes(storedLocale)) {
    return storedLocale
  }

  const browserLocale = normalizeLocale(navigator.language || navigator.languages?.[0] || 'zh-CN')
  return SUPPORTED_LOCALES.includes(browserLocale) ? browserLocale : 'zh-CN'
}

function renderApp(locale) {
  const copy = translations[locale]
  const menuExpanded = document.querySelector('.site-menu-button')?.getAttribute('aria-expanded') ?? 'false'
  const focusedRegion = document.activeElement?.closest('.locale-switch')?.closest('header, footer')?.localName

  document.documentElement.lang = copy.htmlLang
  document.documentElement.dataset.locale = locale
  document.title = copy.title

  const descriptionMeta = document.querySelector('meta[name="description"]')
  const ogDescriptionMeta = document.querySelector('meta[property="og:description"]')
  const ogTitleMeta = document.querySelector('meta[property="og:title"]')

  if (descriptionMeta) descriptionMeta.setAttribute('content', copy.description)
  if (ogDescriptionMeta) ogDescriptionMeta.setAttribute('content', copy.description)
  if (ogTitleMeta) ogTitleMeta.setAttribute('content', copy.title)

  document.querySelector('#app').innerHTML = `
    <div class="site-shell">
      ${siteBackground}
      ${renderSiteHeader({ locale, showLocale: true, menuExpanded })}

      <main>
        <section class="hero">
          <div class="hero-copy">
            <h1 class="hero-title">${copy.hero.title}</h1>
            <p class="hero-lead">${copy.hero.lead}</p>
            <div class="hero-actions">
              <a class="button button--primary" href="${OPTIMIZER_URL}" target="_blank" rel="noopener">${copy.hero.primary}</a>
            </div>
            <p class="hero-setup" id="hero-setup">${copy.hero.setupNote}</p>
          </div>

          <a class="hero-visual" href="/images/product/2026-11/${copy.hero.screenshot}" data-image-preview aria-haspopup="dialog" aria-controls="image-preview" aria-label="${copy.hero.screenshotLabel}" aria-describedby="hero-screenshot-caption">
            <p class="hero-visual__meta" id="hero-screenshot-caption">
              ${copy.hero.visualTitle}<span class="screenshot-hint" aria-hidden="true">${copy.imagePreview.hint}</span>
            </p>
            <div class="hero-shot">
              <img src="/images/product/2026-11/${copy.hero.screenshot}" alt="${copy.hero.screenshotAlt}" width="2047" height="1018" fetchpriority="high" />
            </div>
          </a>
        </section>

        <section class="section">
          <div class="section-head">
            <h2>${copy.workflow.title}</h2>
          </div>
          <div class="workflow-line">
            ${copy.workflow.steps
              .map(
                (step, index) => `
                  <article class="workflow-node workflow-node--${index + 1}">
                    <div class="workflow-node__marker">
                      <span class="workflow-index">0${index + 1}</span>
                    </div>
                    <div class="workflow-node__body">
                      <h3>${step.title}</h3>
                      <p>${step.body}</p>
                    </div>
                  </article>
                `
              )
              .join('')}
          </div>
        </section>

        <section class="section" id="arena">
          <div class="section-head">
            <h2>${copy.arena.title}</h2>
            <p class="section-lead">${copy.arena.lead}</p>
          </div>
          <figure class="arena-example">
            <a class="arena-example__image" href="/images/product/2026-11/${copy.arena.screenshot}" data-image-preview aria-haspopup="dialog" aria-controls="image-preview" aria-label="${copy.arena.screenshotLabel}" aria-describedby="arena-screenshot-caption">
              <img src="/images/product/2026-11/${copy.arena.screenshot}" alt="${copy.arena.screenshotAlt}" width="2047" height="1018" loading="lazy" />
            </a>
            <figcaption class="arena-example__caption">
              <p id="arena-screenshot-caption">
                ${copy.arena.caption}<span class="screenshot-hint" aria-hidden="true">${copy.imagePreview.hint}</span>
              </p>
            </figcaption>
          </figure>
        </section>

        <section class="section" id="workspaces">
          <div class="section-head">
            <h2>${copy.workspaces.title}</h2>
          </div>
          <div class="workspace-list">
            ${copy.workspaces.items.map((item) => `
              <article>
                <h3>${item.title}</h3>
                <p>${item.body}</p>
              </article>
            `).join('')}
          </div>
        </section>

        <section class="section" id="get-started">
          <div class="section-head">
            <h2>${copy.access.title}</h2>
          </div>
          <div class="entry-list">
            ${copy.access.entries.map((entry) => `
              <a class="entry-link" href="${entry.href}" target="_blank" rel="noopener">
                <strong>${entry.title}</strong>
                <span>${entry.body}</span>
              </a>
            `).join('')}
          </div>
          <div class="project-details">
            <div class="project-details__links">
              <a class="section-link" href="https://github.com/rali-ai/prompt-optimizer" target="_blank" rel="noopener">${copy.access.repository}</a>
              <span>AGPL-3.0</span>
            </div>
            <p>${copy.access.dataNote}</p>
          </div>
        </section>
      </main>

      ${renderSiteFooter({ locale, showLocale: true })}
    </div>

    <dialog class="image-preview" id="image-preview" aria-label="${copy.imagePreview.title}">
      <div class="image-preview__toolbar">
        <button class="image-preview__control" type="button" data-preview-zoom>${copy.imagePreview.actualSize}</button>
        <form method="dialog">
          <button class="image-preview__control image-preview__close" type="submit" aria-label="${copy.imagePreview.close}" title="${copy.imagePreview.close}" autofocus>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </form>
      </div>
      <div class="image-preview__viewport" tabindex="-1">
        <img alt="" draggable="false" />
      </div>
    </dialog>
  `

  bindImagePreview(copy.imagePreview)
  bindMotionEffects()

  if (focusedRegion) {
    document.querySelector(`${focusedRegion} .locale-switch`)?.focus({ preventScroll: true })
  }
}

function bindImagePreview(copy) {
  const dialog = document.getElementById('image-preview')
  if (typeof dialog.showModal !== 'function') return

  const viewport = dialog.querySelector('.image-preview__viewport')
  const image = viewport.querySelector('img')
  const zoom = dialog.querySelector('[data-preview-zoom]')
  const page = document.documentElement
  let origin

  const setActualSize = (actual) => {
    dialog.toggleAttribute('data-actual-size', actual)
    zoom.textContent = actual ? copy.fit : copy.actualSize
    viewport.tabIndex = actual ? 0 : -1
    viewport.scrollTo(0, 0)
  }

  document.querySelectorAll('[data-image-preview]').forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return

      event.preventDefault()
      origin = { trigger, x: window.scrollX, y: window.scrollY }
      const scrollbarWidth = window.innerWidth - page.getBoundingClientRect().width
      page.style.setProperty('--preview-scrollbar-width', `${scrollbarWidth}px`)
      image.alt = trigger.querySelector('img').alt
      image.src = trigger.href
      setActualSize(false)
      dialog.showModal()
    })
  })

  zoom.addEventListener('click', () => setActualSize(!dialog.hasAttribute('data-actual-size')))
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
  dialog.addEventListener('close', () => {
    page.style.removeProperty('--preview-scrollbar-width')
    if (!origin) return

    origin.trigger.focus({ preventScroll: true })
    if (window.scrollX !== origin.x || window.scrollY !== origin.y) {
      window.scrollTo({ left: origin.x, top: origin.y, behavior: 'instant' })
    }
    origin = undefined
  })
}

function bindMotionEffects() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const prefersFinePointer = window.matchMedia('(pointer: fine)').matches

  if (prefersReducedMotion || !prefersFinePointer) return

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

  const bindPointerSurface = (selector, prefix, maxTilt = 6, maxShift = 16) => {
    const element = document.querySelector(selector)
    if (!element) return

    const reset = () => {
      element.style.setProperty(`--${prefix}-pointer-x`, '50%')
      element.style.setProperty(`--${prefix}-pointer-y`, '50%')
      element.style.setProperty(`--${prefix}-tilt-x`, '0deg')
      element.style.setProperty(`--${prefix}-tilt-y`, '0deg')
      element.style.setProperty(`--${prefix}-shift-x`, '0px')
      element.style.setProperty(`--${prefix}-shift-y`, '0px')
    }

    const update = (event) => {
      const rect = element.getBoundingClientRect()
      const px = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100)
      const py = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100)
      const nx = clamp((px - 50) / 50, -1, 1)
      const ny = clamp((py - 50) / 50, -1, 1)

      element.style.setProperty(`--${prefix}-pointer-x`, `${px.toFixed(2)}%`)
      element.style.setProperty(`--${prefix}-pointer-y`, `${py.toFixed(2)}%`)
      element.style.setProperty(`--${prefix}-tilt-x`, `${(-ny * maxTilt).toFixed(2)}deg`)
      element.style.setProperty(`--${prefix}-tilt-y`, `${(nx * maxTilt).toFixed(2)}deg`)
      element.style.setProperty(`--${prefix}-shift-x`, `${(nx * maxShift).toFixed(2)}px`)
      element.style.setProperty(`--${prefix}-shift-y`, `${(ny * maxShift).toFixed(2)}px`)
    }

    reset()
    element.addEventListener('pointermove', update)
    element.addEventListener('pointerleave', reset)
  }

  bindPointerSurface('.hero', 'hero', 5.5, 18)
}

let currentLocale = getInitialLocale()

initSiteChrome()

document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-locale-toggle]')) return
  currentLocale = currentLocale === 'zh-CN' ? 'en' : 'zh-CN'
  window.localStorage.setItem(STORAGE_KEY, currentLocale)
  renderApp(currentLocale)
})

renderApp(currentLocale)
