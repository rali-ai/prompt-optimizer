#!/usr/bin/env node
// Validates library/*.json against the schema in library/README.md and prints counts per category.
// Usage: node scripts/validate-library.mjs [libraryDir]

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const libraryDir = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'library')

const TARGETS = ['basic-user', 'basic-system', 'image-text2image']
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PLACEHOLDER = /\{\{([^{}]*)\}\}/gu
const BANNED_PHRASES = ['作为一个AI', '作为AI', '作为一个强大的', '强大的AI']

const errors = []
const fail = (where, message) => errors.push(`${where}: ${message}`)
const isText = (value) => typeof value === 'string' && value.trim() !== ''

function load(name) {
  try {
    return JSON.parse(readFileSync(join(libraryDir, name), 'utf8'))
  } catch (error) {
    fail(name, `无法读取或解析：${error.message}`)
    return []
  }
}

function checkShape(where, obj, required, optional = []) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    fail(where, '应为对象')
    return false
  }
  for (const key of required) if (!(key in obj)) fail(where, `缺少字段 ${key}`)
  for (const key of Object.keys(obj)) {
    if (!required.includes(key) && !optional.includes(key)) fail(where, `未知字段 ${key}`)
  }
  return true
}

function checkText(where, obj, keys) {
  for (const key of keys) if (key in obj && !isText(obj[key])) fail(where, `${key} 不能为空`)
}

function checkUnique(file, items, key) {
  const seen = new Set()
  for (const item of items) {
    const value = item?.[key]
    if (seen.has(value)) fail(file, `${key} 重复：${value}`)
    seen.add(value)
  }
}

function checkId(where, id) {
  if (typeof id === 'string' && !ID_PATTERN.test(id)) fail(where, `id 只能用小写字母、数字和连字符：${id}`)
}

// Mirrors the optimizer's rule in packages/ui/src/types/variable.ts.
function variableNameProblem(name) {
  if (name.length > 50) return '超过 50 个字符'
  if (/^\d/u.test(name)) return '不能以数字开头'
  if (/^[#/^!>&]/u.test(name)) return '不能以 # / ^ ! > & 开头'
  if (/[\s{}]/u.test(name)) return '不能含空白或花括号'
  if (['__proto__', 'prototype', 'constructor'].includes(name)) return '是保留名'
  return null
}

function placeholdersIn(where, text) {
  const names = new Set()
  if (text.includes('{{{')) fail(where, '不能用三重花括号')
  for (const match of text.matchAll(PLACEHOLDER)) {
    const name = match[1].trim()
    const problem = variableNameProblem(name)
    if (!name || problem) fail(where, `占位符 ${match[0]} 无效${problem ? `：${problem}` : ''}`)
    else names.add(name)
  }
  const rest = text.replace(PLACEHOLDER, '')
  if (rest.includes('{{') || rest.includes('}}')) fail(where, '有未配对的花括号')
  return names
}

// Checks one language version: title, summary, prompt and the variables its prompt uses.
function checkVersion(where, version, { sentence, variableName }) {
  checkText(where, version, ['title', 'summary', 'prompt'])
  if (isText(version.summary) && !sentence.test(version.summary.trim())) {
    fail(where, 'summary 应是一句话，以句末标点结尾')
  }
  for (const phrase of BANNED_PHRASES) {
    if (`${version.title}${version.summary}${version.prompt}`.includes(phrase)) fail(where, `含套话：${phrase}`)
  }
  if (!Array.isArray(version.variables)) {
    fail(where, 'variables 应为数组')
    return
  }
  const declared = new Set()
  for (const variable of version.variables) {
    const vWhere = `${where}.variables[${variable?.name ?? '?'}]`
    if (!checkShape(vWhere, variable, ['name', 'description', 'defaultValue'])) continue
    checkText(vWhere, variable, ['name', 'description'])
    if (typeof variable.defaultValue !== 'string') fail(vWhere, 'defaultValue 应为字符串，留空写 ""')
    if (variableName && typeof variable.name === 'string' && !variableName.test(variable.name)) {
      fail(vWhere, '英文变量名用 snake_case，例如 target_reader')
    }
    if (declared.has(variable.name)) fail(where, `变量重复：${variable.name}`)
    declared.add(variable.name)
  }
  if (typeof version.prompt !== 'string') return
  const used = placeholdersIn(where, version.prompt)
  for (const name of used) if (!declared.has(name)) fail(where, `正文用了 {{${name}}}，但 variables 没有声明`)
  for (const name of declared) if (!used.has(name)) fail(where, `variables 声明了 ${name}，但正文没有用到`)
}

function checkPrompt(prompt, categoryIds) {
  const where = `prompts.json[${prompt?.id ?? '?'}]`
  const fields = ['id', 'title', 'category', 'tags', 'summary', 'target', 'prompt', 'variables', 'en']
  if (!checkShape(where, prompt, fields, ['example', 'credit'])) return
  checkText(where, prompt, ['id', 'category', 'example', 'credit'])
  checkId(where, prompt.id)

  if (!categoryIds.has(prompt.category)) fail(where, `分类不存在：${prompt.category}`)
  if (!TARGETS.includes(prompt.target)) fail(where, `target 只能是 ${TARGETS.join(' / ')}：${prompt.target}`)

  const tags = prompt.tags
  if (!Array.isArray(tags) || tags.length < 2 || tags.length > 4) fail(where, 'tags 需要 2 到 4 个')
  else if (!tags.every(isText) || new Set(tags).size !== tags.length) fail(where, 'tags 不能为空或重复')

  checkVersion(where, prompt, { sentence: /^[^。！？!?]+[。！？]$/u })

  const enWhere = `${where}.en`
  if (!checkShape(enWhere, prompt.en, ['title', 'summary', 'prompt', 'variables'])) return
  checkVersion(enWhere, prompt.en, { sentence: /^[^.!?]+(?:\.[^\s.!?][^.!?]*)*[.!?]$/u, variableName: /^[a-z][a-z0-9_]*$/u })
  if (Array.isArray(prompt.variables) && Array.isArray(prompt.en.variables) && prompt.variables.length !== prompt.en.variables.length) {
    fail(enWhere, `变量数量与中文版不一致：${prompt.variables.length} 对 ${prompt.en.variables.length}`)
  }
}

function checkLesson(lesson) {
  const where = `learn.json[${lesson?.id ?? '?'}]`
  const fields = ['id', 'title', 'summary', 'sections', 'before', 'after', 'exercise']
  if (!checkShape(where, lesson, fields)) return
  checkText(where, lesson, ['id', 'title', 'summary', 'before', 'after', 'exercise'])
  checkId(where, lesson.id)
  if (lesson.before === lesson.after) fail(where, 'before 和 after 相同')
  if (!Array.isArray(lesson.sections) || lesson.sections.length === 0) {
    fail(where, 'sections 至少一节')
    return
  }
  lesson.sections.forEach((section, index) => {
    const sWhere = `${where}.sections[${index}]`
    if (checkShape(sWhere, section, ['heading', 'body'])) checkText(sWhere, section, ['heading', 'body'])
  })
}

const categories = load('categories.json')
const prompts = load('prompts.json')
const lessons = load('learn.json')

for (const [file, list] of [['categories.json', categories], ['prompts.json', prompts], ['learn.json', lessons]]) {
  if (!Array.isArray(list)) fail(file, '顶层应为数组')
}

if (Array.isArray(categories)) {
  for (const category of categories) {
    const where = `categories.json[${category?.id ?? '?'}]`
    if (!checkShape(where, category, ['id', 'name', 'description'])) continue
    checkText(where, category, ['id', 'name', 'description'])
    checkId(where, category.id)
  }
  checkUnique('categories.json', categories, 'id')
  checkUnique('categories.json', categories, 'name')
}

const categoryIds = new Set(Array.isArray(categories) ? categories.map((c) => c?.id) : [])
if (Array.isArray(prompts)) {
  for (const prompt of prompts) checkPrompt(prompt, categoryIds)
  checkUnique('prompts.json', prompts, 'id')
  checkUnique('prompts.json', prompts, 'title')
  checkUnique('prompts.json en', prompts.map((p) => p?.en ?? {}), 'title')
}
if (Array.isArray(lessons)) {
  for (const lesson of lessons) checkLesson(lesson)
  checkUnique('learn.json', lessons, 'id')
  checkUnique('learn.json', lessons, 'title')
}

const counts = new Map([...categoryIds].map((id) => [id, Object.fromEntries(TARGETS.map((t) => [t, 0]))]))
if (Array.isArray(prompts)) {
  for (const prompt of prompts) {
    const row = counts.get(prompt?.category)
    if (row && prompt.target in row) row[prompt.target] += 1
  }
}
const rows = []
for (const category of Array.isArray(categories) ? categories : []) {
  const row = counts.get(category?.id)
  if (!row) continue
  const total = TARGETS.reduce((sum, t) => sum + row[t], 0)
  if (total === 0) fail('categories.json', `分类 ${category.id} 下没有提示词`)
  rows.push({ 分类: category.name, id: category.id, 合计: total, ...row })
}
console.table(rows)
const totals = Object.fromEntries(TARGETS.map((t) => [t, rows.reduce((sum, r) => sum + r[t], 0)]))
console.log(`提示词 ${Array.isArray(prompts) ? prompts.length : 0} 条（${TARGETS.map((t) => `${t} ${totals[t]}`).join('，')}），分类 ${rows.length} 个，课程 ${Array.isArray(lessons) ? lessons.length : 0} 课。`)

if (errors.length > 0) {
  console.error(`\n校验失败，共 ${errors.length} 处：`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}
console.log('校验通过。')
