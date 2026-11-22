// 微信接口和模型接口的客户端：注入假的 fetch，断言发出去的请求和对返回值的处理。
import test from 'node:test'
import assert from 'node:assert/strict'

import { createWechat, WechatError, chunks } from '../src/wechat.js'
import { createLlm, LlmError } from '../src/llm.js'

function fakeFetch(handler) {
  const calls = []
  const fetch = async (url, init) => {
    const call = { url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : null, headers: init.headers }
    calls.push(call)
    const reply = await handler(call, calls.length)
    return new Response(typeof reply === 'string' ? reply : JSON.stringify(reply), { status: reply.status || 200 })
  }
  return { fetch, calls }
}

test('code2session exchanges the code and surfaces WeChat errors', async () => {
  const { fetch, calls } = fakeFetch((call) =>
    call.url.includes('js_code=good') ? { openid: 'o1', session_key: 'k' } : { errcode: 40029, errmsg: 'invalid code' }
  )
  const wechat = createWechat({ appid: 'wxapp', secret: 'sec', fetch })
  assert.equal(await wechat.code2session('good'), 'o1')
  const url = new URL(calls[0].url)
  assert.equal(url.pathname, '/sns/jscode2session')
  assert.equal(url.searchParams.get('appid'), 'wxapp')
  assert.equal(url.searchParams.get('grant_type'), 'authorization_code')
  await assert.rejects(wechat.code2session('bad'), (error) => error instanceof WechatError && error.errcode === 40029)
})

test('checkText caches the access token, sends v2 requests and reports risky content', async () => {
  let clock = 0
  const { fetch, calls } = fakeFetch((call) => {
    if (call.url.endsWith('/cgi-bin/stable_token')) return { access_token: 'tok' + calls.length, expires_in: 7200 }
    return { errcode: 0, result: { suggest: call.body.content.includes('坏') ? 'risky' : 'pass', label: 100 } }
  })
  const wechat = createWechat({ appid: 'wxapp', secret: 'sec', fetch, now: () => clock })

  assert.equal(await wechat.checkText('o1', '你好'), 'pass')
  assert.equal(await wechat.checkText('o1', '坏东西'), 'risky')
  assert.equal(calls.filter((c) => c.url.endsWith('/stable_token')).length, 1)
  const check = calls[1]
  assert.equal(new URL(check.url).searchParams.get('access_token'), 'tok1')
  assert.deepEqual(check.body, { content: '你好', version: 2, scene: 2, openid: 'o1' })

  clock += 7200 * 1000
  await wechat.checkText('o1', '你好')
  assert.equal(calls.filter((c) => c.url.endsWith('/stable_token')).length, 2)
})

test('checkText refreshes an invalid token once and fails on other errors', async () => {
  let invalidOnce = true
  const { fetch, calls } = fakeFetch((call) => {
    if (call.url.endsWith('/stable_token')) return { access_token: 'tok' + calls.length, expires_in: 7200 }
    if (invalidOnce) {
      invalidOnce = false
      return { errcode: 40001, errmsg: 'invalid credential' }
    }
    return call.body.content === 'busy' ? { errcode: -1, errmsg: 'system error' } : { errcode: 0, result: { suggest: 'pass' } }
  })
  const wechat = createWechat({ appid: 'wxapp', secret: 'sec', fetch })
  assert.equal(await wechat.checkText('o1', 'hi'), 'pass')
  const refresh = calls.filter((c) => c.url.endsWith('/stable_token'))
  assert.equal(refresh.length, 2)
  assert.equal(refresh[1].body.force_refresh, true)
  await assert.rejects(wechat.checkText('o1', 'busy'), WechatError)
})

test('long text is checked in chunks of at most 2500 characters', async () => {
  const { fetch, calls } = fakeFetch((call) =>
    call.url.endsWith('/stable_token') ? { access_token: 't', expires_in: 7200 } : { errcode: 0, result: { suggest: 'pass' } }
  )
  const wechat = createWechat({ appid: 'a', secret: 's', fetch })
  const text = '字'.repeat(2500) + '尾'.repeat(10)
  await wechat.checkText('o1', text)
  const contents = calls.filter((c) => c.url.includes('msg_sec_check')).map((c) => c.body.content)
  assert.deepEqual(contents.map((c) => Array.from(c).length), [2500, 10])
  assert.equal(contents.join(''), text)
  assert.deepEqual(chunks(''), [])
})

test('the model client posts an OpenAI-compatible request and cleans the reply', async () => {
  const { fetch, calls } = fakeFetch(() => ({ choices: [{ message: { content: '<think>想一想</think>\n```markdown\n最终提示词\n```' } }] }))
  const llm = createLlm({ baseUrl: 'https://api.deepseek.com', apiKey: 'sk-x', model: 'deepseek-chat', timeoutMs: 1000, fetch })
  const messages = [{ role: 'user', content: 'hi' }]
  assert.equal(await llm.complete(messages), '最终提示词')
  assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions')
  assert.equal(calls[0].headers.Authorization, 'Bearer sk-x')
  assert.deepEqual(calls[0].body, { model: 'deepseek-chat', messages, stream: false })
})

test('the model client reports HTTP errors, empty replies and timeouts by kind', async () => {
  const replies = [{ status: 500, error: 'down' }, { choices: [{ message: { content: '  ' } }] }]
  const { fetch } = fakeFetch((call, n) => replies[n - 1])
  const llm = createLlm({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm', timeoutMs: 1000, fetch })
  await assert.rejects(llm.complete([]), (e) => e instanceof LlmError && e.kind === 'upstream')
  await assert.rejects(llm.complete([]), (e) => e instanceof LlmError && e.kind === 'empty')

  const slow = createLlm({
    baseUrl: 'https://x/v1',
    apiKey: 'k',
    model: 'm',
    timeoutMs: 20,
    fetch: (url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)))
  })
  await assert.rejects(slow.complete([]), (e) => e instanceof LlmError && e.kind === 'timeout')
})
