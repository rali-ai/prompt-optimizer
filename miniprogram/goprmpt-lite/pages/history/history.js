// 历史页：本机的优化记录，可复用、复制结果、删除、清空。
const history = require('../../utils/history.js')
const i18n = require('../../utils/i18n.js')
const routes = require('../../utils/routes.js')

Page({
  data: {
    t: null,
    records: []
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const t = i18n.t()
    const now = Date.now()
    const lang = i18n.lang()
    wx.setNavigationBarTitle({ title: t.history.navTitle })
    this.setData({
      t,
      records: history.list().map((r) => ({
        id: r.id,
        time: history.formatTime(r.createdAt, now, lang),
        modeName: (t.modes[r.mode] || { name: r.mode }).name,
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
    const t = this.data.t
    wx.showModal({
      title: t.history.deleteTitle,
      confirmText: t.history.delete,
      confirmColor: '#c4382f',
      success: (res) => {
        if (!res.confirm) return
        history.remove(id)
        this.refresh()
      }
    })
  },

  onClearAll() {
    const t = this.data.t
    wx.showModal({
      title: t.history.clearTitle,
      content: t.history.clearContent,
      confirmText: t.history.clear,
      confirmColor: '#c4382f',
      success: (res) => {
        if (!res.confirm) return
        history.clear()
        this.refresh()
      }
    })
  }
})
