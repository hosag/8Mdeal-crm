const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

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
      '按秒数或时长包补充，不影响订阅有效期。',
      '额度消耗只发生在实际成功转写时。',
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
    displayPriceText: '按 token / 额度补充',
    displayBillingText: '流量包',
    summary: '适合高频使用闪录整理、项目 AI 研判、复盘和下一步建议的用户。',
    featureLines: [
      '按 token 或额度包补充，不影响订阅有效期。',
      '用于AI整理、分析与建议。',
      '适合把 AI 作为日常推进辅助的重度用户。'
    ],
    includedAiTokens: 200000
  }
]

function clone(value) {
  return JSON.parse(JSON.stringify(value))
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

function getDefaultProfile(productType, billingCycle) {
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
  const fallback = getDefaultProfile(source.productType || source.planType, source.billingCycle)
  const price = toNumber(source.price, fallback.price)
  const originalPrice = toNumber(source.originalPrice, fallback.originalPrice)
  const isPricePending = toBoolean(source.isPricePending, fallback.isPricePending)
  const fallbackDisplayPriceText = toText(source.displayPriceText || source.priceLabel || fallback.displayPriceText) || fallback.displayPriceText
  return {
    productCode: toText(source.productCode || source.planCode || fallback.productCode) || `product_${index + 1}`,
    productName: toText(source.productName || source.planName || fallback.productName) || fallback.productName,
    productType: toText(source.productType || source.planType || fallback.productType) || fallback.productType,
    billingCycle: toText(source.billingCycle || fallback.billingCycle) || fallback.billingCycle,
    enabled: toBoolean(source.enabled, true),
    sortOrder: toNumber(source.sortOrder, index * 10 + 100),
    price,
    originalPrice,
    originalPriceText: originalPrice > price && price > 0
      ? formatPriceTextFromCents(originalPrice, toText(source.currency) || 'CNY')
      : '',
    isPricePending,
    displayPriceText: price > 0
      ? formatPriceTextFromCents(price, toText(source.currency) || 'CNY')
      : (fallbackDisplayPriceText || (isPricePending ? '价格待定' : formatPriceTextFromCents(0, 'CNY'))),
    displayBillingText: toText(source.displayBillingText || fallback.displayBillingText) || fallback.displayBillingText,
    summary: toText(source.summary || fallback.summary) || fallback.summary,
    featureLines: Array.isArray(source.featureLines) && source.featureLines.length
      ? source.featureLines.map((item) => toText(item)).filter(Boolean)
      : clone(fallback.featureLines || []),
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

async function safeGetOne(collectionName, query, options = {}) {
  try {
    let request = db.collection(collectionName).where(query)
    if (options.orderByField && options.orderByDirection) {
      request = request.orderBy(options.orderByField, options.orderByDirection)
    }
    const result = await request.limit(1).get()
    return result.data[0] || null
  } catch (error) {
    return null
  }
}

async function safeGetList(collectionName, query = null, options = {}) {
  try {
    let request = query ? db.collection(collectionName).where(query) : db.collection(collectionName)
    if (options.orderByField && options.orderByDirection) {
      request = request.orderBy(options.orderByField, options.orderByDirection)
    }
    if (options.limit) {
      request = request.limit(options.limit)
    }
    const result = await request.get()
    return Array.isArray(result.data) ? result.data : []
  } catch (error) {
    return []
  }
}

function normalizeSubscription(value, planMap) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const planCode = toText(source.planCode)
  const plan = planMap[planCode] || null
  return {
    subscriptionId: toText(source.subscriptionId || source._id),
    planCode,
    planName: toText(source.planName || (plan && plan.productName)),
    status: toText(source.status),
    startedAt: source.startedAt ? new Date(source.startedAt).toISOString() : '',
    expiresAt: source.expiresAt ? new Date(source.expiresAt).toISOString() : '',
    renewType: toText(source.renewType || 'manual'),
    grantedVoiceSeconds: toNumber(source.grantedVoiceSeconds, plan ? plan.includedVoiceSeconds : 0),
    grantedAiTokens: toNumber(source.grantedAiTokens, plan ? plan.includedAiTokens : 0),
    summaryText: [
      toText(source.planName || (plan && plan.productName)),
      source.expiresAt ? `有效期至 ${formatDateLabel(source.expiresAt)}` : ''
    ].filter(Boolean).join(' · ')
  }
}

function normalizeOrder(value, planMap, index = 0) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const productCode = toText(source.productCode)
  const plan = planMap[productCode] || null
  return {
    orderId: toText(source.orderId || source._id) || `order_${index + 1}`,
    title: toText(source.title || (plan && plan.productName)) || `订单 ${index + 1}`,
    productCode,
    productType: toText(source.productType || (plan && plan.productType)),
    amount: toNumber(source.amount, 0),
    currency: toText(source.currency || 'CNY') || 'CNY',
    status: toText(source.status || 'pending') || 'pending',
    createdAt: source.createdAt ? new Date(source.createdAt).toISOString() : '',
    paidAt: source.paidAt ? new Date(source.paidAt).toISOString() : '',
    updatedAt: source.updatedAt ? new Date(source.updatedAt).toISOString() : ''
  }
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = toText(wxContext.OPENID)

  if (!openid) {
    throw new Error('无法解析当前微信身份，请稍后重试')
  }

  const identity = await safeGetOne('accountIdentities', {
    provider: 'wechat_mp',
    openid
  })

  if (!identity || !identity.accountId) {
    throw new Error('ACCOUNT_NOT_INITIALIZED: 当前账号尚未初始化，请稍后重试')
  }

  const account = await safeGetOne('accounts', {
    accountId: identity.accountId
  })

  if (!account) {
    throw new Error('ACCOUNT_NOT_INITIALIZED: 当前账号尚未初始化，请稍后重试')
  }

  const planDocs = await safeGetList('plans', {
    enabled: true
  }, {
    orderByField: 'sortOrder',
    orderByDirection: 'asc',
    limit: 30
  })

  const products = (planDocs.length ? planDocs : DEFAULT_BILLING_PRODUCTS)
    .map((item, index) => normalizeProduct(item, index))
    .filter((item) => item.enabled)
    .sort((left, right) => left.sortOrder - right.sortOrder)

  const planMap = products.reduce((result, item) => {
    result[item.productCode] = item
    return result
  }, {})

  const activeSubscription = await safeGetOne('subscriptions', {
    accountId: identity.accountId,
    status: 'active'
  }, {
    orderByField: 'expiresAt',
    orderByDirection: 'desc'
  })

  const latestSubscription = activeSubscription || await safeGetOne('subscriptions', {
    accountId: identity.accountId
  }, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc'
  })

  const recentOrderDocs = await safeGetList('orders', {
    accountId: identity.accountId
  }, {
    orderByField: 'createdAt',
    orderByDirection: 'desc',
    limit: 5
  })

  return {
    ok: true,
    accountId: identity.accountId,
    catalogVersion: BILLING_CATALOG_VERSION,
    catalogSource: planDocs.length ? 'plans_collection' : 'default_seed',
    paymentEnabled: false,
    products,
    latestSubscription: latestSubscription ? normalizeSubscription(latestSubscription, planMap) : null,
    recentOrders: recentOrderDocs.map((item, index) => normalizeOrder(item, planMap, index)),
    paymentChannels: [],
    source: 'CloudBase'
  }
}
