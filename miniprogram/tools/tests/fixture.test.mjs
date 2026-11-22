// 简版能原样拷进一个陌生的宿主：只复制 goprmpt-lite/、只加一条 subPackages，检查就通过；
// 拷进去之后简版的代码在宿主目录里也能跑通一次优化请求。
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'

import { makeLiteHost, LITE_ENTRY } from '../../../scripts/make-lite-host-fixture.mjs'
import { installWx } from './wx-mock.mjs'

test('copying goprmpt-lite into a blank host and adding one subPackages entry passes the check', () => {
  const { before, after, errors, lite } = makeLiteHost()
  assert.deepEqual(errors, [])
  assert.equal(lite, true)
  const { subPackages, ...rest } = after
  assert.deepEqual(rest, before, 'nothing else in app.json changes')
  assert.deepEqual(subPackages, [LITE_ENTRY])
})

test('the copied lite package runs from the host folder', async (t) => {
  const { dir } = makeLiteHost({ keep: true })
  t.after(() => import('node:fs').then((fs) => fs.rmSync(dir, { recursive: true, force: true })))
  const requireHost = createRequire(path.join(dir, 'app.json'))
  const api = requireHost('./goprmpt-lite/utils/api.js')
  const wx = installWx({ language: 'en_US' })
  wx.reply((options) =>
    options.url.endsWith('/api/mp/login')
      ? { statusCode: 200, data: { token: 't', expiresAt: Date.now() + 3600e3 } }
      : { statusCode: 200, data: { result: 'ok', remaining: 3 } }
  )
  assert.deepEqual(await api.optimize({ mode: 'general', prompt: 'hi', lang: 'en' }), { result: 'ok', remaining: 3 })
  assert.equal(requireHost('./goprmpt-lite/utils/i18n.js').t().optimize.start, 'Optimize')
})
