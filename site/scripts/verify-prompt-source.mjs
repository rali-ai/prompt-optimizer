// Checks the built import files against what the optimizer accepts.
// The checks follow parseV1 in fetchPromptFromGarden
// (packages/ui/src/composables/app/useAppPromptGardenImport.ts).
//
// Usage: node scripts/verify-prompt-source.mjs [distDir]   (LIBRARY_DIR overrides ../library)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROMPT_LANGUAGES, loadLibrary, variableNameError } from '../../library/schema.mjs'

const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.resolve(siteDir, process.argv[2] ?? 'dist')
const libraryDir = path.resolve(siteDir, process.env.LIBRARY_DIR ?? '../library')
const sourceDir = path.join(distDir, 'api/public/prompt-source')
const OPTIMIZER_KEYS = new Set([
  'basic-system',
  'basic-user',
  'pro-multi',
  'pro-variable',
  'image-text2image',
  'image-image2image',
  'image-multiimage',
  'arena'
])

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
  else if (!OPTIMIZER_KEYS.has(subModeKey)) problems.push(`optimizer has no workspace "${subModeKey}"`)

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

const { prompts } = loadLibrary(libraryDir)
const expectedFiles = new Set()
const failures = []

for (const prompt of prompts) {
  for (const language of PROMPT_LANGUAGES) {
    const code = prompt.importCodes[language]
    expectedFiles.add(code)
    const file = path.join(sourceDir, code)
    if (!fs.existsSync(file)) {
      failures.push(`${code}: missing ${path.relative(siteDir, file)}`)
      continue
    }

    let data
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'))
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
  if (!expectedFiles.has(name)) failures.push(`${name}: emitted but matches no prompt`)
}

if (failures.length > 0) {
  console.error(`prompt-source check failed (${failures.length}):\n  - ${failures.join('\n  - ')}`)
  process.exit(1)
}
console.log(`prompt-source check passed: ${prompts.length} prompts, ${expectedFiles.size} import files in ${path.relative(siteDir, sourceDir)}`)
