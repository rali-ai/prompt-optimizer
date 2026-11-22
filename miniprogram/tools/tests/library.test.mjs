import test from 'node:test'
import assert from 'node:assert/strict'
import { requireMp } from './wx-mock.mjs'

const schema = requireMp('./goprmpt-library/utils/schema.js')
const library = requireMp('./goprmpt-library/utils/library.js')
const markdown = requireMp('./goprmpt-library/utils/markdown.js')
const libraryRoutes = requireMp('./goprmpt-library/utils/routes.js')
const liteI18n = requireMp('./goprmpt-lite/utils/i18n.js')

test('extractVariables lists each {{variable}} once, in order', () => {
  assert.deepEqual(schema.extractVariables('{{甲}} 和 {{ 乙 }}，再说一次 {{甲}}'), ['甲', '乙'])
  assert.deepEqual(schema.extractVariables('没有变量'), [])
})

test('fillVariables replaces filled values and keeps blanks as placeholders', () => {
  const text = '主题：{{主题}}\n语气：{{ 语气 }}\n再提主题：{{主题}}'
  assert.equal(
    schema.fillVariables(text, { 主题: '春天', 语气: '  ' }),
    '主题：春天\n语气：{{ 语气 }}\n再提主题：春天'
  )
})

test('fillVariables inserts values literally', () => {
  assert.equal(schema.fillVariables('值：{{x}}', { x: '$& $1 {{y}}' }), '值：$& $1 {{y}}')
})

test('every library target preselects a mode that the optimizer offers', () => {
  const modeIds = liteI18n.MODE_IDS
  for (const [target, info] of Object.entries(schema.TARGETS)) {
    assert.ok(modeIds.includes(info.mode), target + ' -> ' + info.mode)
  }
  assert.equal(schema.TARGETS['image-text2image'].mode, 'image')
})

const english = {
  title: 'Weekly report',
  summary: 'Summarize the week',
  prompt: 'Notes: {{notes}}',
  variables: [{ name: 'notes', description: 'one per line', defaultValue: '' }]
}
const prompts = [
  { id: 'a', title: '周报生成器', summary: '整理周报', prompt: '写周报 {{记录}}', variables: [{ name: '记录', description: '', defaultValue: '' }], tags: ['职场'], category: 'writing', target: 'basic-user', en: english },
  { id: 'b', title: '客服人设', summary: '系统提示词', prompt: '你是客服', variables: [], tags: [], category: 'work', target: 'basic-system', en: null },
  { id: 'c', title: '水彩风景', summary: '画一幅画', prompt: '水彩画', variables: [], tags: ['绘画'], category: 'writing', target: 'image-text2image', en: null }
]

test('localize picks the chosen language and falls back to Chinese when English is missing', () => {
  const zh = library.localize(prompts[0], 'zh')
  assert.equal(zh.lang, 'zh')
  assert.equal(zh.title, '周报生成器')
  assert.deepEqual(zh.variables.map((v) => v.name), ['记录'])

  const en = library.localize(prompts[0], 'en')
  assert.equal(en.lang, 'en')
  assert.equal(en.prompt, 'Notes: {{notes}}')
  assert.deepEqual(en.variables.map((v) => v.name), ['notes'])

  const fallback = library.localize(prompts[1], 'en')
  assert.equal(fallback.lang, 'zh')
  assert.equal(fallback.title, '客服人设')
})

test('search filters by kind, category and query in the chosen language', () => {
  const ids = (filter) => library.search(filter, prompts).map((p) => p.id)
  assert.deepEqual(ids({}), ['a', 'b', 'c'])
  assert.deepEqual(ids({ kind: 'text' }), ['a', 'b'])
  assert.deepEqual(ids({ kind: 'image' }), ['c'])
  assert.deepEqual(ids({ categoryId: 'writing' }), ['a', 'c'])
  assert.deepEqual(ids({ query: '职场' }), ['a'])
  assert.deepEqual(ids({ query: '  画 ' }), ['c'])
  assert.deepEqual(ids({ query: 'weekly', lang: 'en' }), ['a'])
  assert.deepEqual(ids({ query: 'weekly', lang: 'zh' }), [])
  assert.deepEqual(ids({ query: '客服', lang: 'en' }), ['b'], 'English view searches the Chinese fallback')
  assert.deepEqual(ids({ kind: 'text', categoryId: 'writing', query: '周报' }), ['a'])
})

test('the generated library loads and its prompts resolve by id', () => {
  const all = library.search({})
  assert.ok(all.length > 0)
  for (const p of all) {
    assert.equal(library.getPrompt(p.id), p)
    assert.ok(library.categoryName(p.category, 'zh'), p.id + ' has a category name')
    assert.ok(library.categoryName(p.category, 'en'), p.id + ' has a category name in the English view')
  }
  assert.equal(library.getPrompt('missing'), null)
})

test('markdown turns lesson bodies into display blocks', () => {
  const blocks = markdown.toBlocks('## 要点\n\n先说**目标**，再说`约束`。\n第二行\n\n- 一\n1. 二\n> 引用\n\n```\ncode {{x}}\n```')
  assert.deepEqual(blocks, [
    { type: 'h', text: '要点' },
    { type: 'p', text: '先说目标，再说约束。\n第二行' },
    { type: 'li', text: '• 一' },
    { type: 'li', text: '1. 二' },
    { type: 'quote', text: '引用' },
    { type: 'code', text: 'code {{x}}' }
  ])
})

test('categoryName uses the English name when the data has one', () => {
  // 生成数据里的分类目前只有中文名；英文界面退回中文名，数据补上 en.name 后自动用英文。
  const first = library.categories()[0]
  const expected = first.en && first.en.name ? first.en.name : first.name
  assert.equal(library.categoryName(first.id, 'en'), expected)
  assert.equal(library.categoryName(first.id, 'zh'), first.name)
  assert.equal(library.categoryName('missing', 'zh'), '')
})

test('localizeLesson switches to the English version only when there is one', () => {
  const lesson = { id: 'l1', title: '第 1 课', sections: [], en: { title: 'Lesson 1', sections: [] } }
  assert.equal(library.localizeLesson(lesson, 'en').title, 'Lesson 1')
  assert.equal(library.localizeLesson(lesson, 'en').id, 'l1')
  assert.equal(library.localizeLesson(lesson, 'zh').title, '第 1 课')
  assert.equal(library.localizeLesson({ id: 'l2', title: '只有中文', sections: [] }, 'en').title, '只有中文')
})

test('the library opens the optimizer in the lite package', () => {
  assert.equal(libraryRoutes.OPTIMIZER_PAGE, '/goprmpt-lite/pages/optimize/optimize')
})

test('library routes stay under /goprmpt-library/ and encode query values', () => {
  for (const path of Object.values(libraryRoutes.ROUTES)) {
    assert.ok(path.startsWith('/goprmpt-library/pages/'), path)
  }
  assert.equal(libraryRoutes.url('prompt', { id: 'a b&c' }), '/goprmpt-library/pages/prompt/prompt?id=a%20b%26c')
  assert.throws(() => libraryRoutes.url('nope'))
})
