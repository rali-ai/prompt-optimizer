// 元提示词：每种优化方式和输出语言都有自己的模板，原始提示词原样交给模型。
import test from 'node:test'
import assert from 'node:assert/strict'

import { buildMessages, LANGS, MODE_IDS } from '../src/templates.js'

const prompt = '帮我写一段"产品介绍"，\n主题是 {{产品名}}，语气：{{语气}}'

// 用户消息里带一段 JSON 证据，取出来看模型实际收到的原文。
function evidenceOf(content) {
  const match = /\{\n {2}"[\s\S]*?\n\}/.exec(content)
  assert.ok(match, 'user message carries a JSON evidence block')
  return JSON.parse(match[0])
}

test('offers the five optimization modes and two output languages', () => {
  assert.deepEqual(MODE_IDS, ['general', 'structured', 'concise', 'system', 'image'])
  assert.deepEqual(LANGS, ['zh', 'en'])
})

test('every mode and language sends a system prompt plus the original prompt unchanged', () => {
  const systems = new Set()
  for (const lang of LANGS) {
    for (const mode of MODE_IDS) {
      const messages = buildMessages({ mode, prompt, lang, instruction: '' })
      assert.deepEqual(messages.map((m) => m.role), ['system', 'user'])
      assert.ok(messages[0].content.length > 300, mode + '/' + lang + ' system prompt is substantial')
      assert.ok(!/\{\{=|helpers\./.test(messages[0].content + messages[1].content), mode + '/' + lang + ' has no Mustache leftovers')
      systems.add(messages[0].content)

      const user = messages[1].content
      const received = mode === 'system' ? user : evidenceOf(user).originalPrompt
      assert.equal(received, prompt, mode + '/' + lang + ' passes the prompt through verbatim')
    }
  }
  assert.equal(systems.size, MODE_IDS.length * LANGS.length, 'each mode and language has its own meta-prompt')
})

test('the output language rule follows the chosen language', () => {
  for (const mode of [...MODE_IDS, 'iterate']) {
    const zh = buildMessages({ mode, prompt, lang: 'zh', instruction: '' })[0].content
    const en = buildMessages({ mode, prompt, lang: 'en', instruction: '' })[0].content
    assert.match(zh, /优化后的提示词都用中文书写/)
    assert.doesNotMatch(zh, /Write the optimized prompt in English/)
    assert.match(en, /Write the optimized prompt in English/)
    assert.doesNotMatch(en, /都用中文书写/)
  }
})

test('iterate sends the last result and the requested direction', () => {
  for (const lang of LANGS) {
    const messages = buildMessages({ mode: 'iterate', prompt: '上一版提示词', lang, instruction: '更口语化' })
    assert.deepEqual(messages.map((m) => m.role), ['system', 'user'])
    assert.deepEqual(evidenceOf(messages[1].content), { lastOptimizedPrompt: '上一版提示词', iterateInput: '更口语化' })
  }
})

test('iterate falls back to a default direction in the chosen language when none is given', () => {
  const zh = evidenceOf(buildMessages({ mode: 'iterate', prompt: 'x', lang: 'zh', instruction: '  ' })[1].content).iterateInput
  const en = evidenceOf(buildMessages({ mode: 'iterate', prompt: 'x', lang: 'en', instruction: '' })[1].content).iterateInput
  assert.match(zh, /清晰/)
  assert.match(en, /clearer/)
})
