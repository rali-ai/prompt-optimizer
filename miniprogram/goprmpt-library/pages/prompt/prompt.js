// 提示词详情：按所选语言显示，填变量得到最终提示词，可复制或带去优化页。
const library = require('../../utils/library.js')
const schema = require('../../utils/schema.js')
const routes = require('../../utils/routes.js')
const i18n = require('../../../utils/i18n.js')

Page({
  data: {
    t: null,
    missing: false,
    languages: library.LANGUAGES,
    lang: 'zh',
    textLang: 'zh',
    title: '',
    summary: '',
    categoryName: '',
    targetLabel: '',
    tags: [],
    credit: '',
    example: '',
    fields: [],
    final: ''
  },

  onLoad(options) {
    const t = i18n.t()
    wx.setNavigationBarTitle({ title: t.prompt.navTitle })
    this.setData({ t })
    const lang = options.lang === 'en' || options.lang === 'zh' ? options.lang : i18n.lang()
    const item = library.getPrompt(options.id)
    if (!item) {
      this.setData({ missing: true })
      return
    }
    this.item = item
    this.setData({
      categoryName: library.categoryName(item.category, i18n.lang()),
      targetLabel: t.targets[item.target] || schema.TARGETS[item.target].label,
      tags: item.tags,
      credit: item.credit,
      example: item.example
    })
    this.show(lang)
  },

  // lang 是用户选的语言；没有英文版时 textLang 会是 'zh'。
  show(lang) {
    const text = library.localize(this.item, lang)
    this.promptText = text.prompt
    const fields = text.variables.map((v) => ({ name: v.name, description: v.description, value: v.defaultValue }))
    this.setData({ lang, textLang: text.lang, title: text.title, summary: text.summary, fields })
    this.setData({ final: this.render() })
  },

  render() {
    const values = {}
    this.data.fields.forEach((field) => {
      values[field.name] = field.value
    })
    return schema.fillVariables(this.promptText, values)
  },

  onPickLang(e) {
    this.show(e.currentTarget.dataset.id)
  },

  onField(e) {
    this.setData({ ['fields[' + e.currentTarget.dataset.index + '].value']: e.detail.value })
    this.setData({ final: this.render() })
  },

  onCopy() {
    wx.setClipboardData({ data: this.data.final })
  },

  onOptimize() {
    routes.openOptimizer({
      input: this.data.final,
      mode: schema.TARGETS[this.item.target].mode,
      lang: this.data.textLang
    })
  }
})
