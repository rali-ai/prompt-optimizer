// 会话令牌：AES-256-GCM 封装 { sub, oid, exp }，密钥由 SESSION_SECRET 派生。
// sub 是 openid 的 HMAC，用作限流和额度的用户键；oid 是 openid 本身，内容安全检查 msgSecCheck v2 必须带它。
// 令牌对小程序端是不透明的：读不出 openid，也改不了任何字段（GCM 认证失败即拒绝）。
import crypto from 'node:crypto'

const VERSION = 'v1'

export function createTokens(sessionSecret, ttlSec, now = Date.now) {
  const key = crypto.createHmac('sha256', sessionSecret).update('goprmpt-mp-token-key').digest()
  const subject = (openid) => crypto.createHmac('sha256', sessionSecret).update('sub:' + openid).digest('base64url').slice(0, 22)

  // 返回 { token, expiresAt }，expiresAt 为毫秒时间戳。
  function issue(openid) {
    const exp = Math.floor(now() / 1000) + ttlSec
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const body = Buffer.concat([cipher.update(JSON.stringify({ sub: subject(openid), oid: openid, exp })), cipher.final()])
    const token = VERSION + '.' + Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64url')
    return { token, expiresAt: exp * 1000 }
  }

  // 返回 { sub, openid }；格式错、被篡改或过期时返回 null。
  function verify(token) {
    if (typeof token !== 'string' || !token.startsWith(VERSION + '.')) return null
    const raw = Buffer.from(token.slice(VERSION.length + 1), 'base64url')
    if (raw.length < 12 + 16 + 1) return null
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12))
      decipher.setAuthTag(raw.subarray(raw.length - 16))
      const payload = JSON.parse(Buffer.concat([decipher.update(raw.subarray(12, raw.length - 16)), decipher.final()]).toString('utf8'))
      if (payload.exp * 1000 <= now()) return null
      return { sub: payload.sub, openid: payload.oid }
    } catch {
      return null
    }
  }

  return { issue, verify }
}
