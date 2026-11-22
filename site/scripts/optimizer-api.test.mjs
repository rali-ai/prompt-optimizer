// 不跑 vite 也能验证网站给优化器的接口文件：用 vite.config.js 同一个 optimizerApiFiles 写出文件，再交给 verify-optimizer-api.mjs 检查。
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadLibrary } from '../../library/schema.mjs'
import { optimizerApiFiles } from './optimizer-api.mjs'

const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const verifyScript = path.join(siteDir, 'scripts/verify-optimizer-api.mjs')

function emit(distDir) {
  const files = optimizerApiFiles(loadLibrary(path.join(siteDir, '../library')))
  for (const { fileName, data } of files) {
    const file = path.join(distDir, fileName)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(data))
  }
  return files
}

const verify = (distDir) => spawnSync(process.execPath, [verifyScript, distDir], { encoding: 'utf8' })

function withDist(run) {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-dist-'))
  try {
    run(distDir)
  } finally {
    fs.rmSync(distDir, { recursive: true, force: true })
  }
}

test('every library prompt and workspace catalog yields files the optimizer accepts', () => {
  withDist((distDir) => {
    const files = emit(distDir)
    const result = verify(distDir)
    assert.equal(result.status, 0, result.stderr)
    const sources = files.filter((file) => file.fileName.startsWith('api/public/prompt-source/'))
    assert.match(result.stdout, new RegExp(`${sources.length} import files, 16 catalogs`))
  })
})

test('the check fails when an import file is missing', () => {
  withDist((distDir) => {
    const [first] = emit(distDir)
    fs.rmSync(path.join(distDir, first.fileName))
    const result = verify(distDir)
    assert.equal(result.status, 1)
    assert.match(result.stderr, new RegExp(`${path.basename(first.fileName)}: missing`))
  })
})

test('the check fails when a catalog is missing or drops prompts', () => {
  withDist((distDir) => {
    emit(distDir)
    fs.rmSync(path.join(distDir, 'api/public/prompts/catalog/en/arena.json'))
    const zhArena = path.join(distDir, 'api/public/prompts/catalog/zh/arena.json')
    const data = JSON.parse(fs.readFileSync(zhArena, 'utf8'))
    fs.writeFileSync(zhArena, JSON.stringify({ ...data, items: data.items.slice(1) }))
    const result = verify(distDir)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /catalog\/en\/arena\.json: optimizer rejected it \(Garden request failed: 404\)/)
    assert.match(result.stderr, /catalog\/zh\/arena\.json: optimizer kept \d+ items, library has \d+/)
  })
})
