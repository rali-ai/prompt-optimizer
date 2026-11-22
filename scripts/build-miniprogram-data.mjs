// 校验 library/*.json，生成小程序提示词库分包用的 miniprogram/goprmpt-library/data/library.js。
// 用法：pnpm miniprogram:data。数据格式见 library/README.md。
// 有任何错误时列出全部错误并以非零状态退出；生成文件是否最新由 build-miniprogram-data.test.mjs 检查。
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { toComparableFileUrl } from './direct-execution.mjs'

const require = createRequire(import.meta.url)
const { ID_PATTERN, TARGETS, extractVariables } = require('../miniprogram/goprmpt-library/utils/schema.js')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DIR = path.join(ROOT, 'library')
const OUTPUT = path.join(ROOT, 'miniprogram', 'goprmpt-library', 'data', 'library.js')
const HEADER = '// 由 scripts/build-miniprogram-data.mjs 从 library/*.json 生成，请勿手改。\n' +
  '// 改数据后运行：pnpm miniprogram:data\n'

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// raw: { categories, prompts, learn }，即三个 JSON 文件解析后的值。
// 返回 { errors, data, missingEnglish }。data 只含 README 定义的字段，可选字段补上默认值，
// 没有英文版的提示词 en 为 null；missingEnglish 列出这些提示词的 id。
export function buildLibrary(raw) {
  const errors = []
  const fail = (where, message) => errors.push(where + '：' + message)

  const text = (where, item, key, required) => {
    const value = item[key]
    if (value === undefined || value === null) {
      if (required) fail(where, '缺少 ' + key)
      return ''
    }
    if (typeof value !== 'string') {
      fail(where, key + ' 必须是字符串')
      return ''
    }
    if (required && !value.trim()) fail(where, key + ' 不能为空')
    return value
  }

  const array = (where, value, required) => {
    if (value === undefined && !required) return []
    if (!Array.isArray(value)) {
      fail(where, '必须是数组')
      return []
    }
    return value
  }

  const objects = (where, value, required) =>
    array(where, value, required).filter((item, index) => {
      if (isObject(item)) return true
      fail(where + '[' + index + ']', '必须是对象')
      return false
    })

  const checkId = (where, id, seen) => {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      fail(where, 'id「' + id + '」不合法，只能用小写字母、数字和连字符')
    } else if (seen.has(id)) {
      fail(where, 'id「' + id + '」重复')
    }
    seen.add(id)
    return id
  }

  const label = (file, item, index) =>
    file + (typeof item.id === 'string' && item.id ? '「' + item.id + '」' : '[' + index + ']')

  // 一种语言的提示词正文和变量：变量要一一对应，用到的都声明，声明的都用到。
  const promptBody = (where, item) => {
    const declared = new Set()
    const variables = objects(where + ' variables', item.variables, false).map((variable, index) => {
      const vWhere = where + ' variables[' + index + ']'
      const name = text(vWhere, variable, 'name', true)
      if (declared.has(name)) fail(vWhere, '变量「' + name + '」重复声明')
      declared.add(name)
      return {
        name,
        description: text(vWhere, variable, 'description', false),
        defaultValue: text(vWhere, variable, 'defaultValue', false)
      }
    })
    const prompt = text(where, item, 'prompt', true)
    const used = extractVariables(prompt)
    for (const name of used) {
      if (!declared.has(name)) fail(where, 'prompt 用了变量「' + name + '」，但 variables 里没有声明')
    }
    for (const name of declared) {
      if (!used.includes(name)) fail(where, 'variables 声明了「' + name + '」，但 prompt 里没有用到')
    }
    return {
      title: text(where, item, 'title', true),
      summary: text(where, item, 'summary', true),
      prompt,
      variables
    }
  }

  const categoryIds = new Set()
  const categories = objects('categories.json', raw.categories, true).map((item, index) => {
    const where = label('categories.json', item, index)
    return {
      id: checkId(where, item.id, categoryIds),
      name: text(where, item, 'name', true),
      description: text(where, item, 'description', false)
    }
  })

  const missingEnglish = []
  const promptIds = new Set()
  const prompts = objects('prompts.json', raw.prompts, true).map((item, index) => {
    const where = label('prompts.json', item, index)
    const id = checkId(where, item.id, promptIds)
    if (typeof item.category !== 'string' || !categoryIds.has(item.category)) {
      fail(where, '分类「' + item.category + '」不在 categories.json 里')
    }
    if (!Object.prototype.hasOwnProperty.call(TARGETS, item.target)) {
      fail(where, 'target「' + item.target + '」不合法，可选：' + Object.keys(TARGETS).join(' / '))
    }
    const tags = array(where + ' tags', item.tags, false).filter((tag) => {
      if (typeof tag === 'string' && tag.trim()) return true
      fail(where, 'tags 里只能放非空字符串')
      return false
    })

    let en = null
    if (item.en === undefined) {
      missingEnglish.push(id)
    } else if (!isObject(item.en)) {
      fail(where, 'en 必须是对象')
    } else {
      en = promptBody(where + ' en', item.en)
    }

    return Object.assign({ id }, promptBody(where, item), {
      category: item.category,
      tags,
      target: item.target,
      example: text(where, item, 'example', false),
      credit: text(where, item, 'credit', false),
      en
    })
  })

  const lessonIds = new Set()
  const learn = objects('learn.json', raw.learn, true).map((item, index) => {
    const where = label('learn.json', item, index)
    const sections = objects(where + ' sections', item.sections, true).map((section, sIndex) => {
      const sWhere = where + ' sections[' + sIndex + ']'
      return { heading: text(sWhere, section, 'heading', true), body: text(sWhere, section, 'body', true) }
    })
    return {
      id: checkId(where, item.id, lessonIds),
      title: text(where, item, 'title', true),
      summary: text(where, item, 'summary', false),
      sections,
      before: text(where, item, 'before', false),
      after: text(where, item, 'after', false),
      exercise: text(where, item, 'exercise', false)
    }
  })

  return { errors, data: { categories, prompts, learn }, missingEnglish }
}

export function render(data) {
  return HEADER + 'module.exports = ' + JSON.stringify(data, null, 2) + '\n'
}

export function readSources(dir) {
  const raw = {}
  for (const name of ['categories', 'prompts', 'learn']) {
    try {
      raw[name] = JSON.parse(fs.readFileSync(path.join(dir, name + '.json'), 'utf8'))
    } catch (error) {
      throw new Error(name + '.json 无法读取或不是合法 JSON（' + error.message + '）')
    }
  }
  return raw
}

function main() {
  let built
  try {
    built = buildLibrary(readSources(SOURCE_DIR))
  } catch (error) {
    built = { errors: [error.message] }
  }
  if (built.errors.length) {
    console.error('library 数据有 ' + built.errors.length + ' 处错误：')
    for (const error of built.errors) console.error('  - ' + error)
    process.exit(1)
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
  fs.writeFileSync(OUTPUT, render(built.data))
  const { categories, prompts, learn } = built.data
  const relative = path.relative(ROOT, OUTPUT).replace(/\\/g, '/')
  console.log('已生成 ' + relative + '：' + categories.length + ' 个分类，' + prompts.length + ' 条提示词，' + learn.length + ' 课')
  if (built.missingEnglish.length) {
    console.warn('提示：' + built.missingEnglish.length + ' 条提示词还没有英文版（en），英文视图会显示中文：' + built.missingEnglish.join(', '))
  }
}

if (import.meta.url === toComparableFileUrl(process.argv[1])) {
  main()
}
