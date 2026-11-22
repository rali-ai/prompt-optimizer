import test from 'node:test'
import assert from 'node:assert/strict'
import { installWx, requireMp, completion } from './wx-mock.mjs'

const llm = requireMp('./utils/llm.js')

const settings = {
  baseUrl: 'https://api.example.com/v1/',
  apiKey: 'sk-test',
  model: 'demo-model'
}
const messages = [{ role: 'user', content: '你好' }]

async function kindOf(promise) {
  try {
    await promise
  } catch (error) {
    return error.kind
  }
  assert.fail('expected a rejection')
}

test('chat posts an OpenAI-compatible request and returns the text', async () => {
  const wx = installWx()
  wx.reply(() => completion('  优化后的提示词  '))

  const text = await llm.chat(settings, messages)

  assert.equal(text, '优化后的提示词')
  assert.equal(wx.requests.length, 1)
  const request = wx.requests[0]
  assert.equal(request.url, 'https://api.example.com/v1/chat/completions')
  assert.equal(request.method, 'POST')
  assert.equal(request.timeout, 60000)
  assert.equal(request.header.Authorization, 'Bearer sk-test')
  assert.deepEqual(request.data, { model: 'demo-model', messages, stream: false })
})

test('a base URL that already ends in /chat/completions is used as is', async () => {
  const wx = installWx()
  wx.reply(() => completion('ok'))
  await llm.chat({ ...settings, baseUrl: 'https://api.example.com/v1/chat/completions' }, messages)
  assert.equal(wx.requests[0].url, 'https://api.example.com/v1/chat/completions')
})

test('response parsing drops <think> blocks, a wrapping code fence and joins content parts', async () => {
  const wx = installWx()

  wx.reply(() => completion('<think>先想想</think>\n\n结果 A'))
  assert.equal(await llm.chat(settings, messages), '结果 A')

  wx.reply(() => completion('```markdown\n# 任务\n内容\n```'))
  assert.equal(await llm.chat(settings, messages), '# 任务\n内容')

  wx.reply(() => completion([{ type: 'text', text: '第一段' }, { type: 'text', text: '第二段' }]))
  assert.equal(await llm.chat(settings, messages), '第一段第二段')

  wx.reply(() => ({ statusCode: 200, data: JSON.stringify(completion('字符串响应').data) }))
  assert.equal(await llm.chat(settings, messages), '字符串响应')
})

test('empty or unparsable 200 responses are errors', async () => {
  const wx = installWx()
  wx.reply(() => completion('   '))
  assert.equal(await kindOf(llm.chat(settings, messages)), 'empty')
  wx.reply(() => ({ statusCode: 200, data: { choices: [] } }))
  assert.equal(await kindOf(llm.chat(settings, messages)), 'empty')
  wx.reply(() => ({ statusCode: 200, data: '<html>not json</html>' }))
  assert.equal(await kindOf(llm.chat(settings, messages)), 'bad_response')
})

test('HTTP status codes map to error kinds, keeping the platform message', async () => {
  const wx = installWx()
  const cases = [
    [401, 'auth'],
    [403, 'auth'],
    [402, 'quota'],
    [429, 'rate_limit'],
    [404, 'not_found'],
    [500, 'server'],
    [503, 'server'],
    [400, 'http']
  ]
  for (const [statusCode, kind] of cases) {
    wx.reply(() => ({ statusCode, data: { error: { message: 'detail-' + statusCode } } }))
    let caught
    await llm.chat(settings, messages).catch((error) => {
      caught = error
    })
    assert.equal(caught.kind, kind, 'status ' + statusCode)
    assert.ok(caught.message.includes('detail-' + statusCode), 'status ' + statusCode + ' keeps platform detail')
  }
})

test('wx.request failures map to domain, timeout and network errors', async () => {
  const wx = installWx()

  wx.reply(() => ({ fail: { errMsg: 'request:fail url not in domain list' } }))
  let caught
  await llm.chat(settings, messages).catch((error) => {
    caught = error
  })
  assert.equal(caught.kind, 'domain')
  assert.ok(caught.message.includes('api.example.com'), 'names the host to whitelist')

  wx.reply(() => ({ fail: { errMsg: 'request:fail timeout' } }))
  assert.equal(await kindOf(llm.chat(settings, messages)), 'timeout')

  wx.reply(() => ({ fail: { errMsg: 'request:fail net::ERR_INTERNET_DISCONNECTED' } }))
  assert.equal(await kindOf(llm.chat(settings, messages)), 'network')
})

test('incomplete or non-HTTPS settings fail before any request is sent', async () => {
  const wx = installWx()
  for (const bad of [
    { ...settings, apiKey: '' },
    { ...settings, model: '' },
    { ...settings, baseUrl: '' },
    { ...settings, baseUrl: 'http://api.example.com/v1' }
  ]) {
    assert.equal(await kindOf(llm.chat(bad, messages)), 'config')
  }
  assert.equal(wx.requests.length, 0)
})

test('testConnection accepts any 2xx and reports auth failures', async () => {
  const wx = installWx()
  wx.reply(() => completion(''))
  await llm.testConnection(settings)
  assert.equal(wx.requests[0].url, 'https://api.example.com/v1/chat/completions')

  wx.reply(() => ({ statusCode: 401, data: { error: { message: 'bad key' } } }))
  assert.equal(await kindOf(llm.testConnection(settings)), 'auth')
})
