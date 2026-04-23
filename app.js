const cloudConfig = require('./config/cloud')
const { initCloud, getCloudStatus } = require('./services/runtime')
const { loadUserPreferencesData } = require('./services/data')
const {
  getDefaultAppearanceSettings,
  getAppearancePageClass,
  applyAppearanceSettingsToApp,
  syncPageAppearance
} = require('./utils/appearance')

App({
  onLaunch() {
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
      appearanceSettings: defaultAppearanceSettings,
      appearancePageClass: getAppearancePageClass(defaultAppearanceSettings),
      appearanceVersion: 0,
      notificationSync: {
        version: 0,
        updatedAt: 0,
        reason: ''
      }
    }

    this.bootstrapAppearancePreferences()
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
  }
})
