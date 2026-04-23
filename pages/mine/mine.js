const {
  loadEarningsData,
  loadUserPreferencesData,
  saveUserPreferencesData
} = require('../../services/data')
const {
  THEME_OPTIONS,
  THEME_LABELS,
  getDefaultAppearanceSettings,
  normalizeAppearanceSettings,
  getAppearancePageClass,
  syncPageAppearance
} = require('../../utils/appearance')

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

function buildCloudEnvMeta(source) {
  const currentSource = String(source || '').trim()
  if (currentSource === 'CloudBase') {
    return {
      cloudEnvLabel: '已连接',
      cloudEnvCaption: '当前已连接真实云环境'
    }
  }

  return {
    cloudEnvLabel: '演示数据',
    cloudEnvCaption: '当前仍在演示数据模式'
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
    overviewMetrics: [],
    reminderAdvanceOptions: ADVANCE_OPTIONS,
    fontScaleOptions: FONT_SCALE_OPTIONS,
    themeOptions: buildThemeOptions(getDefaultAppearanceSettings().themeKey, ''),
    reminderSettings: getDefaultReminderSettings(),
    appearanceSettings: getDefaultAppearanceSettings(),
    isLoading: true,
    dataSource: 'Mock Demo',
    cloudEnvLabel: '检查中',
    cloudEnvCaption: '正在确认当前环境',
    currentThemeLabel: THEME_LABELS.deep_business,
    appearancePageClass: getAppearancePageClass(getDefaultAppearanceSettings()),
    preferenceSavingKey: ''
  },

  async onLoad() {
    syncPageAppearance(this)
    try {
      const [earningsResult, preferencesResult] = await Promise.all([
        loadEarningsData(),
        loadUserPreferencesData().catch(() => ({
          reminderSettings: getDefaultReminderSettings(),
          appearanceSettings: getDefaultAppearanceSettings()
        }))
      ])
      const cloudEnvMeta = buildCloudEnvMeta(earningsResult.source)
      const appearanceSettings = normalizeAppearanceSettings(preferencesResult && preferencesResult.appearanceSettings)
      this.setData({
        earnings: earningsResult.data,
        overviewMetrics: buildOverviewMetrics(earningsResult.data),
        reminderSettings: normalizeReminderSettings(preferencesResult && preferencesResult.reminderSettings),
        appearanceSettings,
        themeOptions: buildThemeOptions(appearanceSettings.themeKey, ''),
        isLoading: false,
        dataSource: earningsResult.source,
        cloudEnvLabel: cloudEnvMeta.cloudEnvLabel,
        cloudEnvCaption: cloudEnvMeta.cloudEnvCaption,
        currentThemeLabel: THEME_LABELS[appearanceSettings.themeKey] || THEME_LABELS.deep_business,
        appearancePageClass: getAppearancePageClass(appearanceSettings)
      })
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
        cloudEnvLabel: '检查失败',
        cloudEnvCaption: '当前无法确认云环境状态',
        currentThemeLabel: THEME_LABELS.deep_business,
        appearancePageClass: getAppearancePageClass(getDefaultAppearanceSettings())
      })
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

  onShow() {
    syncPageAppearance(this)
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
      wx.showToast({
        title: error && error.message ? error.message : '保存外观偏好失败',
        icon: 'none'
      })
    }
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
  }
})
