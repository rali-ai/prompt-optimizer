import { escapeHtml } from './html.js'

export const LOCALE_STORAGE_KEY = 'prompt-optimizer-site-locale'
export const SUPPORTED_LOCALES = ['zh-CN', 'en']

export function normalizeLocale(raw) {
  return /^zh/i.test(String(raw ?? '').trim()) ? 'zh-CN' : 'en'
}

export function resolveInitialLocale({ stored, browserLanguage } = {}) {
  if (SUPPORTED_LOCALES.includes(stored)) return stored
  return normalizeLocale(browserLanguage)
}

export function nextLocale(locale) {
  return locale === 'zh-CN' ? 'en' : 'zh-CN'
}

export const contentLanguage = (locale) => (locale === 'en' ? 'en' : 'zh')

export const htmlLang = (locale) => (locale === 'en' ? 'en' : 'zh-CN')

export function categoryCopy(category, language) {
  if (!category) return { name: '', description: '' }
  if (language === 'en' && category.en) {
    return { name: category.en.name, description: category.en.description }
  }
  return { name: category.name, description: category.description }
}

export function safeExternalHref(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl ?? '').trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.toString()
  } catch {
    return null
  }
}

export function renderSourceCredit(source, locale = 'zh-CN') {
  if (!source?.name) return ''
  const prefix = locale === 'en' ? 'Source: ' : '来源：'
  const href = safeExternalHref(source.url)
  const nameHtml = href
    ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.name)}</a>`
    : escapeHtml(source.name)
  const licenseHtml = source.license ? ` · ${escapeHtml(source.license)}` : ''
  return `${prefix}${nameHtml}${licenseHtml}`
}

export function getInitialLocale() {
  let stored = null
  try {
    stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
  } catch {
    stored = null
  }
  const browserLanguage = navigator.language || navigator.languages?.[0] || ''
  return resolveInitialLocale({ stored, browserLanguage })
}

export function toggleLocale(locale) {
  const next = nextLocale(locale)
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next)
  } catch {
    // Private browsing or sandboxed storage may reject writes; in-memory state still updates.
  }
  return next
}

export function applyDocumentMeta({ locale, title, description }) {
  const root = document.documentElement
  root.lang = htmlLang(locale)
  root.dataset.locale = locale
  if (title) {
    document.title = title
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title)
  }
  if (description) {
    document.querySelector('meta[name="description"]')?.setAttribute('content', description)
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description)
  }
}

export function localeFocusRegion() {
  return document.activeElement?.closest('.locale-switch')?.closest('header, footer')?.localName
}

export function restoreLocaleFocus(region) {
  if (region) document.querySelector(`${region} .locale-switch`)?.focus({ preventScroll: true })
}
