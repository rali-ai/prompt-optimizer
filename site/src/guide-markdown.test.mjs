import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderGuideDocument } from './guide-markdown.js'

const srcDir = path.dirname(fileURLToPath(import.meta.url))
const userManual = fs.readFileSync(path.join(srcDir, 'guide-docs/user-manual.md'), 'utf8')
const trainingManual = fs.readFileSync(path.join(srcDir, 'guide-docs/training-manual.md'), 'utf8')

test('renderGuideDocument extracts title, TOC, callouts, tables, copy snippets, and figures', () => {
  const sample = [
    '# 示例标题',
    '',
    '这是导语，访问 https://goprmpt.com/library/ 查看词库。',
    '',
    '## 1. 第一节',
    '',
    '![示例截图](./images/01-home-hero.png)',
    '',
    '> 图中重点：',
    '> - **要点一**：清晰说明',
    '> - **要点二**：操作直观',
    '',
    '```prompt',
    '帮我整理本周工作',
    '```',
    '',
    '| 列一 | 列二 |',
    '| --- | --- |',
    '| 值一 | 值二 |'
  ].join('\n')

  const result = renderGuideDocument(sample)
  assert.equal(result.title, '示例标题')
  assert.equal(result.toc.length, 1)
  assert.equal(result.toc[0].text, '1. 第一节')
  assert.match(result.html, /src="\/images\/guide\/01-home-hero\.png"/)
  assert.match(result.html, /guide-callout__title">图中重点<\/p>/)
  assert.match(result.html, /data-copy-snippet="0"/)
  assert.equal(result.copyBlocks[0], '帮我整理本周工作')
  assert.match(result.html, /<table class="guide-table">/)
  assert.match(result.html, /href="https:\/\/goprmpt\.com\/library\/"/)
})

test('public guide manuals exclude all admin and internal infrastructure content', () => {
  const forbidden = [
    '管理后台',
    '/user-api/admin',
    '管理员',
    '站长',
    'Resend',
    'ralitong',
    '138.2.155.159',
    '09-admin-login',
    '10-admin-console',
    'users.db',
    'OpenResty'
  ]

  for (const [name, content] of [
    ['user-manual.md', userManual],
    ['training-manual.md', trainingManual]
  ]) {
    for (const term of forbidden) {
      assert.equal(content.includes(term), false, `${name} must not mention "${term}"`)
    }
    const parsed = renderGuideDocument(content)
    assert.ok(parsed.toc.length >= 6, `${name} should have structured TOC entries`)
    assert.ok(parsed.html.includes('/images/guide/01-home-hero.png'), `${name} should map screenshots to /images/guide/`)
  }
})

test('every image referenced by public guide manuals exists in site/public/images/guide', () => {
  const guideImgDir = path.resolve(srcDir, '../public/images/guide')
  const imgPattern = /!\[[^\]]*\]\(\.\/images\/([^)]+)\)/g
  const referenced = new Set()

  for (const content of [userManual, trainingManual]) {
    for (const match of content.matchAll(imgPattern)) {
      referenced.add(match[1])
    }
  }

  assert.equal(referenced.size, 8)
  for (const file of referenced) {
    const full = path.join(guideImgDir, file)
    assert.equal(fs.existsSync(full), true, `missing guide screenshot: ${file}`)
  }
  assert.equal(fs.existsSync(path.join(guideImgDir, '09-admin-login.png')), false)
  assert.equal(fs.existsSync(path.join(guideImgDir, '10-admin-console.png')), false)
})
