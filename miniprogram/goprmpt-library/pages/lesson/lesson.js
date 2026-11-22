// 课程详情：正文、改写前后对比、练习。练习可带着「改写前」的提示词去优化页。
const library = require('../../utils/library.js')
const markdown = require('../../utils/markdown.js')
const routes = require('../../utils/routes.js')
const i18n = require('../../../utils/i18n.js')

Page({
  data: {
    t: null,
    missing: false,
    lesson: null,
    sections: []
  },

  onLoad(options) {
    const t = i18n.t()
    this.setData({ t })
    const found = library.getLesson(options.id)
    if (!found) {
      this.setData({ missing: true })
      return
    }
    const lesson = library.localizeLesson(found, i18n.lang())
    wx.setNavigationBarTitle({ title: lesson.title })
    this.setData({
      lesson,
      sections: lesson.sections.map((s) => ({ heading: s.heading, blocks: markdown.toBlocks(s.body) }))
    })
  },

  onPractice() {
    routes.openOptimizer({ input: this.data.lesson.before, mode: 'general', lang: i18n.lang() })
  }
})
