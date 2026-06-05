const BILLING_CATALOG_VERSION = 'billing_catalog_v1'

const DEFAULT_BILLING_PRODUCTS = [
  {
    productCode: 'trial_preview_v1',
    productName: '试用体验',
    productType: 'trial',
    billingCycle: 'trial',
    enabled: true,
    sortOrder: 10,
    price: 0,
    originalPrice: 0,
    isPricePending: false,
    displayPriceText: '首周全功能体验',
    displayBillingText: '新用户试用',
    summary: '体验核心功能，包括语音记录与AI整理',
    featureLines: [
      '体验核心功能。',
      '绑定手机号后可保存数据和购买套餐。',
      '试用结束后可查看，但不可新增内容。'
    ],
    projectLimit: 3,
    supportsShareOut: true,
    supportsQuickEntry: true,
    supportsAi: true,
    supportsSpeechToText: true,
    includedVoiceSeconds: 600,
    includedAiTokens: 50000,
    trialEligible: true
  },
  {
    productCode: 'starter_monthly_v1',
    productName: '基础版月付',
    productType: 'subscription',
    billingCycle: 'monthly',
    enabled: true,
    sortOrder: 100,
    price: 0,
    originalPrice: 0,
    isPricePending: true,
    displayPriceText: '价格待定',
    displayBillingText: '按月订阅',
    summary: '适合长期使用的个人用户',
    featureLines: [
      '继续新增 / 编辑项目、跟进、任务和成交记录。',
      '支持闪录、AI 自动理解、外发项目与只读追踪。',
      '套餐内含基础语音与 AI 免费量，超出后单独加购流量包。'
    ],
    projectLimit: -1,
    supportsShareOut: true,
    supportsQuickEntry: true,
    supportsAi: true,
    supportsSpeechToText: true,
    includedVoiceSeconds: 1800,
    includedAiTokens: 200000,
    trialEligible: false
  },
  {
    productCode: 'starter_yearly_v1',
    productName: '基础版年付',
    productType: 'subscription',
    billingCycle: 'yearly',
    enabled: true,
    sortOrder: 110,
    price: 0,
    originalPrice: 0,
    isPricePending: true,
    displayPriceText: '价格待定',
    displayBillingText: '按年订阅',
    summary: '适合长期使用的个人用户',
    featureLines: [
      '长期可继续使用，减少到期中断。',
      '支持转交项目、闪录、AI 和联系人管理。'
    ],
    projectLimit: -1,
    supportsShareOut: true,
    supportsQuickEntry: true,
    supportsAi: true,
    supportsSpeechToText: true,
    includedVoiceSeconds: 24000,
    includedAiTokens: 2400000,
    trialEligible: false
  },
  {
    productCode: 'voice_pack_growth_v1',
    productName: '语音转写包',
    productType: 'voice_pack',
    billingCycle: 'one_time',
    enabled: true,
    sortOrder: 200,
    price: 0,
    originalPrice: 0,
    isPricePending: true,
    displayPriceText: '按转写时长补充',
    displayBillingText: '流量包',
    summary: '适合语音闪录频率高、希望单独扩容转写时长的用户。',
    featureLines: [
      '按实际使用时长计费，不影响订阅。',
      '按实际成功转写计费。',
      '适合把闪录作为主录入入口的用户。'
    ],
    includedVoiceSeconds: 1800
  },
  {
    productCode: 'ai_pack_growth_v1',
    productName: 'AI 额度包',
    productType: 'ai_pack',
    billingCycle: 'one_time',
    enabled: true,
    sortOrder: 210,
    price: 0,
    originalPrice: 0,
    isPricePending: true,
    displayPriceText: '按 AI 额度补充',
    displayBillingText: '流量包',
    summary: '适合高频使用闪录整理、项目 AI 研判、复盘和下一步建议的用户。',
    featureLines: [
      '按 AI 额度包补充，不影响订阅有效期。',
      '用于AI整理、分析与建议。',
      '适合把 AI 作为日常推进辅助的重度用户。'
    ],
    includedAiTokens: 200000
  }
]

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function toText(value) {
  return String(value || '').trim()
}

function toNumber(value, fallback = 0) {
  const current = Number(value)
  return Number.isFinite(current) ? current : fallback
}

function toBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function formatPriceTextFromCents(amount, currency = 'CNY') {
  const current = Number(amount)
  if (!Number.isFinite(current) || current < 0) {
    return ''
  }

  if (currency && currency !== 'CNY') {
    return `${currency} ${current}`
  }

  return `¥${(current / 100).toFixed(2)}`
}

function formatDateLabel(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) {
    return ''
  }

  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function getBillingCycleLabel(value) {
  const current = toText(value)
  const labels = {
    trial: '新用户试用',
    monthly: '按月订阅',
    yearly: '按年订阅',
    one_time: '流量包'
  }
  return labels[current] || '待配置'
}

function getProductTypeLabel(value) {
  const current = toText(value)
  const labels = {
    trial: '试用规则',
    subscription: '订阅套餐',
    voice_pack: '流量包',
    ai_pack: '流量包'
  }
  return labels[current] || '商品'
}

function getCatalogSourceLabel(value) {
  const current = toText(value)
  const labels = {
    default_seed: '默认商品目录',
    plans_collection: '云端商品目录'
  }
  return labels[current] || '商品目录'
}

function getOrderStatusLabel(value) {
  const current = toText(value)
  const labels = {
    pending: '待支付',
    paid: '已支付',
    closed: '已关闭',
    failed: '支付失败',
    refunded: '已退款'
  }
  return labels[current] || '未定义'
}

function getOrderStatusClass(value) {
  const current = toText(value)
  if (current === 'paid') {
    return 'is-success'
  }

  if (current === 'pending') {
    return 'is-brand'
  }

  if (current === 'failed' || current === 'closed' || current === 'refunded') {
    return 'is-danger'
  }

  return ''
}

function getPaymentChannelStatusText(enabled = false) {
  return enabled ? '已接入' : '内测待联调'
}

function getPaymentPendingCopy(scene = 'general', options = {}) {
  const source = options && typeof options === 'object' ? options : {}
  const productName = toText(source.productName) || '当前商品'

  if (scene === 'product_preview') {
    return [
      `${productName} 当前暂不支持支付。`,
      '订单已创建。',
      '开通后，订阅和加购会直接归属到当前账户。'
    ].join('\n')
  }

  if (scene === 'order_created') {
    return [
      '订单已创建。',
      '当前暂不支持支付。'
    ].join('\n')
  }

  if (scene === 'order_prepare') {
    return '支付暂未开通，订单已保留'
  }

  if (scene === 'session_placeholder') {
    return '当前暂不支持支付，请稍后再试'
  }

  if (scene === 'env_unsupported') {
    return '当前暂不支持支付，请稍后再试'
  }

  if (scene === 'status_notice') {
    return '订单已创建，当前暂不支持支付'
  }

  return '当前暂不支持支付'
}

function buildDefaultProfile(productType, billingCycle) {
  const currentType = toText(productType)
  const currentCycle = toText(billingCycle)

  if (currentType === 'subscription' && currentCycle === 'yearly') {
    return clone(DEFAULT_BILLING_PRODUCTS[2])
  }

  if (currentType === 'subscription') {
    return clone(DEFAULT_BILLING_PRODUCTS[1])
  }

  if (currentType === 'voice_pack') {
    return clone(DEFAULT_BILLING_PRODUCTS[3])
  }

  if (currentType === 'ai_pack') {
    return clone(DEFAULT_BILLING_PRODUCTS[4])
  }

  return clone(DEFAULT_BILLING_PRODUCTS[0])
}

function normalizeProduct(value, index = 0) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const fallback = buildDefaultProfile(source.productType || source.planType, source.billingCycle)
  const productType = toText(source.productType || source.planType || fallback.productType) || fallback.productType
  const billingCycle = toText(source.billingCycle || fallback.billingCycle) || fallback.billingCycle
  const price = toNumber(source.price, fallback.price)
  const originalPrice = toNumber(source.originalPrice, fallback.originalPrice)
  const isPricePending = toBoolean(source.isPricePending, fallback.isPricePending)
  const fallbackDisplayPriceText = toText(source.displayPriceText || source.priceLabel || fallback.displayPriceText)
    || fallback.displayPriceText
  const displayPriceText = price > 0
    ? formatPriceTextFromCents(price, toText(source.currency) || 'CNY')
    : (fallbackDisplayPriceText || (isPricePending ? '价格待定' : formatPriceTextFromCents(0, 'CNY')))
  const displayBillingText = toText(source.displayBillingText || fallback.displayBillingText)
    || getBillingCycleLabel(billingCycle)

  return {
    productCode: toText(source.productCode || source.planCode || fallback.productCode) || `product_${index + 1}`,
    productName: toText(source.productName || source.planName || fallback.productName) || fallback.productName,
    productType,
    productTypeLabel: getProductTypeLabel(productType),
    billingCycle,
    enabled: toBoolean(source.enabled, true),
    sortOrder: toNumber(source.sortOrder, index * 10 + 100),
    price,
    originalPrice,
    originalPriceText: originalPrice > price && price > 0
      ? formatPriceTextFromCents(originalPrice, toText(source.currency) || 'CNY')
      : '',
    isPricePending,
    displayPriceText,
    displayBillingText,
    summary: toText(source.summary || fallback.summary) || fallback.summary,
    featureLines: toArray(source.featureLines).length ? toArray(source.featureLines).map((item) => toText(item)).filter(Boolean) : clone(fallback.featureLines || []),
    projectLimit: toNumber(source.projectLimit, fallback.projectLimit),
    supportsShareOut: toBoolean(source.supportsShareOut, fallback.supportsShareOut),
    supportsQuickEntry: toBoolean(source.supportsQuickEntry, fallback.supportsQuickEntry),
    supportsAi: toBoolean(source.supportsAi, fallback.supportsAi),
    supportsSpeechToText: toBoolean(source.supportsSpeechToText, fallback.supportsSpeechToText),
    includedVoiceSeconds: toNumber(source.includedVoiceSeconds || source.monthlyVoiceSeconds, fallback.includedVoiceSeconds),
    includedAiTokens: toNumber(source.includedAiTokens || source.monthlyAiTokens, fallback.includedAiTokens),
    trialEligible: toBoolean(source.trialEligible, fallback.trialEligible)
  }
}

function normalizeSubscription(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const startedAtText = formatDateLabel(source.startedAt)
  const expiresAtText = formatDateLabel(source.expiresAt)
  return {
    subscriptionId: toText(source.subscriptionId || source._id),
    planCode: toText(source.planCode),
    planName: toText(source.planName),
    status: toText(source.status),
    statusLabel: getOrderStatusLabel(source.status === 'active' ? 'paid' : source.status),
    startedAt: toText(source.startedAt),
    startedAtText,
    expiresAt: toText(source.expiresAt),
    expiresAtText,
    renewType: toText(source.renewType),
    grantedVoiceSeconds: toNumber(source.grantedVoiceSeconds, 0),
    grantedAiTokens: toNumber(source.grantedAiTokens, 0),
    summaryText: [toText(source.planName), expiresAtText ? `有效期至 ${expiresAtText}` : ''].filter(Boolean).join(' · ')
  }
}

function normalizeOrder(value, index = 0) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const status = toText(source.status) || 'pending'
  const amount = toNumber(source.amount, 0)
  const amountText = amount > 0 ? `¥${(amount / 100).toFixed(2)}` : '价格待定'
  const createdAtText = formatDateLabel(source.createdAt)
  const paidAtText = formatDateLabel(source.paidAt)
  const title = toText(source.title || source.productName || source.planName) || `订单 ${index + 1}`
  return {
    orderId: toText(source.orderId || source._id) || `order_${index + 1}`,
    title,
    productCode: toText(source.productCode),
    productType: toText(source.productType),
    amount,
    amountText,
    currency: toText(source.currency) || 'CNY',
    status,
    statusLabel: getOrderStatusLabel(status),
    statusClass: getOrderStatusClass(status),
    createdAt: toText(source.createdAt),
    createdAtText,
    paidAt: toText(source.paidAt),
    paidAtText,
    metaText: paidAtText ? `支付于 ${paidAtText}` : (createdAtText ? `创建于 ${createdAtText}` : '等待真实支付接通')
  }
}

function getDefaultBillingCatalogData() {
  return {
    catalogVersion: BILLING_CATALOG_VERSION,
    catalogSource: 'default_seed',
    paymentEnabled: false,
    products: getDefaultBillingProducts(),
    latestSubscription: null,
    recentOrders: [],
    paymentChannels: [],
    source: 'Mock Demo'
  }
}

function getDefaultBillingProducts() {
  return clone(DEFAULT_BILLING_PRODUCTS)
}

function normalizeBillingCatalogPayload(payload = {}) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
  const nextProducts = toArray(source.products).length
    ? toArray(source.products).map((item, index) => normalizeProduct(item, index))
    : getDefaultBillingProducts()

  return {
    catalogVersion: toText(source.catalogVersion) || BILLING_CATALOG_VERSION,
    catalogSource: toText(source.catalogSource) || 'default_seed',
    catalogSourceLabel: getCatalogSourceLabel(source.catalogSource),
    paymentEnabled: toBoolean(source.paymentEnabled, false),
    products: nextProducts
      .filter((item) => item.enabled)
      .sort((left, right) => left.sortOrder - right.sortOrder),
    latestSubscription: source.latestSubscription ? normalizeSubscription(source.latestSubscription) : null,
    recentOrders: toArray(source.recentOrders).map((item, index) => normalizeOrder(item, index)),
    paymentChannels: toArray(source.paymentChannels).map((item) => toText(item)).filter(Boolean),
    source: toText(source.source) || 'Mock Demo'
  }
}

module.exports = {
  BILLING_CATALOG_VERSION,
  formatDateLabel,
  getBillingCycleLabel,
  getCatalogSourceLabel,
  getOrderStatusLabel,
  getOrderStatusClass,
  getPaymentChannelStatusText,
  getPaymentPendingCopy,
  getProductTypeLabel,
  getDefaultBillingProducts,
  getDefaultBillingCatalogData,
  normalizeBillingCatalogPayload
}
