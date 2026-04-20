const { loadEarningsData } = require('../../services/data')

Page({
  data: {
    earnings: {
      summary: [],
      deals: []
    },
    isLoading: true,
    dataSource: 'Mock Demo'
  },

  async onLoad() {
    await this.fetchEarnings()
  },

  async onShow() {
    if (!this.data.isLoading) {
      await this.fetchEarnings()
    }
  },

  async fetchEarnings() {
    try {
      const { data, source } = await loadEarningsData()
      this.setData({
        earnings: data,
        isLoading: false,
        dataSource: source
      })
    } catch (error) {
      this.setData({
        isLoading: false
      })
      wx.showToast({
        title: '暂时无法同步收益数据',
        icon: 'none'
      })
    }
  },

  openDealProject(event) {
    const { projectId } = event.currentTarget.dataset
    if (!projectId) {
      return
    }

    wx.navigateTo({
      url: `/pages/project-detail/project-detail?projectId=${projectId}`
    })
  },

  openPage(event) {
    const { url } = event.currentTarget.dataset
    wx.navigateTo({ url })
  }
})
