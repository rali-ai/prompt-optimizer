// 调用 OpenAI 兼容接口 POST {baseUrl}/chat/completions（非流式）。
// 只有 postChatCompletions 会发网络请求。改走宿主自己的后端时只换这一个函数，
// 返回形状保持 { statusCode, data }，data 为 OpenAI chat.completion 格式即可。

const TIMEOUT_MS = 60000

function llmError(kind, message) {
  const error = new Error(message)
  error.kind = kind
  return error
}

function endpoint(baseUrl) {
  const base = String(baseUrl).trim().replace(/\/+$/, '')
  return /\/chat\/completions$/.test(base) ? base : base + '/chat/completions'
}

function hostOf(url) {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url)
  return match ? match[1] : url
}

function checkSettings(settings) {
  const baseUrl = String(settings.baseUrl || '').trim()
  if (!baseUrl) throw llmError('config', '请先在设置里填写接口地址。')
  if (!/^https:\/\//i.test(baseUrl)) throw llmError('config', '接口地址必须以 https:// 开头，小程序只能发 HTTPS 请求。')
  if (!settings.apiKey) throw llmError('config', '请先在设置里填写 API Key。')
  if (!settings.model) throw llmError('config', '请先在设置里填写模型名称。')
}

function postChatCompletions(settings, body) {
  checkSettings(settings)
  const url = endpoint(settings.baseUrl)
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'POST',
      timeout: TIMEOUT_MS,
      dataType: 'json',
      header: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + settings.apiKey
      },
      data: body,
      success: (res) => resolve({ statusCode: res.statusCode, data: res.data }),
      fail: (err) => reject(errorFromWxFail(err, url))
    })
  })
}

function apiMessage(data) {
  let body = data
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch (e) {
      return body.slice(0, 200)
    }
  }
  if (!body || typeof body !== 'object') return ''
  const error = body.error
  const message = (error && typeof error === 'object' && (error.message || error.msg)) ||
    (typeof error === 'string' && error) || body.message || body.msg || ''
  return String(message).slice(0, 200)
}

function errorFromStatus(statusCode, data) {
  const detail = apiMessage(data)
  const suffix = detail ? '\n平台返回：' + detail : ''
  if (statusCode === 401 || statusCode === 403) {
    return llmError('auth', 'API Key 无效或没有权限（' + statusCode + '）。请到设置里检查 Key 是否填对、是否过期。' + suffix)
  }
  if (statusCode === 402) {
    return llmError('quota', '账户余额不足（402），请到模型平台充值后再试。' + suffix)
  }
  if (statusCode === 429) {
    return llmError('rate_limit', '请求太频繁或额度已用完（429），请稍后再试，或到模型平台查看余额和限流。' + suffix)
  }
  if (statusCode === 404) {
    return llmError('not_found', '接口地址或模型名称不对（404）。请检查接口地址（通常以 /v1 这类版本路径结尾）和模型名。' + suffix)
  }
  if (statusCode >= 500) {
    return llmError('server', '模型服务暂时不可用（' + statusCode + '），请稍后再试。' + suffix)
  }
  return llmError('http', '请求失败（' + statusCode + '）。' + suffix)
}

function errorFromWxFail(err, url) {
  const message = String((err && err.errMsg) || '')
  if (/domain list/i.test(message)) {
    return llmError('domain', '接口域名 ' + hostOf(url) + ' 不在小程序的 request 合法域名里。请到小程序后台「开发管理 → 开发设置 → 服务器域名」添加；开发时可在开发者工具里勾选「不校验合法域名」。')
  }
  if (/time ?out|timed out/i.test(message)) {
    return llmError('timeout', '请求超时（60 秒没有响应）。模型可能较慢，请稍后重试或换一个更快的模型。')
  }
  return llmError('network', '网络连接失败，请检查网络后重试。' + (message ? '（' + message + '）' : ''))
}

function contentText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === 'string' ? part : (part && part.text) || '')).join('')
  }
  return ''
}

// 去掉推理模型夹带的 <think> 段，以及把整段输出包起来的代码块。
function cleanText(text) {
  const out = text.replace(/^\s*<think>[\s\S]*?<\/think>/, '').trim()
  const fence = /^```[\w-]*\n([\s\S]*?)\n```$/.exec(out)
  return fence ? fence[1].trim() : out
}

function parseResponse(statusCode, data) {
  if (statusCode < 200 || statusCode >= 300) throw errorFromStatus(statusCode, data)
  let body = data
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch (e) {
      throw llmError('bad_response', '模型返回的内容无法解析，请检查接口地址是否正确。')
    }
  }
  const message = body && body.choices && body.choices[0] && body.choices[0].message
  const text = cleanText(contentText(message && message.content))
  if (!text) throw llmError('empty', '模型没有返回内容，请重试或换一个模型。')
  return text
}

// messages: [{ role: 'system' | 'user' | 'assistant', content: string }]，返回模型输出的文本。
function chat(settings, messages) {
  return Promise.resolve()
    .then(() => postChatCompletions(settings, { model: settings.model, messages, stream: false }))
    .then((res) => parseResponse(res.statusCode, res.data))
}

// 发一条最短的对话，只看接口是否返回 2xx。
function testConnection(settings) {
  return Promise.resolve()
    .then(() => postChatCompletions(settings, {
      model: settings.model,
      messages: [{ role: 'user', content: '你好' }],
      stream: false
    }))
    .then((res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) throw errorFromStatus(res.statusCode, res.data)
    })
}

module.exports = { TIMEOUT_MS, chat, testConnection }
