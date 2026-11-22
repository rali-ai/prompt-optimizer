// 学习：课程列表。
const library = require('../../utils/library.js')
const routes = require('../../utils/routes.js')
const i18n = require('../../../utils/i18n.js')

Page({
  data: {
    t: null,
    lessons: []
  },

  onLoad() {
    const t = i18n.t()
    const lang = i18n.lang()
    wx.setNavigationBarTitle({ title: t.learn.navTitle })
    this.setData({
      t,
      lessons: library.lessons().map((l) => library.localizeLesson(l, lang)).map((l) => ({ id: l.id, title: l.title, summary: l.summary }))
    })
  },

  onOpen(e) {
    routes.go('lesson', { id: e.currentTarget.dataset.id })
  }
})
