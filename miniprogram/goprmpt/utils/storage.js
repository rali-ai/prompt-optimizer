// 本地存储的唯一入口。所有 key 都加 goprmpt: 前缀，避免和宿主小程序冲突。
const PREFIX = 'goprmpt:'

function get(name, fallback) {
  try {
    const value = wx.getStorageSync(PREFIX + name)
    return value === '' || value === undefined || value === null ? fallback : value
  } catch (e) {
    return fallback
  }
}

function set(name, value) {
  wx.setStorageSync(PREFIX + name, value)
}

module.exports = { PREFIX, get, set }
