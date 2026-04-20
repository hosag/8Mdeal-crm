const {
  loadEarningsData,
  seedInboundProjectData,
  loadUserPreferencesData,
  saveUserPreferencesData
} = require('../../services/data')

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

Page({
  data: {
    earnings: {
      summary: []
    },
    reminderAdvanceOptions: ADVANCE_OPTIONS,
    reminderSettings: getDefaultReminderSettings(),
    isLoading: true,
    dataSource: 'Mock Demo',
    showDevActions: false,
    isSeeding: false,
    preferenceSavingKey: ''
  },

  async onLoad() {
    const accountInfo = typeof wx.getAccountInfoSync === 'function' ? wx.getAccountInfoSync() : null
    const envVersion = accountInfo && accountInfo.miniProgram ? accountInfo.miniProgram.envVersion : 'develop'
    try {
      const [earningsResult, preferencesResult] = await Promise.all([
        loadEarningsData(),
        loadUserPreferencesData().catch(() => ({
          reminderSettings: getDefaultReminderSettings()
        }))
      ])
      this.setData({
        earnings: earningsResult.data,
        reminderSettings: normalizeReminderSettings(preferencesResult && preferencesResult.reminderSettings),
        isLoading: false,
        dataSource: earningsResult.source,
        showDevActions: envVersion !== 'release'
      })
    } catch (error) {
      this.setData({
        earnings: {
          summary: []
        },
        reminderSettings: getDefaultReminderSettings(),
        isLoading: false,
        showDevActions: envVersion !== 'release'
      })
      wx.showToast({
        title: '暂时无法同步我的数据',
        icon: 'none'
      })
    }
  },

  openPage(event) {
    const { url } = event.currentTarget.dataset
    wx.navigateTo({ url })
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

  async seedInboundProject() {
    if (this.data.isSeeding) {
      return
    }

    this.setData({
      isSeeding: true
    })

    try {
      const result = await seedInboundProjectData()
      wx.showToast({
        title: '测试项目已生成',
        icon: 'success'
      })

      if (result && result.projectId) {
        setTimeout(() => {
          wx.navigateTo({
            url: `/pages/project-detail/project-detail?projectId=${result.projectId}`
          })
        }, 280)
      }
    } catch (error) {
      wx.showToast({
        title: error && error.message ? error.message : '暂时无法生成测试项目，请稍后重试',
        icon: 'none'
      })
    } finally {
      this.setData({
        isSeeding: false
      })
    }
  }
})
