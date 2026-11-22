// 提示词库列表：搜索、文字/图片、中文/English、分类筛选。内容语言默认跟界面语言一致。
const library = require('../../utils/library.js')
const schema = require('../../utils/schema.js')
const routes = require('../../utils/routes.js')
const i18n = require('../../../utils/i18n.js')

Page({
  data: {
    t: null,
    kinds: [],
    languages: library.LANGUAGES,
    categories: [],
    query: '',
    kind: '',
    lang: 'zh',
    categoryId: '',
    items: []
  },

  onLoad() {
    const t = i18n.t()
    const lang = i18n.lang()
    wx.setNavigationBarTitle({ title: t.library.navTitle })
    this.setData({
      t,
      lang,
      kinds: library.KIND_IDS.map((id) => ({ id, name: t.library.kinds[id] })),
      categories: [{ id: '', name: t.library.all }].concat(library.categories().map((c) => ({ id: c.id, name: library.categoryName(c.id, lang) })))
    })
    this.refresh()
  },

  refresh() {
    const { t, query, kind, lang, categoryId } = this.data
    const items = library.search({ query, kind, lang, categoryId }).map((item) => {
      const text = library.localize(item, lang)
      return {
        id: item.id,
        title: text.title,
        summary: text.summary,
        tags: item.tags,
        targetLabel: t.targets[item.target] || schema.TARGETS[item.target].label,
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
