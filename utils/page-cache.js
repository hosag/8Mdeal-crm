const FALLBACK_STORE = Object.create(null)
const { getAccountPageCacheNamespace } = require('./account-scope')

function getAppInstance() {
  return typeof getApp === 'function' ? getApp() : null
}

function getCacheStore() {
  const app = getAppInstance()
  if (app && app.globalData) {
    if (!app.globalData.pageMemoryCache) {
      app.globalData.pageMemoryCache = Object.create(null)
    }
    return app.globalData.pageMemoryCache
  }

  return FALLBACK_STORE
}

function normalizeKey(value) {
  return String(value || '').trim()
}

function buildScopedCacheKey(key) {
  const cacheKey = normalizeKey(key)
  if (!cacheKey) {
    return ''
  }

  const namespace = getAccountPageCacheNamespace()
  if (!namespace) {
    return ''
  }

  return `${namespace}|${cacheKey}`
}

function cloneValue(value) {
  if (value instanceof Date) {
    return new Date(value.getTime())
  }

  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const result = {}
  Object.keys(value).forEach((key) => {
    result[key] = cloneValue(value[key])
  })
  return result
}

function trimCacheEntries(prefix, maxEntries) {
  const currentPrefix = prefix ? buildScopedCacheKey(prefix) : ''
  const limit = Number(maxEntries)
  if (!currentPrefix || !Number.isFinite(limit) || limit < 1) {
    return
  }

  const store = getCacheStore()
  const matchedKeys = Object.keys(store)
    .filter((key) => key.indexOf(currentPrefix) === 0)
    .sort((left, right) => {
      return Number(store[right] && store[right].updatedAt || 0) - Number(store[left] && store[left].updatedAt || 0)
    })

  matchedKeys.slice(limit).forEach((key) => {
    delete store[key]
  })
}

function readPageCache(key, options = {}) {
  const cacheKey = buildScopedCacheKey(key)
  if (!cacheKey) {
    return null
  }

  const store = getCacheStore()
  const entry = store[cacheKey]
  if (!entry) {
    return null
  }

  const ttl = Math.max(0, Number(entry.ttl || 0))
  const updatedAt = Math.max(0, Number(entry.updatedAt || 0))
  const expired = ttl > 0 && Date.now() - updatedAt > ttl
  const dirty = entry.dirty === true
  const allowExpired = options.allowExpired !== false

  if (!allowExpired && (expired || dirty)) {
    return null
  }

  return {
    key: cacheKey,
    data: cloneValue(entry.data),
    updatedAt,
    ttl,
    expired,
    dirty
  }
}

function shouldRefreshPageCache(entry) {
  if (!entry || typeof entry !== 'object') {
    return true
  }

  return entry.expired === true || entry.dirty === true
}

function writePageCache(key, data, options = {}) {
  const cacheKey = buildScopedCacheKey(key)
  if (!cacheKey) {
    return null
  }

  const ttl = Math.max(0, Number(options.ttl || 0))
  const store = getCacheStore()
  store[cacheKey] = {
    data: cloneValue(data),
    updatedAt: Date.now(),
    ttl,
    dirty: false
  }

  trimCacheEntries(options.prefix, options.maxEntries)
  return readPageCache(key)
}

function markPageCacheDirty(key) {
  const cacheKey = buildScopedCacheKey(key)
  if (!cacheKey) {
    return
  }

  const store = getCacheStore()
  if (store[cacheKey]) {
    store[cacheKey].dirty = true
  }
}

function markPageCacheDirtyByPrefix(prefix) {
  const currentPrefix = buildScopedCacheKey(prefix)
  if (!currentPrefix) {
    return
  }

  const store = getCacheStore()
  Object.keys(store).forEach((key) => {
    if (key.indexOf(currentPrefix) === 0) {
      store[key].dirty = true
    }
  })
}

function clearPageCache(key) {
  const cacheKey = buildScopedCacheKey(key)
  if (!cacheKey) {
    return
  }

  const store = getCacheStore()
  delete store[cacheKey]
}

function clearAllPageCache() {
  const store = getCacheStore()
  Object.keys(store).forEach((key) => {
    delete store[key]
  })
}

module.exports = {
  readPageCache,
  shouldRefreshPageCache,
  writePageCache,
  markPageCacheDirty,
  markPageCacheDirtyByPrefix,
  clearPageCache,
  clearAllPageCache
}
