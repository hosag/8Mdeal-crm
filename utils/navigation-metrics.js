function getNavigationSpacerHeight() {
  if (typeof wx === 'undefined') {
    return 88
  }

  const windowInfo = typeof wx.getWindowInfo === 'function'
    ? wx.getWindowInfo()
    : (typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : {})

  let menuButtonRect = null
  if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
    try {
      menuButtonRect = wx.getMenuButtonBoundingClientRect()
    } catch (error) {
      menuButtonRect = null
    }
  }

  const statusBarHeight = Math.max(0, Number(windowInfo && windowInfo.statusBarHeight) || 0)
  const fallbackGap = statusBarHeight > 24 ? 8 : 6
  const fallbackTop = statusBarHeight > 0 ? statusBarHeight + fallbackGap : 24
  const menuTop = Math.max(0, Number(menuButtonRect && menuButtonRect.top) || 0) || fallbackTop
  const menuHeight = Math.max(0, Number(menuButtonRect && menuButtonRect.height) || 0) || 32
  const navigationGap = Math.max(0, menuTop - statusBarHeight)

  return Math.max(
    Math.round(menuTop + menuHeight + navigationGap),
    statusBarHeight + 44,
    88
  )
}

module.exports = {
  getNavigationSpacerHeight
}
