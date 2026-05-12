const { submitFeedbackData, resolveAccountData, getDefaultAccountSummary } = require('../../services/data')
const { syncPageAppearance } = require('../../utils/appearance')

const FEEDBACK_TYPES = [
  { key: 'bug', label: '遇到问题' },
  { key: 'feature', label: '功能需求' },
  { key: 'ux', label: '体验建议' },
  { key: 'other', label: '其他' }
]

const SCENE_OPTIONS = [
  { key: 'home', label: '首页' },
  { key: 'projects', label: '我的项目' },
  { key: 'project_detail', label: '项目详情' },
  { key: 'quick_entry', label: '闪录' },
  { key: 'share', label: '分享/外发' },
  { key: 'mine', label: '我的设置' },
  { key: 'other', label: '其他' }
]

function normalizeText(value) {
  return String(value || '').trim()
}

function getClientInfo() {
  if (typeof wx === 'undefined') {
    return {}
  }

  try {
    const deviceInfo = typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : {}
    const appBaseInfo = typeof wx.getAppBaseInfo === 'function' ? wx.getAppBaseInfo() : {}
    const windowInfo = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : {}

    return {
      platform: normalizeText(deviceInfo.platform),
      system: normalizeText(deviceInfo.system),
      version: normalizeText(appBaseInfo.version),
      SDKVersion: normalizeText(appBaseInfo.SDKVersion),
      brand: normalizeText(deviceInfo.brand),
      model: normalizeText(deviceInfo.model),
      windowWidth: windowInfo.windowWidth || 0,
      windowHeight: windowInfo.windowHeight || 0,
      pixelRatio: windowInfo.pixelRatio || 0
    }
  } catch (error) {
    return {}
  }
}

Page({
  data: {
    appearancePageClass: '',
    feedbackTypes: FEEDBACK_TYPES,
    sceneOptions: SCENE_OPTIONS,
    selectedType: 'bug',
    selectedScene: 'home',
    content: '',
    contact: '',
    allowContact: true,
    isSubmitting: false,
    isSubmitted: false,
    accountSummary: getDefaultAccountSummary()
  },

  onLoad() {
    syncPageAppearance(this)
    this.loadAccountSummary()
  },

  onShow() {
    syncPageAppearance(this)
  },

  async loadAccountSummary() {
    try {
      const result = await resolveAccountData()
      const accountSummary = result && result.data ? result.data : getDefaultAccountSummary()
      this.setData({
        accountSummary,
        contact: normalizeText(accountSummary.phoneMasked)
      })
    } catch (error) {
      this.setData({
        accountSummary: getDefaultAccountSummary()
      })
    }
  },

  selectType(event) {
    const key = normalizeText(event.currentTarget.dataset.key)
    if (!FEEDBACK_TYPES.some((item) => item.key === key)) {
      return
    }

    this.setData({
      selectedType: key
    })
  },

  selectScene(event) {
    const key = normalizeText(event.currentTarget.dataset.key)
    if (!SCENE_OPTIONS.some((item) => item.key === key)) {
      return
    }

    this.setData({
      selectedScene: key
    })
  },

  onContentInput(event) {
    this.setData({
      content: String(event.detail.value || '').slice(0, 1000)
    })
  },

  onContactInput(event) {
    this.setData({
      contact: String(event.detail.value || '').slice(0, 80)
    })
  },

  onAllowContactChange(event) {
    this.setData({
      allowContact: !!event.detail.value
    })
  },

  resetForm() {
    this.setData({
      selectedType: 'bug',
      selectedScene: 'home',
      content: '',
      contact: normalizeText(this.data.accountSummary.phoneMasked),
      allowContact: true,
      isSubmitted: false,
      isSubmitting: false
    })
  },

  goBackMine() {
    wx.navigateBack({
      delta: 1
    })
  },

  async submitFeedback() {
    if (this.data.isSubmitting) {
      return
    }

    const content = normalizeText(this.data.content)
    if (content.length < 8) {
      wx.showToast({
        title: '请稍微多写一点反馈内容',
        icon: 'none'
      })
      return
    }

    this.setData({
      isSubmitting: true
    })

    try {
      const result = await submitFeedbackData({
        type: this.data.selectedType,
        scene: this.data.selectedScene,
        content,
        contact: normalizeText(this.data.contact),
        allowContact: this.data.allowContact,
        clientInfo: getClientInfo()
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '反馈提交失败')
      }

      this.setData({
        isSubmitting: false,
        isSubmitted: true
      })
    } catch (error) {
      this.setData({
        isSubmitting: false
      })
      wx.showToast({
        title: error && error.message ? error.message : '反馈提交失败',
        icon: 'none'
      })
    }
  }
})
