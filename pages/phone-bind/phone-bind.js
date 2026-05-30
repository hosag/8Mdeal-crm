const {
  bindPhoneData,
  resolveAccountData,
  getEntitlementsData,
  getDefaultAccountSummary
} = require('../../services/data')
const { syncPageAppearance } = require('../../utils/appearance')
const { getDefaultPrivacyState } = require('../../utils/privacy-authorization')

function normalizeReturnTo(value) {
  const current = String(value || '').trim()
  return ['plans', 'entitlements'].includes(current) ? current : ''
}

function normalizeFocus(value) {
  const current = String(value || '').trim()
  return ['subscription', 'addons'].includes(current) ? current : ''
}

function normalizeReason(value) {
  const current = String(value || '').trim()
  const reasonList = [
    'bind_required',
    'speech_exhausted',
    'ai_exhausted',
    'project_limit_reached',
    'write_disabled',
    'share_out_disabled',
    'account_disabled'
  ]
  return reasonList.includes(current) ? current : ''
}

function buildReturnUrl(returnTo = '', focus = '', reason = '') {
  const target = normalizeReturnTo(returnTo)
  const nextFocus = normalizeFocus(focus)
  const nextReason = normalizeReason(reason)
  if (!target) {
    return ''
  }

  const query = []
  if (nextFocus) {
    query.push(`focus=${nextFocus}`)
  }
  if (nextReason) {
    query.push(`reason=${encodeURIComponent(nextReason)}`)
  }

  return `/pages/${target}/${target}${query.length ? `?${query.join('&')}` : ''}`
}

function buildReturnHint(returnTo = '', focus = '', reason = '') {
  const target = normalizeReturnTo(returnTo)
  const nextFocus = normalizeFocus(focus)
  const nextReason = normalizeReason(reason)

  if (target === 'plans') {
    if (nextFocus === 'addons' && nextReason === 'speech_exhausted') {
      return '绑定完成后，会回到套餐页的流量包区域，继续补语音时长。'
    }
    if (nextFocus === 'addons' && nextReason === 'ai_exhausted') {
      return '绑定完成后，会回到套餐页的流量包区域，继续补 AI 额度。'
    }
    if (nextFocus === 'subscription') {
      return '绑定完成后，会回到套餐页的正式订阅区域，继续处理当前受限问题。'
    }
    return '绑定完成后，会回到套餐页继续后续操作。'
  }

  if (target === 'entitlements') {
    return '绑定完成后，会回到权益页继续查看当前状态。'
  }

  return '绑定完成后，会返回上一页继续当前操作。'
}

Page({
  data: {
    appearancePageClass: '',
    consentChecked: true,
    ...getDefaultPrivacyState(),
    isSaving: false,
    account: getDefaultAccountSummary(),
    helperText: '使用微信手机号授权完成验证，手机号仅用于账号识别、权益与支付归属。',
    isLoading: true,
    returnTo: '',
    returnFocus: '',
    returnReason: '',
    returnHint: '绑定完成后，会返回上一页继续当前操作。'
  },

  async onLoad(options) {
    syncPageAppearance(this)
    const returnTo = normalizeReturnTo(options && options.returnTo)
    const returnFocus = normalizeFocus(options && options.focus)
    const returnReason = normalizeReason(options && options.reason)
    this.setData({
      returnTo,
      returnFocus,
      returnReason,
      returnHint: buildReturnHint(returnTo, returnFocus, returnReason)
    })
    await this.fetchAccount()
  },

  onShow() {
    syncPageAppearance(this)
  },

  async fetchAccount() {
    try {
      const result = await resolveAccountData()
      this.setData({
        isLoading: false,
        account: result && result.data ? result.data : getDefaultAccountSummary()
      })
    } catch (error) {
      this.setData({
        isLoading: false,
        account: getDefaultAccountSummary()
      })
    }
  },

  onConsentChange(event) {
    const values = Array.isArray(event.detail && event.detail.value) ? event.detail.value : []
    this.setData({
      consentChecked: values.indexOf('agree') > -1
    })
  },

  async handleGetPhoneNumber(event) {
    if (this.data.isSaving) {
      return
    }

    if (!this.data.consentChecked) {
      wx.showToast({
        title: '请先勾选绑定说明',
        icon: 'none'
      })
      return
    }

    const detail = event && event.detail ? event.detail : {}
    const errMsg = String(detail.errMsg || '')
    const code = String(detail.code || '').trim()

    if (!code) {
      wx.showToast({
        title: errMsg.indexOf('deny') > -1 || errMsg.indexOf('fail') > -1
          ? '需要授权手机号后继续'
          : '当前微信版本暂不支持手机号授权',
        icon: 'none'
      })
      return
    }

    this.setData({
      isSaving: true
    })

    try {
      const result = await bindPhoneData({
        code,
        consentChecked: this.data.consentChecked,
        consentVersion: 'p0_phone_bind_v1'
      })
      const app = getApp()
      const account = result && result.data && result.data.account
        ? result.data.account
        : (await resolveAccountData()).data
      const entitlements = result && result.data && result.data.entitlements
        ? result.data.entitlements
        : (await getEntitlementsData()).data

      if (app && typeof app.applyAccountState === 'function') {
        app.applyAccountState(account)
      }
      if (app && typeof app.applyEntitlementsState === 'function') {
        app.applyEntitlementsState(entitlements)
      }

      this.setData({
        account,
        isSaving: false
      })

      wx.showToast({
        title: '手机号已绑定',
        icon: 'success'
      })

      setTimeout(() => {
        const returnUrl = buildReturnUrl(
          this.data.returnTo,
          this.data.returnFocus,
          this.data.returnReason
        )

        if (returnUrl) {
          wx.redirectTo({
            url: returnUrl
          })
          return
        }

        wx.navigateBack({
          delta: 1
        })
      }, 320)
    } catch (error) {
      this.setData({
        isSaving: false
      })
      wx.showToast({
        title: error && error.message ? error.message : '当前无法绑定手机号',
        icon: 'none'
      })
    }
  }
})
