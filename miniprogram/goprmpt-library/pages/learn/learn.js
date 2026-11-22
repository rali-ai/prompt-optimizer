// 学习：课程列表。
const library = require('../../utils/library.js')
const routes = require('../../utils/routes.js')

Page({
  data: {
    lessons: library.lessons().map((l) => ({ id: l.id, title: l.title, summary: l.summary }))
  },

  onOpen(e) {
    routes.go('lesson', { id: e.currentTarget.dataset.id })
  }
})
