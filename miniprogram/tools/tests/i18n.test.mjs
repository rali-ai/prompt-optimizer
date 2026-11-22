// 界面语言：跟随微信语言或手动选择；简版和外壳两份判断规则一致；中英文案键一致；优化方式与服务端一致。
import test from 'node:test'
import assert from 'node:assert/strict'
import { installWx, requireMp } from './wx-mock.mjs'

const lite = requireMp('./goprmpt-lite/utils/i18n.js')
const shell = requireMp('./utils/i18n.js')

test('auto follows the WeChat language: zh* is Chinese, anything else English', () => {
  for (const [language, expected] of [['zh_CN', 'zh'], ['zh_TW', 'zh'], ['zh-Hans', 'zh'], ['en', 'en'], ['en_US', 'en'], ['ja', 'en'], ['', 'en']]) {
    installWx({ language })
    assert.equal(lite.preference(), 'auto')
    assert.equal(lite.lang(), expected, language)
    assert.equal(shell.lang(), expected, 'shell agrees for ' + language)
  }
})

test('a manual choice overrides the WeChat language in both the lite package and the shell', () => {
  installWx({ language: 'zh_CN' })
  lite.setPreference('en')
  assert.equal(lite.lang(), 'en')
  assert.equal(shell.lang(), 'en')
  assert.equal(lite.t().optimize.start, 'Optimize')

  lite.setPreference('auto')
  assert.equal(lite.lang(), 'zh')
  assert.equal(shell.lang(), 'zh')

  lite.setPreference('fr')
  assert.equal(lite.preference(), 'auto')
})

function keyPaths(value, prefix = '') {
  if (Array.isArray(value)) return [prefix + '[]']
  if (value && typeof value === 'object') return Object.keys(value).sort().flatMap((k) => keyPaths(value[k], prefix + '.' + k))
  return [prefix]
}

test('Chinese and English strings cover the same keys', () => {
  assert.deepEqual(keyPaths(lite.STRINGS.en).filter((k) => !k.startsWith('.errors.')), keyPaths(lite.STRINGS.zh).filter((k) => !k.startsWith('.errors.')))
  assert.deepEqual(keyPaths(shell.STRINGS.en), keyPaths(shell.STRINGS.zh))
})

test('English errors cover every server error code a user can hit', async () => {
  const { ERROR_CODES } = await import('../../../packages/mp-server/src/app.js')
  // 这几个只会在客户端写错时出现，英文界面用通用提示即可。
  const developerOnly = ['not_found', 'bad_json', 'too_large', 'internal']
  for (const code of ERROR_CODES.filter((c) => !developerOnly.includes(c))) {
    assert.ok(lite.STRINGS.en.errors[code], 'English message for ' + code)
  }
})

test('error messages: Chinese UI shows the server message, English UI looks up the code', () => {
  const error = Object.assign(new Error('今天的优化次数已经用完了'), { code: 'quota_exceeded' })
  assert.equal(lite.errorMessage(error, lite.STRINGS.zh), '今天的优化次数已经用完了')
  assert.equal(lite.errorMessage(error, lite.STRINGS.en), lite.STRINGS.en.errors.quota_exceeded)
  const offline = Object.assign(new Error(''), { code: 'network' })
  assert.equal(lite.errorMessage(offline, lite.STRINGS.zh), lite.STRINGS.zh.errors.network)
  assert.equal(lite.errorMessage(Object.assign(new Error(''), { code: 'weird' }), lite.STRINGS.en), lite.STRINGS.en.errors.unknown)
})

test('the optimizer offers exactly the modes mp-server accepts', async () => {
  const { MODE_IDS } = await import('../../../packages/mp-server/src/templates.js')
  assert.deepEqual(lite.MODE_IDS, MODE_IDS)
  for (const strings of [lite.STRINGS.zh, lite.STRINGS.en]) {
    for (const option of lite.modeOptions(strings)) assert.ok(option.name && option.desc, option.id)
  }
})
