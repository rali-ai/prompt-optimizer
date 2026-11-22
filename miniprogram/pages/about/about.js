// 关于页（完整版专属）：产品说明、AI 生成内容说明、数据与隐私。
const i18n = require('../../utils/i18n.js')

Page({
  data: {
    t: null
  },

  onShow() {
    const t = i18n.t()
    wx.setNavigationBarTitle({ title: t.about.navTitle })
    this.setData({ t })
  }
})
