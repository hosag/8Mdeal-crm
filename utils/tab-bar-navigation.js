const TAB_PAGE_PATHS = new Set([
  '/pages/index/index',
  '/pages/projects/projects',
  '/pages/shared-out/shared-out',
  '/pages/mine/mine'
])

function safeDecode(value = '') {
  try {
    return decodeURIComponent(value)
  } catch (error) {
    return value
  }
}

function parseMiniProgramUrl(url = '') {
  const rawUrl = String(url || '').trim()
  if (!rawUrl) {
    return {
      rawUrl: '',
      path: '',
      query: {}
    }
  }

  const [rawPath, rawQuery = ''] = rawUrl.split('?')
  const path = rawPath ? String(rawPath).trim() : ''
  const query = {}

  rawQuery.split('&').forEach((item) => {
    if (!item) {
      return
    }

    const [rawKey, rawValue = ''] = item.split('=')
    const key = safeDecode(String(rawKey || '').trim())
    if (!key) {
      return
    }

    query[key] = safeDecode(String(rawValue || '').trim())
  })

  return {
    rawUrl,
    path,
    query
  }
}

function getGlobalData() {
  const app = typeof getApp === 'function' ? getApp() : null
  if (!app) {
    return null
  }

  if (!app.globalData) {
    app.globalData = {}
  }

  return app.globalData
}

function setProjectsTabRequest(query = {}) {
  const globalData = getGlobalData()
  if (!globalData) {
    return
  }

  globalData.projectsTabRequest = {
    id: Date.now(),
    ...query
  }
}

function clearProjectsTabRequest() {
  const globalData = getGlobalData()
  if (!globalData) {
    return
  }

  globalData.projectsTabRequest = null
}

function consumePendingProjectsTabRequest() {
  const globalData = getGlobalData()
  const request = globalData && globalData.projectsTabRequest && typeof globalData.projectsTabRequest === 'object'
    ? globalData.projectsTabRequest
    : null

  if (globalData) {
    globalData.projectsTabRequest = null
  }

  return request
}

function setQuickEntryTabRequest(query = {}) {
  const globalData = getGlobalData()
  if (!globalData) {
    return
  }

  globalData.quickEntryRequest = {
    id: Date.now(),
    standalone: query.quickEntryStandalone !== '0',
    source: query.source || 'tab-route'
  }
}

function clearQuickEntryTabRequest() {
  const globalData = getGlobalData()
  if (!globalData) {
    return
  }

  globalData.quickEntryRequest = null
}

function isTabPageUrl(url = '') {
  const { path } = parseMiniProgramUrl(url)
  return TAB_PAGE_PATHS.has(path)
}

function openTabPage(url = '', options = {}) {
  const { path, query } = parseMiniProgramUrl(url)
  if (!TAB_PAGE_PATHS.has(path)) {
    return false
  }

  if (path === '/pages/projects/projects') {
    setProjectsTabRequest(query)
  } else if (path === '/pages/index/index' && (query.openQuickEntry === '1' || query.quickEntryStandalone === '1')) {
    setQuickEntryTabRequest(query)
  }

  wx.switchTab({
    url: path,
    fail: () => {
      if (path === '/pages/projects/projects') {
        clearProjectsTabRequest()
      } else if (path === '/pages/index/index') {
        clearQuickEntryTabRequest()
      }

      if (options.toast === false) {
        return
      }

      wx.showToast({
        title: options.failTitle || '暂时无法打开页面',
        icon: 'none'
      })
    }
  })

  return true
}

module.exports = {
  isTabPageUrl,
  openTabPage,
  consumePendingProjectsTabRequest
}
