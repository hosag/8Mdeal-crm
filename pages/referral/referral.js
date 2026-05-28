const {
  getReferralInfoData,
  bindReferralData,
  resolveAccountData
} = require('../../services/data')
const { syncPageAppearance } = require('../../utils/appearance')
const { openTabPage } = require('../../utils/tab-bar-navigation')

const REFERRAL_SHARE_IMAGE_URL = '/assets/share/referral-guide-cover.jpg'
const REFERRAL_BRAND_VALUE_CHIPS = ['默认私密', '商机转发', 'AI辅助推进']
const REFERRAL_BRAND_SCENES = [
  {
    label: '收项目',
    desc: '项目、客户、联系人放一起'
  },
  {
    label: '盯动作',
    desc: '今天先推进什么一眼看清'
  },
  {
    label: '看动态',
    desc: '跟进、任务、外发状态随时回看'
  }
]

function normalizeText(value) {
  return String(value || '').trim()
}

function formatAiQuota(value) {
  const amount = Math.max(0, Number(value || 0))
  if (amount >= 10000 && amount % 10000 === 0) {
    return `${Math.floor(amount / 10000)} 万`
  }
  return amount.toLocaleString()
}

function buildStats(stats = {}) {
  const rewardedAiTokens = Math.max(0, Number(stats.rewardedAiTokens || 0))
  return {
    invitedCount: Math.max(0, Number(stats.invitedCount || 0)),
    pendingCount: Math.max(0, Number(stats.pendingCount || 0)),
    rewardedCount: Math.max(0, Number(stats.rewardedCount || 0)),
    rewardedAiTokens,
    rewardedAiTokensText: formatAiQuota(rewardedAiTokens)
  }
}

function buildBindingNotice(result) {
  if (!result || !result.message) {
    return {
      visible: false,
      tone: 'success',
      title: '',
      desc: ''
    }
  }

  const ok = result.ok !== false
  return {
    visible: true,
    tone: ok ? 'success' : 'warning',
    title: ok ? '推荐关系已确认' : '推荐关系未确认',
    desc: ok
      ? '创建第一个项目后，双方各得 10 万 AI 额度。'
      : normalizeText(result.message)
  }
}

function buildInviteeCard(result) {
  const code = normalizeText(result && result.code)
  const status = normalizeText(result && result.status)
  const message = normalizeText(result && result.message)
  const ok = result && result.ok !== false

  if (ok && status === 'rewarded') {
    return {
      tone: 'success',
      title: '推荐奖励已发放',
      desc: '你已经完成首个项目，双方 10 万 AI 额度已进入账户。',
      primaryText: '进入首页',
      primaryAction: 'home',
      secondaryText: '我也要推荐朋友',
      secondaryAction: 'owner',
      showRules: false
    }
  }

  if (ok) {
    const isSameReferralConfirmed = result && result.alreadyBound && message === '推荐关系已确认'
    return {
      tone: 'success',
      title: (result && result.alreadyBound && !isSameReferralConfirmed) ? '你已有推荐关系' : '推荐关系已确认',
      desc: (result && result.alreadyBound && !isSameReferralConfirmed)
        ? '创建第一个项目后，奖励会按已确认的推荐关系发放。'
        : '创建第一个项目后，你和朋友各得 10 万 AI 额度。',
      primaryText: '创建第一个项目',
      primaryAction: 'createProject',
      secondaryText: '先进入首页',
      secondaryAction: 'home',
      showRules: true
    }
  }

  if (code === 'REFERRAL_INVITEE_NOT_NEW') {
    return {
      tone: 'warning',
      title: '你已是项目功能用户',
      desc: '推荐奖励面向首次创建项目的用户，本次不参与奖励。',
      primaryText: '进入首页',
      primaryAction: 'home',
      secondaryText: '我也要推荐朋友',
      secondaryAction: 'owner',
      showRules: true
    }
  }

  if (code === 'REFERRAL_SELF_NOT_ALLOWED') {
    return {
      tone: 'warning',
      title: '不能绑定自己的推荐链接',
      desc: '你可以把推荐卡片发送给朋友，朋友创建首个项目后双方同等奖励。',
      primaryText: '我也要推荐朋友',
      primaryAction: 'owner',
      secondaryText: '进入首页',
      secondaryAction: 'home',
      showRules: true
    }
  }

  return {
    tone: 'warning',
    title: message || '推荐关系未确认',
    desc: message || '当前推荐链接暂时无法确认，你仍然可以继续进入小程序。',
    primaryText: '进入首页',
    primaryAction: 'home',
    secondaryText: '我也要推荐朋友',
    secondaryAction: 'owner',
    showRules: false
  }
}

function extractReferralCode(options = {}) {
  const directCode = normalizeText(options.referrerCode || options.ref || options.inviteCode)
  if (directCode) {
    return directCode
  }

  const scene = normalizeText(options.scene)
  if (!scene) {
    return ''
  }

  try {
    const decoded = decodeURIComponent(scene)
    const matched = decoded.match(/(?:referrerCode|ref|inviteCode)=([^&]+)/)
    if (matched) {
      return normalizeText(matched[1])
    }
    return /^BMC[A-Z0-9]{6,}$/i.test(decoded) ? decoded : ''
  } catch (error) {
    return ''
  }
}

Page({
  data: {
    appearancePageClass: '',
    isInviteeMode: false,
    isLoading: true,
    referralCode: '',
    brandValueChips: REFERRAL_BRAND_VALUE_CHIPS,
    brandScenes: REFERRAL_BRAND_SCENES,
    rewardAiTokens: 100000,
    sharePath: '',
    stats: buildStats(),
    relations: [],
    bindingNotice: buildBindingNotice(null),
    inviteeCard: buildInviteeCard({
      ok: true,
      status: 'pending',
      message: '推荐关系已确认'
    })
  },

  onLoad(options = {}) {
    syncPageAppearance(this)
    const referrerCode = extractReferralCode(options)
    const isInviteeMode = Boolean(referrerCode)
    this.setData({
      isInviteeMode
    })

    if (!isInviteeMode && typeof wx.showShareMenu === 'function') {
      wx.showShareMenu({
        withShareTicket: false,
        menus: ['shareAppMessage']
      })
    }
    if (isInviteeMode && typeof wx.hideShareMenu === 'function') {
      wx.hideShareMenu()
    }

    if (isInviteeMode) {
      this.bindIncomingReferral(options)
      return
    }

    this.loadReferralInfo()
  },

  onShow() {
    syncPageAppearance(this)
  },

  async bindIncomingReferral(options = {}) {
    const referrerCode = extractReferralCode(options)
    if (!referrerCode) {
      return
    }

    try {
      await resolveAccountData()
      const app = getApp()
      const result = app && typeof app.consumePendingReferralBinding === 'function'
        ? await app.consumePendingReferralBinding()
        : await bindReferralData({ referrerCode })
      const fallbackResult = result || await bindReferralData({ referrerCode })
      this.setData({
        isLoading: false,
        bindingNotice: buildBindingNotice(fallbackResult),
        inviteeCard: buildInviteeCard(fallbackResult)
      })
    } catch (error) {
      const fallbackResult = {
        ok: false,
        message: error && error.message ? error.message : '推荐关系确认失败'
      }
      this.setData({
        isLoading: false,
        bindingNotice: buildBindingNotice(fallbackResult),
        inviteeCard: buildInviteeCard(fallbackResult)
      })
    }
  },

  async loadReferralInfo() {
    this.setData({
      isLoading: true
    })

    try {
      await resolveAccountData()
      const result = await getReferralInfoData()
      const data = result && result.data ? result.data : {}
      this.setData({
        isLoading: false,
        referralCode: normalizeText(data.code),
        rewardAiTokens: Math.max(0, Number(data.rewardAiTokens || 100000)),
        sharePath: normalizeText(data.sharePath),
        stats: buildStats(data.stats),
        relations: Array.isArray(data.relations) ? data.relations : []
      })
    } catch (error) {
      this.setData({
        isLoading: false
      })
      wx.showToast({
        title: error && error.message ? error.message : '当前无法生成推荐码',
        icon: 'none'
      })
    }
  },

  copyReferralCode() {
    const referralCode = normalizeText(this.data.referralCode)
    if (!referralCode) {
      return
    }

    wx.setClipboardData({
      data: referralCode
    })
  },

  runInviteePrimaryAction() {
    this.runInviteeAction(this.data.inviteeCard.primaryAction)
  },

  runInviteeSecondaryAction() {
    this.runInviteeAction(this.data.inviteeCard.secondaryAction)
  },

  runInviteeAction(action) {
    if (action === 'createProject') {
      wx.navigateTo({
        url: '/pages/project-form/project-form'
      })
      return
    }

    if (action === 'owner') {
      wx.redirectTo({
        url: '/pages/referral/referral'
      })
      return
    }

    openTabPage('/pages/index/index')
  },

  onShareAppMessage() {
    const referralCode = normalizeText(this.data.referralCode)
    const path = normalizeText(this.data.sharePath) || `/pages/referral/referral?referrerCode=${encodeURIComponent(referralCode)}`
    return {
      title: '朋友推荐你试试八面成交，项目和推进动作一页看清',
      path,
      imageUrl: REFERRAL_SHARE_IMAGE_URL
    }
  }
})
