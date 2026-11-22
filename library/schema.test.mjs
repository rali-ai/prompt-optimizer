import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { LibraryError, loadLibrary, promptSources } from './schema.mjs'

const valid = () => ({
  categories: [{ id: 'writing', name: '写作创作', description: '文章和故事。' }],
  prompts: [{
    id: 'weekly-report',
    title: '周报生成器',
    category: 'writing',
    tags: ['职场', '总结'],
    summary: '把零散的工作记录整理成周报。',
    target: 'basic-user',
    prompt: '本周工作记录：{{记录}}',
    variables: [{ name: '记录', description: '一行一条', defaultValue: '' }],
    en: {
      title: 'Weekly Report Generator',
      summary: 'Turn work notes into a weekly report.',
      prompt: 'Notes: {{notes}}',
      variables: [{ name: 'notes', description: 'One per line', defaultValue: '' }]
    }
  }],
  learn: [{
    id: 'clear-goal',
    track: 'course',
    title: '第 1 课：先说清目标',
    summary: '先说目标。',
    sections: [{ heading: '为什么', body: '正文' }],
    before: '写个周报',
    after: '写一份给经理看的周报',
    exercise: '改写一句提示词',
    en: {
      title: 'Lesson 1: State the goal first',
      summary: 'Say what you want first.',
      sections: [{ heading: 'Why', body: 'Text' }],
      before: 'Write a report',
      after: 'Write a weekly report for my manager',
      exercise: 'Rewrite one prompt'
    }
  }]
})

function writeLibrary(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'library-schema-'))
  for (const [name, data] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, `${name}.json`), typeof data === 'string' ? data : JSON.stringify(data))
  }
  return dir
}

function load(mutate = () => {}) {
  const files = valid()
  mutate(files)
  const dir = writeLibrary(files)
  try {
    return loadLibrary(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

// 返回 LibraryError 列出的全部问题；数据合法时测试失败。
function problems(mutate) {
  try {
    load(mutate)
  } catch (error) {
    assert.ok(error instanceof LibraryError, error.message)
    return error.problems
  }
  assert.fail('expected a LibraryError')
}

function assertProblem(mutate, ...patterns) {
  const list = problems(mutate)
  for (const pattern of patterns) {
    assert.ok(list.some((problem) => pattern.test(problem)), `no problem matches ${pattern}:\n${list.join('\n')}`)
  }
  return list
}

test('valid data loads into categories, prompts with both languages, and lessons', () => {
  const library = load()
  assert.deepEqual(library.categories, [{ id: 'writing', name: '写作创作', description: '文章和故事。' }])
  const [prompt] = library.prompts
  assert.equal(prompt.locales.zh.prompt, '本周工作记录：{{记录}}')
  assert.equal(prompt.locales.en.title, 'Weekly Report Generator')
  assert.deepEqual(prompt.importCodes, { zh: 'weekly-report', en: 'weekly-report-en' })
  assert.equal(library.lessons[0].locales.zh.after, '写一份给经理看的周报')
  assert.equal(library.lessons[0].locales.en.title, 'Lesson 1: State the goal first')
  assert.equal(library.lessons[0].track, 'course')
})

test('every problem across all three files is reported in one error', () => {
  const list = problems((files) => {
    files.categories[0].name = ''
    files.prompts[0].target = 'video'
    files.learn[0].sections = []
  })
  assert.equal(list.length, 3, list.join('\n'))
})

test('unreadable JSON and a non-array top level fail', () => {
  assertProblem((files) => { files.prompts = '{ broken' }, /prompts\.json：无法读取或解析/)
  assertProblem((files) => { files.learn = {} }, /learn\.json：顶层必须是数组/)
})

test('missing, unknown and empty fields fail', () => {
  assertProblem((files) => { delete files.prompts[0].summary }, /weekly-report.*缺少字段 summary/)
  assertProblem((files) => { files.prompts[0].author = 'x' }, /weekly-report.*未知字段 author/)
  assertProblem((files) => { files.prompts[0].title = '  ' }, /weekly-report.*title 必须是非空字符串/)
  assertProblem((files) => { files.prompts[0].example = '' }, /example 必须是非空字符串/)
})

test('ids must be kebab-case and unique; titles must be unique', () => {
  assertProblem((files) => { files.prompts[0].id = 'Weekly_Report' }, /id 只能用小写字母/)
  assertProblem((files) => { files.categories.push({ ...files.categories[0], name: '另一个' }) }, /categories\.json：id 重复：writing/)
  assertProblem((files) => { files.categories.push({ ...files.categories[0], id: 'other' }) }, /categories\.json：name 重复/)
  assertProblem((files) => { files.prompts.push({ ...files.prompts[0], id: 'other', en: { ...files.prompts[0].en, title: 'Other' } }) }, /中文标题重复/)
  assertProblem((files) => { files.learn.push({ ...files.learn[0] }) }, /learn\.json：id 重复/, /learn\.json：中文标题重复/)
})

test('an id that collides with another prompt\'s English import code fails', () => {
  assertProblem((files) => {
    files.prompts.push({ ...files.prompts[0], id: 'weekly-report-en', title: '英文撞车', en: { ...files.prompts[0].en, title: 'Collision' } })
  }, /英文导入码 weekly-report-en/)
})

test('category must exist and target must be a known workspace', () => {
  assertProblem((files) => { files.prompts[0].category = 'nope' }, /分类 nope 不在 categories\.json/)
  assertProblem((files) => { files.prompts[0].target = 'video' }, /target 只能是 basic-user \/ basic-system \/ image-text2image/)
})

test('tags need 2 to 4 distinct non-empty strings', () => {
  assertProblem((files) => { files.prompts[0].tags = ['职场'] }, /tags 需要 2 到 4 个/)
  assertProblem((files) => { files.prompts[0].tags = ['职场', '职场'] }, /tags 不能为空或重复/)
  assertProblem((files) => { files.prompts[0].tags = '职场' }, /tags 必须是数组/)
})

test('summary is one sentence ending with sentence punctuation, in each language', () => {
  assertProblem((files) => { files.prompts[0].summary = '整理周报' }, /summary 应是一句话/)
  assertProblem((files) => { files.prompts[0].en.summary = 'Write it. Then send it.' }, /\.en：summary 应是一句话/)
})

test('placeholders and declared variables must match one to one', () => {
  assertProblem((files) => { files.prompts[0].prompt += '{{语气}}' }, /prompt 用了 \{\{语气\}\}/)
  assertProblem((files) => {
    files.prompts[0].variables.push({ name: '多余', description: '没用到', defaultValue: '' })
    files.prompts[0].en.variables.push({ name: 'extra', description: 'unused', defaultValue: '' })
  }, /variables 声明了 多余/)
  assertProblem((files) => { files.prompts[0].en.prompt = 'Notes: {{notes}} {{tone}}' }, /\.en：prompt 用了 \{\{tone\}\}/)
  assertProblem((files) => { files.prompts[0].variables.push({ ...files.prompts[0].variables[0] }) }, /变量重复：记录/)
})

test('placeholder syntax and variable names follow the optimizer\'s rules', () => {
  assertProblem((files) => { files.prompts[0].prompt = '记录：{{{记录}}}' }, /三重花括号/)
  assertProblem((files) => { files.prompts[0].prompt = '记录：{{记录}} }}' }, /未配对的花括号/)
  assertProblem((files) => { files.prompts[0].prompt = '记录：{{记录}} {{1st}}' }, /占位符 \{\{1st\}\} 无效：变量名不能以数字开头/)
  assertProblem((files) => {
    files.prompts[0].variables[0].name = 'constructor'
    files.prompts[0].prompt = '{{constructor}}'
  }, /变量名是保留字/)
})

test('variables need name, description and a string defaultValue', () => {
  assertProblem((files) => { delete files.prompts[0].variables[0].description }, /variables\[0\]：缺少字段 description/)
  assertProblem((files) => { files.prompts[0].variables[0].defaultValue = 0 }, /defaultValue 必须是字符串/)
  assertProblem((files) => { files.prompts[0].variables = [null] }, /variables\[0\] 必须是对象/)
})

test('English is required, uses snake_case variable names and has as many variables as Chinese', () => {
  assertProblem((files) => { delete files.prompts[0].en }, /缺少字段 en/)
  assertProblem((files) => { files.prompts[0].en = 'Weekly report' }, /en 必须是对象/)
  assertProblem((files) => {
    files.prompts[0].en.variables[0].name = 'Notes'
    files.prompts[0].en.prompt = 'Notes: {{Notes}}'
  }, /snake_case/)
  assertProblem((files) => {
    files.prompts[0].en.variables = []
    files.prompts[0].en.prompt = 'Notes.'
  }, /变量数量与中文版不一致：中文 1 个，英文 0 个/)
})

test('categories may declare a kind that their prompts\' targets must match', () => {
  const [category] = load((files) => { files.categories[0].kind = 'text' }).categories
  assert.equal(category.kind, 'text')
  assertProblem((files) => { files.categories[0].kind = 'video' }, /kind 只能是 text \/ image：video/)
  assertProblem((files) => { files.categories[0].kind = 'image' }, /target basic-user 是 text 类，但分类 writing 是 image 类/)
})

test('categories may carry an English name and description', () => {
  const english = { name: 'Writing', description: 'Articles and stories.' }
  assert.deepEqual(load((files) => { files.categories[0].en = english }).categories[0].en, english)
  assertProblem((files) => { files.categories[0].en = { name: 'Writing' } }, /writing\)\.en：缺少字段 description/)
  assertProblem((files) => {
    files.categories[0].en = english
    files.categories.push({ id: 'other', name: '另一个', description: '别的。', en: english })
  }, /英文名重复：Writing/)
})

test('a prompt adapted from another library carries its source; free-text credit is gone', () => {
  const garden = { name: 'Prompt Garden', url: 'https://example.com/garden', license: 'CC BY 4.0' }
  const [prompt] = load((files) => { files.prompts[0].source = garden }).prompts
  assert.deepEqual(prompt.source, garden)
  assert.deepEqual(promptSources({ categories: load().categories, prompts: [prompt] })[0].data.meta.source, garden)

  assertProblem((files) => { files.prompts[0].source = { name: 'Garden', url: 'garden.example' } }, /source：url 必须是 http\(s\) 链接/)
  assertProblem((files) => { files.prompts[0].source = { url: 'https://example.com' } }, /source：缺少字段 name/)
  assertProblem((files) => { files.prompts[0].source = { ...garden, author: 'x' } }, /source：未知字段 author/)
  assertProblem((files) => { files.prompts[0].source = 'Prompt Garden' }, /source 必须是对象/)
  assertProblem((files) => { files.prompts[0].credit = '改编自 XXX' }, /未知字段 credit/)
})

test('lessons need at least one complete section and a real rewrite, in each language', () => {
  assertProblem((files) => { files.learn[0].sections = [] }, /sections 至少一节/)
  assertProblem((files) => { files.learn[0].sections = [{ heading: '缺正文' }] }, /sections\[0\]：缺少字段 body/)
  assertProblem((files) => { files.learn[0].after = files.learn[0].before }, /before 和 after 相同/)
  assertProblem((files) => { files.learn[0].en.after = files.learn[0].en.before }, /\.en：before 和 after 相同/)
  assertProblem((files) => { files.learn[0].en.sections = [{ heading: 'Why' }] }, /\.en\.sections\[0\]：缺少字段 body/)
})

test('every lesson is bilingual', () => {
  assertProblem((files) => { delete files.learn[0].en }, /clear-goal\)：缺少字段 en/)
  assertProblem((files) => { delete files.learn[0].en.exercise }, /clear-goal\)\.en：缺少字段 exercise/)
  assertProblem((files) => { files.learn.push({ ...files.learn[0], id: 'other', title: '第 2 课' }) }, /learn\.json：英文标题重复/)
})

test('lessons belong to the course or pattern track', () => {
  assertProblem((files) => { delete files.learn[0].track }, /缺少字段 track/)
  assertProblem((files) => { files.learn[0].track = 'blog' }, /track 只能是 course \/ pattern：blog/)
})

test('lessons are grouped by track, course first; within a track ordered lessons come first, sorted by order', () => {
  const lesson = (id, track, order) => {
    const base = valid().learn[0]
    return { ...base, id, track, title: id, ...(order === undefined ? {} : { order }), en: { ...base.en, title: id } }
  }
  const ids = load((files) => {
    files.learn = [lesson('p1', 'pattern', 1), lesson('a', 'course'), lesson('b', 'course', 2), lesson('c', 'course'), lesson('d', 'course', 1)]
  }).lessons.map((l) => l.id)
  assert.deepEqual(ids, ['d', 'b', 'a', 'c', 'p1'])
  assertProblem((files) => { files.learn[0].order = '1' }, /order 必须是数字/)
})

test('lesson summary is one sentence, in each language', () => {
  assertProblem((files) => { files.learn[0].summary = '先说目标。再说背景。' }, /clear-goal\)：summary 应是一句话/)
  assertProblem((files) => { files.learn[0].en.summary = 'Say it. Then say why.' }, /clear-goal\)\.en：summary 应是一句话/)
})

test('a lesson distilled from another library carries its source', () => {
  const source = { name: 'Prompt Garden', url: 'https://example.com/patterns' }
  const [lesson] = load((files) => { files.learn[0].track = 'pattern'; files.learn[0].source = source }).lessons
  assert.deepEqual(lesson.source, source)
  assertProblem((files) => { files.learn[0].source = { name: 'Prompt Garden' } }, /learn\.json.*source：缺少字段 url/)
})

test('prompt sources cover every prompt in both languages for the optimizer import', () => {
  const sources = promptSources(load())
  assert.deepEqual(sources.map((source) => source.importCode), ['weekly-report', 'weekly-report-en'])
  const [zh, en] = sources.map((source) => source.data)
  assert.equal(zh.optimizerTarget.subModeKey, 'basic-user')
  assert.equal(zh.prompt.text, '本周工作记录：{{记录}}')
  assert.deepEqual(en.variables, [{ name: 'notes', description: 'One per line', defaultValue: '' }])
  assert.deepEqual(en.meta.categoryPath, ['写作创作'])
})
