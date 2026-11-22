// check.mjs 自己的测试：真实项目应当通过；每种故意弄坏的副本都应当被发现。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkMiniprogram } from '../check.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// 在项目副本上做一处破坏，返回 { errors, touched }，touched 是被改动的文件。
function brokenCopy(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-check-'))
  fs.cpSync(ROOT, dir, { recursive: true, filter: (src) => !src.includes(path.sep + 'tools') })
  let touched = ''
  const edit = (file, from, to) => {
    const full = path.join(dir, file)
    const source = fs.readFileSync(full, 'utf8')
    assert.ok(source.includes(from), file + ' contains ' + from)
    fs.writeFileSync(full, source.replace(from, to))
    touched = file
  }
  const remove = (file) => {
    fs.rmSync(path.join(dir, file))
    touched = file
  }
  mutate({ edit, remove })
  try {
    return { errors: checkMiniprogram(dir).errors, touched }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('the real project passes and registers the lite package', () => {
  const result = checkMiniprogram(ROOT)
  assert.deepEqual(result.errors, [])
  assert.equal(result.lite, true)
})

const cases = {
  'cross-package link to a missing page': ({ edit }) =>
    edit('goprmpt-library/utils/routes.js', "'/goprmpt-lite/pages/optimize/optimize'", "'/goprmpt-lite/pages/optimise/optimize'"),
  'shell entry to a missing page': ({ edit }) =>
    edit('pages/index/index.wxml', '/goprmpt-lite/pages/history/history', '/goprmpt-lite/pages/histories/history'),
  'routes.go with an unknown name': ({ edit }) =>
    edit('goprmpt-lite/pages/history/history.js', "routes.go('optimize'", "routes.go('optimizer'"),
  'unbound event handler': ({ edit }) =>
    edit('goprmpt-lite/pages/optimize/optimize.wxml', 'bindtap="onCopy"', 'bindtap="onCopyResult"'),
  'require of a missing file': ({ edit }) =>
    edit('goprmpt-lite/pages/settings/settings.js', "require('../../utils/i18n.js')", "require('../../utils/i18m.js')"),
  'require across subpackages': ({ edit }) =>
    edit('goprmpt-library/pages/prompt/prompt.js', "require('../../utils/schema.js')", "require('../../../goprmpt-lite/utils/storage.js')"),
  'getApp in a subpackage': ({ edit }) =>
    edit('goprmpt-lite/pages/history/history.js', 'refresh() {', 'refresh() {\n    getApp()'),
  'direct storage access outside storage.js': ({ edit }) =>
    edit('goprmpt-lite/pages/history/history.js', 'refresh() {', "refresh() {\n    wx.setStorageSync('x', 1)"),
  'direct navigation outside routes.js': ({ edit }) =>
    edit('goprmpt-lite/pages/history/history.js', 'refresh() {', "refresh() {\n    wx.navigateTo({ url: '/goprmpt-lite/pages/settings/settings' })"),
  'missing page file': ({ remove }) => remove('goprmpt-lite/pages/settings/settings.wxss'),
  'broken JSON': ({ edit }) => edit('goprmpt-lite/pages/settings/settings.json', '{', '{,'),
  'theme copy drift': ({ edit }) => edit('styles/theme.wxss', '#3a5ccc', '#000000'),
  'lite wxss import reaching the main package': ({ edit }) =>
    edit('goprmpt-lite/pages/history/history.wxss', '"../../styles/theme.wxss"', '"../../../styles/theme.wxss"'),
  'lite require reaching the main package': ({ edit }) =>
    edit('goprmpt-lite/pages/settings/settings.js', "require('../../utils/i18n.js')", "require('../../../utils/i18n.js')"),
  'lite navigation to a main package page': ({ edit }) =>
    edit('goprmpt-lite/utils/routes.js', "settings: ROOT + 'settings/settings'", "settings: ROOT + 'settings/settings',\n  home: '/pages/index/index'"),
  'lite network request outside api.js': ({ edit }) =>
    edit('goprmpt-lite/pages/history/history.js', 'refresh() {', "refresh() {\n    wx.request({ url: 'https://example.com' })"),
  'lite component from outside its folder': ({ edit }) =>
    edit('goprmpt-lite/pages/history/history.json', '"usingComponents": {}', '"usingComponents": { "x": "/components/x/x" }'),
  'lite storage prefix change': ({ edit }) =>
    edit('goprmpt-lite/utils/storage.js', "const PREFIX = 'goprmpt_'", "const PREFIX = 'gp:'"),
  'lite config without API_BASE': ({ edit }) => edit('goprmpt-lite/config.js', 'API_BASE:', 'API_URL:')
}

for (const [name, mutate] of Object.entries(cases)) {
  test('catches ' + name, () => {
    const { errors, touched } = brokenCopy(mutate)
    assert.ok(errors.length > 0, 'expected an error')
    assert.ok(errors.every((e) => e.startsWith(touched + '：')), 'errors point at ' + touched + ': ' + errors.join(' | '))
  })
}
