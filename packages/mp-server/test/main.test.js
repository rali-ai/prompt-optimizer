// 端到端：用 MP_DEV=1 LLM_FAKE=1 真正启动 src/main.js，走一遍登录 → 优化 → 拦截。
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { DEV_RISKY_MARKER } from '../src/wechat.js'

const MAIN = fileURLToPath(new URL('../src/main.js', import.meta.url))

function startMain(env) {
  const child = spawn(process.execPath, [MAIN], { env: { PATH: process.env.PATH, PORT: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      output += chunk
      const match = /http:\/\/localhost:(\d+)/.exec(output)
      if (match) resolve('http://127.0.0.1:' + match[1])
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
    })
    child.on('exit', (code) => reject(new Error('exited with ' + code + ': ' + output)))
  })
  return { child, ready, output: () => output }
}

const json = async (res) => ({ status: res.status, body: await res.json() })
const post = (url, body, token) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body)
  }).then(json)

test('MP_DEV + LLM_FAKE runs without any credentials', async (t) => {
  const server = startMain({ MP_DEV: '1', LLM_FAKE: '1' })
  t.after(() => server.child.kill())
  const url = await server.ready

  const login = await post(url + '/api/mp/login', { code: 'devtools' })
  assert.equal(login.status, 200)

  const ok = await post(url + '/api/mp/optimize', { mode: 'general', prompt: '写一篇春天的公众号文章' }, login.body.token)
  assert.equal(ok.status, 200)
  assert.match(ok.body.result, /^【模拟优化结果】\n# Role: 用户提示词基础优化助手/)
  assert.ok(ok.body.result.includes('写一篇春天的公众号文章'))
  assert.equal(ok.body.remaining, 49)

  const risky = await post(url + '/api/mp/optimize', { mode: 'general', prompt: DEV_RISKY_MARKER + '测试' }, login.body.token)
  assert.equal(risky.status, 422)
  assert.equal(risky.body.error.code, 'input_risky')
})

test('production mode refuses to start without credentials', async () => {
  const server = startMain({})
  await assert.rejects(server.ready, /缺少环境变量 SESSION_SECRET/)
})
