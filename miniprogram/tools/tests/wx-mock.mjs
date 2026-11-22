// 极简 wx 模拟：同步存储 + 可编排的 wx.request 和 wx.login + 可设置的微信语言。每个测试调用 installWx() 拿一份新的。
import { createRequire } from 'node:module'

export const requireMp = createRequire(new URL('../../', import.meta.url))

// options.language：wx.getAppBaseInfo().language，默认 'zh_CN'。
export function installWx(options = {}) {
  const store = new Map()
  const requests = []
  let reply = () => ({ statusCode: 200, data: {} })
  let logins = 0

  globalThis.wx = {
    getStorageSync: (key) => (store.has(key) ? structuredClone(store.get(key)) : ''),
    setStorageSync: (key, value) => {
      store.set(key, structuredClone(value))
    },
    removeStorageSync: (key) => {
      store.delete(key)
    },
    getAppBaseInfo: () => ({ language: options.language === undefined ? 'zh_CN' : options.language }),
    login: ({ success }) => {
      logins += 1
      queueMicrotask(() => success({ code: 'code-' + logins }))
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
    get logins() {
      return logins
    },
    // fn(options) 返回 { statusCode, data } 或 { fail: { errMsg } }
    reply(fn) {
      reply = fn
    }
  }
}
