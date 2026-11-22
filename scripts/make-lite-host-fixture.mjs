// 证明「复制一个目录、加一行 subPackages」就能接入简版：
// 在临时目录建一个空白宿主小程序（自己的 app.json、app.js、app.wxss 和一个首页），
// 把 miniprogram/goprmpt-lite/ 原样复制进去，只在 app.json 里加一条 subPackages，然后跑 check.mjs。
// 用法：node scripts/make-lite-host-fixture.mjs [--keep]。--keep 保留临时目录，方便用微信开发者工具打开。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkMiniprogram, LITE_ROOT } from '../miniprogram/tools/check.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LITE = path.join(ROOT, 'miniprogram', LITE_ROOT)

// 宿主接入时加的那一条，和 goprmpt-lite/INTEGRATION.zh-CN.md 里写的一致。
export const LITE_ENTRY = { root: LITE_ROOT, pages: ['pages/optimize/optimize', 'pages/history/history', 'pages/settings/settings'] }

const HOST_FILES = {
  'app.json': JSON.stringify({ pages: ['pages/home/home'], window: { navigationBarTitleText: '宿主小程序' }, style: 'v2' }, null, 2) + '\n',
  'app.js': "// 宿主自己的全局状态，简版不应读取。\nApp({ globalData: { hostOnly: true } })\n",
  'app.wxss': 'page { background: #fafafa; }\n.host-only { color: red; }\n',
  'project.config.json': JSON.stringify({ appid: 'touristappid', projectname: 'lite-host-fixture', compileType: 'miniprogram', libVersion: '3.0.0', setting: { urlCheck: false } }, null, 2) + '\n',
  'pages/home/home.json': '{ "usingComponents": {} }\n',
  'pages/home/home.wxml': '<view class="host-only" bindtap="onOpen">打开提示词优化</view>\n',
  'pages/home/home.wxss': '',
  'pages/home/home.js': "Page({\n  onOpen() {\n    wx.navigateTo({ url: '/goprmpt-lite/pages/optimize/optimize' })\n  }\n})\n"
}

// 返回 { dir, before, after, errors, lite }；keep 为 false 时检查完就删掉临时目录。
export function makeLiteHost({ keep = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'goprmpt-lite-host-'))
  try {
    for (const [file, content] of Object.entries(HOST_FILES)) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
      fs.writeFileSync(path.join(dir, file), content)
    }
    const before = JSON.parse(fs.readFileSync(path.join(dir, 'app.json'), 'utf8'))

    // 第一步：复制一个目录。第二步：加一条 subPackages。
    fs.cpSync(LITE, path.join(dir, LITE_ROOT), { recursive: true })
    const after = { ...before, subPackages: [...(before.subPackages || []), LITE_ENTRY] }
    fs.writeFileSync(path.join(dir, 'app.json'), JSON.stringify(after, null, 2) + '\n')

    const { errors, lite } = checkMiniprogram(dir)
    return { dir, before, after, errors, lite }
  } finally {
    if (!keep) fs.rmSync(dir, { recursive: true, force: true })
  }
}

const self = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === self.toLowerCase()) {
  const keep = process.argv.includes('--keep')
  const { dir, errors, lite } = makeLiteHost({ keep })
  console.log('宿主 app.json 新增：subPackages += ' + JSON.stringify(LITE_ENTRY))
  if (!lite) errors.push('app.json 没有注册 ' + LITE_ROOT)
  if (errors.length) {
    console.error('简版在空白宿主里检查失败（' + errors.length + ' 个问题）：')
    for (const error of errors) console.error('  - ' + error)
    process.exit(1)
  }
  console.log('简版在空白宿主里检查通过：只复制了 ' + LITE_ROOT + '/ 并加了一条 subPackages')
  if (keep) console.log('宿主目录：' + dir)
}
