// 优化页：输入提示词（或选一条示例）→ 选优化方式和输出语言 → 请求 mp-server → 看结果、复制、再优化。
// 外部打开时可预填：navigateTo 本页后在 eventChannel 上 emit('prefill', { input, mode, lang })；
// 历史页用 ?historyId= 打开。
const api = require('../../utils/api.js')
const i18n = require('../../utils/i18n.js')
const history = require('../../utils/history.js')
const storage = require('../../utils/storage.js')
const routes = require('../../utils/routes.js')
const samples = require('../../data/samples.js')

const isMode = (id) => i18n.MODE_IDS.indexOf(id) !== -1
const isLang = (id) => id === 'zh' || id === 'en'

Page({
  data: {
    t: null,
    modes: [],
    samples: [],
    modeId: i18n.MODE_IDS[0],
    modeDesc: '',
    lang: 'zh',
    input: '',
    // phase: 'idle' | 'optimizing' | 'iterating'
    phase: 'idle',
    error: '',
    before: '',
    result: '',
    round: 0,
    roundLabel: '',
    remainingLabel: '',
    view: 'after',
    showIterate: false,
    iterateInput: ''
  },

  onLoad(options) {
    this.setData({ lang: i18n.lang() })
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

  // 设置页改了界面语言后返回时要刷新文案。
  onShow() {
    const t = i18n.t()
    const lang = i18n.lang()
    wx.setNavigationBarTitle({ title: t.optimize.navTitle })
    this.setData({
      t,
      modes: i18n.modeOptions(t),
      modeDesc: t.modes[this.data.modeId].desc,
      samples: samples.map((s) => ({ id: s.id, title: s[lang].title })),
      roundLabel: t.optimize.round.replace('{n}', this.data.round)
    })
  },

  // 预填来自其他页面或宿主小程序，这里逐项校验，不认识的值忽略。
  applyPrefill(prefill) {
    const t = i18n.t()
    const patch = {}
    if (typeof prefill.input === 'string') patch.input = prefill.input
    if (isMode(prefill.mode)) {
      patch.modeId = prefill.mode
      patch.modeDesc = t.modes[prefill.mode].desc
    }
    if (isLang(prefill.lang)) patch.lang = prefill.lang
    if (typeof prefill.result === 'string' && prefill.result) {
      Object.assign(patch, { before: patch.input || '', result: prefill.result, round: 1, roundLabel: t.optimize.round.replace('{n}', 1), view: 'after' })
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

  onPickSample(e) {
    const sample = samples.find((s) => s.id === e.currentTarget.dataset.id)
    if (!sample) return
    const t = this.data.t
    this.setData({ input: sample[i18n.lang()].prompt, modeId: 'general', modeDesc: t.modes.general.desc })
  },

  onPickMode(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ modeId: id, modeDesc: this.data.t.modes[id].desc })
    this.savePrefs()
  },

  onPickLang(e) {
    this.setData({ lang: e.currentTarget.dataset.id })
    this.savePrefs()
  },

  onOptimize() {
    const input = this.data.input.trim()
    if (!input) {
      wx.showToast({ title: this.data.t.optimize.emptyInput, icon: 'none' })
      return
    }
    const { modeId, lang } = this.data
    this.run('optimizing', { mode: modeId, prompt: input, lang })
  },

  onToggleIterate() {
    this.setData({ showIterate: !this.data.showIterate })
  },

  onIterateInput(e) {
    this.setData({ iterateInput: e.detail.value })
  },

  onIterate() {
    const { result, iterateInput, lang } = this.data
    this.run('iterating', { mode: 'iterate', prompt: result, lang, instruction: iterateInput.trim() })
  },

  // request: mp-server 的优化请求 { mode, prompt, lang, instruction? }
  run(phase, request) {
    if (this.data.phase !== 'idle') return
    this.setData({ phase, error: '' })
    api.optimize(request)
      .then(({ result, remaining }) => {
        const t = this.data.t
        const round = phase === 'iterating' ? this.data.round + 1 : 1
        history.add({ mode: request.mode, lang: request.lang, input: request.prompt, output: result, iterateInput: request.instruction })
        this.setData({
          phase: 'idle',
          before: request.prompt,
          result,
          round,
          roundLabel: t.optimize.round.replace('{n}', round),
          remainingLabel: typeof remaining === 'number' ? t.optimize.remaining.replace('{n}', remaining) : '',
          view: 'after',
          showIterate: false,
          iterateInput: ''
        })
        wx.pageScrollTo({ selector: '#result', duration: 200 })
      })
      .catch((error) => {
        this.setData({ phase: 'idle', error: i18n.errorMessage(error, this.data.t) })
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
