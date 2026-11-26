#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const targets = process.argv.slice(2)
if (targets.length === 0) {
  targets.push(path.join('packages', 'extension', 'dist'))
}
const rootDir = process.cwd()
const targetPaths = targets.map((target) => path.resolve(rootDir, target))

const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.map',
  '.mjs',
  '.txt',
])

const SECRET_PATTERNS = [
  {
    name: 'OpenAI-compatible API key',
    regex: /\bsk-[A-Za-z0-9_-]{12,}\b/g,
    allow: (value) => value.startsWith('sk-border'),
  },
  {
    name: 'OpenRouter API key',
    regex: /\bsk-or-v1-[A-Za-z0-9_-]{12,}\b/g,
  },
  {
    name: 'xAI API key',
    regex: /\bxai-[A-Za-z0-9_-]{12,}\b/g,
  },
  {
    name: 'AWS presigned signature (X-Amz-Signature)',
    regex: /X-Amz-Signature=[0-9a-fA-F]{32,}/g,
    allow: (value) => value.startsWith('X-Amz-Signature=REDACTED_'),
  },
  {
    name: 'AWS presigned security token (X-Amz-Security-Token)',
    regex: /X-Amz-Security-Token=[A-Za-z0-9%+/=._-]{40,}/g,
    allow: (value) => value.startsWith('X-Amz-Security-Token=REDACTED_'),
  },
  {
    name: 'UUID-like secret',
    regex: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
    allow: (value, text, index) => {
      if (
        value === '00000000-0000-0000-0000-000000000000' ||
        value === '10000000-1000-4000-8000-100000000000' ||
        value === 'ffffffff-ffff-ffff-ffff-ffffffffffff'
      ) {
        return true
      }
      const before = text.slice(Math.max(0, index - 24), index)
      if (/chatcmpl-$/.test(before)) {
        return true
      }
      const after = text.slice(index + value.length, index + value.length + 50)
      return (
        /\\?"id\\?"\s*:\s*\\?"$/.test(before) &&
        /^\\?"\s*,\s*\\?"object\\?"\s*:\s*\\?"chat\.completion/.test(after)
      )
    },
  },
]

const BLOCKED_LITERALS = [
  'http://localhost:18300',
  'http://127.0.0.1:18300',
  'http://127.0.0.1:8317',
  'VITE_LOCAL_DEV:`true`',
  'VITE_LOCAL_DEV:"true"',
  "VITE_LOCAL_DEV:'true'",
]

const SENSITIVE_ENV_KEY = /^(VITE_.*(?:API_KEY|API_TOKEN|SECRET|PASSWORD|CUSTOM_API|OPENAI|DEEPSEEK|SILICONFLOW|OPENROUTER|DASHSCOPE|GROK|SEEDREAM|GEMINI|ANTHROPIC|ZHIPU|MODELSCOPE|MINIMAX|CF_))$/u
const SAFE_ENV_VALUES = new Set(['true', 'false', '1', '0', 'development', 'production'])

function mask(value) {
  if (value.length <= 12) return '<set>'
  return `${value.slice(0, 8)}...${value.slice(-4)}`
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return []

  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const separator = line.indexOf('=')
      const key = line.slice(0, separator).trim()
      let value = line.slice(separator + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      return { key, value }
    })
    .filter(({ key, value }) => {
      if (!key.startsWith('VITE_')) return false
      if (!SENSITIVE_ENV_KEY.test(key)) return false
      if (!value || value.length < 8) return false
      if (SAFE_ENV_VALUES.has(value.toLowerCase())) return false
      return true
    })
}

function listFiles(currentPath) {
  const stat = fs.statSync(currentPath)
  if (stat.isFile()) return [currentPath]
  if (!stat.isDirectory()) return []

  return fs
    .readdirSync(currentPath, { withFileTypes: true })
    .flatMap((entry) => listFiles(path.join(currentPath, entry.name)))
}

function isTextFile(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

function findLine(text, index) {
  return text.slice(0, index).split(/\r?\n/u).length
}

for (const targetPath of targetPaths) {
  if (!fs.existsSync(targetPath)) {
    console.error(`Extension release scan target does not exist: ${targetPath}`)
    process.exit(1)
  }
}

const envValues = [
  ...parseEnvFile(path.join(rootDir, '.env')),
  ...parseEnvFile(path.join(rootDir, '.env.local')),
]

const findings = []
const files = [...new Set(targetPaths.flatMap((targetPath) => listFiles(targetPath).filter(isTextFile)))]

for (const file of files) {
  const relativeFile = path.relative(rootDir, file)
  const text = fs.readFileSync(file, 'utf8')

  for (const literal of BLOCKED_LITERALS) {
    const index = text.indexOf(literal)
    if (index !== -1) {
      findings.push({
        file: relativeFile,
        line: findLine(text, index),
        type: 'blocked literal',
        value: literal,
      })
    }
  }

  for (const pattern of SECRET_PATTERNS) {
    for (const match of text.matchAll(pattern.regex)) {
      const value = match[0]
      const index = match.index ?? 0
      if (pattern.allow?.(value, text, index)) continue
      findings.push({
        file: relativeFile,
        line: findLine(text, index),
        type: pattern.name,
        value: mask(value),
      })
    }
  }

  for (const { key, value } of envValues) {
    const index = text.indexOf(value)
    if (index === -1) continue

    findings.push({
      file: relativeFile,
      line: findLine(text, index),
      type: `local env value (${key})`,
      value: mask(value),
    })
  }
}

if (findings.length > 0) {
  console.error('Extension release secret scan failed:')
  for (const finding of findings) {
    console.error(
      `- ${finding.file}:${finding.line} ${finding.type} ${finding.value}`
    )
  }
  process.exit(1)
}

console.log(`Extension release secret scan passed (${files.length} text files checked).`)
