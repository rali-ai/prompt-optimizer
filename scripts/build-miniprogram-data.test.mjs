import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { loadLibrary } from '../library/schema.mjs'
import { render, toMiniprogramData } from './build-miniprogram-data.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const zh = { title: '周报生成器', summary: '整理周报。', prompt: '记录：{{记录}}', variables: [{ name: '记录', description: '一行一条', defaultValue: '' }] }
const en = { title: 'Weekly report', summary: 'Write a weekly report.', prompt: 'Notes: {{notes}}', variables: [{ name: 'notes', description: 'One per line', defaultValue: '-' }] }
const library = {
  categories: [{ id: 'writing', name: '写作创作', description: '文章。' }],
  prompts: [{ id: 'weekly-report', category: 'writing', tags: ['职场', '总结'], target: 'basic-user', locales: { zh, en }, importCodes: { zh: 'weekly-report', en: 'weekly-report-en' } }],
  lessons: [{ id: 'clear-goal', title: '第 1 课', summary: '目标。', sections: [{ heading: '为什么', body: '正文' }], before: '写', after: '写周报', exercise: '练' }]
}

test('mini program data flattens the Chinese text, keeps English under en and fills optional text with ""', () => {
  const data = toMiniprogramData(library)
  assert.deepEqual(data.prompts, [{
    id: 'weekly-report',
    ...zh,
    category: 'writing',
    tags: ['职场', '总结'],
    target: 'basic-user',
    example: '',
    credit: '',
    en
  }])
  assert.deepEqual(data.categories, library.categories)
  assert.deepEqual(data.learn, library.lessons)
})

test('rendered output is a CommonJS module the mini program can require', () => {
  const data = toMiniprogramData(library)
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-library-')), 'library.js')
  try {
    fs.writeFileSync(file, render(data))
    assert.deepEqual(createRequire(file)(file), data)
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  }
})

test('the committed library.js matches library/*.json', () => {
  const data = toMiniprogramData(loadLibrary(path.join(ROOT, 'library')))
  const committed = fs.readFileSync(path.join(ROOT, 'miniprogram/goprmpt-library/data/library.js'), 'utf8').replace(/\r\n/g, '\n')
  assert.equal(committed, render(data), 'run pnpm miniprogram:data')
})
