const {
  loadEarningsData,
  loadUserPreferencesData,
  saveUserPreferencesData,
  resolveAccountData,
  getEntitlementsData,
  getDefaultAccountSummary,
  getDefaultEntitlements,
  resetLocalSessionCache,
  setLocalSignedOut
} = require('../../services/data')
const { clearAllPageCache } = require('../../utils/page-cache')
const {
  cleanupAccountScopedStorage,
  cleanupLegacySensitiveStorage,
  readLastAccountScope,
  writeLastAccountScope
} = require('../../utils/account-scope')
const {
  THEME_OPTIONS,
  THEME_LABELS,
  getDefaultAppearanceSettings,
  normalizeAppearanceSettings,
  getAppearancePageClass,
  syncPageAppearance,
  syncCustomTabBar
} = require('../../utils/appearance')
const { ensureActionAllowed, buildEntitlementOverview } = require('../../utils/entitlement-guard')
const { openTabPage } = require('../../utils/tab-bar-navigation')
const { getNavigationSpacerHeight } = require('../../utils/navigation-metrics')

const ADVANCE_OPTIONS = [
  { key: 'same_day', label: '当天提醒' },
  { key: 'one_day_before', label: '提前一天' }
]

function getDefaultReminderSettings() {
  return {
    followUpEnabled: true,
    followUpAdvance: 'same_day',
    taskEnabled: true,
    taskAdvance: 'same_day'
  }
}

function normalizeAdvance(value) {
  return String(value || '').trim() === 'one_day_before' ? 'one_day_before' : 'same_day'
}

function normalizeReminderSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const defaults = getDefaultReminderSettings()
  return {
    followUpEnabled: typeof source.followUpEnabled === 'boolean' ? source.followUpEnabled : defaults.followUpEnabled,
    followUpAdvance: normalizeAdvance(source.followUpAdvance || defaults.followUpAdvance),
    taskEnabled: typeof source.taskEnabled === 'boolean' ? source.taskEnabled : defaults.taskEnabled,
    taskAdvance: normalizeAdvance(source.taskAdvance || defaults.taskAdvance)
  }
}

function buildOverviewMetrics(earnings) {
  const summary = Array.isArray(earnings && earnings.summary) ? earnings.summary : []
  return summary.slice(0, 3).map((item) => ({
    label: String(item.label || '').trim(),
    value: String(item.value || '').trim()
  }))
}

function formatDateLabel(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) {
    return ''
  }

  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function buildAccountDisplayTitle(account) {
  const nextAccount = {
    ...getDefaultAccountSummary(),
    ...(account && typeof account === 'object' ? account : {})
  }
  return String(nextAccount.displayName || nextAccount.phoneMasked || '账户与偏好').trim() || '账户与偏好'
}

function buildAvatarText(value) {
  const text = String(value || '').trim()
  if (!text) {
    return '我'
  }

  return text.slice(0, 1).toUpperCase()
}

function buildMineHeroSubtitle(account, entitlements) {
  const nextAccount = {
    ...getDefaultAccountSummary(),
    ...(account && typeof account === 'object' ? account : {})
  }
  const nextEntitlements = {
    ...getDefaultEntitlements(),
    ...(entitlements && typeof entitlements === 'object' ? entitlements : {})
  }
  const overview = buildEntitlementOverview({
    account: nextAccount,
    entitlements: nextEntitlements
  })
  const effectiveEnd = formatDateLabel(nextEntitlements.effectiveTo || nextAccount.trialEndsAt)
  const parts = [overview.writeStatusLabel]

  if (effectiveEnd) {
    parts.push(`有效期至 ${effectiveEnd}`)
  }

  return parts.filter(Boolean).join(' · ')
}

function buildAccessSummaryState(account, entitlements) {
  const nextAccount = {
    ...getDefaultAccountSummary(),
    ...(account && typeof account === 'object' ? account : {})
  }
  const nextEntitlements = {
    ...getDefaultEntitlements(),
    ...(entitlements && typeof entitlements === 'object' ? entitlements : {})
  }
  const overview = buildEntitlementOverview({
    account: nextAccount,
    entitlements: nextEntitlements
  })

  return {
    accountSummary: nextAccount,
    entitlementsSummary: nextEntitlements,
    heroTitle: buildAccountDisplayTitle(nextAccount),
    heroAvatarText: buildAvatarText(buildAccountDisplayTitle(nextAccount)),
    heroSubtitle: buildMineHeroSubtitle(nextAccount, nextEntitlements),
    displayNameInput: String(nextAccount.customDisplayName || '').trim(),
    wechatNicknameText: String(nextAccount.wechatNickname || '').trim() || '当前未同步微信昵称',
    accountAccessRows: [
      { key: 'status', label: '账户状态', value: overview.accountStatusLabel },
      { key: 'access', label: '当前权益', value: overview.accessLevelLabel },
      { key: 'phone', label: '手机号', value: overview.phoneStatusLabel },
      { key: 'projects', label: '项目数量', value: overview.projectQuotaText },
      { key: 'voice', label: '语音额度', value: overview.voiceQuotaText },
      { key: 'ai', label: 'AI 额度', value: overview.aiQuotaText }
    ],
    accountAccessNotice: overview.reasonSummary
  }
}

const FONT_SCALE_OPTIONS = [
  { key: 'default', label: '默认' },
  { key: 'large', label: '大字体' },
  { key: 'readable', label: '易读模式' }
]

function buildThemeOptions(currentThemeKey, savingKey) {
  return THEME_OPTIONS.map((item) => ({
    ...item,
    isActive: item.key === currentThemeKey,
    isDisabled: Boolean(savingKey)
  }))
}

Page({
  data: {
    earnings: {
      summary: []
    },
    tabNavigationSpacerHeight: getNavigationSpacerHeight(),
    overviewMetrics: [],
    reminderAdvanceOptions: ADVANCE_OPTIONS,
    fontScaleOptions: FONT_SCALE_OPTIONS,
    themeOptions: buildThemeOptions(getDefaultAppearanceSettings().themeKey, ''),
    reminderSettings: getDefaultReminderSettings(),
    appearanceSettings: getDefaultAppearanceSettings(),
    isLoading: true,
    isAccessLoading: true,
    currentThemeLabel: THEME_LABELS.deep_business,
    appearancePageClass: getAppearancePageClass(getDefaultAppearanceSettings()),
    preferenceSavingKey: '',
    heroTitle: '账户与偏好',
    heroAvatarText: '我',
    heroSubtitle: '正在同步账户状态',
    displayNameInput: '',
    showDisplayNameSheet: false,
    wechatNicknameText: '当前未同步微信昵称',
    accountSummary: getDefaultAccountSummary(),
    entitlementsSummary: getDefaultEntitlements(),
    accountAccessRows: [],
    accountAccessNotice: '',
    isSigningOut: false
  },

  async onLoad() {
    this.syncTabNavigationMetrics()
    syncPageAppearance(this)
    try {
      const [earningsResult, preferencesResult, accountResult, entitlementsResult] = await Promise.all([
        loadEarningsData(),
        loadUserPreferencesData().catch(() => ({
          reminderSettings: getDefaultReminderSettings(),
          appearanceSettings: getDefaultAppearanceSettings()
        })),
        resolveAccountData().catch(() => ({
          data: getDefaultAccountSummary()
        })),
        getEntitlementsData().catch(() => ({
          data: getDefaultEntitlements()
        }))
      ])
      const appearanceSettings = normalizeAppearanceSettings(preferencesResult && preferencesResult.appearanceSettings)
      const app = getApp()
      const accountSummary = accountResult && accountResult.data ? accountResult.data : getDefaultAccountSummary()
      const entitlementsSummary = entitlementsResult && entitlementsResult.data
        ? entitlementsResult.data
        : getDefaultEntitlements()

      if (app && typeof app.applyAccountState === 'function') {
        app.applyAccountState(accountSummary)
      }
      if (app && typeof app.applyEntitlementsState === 'function') {
        app.applyEntitlementsState(entitlementsSummary)
      }

      this.setData({
        earnings: earningsResult.data,
        overviewMetrics: buildOverviewMetrics(earningsResult.data),
        reminderSettings: normalizeReminderSettings(preferencesResult && preferencesResult.reminderSettings),
        appearanceSettings,
        themeOptions: buildThemeOptions(appearanceSettings.themeKey, ''),
        isLoading: false,
        currentThemeLabel: THEME_LABELS[appearanceSettings.themeKey] || THEME_LABELS.deep_business,
        appearancePageClass: getAppearancePageClass(appearanceSettings),
        isAccessLoading: false,
        ...buildAccessSummaryState(accountSummary, entitlementsSummary)
      })
      syncCustomTabBar(this, getAppearancePageClass(appearanceSettings))
    } catch (error) {
      this.setData({
        earnings: {
          summary: []
        },
        overviewMetrics: [],
        reminderSettings: getDefaultReminderSettings(),
        appearanceSettings: getDefaultAppearanceSettings(),
        themeOptions: buildThemeOptions(getDefaultAppearanceSettings().themeKey, ''),
        isLoading: false,
        isAccessLoading: false,
        currentThemeLabel: THEME_LABELS.deep_business,
        appearancePageClass: getAppearancePageClass(getDefaultAppearanceSettings()),
        ...buildAccessSummaryState(getDefaultAccountSummary(), getDefaultEntitlements())
      })
      syncCustomTabBar(this, getAppearancePageClass(getDefaultAppearanceSettings()))
      wx.showToast({
        title: '当前无法同步我的数据',
        icon: 'none'
      })
    }
  },

  openPage(event) {
    const { url } = event.currentTarget.dataset
    wx.navigateTo({ url })
  },

  openEntitlementsPage() {
    wx.navigateTo({
      url: '/pages/entitlements/entitlements'
    })
  },

  openPlansPage() {
    wx.navigateTo({
      url: '/pages/plans/plans'
    })
  },

  openPhoneBindPage() {
    wx.navigateTo({
      url: '/pages/phone-bind/phone-bind'
    })
  },

  onShow() {
    this.syncTabNavigationMetrics()
    syncPageAppearance(this)
    this.refreshAccessState()
  },

  syncTabNavigationMetrics() {
    const navigationSpacerHeight = getNavigationSpacerHeight()
    if (navigationSpacerHeight === this.data.tabNavigationSpacerHeight) {
      return
    }

    this.setData({
      tabNavigationSpacerHeight: navigationSpacerHeight
    })
  },

  async refreshAccessState() {
    if (this.data.isSigningOut) {
      return
    }

    try {
      const [accountResult, entitlementsResult] = await Promise.all([
        resolveAccountData(),
        getEntitlementsData()
      ])
      const accountSummary = accountResult && accountResult.data ? accountResult.data : getDefaultAccountSummary()
      const entitlementsSummary = entitlementsResult && entitlementsResult.data
        ? entitlementsResult.data
        : getDefaultEntitlements()
      const app = getApp()

      if (app && typeof app.applyAccountState === 'function') {
        app.applyAccountState(accountSummary)
      }
      if (app && typeof app.applyEntitlementsState === 'function') {
        app.applyEntitlementsState(entitlementsSummary)
      }

      this.setData({
        isAccessLoading: false,
        preferenceSavingKey: this.data.preferenceSavingKey === 'customDisplayName' ? '' : this.data.preferenceSavingKey,
        ...buildAccessSummaryState(accountSummary, entitlementsSummary)
      })
    } catch (error) {
      // Keep the last visible snapshot when refresh fails.
    }
  },

  async saveReminderSettings(nextSettings, savingKey) {
    const previousSettings = normalizeReminderSettings(this.data.reminderSettings)
    const normalizedSettings = normalizeReminderSettings(nextSettings)

    this.setData({
      reminderSettings: normalizedSettings,
      preferenceSavingKey: savingKey || 'reminder'
    })

    try {
      const result = await saveUserPreferencesData({
        reminderSettings: normalizedSettings
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '保存提醒偏好失败')
      }

      this.setData({
        reminderSettings: normalizeReminderSettings(result.reminderSettings),
        preferenceSavingKey: ''
      })
    } catch (error) {
      this.setData({
        reminderSettings: previousSettings,
        preferenceSavingKey: ''
      })
      wx.showToast({
        title: error && error.message ? error.message : '保存提醒偏好失败',
        icon: 'none'
      })
    }
  },

  async saveAppearanceSettings(nextSettings, savingKey) {
    const previousSettings = normalizeAppearanceSettings(this.data.appearanceSettings)
    const normalizedSettings = normalizeAppearanceSettings(nextSettings)
    const app = getApp()

    if (app && typeof app.applyAppearanceSettings === 'function') {
      app.applyAppearanceSettings(normalizedSettings)
    }

    this.setData({
      appearanceSettings: normalizedSettings,
      themeOptions: buildThemeOptions(normalizedSettings.themeKey, savingKey || 'appearance'),
      currentThemeLabel: THEME_LABELS[normalizedSettings.themeKey] || THEME_LABELS.deep_business,
      appearancePageClass: getAppearancePageClass(normalizedSettings),
      preferenceSavingKey: savingKey || 'appearance'
    })
    syncCustomTabBar(this, getAppearancePageClass(normalizedSettings))

    try {
      const result = await saveUserPreferencesData({
        appearanceSettings: normalizedSettings
      })
      const savedSettings = normalizeAppearanceSettings(result && result.appearanceSettings)

      if (app && typeof app.applyAppearanceSettings === 'function') {
        app.applyAppearanceSettings(savedSettings)
      }

      this.setData({
        appearanceSettings: savedSettings,
        themeOptions: buildThemeOptions(savedSettings.themeKey, ''),
        currentThemeLabel: THEME_LABELS[savedSettings.themeKey] || THEME_LABELS.deep_business,
        appearancePageClass: getAppearancePageClass(savedSettings),
        preferenceSavingKey: ''
      })
      syncCustomTabBar(this, getAppearancePageClass(savedSettings))
    } catch (error) {
      if (app && typeof app.applyAppearanceSettings === 'function') {
        app.applyAppearanceSettings(previousSettings)
      }

      this.setData({
        appearanceSettings: previousSettings,
        themeOptions: buildThemeOptions(previousSettings.themeKey, ''),
        currentThemeLabel: THEME_LABELS[previousSettings.themeKey] || THEME_LABELS.deep_business,
        appearancePageClass: getAppearancePageClass(previousSettings),
        preferenceSavingKey: ''
      })
      syncCustomTabBar(this, getAppearancePageClass(previousSettings))
      wx.showToast({
        title: error && error.message ? error.message : '保存外观偏好失败',
        icon: 'none'
      })
    }
  },

  onDisplayNameInput(event) {
    this.setData({
      displayNameInput: String(event && event.detail && event.detail.value || '').slice(0, 24)
    })
  },

  openDisplayNameSheet() {
    this.setData({
      showDisplayNameSheet: true,
      displayNameInput: String(this.data.accountSummary.customDisplayName || '').trim()
    }, () => {
      syncCustomTabBar(this, this.data.appearancePageClass)
    })
  },

  closeDisplayNameSheet() {
    if (this.data.preferenceSavingKey === 'customDisplayName') {
      return
    }

    this.setData({
      showDisplayNameSheet: false,
      displayNameInput: String(this.data.accountSummary.customDisplayName || '').trim()
    }, () => {
      syncCustomTabBar(this, this.data.appearancePageClass)
    })
  },

  async persistDisplayName(nextDisplayName) {
    if (this.data.preferenceSavingKey) {
      return
    }

    const normalizedDisplayName = String(nextDisplayName || '').trim().slice(0, 24)
    if (normalizedDisplayName === String(this.data.accountSummary.customDisplayName || '').trim()) {
      this.setData({
        showDisplayNameSheet: false
      }, () => {
        syncCustomTabBar(this, this.data.appearancePageClass)
      })
      return
    }

    this.setData({
      preferenceSavingKey: 'customDisplayName',
      displayNameInput: normalizedDisplayName
    })

    try {
      const result = await saveUserPreferencesData({
        customDisplayName: normalizedDisplayName
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '保存显示名失败')
      }

      await this.refreshAccessState()
      this.setData({
        showDisplayNameSheet: false
      }, () => {
        syncCustomTabBar(this, this.data.appearancePageClass)
      })
      wx.showToast({
        title: normalizedDisplayName ? '显示名已保存' : '已恢复默认显示',
        icon: 'none'
      })
    } catch (error) {
      this.setData({
        preferenceSavingKey: ''
      })
      wx.showToast({
        title: error && error.message ? error.message : '保存显示名失败',
        icon: 'none'
      })
    }
  },

  saveDisplayName() {
    this.persistDisplayName(this.data.displayNameInput)
  },

  resetDisplayName() {
    if (this.data.preferenceSavingKey) {
      return
    }

    this.setData({
      displayNameInput: ''
    })
    this.persistDisplayName('')
  },

  onReminderToggleChange(event) {
    const field = event.currentTarget.dataset.field
    if (!field) {
      return
    }

    this.saveReminderSettings({
      ...this.data.reminderSettings,
      [field]: !!(event.detail && event.detail.value)
    }, field)
  },

  onReminderAdvanceTap(event) {
    const field = event.currentTarget.dataset.field
    const value = event.currentTarget.dataset.value
    if (!field || !value || this.data.preferenceSavingKey) {
      return
    }

    if ((field === 'followUpAdvance' && !this.data.reminderSettings.followUpEnabled)
      || (field === 'taskAdvance' && !this.data.reminderSettings.taskEnabled)) {
      return
    }

    if (this.data.reminderSettings[field] === value) {
      return
    }

    this.saveReminderSettings({
      ...this.data.reminderSettings,
      [field]: value
    }, field)
  },

  onFontScaleModeTap(event) {
    const mode = event.currentTarget.dataset.mode
    if (!mode || this.data.preferenceSavingKey || this.data.appearanceSettings.fontScaleMode === mode) {
      return
    }

    this.saveAppearanceSettings({
      ...this.data.appearanceSettings,
      fontScaleMode: mode
    }, 'fontScaleMode')
  },

  onThemeTap(event) {
    const themeKey = event.currentTarget.dataset.theme
    if (!themeKey || this.data.preferenceSavingKey || this.data.appearanceSettings.themeKey === themeKey) {
      return
    }

    this.saveAppearanceSettings({
      ...this.data.appearanceSettings,
      themeKey
    }, 'themeKey')
  },

  async handleQuickEntryTap() {
    const decision = await ensureActionAllowed('quick_entry', { guide: true })
    if (!decision.allowed) {
      return
    }

    openTabPage('/pages/index/index?openQuickEntry=1&quickEntryStandalone=1')
  },

  handleSignOutTap() {
    if (this.data.isSigningOut) {
      return
    }

    wx.showModal({
      title: '退出当前账号',
      content: '将清除本机账号状态、草稿和页面缓存；云端项目数据不会删除，重新打开会使用当前微信身份同步。',
      confirmText: '退出',
      confirmColor: '#B54747',
      cancelText: '取消',
      success: (result) => {
        if (result && result.confirm) {
          this.signOutLocalAccount()
        }
      }
    })
  },

  signOutLocalAccount() {
    this.setData({
      isSigningOut: true
    })

    const app = getApp()
    const previousScope = app && app.globalData
      ? String(app.globalData.accountStorageScope || '').trim()
      : readLastAccountScope()
    const defaultAccount = getDefaultAccountSummary()
    const defaultEntitlements = getDefaultEntitlements()

    try {
      clearAllPageCache()
      if (previousScope) {
        cleanupAccountScopedStorage(previousScope)
      }
      cleanupLegacySensitiveStorage()
      writeLastAccountScope('')
      resetLocalSessionCache()
      setLocalSignedOut(true)
    } catch (error) {
      // Local cleanup is best effort; keep the exit flow usable.
    }

    if (app && app.globalData) {
      app.globalData.account = defaultAccount
      app.globalData.accountStorageScope = ''
      app.globalData.entitlements = defaultEntitlements
      app.globalData.entitlementsVersion = Number(app.globalData.entitlementsVersion || 0) + 1
      app.globalData.pageMemoryCache = Object.create(null)
      app.globalData.homePageRuntimeSnapshot = null
      app.globalData.quickEntryRequest = null
      app.globalData.projectsTabRequest = null
      app.globalData.customTabBarHidden = false
      app.globalData.notificationSync = {
        version: 0,
        updatedAt: 0,
        reason: 'sign_out'
      }
    }

    this.setData({
      isSigningOut: false,
      showDisplayNameSheet: false,
      preferenceSavingKey: '',
      displayNameInput: '',
      ...buildAccessSummaryState(defaultAccount, defaultEntitlements)
    }, () => {
      syncCustomTabBar(this, this.data.appearancePageClass)
    })

    wx.reLaunch({
      url: '/pages/session/session?reason=signed_out',
      success: () => {
        setTimeout(() => {
          wx.showToast({
            title: '已退出当前账号',
            icon: 'none'
          })
        }, 120)
      },
      fail: () => {
        wx.showToast({
          title: '已退出当前账号',
          icon: 'none'
        })
      }
    })
  }
})
