import test from 'node:test'
import assert from 'node:assert/strict'
import { installWx, requireMp } from './wx-mock.mjs'

const settings = requireMp('./utils/settings.js')
const history = requireMp('./utils/history.js')

test('every storage key written by the package carries the goprmpt: prefix', () => {
  const wx = installWx()
  settings.save({ providerId: 'kimi', baseUrl: 'https://api.moonshot.cn/v1', apiKey: 'k', model: 'm' })
  history.add({ mode: 'general', input: 'a', output: 'b' })
  history.remove('missing')
  history.clear()

  assert.ok(wx.store.size > 0)
  for (const key of wx.store.keys()) {
    assert.ok(key.startsWith('goprmpt:'), key)
  }
})

test('settings default to the first preset and round-trip trimmed values', () => {
  installWx()
  const initial = settings.load()
  assert.equal(initial.providerId, settings.PROVIDERS[0].id)
  assert.equal(initial.baseUrl, settings.PROVIDERS[0].baseUrl)
  assert.equal(initial.apiKey, '')
  assert.equal(settings.isReady(initial), false)

  settings.save({ providerId: 'zhipu', baseUrl: ' https://open.bigmodel.cn/api/paas/v4 ', apiKey: ' key ', model: 'glm' })
  const loaded = settings.load()
  assert.deepEqual(loaded, { providerId: 'zhipu', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: 'key', model: 'glm' })
  assert.equal(settings.isReady(loaded), true)
})

test('presets cover the required providers with HTTPS endpoints', () => {
  const names = settings.PROVIDERS.map((p) => p.name)
  for (const name of ['DeepSeek', '通义千问', '智谱 GLM', 'Kimi', 'OpenAI']) {
    assert.ok(names.includes(name), name)
  }
  for (const p of settings.PROVIDERS.filter((x) => x.id !== 'custom')) {
    assert.match(p.baseUrl, /^https:\/\//)
    assert.ok(p.model, p.id + ' has a model')
  }
})

test('history keeps newest first, supports get/remove/clear and caps its size', () => {
  installWx()
  const first = history.add({ mode: 'general', lang: 'zh', input: '一', output: '1' })
  const second = history.add({ mode: 'iterate', lang: 'en', input: '1', output: '2', iterateInput: '更短' })

  assert.deepEqual(history.list().map((r) => r.id), [second.id, first.id])
  const stored = history.get(second.id)
  assert.equal(stored.mode, 'iterate')
  assert.equal(stored.lang, 'en')
  assert.equal(stored.input, '1')
  assert.equal(stored.output, '2')
  assert.equal(stored.iterateInput, '更短')
  assert.equal(history.get('missing'), null)

  history.remove(first.id)
  assert.deepEqual(history.list().map((r) => r.id), [second.id])

  history.clear()
  assert.deepEqual(history.list(), [])

  for (let i = 0; i < history.LIMIT + 5; i += 1) {
    history.add({ mode: 'general', input: String(i), output: String(i) })
  }
  const records = history.list()
  assert.equal(records.length, history.LIMIT)
  assert.equal(records[0].input, String(history.LIMIT + 4))
})

test('formatTime shows 今天 for today and a date otherwise', () => {
  const now = new Date(2026, 10, 21, 18, 0).getTime()
  assert.equal(history.formatTime(new Date(2026, 10, 21, 9, 5).getTime(), now), '今天 09:05')
  assert.equal(history.formatTime(new Date(2026, 2, 3, 14, 30).getTime(), now), '03-03 14:30')
  assert.equal(history.formatTime(new Date(2025, 2, 3, 14, 30).getTime(), now), '2025-03-03')
})
