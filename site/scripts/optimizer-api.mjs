// 网站构建时写给优化器（goprmpt.net）读的静态接口文件，全部从 library/*.json 生成。
// - api/public/prompt-source/<importCode>：单条导入文件，格式见 library/schema.mjs 的 toPromptSource。
// - api/public/prompts/catalog/<zh|en>/<mode>.json：灵感弹窗和竞技场题库的目录，
//   由 packages/ui/src/utils/prompt-garden-suggestions.ts 读取，搜索、分页和随机推荐都在优化器里做。
import { PROMPT_LANGUAGES, promptSources } from '../../library/schema.mjs'

// 优化器的全部工作区，和 useAppPromptGardenImport.ts 的 SUPPORTED_KEYS 一致；每个都生成目录，免得弹窗 404。
export const OPTIMIZER_MODES = [
  'basic-system',
  'basic-user',
  'pro-multi',
  'pro-variable',
  'image-text2image',
  'image-image2image',
  'image-multiimage',
  'arena'
]
const EXCERPT_LENGTH = 160

export const catalogFileName = (language, mode) => `api/public/prompts/catalog/${language}/${mode}.json`

// 竞技场拿任何提示词比模型；其他工作区只列为它写的提示词。
const promptsForMode = (prompts, mode) => (mode === 'arena' ? prompts : prompts.filter((prompt) => prompt.target === mode))

function browseUrlFor(mode) {
  if (mode.startsWith('image-')) return '/library/?type=image'
  if (mode === 'arena') return '/library/'
  return '/library/?type=text'
}

function excerpt(text) {
  const flat = text.replace(/\s+/gu, ' ').trim()
  return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH)}…` : flat
}

function catalogItem(prompt, category, language) {
  const content = prompt.locales[language]
  return {
    id: prompt.id,
    importCode: prompt.importCodes[language],
    title: content.title,
    summary: content.summary,
    excerpt: excerpt(content.prompt),
    categoryPath: [language === 'en' && category.en ? category.en.name : category.name],
    tags: prompt.tags,
    mode: prompt.target
  }
}

export function catalogs(library) {
  const categoryById = new Map(library.categories.map((category) => [category.id, category]))
  return PROMPT_LANGUAGES.flatMap((language) =>
    OPTIMIZER_MODES.map((mode) => ({
      language,
      mode,
      fileName: catalogFileName(language, mode),
      data: {
        items: promptsForMode(library.prompts, mode).map((prompt) =>
          catalogItem(prompt, categoryById.get(prompt.category), language)
        ),
        browseUrl: browseUrlFor(mode)
      }
    }))
  )
}

/** 全部接口文件：[{ fileName, data }]。 */
export function optimizerApiFiles(library) {
  return [
    ...promptSources(library).map(({ importCode, data }) => ({ fileName: `api/public/prompt-source/${importCode}`, data })),
    ...catalogs(library).map(({ fileName, data }) => ({ fileName, data }))
  ]
}
