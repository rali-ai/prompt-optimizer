// 打包小程序交付物到 dist-packages/：
//   goprmpt-miniprogram-<版本>.zip  完整版工程（解压后直接用微信开发者工具导入，project.config.json 在根目录）
//   goprmpt-lite-<版本>.zip         只含 goprmpt-lite/ 目录的简版，给宿主小程序复制
// 打包前先跑 check.mjs；产物里出现上游项目名（linshenkx、always200）或疑似密钥时拒绝打包。
// 仓库没装依赖时 fflate 不可用，这里用 node:zlib 的 deflateRawSync 和 crc32 自己写 zip（无 zip64，单文件小于 4GB）。
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

import { checkMiniprogram, LITE_ROOT } from '../miniprogram/tools/check.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MINIPROGRAM = path.join(ROOT, 'miniprogram')
const OUT_DIR = path.join(ROOT, 'dist-packages')
// 只在开发时用、不进交付物的目录。
const DEV_ONLY = new Set(['tools', 'node_modules'])

export const FORBIDDEN = [
  { name: '上游项目名', pattern: /linshenkx|always200/i },
  { name: 'OpenAI 风格的 API Key', pattern: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: '私钥', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'AWS Access Key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'AppSecret 形状的 32 位十六进制串', pattern: /\b[0-9a-f]{32}\b/i },
  { name: '写死的密钥字段', pattern: /\b(api[_-]?key|app[_-]?secret|secret|password|access[_-]?token)\b["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i }
]

// dir 下所有文件 → { 'prefix/相对路径': Buffer }，跳过开发目录。
export function collect(dir, prefix = '') {
  const files = {}
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!DEV_ONLY.has(entry.name)) walk(full)
        continue
      }
      files[prefix + path.relative(dir, full).split(path.sep).join('/')] = fs.readFileSync(full)
    }
  }
  walk(dir)
  return files
}

// 返回 [{ file, name }]，每条是一处违规。
export function scan(files) {
  const hits = []
  for (const [file, data] of Object.entries(files)) {
    const text = data.toString('utf8')
    for (const rule of FORBIDDEN) if (rule.pattern.test(text)) hits.push({ file, name: rule.name })
  }
  return hits
}

// { 名称: Buffer } → zip Buffer。条目按名称排序、时间固定为 1980-01-01，同样的输入得到同样的字节。
export function zip(files) {
  const DOS_DATE = (0 << 9) | (1 << 5) | 1
  const locals = []
  const centrals = []
  let offset = 0
  for (const name of Object.keys(files).sort()) {
    const data = files[name]
    const nameBytes = Buffer.from(name, 'utf8')
    const deflated = zlib.deflateRawSync(data, { level: 9 })
    const crc = zlib.crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // 文件名是 UTF-8
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(deflated.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, nameBytes, deflated)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(DOS_DATE, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(deflated.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBytes)
    offset += local.length + nameBytes.length + deflated.length
  }
  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(centrals.length / 2, 8)
  end.writeUInt16LE(centrals.length / 2, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...centrals, end])
}

// 返回 [{ name, path, files }]；有问题时抛错，不写任何文件。
export function packageMiniprogram({ outDir = OUT_DIR, version } = {}) {
  const check = checkMiniprogram(MINIPROGRAM)
  if (!check.lite) check.errors.push('app.json 没有注册 ' + LITE_ROOT)
  if (check.errors.length) throw new Error('小程序检查没通过：\n  ' + check.errors.join('\n  '))

  const v = version || JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version
  const bundles = [
    { name: `goprmpt-miniprogram-${v}.zip`, files: collect(MINIPROGRAM) },
    { name: `goprmpt-lite-${v}.zip`, files: collect(path.join(MINIPROGRAM, LITE_ROOT), LITE_ROOT + '/') }
  ]
  const hits = bundles.flatMap((b) => scan(b.files).map((h) => b.name + ' → ' + h.file + '：' + h.name))
  if (hits.length) throw new Error('产物里有不该出现的内容：\n  ' + hits.join('\n  '))

  fs.mkdirSync(outDir, { recursive: true })
  return bundles.map((b) => {
    const target = path.join(outDir, b.name)
    fs.writeFileSync(target, zip(b.files))
    return { name: b.name, path: target, files: Object.keys(b.files).length }
  })
}

const self = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === self.toLowerCase()) {
  try {
    for (const bundle of packageMiniprogram()) {
      console.log(`已打包 ${bundle.files} 个文件 → ${path.relative(ROOT, bundle.path).split(path.sep).join('/')}`)
    }
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
