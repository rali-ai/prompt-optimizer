const THEME_STORAGE_KEY = 'prompt-optimizer-site-theme'
const THEME_MODES = ['system', 'dark', 'light']
const GITHUB_URL = 'https://github.com/rali-ai/prompt-optimizer'

export const OPTIMIZER_URL = 'https://goprmpt.net'

export const chromeCopy = {
  'zh-CN': {
    brandAriaLabel: '提示词优化器首页',
    nav: {
      product: '优化器',
      library: '提示词库',
      learn: '教程与写法',
      github: 'GitHub',
      githubLabel: '开源仓库',
      themeAria: '切换主题模式',
      themeLabels: {
        system: '自动',
        dark: '深',
        light: '浅'
      },
      locale: 'EN',
      localeAria: '切换到英文',
      menuAria: '切换导航菜单'
    },
    footer: {
      title: '提示词优化器',
      body: '让提示词优化回到真实结果。',
      product: '优化器',
      github: 'GitHub'
    }
  },
  en: {
    brandAriaLabel: 'Prompt Optimizer home',
    nav: {
      product: 'Optimizer',
      library: 'Prompt Library',
      learn: 'Learn',
      github: 'GitHub',
      githubLabel: 'Open-source repository',
      themeAria: 'Switch theme mode',
      themeLabels: {
        system: 'Auto',
        dark: 'Dark',
        light: 'Light'
      },
      locale: '中文',
      localeAria: 'Switch to Chinese',
      menuAria: 'Toggle navigation menu'
    },
    footer: {
      title: '提示词优化器',
      body: 'Bring prompt optimization back to real outputs.',
      product: 'Optimizer',
      github: 'GitHub'
    }
  }
}

function readStoredTheme() {
  if (typeof window === 'undefined') return 'system'
  try {
    return normalizeThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

let themeMode = readStoredTheme()

function normalizeThemeMode(value) {
  return THEME_MODES.includes(value) ? value : 'system'
}

function getNextThemeMode(mode) {
  if (mode === 'system') return 'dark'
  if (mode === 'dark') return 'light'
  return 'system'
}

function resolveTheme(mode) {
  if (mode === 'light' || mode === 'dark') return mode
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function currentCopy() {
  return chromeCopy[document.documentElement.dataset.locale] ?? chromeCopy['zh-CN']
}

function renderThemeIcon(mode) {
  if (mode === 'dark') {
    return `
      <svg viewBox="0 0 24 24" role="img" focusable="false">
        <path d="M21 12.79A9 9 0 0 1 11.21 3a7.5 7.5 0 1 0 9.79 9.79Z" fill="currentColor" />
      </svg>
    `
  }

  if (mode === 'light') {
    return `
      <svg viewBox="0 0 24 24" role="img" focusable="false">
        <circle cx="12" cy="12" r="4.2" fill="currentColor" />
        <path d="M12 1.5v3M12 19.5v3M4.57 4.57l2.12 2.12M17.31 17.31l2.12 2.12M1.5 12h3M19.5 12h3M4.57 19.43l2.12-2.12M17.31 6.69l2.12-2.12" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" />
      </svg>
    `
  }

  return `
    <svg viewBox="0 0 24 24" role="img" focusable="false">
      <rect x="4" y="5" width="16" height="11" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.8" />
      <path d="M8 19h8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" />
      <path d="M10 16.5h4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" />
    </svg>
  `
}

function renderThemeButtonContent(copy) {
  return `
    <span class="theme-switch__icon" aria-hidden="true">${renderThemeIcon(themeMode)}</span>
    <span class="theme-switch__label">${copy.nav.themeLabels[themeMode]}</span>
  `
}

function renderThemeButton(copy) {
  return `
    <button class="theme-switch" type="button" data-theme-toggle="true" aria-label="${copy.nav.themeAria}" title="${copy.nav.themeAria}">
      ${renderThemeButtonContent(copy)}
    </button>
  `
}

function renderLocaleButton(copy) {
  return `
    <button class="locale-switch" type="button" data-locale-toggle="true" aria-label="${copy.nav.localeAria}">
      ${copy.nav.locale}
    </button>
  `
}

function renderGithubPill(copy) {
  return `
    <a class="github-pill" href="${GITHUB_URL}" target="_blank" rel="noopener noreferrer" aria-label="${copy.nav.githubLabel}">
      <span class="github-pill__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" role="img" focusable="false">
          <path d="M12 1.5a10.5 10.5 0 0 0-3.32 20.47c.52.1.7-.23.7-.5v-1.95c-2.86.62-3.46-1.21-3.46-1.21-.47-1.18-1.14-1.5-1.14-1.5-.93-.64.07-.63.07-.63 1.03.07 1.57 1.06 1.57 1.06.91 1.56 2.4 1.1 2.98.84.09-.66.36-1.1.65-1.35-2.28-.26-4.67-1.14-4.67-5.08 0-1.12.4-2.04 1.05-2.76-.1-.26-.46-1.31.1-2.73 0 0 .86-.28 2.82 1.05a9.8 9.8 0 0 1 5.13 0c1.96-1.33 2.82-1.05 2.82-1.05.56 1.42.2 2.47.1 2.73.66.72 1.05 1.64 1.05 2.76 0 3.95-2.39 4.82-4.67 5.08.37.32.7.95.7 1.92v2.84c0 .28.18.61.7.5A10.5 10.5 0 0 0 12 1.5Z" fill="currentColor"/>
        </svg>
      </span>
      <span class="github-pill__text">${copy.nav.github}</span>
    </a>
  `
}

function renderPageLink(href, label, current) {
  return `<a href="${href}"${href === current ? ' aria-current="page"' : ''}>${label}</a>`
}

export const siteBackground = `
  <div class="site-background" aria-hidden="true">
    <div class="site-glow site-glow--left"></div>
    <div class="site-glow site-glow--right"></div>
    <div class="site-grid"></div>
  </div>
`

export function renderSiteHeader({ locale = 'zh-CN', current = '', showLocale = true, menuExpanded = 'false' } = {}) {
  const copy = chromeCopy[locale] ?? chromeCopy['zh-CN']
  return `
    <header class="site-header">
      <a class="site-brand" href="/" aria-label="${copy.brandAriaLabel}">
        <img src="/images/logo.png" alt="" class="site-brand__logo" />
        <span class="site-brand__text">提示词优化器</span>
      </a>
      <button class="site-menu-button" type="button" aria-expanded="${menuExpanded}" aria-controls="site-nav" aria-label="${copy.nav.menuAria}">
        <span></span>
        <span></span>
        <span></span>
      </button>
      <nav class="site-nav" id="site-nav" aria-label="Primary">
        <a href="${OPTIMIZER_URL}" target="_blank" rel="noopener noreferrer">${copy.nav.product}</a>
        ${renderPageLink('/library/', copy.nav.library, current)}
        ${renderPageLink('/learn/', copy.nav.learn, current)}
        ${renderGithubPill(copy)}
        ${renderThemeButton(copy)}
        ${showLocale ? renderLocaleButton(copy) : ''}
      </nav>
    </header>
  `
}

export function renderSiteFooter({ locale = 'zh-CN', current = '', showLocale = true } = {}) {
  const copy = chromeCopy[locale] ?? chromeCopy['zh-CN']
  return `
    <footer class="site-footer">
      <div class="site-footer__copy">
        <strong>${copy.footer.title}</strong>
        <p>${copy.footer.body}</p>
      </div>
      <div class="site-footer__links">
        <a href="${OPTIMIZER_URL}" target="_blank" rel="noopener noreferrer">${copy.footer.product}</a>
        ${renderPageLink('/library/', copy.nav.library, current)}
        ${renderPageLink('/learn/', copy.nav.learn, current)}
        <a href="${GITHUB_URL}" target="_blank" rel="noopener noreferrer">${copy.footer.github}</a>
        ${renderThemeButton(copy)}
        ${showLocale ? renderLocaleButton(copy) : ''}
      </div>
    </footer>
  `
}

export function applyTheme() {
  const resolvedTheme = resolveTheme(themeMode)
  const root = document.documentElement
  root.dataset.theme = resolvedTheme
  root.dataset.themeMode = themeMode
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#081120' : '#f8fbfe')

  const copy = currentCopy()
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.innerHTML = renderThemeButtonContent(copy)
  })
}

export function initSiteChrome({ onLocaleToggle } = {}) {
  applyTheme()

  document.addEventListener('click', (event) => {
    const menuButton = event.target.closest('.site-menu-button')
    if (menuButton) {
      const expanded = menuButton.getAttribute('aria-expanded') === 'true'
      menuButton.setAttribute('aria-expanded', String(!expanded))
      return
    }

    if (event.target.closest('[data-theme-toggle]')) {
      themeMode = getNextThemeMode(themeMode)
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, themeMode)
      } catch {
        // Storage unavailable
      }
      applyTheme()
      return
    }

    if (onLocaleToggle && event.target.closest('[data-locale-toggle]')) {
      onLocaleToggle()
    }
  })

  document.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.site-header')) return
    document.querySelector('.site-menu-button[aria-expanded="true"]')?.setAttribute('aria-expanded', 'false')
  })

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    const menuButton = document.querySelector('.site-menu-button[aria-expanded="true"]')
    if (!menuButton) return
    menuButton.setAttribute('aria-expanded', 'false')
    menuButton.focus()
  })

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (themeMode === 'system') applyTheme()
  })
}
