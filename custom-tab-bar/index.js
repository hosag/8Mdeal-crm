const TAB_ROUTE_TO_KEY = {
  'pages/index/index': 'home',
  'pages/projects/projects': 'projects',
  'pages/shared-out/shared-out': 'shared',
  'pages/mine/mine': 'mine'
}

function clearPendingQuickEntryRequest() {
  const app = typeof getApp === 'function' ? getApp() : null
  if (app && app.globalData) {
    app.globalData.quickEntryRequest = null
  }
}

function shouldHideTabBar(currentPage) {
  const pageData = currentPage && currentPage.data && typeof currentPage.data === 'object'
    ? currentPage.data
    : {}

  return pageData.showHomeEntryGuide === true
    || pageData.showQuickEntrySheet === true
    || pageData.showTaskCompleteSheet === true
    || pageData.hideCustomTabBar === true
}

Component({
  data: {
    current: 'home',
    hidden: false,
    appearancePageClass: '',
    leftItems: [
      { key: 'home', label: '首页', icon: '/assets/icons/nav-home.svg', activeIcon: '/assets/icons/nav-home-active.svg', path: '/pages/index/index' },
      { key: 'projects', label: '项目', icon: '/assets/icons/nav-projects.svg', activeIcon: '/assets/icons/nav-projects-active.svg', path: '/pages/projects/projects' }
    ],
    rightItems: [
      { key: 'shared', label: '外发', icon: '/assets/icons/nav-shared.svg', activeIcon: '/assets/icons/nav-shared-active.svg', path: '/pages/shared-out/shared-out' },
      { key: 'mine', label: '我的', icon: '/assets/icons/nav-mine.svg', activeIcon: '/assets/icons/nav-mine-active.svg', path: '/pages/mine/mine' }
    ]
  },

  lifetimes: {
    attached() {
      this.syncFromCurrentPage()
    }
  },

  methods: {
    syncFromCurrentPage() {
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
      const currentPage = pages[pages.length - 1]
      const current = currentPage ? TAB_ROUTE_TO_KEY[String(currentPage.route || '').trim()] || 'home' : 'home'
      const appearancePageClass = currentPage && currentPage.data
        ? String(currentPage.data.appearancePageClass || '').trim()
        : ''
      const hidden = shouldHideTabBar(currentPage)

      this.setData({
        current,
        hidden,
        appearancePageClass
      })
    },

    onSwitch(event) {
      const { path, key } = event.currentTarget.dataset
      if (!path || key === this.data.current) {
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
      if (this.data.current === 'home') {
        const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
        const currentPage = pages[pages.length - 1]
        if (currentPage && typeof currentPage.openQuickEntrySheet === 'function') {
          currentPage.openQuickEntrySheet()
          clearPendingQuickEntryRequest()
          return
        }
      }

      const app = typeof getApp === 'function' ? getApp() : null
      if (app && app.globalData) {
        app.globalData.quickEntryRequest = {
          id: Date.now(),
          standalone: true,
          source: 'custom-tab-bar'
        }
      }

      wx.switchTab({
        url: '/pages/index/index',
        fail: () => {
          clearPendingQuickEntryRequest()
          wx.showToast({
            title: '暂时无法打开闪录',
            icon: 'none'
          })
        }
      })
    }
  }
})
