#!/usr/bin/env node
// Zip the built browser extension (packages/extension/dist, run `pnpm build:ext` first)
// into dist-packages/goprmpt-extension-<manifest version>.zip, with manifest.json at the
// zip root. Refuses to package a build that still names the upstream project.

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const root = process.cwd()
const distDir = path.join(root, 'packages', 'extension', 'dist')
const outDir = path.join(root, 'dist-packages')
const UPSTREAM = /linshenkx|always200/i

// fflate is already a dependency of @prompt-optimizer/ui; reuse it rather than add one.
const { zipSync } = createRequire(path.join(root, 'packages', 'ui', 'package.json'))('fflate')

const listFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? listFiles(full) : [full]
  })

const manifest = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf8'))
const files = {}
const upstreamHits = []
for (const file of listFiles(distDir)) {
  const name = path.relative(distDir, file).split(path.sep).join('/')
  files[name] = fs.readFileSync(file)
  if (UPSTREAM.test(files[name].toString('utf8'))) upstreamHits.push(name)
}

if (upstreamHits.length) {
  console.error(`Upstream references (${UPSTREAM}) found in:\n  ${upstreamHits.join('\n  ')}`)
  process.exit(1)
}

fs.mkdirSync(outDir, { recursive: true })
const zipPath = path.join(outDir, `goprmpt-extension-${manifest.version}.zip`)
fs.writeFileSync(zipPath, zipSync(files, { level: 9 }))
console.log(`Packaged ${Object.keys(files).length} files -> ${path.relative(root, zipPath)}`)
