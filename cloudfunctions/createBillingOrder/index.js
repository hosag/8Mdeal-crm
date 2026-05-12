const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const DEFAULT_BILLING_PRODUCTS = [
  {
    productCode: 'starter_monthly_v1',
    productName: '基础版月付',
    productType: 'subscription',
    billingCycle: 'monthly',
    enabled: true,
    price: 0,
    isPricePending: true
  },
  {
    productCode: 'starter_yearly_v1',
    productName: '基础版年付',
    productType: 'subscription',
    billingCycle: 'yearly',
    enabled: true,
    price: 0,
    isPricePending: true
  },
  {
    productCode: 'voice_pack_growth_v1',
    productName: '语音转写包',
    productType: 'voice_pack',
    billingCycle: 'one_time',
    enabled: true,
    price: 0,
    isPricePending: true
  },
  {
    productCode: 'ai_pack_growth_v1',
    productName: 'AI 额度包',
    productType: 'ai_pack',
    billingCycle: 'one_time',
    enabled: true,
    price: 0,
    isPricePending: true
  }
]

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

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function createOrderId(now) {
  return `ord_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`
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

function normalizeProduct(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    productCode: toText(source.productCode || source.planCode),
    productName: toText(source.productName || source.planName),
    productType: toText(source.productType || source.planType),
    billingCycle: toText(source.billingCycle),
    enabled: toBoolean(source.enabled, true),
    price: toNumber(source.price, 0),
    originalPrice: toNumber(source.originalPrice, 0),
    isPricePending: toBoolean(source.isPricePending, false),
    displayPriceText: toText(source.displayPriceText || source.priceLabel),
    displayBillingText: toText(source.displayBillingText),
    summary: toText(source.summary),
    projectLimit: toNumber(source.projectLimit, -1),
    supportsShareOut: toBoolean(source.supportsShareOut, false),
    supportsQuickEntry: toBoolean(source.supportsQuickEntry, false),
    supportsAi: toBoolean(source.supportsAi, false),
    supportsSpeechToText: toBoolean(source.supportsSpeechToText, false),
    includedVoiceSeconds: toNumber(source.includedVoiceSeconds || source.monthlyVoiceSeconds, 0),
    includedAiTokens: toNumber(source.includedAiTokens || source.monthlyAiTokens, 0),
    featureLines: Array.isArray(source.featureLines)
      ? source.featureLines.map((item) => toText(item)).filter(Boolean).slice(0, 8)
      : []
  }
}

async function resolveAccountContext(openid) {
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

  return {
    accountId: identity.accountId,
    account
  }
}

async function loadProducts() {
  const planDocs = await safeGetList('plans', {
    enabled: true
  }, {
    orderByField: 'sortOrder',
    orderByDirection: 'asc',
    limit: 50
  })

  const list = (planDocs.length ? planDocs : DEFAULT_BILLING_PRODUCTS)
    .map((item) => normalizeProduct(item))
    .filter((item) => item.enabled && item.productCode)

  return list
}

function buildProductMap(products) {
  return products.reduce((result, item) => {
    result[item.productCode] = item
    return result
  }, {})
}

function canOrderProduct(product) {
  const productType = toText(product && product.productType)
  return productType === 'subscription' || productType === 'voice_pack' || productType === 'ai_pack'
}

function buildOrderSummary(order) {
  return {
    orderId: toText(order.orderId),
    title: toText(order.title),
    productCode: toText(order.productCode),
    productType: toText(order.productType),
    amount: toNumber(order.amount, 0),
    currency: toText(order.currency || 'CNY') || 'CNY',
    status: toText(order.status || 'pending') || 'pending',
    createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : '',
    paidAt: order.paidAt ? new Date(order.paidAt).toISOString() : '',
    updatedAt: order.updatedAt ? new Date(order.updatedAt).toISOString() : ''
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = toText(wxContext.OPENID)
  const productCode = toText(event.productCode)
  const now = new Date()

  if (!openid) {
    throw new Error('无法解析当前微信身份，请稍后重试')
  }

  if (!productCode) {
    throw new Error('BILLING_PRODUCT_NOT_FOUND: 当前商品未配置，请稍后重试')
  }

  const context = await resolveAccountContext(openid)

  if (context.account.status === 'disabled') {
    throw new Error('ACCOUNT_DISABLED: 当前账号已被禁用，请联系管理员处理')
  }

  if (!context.account.phoneVerified) {
    throw new Error('ACCOUNT_PHONE_REQUIRED: 请先绑定手机号后再继续')
  }

  const products = await loadProducts()
  const productMap = buildProductMap(products)
  const product = productMap[productCode]

  if (!product || !canOrderProduct(product)) {
    throw new Error('BILLING_PRODUCT_NOT_FOUND: 当前商品未配置，请稍后重试')
  }

  const existingPendingOrder = await safeGetOne('orders', {
    accountId: context.accountId,
    productCode,
    status: 'pending'
  }, {
    orderByField: 'createdAt',
    orderByDirection: 'desc'
  })

  if (existingPendingOrder && existingPendingOrder.createdAt) {
    const createdAt = new Date(existingPendingOrder.createdAt)
    if (!Number.isNaN(createdAt.getTime()) && now.getTime() - createdAt.getTime() <= 10 * 60 * 1000) {
      return {
        ok: true,
        reused: true,
        paymentEnabled: false,
        order: buildOrderSummary(existingPendingOrder)
      }
    }
  }

  const order = {
    orderId: createOrderId(now),
    accountId: context.accountId,
    productType: product.productType,
    productCode: product.productCode,
    title: product.productName,
    amount: product.price,
    currency: 'CNY',
    status: 'pending',
    source: 'mini_program',
    paymentEnabled: false,
    billingCycle: product.billingCycle,
    pricingSnapshot: clone(product),
    createdAt: now,
    paidAt: null,
    updatedAt: now
  }

  try {
    await db.collection('orders').add({
      data: order
    })
  } catch (error) {
    throw new Error('BILLING_ORDER_UNAVAILABLE: 当前暂时无法创建订单，请稍后重试')
  }

  return {
    ok: true,
    reused: false,
    paymentEnabled: false,
    order: buildOrderSummary(order)
  }
}
