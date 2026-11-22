// 首页：品牌和功能入口，入口地址写在 index.wxml 的 data-url 上。
const i18n = require('../../utils/i18n.js')

Page({
  data: {
    t: null
  },

  onShow() {
    this.setData({ t: i18n.t() })
  },

  onOpen(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url })
  }
})
