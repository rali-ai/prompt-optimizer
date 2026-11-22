#!/usr/bin/env node
// 在 library/schema.mjs 的结构校验之上做编辑检查，并按分类打印提示词数量。
// 套话算错误；空分类只提示，不影响退出码（内容会陆续补上）。
// 用法：node scripts/validate-library.mjs [libraryDir]

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { LibraryError, PROMPT_LANGUAGES, TARGETS, loadLibrary } from '../library/schema.mjs'

const libraryDir = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'library')
const BANNED_PHRASES = ['作为一个AI', '作为AI', '作为一个强大的', '强大的AI']

let library
try {
  library = loadLibrary(libraryDir)
} catch (error) {
  if (!(error instanceof LibraryError)) throw error
  console.error(error.message)
  process.exit(1)
}
const { categories, prompts, lessons } = library

const errors = []
for (const prompt of prompts) {
  for (const language of PROMPT_LANGUAGES) {
    const { title, summary, prompt: text } = prompt.locales[language]
    for (const phrase of BANNED_PHRASES) {
      if (`${title}${summary}${text}`.includes(phrase)) errors.push(`prompts.json(${prompt.id}).${language}：含套话：${phrase}`)
    }
  }
}

const warnings = []
const rows = categories.map((category) => {
  const counts = Object.fromEntries(TARGETS.map((target) => [target, 0]))
  for (const prompt of prompts) if (prompt.category === category.id) counts[prompt.target] += 1
  const total = TARGETS.reduce((sum, target) => sum + counts[target], 0)
  if (total === 0) warnings.push(`分类 ${category.id} 下还没有提示词`)
  return { 分类: category.name, id: category.id, 合计: total, ...counts }
})
console.table(rows)
const totals = TARGETS.map((target) => `${target} ${rows.reduce((sum, row) => sum + row[target], 0)}`)
console.log(`提示词 ${prompts.length} 条（${totals.join('，')}），分类 ${categories.length} 个，课程 ${lessons.length} 课。`)

if (warnings.length > 0) {
  console.warn(`\n提示 ${warnings.length} 处：`)
  for (const warning of warnings) console.warn(`- ${warning}`)
}
if (errors.length > 0) {
  console.error(`\n校验失败，共 ${errors.length} 处：`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}
console.log('校验通过。')
