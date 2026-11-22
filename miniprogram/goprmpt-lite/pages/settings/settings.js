// 设置页：界面语言（跟随系统 / 中文 / English）和使用说明。
const i18n = require('../../utils/i18n.js')

Page({
  data: {
    t: null,
    preference: 'auto',
    options: []
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const t = i18n.t()
    wx.setNavigationBarTitle({ title: t.settings.navTitle })
    this.setData({
      t,
      preference: i18n.preference(),
      options: [{ id: 'auto', name: t.settings.auto }].concat(t.languages)
    })
  },

  onPickLang(e) {
    i18n.setPreference(e.currentTarget.dataset.id)
    this.refresh()
  }
})
