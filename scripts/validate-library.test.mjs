import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const script = path.join(ROOT, 'scripts/validate-library.mjs')

// 复制真实的 library/ 到临时目录，改一处后跑校验脚本。
function validate(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-library-'))
  try {
    fs.cpSync(path.join(ROOT, 'library'), dir, { recursive: true })
    const file = path.join(dir, 'prompts.json')
    const prompts = JSON.parse(fs.readFileSync(file, 'utf8'))
    mutate(prompts)
    fs.writeFileSync(file, JSON.stringify(prompts))
    return spawnSync(process.execPath, [script, dir], { encoding: 'utf8' })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('an empty category is a warning and does not fail the run', () => {
  const result = validate((prompts) => prompts.splice(0, prompts.length, ...prompts.filter((p) => p.category !== 'writing')))
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stderr, /分类 writing 下还没有提示词/)
})

test('a banned cliché fails the run', () => {
  const result = validate((prompts) => { prompts[0].prompt = `作为一个AI，${prompts[0].prompt}` })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /含套话：作为一个AI/)
})

test('schema problems fail the run with the full list', () => {
  const result = validate((prompts) => { prompts[0].target = 'video'; prompts[1].category = 'nope' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /2 处错误/)
})
