// 设置页：选平台预设或自定义 OpenAI 兼容接口，填 API Key 和模型名，测试连接。
const settings = require('../../utils/settings.js')
const llm = require('../../utils/llm.js')

Page({
  data: {
    providers: settings.PROVIDERS,
    providerId: '',
    baseUrl: '',
    apiKey: '',
    model: '',
    showKey: false,
    testing: false,
    testOk: false,
    testMessage: ''
  },

  onLoad() {
    this.setData(settings.load())
  },

  onPickProvider(e) {
    const provider = settings.getProvider(e.currentTarget.dataset.id)
    const patch = { providerId: provider.id, testMessage: '' }
    if (provider.id !== 'custom') {
      patch.baseUrl = provider.baseUrl
      patch.model = provider.model
    }
    this.setData(patch)
  },

  onBaseUrl(e) {
    this.setData({ baseUrl: e.detail.value, testMessage: '' })
  },

  onApiKey(e) {
    this.setData({ apiKey: e.detail.value, testMessage: '' })
  },

  onModel(e) {
    this.setData({ model: e.detail.value, testMessage: '' })
  },

  onToggleKey() {
    this.setData({ showKey: !this.data.showKey })
  },

  onSave() {
    settings.save(this.data)
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  // 用表单里当前的值测试；通过就顺手保存。
  onTest() {
    if (this.data.testing) return
    const form = settings.normalize(this.data)
    this.setData({ testing: true, testMessage: '' })
    llm.testConnection(form)
      .then(() => {
        settings.save(form)
        this.setData({ testing: false, testOk: true, testMessage: '连接成功，设置已保存。' })
      })
      .catch((error) => {
        this.setData({ testing: false, testOk: false, testMessage: error.message })
      })
  }
})
