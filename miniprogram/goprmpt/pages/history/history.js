// 历史页：本机的优化记录，可复用、复制结果、删除、清空。
const history = require('../../utils/history.js')
const templates = require('../../utils/templates.js')
const routes = require('../../utils/routes.js')

Page({
  data: {
    records: []
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const now = Date.now()
    this.setData({
      records: history.list().map((r) => ({
        id: r.id,
        time: history.formatTime(r.createdAt, now),
        modeName: templates.modeName(r.mode),
        langName: r.lang === 'en' ? 'English' : '中文',
        input: r.input,
        output: r.output,
        iterateInput: r.iterateInput
      }))
    })
  },

  onReuse(e) {
    routes.go('optimize', { historyId: e.currentTarget.dataset.id })
  },

  onCopy(e) {
    const record = history.get(e.currentTarget.dataset.id)
    if (record) wx.setClipboardData({ data: record.output })
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除这条记录？',
      confirmText: '删除',
      confirmColor: '#c4382f',
      success: (res) => {
        if (!res.confirm) return
        history.remove(id)
        this.refresh()
      }
    })
  },

  onClearAll() {
    wx.showModal({
      title: '清空全部历史？',
      content: '清空后无法恢复。',
      confirmText: '清空',
      confirmColor: '#c4382f',
      success: (res) => {
        if (!res.confirm) return
        history.clear()
        this.refresh()
      }
    })
  }
})
