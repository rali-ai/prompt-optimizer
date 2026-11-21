import { afterEach, describe, expect, it, vi } from 'vitest'

import { UI_SETTINGS_KEYS } from '@prompt-optimizer/core'
import zhCN from '../../../src/i18n/locales/zh-CN'
import zhTW from '../../../src/i18n/locales/zh-TW'
import enUS from '../../../src/i18n/locales/en-US'
import {
  i18n,
  initializeI18nWithStorage,
  sanitizeSupportedLocale,
  setI18nServices,
} from '../../../src/plugins/i18n'

const setNavigatorLocales = (language: string, languages: string[] = [language]) => {
  Object.defineProperty(window.navigator, 'language', {
    configurable: true,
    value: language,
  })

  Object.defineProperty(window.navigator, 'languages', {
    configurable: true,
    value: languages,
  })
}

afterEach(() => {
  i18n.global.locale.value = 'en-US'
  vi.restoreAllMocks()
})

describe('i18n bootstrap helpers', () => {
  it('keeps supported saved locales', () => {
    expect(sanitizeSupportedLocale('zh-CN')).toBe('zh-CN')
    expect(sanitizeSupportedLocale('zh-TW')).toBe('zh-TW')
    expect(sanitizeSupportedLocale('en-US')).toBe('en-US')
  })

  it('normalizes legacy short locale values', () => {
    expect(sanitizeSupportedLocale('zh')).toBe('zh-CN')
    expect(sanitizeSupportedLocale('en')).toBe('en-US')
  })

  it('falls back to zh-CN for unsupported saved locales', () => {
    expect(sanitizeSupportedLocale('ja-JP')).toBe('zh-CN')
    expect(sanitizeSupportedLocale('')).toBe('zh-CN')
    expect(sanitizeSupportedLocale(undefined)).toBe('zh-CN')
  })

  it('initializes a first-time visitor with an English browser to Chinese', async () => {
    setNavigatorLocales('en-US', ['en-US', 'en'])

    const get = vi.fn().mockResolvedValue(null)
    const set = vi.fn().mockResolvedValue(undefined)

    setI18nServices({
      preferenceService: {
        get,
        set,
      },
    } as any)

    await initializeI18nWithStorage()

    expect(i18n.global.locale.value).toBe('zh-CN')
    expect(get).toHaveBeenCalledWith(UI_SETTINGS_KEYS.PREFERRED_LANGUAGE, null)
    expect(set).toHaveBeenCalledWith(UI_SETTINGS_KEYS.PREFERRED_LANGUAGE, 'zh-CN')
  })

  it('keeps an explicit English choice from the language switcher', async () => {
    setNavigatorLocales('zh-CN')

    const get = vi.fn().mockResolvedValue('en-US')
    const set = vi.fn().mockResolvedValue(undefined)

    setI18nServices({
      preferenceService: {
        get,
        set,
      },
    } as any)

    await initializeI18nWithStorage()

    expect(i18n.global.locale.value).toBe('en-US')
    expect(set).not.toHaveBeenCalled()
  })

  it('normalizes legacy zh preference during initialization instead of overwriting it with English', async () => {
    setNavigatorLocales('en-US')

    const get = vi.fn().mockResolvedValue('zh')
    const set = vi.fn().mockResolvedValue(undefined)

    setI18nServices({
      preferenceService: {
        get,
        set,
      },
    } as any)

    await initializeI18nWithStorage()

    expect(i18n.global.locale.value).toBe('zh-CN')
    expect(set).toHaveBeenCalledWith(UI_SETTINGS_KEYS.PREFERRED_LANGUAGE, 'zh-CN')
  })

  it('uses endonyms for language switcher labels in every locale bundle', () => {
    const expected = {
      'zh-CN': '简体中文',
      'zh-TW': '繁體中文',
      'en-US': 'English',
    }

    expect(zhCN.settings.languageSwitcher.languages).toEqual(expected)
    expect(zhTW.settings.languageSwitcher.languages).toEqual(expected)
    expect(enUS.settings.languageSwitcher.languages).toEqual(expected)
  })
})
