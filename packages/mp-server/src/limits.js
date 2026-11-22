// 按用户限流（每分钟次数）和每日额度，存在内存里，单进程部署够用；多实例要换成 Redis。
// 两个计数器都是固定窗口：窗口一换就整表清空，内存不会随用户数无限增长。
// 日期按北京时间算，每天 0 点重置额度。

const DAY_OFFSET_MS = 8 * 3600 * 1000

function windowCounter(windowOf) {
  let current = null
  let counts = new Map()
  const roll = (t) => {
    const w = windowOf(t)
    if (w !== current) {
      current = w
      counts = new Map()
    }
  }
  return {
    get(key, t) {
      roll(t)
      return counts.get(key) || 0
    },
    add(key, t, delta) {
      roll(t)
      counts.set(key, Math.max(0, (counts.get(key) || 0) + delta))
    }
  }
}

export function createLimiter({ perMinute, perDay }, now = Date.now) {
  const minute = windowCounter((t) => Math.floor(t / 60000))
  const day = windowCounter((t) => Math.floor((t + DAY_OFFSET_MS) / 86400000))

  // 开始一次请求。返回 { ok: true, release } 或 { ok: false, reason: 'rate_limited' | 'quota_exceeded' }。
  // 额度先占后用：调用失败时 release(false) 退回，成功时 release(true) 保留。
  function begin(user) {
    const t = now()
    if (minute.get(user, t) >= perMinute) return { ok: false, reason: 'rate_limited' }
    if (day.get(user, t) >= perDay) return { ok: false, reason: 'quota_exceeded' }
    minute.add(user, t, 1)
    day.add(user, t, 1)
    let settled = false
    return {
      ok: true,
      release(succeeded) {
        if (settled) return
        settled = true
        if (!succeeded) day.add(user, now(), -1)
      }
    }
  }

  const remaining = (user) => Math.max(0, perDay - day.get(user, now()))

  return { begin, remaining }
}
