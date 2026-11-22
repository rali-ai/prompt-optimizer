import { escapeHtml } from './html.js'

// Lesson bodies use a small Markdown subset: paragraphs, - / 1. lists,
// **bold**, `inline code` and ``` fenced code blocks.
const LIST_ITEM = /^\s*([-*]|\d+[.)])\s+(.*)$/
const FENCE = /^\s*```/

function renderInline(text) {
  return text
    .split(/(`[^`]+`)/)
    .map((part, index) => {
      if (index % 2 === 1) return `<code>${escapeHtml(part.slice(1, -1))}</code>`
      return escapeHtml(part).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    })
    .join('')
}

function isOrdered(marker) {
  return /\d/.test(marker)
}

export function renderMarkdown(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (!line.trim()) {
      index += 1
      continue
    }

    if (FENCE.test(line)) {
      const code = []
      index += 1
      while (index < lines.length && !FENCE.test(lines[index])) code.push(lines[index++])
      index += 1
      blocks.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }

    const firstItem = line.match(LIST_ITEM)
    if (firstItem) {
      const ordered = isOrdered(firstItem[1])
      const items = []
      while (index < lines.length) {
        const item = lines[index].match(LIST_ITEM)
        if (!item || isOrdered(item[1]) !== ordered) break
        items.push(renderInline(item[2]))
        index += 1
      }
      const tag = ordered ? 'ol' : 'ul'
      const start = ordered && Number.parseInt(firstItem[1], 10) !== 1 ? ` start="${Number.parseInt(firstItem[1], 10)}"` : ''
      blocks.push(`<${tag}${start}>${items.map((item) => `<li>${item}</li>`).join('')}</${tag}>`)
      continue
    }

    const paragraph = []
    while (index < lines.length && lines[index].trim() && !FENCE.test(lines[index]) && !LIST_ITEM.test(lines[index])) {
      paragraph.push(renderInline(lines[index].trim()))
      index += 1
    }
    blocks.push(`<p>${paragraph.join('<br>')}</p>`)
  }

  return blocks.join('')
}
