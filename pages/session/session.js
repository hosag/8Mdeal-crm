const {
  resetLocalSessionCache,
  setLocalSignedOut
} = require('../../services/data')
const {
  getDefaultAppearanceSettings,
  getAppearancePageClass
} = require('../../utils/appearance')
const { getNavigationSpacerHeight } = require('../../utils/navigation-metrics')

Page({
  data: {
    navigationSpacerHeight: getNavigationSpacerHeight(),
    appearancePageClass: getAppearancePageClass(getDefaultAppearanceSettings()),
    isEntering: false
  },

  onLoad() {
    const app = getApp()
    const appearanceSettings = app && app.globalData ? app.globalData.appearanceSettings : null
    this.setData({
      appearancePageClass: getAppearancePageClass(appearanceSettings || getDefaultAppearanceSettings())
    })
  },

  onShow() {
    const navigationSpacerHeight = getNavigationSpacerHeight()
    if (navigationSpacerHeight !== this.data.navigationSpacerHeight) {
      this.setData({
        navigationSpacerHeight
      })
    }
  },

  reenterApp() {
    if (this.data.isEntering) {
      return
    }

    this.setData({
      isEntering: true
    })

    setLocalSignedOut(false)
    resetLocalSessionCache()

    const app = getApp()
    const tasks = []
    if (app && typeof app.bootstrapSessionState === 'function') {
      tasks.push(app.bootstrapSessionState())
    }
    if (app && typeof app.bootstrapAppearancePreferences === 'function') {
      tasks.push(app.bootstrapAppearancePreferences())
    }

    Promise.all(tasks.map((task) => Promise.resolve(task).catch(() => null)))
      .then(() => {
        wx.reLaunch({
          url: '/pages/index/index',
          fail: () => {
            this.setData({
              isEntering: false
            })
            wx.showToast({
              title: '暂时无法重新进入',
              icon: 'none'
            })
          }
        })
      })
  }
})
