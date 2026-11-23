import { escapeHtml } from './html.js'

const HEADING_RE = /^(#{1,4})\s+(.+?)\s*$/
const IMAGE_RE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/
const LIST_ITEM_RE = /^(\s*)([-*]|\d+\.)\s+(.*)$/
const FENCE_RE = /^\s*```([a-zA-Z0-9_-]*)\s*$/
const HR_RE = /^\s*---+\s*$/
const TABLE_SEP_RE = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/

function safeUrl(raw) {
  const trimmed = String(raw ?? '').trim()
  if (trimmed.startsWith('/')) return trimmed
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString()
  } catch {
    return null
  }
  return null
}

function linkifyPlainText(escaped) {
  return escaped.replace(/https?:\/\/[^\s<>"'）)]+/g, (match) => {
    let url = match
    let trailing = ''
    while (/[.,;:!?。，；：！？、]$/.test(url)) {
      trailing = url.slice(-1) + trailing
      url = url.slice(0, -1)
    }
    const href = safeUrl(url)
    if (!href) return match
    const isSameOrigin = href.startsWith('https://goprmpt.com/')
    const targetAttr = isSameOrigin ? '' : ' target="_blank" rel="noopener noreferrer"'
    return `<a class="guide-link" href="${escapeHtml(href)}"${targetAttr}>${escapeHtml(url)}</a>${trailing}`
  })
}

export function renderInlineMarkdown(text) {
  return String(text ?? '')
    .split(/(`[^`]+`)/)
    .map((part, index) => {
      if (index % 2 === 1) return `<code>${escapeHtml(part.slice(1, -1))}</code>`
      const tokens = []
      const withLinks = part.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (full, label, rawHref) => {
        const href = safeUrl(rawHref)
        if (!href) return full
        const key = `\u0000LINK${tokens.length}\u0000`
        const isSameOrigin = href.startsWith('https://goprmpt.com/') || href.startsWith('/')
        const targetAttr = isSameOrigin ? '' : ' target="_blank" rel="noopener noreferrer"'
        tokens.push(`<a class="guide-link" href="${escapeHtml(href)}"${targetAttr}>${escapeHtml(label)}</a>`)
        return key
      })
      let html = escapeHtml(withLinks).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      html = linkifyPlainText(html)
      return html.replace(/\u0000LINK(\d+)\u0000/g, (_, idx) => tokens[Number(idx)] ?? '')
    })
    .join('')
}

function resolveImageSrc(rawSrc, imageBaseUrl) {
  const cleaned = String(rawSrc ?? '').trim()
  if (cleaned.startsWith('./images/')) {
    return `${imageBaseUrl.replace(/\/$/, '')}/${cleaned.slice('./images/'.length)}`
  }
  if (cleaned.startsWith('images/')) {
    return `${imageBaseUrl.replace(/\/$/, '')}/${cleaned.slice('images/'.length)}`
  }
  return safeUrl(cleaned) ?? ''
}

function splitTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

function renderListItems(lines, startIndex) {
  const firstMatch = lines[startIndex].match(LIST_ITEM_RE)
  const ordered = /\d/.test(firstMatch[2])
  const baseIndent = firstMatch[1].length
  const items = []
  let index = startIndex

  while (index < lines.length) {
    const match = lines[index].match(LIST_ITEM_RE)
    if (!match) break
    const indent = match[1].length
    const itemOrdered = /\d/.test(match[2])
    if (indent > baseIndent && items.length > 0) {
      const sub = renderListItems(lines, index)
      items[items.length - 1] += sub.html
      index = sub.nextIndex
      continue
    }
    if (indent < baseIndent || itemOrdered !== ordered) break
    items.push(renderInlineMarkdown(match[3]))
    index += 1
  }

  const tag = ordered ? 'ol' : 'ul'
  const startNum = ordered ? Number.parseInt(firstMatch[2], 10) : 1
  const startAttr = ordered && startNum !== 1 ? ` start="${startNum}"` : ''
  return {
    html: `<${tag}${startAttr}>${items.map((item) => `<li>${item}</li>`).join('')}</${tag}>`,
    nextIndex: index
  }
}

function renderCallout(quoteLines) {
  const cleaned = quoteLines.map((line) => line.replace(/^\s*>\s?/, ''))
  let title = ''
  const bodyLines = [...cleaned]
  const first = bodyLines[0] ?? ''
  const labelMatch = first.match(/^(图中重点|讲师提示|常见卡点与处理|提示)[：:]\s*(.*)$/)
  if (labelMatch) {
    title = labelMatch[1]
    if (labelMatch[2].trim()) {
      bodyLines[0] = labelMatch[2].trim()
    } else {
      bodyLines.shift()
    }
  }

  const innerParts = []
  let idx = 0
  while (idx < bodyLines.length) {
    const current = bodyLines[idx]
    if (!current.trim()) {
      idx += 1
      continue
    }
    if (LIST_ITEM_RE.test(current)) {
      const list = renderListItems(bodyLines, idx)
      innerParts.push(list.html)
      idx = list.nextIndex
      continue
    }
    const para = []
    while (idx < bodyLines.length && bodyLines[idx].trim() && !LIST_ITEM_RE.test(bodyLines[idx])) {
      para.push(renderInlineMarkdown(bodyLines[idx].trim()))
      idx += 1
    }
    innerParts.push(`<p>${para.join('<br>')}</p>`)
  }

  return `
    <aside class="guide-callout">
      ${title ? `<p class="guide-callout__title">${escapeHtml(title)}</p>` : ''}
      <div class="guide-callout__body">${innerParts.join('')}</div>
    </aside>
  `
}

export function renderGuideDocument(source, { imageBaseUrl = '/images/guide', copyLabel = '复制示例', zoomLabel = '点击查看大图' } = {}) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  const toc = []
  const copyBlocks = []
  let title = ''
  let lead = ''
  let sectionCounter = 0
  let imageCounter = 0
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (!line.trim()) {
      index += 1
      continue
    }

    if (HR_RE.test(line)) {
      blocks.push('<hr class="guide-divider" />')
      index += 1
      continue
    }

    const headingMatch = line.match(HEADING_RE)
    if (headingMatch) {
      const level = headingMatch[1].length
      const rawText = headingMatch[2].trim()
      if (level === 1 && !title) {
        title = rawText
        index += 1
        continue
      }
      sectionCounter += 1
      const id = `sec-${sectionCounter}`
      if (level === 2 || level === 3) {
        toc.push({ id, level, text: rawText })
      }
      blocks.push(`<h${level} id="${id}" class="guide-heading guide-heading--${level}">${renderInlineMarkdown(rawText)}</h${level}>`)
      index += 1
      continue
    }

    const fenceMatch = line.match(FENCE_RE)
    if (fenceMatch) {
      const lang = fenceMatch[1].toLowerCase()
      const codeLines = []
      index += 1
      while (index < lines.length && !FENCE_RE.test(lines[index])) {
        codeLines.push(lines[index])
        index += 1
      }
      index += 1
      const rawCode = codeLines.join('\n')
      const blockIdx = copyBlocks.length
      copyBlocks.push(rawCode)
      const label = lang === 'prompt' ? '可直接复制的示例指令' : (lang || '示例内容')
      blocks.push(`
        <div class="guide-snippet">
          <div class="guide-snippet__head">
            <span>${escapeHtml(label)}</span>
            <button type="button" class="copy-mini" data-copy-snippet="${blockIdx}">${escapeHtml(copyLabel)}</button>
          </div>
          <pre><code>${escapeHtml(rawCode)}</code></pre>
        </div>
      `)
      continue
    }

    const imageMatch = line.trim().match(IMAGE_RE)
    if (imageMatch) {
      const alt = imageMatch[1].trim()
      const src = resolveImageSrc(imageMatch[2], imageBaseUrl)
      imageCounter += 1
      const loadingAttr = imageCounter <= 2 ? 'eager' : 'lazy'
      if (src) {
        blocks.push(`
          <figure class="guide-figure">
            <button type="button" class="guide-figure__trigger" data-zoom-src="${escapeHtml(src)}" data-zoom-alt="${escapeHtml(alt)}" aria-label="${escapeHtml(`${zoomLabel}：${alt}`)}">
              <img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="${loadingAttr}" decoding="async" />
              <span class="guide-figure__zoom">${escapeHtml(zoomLabel)}</span>
            </button>
            ${alt ? `<figcaption>${escapeHtml(alt)}</figcaption>` : ''}
          </figure>
        `)
      }
      index += 1
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines = []
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index])
        index += 1
      }
      blocks.push(renderCallout(quoteLines))
      continue
    }

    if (line.includes('|') && index + 1 < lines.length && TABLE_SEP_RE.test(lines[index + 1])) {
      const headers = splitTableRow(line)
      index += 2
      const rows = []
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        rows.push(splitTableRow(lines[index]))
        index += 1
      }
      blocks.push(`
        <div class="guide-table-wrap">
          <table class="guide-table">
            <thead>
              <tr>${headers.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${rows.map((row) => `<tr>${headers.map((_, colIdx) => `<td>${renderInlineMarkdown(row[colIdx] ?? '')}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>
      `)
      continue
    }

    if (LIST_ITEM_RE.test(line)) {
      const list = renderListItems(lines, index)
      blocks.push(list.html)
      index = list.nextIndex
      continue
    }

    const paraLines = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !HEADING_RE.test(lines[index]) &&
      !FENCE_RE.test(lines[index]) &&
      !IMAGE_RE.test(lines[index].trim()) &&
      !/^\s*>\s?/.test(lines[index]) &&
      !HR_RE.test(lines[index]) &&
      !LIST_ITEM_RE.test(lines[index])
    ) {
      paraLines.push(lines[index].trim())
      index += 1
    }
    const paraText = paraLines.join(' ')
    if (!lead && blocks.length === 0) {
      lead = paraText
    }
    blocks.push(`<p>${renderInlineMarkdown(paraText)}</p>`)
  }

  return {
    title,
    lead,
    toc,
    copyBlocks,
    html: blocks.join('\n')
  }
}
