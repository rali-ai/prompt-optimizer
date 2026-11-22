// 首页：品牌和功能入口，入口地址写在 index.wxml 的 data-url 上。
Page({
  onOpen(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url })
  }
})
