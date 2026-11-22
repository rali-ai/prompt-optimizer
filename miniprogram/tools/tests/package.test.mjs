// 打包脚本：zip 能被标准方式解开、内容和源目录一致；扫描能拦住上游项目名和疑似密钥。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

import { packageMiniprogram, scan, zip } from '../../../scripts/package-miniprogram.mjs'

// 按中央目录读 zip：{ 名称: Buffer }。
function unzip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const count = buffer.readUInt16LE(end + 10)
  let at = buffer.readUInt32LE(end + 16)
  const files = {}
  for (let i = 0; i < count; i += 1) {
    assert.equal(buffer.readUInt32LE(at), 0x02014b50)
    const size = buffer.readUInt32LE(at + 20)
    const nameLength = buffer.readUInt16LE(at + 28)
    const offset = buffer.readUInt32LE(at + 42)
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength)
    const localName = buffer.readUInt16LE(offset + 26)
    const data = zlib.inflateRawSync(buffer.subarray(offset + 30 + localName, offset + 30 + localName + size))
    assert.equal(zlib.crc32(data), buffer.readUInt32LE(at + 16), name + ' crc')
    files[name] = data
    at += 46 + nameLength
  }
  return files
}

test('zip round-trips names (including Chinese) and contents', () => {
  const files = { 'a.txt': Buffer.from('hello'), '目录/说明.md': Buffer.from('中文内容'.repeat(100)), 'empty': Buffer.alloc(0) }
  const out = unzip(zip(files))
  assert.deepEqual(Object.keys(out).sort(), Object.keys(files).sort())
  for (const name of Object.keys(files)) assert.ok(out[name].equals(files[name]), name)
})

test('scan flags upstream names and secret-shaped strings, and passes clean text', () => {
  const planted = {
    'a.js': Buffer.from("const url = 'https://github.com/linshenkx/prompt-optimizer'"),
    'b.js': Buffer.from('proxy: always200.example'),
    'c.js': Buffer.from("const key = 'sk-abcdefghijklmnopqrstuvwxyz123456'"),
    'd.json': Buffer.from('{ "appSecret": "0123456789abcdef0123456789abcdef" }'),
    'e.js': Buffer.from("module.exports = { apiKey: 'live-key-123456' }"),
    'clean.js': Buffer.from("module.exports = { API_BASE: 'https://mp-api.goprmpt.com', apiKey: '' }")
  }
  const flagged = new Set(scan(planted).map((h) => h.file))
  assert.deepEqual([...flagged].sort(), ['a.js', 'b.js', 'c.js', 'd.json', 'e.js'])
})

test('packages the full project and the lite folder from the real sources', (t) => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-package-'))
  t.after(() => fs.rmSync(outDir, { recursive: true, force: true }))
  const [full, lite] = packageMiniprogram({ outDir, version: 'test' })

  const fullFiles = unzip(fs.readFileSync(full.path))
  for (const name of ['project.config.json', 'app.json', 'app.js', 'goprmpt-lite/config.js', 'goprmpt-library/data/library.js']) {
    assert.ok(fullFiles[name], 'full package has ' + name)
  }
  assert.ok(!Object.keys(fullFiles).some((n) => n.startsWith('tools/')), 'dev tools are left out')

  const liteFiles = unzip(fs.readFileSync(lite.path))
  const names = Object.keys(liteFiles)
  assert.ok(names.every((n) => n.startsWith('goprmpt-lite/')), 'lite zip holds only goprmpt-lite/')
  assert.ok(liteFiles['goprmpt-lite/INTEGRATION.zh-CN.md'])
  assert.ok(liteFiles['goprmpt-lite/config.js'].equals(fullFiles['goprmpt-lite/config.js']))
  assert.deepEqual(names.sort(), Object.keys(fullFiles).filter((n) => n.startsWith('goprmpt-lite/')).sort())
})
