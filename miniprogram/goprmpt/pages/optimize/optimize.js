// 优化页：输入提示词 → 选优化方式和输出语言 → 调模型 → 看结果、复制、再优化。
// 外部打开时可预填：navigateTo 本页后在 eventChannel 上 emit('prefill', { input, mode, lang })；
// 历史页用 ?historyId= 打开。
const templates = require('../../utils/templates.js')
const llm = require('../../utils/llm.js')
const settings = require('../../utils/settings.js')
const history = require('../../utils/history.js')
const storage = require('../../utils/storage.js')
const routes = require('../../utils/routes.js')

const MODES = templates.MODE_OPTIONS

function modeDesc(id) {
  const mode = MODES.find((m) => m.id === id)
  return mode ? mode.desc : ''
}

const isMode = (id) => MODES.some((m) => m.id === id)
const isLang = (id) => templates.LANGUAGES.some((l) => l.id === id)

Page({
  data: {
    modes: MODES,
    languages: templates.LANGUAGES,
    ready: true,
    modeId: MODES[0].id,
    modeDesc: MODES[0].desc,
    lang: 'zh',
    input: '',
    // phase: 'idle' | 'optimizing' | 'iterating'
    phase: 'idle',
    error: '',
    errorKind: '',
    before: '',
    result: '',
    round: 0,
    view: 'after',
    showIterate: false,
    iterateInput: ''
  },

  onLoad(options) {
    this.applyPrefill(storage.get('prefs', {}))
    const record = options.historyId ? history.get(options.historyId) : null
    if (record) {
      this.applyPrefill({ input: record.input, mode: record.mode, lang: record.lang, result: record.output })
    }
    const channel = typeof this.getOpenerEventChannel === 'function' ? this.getOpenerEventChannel() : null
    if (channel && typeof channel.on === 'function') {
      channel.on('prefill', (prefill) => this.applyPrefill(prefill || {}))
    }
  },

  onShow() {
    this.setData({ ready: settings.isReady(settings.load()) })
  },

  // 预填来自其他页面或宿主小程序，这里逐项校验，不认识的值忽略。
  applyPrefill(prefill) {
    const patch = {}
    if (typeof prefill.input === 'string') patch.input = prefill.input
    if (isMode(prefill.mode)) {
      patch.modeId = prefill.mode
      patch.modeDesc = modeDesc(prefill.mode)
    }
    if (isLang(prefill.lang)) patch.lang = prefill.lang
    if (typeof prefill.result === 'string' && prefill.result) {
      Object.assign(patch, { before: patch.input || '', result: prefill.result, round: 1, view: 'after' })
    }
    this.setData(patch)
  },

  savePrefs() {
    storage.set('prefs', { mode: this.data.modeId, lang: this.data.lang })
  },

  onInput(e) {
    this.setData({ input: e.detail.value })
  },

  onClear() {
    this.setData({ input: '' })
  },

  onPickMode(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ modeId: id, modeDesc: modeDesc(id) })
    this.savePrefs()
  },

  onPickLang(e) {
    this.setData({ lang: e.currentTarget.dataset.id })
    this.savePrefs()
  },

  onOptimize() {
    const input = this.data.input.trim()
    if (!input) {
      wx.showToast({ title: '先输入要优化的提示词', icon: 'none' })
      return
    }
    const { modeId, lang } = this.data
    this.run('optimizing', templates.buildMessages(modeId, input, lang), { mode: modeId, lang, input })
  },

  onToggleIterate() {
    this.setData({ showIterate: !this.data.showIterate })
  },

  onIterateInput(e) {
    this.setData({ iterateInput: e.detail.value })
  },

  onIterate() {
    const { result, iterateInput, lang } = this.data
    this.run('iterating', templates.buildIterateMessages(result, iterateInput, lang), {
      mode: 'iterate',
      lang,
      input: result,
      iterateInput: iterateInput.trim()
    })
  },

  run(phase, messages, entry) {
    if (this.data.phase !== 'idle') return
    this.setData({ phase, error: '', errorKind: '' })
    llm.chat(settings.load(), messages)
      .then((output) => {
        history.add(Object.assign({ output }, entry))
        this.setData({
          phase: 'idle',
          before: entry.input,
          result: output,
          round: phase === 'iterating' ? this.data.round + 1 : 1,
          view: 'after',
          showIterate: false,
          iterateInput: ''
        })
        wx.pageScrollTo({ selector: '#result', duration: 200 })
      })
      .catch((error) => {
        this.setData({ phase: 'idle', error: error.message, errorKind: error.kind || '' })
      })
  },

  onSwitchView(e) {
    this.setData({ view: e.currentTarget.dataset.view })
  },

  onCopy() {
    wx.setClipboardData({ data: this.data.result })
  },

  onOpenHistory() {
    routes.go('history')
  },

  onOpenSettings() {
    routes.go('settings')
  }
})
