// 用 library/schema.mjs 读取并校验 library/*.json，生成小程序提示词库分包用的 miniprogram/goprmpt-library/data/library.js。
// 用法：pnpm miniprogram:data。数据格式见 library/README.md。
// 数据有错时列出全部错误并以非零状态退出；生成文件是否最新由 build-miniprogram-data.test.mjs 检查。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { LibraryError, loadLibrary } from '../library/schema.mjs'
import { toComparableFileUrl } from './direct-execution.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DIR = path.join(ROOT, 'library')
const OUTPUT = path.join(ROOT, 'miniprogram', 'goprmpt-library', 'data', 'library.js')
const HEADER = '// 由 scripts/build-miniprogram-data.mjs 从 library/*.json 生成，请勿手改。\n' +
  '// 改数据后运行：pnpm miniprogram:data\n'

const creditLine = ({ name, license }) => '来源：' + name + (license ? ' · ' + license : '')

// 小程序运行时读的形状：中文字段平铺，英文版放在 en（分类没有英文版时为 null），可选文本缺省为 ''。
// 小程序里不能点外链，source 压成一行署名文字放在 credit。
export function toMiniprogramData({ categories, prompts, lessons }) {
  return {
    categories: categories.map(({ id, name, description, en }) => ({ id, name, description, en: en ?? null })),
    prompts: prompts.map((prompt) => ({
      id: prompt.id,
      ...prompt.locales.zh,
      category: prompt.category,
      tags: prompt.tags,
      target: prompt.target,
      example: prompt.example ?? '',
      credit: prompt.source ? creditLine(prompt.source) : '',
      en: prompt.locales.en
    })),
    learn: lessons.map(({ id, title, summary, sections, before, after, exercise }) =>
      ({ id, title, summary, sections, before, after, exercise }))
  }
}

export function render(data) {
  return HEADER + 'module.exports = ' + JSON.stringify(data, null, 2) + '\n'
}

function main() {
  let library
  try {
    library = loadLibrary(SOURCE_DIR)
  } catch (error) {
    if (!(error instanceof LibraryError)) throw error
    console.error(error.message)
    process.exit(1)
  }
  const data = toMiniprogramData(library)
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
  fs.writeFileSync(OUTPUT, render(data))
  const relative = path.relative(ROOT, OUTPUT).replace(/\\/g, '/')
  console.log('已生成 ' + relative + '：' + data.categories.length + ' 个分类，' + data.prompts.length + ' 条提示词，' + data.learn.length + ' 课')
}

if (import.meta.url === toComparableFileUrl(process.argv[1])) {
  main()
}
