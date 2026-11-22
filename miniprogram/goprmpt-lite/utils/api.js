// 与 mp-server 通信的唯一入口：wx.login 换会话令牌（缓存在本机），再带令牌请求优化接口。
// 失败时 reject 一个带 code 的 Error：服务端错误码（见 packages/mp-server/README.zh-CN.md），
// 或本地的 network / timeout / domain / http。message 是服务端给的中文说明，可能为空。
const config = require('../config.js')
const storage = require('./storage.js')

const SESSION_KEY = 'session'
const TIMEOUT_MS = 90000
// 令牌过期前 1 分钟就换新的，避免请求途中过期。
const RENEW_MS = 60000

function apiError(code, message) {
  const error = new Error(message || '')
  error.code = code
  return error
}

function fromWxFail(err) {
  const message = String((err && err.errMsg) || '')
  if (/domain list/i.test(message)) return apiError('domain', '')
  if (/time ?out/i.test(message)) return apiError('timeout', '')
  return apiError('network', '')
}

function post(path, data, token) {
  const header = { 'Content-Type': 'application/json' }
  if (token) header.Authorization = 'Bearer ' + token
  return new Promise((resolve, reject) => {
    wx.request({
      url: config.API_BASE.replace(/\/+$/, '') + path,
      method: 'POST',
      data,
      header,
      timeout: TIMEOUT_MS,
      dataType: 'json',
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }
        const error = res.data && res.data.error
        reject(apiError((error && error.code) || 'http', error && error.message))
      },
      fail: (err) => reject(fromWxFail(err))
    })
  })
}

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => (res.code ? resolve(res.code) : reject(apiError('login_failed', ''))),
      fail: () => reject(apiError('login_failed', ''))
    })
  })
}

function login() {
  return wxLogin()
    .then((code) => post('/api/mp/login', { code }))
    .then((session) => {
      storage.set(SESSION_KEY, { token: session.token, expiresAt: session.expiresAt })
      return session.token
    })
}

function currentToken() {
  const session = storage.get(SESSION_KEY, null)
  return session && session.expiresAt - RENEW_MS > Date.now() ? Promise.resolve(session.token) : login()
}

// request: { mode, prompt, lang, instruction? } → Promise<{ result, remaining }>。
// 令牌被服务端拒绝（比如服务端换了密钥）时重新登录一次再试。
function optimize(request) {
  return currentToken()
    .then((token) => post('/api/mp/optimize', request, token))
    .catch((error) => {
      if (error.code !== 'unauthorized') throw error
      storage.remove(SESSION_KEY)
      return login().then((token) => post('/api/mp/optimize', request, token))
    })
}

module.exports = { optimize }
