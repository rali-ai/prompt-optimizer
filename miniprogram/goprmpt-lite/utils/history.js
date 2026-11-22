// 优化历史，只存在本机。
// 记录形状：{ id, createdAt, mode, lang, input, output, iterateInput }
// mode 为优化方式 id 或 'iterate'（再优化，此时 input 是上一版结果）；lang 为 'zh' | 'en'。
const storage = require('./storage.js')

const KEY = 'history'
const LIMIT = 100

function list() {
  return storage.get(KEY, [])
}

function add(entry) {
  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    createdAt: Date.now(),
    mode: entry.mode,
    lang: entry.lang,
    input: entry.input,
    output: entry.output,
    iterateInput: entry.iterateInput || ''
  }
  storage.set(KEY, [record].concat(list()).slice(0, LIMIT))
  return record
}

function get(id) {
  return list().find((r) => r.id === id) || null
}

function remove(id) {
  storage.set(KEY, list().filter((r) => r.id !== id))
}

function clear() {
  storage.set(KEY, [])
}

function pad(n) {
  return n < 10 ? '0' + n : String(n)
}

// lang: 'zh' | 'en'，只影响「今天 / Today」。
function formatTime(ts, now, lang) {
  const d = new Date(ts)
  const today = new Date(now === undefined ? Date.now() : now)
  const time = pad(d.getHours()) + ':' + pad(d.getMinutes())
  if (d.toDateString() === today.toDateString()) return (lang === 'en' ? 'Today ' : '今天 ') + time
  const date = pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  return d.getFullYear() === today.getFullYear() ? date + ' ' + time : d.getFullYear() + '-' + date
}

module.exports = { LIMIT, list, add, get, remove, clear, formatTime }
