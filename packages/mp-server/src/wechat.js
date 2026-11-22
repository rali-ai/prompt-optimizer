// 微信服务端接口：code 换 openid，文本内容安全检查（msgSecCheck v2）。
// 两种实现形状相同：{ code2session(code) → openid, checkText(openid, text) → 'pass' | 'risky' }。
// 接口不可用时抛 WechatError，由 app.js 转成中文错误；不会把内容当作“通过”放行。

const API = 'https://api.weixin.qq.com'
const TIMEOUT_MS = 10000
// msgSecCheck 单次最多 2500 字，长文本分段检查。
const CHECK_CHUNK = 2500
// 2 = 评论场景，适合用户输入和 AI 生成的短文本。
const SCENE = 2
const TOKEN_INVALID = new Set([40001, 40014, 42001])

export class WechatError extends Error {
  constructor(message, errcode) {
    super(message)
    this.errcode = errcode
  }
}

export function chunks(text, size = CHECK_CHUNK) {
  const parts = []
  const chars = Array.from(text)
  for (let i = 0; i < chars.length; i += size) parts.push(chars.slice(i, i + size).join(''))
  return parts
}

export function createWechat({ appid, secret, fetch = globalThis.fetch, now = Date.now }) {
  let cached = null // { value, expiresAt }

  async function call(url, init) {
    let res
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch (error) {
      throw new WechatError('连接微信服务器失败：' + error.message)
    }
    const data = await res.json().catch(() => null)
    if (!data) throw new WechatError('微信服务器返回了无法解析的内容（HTTP ' + res.status + '）')
    return data
  }

  async function accessToken(force) {
    if (!force && cached && cached.expiresAt > now()) return cached.value
    const data = await call(API + '/cgi-bin/stable_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credential', appid, secret, force_refresh: Boolean(force) })
    })
    if (!data.access_token) throw new WechatError('获取 access_token 失败：' + data.errmsg, data.errcode)
    // 提前 5 分钟过期，避免临界时刻用到失效的 token。
    cached = { value: data.access_token, expiresAt: now() + (data.expires_in - 300) * 1000 }
    return cached.value
  }

  async function code2session(code) {
    const query = new URLSearchParams({ appid, secret, js_code: code, grant_type: 'authorization_code' })
    const data = await call(API + '/sns/jscode2session?' + query, { method: 'GET' })
    if (!data.openid) throw new WechatError('登录凭证无效：' + (data.errmsg || '没有返回 openid'), data.errcode)
    return data.openid
  }

  async function checkChunk(openid, content, retried) {
    const token = await accessToken(retried)
    const data = await call(API + '/wxa/msg_sec_check?access_token=' + encodeURIComponent(token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, version: 2, scene: SCENE, openid })
    })
    if (TOKEN_INVALID.has(data.errcode) && !retried) return checkChunk(openid, content, true)
    if (data.errcode !== 0) throw new WechatError('内容安全检查失败：' + data.errmsg, data.errcode)
    return data.result && data.result.suggest === 'risky' ? 'risky' : 'pass'
  }

  async function checkText(openid, text) {
    for (const part of chunks(text)) {
      if ((await checkChunk(openid, part, false)) === 'risky') return 'risky'
    }
    return 'pass'
  }

  return { code2session, checkText }
}

// MP_DEV=1 用：任何 code 都能登录，openid 为 dev-<code>；含 DEV_RISKY_MARKER 的文本判为违规，方便本地演示拦截。
export const DEV_RISKY_MARKER = '【违规示例】'

export const devWechat = {
  async code2session(code) {
    return 'dev-' + code
  },
  async checkText(openid, text) {
    return text.includes(DEV_RISKY_MARKER) ? 'risky' : 'pass'
  }
}
