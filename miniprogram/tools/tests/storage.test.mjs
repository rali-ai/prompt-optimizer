// 简版的本机数据：存储键前缀、优化历史。
import test from 'node:test'
import assert from 'node:assert/strict'
import { installWx, requireMp } from './wx-mock.mjs'

const history = requireMp('./goprmpt-lite/utils/history.js')
const i18n = requireMp('./goprmpt-lite/utils/i18n.js')
const api = requireMp('./goprmpt-lite/utils/api.js')

test('every storage key written by the lite package carries the goprmpt_ prefix', async () => {
  const wx = installWx()
  wx.reply((options) => ({ statusCode: 200, data: options.url.endsWith('/login') ? { token: 't', expiresAt: Date.now() + 3600e3 } : { result: 'r', remaining: 1 } }))
  history.add({ mode: 'general', input: 'a', output: 'b' })
  i18n.setPreference('en')
  await api.optimize({ mode: 'general', prompt: 'x', lang: 'zh' })

  assert.deepEqual([...wx.store.keys()].sort(), ['goprmpt_history', 'goprmpt_lang', 'goprmpt_session'])
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

test('formatTime shows today in the UI language and a date otherwise', () => {
  const now = new Date(2026, 10, 21, 18, 0).getTime()
  assert.equal(history.formatTime(new Date(2026, 10, 21, 9, 5).getTime(), now, 'zh'), '今天 09:05')
  assert.equal(history.formatTime(new Date(2026, 10, 21, 9, 5).getTime(), now, 'en'), 'Today 09:05')
  assert.equal(history.formatTime(new Date(2026, 2, 3, 14, 30).getTime(), now, 'zh'), '03-03 14:30')
  assert.equal(history.formatTime(new Date(2025, 2, 3, 14, 30).getTime(), now, 'en'), '2025-03-03')
})
