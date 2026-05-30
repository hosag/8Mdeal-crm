const { attachPrivacyAuthorization } = require('../../utils/privacy-authorization')

Component({
  properties: {
    showPrivacyAuthorization: {
      type: Boolean,
      value: false
    },
    privacyContractName: {
      type: String,
      value: '《用户隐私保护指引》'
    }
  },

  lifetimes: {
    attached() {
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
      const currentPage = pages && pages.length ? pages[pages.length - 1] : null
      attachPrivacyAuthorization(currentPage)
    }
  },

  methods: {
    noop() {},

    openPrivacyContract() {
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
      const currentPage = pages && pages.length ? pages[pages.length - 1] : null
      if (currentPage && typeof currentPage.openPrivacyContract === 'function') {
        currentPage.openPrivacyContract()
      }
    },

    handleAgreePrivacyAuthorization() {
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
      const currentPage = pages && pages.length ? pages[pages.length - 1] : null
      if (currentPage && typeof currentPage.handleAgreePrivacyAuthorization === 'function') {
        currentPage.handleAgreePrivacyAuthorization()
      }
    },

    handleRejectPrivacyAuthorization() {
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
      const currentPage = pages && pages.length ? pages[pages.length - 1] : null
      if (currentPage && typeof currentPage.handleRejectPrivacyAuthorization === 'function') {
        currentPage.handleRejectPrivacyAuthorization()
      }
    }
  }
})
