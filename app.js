const cloudConfig = require('./config/cloud')
const { initCloud, getCloudStatus } = require('./services/runtime')
const {
  loadUserPreferencesData,
  bindReferralData,
  resolveAccountData,
  getEntitlementsData,
  getDefaultAccountSummary,
  getDefaultEntitlements
} = require('./services/data')
const {
  getDefaultAppearanceSettings,
  getAppearancePageClass,
  applyAppearanceSettingsToApp,
  syncPageAppearance
} = require('./utils/appearance')

App({
  onLaunch(options) {
    const cloudReady = initCloud()
    const cloudStatus = getCloudStatus()
    const defaultAppearanceSettings = getDefaultAppearanceSettings()

    this.globalData = {
      brandName: '八面成交',
      brandSubtitle: '您的私人 CRM 引擎',
      brandMark: '/assets/brand/logo-core-transparent.png',
      cloudReady,
      cloudStatus,
      cloudConfig,
      dataSourceLabel: cloudStatus.label,
      account: getDefaultAccountSummary(),
      entitlements: getDefaultEntitlements(),
      entitlementsVersion: 0,
      appearanceSettings: defaultAppearanceSettings,
      appearancePageClass: getAppearancePageClass(defaultAppearanceSettings),
      appearanceVersion: 0,
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
    this.bootstrapSessionState()
    this.bootstrapAppearancePreferences()
  },

  onShow(options) {
    this.captureReferralCode(options)
    this.consumePendingReferralBinding()
  },

  async bootstrapSessionState() {
    try {
      const accountResult = await resolveAccountData()
      if (accountResult && accountResult.data) {
        this.applyAccountState(accountResult.data)
      }
      await this.consumePendingReferralBinding()

      const entitlementsResult = await getEntitlementsData()
      if (entitlementsResult && entitlementsResult.data) {
        this.applyEntitlementsState(entitlementsResult.data)
      }
    } catch (error) {
      // Keep the app usable even when account bootstrap is not ready yet.
    }
  },

  async bootstrapAppearancePreferences() {
    try {
      const result = await loadUserPreferencesData()
      applyAppearanceSettingsToApp(result && result.appearanceSettings)
      const pages = getCurrentPages()
      pages.forEach((page) => syncPageAppearance(page))
    } catch (error) {
      // Keep default appearance when cloud preferences are unavailable.
    }
  },

  applyAppearanceSettings(nextSettings) {
    const savedSettings = applyAppearanceSettingsToApp(nextSettings)
    const pages = getCurrentPages()
    pages.forEach((page) => syncPageAppearance(page))
    return savedSettings
  },

  applyAccountState(nextState) {
    const source = nextState && typeof nextState === 'object' && !Array.isArray(nextState) ? nextState : {}
    this.globalData.account = {
      ...getDefaultAccountSummary(),
      ...source
    }
    return this.globalData.account
  },

  async refreshAccount() {
    const result = await resolveAccountData()
    if (result && result.data) {
      this.applyAccountState(result.data)
    }
    return this.globalData.account
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
    const result = await getEntitlementsData()
    if (result && result.data) {
      this.applyEntitlementsState(result.data)
    }
    return this.globalData.entitlements
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
