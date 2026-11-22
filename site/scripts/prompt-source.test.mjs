// 不跑 vite 也能验证网站的导入文件：用 vite.config.js 同一个 promptSources 写出文件，再交给 verify-prompt-source.mjs 检查。
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadLibrary, promptSources } from '../../library/schema.mjs'

const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const verifyScript = path.join(siteDir, 'scripts/verify-prompt-source.mjs')

function emit(distDir) {
  const sourceDir = path.join(distDir, 'api/public/prompt-source')
  fs.mkdirSync(sourceDir, { recursive: true })
  const sources = promptSources(loadLibrary(path.join(siteDir, '../library')))
  for (const { importCode, data } of sources) fs.writeFileSync(path.join(sourceDir, importCode), JSON.stringify(data))
  return sources
}

const verify = (distDir) => spawnSync(process.execPath, [verifyScript, distDir], { encoding: 'utf8' })

test('every library prompt yields an import file the optimizer accepts', () => {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-dist-'))
  try {
    const sources = emit(distDir)
    const result = verify(distDir)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, new RegExp(`${sources.length} import files`))
  } finally {
    fs.rmSync(distDir, { recursive: true, force: true })
  }
})

test('the check fails when an import file is missing', () => {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-dist-'))
  try {
    const [first] = emit(distDir)
    fs.rmSync(path.join(distDir, 'api/public/prompt-source', first.importCode))
    const result = verify(distDir)
    assert.equal(result.status, 1)
    assert.match(result.stderr, new RegExp(`${first.importCode}: missing`))
  } finally {
    fs.rmSync(distDir, { recursive: true, force: true })
  }
})
