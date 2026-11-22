// 提示词库与学习教程的读取、按语言取文案和搜索。
// 数据由 scripts/build-miniprogram-data.mjs 生成，形状已校验过：每条提示词都有 en 字段（没有英文版时为 null）。
const data = require('../data/library.js')
const schema = require('./schema.js')

// 文字 / 图片筛选，'' 表示全部；名称在外壳 utils/i18n.js 的 library.kinds 里。
const KIND_IDS = ['', 'text', 'image']

const LANGUAGES = [
  { id: 'zh', name: '中文' },
  { id: 'en', name: 'English' }
]

function categories() {
  return data.categories
}

// 分类名：英文界面优先用 en.name，数据里还没有英文名时用中文名。
function categoryName(id, lang) {
  const category = data.categories.find((c) => c.id === id)
  if (!category) return ''
  return lang === 'en' && category.en && category.en.name ? category.en.name : category.name
}

function getPrompt(id) {
  return data.prompts.find((p) => p.id === id) || null
}

// 取某种语言的文案：{ lang, title, summary, prompt, variables }。
// 要英文但这条没有英文版时退回中文，lang 标明实际用的语言。
function localize(item, lang) {
  if (lang === 'en' && item.en) {
    return { lang: 'en', title: item.en.title, summary: item.en.summary, prompt: item.en.prompt, variables: item.en.variables }
  }
  return { lang: 'zh', title: item.title, summary: item.summary, prompt: item.prompt, variables: item.variables }
}

function lessons() {
  return data.learn
}

function getLesson(id) {
  return data.learn.find((l) => l.id === id) || null
}

// 课程的某种语言版本：有 en 且要英文时用 en（字段同中文版），否则用中文版。
function localizeLesson(lesson, lang) {
  return lang === 'en' && lesson.en ? Object.assign({ id: lesson.id }, lesson.en) : lesson
}

// filter: { query, categoryId, kind, lang }，空值表示不过滤；搜索按 lang 对应的文案和标签。
// prompts 默认是整个库。
function search(filter, prompts) {
  const list = prompts || data.prompts
  const query = String(filter.query || '').trim().toLowerCase()
  return list.filter((item) => {
    if (filter.categoryId && item.category !== filter.categoryId) return false
    if (filter.kind && schema.TARGETS[item.target].kind !== filter.kind) return false
    if (!query) return true
    const text = localize(item, filter.lang)
    return [text.title, text.summary, text.prompt].concat(item.tags)
      .some((field) => field.toLowerCase().indexOf(query) !== -1)
  })
}

module.exports = { KIND_IDS, LANGUAGES, categories, categoryName, getPrompt, localize, lessons, getLesson, localizeLesson, search }
