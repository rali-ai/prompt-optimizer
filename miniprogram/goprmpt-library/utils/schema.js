// 小程序运行时用的提示词库规则。数据本身的校验在 library/schema.mjs，生成 data/library.js 时已经做过。

// target 决定提示词属于文字还是图片，以及「去优化」时在优化页预选哪种优化方式
// （mode 是核心分包 goprmpt/utils/templates.js 里的优化方式 id）。
const TARGETS = {
  'basic-user': { kind: 'text', label: '用户提示词', mode: 'general' },
  'basic-system': { kind: 'text', label: '系统提示词', mode: 'system' },
  'image-text2image': { kind: 'image', label: '图片提示词', mode: 'image' }
}

// 变量写成 {{变量名}}。
const VARIABLE_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g

function extractVariables(text) {
  const names = []
  String(text).replace(VARIABLE_PATTERN, (match, name) => {
    if (names.indexOf(name) === -1) names.push(name)
    return match
  })
  return names
}

// 填了值的变量替换成值；没填的保留 {{变量名}}，方便后续再填或交给优化。
function fillVariables(text, values) {
  return String(text).replace(VARIABLE_PATTERN, (match, name) => {
    const value = values[name]
    return typeof value === 'string' && value.trim() !== '' ? value : match
  })
}

module.exports = { TARGETS, extractVariables, fillVariables }
