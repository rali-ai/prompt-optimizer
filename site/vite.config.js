import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { LIBRARY_FILES, loadLibrary, promptSources } from '../library/schema.mjs'

const siteDir = path.dirname(fileURLToPath(import.meta.url))
const libraryDir = path.resolve(siteDir, process.env.LIBRARY_DIR ?? '../library')

const virtualModules = {
  'virtual:library/prompts': ({ categories, prompts }) =>
    `export const categories = ${JSON.stringify(categories)}\nexport const prompts = ${JSON.stringify(prompts)}\n`,
  'virtual:library/lessons': ({ lessons }) => `export const lessons = ${JSON.stringify(lessons)}\n`
}

// Validates ../library at build start, serves it to the pages as virtual modules,
// and writes one optimizer import file per prompt and language to
// api/public/prompt-source/<importCode> (no extension: the optimizer fetches that exact path).
function promptLibrary() {
  let library

  return {
    name: 'prompt-library',
    buildStart() {
      library = loadLibrary(libraryDir)
    },
    resolveId(id) {
      return id in virtualModules ? `\0${id}` : undefined
    },
    load(id) {
      const render = id.startsWith('\0') ? virtualModules[id.slice(1)] : undefined
      if (!render) return undefined
      for (const file of LIBRARY_FILES) this.addWatchFile(path.join(libraryDir, file))
      library = loadLibrary(libraryDir)
      return render(library)
    },
    generateBundle() {
      for (const { importCode, data } of promptSources(library)) {
        this.emitFile({ type: 'asset', fileName: `api/public/prompt-source/${importCode}`, source: JSON.stringify(data) })
      }
    }
  }
}

export default defineConfig({
  plugins: [promptLibrary()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(siteDir, 'index.html'),
        library: path.resolve(siteDir, 'library/index.html'),
        learn: path.resolve(siteDir, 'learn/index.html')
      }
    }
  }
})
