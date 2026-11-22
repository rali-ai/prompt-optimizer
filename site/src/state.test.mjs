import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeLocale,
  resolveInitialLocale,
  nextLocale,
  contentLanguage,
  htmlLang,
  categoryCopy,
  safeExternalHref,
  renderSourceCredit
} from './locale.js'
import {
  PAGE_SIZE,
  buildLibraryEntries,
  popularTagsFor,
  parseLibraryUrlState,
  buildLibraryUrlSearch,
  filterLibraryEntries,
  buildOptimizerHref,
  splitPromptExample
} from './library-state.js'
import {
  parseLearnUrlState,
  buildLearnUrlSearch
} from './learn-state.js'

const sampleCategories = [
  { id: 'writing', name: '写作创作', description: '文章与故事。', kind: 'text', en: { name: 'Writing', description: 'Articles and stories.' } },
  { id: 'poster', name: '宣传海报', description: '活动海报。', kind: 'image', en: { name: 'Posters', description: 'Event posters.' } }
]

const samplePrompts = [
  {
    id: 'plain-language-explainer',
    category: 'writing',
    tags: ['白话', '教学', '科普'],
    target: 'basic-user',
    locales: {
      zh: { title: '复杂概念白话讲解', summary: '把难懂的概念讲清楚。', prompt: '请用白话解释 {{主题}}', variables: [{ name: '主题', description: '概念', defaultValue: '量子纠缠' }] },
      en: { title: 'Plain-language explainer', summary: 'Explain hard ideas simply.', prompt: 'Explain {{topic}} simply.', variables: [{ name: 'topic', description: 'Concept', defaultValue: 'Entropy' }] }
    },
    importCodes: { zh: 'plain-language-explainer', en: 'plain-language-explainer-en' }
  },
  {
    id: 'solar-term-poster',
    category: 'poster',
    tags: ['海报', '节气', '教学'],
    target: 'image-text2image',
    locales: {
      zh: { title: '节气海报', summary: '生成二十四节气海报。', prompt: '绘制 {{节气}} 海报', variables: [] },
      en: { title: 'Solar term poster', summary: 'Generate a solar term poster.', prompt: 'Draw a {{term}} poster', variables: [] }
    },
    importCodes: { zh: 'solar-term-poster', en: 'solar-term-poster-en' }
  }
]

test('locale helpers detect zh/en, toggle, and escape source credits safely', () => {
  assert.equal(normalizeLocale('zh-CN'), 'zh-CN')
  assert.equal(normalizeLocale('zh-TW'), 'zh-CN')
  assert.equal(normalizeLocale('en-US'), 'en')
  assert.equal(normalizeLocale('ja'), 'en')
  assert.equal(resolveInitialLocale({ stored: 'en', browserLanguage: 'zh-CN' }), 'en')
  assert.equal(resolveInitialLocale({ stored: null, browserLanguage: 'zh-SG' }), 'zh-CN')
  assert.equal(resolveInitialLocale({ stored: 'invalid', browserLanguage: 'fr-FR' }), 'en')
  assert.equal(nextLocale('zh-CN'), 'en')
  assert.equal(nextLocale('en'), 'zh-CN')
  assert.equal(contentLanguage('zh-CN'), 'zh')
  assert.equal(contentLanguage('en'), 'en')
  assert.equal(htmlLang('zh-CN'), 'zh-CN')
  assert.equal(htmlLang('en'), 'en')

  assert.deepEqual(categoryCopy(sampleCategories[0], 'zh'), { name: '写作创作', description: '文章与故事。' })
  assert.deepEqual(categoryCopy(sampleCategories[0], 'en'), { name: 'Writing', description: 'Articles and stories.' })

  assert.equal(safeExternalHref('https://example.com/a?b=1'), 'https://example.com/a?b=1')
  assert.equal(safeExternalHref('javascript:alert(1)'), null)
  assert.equal(
    renderSourceCredit({ name: 'Prompt Garden', url: 'https://garden.always200.com/x', license: '原创重写' }, 'zh-CN'),
    '来源：<a href="https://garden.always200.com/x" target="_blank" rel="noopener noreferrer">Prompt Garden</a> · 原创重写'
  )
  assert.equal(
    renderSourceCredit({ name: 'Prompt Garden', url: 'https://garden.always200.com/x', license: 'Original rewrite' }, 'en'),
    'Source: <a href="https://garden.always200.com/x" target="_blank" rel="noopener noreferrer">Prompt Garden</a> · Original rewrite'
  )
  assert.equal(
    renderSourceCredit({ name: 'Bad <Link>', url: 'javascript:alert(1)' }, 'zh-CN'),
    '来源：Bad &lt;Link&gt;'
  )
})

test('library state filters by kind, category, tag, and keyword across languages', () => {
  assert.equal(PAGE_SIZE, 24)
  const entries = buildLibraryEntries(samplePrompts, sampleCategories)
  assert.equal(entries[0].kind, 'text')
  assert.equal(entries[1].kind, 'image')

  const all = filterLibraryEntries(entries, sampleCategories, { kind: 'all', category: 'all', tag: '', q: '' })
  assert.equal(all.visible.length, 2)
  assert.deepEqual(all.kindCounts, { all: 2, text: 1, image: 1 })
  assert.equal(all.categoryCounts.writing, 1)
  assert.equal(all.categoryCounts.poster, 1)

  const imageOnly = filterLibraryEntries(entries, sampleCategories, { kind: 'image', category: 'all', tag: '', q: '' })
  assert.equal(imageOnly.visible.length, 1)
  assert.equal(imageOnly.visible[0].id, 'solar-term-poster')

  const byTag = filterLibraryEntries(entries, sampleCategories, { kind: 'all', category: 'all', tag: '白话', q: '' })
  assert.equal(byTag.visible.length, 1)
  assert.equal(byTag.visible[0].id, 'plain-language-explainer')

  const byId = filterLibraryEntries(entries, sampleCategories, { kind: 'all', category: 'all', tag: '', q: 'plain-language-explainer-en' })
  assert.equal(byId.visible.length, 1)

  const tags = popularTagsFor(entries, { kind: 'all', limit: 2, activeTag: '白话' })
  assert.equal(tags[0].tag, '教学')
  assert.ok(tags.some((item) => item.tag === '白话'))
})

test('library URL state round-trips query params, legacy type/hash, and optimizer href', () => {
  const parsed = parseLibraryUrlState('?type=image&category=poster&tag=%E6%B5%B7%E6%8A%A5&q=solar', '#solar-term-poster', sampleCategories)
  assert.deepEqual(parsed, { kind: 'image', category: 'poster', tag: '海报', q: 'solar', id: 'solar-term-poster' })

  const mismatched = parseLibraryUrlState('?kind=text&category=poster', '', sampleCategories)
  assert.equal(mismatched.category, 'all')

  const serialized = buildLibraryUrlSearch({ kind: 'text', category: 'writing', tag: '白话', q: 'abc', id: 'plain-language-explainer' })
  assert.equal(serialized, '?kind=text&category=writing&tag=%E7%99%BD%E8%AF%9D&q=abc&id=plain-language-explainer')
  assert.equal(buildLibraryUrlSearch({ kind: 'all', category: 'all', tag: '', q: '', id: '' }), '')

  const entries = buildLibraryEntries(samplePrompts, sampleCategories)
  assert.equal(
    buildOptimizerHref(entries[0], 'zh'),
    'https://goprmpt.net/#/basic/user?importCode=plain-language-explainer&subModeKey=basic-user'
  )
  assert.equal(
    buildOptimizerHref(entries[1], 'en'),
    'https://goprmpt.net/#/image/text2image?importCode=solar-term-poster-en&subModeKey=image-text2image'
  )
})

test('splitPromptExample separates example body and known limitations', () => {
  const split = splitPromptExample('示例输入：A\n效果：B\n已知局限：容易写错字。')
  assert.equal(split.body, '示例输入：A\n效果：B')
  assert.equal(split.limitation, '容易写错字。')
  assert.deepEqual(splitPromptExample(''), { body: '', limitation: '' })
})

test('learn URL state parses track, id, and legacy hash links', () => {
  const lessonById = new Map([
    ['course-four-elements', { id: 'course-four-elements', track: 'course' }],
    ['pattern-do-and-dont', { id: 'pattern-do-and-dont', track: 'pattern' }]
  ])

  assert.deepEqual(parseLearnUrlState('?track=pattern', '', lessonById), { track: 'pattern', id: '' })
  assert.deepEqual(parseLearnUrlState('?id=pattern-do-and-dont', '', lessonById), { track: 'pattern', id: 'pattern-do-and-dont' })
  assert.deepEqual(parseLearnUrlState('', '#course-four-elements', lessonById), { track: 'course', id: 'course-four-elements' })
  assert.equal(buildLearnUrlSearch({ track: 'course', id: '' }), '')
  assert.equal(buildLearnUrlSearch({ track: 'pattern', id: '' }), '?track=pattern')
  assert.equal(buildLearnUrlSearch({ track: 'pattern', id: 'pattern-do-and-dont' }), '?track=pattern&id=pattern-do-and-dont')
})
