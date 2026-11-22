import fs from 'node:fs'
import path from 'node:path'

export const LIBRARY_FILES = ['categories.json', 'prompts.json', 'learn.json']
export const PROMPT_LANGUAGES = ['zh', 'en']

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PROMPT_TARGETS = new Set(['basic-user', 'basic-system', 'image-text2image'])
const PLACEHOLDER_PATTERN = /\{\{([^{}]*)\}\}/g

function importCodeFor(id, language) {
  return language === 'en' ? `${id}-en` : id
}

// Same rules as getVariableNameValidationError in packages/ui/src/types/variable.ts:
// the optimizer silently drops variables that fail them.
export function variableNameError(name) {
  if (!name) return '变量名为空'
  if (name.length > 50) return '变量名超过 50 个字符'
  if (/^[#/^!>&]/u.test(name)) return '变量名不能以 # / ^ ! > & 开头'
  if (/^\d/u.test(name)) return '变量名不能以数字开头'
  if (['__proto__', 'prototype', 'constructor'].includes(name)) return '变量名是保留字'
  if (!/^[^\s{}]+$/.test(name)) return '变量名不能包含空白或花括号'
  return null
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function fieldReader(errors, where, record) {
  const fail = (key, message) => errors.push(`${where}.${key}：${message}`)
  return {
    where,
    fail,
    text(key) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) return value
      fail(key, '必须是非空字符串')
      return ''
    },
    optionalText(key) {
      const value = record[key]
      if (value === undefined) return undefined
      if (typeof value === 'string') return value
      fail(key, '必须是字符串')
      return undefined
    },
    list(key) {
      const value = record[key]
      if (Array.isArray(value)) return value
      fail(key, '必须是数组')
      return []
    },
    id(key, seen) {
      const value = record[key]
      if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
        fail(key, '只能用小写字母、数字和连字符')
        return ''
      }
      if (seen.has(value)) fail(key, `重复的 id "${value}"`)
      seen.add(value)
      return value
    }
  }
}

function eachRecord(file, data, errors, parse) {
  if (!Array.isArray(data)) {
    errors.push(`${file}：顶层必须是数组`)
    return []
  }
  return data.map((record, index) => {
    const label = typeof record?.id === 'string' ? `${file}[${index}](${record.id})` : `${file}[${index}]`
    if (!isRecord(record)) {
      errors.push(`${label}：必须是对象`)
      return null
    }
    return parse(fieldReader(errors, label, record), record)
  }).filter(Boolean)
}

function parseCategories(data, errors) {
  const seen = new Set()
  return eachRecord('categories.json', data, errors, (field) => ({
    id: field.id('id', seen),
    name: field.text('name'),
    description: field.optionalText('description') ?? ''
  }))
}

function parseVariables(field, list) {
  const seen = new Set()
  return list.map((variable, index) => {
    const key = `variables[${index}]`
    if (!isRecord(variable)) {
      field.fail(key, '必须是对象')
      return null
    }
    const name = typeof variable.name === 'string' ? variable.name.trim() : ''
    const nameError = variableNameError(name)
    if (nameError) field.fail(`${key}.name`, nameError)
    if (seen.has(name)) field.fail(`${key}.name`, `重复的变量 "${name}"`)
    seen.add(name)
    for (const optional of ['description', 'defaultValue']) {
      if (variable[optional] !== undefined && typeof variable[optional] !== 'string') {
        field.fail(`${key}.${optional}`, '必须是字符串')
      }
    }
    return {
      name,
      description: typeof variable.description === 'string' ? variable.description : '',
      defaultValue: typeof variable.defaultValue === 'string' ? variable.defaultValue : ''
    }
  }).filter(Boolean)
}

function checkPlaceholders(field, prompt, variables) {
  const used = new Set()
  for (const [placeholder, inner] of prompt.matchAll(PLACEHOLDER_PATTERN)) {
    const name = inner.trim()
    const nameError = variableNameError(name)
    if (nameError) field.fail('prompt', `占位符 ${placeholder}：${nameError}`)
    else used.add(name)
  }
  const declared = new Set(variables.map((variable) => variable.name))
  for (const name of used) {
    if (!declared.has(name)) field.fail('variables', `prompt 用到了 {{${name}}}，但 variables 里没有列出`)
  }
  for (const name of declared) {
    if (!used.has(name)) field.fail('variables', `变量 "${name}" 在 prompt 里没有用到`)
  }
}

function parseLocalized(field) {
  const prompt = field.text('prompt')
  const variables = parseVariables(field, field.list('variables'))
  checkPlaceholders(field, prompt, variables)
  return {
    title: field.text('title'),
    summary: field.text('summary'),
    prompt,
    variables
  }
}

function parsePrompts(data, categoryIds, errors) {
  const seen = new Set()
  const prompts = eachRecord('prompts.json', data, errors, (field, record) => {
    const category = field.text('category')
    if (category && !categoryIds.has(category)) field.fail('category', `分类 "${category}" 不在 categories.json 里`)

    const target = field.text('target')
    if (target && !PROMPT_TARGETS.has(target)) field.fail('target', `只能是 ${[...PROMPT_TARGETS].join(' / ')}`)

    const tags = field.list('tags')
    if (tags.some((tag) => typeof tag !== 'string' || !tag.trim())) field.fail('tags', '每个标签都必须是非空字符串')

    const zh = parseLocalized(field)
    let en = null
    if (isRecord(record.en)) {
      en = parseLocalized(fieldReader(errors, `${field.where}.en`, record.en))
      if (en.variables.length !== zh.variables.length) {
        field.fail('en.variables', `英文版有 ${en.variables.length} 个变量，中文版有 ${zh.variables.length} 个`)
      }
    } else {
      field.fail('en', '缺少英文版（需要 title、summary、prompt、variables）')
    }

    const id = field.id('id', seen)
    const parsed = {
      id,
      category,
      tags,
      target,
      locales: { zh, en },
      importCodes: Object.fromEntries(PROMPT_LANGUAGES.map((language) => [language, importCodeFor(id, language)]))
    }
    const example = field.optionalText('example')
    const credit = field.optionalText('credit')
    if (example?.trim()) parsed.example = example
    if (credit?.trim()) parsed.credit = credit
    return parsed
  })

  for (const id of seen) {
    const englishCode = importCodeFor(id, 'en')
    if (seen.has(englishCode)) errors.push(`prompts.json(${id})：英文导入码 ${englishCode} 和另一条提示词的 id 重复`)
  }
  return prompts
}

function parseLessons(data, errors) {
  const seen = new Set()
  return eachRecord('learn.json', data, errors, (field) => {
    const sections = field.list('sections').map((section, index) => {
      if (!isRecord(section)) {
        field.fail(`sections[${index}]`, '必须是对象')
        return null
      }
      const sectionField = fieldReader(errors, `${field.where}.sections[${index}]`, section)
      return { heading: sectionField.text('heading'), body: sectionField.text('body') }
    }).filter(Boolean)

    const lesson = {
      id: field.id('id', seen),
      title: field.text('title'),
      summary: field.optionalText('summary') ?? '',
      sections
    }
    for (const key of ['before', 'after', 'exercise']) {
      const value = field.optionalText(key)
      if (value?.trim()) lesson[key] = value
    }
    return lesson
  })
}

function readJson(dir, file, errors) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
  } catch (error) {
    errors.push(`${file}：${error.message}`)
    return []
  }
}

export function loadLibrary(dir) {
  const errors = []
  const categories = parseCategories(readJson(dir, 'categories.json', errors), errors)
  const categoryIds = new Set(categories.map((category) => category.id))
  const prompts = parsePrompts(readJson(dir, 'prompts.json', errors), categoryIds, errors)
  const lessons = parseLessons(readJson(dir, 'learn.json', errors), errors)

  if (errors.length > 0) {
    throw new Error(`提示词库数据有 ${errors.length} 处错误（${dir}）：\n  - ${errors.join('\n  - ')}`)
  }
  return { categories, prompts, lessons }
}

// The optimizer reads this as prompt-garden.prompt.v1; see fetchPromptFromGarden in
// packages/ui/src/composables/app/useAppPromptGardenImport.ts.
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
      ...(prompt.credit ? { credit: prompt.credit } : {})
    }
  }
}
