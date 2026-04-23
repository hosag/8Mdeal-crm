const { loadEarningsData } = require('../../services/data')
const { syncPageAppearance } = require('../../utils/appearance')

Page({
  data: {
    appearancePageClass: '',
    earnings: {
      summary: [],
      deals: []
    },
    isLoading: true,
    dataSource: 'Mock Demo'
  },

  async onLoad() {
    syncPageAppearance(this)
    await this.fetchEarnings()
  },

  async onShow() {
    syncPageAppearance(this)
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
        title: '当前无法同步收益数据',
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
