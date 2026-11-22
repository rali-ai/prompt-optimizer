// 提示词库数据的唯一解析入口。网站、小程序数据生成脚本和校验脚本都通过 loadLibrary 读 library/*.json，
// 字段规则见 library/README.md。数据有问题时一次抛出 LibraryError，problems 列出全部问题。
import fs from 'node:fs'
import path from 'node:path'

/**
 * @typedef {'zh' | 'en'} Language
 * @typedef {'basic-user' | 'basic-system' | 'image-text2image'} Target
 * @typedef {'text' | 'image'} Kind
 * @typedef {{ id: string, name: string, description: string, kind?: Kind, en?: { name: string, description: string } }} Category
 * @typedef {{ name: string, description: string, defaultValue: string }} Variable
 * @typedef {{ title: string, summary: string, prompt: string, variables: Variable[] }} PromptText
 * @typedef {{ name: string, url: string, license?: string }} Source
 * @typedef {{
 *   id: string, category: string, tags: string[], target: Target,
 *   locales: Record<Language, PromptText>, importCodes: Record<Language, string>,
 *   example?: string, source?: Source
 * }} Prompt
 * @typedef {{ heading: string, body: string }} Section
 * @typedef {{
 *   id: string, title: string, summary: string, sections: Section[],
 *   before: string, after: string, exercise: string
 * }} Lesson
 * @typedef {{ categories: Category[], prompts: Prompt[], lessons: Lesson[] }} Library
 */

export const LIBRARY_FILES = ['categories.json', 'prompts.json', 'learn.json']
export const PROMPT_LANGUAGES = ['zh', 'en']
export const KINDS = ['text', 'image']
// target 决定导入优化器的哪个工作区，也决定提示词是文字类还是图片类。
export const TARGET_KINDS = { 'basic-user': 'text', 'basic-system': 'text', 'image-text2image': 'image' }
export const TARGETS = Object.keys(TARGET_KINDS)

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PLACEHOLDER = /\{\{([^{}]*)\}\}/gu
const SENTENCE = { zh: /^[^。！？!?]+[。！？]$/u, en: /^[^.!?]+(?:\.[^\s.!?][^.!?]*)*[.!?]$/u }
const ENGLISH_VARIABLE = /^[a-z][a-z0-9_]*$/u
const PROMPT_FIELDS = ['id', 'title', 'category', 'tags', 'summary', 'target', 'prompt', 'variables', 'en']
const TEXT_FIELDS = ['title', 'summary', 'prompt', 'variables']
const LESSON_FIELDS = ['id', 'title', 'summary', 'sections', 'before', 'after', 'exercise']

export class LibraryError extends Error {
  constructor(dir, problems) {
    super(`提示词库数据有 ${problems.length} 处错误（${dir}）：\n  - ${problems.join('\n  - ')}`)
    this.name = 'LibraryError'
    this.problems = problems
  }
}

export function importCodeFor(id, language) {
  return language === 'en' ? `${id}-en` : id
}

// 与优化器 packages/ui/src/types/variable.ts 的 getVariableNameValidationError 一致：不合规的变量会被优化器丢掉。
export function variableNameError(name) {
  if (!name) return '变量名为空'
  if (name.length > 50) return '变量名超过 50 个字符'
  if (/^[#/^!>&]/u.test(name)) return '变量名不能以 # / ^ ! > & 开头'
  if (/^\d/u.test(name)) return '变量名不能以数字开头'
  if (['__proto__', 'prototype', 'constructor'].includes(name)) return '变量名是保留字'
  if (/[\s{}]/u.test(name)) return '变量名不能包含空白或花括号'
  return null
}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// 读一个 JSON 对象的字段。缺字段、多字段在创建时报告；取值方法遇到类型不对时报告并返回空值，好让解析继续、把问题列全。
function reader(problems, where, record, required, optional = []) {
  const fail = (message) => problems.push(`${where}：${message}`)
  for (const key of required) if (!(key in record)) fail(`缺少字段 ${key}`)
  for (const key of Object.keys(record)) {
    if (!required.includes(key) && !optional.includes(key)) fail(`未知字段 ${key}`)
  }
  const field = {
    where,
    fail,
    has: (key) => key in record,
    isList: (key) => Array.isArray(record[key]),
    text(key) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) return value
      if (key in record) fail(`${key} 必须是非空字符串`)
      return ''
    },
    optionalText: (key) => (key in record ? field.text(key) : undefined),
    string(key) {
      if (typeof record[key] === 'string') return record[key]
      if (key in record) fail(`${key} 必须是字符串，留空写 ""`)
      return ''
    },
    id() {
      const id = field.text('id')
      if (id && !ID_PATTERN.test(id)) fail(`id 只能用小写字母、数字和连字符：${id}`)
      return id
    },
    list(key) {
      if (Array.isArray(record[key])) return record[key]
      if (key in record) fail(`${key} 必须是数组`)
      return []
    },
    // 嵌套对象：record[key]，或数组元素 value（此时 key 只用来标位置）。
    child(key, required, optional, value = record[key]) {
      if (!isRecord(value)) {
        fail(`${key} 必须是对象`)
        return null
      }
      return reader(problems, `${where}.${key}`, value, required, optional)
    }
  }
  return field
}

function records(problems, file, data, required, optional, parse) {
  if (!Array.isArray(data)) {
    problems.push(`${file}：顶层必须是数组`)
    return []
  }
  return data.flatMap((record, index) => {
    const where = typeof record?.id === 'string' ? `${file}[${index}](${record.id})` : `${file}[${index}]`
    if (!isRecord(record)) {
      problems.push(`${where}：必须是对象`)
      return []
    }
    return [parse(reader(problems, where, record, required, optional))]
  })
}

function checkUnique(problems, file, label, values) {
  const seen = new Set()
  for (const value of values) {
    if (value && seen.has(value)) problems.push(`${file}：${label}重复：${value}`)
    seen.add(value)
  }
}

// 可选的 source：改编自外部提示词库时注明出处。
function parseSource(field) {
  if (!field.has('source')) return undefined
  const source = field.child('source', ['name', 'url'], ['license'])
  if (!source) return undefined
  const parsed = { name: source.text('name'), url: source.text('url') }
  if (parsed.url && !/^https?:\/\/\S+$/u.test(parsed.url)) source.fail(`url 必须是 http(s) 链接：${parsed.url}`)
  const license = source.optionalText('license')
  if (license) parsed.license = license
  return parsed
}

function parseCategories(problems, data) {
  const categories = records(problems, 'categories.json', data, ['id', 'name', 'description'], ['kind', 'en'], (field) => {
    const category = { id: field.id(), name: field.text('name'), description: field.text('description') }
    const kind = field.optionalText('kind')
    if (kind && !KINDS.includes(kind)) field.fail(`kind 只能是 ${KINDS.join(' / ')}：${kind}`)
    else if (kind) category.kind = kind
    const en = field.has('en') ? field.child('en', ['name', 'description']) : null
    if (en) category.en = { name: en.text('name'), description: en.text('description') }
    return category
  })
  checkUnique(problems, 'categories.json', 'id ', categories.map((c) => c.id))
  checkUnique(problems, 'categories.json', 'name ', categories.map((c) => c.name))
  checkUnique(problems, 'categories.json', '英文名', categories.map((c) => c.en?.name))
  return categories
}

function checkPlaceholders(field, prompt, variables) {
  if (prompt.includes('{{{')) field.fail('prompt 不能用三重花括号')
  const used = new Set()
  for (const [placeholder, inner] of prompt.matchAll(PLACEHOLDER)) {
    const problem = variableNameError(inner.trim())
    if (problem) field.fail(`占位符 ${placeholder} 无效：${problem}`)
    else used.add(inner.trim())
  }
  const rest = prompt.replace(PLACEHOLDER, '')
  if (rest.includes('{{') || rest.includes('}}')) field.fail('prompt 有未配对的花括号')

  const declared = new Set()
  for (const { name } of variables) {
    if (declared.has(name)) field.fail(`变量重复：${name}`)
    declared.add(name)
  }
  for (const name of used) if (!declared.has(name)) field.fail(`prompt 用了 {{${name}}}，但 variables 没有声明`)
  for (const name of declared) if (name && !used.has(name)) field.fail(`variables 声明了 ${name}，但 prompt 没有用到`)
}

// 一种语言的标题、简介、正文和变量。
function parsePromptText(field, language) {
  const title = field.text('title')
  const summary = field.text('summary')
  const prompt = field.text('prompt')
  if (summary && !SENTENCE[language].test(summary.trim())) field.fail('summary 应是一句话，以句末标点结尾')

  const variables = field.list('variables').flatMap((value, index) => {
    const variable = field.child(`variables[${index}]`, ['name', 'description', 'defaultValue'], [], value)
    if (!variable) return []
    const name = variable.text('name')
    const problem = name ? variableNameError(name) : null
    if (problem) variable.fail(problem)
    else if (name && language === 'en' && !ENGLISH_VARIABLE.test(name)) variable.fail('英文变量名用 snake_case，例如 target_reader')
    return [{ name, description: variable.text('description'), defaultValue: variable.string('defaultValue') }]
  })
  checkPlaceholders(field, prompt, variables)
  return { title, summary, prompt, variables }
}

function parsePrompts(problems, data, categoryById) {
  const prompts = records(problems, 'prompts.json', data, PROMPT_FIELDS, ['example', 'source'], (field) => {
    const id = field.id()
    const target = field.text('target')
    if (target && !TARGETS.includes(target)) field.fail(`target 只能是 ${TARGETS.join(' / ')}：${target}`)
    const category = field.text('category')
    const owner = categoryById.get(category)
    if (category && !owner) field.fail(`分类 ${category} 不在 categories.json 里`)
    else if (owner?.kind && TARGET_KINDS[target] && owner.kind !== TARGET_KINDS[target]) {
      field.fail(`target ${target} 是 ${TARGET_KINDS[target]} 类，但分类 ${category} 是 ${owner.kind} 类`)
    }

    const tags = field.list('tags')
    if (field.isList('tags')) {
      if (tags.length < 2 || tags.length > 4) field.fail('tags 需要 2 到 4 个')
      else if (!tags.every((tag) => typeof tag === 'string' && tag.trim()) || new Set(tags).size !== tags.length) {
        field.fail('tags 不能为空或重复')
      }
    }

    const zh = parsePromptText(field, 'zh')
    const enField = field.has('en') ? field.child('en', TEXT_FIELDS) : null
    const en = enField ? parsePromptText(enField, 'en') : { title: '', summary: '', prompt: '', variables: [] }
    if (enField && en.variables.length !== zh.variables.length) {
      enField.fail(`变量数量与中文版不一致：中文 ${zh.variables.length} 个，英文 ${en.variables.length} 个`)
    }

    const prompt = {
      id,
      category,
      tags,
      target,
      locales: { zh, en },
      importCodes: Object.fromEntries(PROMPT_LANGUAGES.map((language) => [language, importCodeFor(id, language)]))
    }
    const example = field.optionalText('example')
    const source = parseSource(field)
    if (example) prompt.example = example
    if (source) prompt.source = source
    return prompt
  })

  const ids = prompts.map((p) => p.id)
  checkUnique(problems, 'prompts.json', 'id ', ids)
  checkUnique(problems, 'prompts.json', '中文标题', prompts.map((p) => p.locales.zh.title))
  checkUnique(problems, 'prompts.json', '英文标题', prompts.map((p) => p.locales.en.title))
  const idSet = new Set(ids)
  for (const id of idSet) {
    const englishCode = importCodeFor(id, 'en')
    if (idSet.has(englishCode)) problems.push(`prompts.json(${id})：英文导入码 ${englishCode} 和另一条提示词的 id 重复`)
  }
  return prompts
}

function parseLessons(problems, data) {
  const lessons = records(problems, 'learn.json', data, LESSON_FIELDS, [], (field) => {
    const sectionList = field.list('sections')
    if (field.isList('sections') && sectionList.length === 0) field.fail('sections 至少一节')
    const sections = sectionList.flatMap((value, index) => {
      const section = field.child(`sections[${index}]`, ['heading', 'body'], [], value)
      return section ? [{ heading: section.text('heading'), body: section.text('body') }] : []
    })
    const lesson = {
      id: field.id(),
      title: field.text('title'),
      summary: field.text('summary'),
      sections,
      before: field.text('before'),
      after: field.text('after'),
      exercise: field.text('exercise')
    }
    if (lesson.before && lesson.before === lesson.after) field.fail('before 和 after 相同')
    return lesson
  })
  checkUnique(problems, 'learn.json', 'id ', lessons.map((l) => l.id))
  checkUnique(problems, 'learn.json', '标题', lessons.map((l) => l.title))
  return lessons
}

/** @returns {Library} */
export function loadLibrary(dir) {
  const problems = []
  const read = (file) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    } catch (error) {
      problems.push(`${file}：无法读取或解析：${error.message}`)
      return []
    }
  }
  const categories = parseCategories(problems, read('categories.json'))
  const prompts = parsePrompts(problems, read('prompts.json'), new Map(categories.map((c) => [c.id, c])))
  const lessons = parseLessons(problems, read('learn.json'))
  if (problems.length > 0) throw new LibraryError(dir, problems)
  return { categories, prompts, lessons }
}

// 优化器按 prompt-garden.prompt.v1 读取，见 packages/ui/src/composables/app/useAppPromptGardenImport.ts 的 fetchPromptFromGarden。
export function toPromptSource(prompt, category, language) {
  const content = prompt.locales[language]
  const importCode = prompt.importCodes[language]
  return {
    schema: 'prompt-garden.prompt.v1',
    schemaVersion: 1,
    id: importCode,
    importCode,
    optimizerTarget: { subModeKey: prompt.target },
    prompt: { format: 'text', text: content.prompt },
    variables: content.variables,
    meta: {
      title: content.title,
      description: content.summary,
      tags: prompt.tags,
      categoryPath: [category.name],
      ...(prompt.source ? { source: prompt.source } : {})
    }
  }
}

// 网站构建时写到 api/public/prompt-source/<importCode> 的全部导入文件：每条提示词每种语言一个。
/** @param {Library} library */
export function promptSources(library) {
  const categoryById = new Map(library.categories.map((category) => [category.id, category]))
  return library.prompts.flatMap((prompt) =>
    PROMPT_LANGUAGES.map((language) => ({
      importCode: prompt.importCodes[language],
      data: toPromptSource(prompt, categoryById.get(prompt.category), language)
    }))
  )
}
