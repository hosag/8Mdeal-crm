const {
  resolveAccountData,
  getEntitlementsData,
  getDefaultAccountSummary,
  getDefaultEntitlements
} = require('../../services/data')
const { syncPageAppearance } = require('../../utils/appearance')
const { buildEntitlementOverview } = require('../../utils/entitlement-guard')
const { formatAiQuotaValue, formatInteger } = require('../../utils/quota-format')

function formatDateLabel(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) {
    return ''
  }

  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function formatDateTimeLabel(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) {
    return ''
  }

  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

function getUsageSourceLabel(sourceType) {
  return {
    speech_to_text: '闪录语音识别',
    quick_entry_project_match: 'AI 匹配项目',
    followup_summary: 'AI 生成摘要',
    followup_next_action: 'AI 任务生成',
    billing_subscription: '订阅到账',
    billing_voice_pack: '语音包到账',
    billing_ai_pack: 'AI 包到账',
    feedback_reward: '反馈奖励',
    referral_reward: '推荐奖励',
    admin_console: '额度调整',
    compensate: '额度调整',
    refund_revert: '额度调整'
  }[String(sourceType || '').trim()] || '额度变动'
}

function formatUsageDelta(item = {}) {
  const usageType = String(item.usageType || '').trim()
  const delta = Number(item.delta || 0)
  const absolute = Math.abs(delta)
  if (usageType === 'voice_seconds') {
    return `${delta < 0 ? '-' : '+'}${absolute} 秒`
  }
  return `${delta < 0 ? '-' : '+'}${formatInteger(absolute)} 额度`
}

function buildRecentUsageRows(entitlements) {
  const list = Array.isArray(entitlements && entitlements.recentUsage) ? entitlements.recentUsage : []
  return list.slice(0, 10).map((item) => {
    const meta = item && item.meta && typeof item.meta === 'object' ? item.meta : {}
    return {
      key: String(item.recordId || item.traceId || Math.random()),
      occurredAtText: formatDateTimeLabel(item.occurredAt),
      title: getUsageSourceLabel(item.sourceType),
      projectName: String(meta.projectName || '').trim(),
      deltaText: formatUsageDelta(item),
      isConsume: Number(item.delta || 0) < 0
    }
  })
}

function buildCapabilityRows(entitlements) {
  const source = entitlements && typeof entitlements === 'object' ? entitlements : {}
  return [
    {
      key: 'project',
      title: '项目创建与编辑',
      desc: '控制新增项目、项目字段维护与推进记录更新。',
      detailText: `当前项目 ${Math.max(0, Number(source.currentProjectCount || 0))} 个`,
      enabled: !!source.canCreateProject || !!source.canEditProject
    },
    {
      key: 'follow_up',
      title: '跟进与任务保存',
      desc: source.bindRequiredForWrite ? '绑定手机号后可正式写入。' : '可继续保存跟进、任务和项目更新。',
      detailText: source.bindRequiredForWrite ? '当前需先绑定手机号' : '写入链路正常',
      enabled: !!source.canSaveFollowUp || !!source.canCreateTask
    },
    {
      key: 'speech',
      title: '语音转写',
      desc: '用于语音录入、闪录转写等语音能力。',
      detailText: `剩余 ${Math.max(0, Number(source.voiceSecondsRemaining || 0))} 秒`,
      enabled: !!source.canUseSpeechToText
    },
    {
      key: 'ai',
      title: 'AI 理解与建议',
      desc: '用于 AI 理解、自动整理、任务建议与客户识别。',
      detailText: `剩余 ${formatAiQuotaValue(source.aiTokensRemaining)}`,
      enabled: !!source.canUseAi
    },
    {
      key: 'share_out',
      title: '项目外发',
      desc: source.canShareOut ? '可继续将项目转交给其他人接手。' : '当前套餐暂不支持项目外发。',
      detailText: source.canShareOut ? '外发能力已开启' : '需升级后恢复',
      enabled: !!source.canShareOut
    }
  ].map((item) => ({
    ...item,
    statusText: item.enabled ? '可用' : '受限',
    statusClass: item.enabled ? 'is-success' : 'is-danger'
  }))
}

function buildHeroMetrics(account, entitlements) {
  const overview = buildEntitlementOverview({
    account,
    entitlements
  })

  return [
    {
      key: 'access',
      label: '当前权益',
      value: overview.accessLevelLabel
    },
    {
      key: 'projects',
      label: '项目位',
      value: overview.projectQuotaText
    },
    {
      key: 'voice',
      label: '语音剩余',
      value: `${Math.max(0, Number(entitlements.voiceSecondsRemaining || 0))} 秒`
    },
    {
      key: 'ai',
      label: 'AI 剩余',
      value: formatAiQuotaValue(entitlements.aiTokensRemaining)
    }
  ]
}

function buildPrimaryActionMeta(account, entitlements) {
  const nextAccount = account && typeof account === 'object' ? account : {}
  const nextEntitlements = entitlements && typeof entitlements === 'object' ? entitlements : {}
  const phoneVerified = !!(nextAccount.phoneVerified || nextEntitlements.phoneVerified)
  const accessLevel = String(nextEntitlements.currentAccessLevel || nextAccount.currentAccessLevel || '').trim()
  const accountStatus = String(nextAccount.status || nextEntitlements.status || '').trim()
  const voiceRemaining = Math.max(0, Number(nextEntitlements.voiceSecondsRemaining || 0))
  const aiRemaining = Math.max(0, Number(nextEntitlements.aiTokensRemaining || 0))

  if (!phoneVerified) {
    return {
      text: '绑定手机号',
      action: 'bind_phone'
    }
  }

  if (accessLevel === 'paid_readonly' || accessLevel === 'free_readonly') {
    return {
      text: '订阅套餐',
      action: 'open_subscription'
    }
  }

  if (voiceRemaining <= 120 || aiRemaining <= 10000) {
    return {
      text: '查看流量包',
      action: 'open_addons'
    }
  }

  if (accountStatus === 'trialing') {
    return {
      text: '订阅套餐',
      action: 'open_subscription'
    }
  }

  return {
    text: '查看套餐与加购',
    action: 'open_plans'
  }
}

function buildEffectiveAccessCard(account, entitlements) {
  const accessLevel = String(entitlements.currentAccessLevel || account.currentAccessLevel || '').trim()
  const effectiveToText = formatDateLabel(entitlements.effectiveTo)
  const effectiveFromText = formatDateLabel(entitlements.effectiveFrom)

  if (accessLevel === 'paid_active') {
    return {
      visible: true,
      title: '当前权益已生效',
      rows: [
        { key: 'period', label: '生效周期', value: [effectiveFromText ? `起始 ${effectiveFromText}` : '', effectiveToText ? `至 ${effectiveToText}` : ''].filter(Boolean).join(' · ') || '已生效' }
      ]
    }
  }

  if (accessLevel === 'trial_full') {
    return {
      visible: true,
      title: '当前处于试用期',
      rows: [
        { key: 'period', label: '试用周期', value: effectiveToText ? `至 ${effectiveToText}` : '试用中' }
      ]
    }
  }

  return {
    visible: false,
    title: '',
    rows: []
  }
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

function getPlansFocusByReason(reason) {
  const current = normalizeReason(reason)
  if (current === 'speech_exhausted' || current === 'ai_exhausted') {
    return 'addons'
  }

  if (current === 'project_limit_reached' || current === 'write_disabled' || current === 'share_out_disabled') {
    return 'subscription'
  }

  return ''
}

function buildEntryGuide(reason) {
  const current = normalizeReason(reason)
  const guideMap = {
    bind_required: {
      visible: true,
      tone: 'soft',
      title: '当前账户尚未绑定手机号'
    },
    speech_exhausted: {
      visible: true,
      tone: 'soft',
      title: '当前语音额度已用完'
    },
    ai_exhausted: {
      visible: true,
      tone: 'brand',
      title: '当前 AI 额度已用完'
    },
    project_limit_reached: {
      visible: true,
      tone: 'soft',
      title: '当前项目位已达上限'
    },
    write_disabled: {
      visible: true,
      tone: 'brand',
      title: '当前账号已切换为只读'
    },
    share_out_disabled: {
      visible: true,
      tone: 'neutral',
      title: '当前套餐暂不支持项目外发'
    },
    account_disabled: {
      visible: true,
      tone: 'danger',
      title: '账号状态不可用'
    }
  }

  return guideMap[current] || {
    visible: false,
    tone: 'neutral',
    title: ''
  }
}

function buildPageState(account, entitlements, options = {}) {
  const nextAccount = {
    ...getDefaultAccountSummary(),
    ...(account && typeof account === 'object' ? account : {})
  }
  const nextEntitlements = {
    ...getDefaultEntitlements(),
    ...(entitlements && typeof entitlements === 'object' ? entitlements : {})
  }
  const primaryActionMeta = buildPrimaryActionMeta(nextAccount, nextEntitlements)
  const arrivalReason = normalizeReason(options.reason)

  return {
    account: nextAccount,
    entitlements: nextEntitlements,
    heroMetrics: buildHeroMetrics(nextAccount, nextEntitlements),
    entryGuide: buildEntryGuide(arrivalReason),
    effectiveAccessCard: buildEffectiveAccessCard(nextAccount, nextEntitlements),
    primaryActionMeta,
    recentUsageRows: buildRecentUsageRows(nextEntitlements),
    capabilityRows: buildCapabilityRows(nextEntitlements)
  }
}

Page({
  data: {
    appearancePageClass: '',
    isLoading: true,
    dataSource: 'Mock Demo',
    arrivalReason: '',
    account: getDefaultAccountSummary(),
    entitlements: getDefaultEntitlements(),
    heroMetrics: [],
    entryGuide: {
      visible: false,
      tone: 'neutral',
      title: ''
    },
    effectiveAccessCard: {
      visible: false,
      title: '',
      rows: []
    },
    primaryActionMeta: {
      text: '查看套餐与加购',
      action: 'open_plans'
    },
    recentUsageRows: [],
    capabilityRows: []
  },

  async onLoad(options) {
    syncPageAppearance(this)
    this.setData({
      arrivalReason: normalizeReason(options && options.reason)
    })
    await this.fetchState()
  },

  onShow() {
    syncPageAppearance(this)
    if (!this.data.isLoading) {
      this.fetchState({ silent: true })
    }
  },

  async fetchState(options = {}) {
    if (this.fetchStatePromise) {
      return this.fetchStatePromise
    }

    const isSilent = options && options.silent === true
    const task = (async () => {
    try {
      const [accountResult, entitlementsResult] = await Promise.all([
        resolveAccountData(),
        getEntitlementsData()
      ])
      const account = accountResult && accountResult.data ? accountResult.data : getDefaultAccountSummary()
      const entitlements = entitlementsResult && entitlementsResult.data
        ? entitlementsResult.data
        : getDefaultEntitlements()
      const app = getApp()

      if (app && typeof app.applyAccountState === 'function') {
        app.applyAccountState(account)
      }
      if (app && typeof app.applyEntitlementsState === 'function') {
        app.applyEntitlementsState(entitlements)
      }

      this.setData({
        isLoading: false,
        dataSource: entitlementsResult && entitlementsResult.source ? entitlementsResult.source : accountResult.source,
        ...buildPageState(account, entitlements, {
          reason: this.data.arrivalReason
        })
      })
    } catch (error) {
      this.setData({
        isLoading: false,
        ...buildPageState(getDefaultAccountSummary(), getDefaultEntitlements(), {
          reason: this.data.arrivalReason
        })
      })
      if (!isSilent) {
        wx.showToast({
          title: '当前无法同步权益信息',
          icon: 'none'
        })
      }
    }
    })()

    this.fetchStatePromise = task
    try {
      await task
    } finally {
      this.fetchStatePromise = null
    }
  },

  openPhoneBindPage() {
    const query = ['returnTo=entitlements']
    const focus = getPlansFocusByReason(this.data.arrivalReason)
    if (focus) {
      query.push(`focus=${focus}`)
    }
    if (this.data.arrivalReason) {
      query.push(`reason=${encodeURIComponent(this.data.arrivalReason)}`)
    }
    wx.navigateTo({
      url: `/pages/phone-bind/phone-bind?${query.join('&')}`
    })
  },

  openPlansPage() {
    const focus = getPlansFocusByReason(this.data.arrivalReason)
    const query = []
    if (focus) {
      query.push(`focus=${focus}`)
    }
    if (this.data.arrivalReason) {
      query.push(`reason=${encodeURIComponent(this.data.arrivalReason)}`)
    }
    wx.navigateTo({
      url: `/pages/plans/plans${query.length ? `?${query.join('&')}` : ''}`
    })
  },

  openPlansPageWithFocus(focus) {
    const nextFocus = String(focus || '').trim()
    const query = []
    if (nextFocus) {
      query.push(`focus=${nextFocus}`)
    }
    if (this.data.arrivalReason) {
      query.push(`reason=${encodeURIComponent(this.data.arrivalReason)}`)
    }
    const suffix = query.length ? `?${query.join('&')}` : ''
    wx.navigateTo({
      url: `/pages/plans/plans${suffix}`
    })
  },

  handlePrimaryAction() {
    const action = this.data.primaryActionMeta && this.data.primaryActionMeta.action
    if (action === 'bind_phone') {
      this.openPhoneBindPage()
      return
    }

    if (action === 'open_addons') {
      this.openPlansPageWithFocus('addons')
      return
    }

    if (action === 'open_subscription') {
      this.openPlansPageWithFocus('subscription')
      return
    }

    this.openPlansPage()
  },

  openRoadmapPlansPage() {
    const action = this.data.primaryActionMeta && this.data.primaryActionMeta.action
    if (action === 'open_addons') {
      this.openPlansPageWithFocus('addons')
      return
    }

    if (action === 'open_subscription') {
      this.openPlansPageWithFocus('subscription')
      return
    }

    this.openPlansPage()
  }
})
