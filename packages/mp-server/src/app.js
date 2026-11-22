// HTTP 层：路由、请求体读取与校验、错误转中文 JSON。业务依赖（微信、模型、令牌、限流）全部由参数注入，测试里换成假的。
import http from 'node:http'

import { buildMessages, LANGS, MODE_IDS } from './templates.js'
import { LlmError } from './llm.js'
import { WechatError } from './wechat.js'
import { createTokens } from './token.js'
import { createLimiter } from './limits.js'

// 错误码 → [HTTP 状态, 给用户看的中文说明]。小程序端按 code 分支，message 直接展示。
const ERRORS = {
  not_found: [404, '接口不存在'],
  bad_json: [400, '请求体不是合法的 JSON'],
  bad_request: [400, '请求参数不对'],
  too_large: [413, '请求内容太大'],
  input_too_long: [400, '提示词太长了'],
  login_failed: [401, '微信登录失败，请稍后重试'],
  unauthorized: [401, '登录已失效，请重新登录'],
  rate_limited: [429, '操作太频繁了，请一分钟后再试'],
  quota_exceeded: [429, '今天的优化次数已经用完了，明天再来吧'],
  input_risky: [422, '输入内容可能不符合平台规范，请修改后再试'],
  output_risky: [422, '生成的内容没有通过安全检查，已拦截，请换个说法再试'],
  check_unavailable: [503, '内容安全检查暂时不可用，请稍后再试'],
  llm_timeout: [504, '模型响应超时，请稍后再试'],
  llm_failed: [502, '模型服务暂时不可用，请稍后再试'],
  internal: [500, '服务器出错了，请稍后再试']
}

export const ERROR_CODES = Object.keys(ERRORS)

class HttpError extends Error {
  constructor(code, message) {
    super(message || ERRORS[code][1])
    this.code = code
  }
}

const MODES = new Set([...MODE_IDS, 'iterate'])

function send(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text) })
  res.end(text)
}

function readJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length'] || 0) > maxBytes) {
      reject(new HttpError('too_large'))
      req.resume()
      return
    }
    const parts = []
    let size = 0
    const onData = (chunk) => {
      size += chunk.length
      if (size > maxBytes) {
        // 不再缓存，剩下的数据读完丢弃，好让 413 正常发回去。
        req.off('data', onData)
        req.resume()
        reject(new HttpError('too_large'))
        return
      }
      parts.push(chunk)
    }
    req.on('data', onData)
    req.on('end', () => {
      try {
        const value = JSON.parse(Buffer.concat(parts).toString('utf8') || 'null')
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object')
        resolve(value)
      } catch {
        reject(new HttpError('bad_json'))
      }
    })
    req.on('error', reject)
  })
}

const text = (value) => (typeof value === 'string' ? value : '')
const length = (value) => Array.from(value).length

// 请求体 → { mode, prompt, lang, instruction }，不合法时抛 HttpError。
export function parseOptimize(body, maxInputChars) {
  const mode = body.mode
  if (!MODES.has(mode)) throw new HttpError('bad_request', '不支持的优化方式：' + String(mode))
  const lang = body.lang === undefined ? 'zh' : body.lang
  if (!LANGS.includes(lang)) throw new HttpError('bad_request', '不支持的输出语言：' + String(lang))
  const prompt = text(body.prompt).trim()
  if (!prompt) throw new HttpError('bad_request', '请先输入要优化的提示词')
  const instruction = mode === 'iterate' ? text(body.instruction).trim() : ''
  if (length(prompt) + length(instruction) > maxInputChars) {
    throw new HttpError('input_too_long', `提示词太长了，最多 ${maxInputChars} 字`)
  }
  return { mode, prompt, lang, instruction }
}

function bearer(req) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '')
  return match ? match[1] : ''
}

// deps: { config, wechat, llm, now?, log? }。返回未 listen 的 http.Server。
export function createApp({ config, wechat, llm, now = Date.now, log = console.error }) {
  const tokens = createTokens(config.sessionSecret, config.sessionTtlSec, now)
  const limiter = createLimiter(config.limits, now)
  const { maxBodyBytes, maxInputChars } = config.limits

  async function check(openid, content, riskyCode) {
    let verdict
    try {
      verdict = await wechat.checkText(openid, content)
    } catch (error) {
      if (error instanceof WechatError) {
        log('[msgSecCheck]', error.errcode ?? '', error.message)
        throw new HttpError('check_unavailable')
      }
      throw error
    }
    if (verdict !== 'pass') throw new HttpError(riskyCode)
  }

  async function login(req) {
    const body = await readJson(req, maxBodyBytes)
    const code = text(body.code).trim()
    if (!code || code.length > 128) throw new HttpError('bad_request', '缺少登录凭证 code')
    let openid
    try {
      openid = await wechat.code2session(code)
    } catch (error) {
      if (error instanceof WechatError) {
        log('[code2session]', error.errcode ?? '', error.message)
        throw new HttpError('login_failed')
      }
      throw error
    }
    return tokens.issue(openid)
  }

  async function optimize(req) {
    const session = tokens.verify(bearer(req))
    if (!session) throw new HttpError('unauthorized')
    const request = parseOptimize(await readJson(req, maxBodyBytes), maxInputChars)
    const slot = limiter.begin(session.sub)
    if (!slot.ok) throw new HttpError(slot.reason)
    let succeeded = false
    try {
      await check(session.openid, request.instruction ? request.prompt + '\n' + request.instruction : request.prompt, 'input_risky')
      let result
      try {
        result = await llm.complete(buildMessages(request))
      } catch (error) {
        if (!(error instanceof LlmError)) throw error
        log('[llm]', session.sub, error.kind, error.message)
        throw new HttpError(error.kind === 'timeout' ? 'llm_timeout' : 'llm_failed')
      }
      await check(session.openid, result, 'output_risky')
      succeeded = true
      return { result, remaining: limiter.remaining(session.sub) }
    } finally {
      slot.release(succeeded)
    }
  }

  const routes = {
    'GET /healthz': async () => ({ ok: true }),
    'POST /api/mp/login': login,
    'POST /api/mp/optimize': optimize
  }

  const server = http.createServer(async (req, res) => {
    const route = routes[req.method + ' ' + new URL(req.url, 'http://x').pathname]
    try {
      if (!route) throw new HttpError('not_found')
      send(res, 200, await route(req))
    } catch (error) {
      const known = error instanceof HttpError
      if (!known) log('[internal]', error)
      const code = known ? error.code : 'internal'
      send(res, ERRORS[code][0], { error: { code, message: known ? error.message : ERRORS.internal[1] } })
    }
  })
  server.requestTimeout = config.limits.requestTimeoutMs
  return server
}
