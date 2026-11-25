import { escapeHtml } from './html.js'
import { safeExternalHref } from './locale.js'

const THEME_STORAGE_KEY = 'goprmpt-site-theme'
const THEME_MODES = ['light', 'dark', 'system']
const ANNOUNCEMENTS_DISMISSED_KEY = 'goprmpt_site_dismissed_announcements'
const MAX_STORED_DISMISSED_KEYS = 100

export const OPTIMIZER_URL = 'https://goprmpt.net'
export const ANNOUNCEMENTS_API_URL = 'https://goprmpt.net/user-api/announcements/active'

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
      guide: '使用手册',
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
      guide: 'Guide',
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
        ${renderPageLink('/guide/', copy.nav.guide, current)}
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
        ${renderPageLink('/guide/', copy.nav.guide, current)}
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

const ANNOUNCEMENT_COPY = {
  'zh-CN': {
    regionAria: '站点公告',
    dismissAria: '关闭公告',
    defaultLinkText: '查看详情',
    types: {
      notice: '通知',
      activity: '活动',
      maintenance: '维护'
    }
  },
  en: {
    regionAria: 'Site announcement',
    dismissAria: 'Dismiss announcement',
    defaultLinkText: 'Learn more',
    types: {
      notice: 'Notice',
      activity: 'Event',
      maintenance: 'Maintenance'
    }
  }
}

function normalizeAnnouncementType(type) {
  return type === 'activity' || type === 'maintenance' || type === 'notice' ? type : 'notice'
}

function announcementDismissKey(item) {
  return `${item.id}:${Number.isFinite(item.updatedAt) ? item.updatedAt : 0}`
}

function toDismissedSet(dismissedKeys) {
  if (dismissedKeys instanceof Set) return dismissedKeys
  if (Array.isArray(dismissedKeys)) return new Set(dismissedKeys.filter((k) => typeof k === 'string'))
  return new Set()
}

export function pickVisibleAnnouncement(list, dismissedKeys = [], now = Date.now()) {
  if (!Array.isArray(list) || list.length === 0) return null
  const dismissed = toDismissedSet(dismissedKeys)

  const candidates = []
  list.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return
    const id = typeof raw.id === 'string' ? raw.id.trim() : ''
    const title = typeof raw.title === 'string' ? raw.title.trim() : ''
    if (!id || !title) return
    if (raw.isActive === false) return
    if (typeof raw.expiresAt === 'number' && Number.isFinite(raw.expiresAt) && raw.expiresAt <= now) return
    const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0
    if (dismissed.has(`${id}:${updatedAt}`)) return
    candidates.push({ item: raw, index, isPinned: Boolean(raw.isPinned), updatedAt })
  })

  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
    if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt
    return a.index - b.index
  })
  return candidates[0].item
}

export function renderAnnouncementBannerHtml(item, locale = 'zh-CN') {
  if (!item || typeof item !== 'object') return ''
  const id = typeof item.id === 'string' ? item.id.trim() : ''
  const title = typeof item.title === 'string' ? item.title.trim() : ''
  if (!id || !title) return ''

  const copy = ANNOUNCEMENT_COPY[locale] ?? ANNOUNCEMENT_COPY['zh-CN']
  const type = normalizeAnnouncementType(item.type)
  const typeLabel = copy.types[type] ?? copy.types.notice
  const content = typeof item.content === 'string' ? item.content.trim() : ''
  const safeHref = safeExternalHref(item.linkUrl)
  const linkLabel =
    typeof item.linkText === 'string' && item.linkText.trim() ? item.linkText.trim() : copy.defaultLinkText
  const dismissKey = announcementDismissKey({ id, updatedAt: item.updatedAt })

  return `
    <div class="site-announcement-bar site-announcement-bar--${type}" role="region" aria-label="${escapeHtml(copy.regionAria)}" data-announcement-key="${escapeHtml(dismissKey)}">
      <div class="site-announcement-bar__main">
        <span class="site-announcement-bar__pill">${escapeHtml(typeLabel)}</span>
        <strong class="site-announcement-bar__title">${escapeHtml(title)}</strong>
        ${content ? `<span class="site-announcement-bar__content">${escapeHtml(content)}</span>` : ''}
      </div>
      <div class="site-announcement-bar__actions">
        ${
          safeHref
            ? `<a class="site-announcement-bar__link" href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(linkLabel)}<span aria-hidden="true"> →</span></a>`
            : ''
        }
        <button class="site-announcement-bar__close" type="button" data-dismiss-announcement="${escapeHtml(dismissKey)}" aria-label="${escapeHtml(copy.dismissAria)}" title="${escapeHtml(copy.dismissAria)}">×</button>
      </div>
    </div>
  `.trim()
}

let cachedAnnouncements = []
let announcementsFetchStarted = false

function readDismissedAnnouncementKeys() {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(ANNOUNCEMENTS_DISMISSED_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((item) => typeof item === 'string' && item.length > 0))
  } catch {
    return new Set()
  }
}

function saveDismissedAnnouncementKey(key) {
  if (typeof window === 'undefined' || !key) return
  try {
    const next = readDismissedAnnouncementKeys()
    next.add(key)
    const list = Array.from(next).slice(-MAX_STORED_DISMISSED_KEYS)
    window.localStorage.setItem(ANNOUNCEMENTS_DISMISSED_KEY, JSON.stringify(list))
  } catch {
    // Storage unavailable
  }
}

function mountSiteAnnouncement() {
  if (typeof document === 'undefined') return
  const shell = document.querySelector('.site-shell')
  const header = shell?.querySelector('.site-header')
  if (!shell || !header) return

  shell.querySelectorAll('.site-announcement-bar').forEach((node) => node.remove())

  const item = pickVisibleAnnouncement(cachedAnnouncements, readDismissedAnnouncementKeys())
  if (!item) return

  const locale = document.documentElement.dataset.locale || 'zh-CN'
  const html = renderAnnouncementBannerHtml(item, locale)
  if (html) {
    header.insertAdjacentHTML('beforebegin', html)
  }
}

async function loadSiteAnnouncements() {
  if (announcementsFetchStarted || typeof fetch !== 'function') return
  announcementsFetchStarted = true
  try {
    const options = { headers: { Accept: 'application/json' } }
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      options.signal = AbortSignal.timeout(4000)
    }
    const response = await fetch(ANNOUNCEMENTS_API_URL, options)
    if (!response?.ok) return
    const data = await response.json().catch(() => null)
    if (!data || !Array.isArray(data.announcements)) return
    cachedAnnouncements = data.announcements
    mountSiteAnnouncement()
  } catch {
    // Silent no-op when offline or announcement endpoint unavailable
  }
}

export function initSiteChrome({ onLocaleToggle } = {}) {
  applyTheme()
  void loadSiteAnnouncements()

  document.addEventListener('click', (event) => {
    const dismissBtn = event.target.closest('[data-dismiss-announcement]')
    if (dismissBtn) {
      const key = dismissBtn.getAttribute('data-dismiss-announcement')
      if (key) saveDismissedAnnouncementKey(key)
      dismissBtn.closest('.site-announcement-bar')?.remove()
      return
    }

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
      const hadBar = Boolean(document.querySelector('.site-announcement-bar'))
      onLocaleToggle()
      if (hadBar) mountSiteAnnouncement()
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
