// 行为测试：在临时端口上启动服务，微信和模型都换成可编排的假实现，只通过 HTTP 观察结果。
import test from 'node:test'
import assert from 'node:assert/strict'

import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { WechatError } from '../src/wechat.js'
import { LlmError } from '../src/llm.js'

const RISKY = '<risky>'

function baseConfig(limits = {}) {
  return {
    dev: false,
    llmFake: false,
    sessionSecret: 'test-secret-test-secret-test-secret!',
    sessionTtlSec: 3600,
    limits: { perMinute: 100, perDay: 100, maxInputChars: 50, maxBodyBytes: 2048, requestTimeoutMs: 5000, ...limits }
  }
}

// 返回 { url, clock, checks, llmCalls, wechat, llm, close }。
async function start({ limits, wechat: wechatOverride, llm: llmOverride } = {}) {
  const clock = { now: Date.UTC(2026, 10, 22, 4, 0, 0) }
  const checks = []
  const llmCalls = []
  const wechat = {
    async code2session(code) {
      if (code === 'bad') throw new WechatError('invalid code', 40029)
      return 'openid-' + code
    },
    async checkText(openid, text) {
      checks.push({ openid, text })
      return text.includes(RISKY) ? 'risky' : 'pass'
    },
    ...wechatOverride
  }
  const llm = {
    async complete(messages) {
      llmCalls.push(messages)
      return '优化后：' + messages[1].content.length
    },
    ...llmOverride
  }
  const server = createApp({ config: baseConfig(limits), wechat, llm, now: () => clock.now, log: () => {} })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = 'http://127.0.0.1:' + server.address().port
  return { url, clock, checks, llmCalls, close: () => new Promise((resolve) => server.close(resolve)) }
}

async function post(url, path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = 'Bearer ' + token
  const res = await fetch(url + path, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })
  return { status: res.status, body: await res.json() }
}

async function login(url, code = 'u1') {
  const res = await post(url, '/api/mp/login', { code })
  assert.equal(res.status, 200)
  return res.body.token
}

test('healthz answers ok', async (t) => {
  const app = await start()
  t.after(app.close)
  const res = await fetch(app.url + '/healthz')
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true })
})

test('login returns an opaque token and an expiry, never the openid', async (t) => {
  const app = await start()
  t.after(app.close)
  const res = await post(app.url, '/api/mp/login', { code: 'abc' })
  assert.equal(res.status, 200)
  assert.deepEqual(Object.keys(res.body).sort(), ['expiresAt', 'token'])
  assert.equal(res.body.expiresAt, app.clock.now + 3600 * 1000)
  const raw = JSON.stringify(res.body) + Buffer.from(res.body.token.slice(3), 'base64url').toString('latin1')
  assert.ok(!raw.includes('openid-abc'), 'openid must not be readable from the response')
})

test('login rejects a missing code and a code WeChat refuses', async (t) => {
  const app = await start()
  t.after(app.close)
  const missing = await post(app.url, '/api/mp/login', {})
  assert.equal(missing.status, 400)
  assert.equal(missing.body.error.code, 'bad_request')
  const refused = await post(app.url, '/api/mp/login', { code: 'bad' })
  assert.equal(refused.status, 401)
  assert.equal(refused.body.error.code, 'login_failed')
  assert.match(refused.body.error.message, /登录/)
})

test('optimize rejects missing, tampered and expired tokens without calling the model', async (t) => {
  const app = await start()
  t.after(app.close)
  const token = await login(app.url)
  const body = { mode: 'general', prompt: '写一首诗' }

  const tampered = token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA')
  for (const bad of [undefined, 'nonsense', tampered]) {
    const res = await post(app.url, '/api/mp/optimize', body, bad)
    assert.equal(res.status, 401)
    assert.equal(res.body.error.code, 'unauthorized')
  }

  app.clock.now += 3600 * 1000
  const expired = await post(app.url, '/api/mp/optimize', body, token)
  assert.equal(expired.status, 401)
  assert.equal(expired.body.error.code, 'unauthorized')
  assert.equal(app.llmCalls.length, 0)
})

test('optimize builds the mode template, checks input and output, and returns the result', async (t) => {
  const app = await start()
  t.after(app.close)
  const token = await login(app.url, 'u1')

  const res = await post(app.url, '/api/mp/optimize', { mode: 'structured', prompt: '  帮我写周报 {{本周工作}}  ', lang: 'en' }, token)

  assert.equal(res.status, 200)
  const [messages] = app.llmCalls
  assert.equal(messages[0].role, 'system')
  assert.match(messages[0].content, /^# Role: User Requirement Step-by-Step Planning Expert/)
  assert.match(messages[0].content, /Write the optimized prompt in English/)
  assert.ok(messages[1].content.includes('"originalPrompt": "帮我写周报 {{本周工作}}"'))
  assert.deepEqual(res.body, { result: '优化后：' + messages[1].content.length, remaining: 99 })
  assert.deepEqual(app.checks, [
    { openid: 'openid-u1', text: '帮我写周报 {{本周工作}}' },
    { openid: 'openid-u1', text: res.body.result }
  ])
})

test('iterate revises the previous result with the given direction, defaulting to zh', async (t) => {
  const app = await start()
  t.after(app.close)
  const token = await login(app.url)
  const res = await post(app.url, '/api/mp/optimize', { mode: 'iterate', prompt: '上一版', instruction: '更短' }, token)
  assert.equal(res.status, 200)
  const [messages] = app.llmCalls
  assert.match(messages[0].content, /^# Role：提示词迭代优化专家/)
  assert.ok(messages[1].content.includes('"lastOptimizedPrompt": "上一版"'))
  assert.ok(messages[1].content.includes('"iterateInput": "更短"'))
  assert.deepEqual(app.checks[0].text, '上一版\n更短')
})

test('risky input is refused before the model runs and does not use up quota', async (t) => {
  const app = await start({ limits: { perDay: 1 } })
  t.after(app.close)
  const token = await login(app.url)
  const res = await post(app.url, '/api/mp/optimize', { mode: 'general', prompt: '坏内容' + RISKY }, token)
  assert.equal(res.status, 422)
  assert.equal(res.body.error.code, 'input_risky')
  assert.match(res.body.error.message, /[\u4e00-\u9fa5]/)
  assert.equal(app.llmCalls.length, 0)

  const next = await post(app.url, '/api/mp/optimize', { mode: 'general', prompt: '好内容' }, token)
  assert.equal(next.status, 200)
  assert.equal(next.body.remaining, 0)
})

test('risky model output is withheld', async (t) => {
  const app = await start({ llm: { complete: async () => '模型说了' + RISKY } })
  t.after(app.close)
  const token = await login(app.url)
  const res = await post(app.url, '/api/mp/optimize', { mode: 'general', prompt: '正常输入' }, token)
  assert.equal(res.status, 422)
  assert.equal(res.body.error.code, 'output_risky')
  assert.ok(!JSON.stringify(res.body).includes('模型说了'))
})

test('an unavailable content check fails closed', async (t) => {
  const app = await start({
    wechat: {
      checkText: async () => {
        throw new WechatError('system busy', -1)
      }
    }
  })
  t.after(app.close)
  const token = await login(app.url)
  const res = await post(app.url, '/api/mp/optimize', { mode: 'general', prompt: '正常输入' }, token)
  assert.equal(res.status, 503)
  assert.equal(res.body.error.code, 'check_unavailable')
  assert.equal(app.llmCalls.length, 0)
})

test('model timeouts and failures map to distinct errors', async (t) => {
  let kind = 'timeout'
  const app = await start({
    llm: {
      complete: async () => {
        throw new LlmError(kind, 'boom')
      }
    }
  })
  t.after(app.close)
  const token = await login(app.url)
  const timeout = await post(app.url, '/api/mp/optimize', { mode: 'general', prompt: 'x' }, token)
  assert.equal(timeout.status, 504)
  assert.equal(timeout.body.error.code, 'llm_timeout')
  kind = 'upstream'
  const failed = await post(app.url, '/api/mp/optimize', { mode: 'general', prompt: 'x' }, token)
  assert.equal(failed.status, 502)
  assert.equal(failed.body.error.code, 'llm_failed')
})

test('each user is rate limited per minute, independently of other users', async (t) => {
  const app = await start({ limits: { perMinute: 2 } })
  t.after(app.close)
  const alice = await login(app.url, 'alice')
  const bob = await login(app.url, 'bob')
  const body = { mode: 'concise', prompt: '你好' }

  assert.equal((await post(app.url, '/api/mp/optimize', body, alice)).status, 200)
  assert.equal((await post(app.url, '/api/mp/optimize', body, alice)).status, 200)
  const limited = await post(app.url, '/api/mp/optimize', body, alice)
  assert.equal(limited.status, 429)
  assert.equal(limited.body.error.code, 'rate_limited')
  assert.equal((await post(app.url, '/api/mp/optimize', body, bob)).status, 200)

  app.clock.now += 60 * 1000
  assert.equal((await post(app.url, '/api/mp/optimize', body, alice)).status, 200)
})

test('the daily quota counts successes and resets at Beijing midnight', async (t) => {
  const app = await start({ limits: { perDay: 2 } })
  t.after(app.close)
  // 2026-11-22 15:00 UTC = 北京时间 23:00
  app.clock.now = Date.UTC(2026, 10, 22, 15, 0, 0)
  const token = await login(app.url)
  const body = { mode: 'system', prompt: '客服助手' }

  assert.equal((await post(app.url, '/api/mp/optimize', body, token)).body.remaining, 1)
  assert.equal((await post(app.url, '/api/mp/optimize', body, token)).body.remaining, 0)
  const exhausted = await post(app.url, '/api/mp/optimize', body, token)
  assert.equal(exhausted.status, 429)
  assert.equal(exhausted.body.error.code, 'quota_exceeded')

  app.clock.now += 3600 * 1000 // 北京时间次日 0 点，令牌也刚好过期，重新登录
  const nextDay = await post(app.url, '/api/mp/optimize', body, await login(app.url))
  assert.equal(nextDay.status, 200)
  assert.equal(nextDay.body.remaining, 1)
})

test('oversized input, oversized bodies, bad JSON and unknown modes are refused', async (t) => {
  const app = await start({ limits: { maxInputChars: 10, maxBodyBytes: 512 } })
  t.after(app.close)
  const token = await login(app.url)

  const long = await post(app.url, '/api/mp/optimize', { mode: 'general', prompt: '字'.repeat(11) }, token)
  assert.equal(long.status, 400)
  assert.equal(long.body.error.code, 'input_too_long')
  assert.match(long.body.error.message, /10/)
  assert.equal((await post(app.url, '/api/mp/optimize', { mode: 'general', prompt: '字'.repeat(10) }, token)).status, 200)

  const huge = await post(app.url, '/api/mp/optimize', { mode: 'general', prompt: 'x'.repeat(600) }, token)
  assert.equal(huge.status, 413)
  assert.equal(huge.body.error.code, 'too_large')

  const broken = await post(app.url, '/api/mp/optimize', '{"mode":', token)
  assert.equal(broken.status, 400)
  assert.equal(broken.body.error.code, 'bad_json')

  for (const body of [{ mode: 'nope', prompt: 'x' }, { mode: 'general', prompt: 'x', lang: 'fr' }, { mode: 'general', prompt: '   ' }]) {
    const res = await post(app.url, '/api/mp/optimize', body, token)
    assert.equal(res.status, 400)
    assert.equal(res.body.error.code, 'bad_request')
  }
  assert.equal(app.llmCalls.length, 1)
})

test('unknown routes answer a JSON 404', async (t) => {
  const app = await start()
  t.after(app.close)
  const res = await fetch(app.url + '/api/mp/nothing')
  assert.equal(res.status, 404)
  assert.equal((await res.json()).error.code, 'not_found')
})

test('L3: dev mode generates ephemeral random sessionSecret per startup instead of hardcoded fallback', () => {
  const cfg1 = loadConfig({ MP_DEV: '1', LLM_FAKE: '1' })
  const cfg2 = loadConfig({ MP_DEV: '1', LLM_FAKE: '1' })
  assert.notEqual(cfg1.sessionSecret, 'dev-only-session-secret')
  assert.equal(cfg1.sessionSecret.length, 64)
  assert.notEqual(cfg1.sessionSecret, cfg2.sessionSecret)
  assert.equal(cfg1.limits.loginPerWindow, 20)
  assert.equal(cfg1.limits.loginWindowMs, 15 * 60 * 1000)
  assert.equal(cfg1.limits.loginMaxEntries, 5000)
})

test('L3: login enforces bounded per-IP rate limiting and resets after window', async (t) => {
  const app = await start({
    limits: { loginPerWindow: 2, loginWindowMs: 60000, loginMaxEntries: 2 }
  })
  t.after(app.close)

  const loginWithIp = async (ip, code = 'u1') => {
    const res = await fetch(app.url + '/api/mp/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Real-Ip': ip },
      body: JSON.stringify({ code })
    })
    return { status: res.status, retryAfter: res.headers.get('retry-after'), body: await res.json() }
  }

  assert.equal((await loginWithIp('198.51.100.1')).status, 200)
  assert.equal((await loginWithIp('198.51.100.1')).status, 200)
  const blocked = await loginWithIp('198.51.100.1')
  assert.equal(blocked.status, 429)
  assert.equal(blocked.body.error.code, 'rate_limited')
  assert.ok(Number(blocked.retryAfter) >= 1)

  // Separate IP succeeds independently
  assert.equal((await loginWithIp('198.51.100.2')).status, 200)

  // Window reset allows first IP again
  app.clock.now += 60000
  assert.equal((await loginWithIp('198.51.100.1')).status, 200)

  // Bounded maxEntries (2): filling with 2 newer IPs evicts oldest without crashing
  assert.equal((await loginWithIp('198.51.100.3')).status, 200)
  assert.equal((await loginWithIp('198.51.100.4')).status, 200)
})
