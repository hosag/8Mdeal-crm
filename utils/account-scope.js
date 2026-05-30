const ACCOUNT_SCOPE_STORAGE_KEY = 'bmcAccountStorageScopeV1'
const ACCOUNT_SCOPED_STORAGE_PREFIX = 'bmc:account:'

const LEGACY_SENSITIVE_STORAGE_KEYS = [
  'homeQuickEntryDraftsV1',
  'homeQuickEntryProjectAliasesV1',
  'homeQuickEntryProjectAliasHitHistoryV1',
  'homeQuickEntryVoiceHintSeenV1',
  'homeQuickEntryLearningDebugV1',
  'homeEntryGuideSettings'
]

const LEGACY_SENSITIVE_STORAGE_PREFIXES = [
  'follow-up-draft:'
]

function normalizeScopeSegment(value) {
  return encodeURIComponent(String(value || '').trim()).replace(/%/g, '~')
}

function restoreScopeSegment(value) {
  const text = String(value || '').trim().replace(/~/g, '%')
  if (!text) {
    return ''
  }

  try {
    return decodeURIComponent(text)
  } catch (error) {
    return text
  }
}

function getAccountScopeFromAccount(account) {
  const source = account && typeof account === 'object' && !Array.isArray(account) ? account : {}
  const accountId = String(source.accountId || '').trim()
  if (accountId) {
    return accountId
  }

  return source.isMock === true ? 'mock' : ''
}

function getAppInstance() {
  return typeof getApp === 'function' ? getApp() : null
}

function getCurrentAccountScope() {
  const app = getAppInstance()
  const globalData = app && app.globalData ? app.globalData : null
  if (!globalData) {
    return ''
  }

  return String(globalData.accountStorageScope || '').trim()
    || getAccountScopeFromAccount(globalData.account)
}

function buildAccountScopedStorageKey(key, scope = getCurrentAccountScope()) {
  const normalizedKey = String(key || '').trim()
  const normalizedScope = normalizeScopeSegment(scope)
  if (!normalizedKey || !normalizedScope) {
    return ''
  }

  return `${ACCOUNT_SCOPED_STORAGE_PREFIX}${normalizedScope}:${normalizedKey}`
}

function getAccountPageCacheNamespace(scope) {
  const sourceScope = arguments.length > 0
    ? scope
    : (getCurrentAccountScope() || readLastAccountScope())
  const normalizedScope = normalizeScopeSegment(sourceScope)
  return normalizedScope ? `account:${normalizedScope}` : ''
}

function getStorageKeys() {
  if (typeof wx === 'undefined' || typeof wx.getStorageInfoSync !== 'function') {
    return []
  }

  try {
    const info = wx.getStorageInfoSync()
    return Array.isArray(info && info.keys) ? info.keys : []
  } catch (error) {
    return []
  }
}

function removeStorageKey(key) {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey || typeof wx === 'undefined' || typeof wx.removeStorageSync !== 'function') {
    return
  }

  try {
    wx.removeStorageSync(normalizedKey)
  } catch (error) {
    // Local cleanup must not block account bootstrap.
  }
}

function cleanupLegacySensitiveStorage() {
  LEGACY_SENSITIVE_STORAGE_KEYS.forEach((key) => removeStorageKey(key))

  const keys = getStorageKeys()
  keys.forEach((key) => {
    if (LEGACY_SENSITIVE_STORAGE_PREFIXES.some((prefix) => String(key || '').indexOf(prefix) === 0)) {
      removeStorageKey(key)
    }
  })
}

function cleanupAccountScopedStorage(scope) {
  const normalizedScope = normalizeScopeSegment(scope)
  if (!normalizedScope) {
    return
  }

  const scopedPrefix = `${ACCOUNT_SCOPED_STORAGE_PREFIX}${normalizedScope}:`
  getStorageKeys().forEach((key) => {
    if (String(key || '').indexOf(scopedPrefix) === 0) {
      removeStorageKey(key)
    }
  })
}

function readLastAccountScope() {
  if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') {
    return ''
  }

  try {
    return restoreScopeSegment(wx.getStorageSync(ACCOUNT_SCOPE_STORAGE_KEY))
  } catch (error) {
    return ''
  }
}

function writeLastAccountScope(scope) {
  if (typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') {
    return
  }

  const normalizedScope = normalizeScopeSegment(scope)
  try {
    if (normalizedScope) {
      wx.setStorageSync(ACCOUNT_SCOPE_STORAGE_KEY, normalizedScope)
    } else {
      removeStorageKey(ACCOUNT_SCOPE_STORAGE_KEY)
    }
  } catch (error) {
    // Ignore storage failures; page cache still uses in-memory scope.
  }
}

module.exports = {
  ACCOUNT_SCOPE_STORAGE_KEY,
  LEGACY_SENSITIVE_STORAGE_KEYS,
  LEGACY_SENSITIVE_STORAGE_PREFIXES,
  getAccountScopeFromAccount,
  getCurrentAccountScope,
  buildAccountScopedStorageKey,
  getAccountPageCacheNamespace,
  cleanupLegacySensitiveStorage,
  cleanupAccountScopedStorage,
  readLastAccountScope,
  writeLastAccountScope
}
