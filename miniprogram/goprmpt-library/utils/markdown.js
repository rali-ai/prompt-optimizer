// 把教程里的 Markdown 段落拆成简单的块，供 WXML 逐块渲染。
// 只处理标题、列表、引用、代码块和段落；行内的 ** ` [](url) 记号直接去掉。

function inline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
}

// 返回 [{ type: 'h' | 'p' | 'li' | 'quote' | 'code', text }]
function toBlocks(markdown) {
  const blocks = []
  let paragraph = []
  let code = null
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'p', text: inline(paragraph.join('\n')) })
    paragraph = []
  }
  String(markdown || '').replace(/\r\n/g, '\n').split('\n').forEach((line) => {
    const trimmed = line.trim()
    if (code) {
      if (/^```/.test(trimmed)) {
        blocks.push({ type: 'code', text: code.join('\n') })
        code = null
      } else {
        code.push(line)
      }
      return
    }
    let match
    if (/^```/.test(trimmed)) {
      flush()
      code = []
    } else if (!trimmed) {
      flush()
    } else if ((match = /^#{1,6}\s+(.*)$/.exec(trimmed))) {
      flush()
      blocks.push({ type: 'h', text: inline(match[1]) })
    } else if ((match = /^[-*+]\s+(.*)$/.exec(trimmed))) {
      flush()
      blocks.push({ type: 'li', text: '• ' + inline(match[1]) })
    } else if ((match = /^(\d+)[.)]\s+(.*)$/.exec(trimmed))) {
      flush()
      blocks.push({ type: 'li', text: match[1] + '. ' + inline(match[2]) })
    } else if ((match = /^>\s?(.*)$/.exec(trimmed))) {
      flush()
      blocks.push({ type: 'quote', text: inline(match[1]) })
    } else {
      paragraph.push(trimmed)
    }
  })
  if (code) blocks.push({ type: 'code', text: code.join('\n') })
  flush()
  return blocks
}

module.exports = { toBlocks }
