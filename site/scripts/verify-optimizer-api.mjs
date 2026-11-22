// Checks the built optimizer API files against what the optimizer accepts.
// - prompt-source files: the checks follow parseV1 in fetchPromptFromGarden
//   (packages/ui/src/composables/app/useAppPromptGardenImport.ts), which imports Vue and cannot run here.
// - catalog files: read through the optimizer's own fetchPromptGardenCatalog
//   (packages/ui/src/utils/prompt-garden-suggestions.ts) with fetch served from distDir.
//
// Usage: node scripts/verify-optimizer-api.mjs [distDir]   (LIBRARY_DIR overrides ../library)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROMPT_LANGUAGES, loadLibrary, variableNameError } from '../../library/schema.mjs'
import { OPTIMIZER_MODES, catalogFileName } from './optimizer-api.mjs'
import { fetchPromptGardenCatalog } from '../../packages/ui/src/utils/prompt-garden-suggestions.ts'

const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.resolve(siteDir, process.argv[2] ?? 'dist')
const libraryDir = path.resolve(siteDir, process.env.LIBRARY_DIR ?? '../library')
const sourceDir = path.join(distDir, 'api/public/prompt-source')
const BASE_URL = 'https://goprmpt.com'

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

function parseV1Problems(data, expectedCode) {
  if (!isRecord(data)) return ['not a JSON object']
  const problems = []
  if (data.schema !== 'prompt-garden.prompt.v1') problems.push(`schema is ${JSON.stringify(data.schema)}`)
  if (data.schemaVersion !== 1) problems.push(`schemaVersion is ${JSON.stringify(data.schemaVersion)}`)

  const subModeKey = isRecord(data.optimizerTarget) && typeof data.optimizerTarget.subModeKey === 'string'
    ? data.optimizerTarget.subModeKey.trim()
    : ''
  if (!subModeKey) problems.push('missing optimizerTarget.subModeKey')
  else if (!OPTIMIZER_MODES.includes(subModeKey)) problems.push(`optimizer has no workspace "${subModeKey}"`)

  const prompt = isRecord(data.prompt) ? data.prompt : {}
  if (prompt.format !== 'text') problems.push(`prompt.format is ${JSON.stringify(prompt.format)}, expected "text"`)
  else if (typeof prompt.text !== 'string' || !prompt.text.trim()) problems.push('empty prompt.text')

  if (!Array.isArray(data.variables)) {
    problems.push('variables is not an array')
  } else {
    data.variables.forEach((variable, index) => {
      const name = isRecord(variable) && typeof variable.name === 'string' ? variable.name.trim() : ''
      const error = variableNameError(name)
      if (error) problems.push(`variables[${index}] would be dropped by the optimizer: ${error}`)
    })
  }

  const importCode = typeof data.importCode === 'string' ? data.importCode.trim() : ''
  if (importCode !== expectedCode) problems.push(`importCode is ${JSON.stringify(data.importCode)}, expected "${expectedCode}"`)
  if (data.meta !== undefined && !isRecord(data.meta)) problems.push('meta is not an object')
  return problems
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

const { prompts } = loadLibrary(libraryDir)
const failures = []

// prompt-source
const expectedSources = new Map()
for (const prompt of prompts) {
  for (const language of PROMPT_LANGUAGES) {
    const code = prompt.importCodes[language]
    expectedSources.set(code, prompt.target)
    const file = path.join(sourceDir, code)
    if (!fs.existsSync(file)) {
      failures.push(`${code}: missing ${path.relative(siteDir, file)}`)
      continue
    }

    let data
    try {
      data = readJson(file)
    } catch (error) {
      failures.push(`${code}: invalid JSON (${error.message})`)
      continue
    }

    const problems = parseV1Problems(data, code)
    const content = prompt.locales[language]
    if (data.optimizerTarget?.subModeKey !== prompt.target) problems.push(`subModeKey is not the prompt target "${prompt.target}"`)
    if (data.prompt?.text !== content.prompt) problems.push(`prompt.text differs from the ${language} prompt`)
    if (JSON.stringify(data.variables) !== JSON.stringify(content.variables)) problems.push(`variables differ from the ${language} variables`)
    for (const problem of problems) failures.push(`${code}: ${problem}`)
  }
}

const emitted = fs.existsSync(sourceDir) ? fs.readdirSync(sourceDir) : []
for (const name of emitted) {
  if (!expectedSources.has(name)) failures.push(`${name}: emitted but matches no prompt`)
}

// catalogs, through the optimizer's parser
const fetchFromDist = async (url) => {
  const file = path.join(distDir, new URL(url).pathname)
  if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => ({}) }
  return { ok: true, status: 200, json: async () => readJson(file) }
}
globalThis.fetch = fetchFromDist

let catalogCount = 0
for (const language of PROMPT_LANGUAGES) {
  for (const mode of OPTIMIZER_MODES) {
    const where = catalogFileName(language, mode)
    const expected = prompts.filter((prompt) => mode === 'arena' || prompt.target === mode)
    let result
    try {
      result = await fetchPromptGardenCatalog({ gardenBaseUrl: BASE_URL, mode, locale: language === 'zh' ? 'zh-CN' : 'en-US', limit: 10_000 })
    } catch (error) {
      failures.push(`${where}: optimizer rejected it (${error.message})`)
      continue
    }
    catalogCount += 1
    if (result.total !== expected.length) failures.push(`${where}: optimizer kept ${result.total} items, library has ${expected.length}`)
    if (!result.browseUrl.startsWith(`${BASE_URL}/library/`)) failures.push(`${where}: browseUrl ${result.browseUrl} is not the library page`)
    for (const item of result.items) {
      if (expectedSources.get(item.importCode) !== item.mode) failures.push(`${where}: ${item.importCode} has no prompt-source with workspace ${item.mode}`)
    }
  }
}

if (failures.length > 0) {
  console.error(`optimizer API check failed (${failures.length}):\n  - ${failures.join('\n  - ')}`)
  process.exit(1)
}
console.log(`optimizer API check passed: ${prompts.length} prompts, ${expectedSources.size} import files, ${catalogCount} catalogs in ${path.relative(siteDir, path.join(distDir, 'api/public'))}`)
