// 课程详情：正文、改写前后对比、练习。练习可带着「改写前」的提示词去优化页。
const library = require('../../utils/library.js')
const markdown = require('../../utils/markdown.js')
const routes = require('../../utils/routes.js')

Page({
  data: {
    missing: false,
    lesson: null,
    sections: []
  },

  onLoad(options) {
    const lesson = library.getLesson(options.id)
    if (!lesson) {
      this.setData({ missing: true })
      return
    }
    wx.setNavigationBarTitle({ title: lesson.title })
    this.setData({
      lesson,
      sections: lesson.sections.map((s) => ({ heading: s.heading, blocks: markdown.toBlocks(s.body) }))
    })
  },

  onPractice() {
    routes.openOptimizer({ input: this.data.lesson.before, mode: 'general', lang: 'zh' })
  }
})
