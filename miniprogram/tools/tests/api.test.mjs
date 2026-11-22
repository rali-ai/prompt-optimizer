// 简版和 mp-server 之间的协议：登录换令牌、带令牌优化、令牌失效重登、错误码透传。
import test from 'node:test'
import assert from 'node:assert/strict'
import { installWx, requireMp } from './wx-mock.mjs'

const api = requireMp('./goprmpt-lite/utils/api.js')
const config = requireMp('./goprmpt-lite/config.js')

const BASE = config.API_BASE.replace(/\/+$/, '')
const request = { mode: 'structured', prompt: '写周报', lang: 'en' }

// 一个按路径应答的假 mp-server。tokens 是它认的令牌集合。
function fakeServer(wx, { tokens = new Set(), optimize } = {}) {
  let issued = 0
  wx.reply((options) => {
    if (options.url === BASE + '/api/mp/login') {
      issued += 1
      const token = 'tok-' + options.data.code + '-' + issued
      tokens.add(token)
      return { statusCode: 200, data: { token, expiresAt: Date.now() + 3600e3 } }
    }
    if (options.url === BASE + '/api/mp/optimize') {
      const token = (options.header.Authorization || '').replace('Bearer ', '')
      if (!tokens.has(token)) return { statusCode: 401, data: { error: { code: 'unauthorized', message: '登录已失效，请重新登录' } } }
      return optimize ? optimize(options) : { statusCode: 200, data: { result: '优化结果', remaining: 7 } }
    }
    return { statusCode: 404, data: { error: { code: 'not_found', message: '接口不存在' } } }
  })
  return tokens
}

test('the first optimize logs in with wx.login and sends the token and request body', async () => {
  const wx = installWx()
  fakeServer(wx)

  assert.deepEqual(await api.optimize(request), { result: '优化结果', remaining: 7 })

  assert.equal(wx.logins, 1)
  const [login, optimize] = wx.requests
  assert.equal(login.method, 'POST')
  assert.deepEqual(login.data, { code: 'code-1' })
  assert.equal(optimize.method, 'POST')
  assert.equal(optimize.header.Authorization, 'Bearer tok-code-1-1')
  assert.deepEqual(optimize.data, request)
})

test('a cached session is reused until shortly before it expires', async () => {
  const wx = installWx()
  fakeServer(wx)
  await api.optimize(request)
  await api.optimize(request)
  assert.equal(wx.logins, 1)

  const session = wx.store.get('goprmpt_session')
  wx.store.set('goprmpt_session', { ...session, expiresAt: Date.now() + 30e3 })
  await api.optimize(request)
  assert.equal(wx.logins, 2)
})

test('a token the server rejects triggers one fresh login and a retry', async () => {
  const wx = installWx()
  wx.store.set('goprmpt_session', { token: 'stale', expiresAt: Date.now() + 3600e3 })
  fakeServer(wx)

  assert.equal((await api.optimize(request)).result, '优化结果')
  assert.equal(wx.logins, 1)
  assert.equal(wx.store.get('goprmpt_session').token, 'tok-code-1-1')
})

test('server errors reject with the server code and Chinese message', async () => {
  const wx = installWx()
  fakeServer(wx, { optimize: () => ({ statusCode: 429, data: { error: { code: 'quota_exceeded', message: '今天的优化次数已经用完了' } } }) })
  await assert.rejects(api.optimize(request), (error) => error.code === 'quota_exceeded' && error.message === '今天的优化次数已经用完了')
})

test('transport failures map to network, timeout and domain codes', async () => {
  for (const [errMsg, code] of [
    ['request:fail timeout', 'timeout'],
    ['request:fail url not in domain list', 'domain'],
    ['request:fail ssl hand shake error', 'network']
  ]) {
    const wx = installWx()
    wx.reply(() => ({ fail: { errMsg } }))
    await assert.rejects(api.optimize(request), (error) => error.code === code, errMsg)
  }
})
