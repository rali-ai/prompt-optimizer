// 极简 wx 模拟：同步存储 + 可编排的 wx.request。每个测试调用 installWx() 拿一份新的。
import { createRequire } from 'node:module'

export const requireMp = createRequire(new URL('../../', import.meta.url))

export function installWx() {
  const store = new Map()
  const requests = []
  let reply = () => ({ statusCode: 200, data: {} })

  globalThis.wx = {
    getStorageSync: (key) => (store.has(key) ? structuredClone(store.get(key)) : ''),
    setStorageSync: (key, value) => {
      store.set(key, structuredClone(value))
    },
    request: (options) => {
      requests.push(options)
      const result = reply(options)
      queueMicrotask(() => (result.fail ? options.fail(result.fail) : options.success(result)))
    }
  }

  return {
    store,
    requests,
    // fn(options) 返回 { statusCode, data } 或 { fail: { errMsg } }
    reply(fn) {
      reply = fn
    }
  }
}

export function completion(content) {
  return { statusCode: 200, data: { choices: [{ message: { role: 'assistant', content } }] } }
}
