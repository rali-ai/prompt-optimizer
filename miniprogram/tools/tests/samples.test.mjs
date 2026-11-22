// 简版示例数据：来自提示词库的日常写作类用户提示词，双语，最多 20 条；提交的文件是最新生成的。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { build, OUTPUT, pickSamples, CATEGORIES, LIMIT } from '../../../scripts/build-lite-samples.mjs'
import { requireMp } from './wx-mock.mjs'

const samples = requireMp('./goprmpt-lite/data/samples.js')
const library = requireMp('./goprmpt-library/data/library.js')

test('samples are bilingual basic-user prompts from writing, office and translate', () => {
  assert.ok(samples.length > 0 && samples.length <= 20)
  for (const s of samples) {
    const source = library.prompts.find((p) => p.id === s.id)
    assert.ok(['writing', 'office', 'translate'].includes(source.category), s.id)
    assert.equal(source.target, 'basic-user', s.id)
    assert.deepEqual(s.zh, { title: source.title, prompt: source.prompt })
    assert.deepEqual(s.en, { title: source.en.title, prompt: source.en.prompt })
  }
  assert.equal(new Set(samples.map((s) => s.id)).size, samples.length)
})

test('pickSamples rotates through the categories and stops at the limit', () => {
  const prompt = (id, category, target = 'basic-user', en = { title: 'T', prompt: 'P' }) => ({ id, category, target, title: '标题', prompt: '正文', en })
  const data = {
    prompts: [
      prompt('w1', 'writing'), prompt('w2', 'writing'), prompt('w3', 'writing'),
      prompt('o1', 'office'),
      prompt('t1', 'translate'), prompt('t-sys', 'translate', 'basic-system'), prompt('t-zh', 'translate', 'basic-user', null),
      prompt('c1', 'coding')
    ]
  }
  assert.deepEqual(pickSamples(data).map((s) => s.id), ['w1', 'o1', 't1', 'w2', 'w3'])
  assert.deepEqual(CATEGORIES, ['writing', 'office', 'translate'])

  const many = { prompts: Array.from({ length: 30 }, (_, i) => prompt('w' + i, 'writing')) }
  assert.equal(pickSamples(many).length, LIMIT)
})

test('the committed samples file matches a fresh build', () => {
  assert.equal(fs.readFileSync(OUTPUT, 'utf8').replace(/\r\n/g, '\n'), build())
})
