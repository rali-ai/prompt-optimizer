const THEME_STORAGE_KEY = 'goprmpt-site-theme'
const THEME_MODES = ['light', 'dark', 'system']

export const OPTIMIZER_URL = 'https://goprmpt.net'

export const chromeCopy = {
  'zh-CN': {
    brandName: '高词',
    brandSub: 'GoPrmpt',
    brandAriaLabel: '高词 · GoPrmpt 首页',
    nav: {
      product: '工作台',
      library: '提示词库',
      learn: '教程与写法',
      extension: '浏览器插件',
      cta: '打开工作台',
      themeAria: '切换主题模式',
      themeLabels: {
        light: '浅色',
        dark: '深色',
        system: '自动'
      },
      locale: 'EN',
      localeAria: '切换到英文',
      menuAria: '切换导航菜单'
    },
    footer: {
      title: '高词 · GoPrmpt',
      body: '把模糊的想法，变成稳定好用的 AI 指令。AI 生成内容仅供参考，请结合实际场景人工核验。',
      product: '工作台'
    }
  },
  en: {
    brandName: 'GoPrmpt',
    brandSub: '高词',
    brandAriaLabel: 'GoPrmpt Home',
    nav: {
      product: 'Workbench',
      library: 'Prompt Library',
      learn: 'Learn',
      extension: 'Extension',
      cta: 'Open Workbench',
      themeAria: 'Switch theme mode',
      themeLabels: {
        light: 'Light',
        dark: 'Dark',
        system: 'Auto'
      },
      locale: '中文',
      localeAria: 'Switch to Chinese',
      menuAria: 'Toggle navigation menu'
    },
    footer: {
      title: 'GoPrmpt · 高词',
      body: 'Turn rough ideas into reliable AI prompts. AI-generated outputs are for reference only; please review before use.',
      product: 'Workbench'
    }
  }
}

function normalizeThemeMode(value) {
  return THEME_MODES.includes(value) ? value : 'light'
}

function readStoredTheme() {
  if (typeof window === 'undefined') return 'light'
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    return raw ? normalizeThemeMode(raw) : 'light'
  } catch {
    return 'light'
  }
}

let themeMode = readStoredTheme()

function getNextThemeMode(mode) {
  if (mode === 'light') return 'dark'
  if (mode === 'dark') return 'system'
  return 'light'
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
        <img src="/images/logo.svg" alt="" class="site-brand__logo" width="34" height="34" />
        <span class="site-brand__titles">
          <span class="site-brand__text">${copy.brandName}</span>
          <span class="site-brand__sub">${copy.brandSub}</span>
        </span>
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
        <a href="/#extension">${copy.nav.extension}</a>
        <span class="site-nav__divider" aria-hidden="true"></span>
        ${renderThemeButton(copy)}
        ${showLocale ? renderLocaleButton(copy) : ''}
        <a class="site-nav__cta" href="${OPTIMIZER_URL}" target="_blank" rel="noopener noreferrer">${copy.nav.cta}</a>
      </nav>
    </header>
  `
}

export function renderSiteFooter({ locale = 'zh-CN', current = '', showLocale = true } = {}) {
  const copy = chromeCopy[locale] ?? chromeCopy['zh-CN']
  return `
    <footer class="site-footer">
      <div class="site-footer__brand">
        <img src="/images/logo.svg" alt="" class="site-footer__logo" width="28" height="28" />
        <div class="site-footer__copy">
          <strong>${copy.footer.title}</strong>
          <p>${copy.footer.body}</p>
        </div>
      </div>
      <div class="site-footer__links">
        <a href="${OPTIMIZER_URL}" target="_blank" rel="noopener noreferrer">${copy.footer.product}</a>
        ${renderPageLink('/library/', copy.nav.library, current)}
        ${renderPageLink('/learn/', copy.nav.learn, current)}
        <a href="/#extension">${copy.nav.extension}</a>
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
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#0D0E11' : '#FAF9F5')

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
