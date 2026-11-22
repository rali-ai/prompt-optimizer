// 提示词库列表：搜索、文字/图片、中文/English、分类筛选。
const library = require('../../utils/library.js')
const schema = require('../../utils/schema.js')
const routes = require('../../utils/routes.js')

Page({
  data: {
    kinds: library.KINDS,
    languages: library.LANGUAGES,
    categories: [{ id: '', name: '全部' }].concat(library.categories().map((c) => ({ id: c.id, name: c.name }))),
    query: '',
    kind: '',
    lang: 'zh',
    categoryId: '',
    items: []
  },

  onLoad() {
    this.refresh()
  },

  refresh() {
    const { query, kind, lang, categoryId } = this.data
    const items = library.search({ query, kind, lang, categoryId }).map((item) => {
      const text = library.localize(item, lang)
      return {
        id: item.id,
        title: text.title,
        summary: text.summary,
        tags: item.tags,
        targetLabel: schema.TARGETS[item.target].label,
        fallback: text.lang !== lang
      }
    })
    this.setData({ items })
  },

  onSearch(e) {
    this.setData({ query: e.detail.value })
    this.refresh()
  },

  onPickKind(e) {
    this.setData({ kind: e.currentTarget.dataset.id })
    this.refresh()
  },

  onPickLang(e) {
    this.setData({ lang: e.currentTarget.dataset.id })
    this.refresh()
  },

  onPickCategory(e) {
    this.setData({ categoryId: e.currentTarget.dataset.id })
    this.refresh()
  },

  onOpen(e) {
    routes.go('prompt', { id: e.currentTarget.dataset.id, lang: this.data.lang })
  }
})
