import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { buildLibrary, render, readSources } from './build-miniprogram-data.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const valid = () => ({
  categories: [{ id: 'writing', name: '写作创作' }],
  prompts: [
    {
      id: 'weekly-report',
      title: '周报生成器',
      category: 'writing',
      summary: '整理周报',
      target: 'basic-user',
      prompt: '记录：{{记录}}',
      variables: [{ name: '记录', description: '一行一条' }],
      en: {
        title: 'Weekly report',
        summary: 'Turn notes into a weekly report',
        prompt: 'Notes: {{notes}}',
        variables: [{ name: 'notes', description: 'One per line', defaultValue: '-' }]
      }
    },
    {
      id: 'watercolor',
      title: '水彩风景',
      category: 'writing',
      summary: '画一幅水彩',
      target: 'image-text2image',
      prompt: '一幅水彩风景画',
      credit: '来源：某作者'
    }
  ],
  learn: [{ id: 'clear-goal', title: '第 1 课', sections: [{ heading: '为什么', body: '正文' }] }]
})

test('valid data builds with defaults filled in and English kept per prompt', () => {
  const { errors, data, missingEnglish } = buildLibrary(valid())
  assert.deepEqual(errors, [])
  const [report, watercolor] = data.prompts
  assert.deepEqual(report.variables, [{ name: '记录', description: '一行一条', defaultValue: '' }])
  assert.deepEqual(report.tags, [])
  assert.equal(report.credit, '')
  assert.deepEqual(report.en, {
    title: 'Weekly report',
    summary: 'Turn notes into a weekly report',
    prompt: 'Notes: {{notes}}',
    variables: [{ name: 'notes', description: 'One per line', defaultValue: '-' }]
  })
  assert.equal(watercolor.target, 'image-text2image')
  assert.equal(watercolor.credit, '来源：某作者')
  assert.equal(watercolor.en, null)
  assert.deepEqual(missingEnglish, ['watercolor'])
  assert.equal(data.learn[0].exercise, '')
})

function errorsFor(mutate) {
  const raw = valid()
  mutate(raw)
  return buildLibrary(raw).errors
}

test('unknown category fails', () => {
  const errors = errorsFor((raw) => { raw.prompts[0].category = 'nope' })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /weekly-report.*nope/)
})

test('a variable used in the prompt but not declared fails, in either language', () => {
  const zh = errorsFor((raw) => { raw.prompts[0].prompt = '记录：{{记录}}，语气：{{语气}}' })
  assert.equal(zh.length, 1)
  assert.match(zh[0], /语气/)

  const en = errorsFor((raw) => { raw.prompts[0].en.prompt = 'Notes: {{notes}} in {{tone}}' })
  assert.equal(en.length, 1)
  assert.match(en[0], /en.*tone/)
})

test('a declared variable that the prompt never uses fails', () => {
  assert.equal(errorsFor((raw) => { raw.prompts[0].variables.push({ name: '多余' }) }).length, 1)
  assert.equal(errorsFor((raw) => { raw.prompts[0].en.variables.push({ name: 'extra' }) }).length, 1)
})

test('bad and duplicate ids fail', () => {
  assert.equal(errorsFor((raw) => { raw.prompts[0].id = 'Weekly_Report' }).length, 1)
  assert.equal(errorsFor((raw) => { raw.categories[0].id = 'Writing' }).length, 3, 'bad category id, plus both prompts lose their category')
  assert.equal(errorsFor((raw) => { raw.prompts[1].id = 'weekly-report' }).length, 1)
  assert.equal(errorsFor((raw) => { raw.learn[0].id = 'a b' }).length, 1)
})

test('bad target, bad en block, missing fields and wrong types fail', () => {
  assert.equal(errorsFor((raw) => { raw.prompts[0].target = 'video' }).length, 1)
  assert.equal(errorsFor((raw) => { delete raw.prompts[0].title }).length, 1)
  assert.equal(errorsFor((raw) => { delete raw.prompts[0].en.summary }).length, 1)
  assert.equal(errorsFor((raw) => { raw.prompts[0].en = 'Weekly report' }).length, 1)
  assert.equal(errorsFor((raw) => { raw.prompts[0].tags = '职场' }).length, 1)
  assert.equal(errorsFor((raw) => { raw.prompts[1].credit = 42 }).length, 1)
  assert.equal(errorsFor((raw) => { raw.learn[0].sections = [{ heading: '缺正文' }] }).length, 1)
  assert.equal(errorsFor((raw) => { raw.prompts = {} }).length, 1)
})

test('rendered output is a CommonJS module the mini program can require', () => {
  const { data } = buildLibrary(valid())
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-library-')), 'library.js')
  try {
    fs.writeFileSync(file, render(data))
    assert.deepEqual(createRequire(file)(file), data)
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  }
})

test('the committed library.js matches library/*.json', () => {
  const { errors, data } = buildLibrary(readSources(path.join(ROOT, 'library')))
  assert.deepEqual(errors, [])
  const committed = fs.readFileSync(path.join(ROOT, 'miniprogram/goprmpt-library/data/library.js'), 'utf8').replace(/\r\n/g, '\n')
  assert.equal(committed, render(data), 'run pnpm miniprogram:data')
})
