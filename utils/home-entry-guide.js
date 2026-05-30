const HOME_ENTRY_GUIDE_VERSION = 'v1'
const HOME_ENTRY_GUIDE_STORAGE_KEY = 'homeEntryGuideSettings'
const { buildAccountScopedStorageKey } = require('./account-scope')

function getDefaultHomeEntryGuideSettings() {
  return {
    homeBrandSplashDismissed: false,
    homeBrandSplashDismissedVersion: '',
    homeBrandSplashDismissedAt: ''
  }
}

function normalizeHomeEntryGuideSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const defaults = getDefaultHomeEntryGuideSettings()

  return {
    homeBrandSplashDismissed: typeof source.homeBrandSplashDismissed === 'boolean'
      ? source.homeBrandSplashDismissed
      : defaults.homeBrandSplashDismissed,
    homeBrandSplashDismissedVersion: String(source.homeBrandSplashDismissedVersion || defaults.homeBrandSplashDismissedVersion).trim(),
    homeBrandSplashDismissedAt: String(source.homeBrandSplashDismissedAt || defaults.homeBrandSplashDismissedAt).trim()
  }
}

function buildDismissedHomeEntryGuideSettings(date = new Date()) {
  const timestamp = date instanceof Date ? date : new Date(date)
  return {
    homeBrandSplashDismissed: true,
    homeBrandSplashDismissedVersion: HOME_ENTRY_GUIDE_VERSION,
    homeBrandSplashDismissedAt: Number.isNaN(timestamp.getTime()) ? '' : timestamp.toISOString()
  }
}

function isHomeBrandSplashDismissed(value) {
  const settings = normalizeHomeEntryGuideSettings(value)
  return settings.homeBrandSplashDismissed === true && (
    !settings.homeBrandSplashDismissedVersion
      || settings.homeBrandSplashDismissedVersion === HOME_ENTRY_GUIDE_VERSION
  )
}

module.exports = {
  HOME_ENTRY_GUIDE_VERSION,
  HOME_ENTRY_GUIDE_STORAGE_KEY,
  getHomeEntryGuideStorageKey: () => buildAccountScopedStorageKey(HOME_ENTRY_GUIDE_STORAGE_KEY),
  getDefaultHomeEntryGuideSettings,
  normalizeHomeEntryGuideSettings,
  buildDismissedHomeEntryGuideSettings,
  isHomeBrandSplashDismissed
}
