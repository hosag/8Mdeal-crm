const { loadContactDetailData } = require('../../services/data')
const { syncPageAppearance } = require('../../utils/appearance')

function normalizeText(value) {
  return String(value || '').trim()
}

Page({
  data: {
    appearancePageClass: '',
    contactId: '',
    contact: null,
    isLoading: true,
    isLoadFailed: false,
    loadError: '',
    dataSource: 'Mock Demo'
  },

  safeSetData(update, callback) {
    if (!this.isPageActive) {
      return
    }

    this.setData(update, callback)
  },

  async onLoad(options) {
    this.isPageActive = true
    syncPageAppearance(this)
    this.contactId = normalizeText(options && options.contactId)
    this.safeSetData({
      contactId: this.contactId
    })
    await this.fetchContactDetail()
  },

  async onShow() {
    this.isPageActive = true
    syncPageAppearance(this)
  },

  onHide() {
    this.isPageActive = false
  },

  onUnload() {
    this.isPageActive = false
  },

  async fetchContactDetail() {
    if (!this.contactId) {
      this.safeSetData({
        contact: null,
        isLoading: false,
        isLoadFailed: true,
        loadError: '缺少联系人参数'
      })
      return
    }

    this.safeSetData({
      isLoading: true,
      isLoadFailed: false,
      loadError: ''
    })

    try {
      const { data, source } = await loadContactDetailData(this.contactId)
      const projectCards = Array.isArray(data.projectCards) ? data.projectCards : []
      const contact = {
        ...data,
        relationTags: Array.isArray(data.relationTags) ? data.relationTags.slice(0, 3) : [],
        stageTags: Array.isArray(data.stageTags) ? data.stageTags.slice(0, 4) : [],
        projectCards,
        roleSummary: normalizeText(data.roleSummary) || '未标注角色',
        company: normalizeText(data.company) || '未填写公司',
        phoneDisplay: normalizeText(data.phone) || '未填写',
        wechatDisplay: normalizeText(data.wechat) || '未填写',
        latestSummary: normalizeText(data.latestSummary) || '当前还没有沟通摘要',
        latestFollowUpText: normalizeText(data.latestFollowUpText) || '最近',
        latestProjectName: normalizeText(data.latestProjectName) || (projectCards[0] ? normalizeText(projectCards[0].name) : ''),
        latestOwnerLabel: normalizeText(data.latestOwnerLabel),
        projectCountText: Number(data.projectCount || projectCards.length || 0) <= 1
          ? '当前聚焦 1 个项目'
          : `当前关联 ${Number(data.projectCount || projectCards.length || 0)} 个项目`
      }

      wx.setNavigationBarTitle({
        title: contact.name || '联系人详情'
      })

      this.safeSetData({
        contact,
        isLoading: false,
        dataSource: source
      })
    } catch (error) {
      this.safeSetData({
        contact: null,
        isLoading: false,
        isLoadFailed: true,
        loadError: error && error.message ? error.message : '当前无法加载联系人详情'
      })
    }
  },

  retryFetch() {
    this.fetchContactDetail()
  },

  openProjectDetail(event) {
    const projectId = event.currentTarget.dataset.projectId
    if (!projectId) {
      return
    }

    wx.navigateTo({
      url: `/pages/project-detail/project-detail?projectId=${projectId}`
    })
  },

  copyField(event) {
    const value = normalizeText(event.currentTarget.dataset.value)
    if (!value || value === '未填写') {
      wx.showToast({
        title: '当前未填写',
        icon: 'none'
      })
      return
    }

    wx.setClipboardData({
      data: value
    })
  }
})
