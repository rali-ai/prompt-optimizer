// 本功能包所有页面的路径，页面跳转都走 go()。宿主改了分包目录名时只改 ROOT。
const ROOT = '/goprmpt/pages/'

const ROUTES = {
  optimize: ROOT + 'optimize/optimize',
  history: ROOT + 'history/history',
  settings: ROOT + 'settings/settings'
}

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

module.exports = { ROUTES, url, go }
