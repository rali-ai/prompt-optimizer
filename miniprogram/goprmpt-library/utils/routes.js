// 本分包页面的路径，页面跳转都走这里。宿主改了分包目录名时只改 ROOT。
const ROOT = '/goprmpt-library/pages/'

const ROUTES = {
  library: ROOT + 'library/library',
  prompt: ROOT + 'prompt/prompt',
  learn: ROOT + 'learn/learn',
  lesson: ROOT + 'lesson/lesson'
}

// 核心分包 goprmpt 的优化页。本分包只通过页面跳转依赖核心分包，不跨分包 require。
const OPTIMIZER_PAGE = '/goprmpt/pages/optimize/optimize'

function url(name, query) {
  const path = ROUTES[name]
  if (!path) throw new Error('未知页面：' + name)
  const pairs = Object.keys(query || {}).map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(query[key]))
  return pairs.length ? path + '?' + pairs.join('&') : path
}

function go(name, query) {
  const target = url(name, query)
  // 页面栈满（10 层）时 navigateTo 会失败，改为替换当前页。
  wx.navigateTo({ url: target, fail: () => wx.redirectTo({ url: target }) })
}

// prefill: { input, mode, lang }，通过 EventChannel 交给优化页（提示词可能很长，不放 URL）。
function openOptimizer(prefill) {
  wx.navigateTo({
    url: OPTIMIZER_PAGE,
    success: (res) => res.eventChannel.emit('prefill', prefill)
  })
}

module.exports = { ROUTES, OPTIMIZER_PAGE, url, go, openOptimizer }
