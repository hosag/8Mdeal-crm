const {
  resolveAccountData,
  getEntitlementsData,
  getBillingCatalogData,
  createBillingOrderData,
  getDefaultAccountSummary,
  getDefaultEntitlements
} = require('../../services/data')
const { syncPageAppearance } = require('../../utils/appearance')
const { buildEntitlementOverview } = require('../../utils/entitlement-guard')
const {
  getDefaultBillingCatalogData,
  normalizeBillingCatalogPayload,
  formatDateLabel
} = require('../../utils/billing')

function buildOverviewRows(account, entitlements) {
  const overview = buildEntitlementOverview({
    account,
    entitlements
  })

  return [
    { key: 'access', label: '当前权益', value: overview.accessLevelLabel },
    { key: 'phone', label: '手机号', value: overview.phoneStatusLabel },
    { key: 'projects', label: '项目位', value: overview.projectQuotaText },
    { key: 'voice', label: '语音额度', value: overview.voiceQuotaText },
    { key: 'ai', label: 'AI 额度', value: overview.aiQuotaText },
    { key: 'write', label: '写入状态', value: overview.writeStatusLabel }
  ]
}

function buildHeroMetrics(account, entitlements) {
  const overview = buildEntitlementOverview({
    account,
    entitlements
  })
  const voiceRemaining = Math.max(0, Number(entitlements.voiceSecondsRemaining || 0))
  const aiRemaining = Math.max(0, Number(entitlements.aiTokensRemaining || 0))

  return [
    {
      key: 'status',
      label: '当前状态',
      value: overview.accessLevelLabel,
      note: overview.accountStatusLabel
    },
    {
      key: 'projects',
      label: '项目位',
      value: overview.projectQuotaText,
      note: entitlements.canCreateProject ? '可继续新增与推进' : '当前新增与写入受限'
    },
    {
      key: 'voice',
      label: '语音剩余',
      value: `${voiceRemaining} 秒`,
      note: ''
    },
    {
      key: 'ai',
      label: 'AI 剩余',
      value: formatAiQuotaText(aiRemaining),
      note: ''
    }
  ]
}

function buildPlanActionMeta(account, entitlements) {
  const overview = buildEntitlementOverview({
    account,
    entitlements
  })
  const phoneVerified = !!(account.phoneVerified || entitlements.phoneVerified)
  const accessLevel = String(entitlements.currentAccessLevel || account.currentAccessLevel || '').trim()
  const voiceRemaining = Math.max(0, Number(entitlements.voiceSecondsRemaining || 0))
  const aiRemaining = Math.max(0, Number(entitlements.aiTokensRemaining || 0))

  if (!phoneVerified) {
    return {
      title: '先完成手机号绑定，再开通正式套餐',
      desc: '绑定后，订阅和后续语音 / AI 加购都会准确归属到当前账户，便于后续续费和权益同步。',
      actionText: '去绑定手机号',
      actionType: 'bind_phone'
    }
  }

  if (accessLevel === 'paid_readonly' || accessLevel === 'free_readonly') {
    return {
      title: '当前账号处于只读状态，建议优先恢复正式可写',
      desc: '开通正式订阅后，可恢复项目新增、跟进保存、闪录语音和 AI 能力。',
      actionText: '订阅套餐',
      actionType: 'open_subscription'
    }
  }

  if (voiceRemaining <= 120 || aiRemaining <= 10000) {
    return {
      title: '当前语音或 AI 额度接近用尽，建议优先补充流量',
      desc: '订阅负责持续可写，语音和 AI 可按使用强度单独补量，避免影响闪录与自动整理。',
      actionText: '查看流量包',
      actionType: 'open_addons'
    }
  }

  if (String(account.status || entitlements.status || '').trim() === 'trialing') {
    return {
      title: '当前仍在试用期，建议提前确认正式开通方案',
      desc: overview.reasonSummary || '试用结束后会保留查看，但不能继续新增项目、使用语音或 AI。',
      actionText: '订阅套餐',
      actionType: 'open_subscription'
    }
  }

  return {
    title: '当前账户状态正常，可按使用强度选择订阅与加购',
    desc: '正式订阅负责持续可写；语音和 AI 额度不足时，再按需补充流量包即可。',
    actionText: '查看套餐与加购',
    actionType: 'open_subscription'
  }
}

function buildTrialBadge(account, product) {
  const currentStatus = String(account.status || '').trim()
  if (currentStatus === 'trialing') {
    return {
      text: '当前在用',
      className: 'is-brand'
    }
  }

  return {
    text: product.trialEligible ? '试用规则' : '体验入口',
    className: ''
  }
}

function getProductRecommendationMeta(product, options = {}) {
  const arrivalReason = normalizeReason(options.reason)
  const productType = String(product && product.productType || '').trim()
  const billingCycle = String(product && product.billingCycle || '').trim()

  if (arrivalReason === 'speech_exhausted' && productType === 'voice_pack') {
    return {
      recommended: true,
      tone: 'danger',
      text: '当前最相关'
    }
  }

  if (arrivalReason === 'ai_exhausted' && productType === 'ai_pack') {
    return {
      recommended: true,
      tone: 'brand',
      text: '当前最相关'
    }
  }

  if (
    ['project_limit_reached', 'write_disabled', 'share_out_disabled'].includes(arrivalReason)
    && productType === 'subscription'
  ) {
    return {
      recommended: true,
      tone: 'brand',
      text: billingCycle === 'yearly' ? '推荐长期恢复' : '推荐先恢复'
    }
  }

  if (arrivalReason === 'bind_required' && productType === 'subscription') {
    return {
      recommended: true,
      tone: 'soft',
      text: '绑定后可开通'
    }
  }

  return {
    recommended: false,
    tone: '',
    text: ''
  }
}

function buildSubscriptionBadge(product, latestSubscription, entitlements, options = {}) {
  const accessLevel = String(entitlements.currentAccessLevel || '').trim()
  const recommendationMeta = getProductRecommendationMeta(product, options)
  if (latestSubscription && latestSubscription.planCode && latestSubscription.planCode === product.productCode) {
    return {
      text: '当前套餐',
      className: 'is-success'
    }
  }

  if (accessLevel === 'paid_active' && !latestSubscription) {
    return {
      text: '正式套餐',
      className: 'is-success'
    }
  }

  if (product.billingCycle === 'yearly') {
    return {
      text: '长期使用',
      className: 'is-soft'
    }
  }

  if (recommendationMeta.recommended) {
    return {
      text: recommendationMeta.text || '推荐优先看',
      className: recommendationMeta.tone ? `is-${recommendationMeta.tone}` : 'is-brand'
    }
  }

  return {
    text: '推荐先做',
    className: 'is-brand'
  }
}

function buildAddonBadge(product, entitlements, options = {}) {
  const voiceRemaining = Math.max(0, Number(entitlements.voiceSecondsRemaining || 0))
  const aiRemaining = Math.max(0, Number(entitlements.aiTokensRemaining || 0))
  const recommendationMeta = getProductRecommendationMeta(product, options)
  const isPriority = product.productType === 'voice_pack'
    ? voiceRemaining <= 120
    : aiRemaining <= 10000

  if (recommendationMeta.recommended) {
    return {
      text: recommendationMeta.text || '当前最相关',
      className: recommendationMeta.tone ? `is-${recommendationMeta.tone}` : 'is-danger'
    }
  }

  return {
    text: isPriority ? '优先关注' : '按需加购',
    className: isPriority ? 'is-danger' : ''
  }
}

function buildProductAction(product, phoneVerified, options = {}) {
  const arrivalReason = normalizeReason(options.reason)

  if (product.productType === 'trial') {
    return {
      text: '查看试用规则',
      mode: 'preview'
    }
  }

  if (!phoneVerified) {
    return {
      text: '先绑定手机号',
      mode: 'bind_phone'
    }
  }

  if (product.productType === 'voice_pack') {
    return {
      text: arrivalReason === 'speech_exhausted' ? '补语音时长' : '准备加购语音包',
      mode: 'preview'
    }
  }

  if (product.productType === 'ai_pack') {
    return {
      text: arrivalReason === 'ai_exhausted' ? '补 AI 额度' : '准备加购 AI 包',
      mode: 'preview'
    }
  }

  if (product.billingCycle === 'yearly') {
    return {
      text: ['project_limit_reached', 'write_disabled', 'share_out_disabled'].includes(arrivalReason)
        ? '订阅套餐'
        : '准备开通年付',
      mode: 'preview'
    }
  }

  return {
    text: ['project_limit_reached', 'write_disabled', 'share_out_disabled'].includes(arrivalReason)
      ? '订阅套餐'
      : '准备开通月付',
    mode: 'preview'
  }
}

function buildProductCard(product, account, entitlements, latestSubscription, options = {}) {
  const phoneVerified = !!(account.phoneVerified || entitlements.phoneVerified)
  const recommendationMeta = getProductRecommendationMeta(product, options)
  const trialEndText = formatDateLabel(account.trialEndsAt)
  const priceText = String(product.displayPriceText || '').trim()
  const badge = product.productType === 'trial'
    ? buildTrialBadge(account, product)
    : (product.productType === 'subscription'
      ? buildSubscriptionBadge(product, latestSubscription, entitlements, options)
      : buildAddonBadge(product, entitlements, options))
  const action = buildProductAction(product, phoneVerified, options)
  const billingText = product.productType === 'trial' && trialEndText
    ? `试用至 ${trialEndText}`
    : product.displayBillingText
  const submittingProductKey = String(options.submittingProductKey || '').trim()
  const isSubmitting = submittingProductKey && submittingProductKey === String(product.productCode || '').trim()

  return {
    key: product.productCode,
    title: product.productName,
    priceText,
    priceClass: /^¥/.test(priceText) ? 'is-amount' : 'is-copy',
    originalPriceText: String(product.originalPriceText || '').trim(),
    billingText,
    badgeText: badge.text,
    badgeClass: badge.className,
    desc: product.summary,
    featureLines: product.featureLines,
    actionText: isSubmitting ? '处理中...' : action.text,
    actionMode: action.mode,
    isRecommended: recommendationMeta.recommended,
    actionButtonClass: `${recommendationMeta.recommended || product.productType === 'subscription' ? 'btn-primary' : 'btn-secondary'}${isSubmitting ? ' is-disabled' : ''}`,
    isSubmitting,
    summaryTag: product.productType === 'trial' ? '试用规则' : product.productType === 'subscription' ? '订阅套餐' : '流量包',
    productCode: product.productCode,
    productType: product.productType,
    billingCycle: product.billingCycle,
    projectLimit: Number(product.projectLimit),
    supportsShareOut: !!product.supportsShareOut,
    supportsQuickEntry: !!product.supportsQuickEntry,
    supportsAi: !!product.supportsAi,
    supportsSpeechToText: !!product.supportsSpeechToText,
    includedVoiceSeconds: Number(product.includedVoiceSeconds || 0),
    includedAiTokens: Number(product.includedAiTokens || 0)
  }
}

function sortRecommendedProducts(cards = []) {
  return cards.slice().sort((left, right) => {
    const leftScore = left && left.isRecommended ? 1 : 0
    const rightScore = right && right.isRecommended ? 1 : 0
    return rightScore - leftScore
  })
}

function buildSubscriptionPlans(account, entitlements, billingCatalog, options = {}) {
  const products = Array.isArray(billingCatalog.products) ? billingCatalog.products : []
  return sortRecommendedProducts(products
    .filter((item) => item.productType === 'trial' || item.productType === 'subscription')
    .map((item) => buildProductCard(item, account, entitlements, billingCatalog.latestSubscription, options)))
}

function buildAddonPacks(account, entitlements, billingCatalog, options = {}) {
  const products = Array.isArray(billingCatalog.products) ? billingCatalog.products : []
  return sortRecommendedProducts(products
    .filter((item) => item.productType === 'voice_pack' || item.productType === 'ai_pack')
    .map((item) => buildProductCard(item, account, entitlements, billingCatalog.latestSubscription, options)))
}

function buildEffectiveSubscriptionSummary(account, entitlements, latestSubscription) {
  const accessLevel = String(entitlements.currentAccessLevel || account.currentAccessLevel || '').trim()
  if (!latestSubscription || accessLevel !== 'paid_active') {
    return null
  }

  const projectLimit = Number(entitlements.projectLimit)
  const currentProjectCount = Math.max(0, Number(entitlements.currentProjectCount || 0))
  const projectText = Number.isFinite(projectLimit) && projectLimit > -1
    ? `${currentProjectCount}/${projectLimit} 个项目位`
    : `${currentProjectCount} 个在用项目`

  return {
    title: latestSubscription.planName || '当前套餐',
    statusText: '已生效',
    expiresAtText: latestSubscription.expiresAtText || formatDateLabel(latestSubscription.expiresAt) || '待确认',
    summaryText: latestSubscription.summaryText || '',
    voiceText: `${Math.max(0, Number(entitlements.voiceSecondsRemaining || 0))} 秒剩余`,
    aiText: `${formatAiQuotaText(entitlements.aiTokensRemaining)} 剩余`,
    projectText
  }
}

function buildPageState(account, entitlements, billingCatalog, options = {}) {
  const nextAccount = {
    ...getDefaultAccountSummary(),
    ...(account && typeof account === 'object' ? account : {})
  }
  const nextEntitlements = {
    ...getDefaultEntitlements(),
    ...(entitlements && typeof entitlements === 'object' ? entitlements : {})
  }
  const nextBillingCatalog = normalizeBillingCatalogPayload({
    ...getDefaultBillingCatalogData(),
    ...(billingCatalog && typeof billingCatalog === 'object' ? billingCatalog : {})
  })
  const overview = buildEntitlementOverview({
    account: nextAccount,
    entitlements: nextEntitlements
  })
  const actionMeta = buildPlanActionMeta(nextAccount, nextEntitlements)
  const arrivalReason = normalizeReason(options.reason)

  return {
    account: nextAccount,
    entitlements: nextEntitlements,
    billingCatalog: nextBillingCatalog,
    heroCaption: [
      overview.accountStatusLabel,
      overview.accessLevelLabel,
      nextAccount.phoneVerified ? (nextAccount.phoneMasked || '已绑定手机号') : '待绑定手机号'
    ].filter(Boolean).join(' · '),
    heroMetrics: buildHeroMetrics(nextAccount, nextEntitlements),
    entryGuide: buildEntryGuide(arrivalReason),
    overviewRows: buildOverviewRows(nextAccount, nextEntitlements),
    effectiveSubscriptionSummary: buildEffectiveSubscriptionSummary(
      nextAccount,
      nextEntitlements,
      nextBillingCatalog.latestSubscription
    ),
    recentOrders: nextBillingCatalog.recentOrders,
    planActionMeta: actionMeta,
    subscriptionPlans: buildSubscriptionPlans(nextAccount, nextEntitlements, nextBillingCatalog, {
      reason: arrivalReason,
      submittingProductKey: options.submittingProductKey
    }),
    addonPacks: buildAddonPacks(nextAccount, nextEntitlements, nextBillingCatalog, {
      reason: arrivalReason,
      submittingProductKey: options.submittingProductKey
    })
  }
}

function formatInteger(value) {
  const number = Math.max(0, Number(value || 0))
  if (!Number.isFinite(number)) {
    return '0'
  }

  return Math.round(number).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function formatVoiceQuotaText(value) {
  const seconds = Math.max(0, Number(value || 0))
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '无'
  }

  if (seconds % 3600 === 0) {
    return `${seconds / 3600} 小时`
  }

  if (seconds % 60 === 0) {
    return `${seconds / 60} 分钟`
  }

  return `${seconds} 秒`
}

function formatAiQuotaText(value) {
  const tokens = Math.max(0, Number(value || 0))
  if (!Number.isFinite(tokens) || tokens <= 0) {
    return '无'
  }

  return `${formatInteger(tokens)} 额度`
}

function formatProjectLimitText(value) {
  const projectLimit = Number(value)
  if (!Number.isFinite(projectLimit) || projectLimit < 0) {
    return '不限项目位'
  }

  return `${projectLimit} 个项目位`
}

function buildCapabilityLines(product = {}) {
  const lines = []

  if (product.supportsQuickEntry) {
    lines.push('支持闪录与快速录入')
  }

  if (product.supportsSpeechToText) {
    lines.push('支持语音转写')
  }

  if (product.supportsAi) {
    lines.push('支持 AI 自动整理')
  }

  if (product.supportsShareOut) {
    lines.push('支持项目外发与转交')
  }

  return lines
}

function buildOrderConfirmRows(product = {}) {
  const rows = [
    {
      key: 'billing',
      label: '计费周期',
      value: product.billingText || '待配置'
    }
  ]

  if (product.productType === 'subscription') {
    rows.push({
      key: 'projects',
      label: '项目位',
      value: formatProjectLimitText(product.projectLimit)
    })
  }

  if (Number(product.includedVoiceSeconds) > 0) {
    rows.push({
      key: 'voice',
      label: '语音额度',
      value: formatVoiceQuotaText(product.includedVoiceSeconds)
    })
  }

  if (Number(product.includedAiTokens) > 0) {
    rows.push({
      key: 'ai',
      label: 'AI 额度',
      value: formatAiQuotaText(product.includedAiTokens)
    })
  }

  return rows
}

function buildOrderConfirmSheet(product = {}, billingCatalog = {}) {
  const productType = String(product.productType || '').trim()
  const paymentEnabled = !!(billingCatalog && billingCatalog.paymentEnabled)

  return {
    ...product,
    sheetTitle: productType === 'subscription' ? '确认开通信息' : '确认加购信息',
    confirmText: paymentEnabled ? '确认并继续支付' : '确认创建订单',
    summaryRows: buildOrderConfirmRows(product),
    capabilityLines: buildCapabilityLines(product)
  }
}

function buildPreviewContent(product, account) {
  const name = product && product.title ? product.title : '当前商品'
  const phoneText = account && account.phoneVerified
    ? `当前账户已绑定 ${account.phoneMasked || '手机号'}。`
    : '当前账户还未绑定手机号。'

  return [
    name,
    phoneText
  ].join('\n')
}

function buildOrderDetailUrl(orderId = '', reason = '', focus = '') {
  const nextOrderId = String(orderId || '').trim()
  if (!nextOrderId) {
    return ''
  }

  const query = [`orderId=${encodeURIComponent(nextOrderId)}`]
  const nextReason = normalizeReason(reason)
  const nextFocus = normalizeFocus(focus)
  if (nextReason) {
    query.push(`reason=${encodeURIComponent(nextReason)}`)
  }
  if (nextFocus) {
    query.push(`focus=${nextFocus}`)
  }

  return `/pages/billing-order/billing-order?${query.join('&')}`
}

function normalizeFocus(value) {
  const current = String(value || '').trim()
  if (current === 'addons') {
    return 'addons'
  }

  if (current === 'subscription') {
    return 'subscription'
  }

  return ''
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

function getFocusByReason(reason) {
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
      title: '当前账户尚未绑定手机号',
      desc: '你仍可继续浏览和体验，但在正式保存数据、开通订阅或加购额度前，需要先完成手机号绑定。'
    },
    speech_exhausted: {
      visible: true,
      tone: 'soft',
      title: '当前语音额度已用完',
      desc: '建议优先查看语音流量包；补量后，语音录入和闪录转写会立即恢复可用。'
    },
    ai_exhausted: {
      visible: true,
      tone: 'brand',
      title: '当前 AI 额度已用完',
      desc: '建议优先查看 AI 流量包；补量后，AI 理解、整理和自动建议会恢复可用。'
    },
    project_limit_reached: {
      visible: true,
      tone: 'soft',
      title: '当前项目位已达上限',
      desc: '建议优先查看正式订阅，恢复持续可写能力并扩展项目承载上限。'
    },
    write_disabled: {
      visible: true,
      tone: 'brand',
      title: '当前账号已切换为只读',
      desc: '你仍可查看完整进展，但新增项目、保存跟进、闪录和 AI 能力需要恢复正式可写状态。'
    },
    share_out_disabled: {
      visible: true,
      tone: 'neutral',
      title: '当前套餐暂不支持项目外发',
      desc: '如果你需要将项目直接转交给其他人接手，建议优先查看支持外发能力的正式订阅。'
    },
    account_disabled: {
      visible: true,
      tone: 'danger',
      title: '当前账号状态异常',
      desc: '建议先到权益页确认账户状态，待账号恢复正常后，再继续处理订阅或加购。'
    }
  }

  return guideMap[current] || {
    visible: false,
    tone: 'neutral',
    title: '',
    desc: ''
  }
}

Page({
  data: {
    appearancePageClass: '',
    isLoading: true,
    dataSource: 'Mock Demo',
    account: getDefaultAccountSummary(),
    entitlements: getDefaultEntitlements(),
    billingCatalog: normalizeBillingCatalogPayload(getDefaultBillingCatalogData()),
    arrivalReason: '',
    initialFocus: '',
    hasAppliedInitialFocus: false,
    entryGuide: {
      visible: false,
      tone: 'neutral',
      title: '',
      desc: ''
    },
    heroCaption: '',
    heroMetrics: [],
    overviewRows: [],
    effectiveSubscriptionSummary: null,
    recentOrders: [],
    submittingProductKey: '',
    confirmSheetVisible: false,
    confirmProduct: null,
    planActionMeta: {
      title: '',
      desc: '',
      actionText: '',
      actionType: 'open_subscription'
    },
    subscriptionPlans: [],
    addonPacks: []
  },

  async onLoad(options) {
    syncPageAppearance(this)
    const arrivalReason = normalizeReason(options && options.reason)
    this.setData({
      arrivalReason,
      initialFocus: normalizeFocus(options && options.focus) || getFocusByReason(arrivalReason),
      hasAppliedInitialFocus: false
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
      const [accountResult, entitlementsResult, billingResult] = await Promise.all([
        resolveAccountData(),
        getEntitlementsData(),
        getBillingCatalogData().catch(() => ({
          data: normalizeBillingCatalogPayload({
            ...getDefaultBillingCatalogData(),
            source: 'Mock Demo'
          }),
          source: 'Mock Demo'
        }))
      ])
      const account = accountResult && accountResult.data ? accountResult.data : getDefaultAccountSummary()
      const entitlements = entitlementsResult && entitlementsResult.data
        ? entitlementsResult.data
        : getDefaultEntitlements()
      const billingCatalog = billingResult && billingResult.data
        ? billingResult.data
        : normalizeBillingCatalogPayload(getDefaultBillingCatalogData())
      const app = getApp()

      if (app && typeof app.applyAccountState === 'function') {
        app.applyAccountState(account)
      }
      if (app && typeof app.applyEntitlementsState === 'function') {
        app.applyEntitlementsState(entitlements)
      }

      this.setData({
        isLoading: false,
        dataSource: billingResult && billingResult.source
          ? billingResult.source
          : (entitlementsResult && entitlementsResult.source ? entitlementsResult.source : (accountResult && accountResult.source ? accountResult.source : 'CloudBase')),
        ...buildPageState(account, entitlements, billingCatalog, {
          reason: this.data.arrivalReason
        })
      })
      this.applyInitialFocus()
    } catch (error) {
      this.setData({
        isLoading: false,
        ...buildPageState(
          getDefaultAccountSummary(),
          getDefaultEntitlements(),
          normalizeBillingCatalogPayload(getDefaultBillingCatalogData()),
          {
            reason: this.data.arrivalReason
          }
        )
      })
      if (!isSilent) {
        wx.showToast({
          title: '当前无法同步套餐信息',
          icon: 'none'
        })
      }
      this.applyInitialFocus()
    }
    })()

    this.fetchStatePromise = task
    try {
      await task
    } finally {
      this.fetchStatePromise = null
    }
  },

  applyInitialFocus() {
    const focus = normalizeFocus(this.data.initialFocus)
    if (!focus || this.data.hasAppliedInitialFocus) {
      return
    }

    const selector = focus === 'addons' ? '#addon-section' : '#subscription-section'
    this.setData({
      hasAppliedInitialFocus: true
    })

    setTimeout(() => {
      wx.pageScrollTo({
        selector,
        duration: 0
      })
    }, 80)
  },

  openPhoneBindPage() {
    const query = ['returnTo=plans']
    const focus = this.data.initialFocus || getFocusByReason(this.data.arrivalReason)
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

  openEntitlementsPage() {
    const suffix = this.data.arrivalReason ? `?reason=${encodeURIComponent(this.data.arrivalReason)}` : ''
    wx.navigateTo({
      url: `/pages/entitlements/entitlements${suffix}`
    })
  },

  openOrderDetail(event) {
    const orderId = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.orderId || '').trim()
    if (!orderId) {
      return
    }

    const url = buildOrderDetailUrl(
      orderId,
      this.data.arrivalReason,
      this.data.initialFocus || getFocusByReason(this.data.arrivalReason)
    )
    wx.navigateTo({
      url
    })
  },

  handlePrimaryAction() {
    const actionType = this.data.planActionMeta && this.data.planActionMeta.actionType
    if (actionType === 'bind_phone') {
      this.openPhoneBindPage()
      return
    }

    if (actionType === 'open_addons') {
      wx.pageScrollTo({
        selector: '#addon-section',
        duration: 220
      })
      return
    }

    wx.pageScrollTo({
      selector: '#subscription-section',
      duration: 220
    })
  },

  onProductAction(event) {
    const { group, key } = event.currentTarget.dataset
    if (this.data.submittingProductKey) {
      return
    }
    const products = group === 'addons' ? this.data.addonPacks : this.data.subscriptionPlans
    const product = (Array.isArray(products) ? products : []).find((item) => item.key === key)

    if (!product) {
      return
    }

    if (product.actionMode === 'bind_phone') {
      this.openPhoneBindPage()
      return
    }

    if (product.productType !== 'trial') {
      this.openOrderConfirmSheet(product)
      return
    }

    wx.showModal({
      title: product.title,
      content: buildPreviewContent(product, this.data.account),
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  openOrderConfirmSheet(product) {
    this.setData({
      confirmSheetVisible: true,
      confirmProduct: buildOrderConfirmSheet(product, this.data.billingCatalog)
    })
  },

  closeOrderConfirmSheet() {
    if (this.data.submittingProductKey) {
      return
    }

    this.setData({
      confirmSheetVisible: false,
      confirmProduct: null
    })
  },

  async confirmPendingOrder() {
    const product = this.data.confirmProduct
    if (!product || this.data.submittingProductKey) {
      return
    }

    this.setData({
      confirmSheetVisible: false,
      confirmProduct: null
    })

    await this.createPendingOrder(product)
  },

  async createPendingOrder(product) {
    let loadingVisible = false
    this.setData({
      submittingProductKey: product.key,
      ...buildPageState(
        this.data.account,
        this.data.entitlements,
        this.data.billingCatalog,
        {
          reason: this.data.arrivalReason,
          submittingProductKey: product.key
        }
      )
    })
    wx.showLoading({
      title: '正在创建订单',
      mask: true
    })
    loadingVisible = true

    try {
      const result = await createBillingOrderData({
        productCode: product.productCode,
        productType: product.productType,
        billingCycle: product.billingCycle,
        title: product.title
      })

      const orderPayload = result && result.data ? result.data : {}
      const order = orderPayload && orderPayload.order ? orderPayload.order : {}
      const orderId = String(order.orderId || '').trim()
      const orderDetailUrl = buildOrderDetailUrl(
        orderId,
        this.data.arrivalReason,
        this.data.initialFocus || getFocusByReason(this.data.arrivalReason)
      )

      if (loadingVisible) {
        wx.hideLoading()
        loadingVisible = false
      }
      if (orderDetailUrl) {
        wx.showToast({
          title: orderPayload && orderPayload.reused ? '已复用待支付订单' : '订单已创建',
          icon: 'none',
          duration: 1200
        })
        setTimeout(() => {
          wx.navigateTo({
            url: orderDetailUrl
          })
        }, 180)
      } else {
        wx.showToast({
          title: orderPayload && orderPayload.reused ? '已复用待支付订单' : '订单已创建',
          icon: 'none',
          duration: 2000
        })
      }

      this.fetchState().catch(() => {})
    } catch (error) {
      if (loadingVisible) {
        wx.hideLoading()
        loadingVisible = false
      }
      wx.showToast({
        title: error && error.message ? error.message : '当前无法创建订单',
        icon: 'none'
      })
    } finally {
      if (loadingVisible) {
        wx.hideLoading()
        loadingVisible = false
      }
      this.setData({
        submittingProductKey: '',
        ...buildPageState(
          this.data.account,
          this.data.entitlements,
          this.data.billingCatalog,
          {
            reason: this.data.arrivalReason,
            submittingProductKey: ''
          }
        )
      })
    }
  },

  noop() {}
})
