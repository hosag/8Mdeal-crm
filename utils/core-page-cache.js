const { markPageCacheDirty, markPageCacheDirtyByPrefix } = require('./page-cache')

const HOME_PAGE_CACHE_KEY = 'home:dashboard'
const PROJECTS_PAGE_CACHE_KEY = 'projects:list'
const SHARED_OUT_PAGE_CACHE_KEY = 'shared-out:list'
const PROJECT_DETAIL_CACHE_PREFIX = 'project-detail:'
const DEFAULT_PROJECT_DETAIL_VIEW_MODES = ['default', 'shared-out']

function normalizeCacheSegment(value) {
  return String(value || '').trim()
}

function getProjectDetailPageCacheKey(projectId, viewMode = 'default') {
  const normalizedProjectId = normalizeCacheSegment(projectId)
  if (!normalizedProjectId) {
    return ''
  }

  const normalizedViewMode = normalizeCacheSegment(viewMode) || 'default'
  return `${PROJECT_DETAIL_CACHE_PREFIX}${normalizedViewMode}:${normalizedProjectId}`
}

function markHomePageCacheDirty() {
  markPageCacheDirty(HOME_PAGE_CACHE_KEY)
}

function markProjectsPageCacheDirty() {
  markPageCacheDirty(PROJECTS_PAGE_CACHE_KEY)
}

function markSharedOutPageCacheDirty() {
  markPageCacheDirty(SHARED_OUT_PAGE_CACHE_KEY)
}

function markAllProjectDetailPageCachesDirty() {
  markPageCacheDirtyByPrefix(PROJECT_DETAIL_CACHE_PREFIX)
}

function markProjectDetailPageCacheDirty(projectId, options = {}) {
  const normalizedProjectId = normalizeCacheSegment(projectId)
  if (!normalizedProjectId) {
    markAllProjectDetailPageCachesDirty()
    return
  }

  const viewModes = Array.isArray(options.viewModes) && options.viewModes.length
    ? options.viewModes
    : DEFAULT_PROJECT_DETAIL_VIEW_MODES

  viewModes.forEach((viewMode) => {
    const cacheKey = getProjectDetailPageCacheKey(normalizedProjectId, viewMode)
    if (cacheKey) {
      markPageCacheDirty(cacheKey)
    }
  })
}

function markProjectRelatedCachesDirty(options = {}) {
  if (options.includeHome) {
    markHomePageCacheDirty()
  }

  if (options.includeProjects) {
    markProjectsPageCacheDirty()
  }

  if (options.includeSharedOut) {
    markSharedOutPageCacheDirty()
  }

  if (options.includeProjectDetail) {
    markProjectDetailPageCacheDirty(options.projectId, {
      viewModes: options.detailViewModes
    })
  }
}

module.exports = {
  HOME_PAGE_CACHE_KEY,
  PROJECTS_PAGE_CACHE_KEY,
  SHARED_OUT_PAGE_CACHE_KEY,
  PROJECT_DETAIL_CACHE_PREFIX,
  getProjectDetailPageCacheKey,
  markHomePageCacheDirty,
  markProjectsPageCacheDirty,
  markSharedOutPageCacheDirty,
  markAllProjectDetailPageCachesDirty,
  markProjectDetailPageCacheDirty,
  markProjectRelatedCachesDirty
}
