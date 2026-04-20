function getAppSafe() {
  try {
    return getApp()
  } catch (error) {
    return null
  }
}

function ensureNotificationSyncState() {
  const app = getAppSafe()
  if (!app) {
    return {
      version: 0,
      updatedAt: 0,
      reason: ''
    }
  }

  if (!app.globalData) {
    app.globalData = {}
  }

  if (!app.globalData.notificationSync) {
    app.globalData.notificationSync = {
      version: 0,
      updatedAt: 0,
      reason: ''
    }
  }

  return app.globalData.notificationSync
}

function getNotificationSyncVersion() {
  return Number(ensureNotificationSyncState().version || 0)
}

function touchNotificationSync(reason = '') {
  const state = ensureNotificationSyncState()
  state.version = Number(state.version || 0) + 1
  state.updatedAt = Date.now()
  state.reason = String(reason || '').trim()
  return state
}

module.exports = {
  getNotificationSyncVersion,
  touchNotificationSync
}
