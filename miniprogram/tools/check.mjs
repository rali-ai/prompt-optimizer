// 小程序静态检查，没有微信开发者工具时用来兜底。用法：node miniprogram/tools/check.mjs
// 检查：JSON 能解析；app.json 里每个页面四件套齐全；require 和 @import 指向存在的文件且不出本包；
// 页面跳转地址都是已注册页面；分包不用 getApp()，本地存储只经 utils/storage.js，跳转只经 utils/routes.js；
// WXML 绑定的事件处理函数在页面 JS 里存在；三份 theme.wxss 一致。
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROUTE_LITERAL = /['"`](\/[\w-]+(?:\/[\w-]+)*\/pages\/[\w-]+\/[\w-]+(?:\?[^'"`]*)?)['"`]/g
const THEMES = ['goprmpt/styles/theme.wxss', 'goprmpt-library/styles/theme.wxss', 'styles/theme.wxss']

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'tools' || entry.name === 'node_modules' ? [] : walk(full)
    return [full]
  })
}

const read = (file) => fs.readFileSync(file, 'utf8')

// root：小程序项目目录（含 app.json）。返回 { errors, pages, files }。
export function checkMiniprogram(root) {
  const rel = (file) => path.relative(root, file).replace(/\\/g, '/')
  const errors = []
  const fail = (file, message) => errors.push(rel(file) + '：' + message)
  const files = walk(root)
  const byExt = (ext) => files.filter((f) => f.endsWith(ext))

  // 1. JSON
  const json = {}
  for (const file of byExt('.json')) {
    try {
      json[rel(file)] = JSON.parse(read(file))
    } catch (error) {
      fail(file, 'JSON 解析失败：' + error.message)
    }
  }

  // 2. 页面四件套
  const app = json['app.json'] || { pages: [] }
  const subPackages = app.subPackages || app.subpackages || []
  const roots = subPackages.map((p) => p.root)
  const pages = new Set(app.pages)
  for (const sub of subPackages) for (const page of sub.pages) pages.add(sub.root + '/' + page)
  for (const page of pages) {
    for (const ext of ['.js', '.wxml', '.wxss', '.json']) {
      if (!fs.existsSync(path.join(root, page + ext))) fail(path.join(root, page + ext), '页面文件缺失')
    }
  }

  // 文件属于哪个分包；外壳返回 ''。
  const packageOf = (file) => roots.find((r) => rel(file).startsWith(r + '/')) || ''

  const checkTarget = (from, target, kind) => {
    if (!fs.existsSync(target)) {
      fail(from, kind + ' 指向不存在的文件 ' + rel(target))
    } else if (packageOf(target) !== packageOf(from)) {
      fail(from, kind + ' 越出了本包：' + rel(target))
    }
  }

  const checkPageUrl = (file, url) => {
    const page = url.split('?')[0].replace(/^\//, '')
    if (!pages.has(page)) fail(file, '跳转地址不是已注册的页面：' + url)
  }

  // 3. 各分包 utils/routes.js 的路由表
  const routeTable = {}
  for (const r of roots) {
    const routesFile = path.join(root, r, 'utils', 'routes.js')
    if (!fs.existsSync(routesFile)) continue
    const { ROUTES } = createRequire(routesFile)(routesFile)
    routeTable[r] = ROUTES
    for (const url of Object.values(ROUTES)) {
      checkPageUrl(routesFile, url)
      if (!url.startsWith('/' + r + '/')) fail(routesFile, '路由不在本分包下：' + url)
    }
  }

  // 4. JS
  for (const file of byExt('.js')) {
    const source = read(file)
    const pkg = packageOf(file)
    const name = rel(file)

    for (const match of source.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (!match[1].startsWith('.')) {
        fail(file, 'require 只能用相对路径：' + match[1])
        continue
      }
      const target = path.resolve(path.dirname(file), match[1])
      checkTarget(file, path.extname(target) ? target : target + '.js', 'require')
    }

    for (const match of source.matchAll(ROUTE_LITERAL)) checkPageUrl(file, match[1])

    if (!pkg) continue
    if (/\bgetApp\s*\(/.test(source)) fail(file, '分包里不能用 getApp()，不依赖外壳的全局状态')
    if (/\bwx\.(get|set|remove|clear)Storage(Sync)?\b/.test(source) && name !== pkg + '/utils/storage.js') {
      fail(file, '本地存储只能经 utils/storage.js（统一加 goprmpt: 前缀）')
    }
    if (/\bwx\.(navigateTo|redirectTo|reLaunch|switchTab)\b/.test(source) && name !== pkg + '/utils/routes.js') {
      fail(file, '页面跳转只能经 utils/routes.js')
    }
    for (const match of source.matchAll(/\broutes\.go\(\s*['"]([\w-]+)['"]/g)) {
      if (!routeTable[pkg] || !routeTable[pkg][match[1]]) fail(file, 'routes.go 用了未定义的页面名：' + match[1])
    }
  }

  // 5. WXML：路由字面量、事件处理函数
  for (const file of byExt('.wxml')) {
    const source = read(file)
    for (const match of source.matchAll(ROUTE_LITERAL)) checkPageUrl(file, match[1])

    const jsFile = file.replace(/\.wxml$/, '.js')
    const js = fs.existsSync(jsFile) ? read(jsFile) : ''
    for (const match of source.matchAll(/\b(?:capture-)?(?:bind|catch):?[a-z]+="([^"]+)"/g)) {
      const handler = match[1]
      if (handler.includes('{{')) continue
      if (!new RegExp('(^|[\\s,{])' + handler + '\\s*(\\(|:)', 'm').test(js)) {
        fail(file, '绑定的事件处理函数在 ' + rel(jsFile) + ' 里找不到：' + handler)
      }
    }
  }

  // 6. WXSS @import
  for (const file of byExt('.wxss')) {
    for (const match of read(file).matchAll(/@import\s+['"]([^'"]+)['"]/g)) {
      const target = match[1].startsWith('/') ? path.join(root, match[1]) : path.resolve(path.dirname(file), match[1])
      checkTarget(file, target, '@import')
    }
  }

  // 7. 主题副本一致
  const themes = THEMES.map((p) => path.join(root, p)).filter((p) => fs.existsSync(p))
  for (const theme of themes.slice(1)) {
    if (read(theme) !== read(themes[0])) fail(theme, '和 ' + rel(themes[0]) + ' 不一致，请同步')
  }

  return { errors, pages: pages.size, files: files.length }
}

const self = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === self.toLowerCase()) {
  const result = checkMiniprogram(path.resolve(path.dirname(self), '..'))
  if (result.errors.length) {
    console.error('小程序检查发现 ' + result.errors.length + ' 个问题：')
    for (const error of result.errors) console.error('  - ' + error)
    process.exit(1)
  }
  console.log('小程序检查通过：' + result.pages + ' 个页面，' + result.files + ' 个文件')
}
