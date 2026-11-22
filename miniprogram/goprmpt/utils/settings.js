// 模型连接设置：预设平台 + 读写本机保存的设置。
const storage = require('./storage.js')

// 模型名会随平台更新，用户可在设置页改成平台当前的模型名。
const PROVIDERS = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  { id: 'dashscope', name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { id: 'zhipu', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.3-flash' },
  { id: 'kimi', name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6-terra' },
  { id: 'custom', name: '自定义', baseUrl: '', model: '' }
]

const KEY = 'settings'

function defaults() {
  const first = PROVIDERS[0]
  return { providerId: first.id, baseUrl: first.baseUrl, apiKey: '', model: first.model }
}

function load() {
  return Object.assign(defaults(), storage.get(KEY, {}))
}

// 表单值 → 设置：去掉首尾空格，只留四个字段。
function normalize(form) {
  return {
    providerId: form.providerId || 'custom',
    baseUrl: String(form.baseUrl || '').trim(),
    apiKey: String(form.apiKey || '').trim(),
    model: String(form.model || '').trim()
  }
}

function save(form) {
  const settings = normalize(form)
  storage.set(KEY, settings)
  return settings
}

function isReady(settings) {
  return Boolean(settings.baseUrl && settings.apiKey && settings.model)
}

function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[PROVIDERS.length - 1]
}

module.exports = { PROVIDERS, load, normalize, save, isReady, getProvider }
