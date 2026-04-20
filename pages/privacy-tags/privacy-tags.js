const { loadPrivacyTagsData } = require('../../services/data')

Page({
  data: {
    privacyTags: [],
    isLoading: true,
    dataSource: 'Mock Demo'
  },

  async onLoad() {
    await this.fetchTags()
  },

  async onShow() {
    if (!this.data.isLoading) {
      await this.fetchTags()
    }
  },

  async fetchTags() {
    try {
      const { data, source } = await loadPrivacyTagsData()
      this.setData({
        privacyTags: data.shareTags,
        isLoading: false,
        dataSource: source
      })
    } catch (error) {
      this.setData({
        privacyTags: [],
        isLoading: false
      })
      wx.showToast({
        title: '暂时无法加载隐私标签',
        icon: 'none'
      })
    }
  },

  openPage(event) {
    const tagId = event && event.currentTarget ? event.currentTarget.dataset.tagId || '' : ''
    wx.navigateTo({
      url: `/pages/edit-tag/edit-tag${tagId ? `?tagId=${tagId}` : ''}`
    })
  }
})
