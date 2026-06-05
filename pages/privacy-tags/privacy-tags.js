const { loadPrivacyTagsData } = require('../../services/data')
const { syncPageAppearance } = require('../../utils/appearance')
const { resolveShareTags } = require('../../services/share')

function buildPrivacyScopes(shareTags) {
  return resolveShareTags(shareTags).map((item) => {
    const isOutbound = item.mode === 'outbound'
    return {
      id: item.id,
      mode: item.mode,
      name: isOutbound ? '转交项目' : '发送资料',
      desc: isOutbound
        ? '对方接手后继续推进，我在外发项目查看进展。'
        : '对方仅查看资料，项目仍由我维护。',
      fields: Array.isArray(item.fields) ? item.fields : []
    }
  })
}

Page({
  data: {
    appearancePageClass: '',
    privacyScopes: [],
    isLoading: true,
    dataSource: 'Mock Demo'
  },

  async onLoad() {
    syncPageAppearance(this)
    await this.fetchTags()
  },

  async onShow() {
    syncPageAppearance(this)
    if (!this.data.isLoading) {
      await this.fetchTags()
    }
  },

  async fetchTags() {
    try {
      const { data, source } = await loadPrivacyTagsData()
      this.setData({
        privacyScopes: buildPrivacyScopes(data.shareTags),
        isLoading: false,
        dataSource: source
      })
    } catch (error) {
      this.setData({
        privacyScopes: [],
        isLoading: false
      })
      wx.showToast({
        title: '隐私标签加载失败，请重试',
        icon: 'none'
      })
    }
  },

  openPage(event) {
    const tagId = event && event.currentTarget ? event.currentTarget.dataset.tagId || '' : ''
    const mode = event && event.currentTarget ? event.currentTarget.dataset.mode || '' : ''
    wx.navigateTo({
      url: `/pages/edit-tag/edit-tag?mode=${mode || 'info'}${tagId ? `&tagId=${tagId}` : ''}`
    })
  }
})
