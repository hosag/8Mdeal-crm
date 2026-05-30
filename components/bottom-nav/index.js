Component({
  properties: {
    current: {
      type: String,
      value: 'home'
    },
    appearancePageClass: {
      type: String,
      value: ''
    }
  },

  data: {
    leftItems: [
      { key: 'home', label: '首页', icon: '/assets/icons/nav-home.svg', activeIcon: '/assets/icons/nav-home-active.svg', path: '/pages/index/index' },
      { key: 'projects', label: '项目', icon: '/assets/icons/nav-projects.svg', activeIcon: '/assets/icons/nav-projects-active.svg', path: '/pages/projects/projects' }
    ],
    rightItems: [
      { key: 'shared', label: '外发', icon: '/assets/icons/nav-shared.svg', activeIcon: '/assets/icons/nav-shared-active.svg', path: '/pages/shared-out/shared-out' },
      { key: 'mine', label: '我的', icon: '/assets/icons/nav-mine.svg', activeIcon: '/assets/icons/nav-mine-active.svg', path: '/pages/mine/mine' }
    ]
  },

  methods: {
    onSwitch(event) {
      const { path, key } = event.currentTarget.dataset
      if (key === this.data.current) {
        return
      }
      wx.switchTab({
        url: path,
        fail: () => {
          wx.showToast({
            title: '暂时无法切换页面',
            icon: 'none'
          })
        }
      })
    },

    onQuickEntry() {
      const app = typeof getApp === 'function' ? getApp() : null
      if (app && app.globalData) {
        app.globalData.quickEntryRequest = {
          id: Date.now(),
          standalone: true,
          source: 'bottom-nav'
        }
      }

      if (this.data.current === 'home') {
        const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
        const currentPage = pages[pages.length - 1]
        if (currentPage && typeof currentPage.openQuickEntrySheet === 'function') {
          currentPage.openQuickEntrySheet()
          if (app && app.globalData) {
            app.globalData.quickEntryRequest = null
          }
          return
        }
      }

      wx.switchTab({
        url: '/pages/index/index',
        fail: () => {
          if (app && app.globalData) {
            app.globalData.quickEntryRequest = null
          }
          wx.showToast({
            title: '暂时无法打开闪录',
            icon: 'none'
          })
        }
      })
    }
  }
})
