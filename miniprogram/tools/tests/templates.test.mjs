import test from 'node:test'
import assert from 'node:assert/strict'
import { requireMp } from './wx-mock.mjs'

const templates = requireMp('./utils/templates.js')

const prompt = '帮我写一段"产品介绍"，\n主题是 {{产品名}}，语气：{{语气}}'
const LANGS = ['zh', 'en']

// 用户消息里带一段 JSON 证据，取出来看模型实际收到的原文。
function evidenceOf(content) {
  const match = /\{\n {2}"[\s\S]*?\n\}/.exec(content)
  assert.ok(match, 'user message carries a JSON evidence block')
  return JSON.parse(match[0])
}

test('offers the four optimization modes and two output languages', () => {
  assert.deepEqual(templates.MODE_OPTIONS.map((m) => m.name), ['通用优化', '结构化', '精简', '系统提示词'])
  for (const option of templates.MODE_OPTIONS) assert.ok(option.desc, option.id + ' has a description')
  assert.deepEqual(templates.LANGUAGES.map((l) => l.id), LANGS)
})

test('every mode and language sends a system prompt plus the original prompt unchanged', () => {
  const systems = new Set()
  for (const lang of LANGS) {
    for (const { id } of templates.MODE_OPTIONS) {
      const messages = templates.buildMessages(id, prompt, lang)
      assert.deepEqual(messages.map((m) => m.role), ['system', 'user'])
      assert.ok(messages[0].content.length > 300, id + '/' + lang + ' system prompt is substantial')
      assert.ok(!/\{\{=|helpers\./.test(messages[0].content + messages[1].content), id + '/' + lang + ' has no Mustache leftovers')
      systems.add(messages[0].content)

      const user = messages[1].content
      const received = id === 'system' ? user : evidenceOf(user).originalPrompt
      assert.equal(received, prompt, id + '/' + lang + ' passes the prompt through verbatim')
    }
  }
  assert.equal(systems.size, templates.MODE_OPTIONS.length * LANGS.length, 'each mode and language has its own meta-prompt')
})

test('the output language rule follows the chosen language', () => {
  for (const { id } of templates.MODE_OPTIONS) {
    const zh = templates.buildMessages(id, prompt, 'zh')[0].content
    const en = templates.buildMessages(id, prompt, 'en')[0].content
    assert.match(zh, /优化后的提示词都用中文书写/)
    assert.doesNotMatch(zh, /Write the optimized prompt in English/)
    assert.match(en, /Write the optimized prompt in English/)
    assert.doesNotMatch(en, /都用中文书写/)
  }
})

test('unknown modes and languages are rejected', () => {
  assert.throws(() => templates.buildMessages('nope', prompt, 'zh'))
  assert.throws(() => templates.buildMessages('general', prompt, 'fr'))
  assert.throws(() => templates.buildMessages('general', prompt, 'name'))
  assert.throws(() => templates.buildIterateMessages('x', '', 'fr'))
})

test('iterate sends the last result and the requested direction in the chosen language', () => {
  for (const lang of LANGS) {
    const messages = templates.buildIterateMessages('上一版提示词', '更口语化', lang)
    assert.deepEqual(messages.map((m) => m.role), ['system', 'user'])
    assert.deepEqual(evidenceOf(messages[1].content), { lastOptimizedPrompt: '上一版提示词', iterateInput: '更口语化' })
  }
  assert.match(templates.buildIterateMessages('x', '', 'en')[0].content, /Write the optimized prompt in English/)
})

test('iterate falls back to a default direction when none is given', () => {
  for (const lang of LANGS) {
    const messages = templates.buildIterateMessages('上一版提示词', '   ', lang)
    assert.equal(evidenceOf(messages[1].content).iterateInput, templates.DEFAULT_ITERATE_INPUT[lang])
  }
})

test('modeName covers modes and the iterate step', () => {
  assert.equal(templates.modeName('concise'), '精简')
  assert.equal(templates.modeName('iterate'), '再优化')
})
