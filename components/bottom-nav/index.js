const { ensureActionAllowed } = require('../../utils/entitlement-guard')

function showQuickEntryDeniedToast(message = '') {
  if (typeof wx === 'undefined' || typeof wx.showToast !== 'function') {
    return
  }

  wx.showToast({
    title: message || '当前暂时无法打开闪录',
    icon: 'none',
    duration: 2200
  })
}

function hideQuickEntryToast() {
  if (typeof wx !== 'undefined' && typeof wx.hideToast === 'function') {
    wx.hideToast()
  }
}

function navigateToQuickEntryPlan(url = '') {
  if (typeof wx === 'undefined' || typeof wx.navigateTo !== 'function') {
    return
  }

  wx.navigateTo({
    url: url || '/pages/plans/plans?focus=subscription&reason=write_disabled'
  })
}

function showQuickEntryDeniedModal(options = {}) {
  const target = options && typeof options === 'object' ? options : {}
  const title = target.title || '闪录需要恢复可写权限'
  const content = target.content || '当前账号为只读状态，可以继续查看已有项目，但不能新增闪录、跟进或任务。开通正式套餐后可继续使用闪录。'
  const confirmText = target.confirmText || '订阅套餐'
  const url = target.url || '/pages/plans/plans?focus=subscription&reason=write_disabled'

  if (typeof wx === 'undefined' || typeof wx.showModal !== 'function') {
    return
  }

  hideQuickEntryToast()

  setTimeout(() => {
    wx.showModal({
      title,
      content,
      confirmText,
      cancelText: '稍后再说',
      success: (result) => {
        if (result && result.confirm) {
          navigateToQuickEntryPlan(url)
        }
      },
      fail: () => {
        showQuickEntryDeniedToast(content)
      }
    })
  }, 80)
}

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
      wx.reLaunch({ url: path })
    },

    async onQuickEntry() {
      const decision = await ensureActionAllowed('quick_entry', {
        refresh: true,
        guide: false,
        toast: false
      })
      if (!decision.allowed) {
        if (decision.code === 'ENTITLEMENT_WRITE_DISABLED') {
          showQuickEntryDeniedModal({
            content: decision.message
          })
        } else if (decision.code === 'ENTITLEMENT_REFRESH_FAILED') {
          showQuickEntryDeniedModal({
            title: '暂时无法确认权益',
            content: decision.message || '当前无法确认账号权益，请稍后重试。你也可以先进入套餐页查看当前权限状态。',
            confirmText: '订阅套餐',
            url: '/pages/plans/plans?focus=subscription&reason=entitlement_refresh_failed'
          })
        } else {
          showQuickEntryDeniedToast(decision.message)
        }
        return
      }

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

      wx.reLaunch({
        url: '/pages/index/index?openQuickEntry=1&quickEntryStandalone=1',
        fail: () => {
          wx.showToast({
            title: '暂时无法打开闪录',
            icon: 'none'
          })
        }
      })
    }
  }
})
