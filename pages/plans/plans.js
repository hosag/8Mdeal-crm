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

function buildHeroCaption(account, entitlements) {
  const overview = buildEntitlementOverview({
    account,
    entitlements
  })

  return [
    overview.accountStatusLabel,
    overview.accessLevelLabel,
    overview.phoneStatusLabel
  ].filter(Boolean).join(' · ')
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
      title: '先绑定手机号，再处理订阅或加购',
      desc: '绑定后，购买记录和后续权益会准确归属到当前账户。',
      actionText: '去绑定手机号',
      actionType: 'bind_phone'
    }
  }

  if (accessLevel === 'paid_readonly' || accessLevel === 'free_readonly') {
    return {
      title: '当前仅可查看，建议先恢复编辑功能',
      desc: '正式订阅会恢复新增项目、跟进保存、闪录语音和 AI 能力。',
      actionText: '订阅套餐',
      actionType: 'open_subscription'
    }
  }

  if (voiceRemaining <= 120 || aiRemaining <= 10000) {
    return {
      title: '当前流量紧缺，建议先补最需要的额度',
      desc: '补量后会立即恢复语音或 AI 能力，不影响现有订阅。',
      actionText: '查看流量包',
      actionType: 'open_addons'
    }
  }

  if (String(account.status || entitlements.status || '').trim() === 'trialing') {
    return {
      title: '当前仍在试用期，建议提前确认正式方案',
      desc: overview.reasonSummary || '试用结束后会保留查看，但不能继续新增、语音或 AI。',
      actionText: '订阅套餐',
      actionType: 'open_subscription'
    }
  }

  return {
    title: '按使用强度选择订阅或加购',
    desc: '订阅后可继续编辑保存；额度不足时，再单独补语音或 AI。',
    actionText: '查看套餐与加购',
    actionType: 'open_subscription'
  }
}

function buildTrialBadge(account, product) {
  const currentStatus = String(account.status || '').trim()
  if (currentStatus === 'trialing') {
    return {
      text: '试用中',
      className: 'is-brand'
    }
  }

  return {
    text: '',
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
      text: '已生效',
      className: 'is-success'
    }
  }

  if (recommendationMeta.recommended) {
    return {
      text: recommendationMeta.text || '推荐优先看',
      className: recommendationMeta.tone ? `is-${recommendationMeta.tone}` : 'is-brand'
    }
  }

  return {
    text: '',
    className: ''
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
    text: isPriority ? '推荐' : '',
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
      text: arrivalReason === 'speech_exhausted' ? '补语音时长' : '查看语音包',
      mode: 'preview'
    }
  }

  if (product.productType === 'ai_pack') {
    return {
      text: arrivalReason === 'ai_exhausted' ? '补 AI 额度' : '查看 AI 包',
      mode: 'preview'
    }
  }

  if (product.billingCycle === 'yearly') {
    return {
      text: ['project_limit_reached', 'write_disabled', 'share_out_disabled'].includes(arrivalReason)
        ? '订阅套餐'
        : '选择年付',
      mode: 'preview'
    }
  }

  return {
    text: ['project_limit_reached', 'write_disabled', 'share_out_disabled'].includes(arrivalReason)
      ? '订阅套餐'
      : '选择月付',
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
  const billingText = buildProductCardBillingText(product, trialEndText)
  const submittingProductKey = String(options.submittingProductKey || '').trim()
  const isSubmitting = submittingProductKey && submittingProductKey === String(product.productCode || '').trim()

  return {
    key: product.productCode,
    title: product.productName,
    cardLayout: product.productType === 'voice_pack' || product.productType === 'ai_pack' ? 'addon' : 'plan',
    priceText,
    priceClass: /^¥/.test(priceText) ? 'is-amount' : 'is-copy',
    originalPriceText: String(product.originalPriceText || '').trim(),
    billingText,
    badgeText: badge.text,
    badgeClass: badge.className,
    summaryText: buildProductSummaryText(product),
    detailRows: buildProductDetailRows(product),
    primarySpec: buildProductPrimarySpec(product),
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
    ? `${currentProjectCount}/${projectLimit} 个项目`
    : `${currentProjectCount} 个在用项目`

  return {
    title: latestSubscription.planName || '当前套餐',
    statusText: '已生效',
    expiresAtText: latestSubscription.expiresAtText || formatDateLabel(latestSubscription.expiresAt) || '待确认',
    summaryText: latestSubscription.summaryText || '',
    voiceText: `${Math.max(0, Number(entitlements.voiceSecondsRemaining || 0))} 秒剩余`,
    aiText: `${formatAiQuotaText(entitlements.aiTokensRemaining)} 剩余`,
    projectText,
    detailText: [
      projectText,
      `${Math.max(0, Number(entitlements.voiceSecondsRemaining || 0))} 秒语音`,
      `${formatAiQuotaText(entitlements.aiTokensRemaining)}`
    ].filter(Boolean).join(' · ')
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
  const actionMeta = buildPlanActionMeta(nextAccount, nextEntitlements)
  const arrivalReason = normalizeReason(options.reason)
  const initialFocus = normalizeFocus(options.focus) || getFocusByReason(arrivalReason)
  const subscriptionPlans = buildSubscriptionPlans(nextAccount, nextEntitlements, nextBillingCatalog, {
    reason: arrivalReason,
    submittingProductKey: options.submittingProductKey
  })
  const addonPacks = buildAddonPacks(nextAccount, nextEntitlements, nextBillingCatalog, {
    reason: arrivalReason,
    submittingProductKey: options.submittingProductKey
  })

  return {
    account: nextAccount,
    entitlements: nextEntitlements,
    billingCatalog: nextBillingCatalog,
    heroCaption: buildHeroCaption(nextAccount, nextEntitlements),
    entryGuide: buildEntryGuide(arrivalReason),
    effectiveSubscriptionSummary: buildEffectiveSubscriptionSummary(
      nextAccount,
      nextEntitlements,
      nextBillingCatalog.latestSubscription
    ),
    recentOrders: Array.isArray(nextBillingCatalog.recentOrders) ? nextBillingCatalog.recentOrders.slice(0, 2) : [],
    planActionMeta: actionMeta,
    subscriptionPlans,
    addonPacks,
    productSections: buildProductSections(subscriptionPlans, addonPacks, initialFocus)
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
    return '项目数量不限'
  }

  return `${projectLimit} 个项目`
}

function buildProductCardBillingText(product = {}, trialEndText = '') {
  if (product.productType === 'trial') {
    return trialEndText ? `试用至 ${trialEndText}` : '试用入口'
  }

  if (product.productType === 'voice_pack' || product.productType === 'ai_pack') {
    return '一次性加购'
  }

  return String(product.displayBillingText || '').trim()
}

function formatIncludedBundleText(product = {}) {
  const voiceSeconds = Number(product.includedVoiceSeconds || 0)
  const aiTokens = Number(product.includedAiTokens || 0)
  const parts = []

  if (voiceSeconds > 0) {
    parts.push(`${formatVoiceQuotaText(voiceSeconds)}语音`)
  }

  if (aiTokens > 0) {
    parts.push(formatAiQuotaText(aiTokens))
  }

  return parts.join(' · ')
}

function buildProductSummaryText(product = {}) {
  if (product.productType === 'trial') {
    return '先体验闪录、AI 与外发的完整流程。'
  }

  if (product.productType === 'subscription' && product.billingCycle === 'yearly') {
    return '长期保持可继续使用，减少到期中断。'
  }

  if (product.productType === 'subscription') {
    return '先恢复编辑和保存功能，适合日常稳定使用。'
  }

  if (product.productType === 'voice_pack') {
    return '补量后，语音录入和闪录转写会立即恢复。'
  }

  if (product.productType === 'ai_pack') {
    return '补量后，AI 理解、整理和建议会立即恢复。'
  }

  return String(product.summary || '').trim()
}

function buildProductDetailRows(product = {}) {
  const productType = String(product.productType || '').trim()

  if (productType === 'trial' || productType === 'subscription') {
    return [
      {
        label: '项目数量',
        value: formatProjectLimitText(product.projectLimit)
      },
      {
        label: productType === 'trial' ? '试用内含' : '套餐内含',
        value: formatIncludedBundleText(product) || '按商品配置'
      }
    ]
  }

  if (productType === 'voice_pack') {
    return [
      {
        label: '使用规则',
        value: '按实际成功转写消耗'
      },
      {
        label: '生效方式',
        value: '不影响现有订阅'
      }
    ]
  }

  if (productType === 'ai_pack') {
    return [
      {
        label: '覆盖范围',
        value: '摘要、建议、项目研判'
      },
      {
        label: '生效方式',
        value: '不影响现有订阅'
      }
    ]
  }

  return []
}

function buildAddonMetaText(product = {}) {
  const priceText = String(product.displayPriceText || '').trim()
  return ['一次性加购', priceText].filter(Boolean).join(' · ')
}

function buildProductPrimarySpec(product = {}) {
  const productType = String(product.productType || '').trim()

  if (productType === 'voice_pack') {
    return {
      label: '本包语音时长',
      value: formatVoiceQuotaText(product.includedVoiceSeconds),
      meta: buildAddonMetaText(product)
    }
  }

  if (productType === 'ai_pack') {
    return {
      label: '本包 AI 额度',
      value: formatAiQuotaText(product.includedAiTokens),
      meta: buildAddonMetaText(product)
    }
  }

  return null
}

function buildProductSections(subscriptionPlans = [], addonPacks = [], focus = '') {
  const sections = [
    {
      key: 'subscription',
      id: 'subscription-section',
      group: 'subscriptions',
      title: '订阅套餐',
      desc: '恢复编辑、项目数量与外发能力。',
      products: subscriptionPlans
    },
    {
      key: 'addons',
      id: 'addon-section',
      group: 'addons',
      title: '语音与 AI 流量包',
      desc: '只补语音或 AI，不影响当前订阅。',
      products: addonPacks
    }
  ]

  const orderedSections = focus === 'addons'
    ? [sections[1], sections[0]]
    : sections

  return orderedSections
    .filter((section) => Array.isArray(section.products) && section.products.length)
    .map((section, index) => ({
    ...section,
    staggerClass: index === 0 ? 'stagger-3' : 'stagger-4'
    }))
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
      label: '项目数量',
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
      title: '开通前需先绑定手机号',
      desc: ''
    },
    speech_exhausted: {
      visible: true,
      tone: 'soft',
      title: '语音额度已用完，已优先展示流量包',
      desc: ''
    },
    ai_exhausted: {
      visible: true,
      tone: 'brand',
      title: 'AI 额度已用完，已优先展示流量包',
      desc: ''
    },
    project_limit_reached: {
      visible: true,
      tone: 'soft',
      title: '项目数量已达上限，建议先恢复正式订阅',
      desc: ''
    },
    write_disabled: {
      visible: true,
      tone: 'brand',
      title: '当前仅可查看，建议先恢复编辑功能',
      desc: ''
    },
    share_out_disabled: {
      visible: true,
      tone: 'neutral',
      title: '当前套餐不支持项目外发，建议先看订阅',
      desc: ''
    },
    account_disabled: {
      visible: true,
      tone: 'danger',
      title: '账号状态异常，请先确认权益状态',
      desc: ''
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
    effectiveSubscriptionSummary: null,
    recentOrders: [],
    productSections: [],
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
          reason: this.data.arrivalReason,
          focus: this.data.initialFocus
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
            reason: this.data.arrivalReason,
            focus: this.data.initialFocus
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
    if (!product) {
      wx.showToast({
        title: '当前商品信息失效，请重试',
        icon: 'none'
      })
      return
    }

    if (this.data.submittingProductKey) {
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
          focus: this.data.initialFocus,
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
            focus: this.data.initialFocus,
            submittingProductKey: ''
          }
        )
      })
    }
  },

  noop() {}
})
