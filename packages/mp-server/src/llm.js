// OpenAI 兼容的 chat completions 调用（DeepSeek、通义、豆包都支持）。形状：{ complete(messages) → 文本 }。

export class LlmError extends Error {
  constructor(kind, message) {
    super(message)
    this.kind = kind // 'timeout' | 'upstream' | 'empty'
  }
}

// 去掉推理模型夹带的 <think> 段，以及把整段输出包起来的代码块。
export function cleanText(text) {
  const out = text.replace(/^\s*<think>[\s\S]*?<\/think>/, '').trim()
  const fence = /^```[\w-]*\n([\s\S]*?)\n```$/.exec(out)
  return fence ? fence[1].trim() : out
}

function contentText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('')
  return ''
}

export function createLlm({ baseUrl, apiKey, model, timeoutMs, fetch = globalThis.fetch }) {
  const url = /\/chat\/completions$/.test(baseUrl) ? baseUrl : baseUrl + '/chat/completions'

  async function complete(messages) {
    let res
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
        body: JSON.stringify({ model, messages, stream: false }),
        signal: AbortSignal.timeout(timeoutMs)
      })
    } catch (error) {
      if (error.name === 'TimeoutError') throw new LlmError('timeout', '模型响应超时')
      throw new LlmError('upstream', '连接模型服务失败：' + error.message)
    }
    const body = await res.text()
    if (!res.ok) throw new LlmError('upstream', `模型服务返回 HTTP ${res.status}：${body.slice(0, 200)}`)
    let data
    try {
      data = JSON.parse(body)
    } catch {
      throw new LlmError('upstream', '模型服务返回了无法解析的内容')
    }
    const text = cleanText(contentText(data?.choices?.[0]?.message?.content))
    if (!text) throw new LlmError('empty', '模型没有返回内容')
    return text
  }

  return { complete }
}

// LLM_FAKE=1 用：不联网，按 system 首行和用户消息生成确定的结果，便于本地联调和测试。
export const fakeLlm = {
  async complete(messages) {
    const system = messages[0].content.split('\n')[0]
    const user = messages[messages.length - 1].content
    return `【模拟优化结果】\n${system}\n\n${user.slice(0, 500)}`
  }
}
