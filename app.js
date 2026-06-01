const cloudConfig = require('./config/cloud')
const { initCloud, getCloudStatus } = require('./services/runtime')
const {
  loadUserPreferencesData,
  bindReferralData,
  resolveAccountData,
  getEntitlementsData,
  getDefaultAccountSummary,
  getDefaultEntitlements,
  setLocalSignedOut
} = require('./services/data')
const {
  getDefaultAppearanceSettings,
  getAppearancePageClass,
  applyAppearanceSettingsToApp,
  syncPageAppearance
} = require('./utils/appearance')
const {
  getDefaultHomeEntryGuideSettings,
  normalizeHomeEntryGuideSettings
} = require('./utils/home-entry-guide')
const { clearAllPageCache } = require('./utils/page-cache')
const {
  getAccountScopeFromAccount,
  cleanupLegacySensitiveStorage,
  cleanupAccountScopedStorage,
  readLastAccountScope,
  writeLastAccountScope
} = require('./utils/account-scope')
const { registerPrivacyAuthorizationListener } = require('./utils/privacy-authorization')

App({
  onLaunch(options) {
    setLocalSignedOut(false)

    const cloudReady = initCloud()
    const cloudStatus = getCloudStatus()
    const defaultAppearanceSettings = getDefaultAppearanceSettings()

    this.globalData = {
      brandName: '八面成交',
      brandSubtitle: '您的私人 CRM',
      brandMark: '/assets/brand/logo-core-transparent.png',
      cloudReady,
      cloudStatus,
      cloudConfig,
      dataSourceLabel: cloudStatus.label,
      account: getDefaultAccountSummary(),
      accountStorageScope: '',
      entitlements: getDefaultEntitlements(),
      entitlementsVersion: 0,
      appearanceSettings: defaultAppearanceSettings,
      appearancePageClass: getAppearancePageClass(defaultAppearanceSettings),
      appearanceVersion: 0,
      entryGuideSettings: getDefaultHomeEntryGuideSettings(),
      homeEntryGuideSessionDismissed: false,
      notificationSync: {
        version: 0,
        updatedAt: 0,
        reason: ''
      },
      quickEntryRequest: null,
      pendingReferralCode: '',
      referralBindingBusy: false,
      referralBindingResult: null
    }

    this.captureReferralCode(options)
    registerPrivacyAuthorizationListener()
    this.bootstrapSessionState()
    setTimeout(() => {
      this.bootstrapAppearancePreferences()
    }, 240)
  },

  onShow(options) {
    this.captureReferralCode(options)
    this.consumePendingReferralBinding()
  },

  async bootstrapSessionState() {
    if (this.bootstrapSessionStatePromise) {
      return this.bootstrapSessionStatePromise
    }

    this.bootstrapSessionStatePromise = (async () => {
      try {
        await this.refreshAccount()
        await this.consumePendingReferralBinding()
        await this.refreshEntitlements()
      } catch (error) {
        // Keep the app usable even when account bootstrap is not ready yet.
      } finally {
        this.bootstrapSessionStatePromise = null
      }
    })()

    return this.bootstrapSessionStatePromise
  },

  async bootstrapAppearancePreferences() {
    if (this.bootstrapAppearancePreferencesPromise) {
      return this.bootstrapAppearancePreferencesPromise
    }

    this.bootstrapAppearancePreferencesPromise = (async () => {
      try {
        const result = await loadUserPreferencesData()
        applyAppearanceSettingsToApp(result && result.appearanceSettings)
        this.applyEntryGuideSettings(result && result.entryGuideSettings)
        const pages = getCurrentPages()
        pages.forEach((page) => syncPageAppearance(page))
        return result
      } catch (error) {
        // Keep default appearance when cloud preferences are unavailable.
        return null
      } finally {
        this.bootstrapAppearancePreferencesPromise = null
      }
    })()

    return this.bootstrapAppearancePreferencesPromise
  },

  applyAppearanceSettings(nextSettings) {
    const savedSettings = applyAppearanceSettingsToApp(nextSettings)
    const pages = getCurrentPages()
    pages.forEach((page) => syncPageAppearance(page))
    return savedSettings
  },

  applyEntryGuideSettings(nextSettings) {
    const savedSettings = normalizeHomeEntryGuideSettings(nextSettings)
    this.globalData.entryGuideSettings = savedSettings
    return savedSettings
  },

  applyAccountState(nextState) {
    const source = nextState && typeof nextState === 'object' && !Array.isArray(nextState) ? nextState : {}
    this.globalData.account = {
      ...getDefaultAccountSummary(),
      ...source
    }
    this.syncAccountStorageScope(this.globalData.account)
    return this.globalData.account
  },

  syncAccountStorageScope(account) {
    if (!this.globalData) {
      return ''
    }

    const nextScope = getAccountScopeFromAccount(account)
    if (!nextScope) {
      return ''
    }

    const currentScope = String(this.globalData.accountStorageScope || '').trim()
    const lastScope = readLastAccountScope()
    const previousScope = currentScope || lastScope
    const hasScopeChanged = !!previousScope && previousScope !== nextScope
    const shouldInitializeScopeStorage = !previousScope

    cleanupLegacySensitiveStorage()

    if (hasScopeChanged || shouldInitializeScopeStorage) {
      clearAllPageCache()
      if (hasScopeChanged) {
        cleanupAccountScopedStorage(previousScope)
      }
    }

    this.globalData.accountStorageScope = nextScope
    writeLastAccountScope(nextScope)
    if (hasScopeChanged) {
      this.notifyAccountStorageScopeChanged(previousScope, nextScope)
    } else {
      this.notifyAccountStorageScopeReady(nextScope)
    }
    return nextScope
  },

  notifyAccountStorageScopeReady(nextScope) {
    if (typeof getCurrentPages !== 'function') {
      return
    }

    try {
      getCurrentPages().forEach((page) => {
        if (page && typeof page.handleAccountStorageScopeReady === 'function') {
          page.handleAccountStorageScopeReady({
            nextScope
          })
        }
      })
    } catch (error) {
      // Page-cache rebinding should not block login/session refresh.
    }
  },

  notifyAccountStorageScopeChanged(previousScope, nextScope) {
    if (typeof getCurrentPages !== 'function') {
      return
    }

    try {
      getCurrentPages().forEach((page) => {
        if (page && typeof page.handleAccountStorageScopeChanged === 'function') {
          page.handleAccountStorageScopeChanged({
            previousScope,
            nextScope
          })
        }
      })
    } catch (error) {
      // Account cleanup should not block login/session refresh.
    }
  },

  async refreshAccount() {
    if (this.refreshAccountPromise) {
      return this.refreshAccountPromise
    }

    this.refreshAccountPromise = (async () => {
      const result = await resolveAccountData()
      if (result && result.data) {
        this.applyAccountState(result.data)
      }
      return this.globalData.account
    })()

    try {
      return await this.refreshAccountPromise
    } finally {
      this.refreshAccountPromise = null
    }
  },

  applyEntitlementsState(nextState) {
    const source = nextState && typeof nextState === 'object' && !Array.isArray(nextState) ? nextState : {}
    this.globalData.entitlements = {
      ...getDefaultEntitlements(),
      ...source
    }
    this.globalData.entitlementsVersion = Number(this.globalData.entitlementsVersion || 0) + 1
    return this.globalData.entitlements
  },

  async refreshEntitlements() {
    if (this.refreshEntitlementsPromise) {
      return this.refreshEntitlementsPromise
    }

    this.refreshEntitlementsPromise = (async () => {
      await this.refreshAccount()
      const result = await getEntitlementsData()
      if (result && result.data) {
        this.applyEntitlementsState(result.data)
      }
      return this.globalData.entitlements
    })()

    try {
      return await this.refreshEntitlementsPromise
    } finally {
      this.refreshEntitlementsPromise = null
    }
  },

  extractReferralCode(options = {}) {
    const query = options && options.query && typeof options.query === 'object' ? options.query : {}
    const directCode = String(query.referrerCode || query.ref || query.inviteCode || '').trim()
    if (directCode) {
      return directCode
    }

    const scene = String(query.scene || '').trim()
    if (!scene) {
      return ''
    }

    try {
      const decoded = decodeURIComponent(scene)
      const matched = decoded.match(/(?:referrerCode|ref|inviteCode)=([^&]+)/)
      if (matched) {
        return String(matched[1] || '').trim()
      }
      return /^BMC[A-Z0-9]{6,}$/i.test(decoded) ? decoded : ''
    } catch (error) {
      return ''
    }
  },

  captureReferralCode(options = {}) {
    if (!this.globalData) {
      return ''
    }

    const code = this.extractReferralCode(options)
    if (code) {
      this.globalData.pendingReferralCode = code
    }
    return code
  },

  async consumePendingReferralBinding() {
    if (!this.globalData || this.globalData.referralBindingBusy) {
      return null
    }

    const referrerCode = String(this.globalData.pendingReferralCode || '').trim()
    if (!referrerCode) {
      return null
    }

    this.globalData.referralBindingBusy = true
    try {
      const result = await bindReferralData({
        referrerCode
      })
      this.globalData.referralBindingResult = result || null
      if (result) {
        this.globalData.pendingReferralCode = ''
      }
      return result
    } catch (error) {
      this.globalData.referralBindingResult = {
        ok: false,
        message: error && error.message ? error.message : '推荐关系确认失败'
      }
      return this.globalData.referralBindingResult
    } finally {
      this.globalData.referralBindingBusy = false
    }
  }
})
