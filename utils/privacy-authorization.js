const PRIVACY_AGREE_BUTTON_ID = 'privacy-agree-btn'

let pendingPrivacyResolve = null
let pendingPrivacyEventInfo = null

function getDefaultPrivacyState() {
  return {
    showPrivacyAuthorization: false,
    privacyContractName: '《用户隐私保护指引》',
    privacyAuthorizationReferrer: ''
  }
}

function getCurrentPage() {
  if (typeof getCurrentPages !== 'function') {
    return null
  }

  const pages = getCurrentPages()
  return pages && pages.length ? pages[pages.length - 1] : null
}

function patchPrivacyState(page, patch) {
  if (!page || typeof page.setData !== 'function') {
    return
  }

  page.setData({
    ...patch
  })
}

function buildPrivacyDefaultPatch(data = {}) {
  const defaults = getDefaultPrivacyState()
  const patch = {}

  if (typeof data.showPrivacyAuthorization !== 'boolean') {
    patch.showPrivacyAuthorization = defaults.showPrivacyAuthorization
  }

  if (typeof data.privacyContractName !== 'string') {
    patch.privacyContractName = defaults.privacyContractName
  }

  if (typeof data.privacyAuthorizationReferrer !== 'string') {
    patch.privacyAuthorizationReferrer = defaults.privacyAuthorizationReferrer
  }

  return patch
}

function attachPrivacyAuthorization(page) {
  if (!page || page.__privacyAuthorizationAttached) {
    return page
  }

  page.__privacyAuthorizationAttached = true
  const defaultPatch = buildPrivacyDefaultPatch(page.data && typeof page.data === 'object' ? page.data : {})
  if (Object.keys(defaultPatch).length) {
    patchPrivacyState(page, defaultPatch)
  }

  page.openPrivacyContract = function openPrivacyContract() {
    if (typeof wx === 'undefined' || typeof wx.openPrivacyContract !== 'function') {
      wx.showToast({
        title: '当前微信版本暂不支持查看隐私指引',
        icon: 'none'
      })
      return
    }

    wx.openPrivacyContract({
      fail: () => {
        wx.showToast({
          title: '隐私指引暂时无法打开',
          icon: 'none'
        })
      }
    })
  }

  page.handleAgreePrivacyAuthorization = function handleAgreePrivacyAuthorization() {
    patchPrivacyState(this, {
      showPrivacyAuthorization: false
    })

    if (typeof pendingPrivacyResolve === 'function') {
      pendingPrivacyResolve({
        buttonId: PRIVACY_AGREE_BUTTON_ID,
        event: 'agree'
      })
    }
    pendingPrivacyResolve = null
    pendingPrivacyEventInfo = null
  }

  page.handleRejectPrivacyAuthorization = function handleRejectPrivacyAuthorization() {
    patchPrivacyState(this, {
      showPrivacyAuthorization: false
    })

    if (typeof pendingPrivacyResolve === 'function') {
      pendingPrivacyResolve({
        event: 'disagree'
      })
    }
    pendingPrivacyResolve = null
    pendingPrivacyEventInfo = null
  }

  return page
}

function showPrivacyAuthorization(resolve, eventInfo = {}) {
  pendingPrivacyResolve = resolve
  pendingPrivacyEventInfo = eventInfo || {}
  const page = attachPrivacyAuthorization(getCurrentPage())
  if (!page) {
    if (typeof pendingPrivacyResolve === 'function') {
      pendingPrivacyResolve({
        event: 'disagree'
      })
    }
    pendingPrivacyResolve = null
    pendingPrivacyEventInfo = null
    return
  }

  if (typeof pendingPrivacyResolve === 'function') {
    pendingPrivacyResolve({
      event: 'exposureAuthorization'
    })
  }

  patchPrivacyState(page, {
    showPrivacyAuthorization: true,
    privacyAuthorizationReferrer: String(pendingPrivacyEventInfo.referrer || '').trim()
  })
}

function registerPrivacyAuthorizationListener() {
  if (typeof wx === 'undefined' || typeof wx.onNeedPrivacyAuthorization !== 'function') {
    return false
  }

  wx.onNeedPrivacyAuthorization((resolve, eventInfo) => {
    showPrivacyAuthorization(resolve, eventInfo)
  })
  return true
}

function queryPrivacySetting() {
  if (typeof wx === 'undefined' || typeof wx.getPrivacySetting !== 'function') {
    return Promise.resolve({
      needAuthorization: false,
      privacyContractName: '《用户隐私保护指引》'
    })
  }

  return new Promise((resolve) => {
    wx.getPrivacySetting({
      success: (res) => {
        resolve({
          needAuthorization: !!(res && res.needAuthorization),
          privacyContractName: String(res && res.privacyContractName || '《用户隐私保护指引》').trim()
        })
      },
      fail: () => {
        resolve({
          needAuthorization: false,
          privacyContractName: '《用户隐私保护指引》'
        })
      }
    })
  })
}

function requirePrivacyAuthorization() {
  if (typeof wx === 'undefined' || typeof wx.requirePrivacyAuthorize !== 'function') {
    return Promise.resolve(true)
  }

  return new Promise((resolve) => {
    wx.requirePrivacyAuthorize({
      success: () => resolve(true),
      fail: () => resolve(false)
    })
  })
}

async function ensurePrivacyAuthorization(options = {}) {
  const page = attachPrivacyAuthorization(options.page || getCurrentPage())
  const setting = await queryPrivacySetting()

  if (page && setting.privacyContractName) {
    patchPrivacyState(page, {
      privacyContractName: setting.privacyContractName
    })
  }

  if (!setting.needAuthorization) {
    return true
  }

  const authorized = await requirePrivacyAuthorization()
  if (!authorized && options.showToast !== false && typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
    wx.showToast({
      title: '需同意隐私保护指引后使用',
      icon: 'none'
    })
  }
  return authorized
}

module.exports = {
  PRIVACY_AGREE_BUTTON_ID,
  getDefaultPrivacyState,
  attachPrivacyAuthorization,
  registerPrivacyAuthorizationListener,
  ensurePrivacyAuthorization
}
