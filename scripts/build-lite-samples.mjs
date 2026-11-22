// 从提示词库生成简版的示例提示词 miniprogram/goprmpt-lite/data/samples.js。
// 输入是 scripts/build-miniprogram-data.mjs 产出并校验过的 miniprogram/goprmpt-library/data/library.js，
// 所以要先跑它；pnpm miniprogram:data 会按顺序跑两个脚本。
// 规则：只取 writing、office、translate 三个分类里 target 为 basic-user 且有英文版的条目，
// 三类轮流各取一条，最多 20 条。简版只需要标题和提示词正文。
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LIBRARY = path.join(ROOT, 'miniprogram', 'goprmpt-library', 'data', 'library.js')
export const OUTPUT = path.join(ROOT, 'miniprogram', 'goprmpt-lite', 'data', 'samples.js')
export const CATEGORIES = ['writing', 'office', 'translate']
export const LIMIT = 20

// library: { prompts: [...] } → [{ id, category, zh: { title, prompt }, en: { title, prompt } }]
export function pickSamples(library) {
  const queues = CATEGORIES.map((category) =>
    library.prompts.filter((p) => p.category === category && p.target === 'basic-user' && p.en)
  )
  const picked = []
  while (picked.length < LIMIT && queues.some((q) => q.length)) {
    for (const queue of queues) {
      if (queue.length && picked.length < LIMIT) picked.push(queue.shift())
    }
  }
  return picked.map((p) => ({
    id: p.id,
    category: p.category,
    zh: { title: p.title, prompt: p.prompt },
    en: { title: p.en.title, prompt: p.en.prompt }
  }))
}

export function render(samples) {
  return '// 由 scripts/build-lite-samples.mjs 从提示词库生成，请勿手改。改数据后运行：pnpm miniprogram:data\n' +
    'module.exports = ' + JSON.stringify(samples, null, 2) + '\n'
}

export function build() {
  const library = createRequire(import.meta.url)(LIBRARY)
  return render(pickSamples(library))
}

const self = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === self.toLowerCase()) {
  const text = build()
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
  fs.writeFileSync(OUTPUT, text)
  const count = (text.match(/"category"/g) || []).length
  console.log('已生成 ' + path.relative(ROOT, OUTPUT).replace(/\\/g, '/') + '：' + count + ' 条示例')
}
