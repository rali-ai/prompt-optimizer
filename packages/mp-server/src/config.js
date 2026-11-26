// 环境变量 → 配置对象。只在启动时读一次，缺项或格式不对直接报错退出，不带病运行。
import crypto from 'node:crypto'

const int = (env, name, fallback) => {
  const raw = env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} 必须是非负整数，现在是 ${raw}`)
  return value
}

const required = (env, name) => {
  const value = (env[name] || '').trim()
  if (!value) throw new Error(`缺少环境变量 ${name}`)
  return value
}

// 返回 { port, dev, llmFake, sessionSecret, sessionTtlSec, appid, secret, llm, limits }。
export function loadConfig(env) {
  const dev = env.MP_DEV === '1'
  const llmFake = env.LLM_FAKE === '1'
  const rawSecret = (env.SESSION_SECRET || '').trim()
  const sessionSecret = dev
    ? rawSecret || crypto.randomBytes(32).toString('hex')
    : required(env, 'SESSION_SECRET')
  if (sessionSecret.length < 32 && !dev) throw new Error('SESSION_SECRET 至少 32 个字符')
  return {
    port: int(env, 'PORT', 8787),
    dev,
    llmFake,
    sessionSecret,
    sessionTtlSec: int(env, 'SESSION_TTL_SEC', 7 * 24 * 3600),
    appid: dev ? '' : required(env, 'MP_APPID'),
    secret: dev ? '' : required(env, 'MP_SECRET'),
    llm: llmFake
      ? null
      : {
          baseUrl: required(env, 'LLM_BASE_URL').replace(/\/+$/, ''),
          apiKey: required(env, 'LLM_API_KEY'),
          model: required(env, 'LLM_MODEL'),
          timeoutMs: int(env, 'LLM_TIMEOUT_MS', 60000)
        },
    limits: {
      perMinute: int(env, 'RATE_LIMIT_PER_MIN', 6),
      perDay: int(env, 'DAILY_QUOTA', 50),
      maxInputChars: int(env, 'MAX_INPUT_CHARS', 3000),
      maxBodyBytes: int(env, 'MAX_BODY_BYTES', 32 * 1024),
      requestTimeoutMs: int(env, 'REQUEST_TIMEOUT_MS', 90000),
      loginPerWindow: int(env, 'LOGIN_RATE_LIMIT_MAX', 20),
      loginWindowMs: int(env, 'LOGIN_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
      loginMaxEntries: int(env, 'LOGIN_RATE_LIMIT_MAX_ENTRIES', 5000)
    }
  }
}
