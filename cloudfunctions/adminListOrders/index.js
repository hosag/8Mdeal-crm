const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function toText(value) {
  return String(value || '').trim()
}

function toBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function toNumber(value, fallback = 0) {
  const current = Number(value)
  return Number.isFinite(current) ? current : fallback
}

function buildAmountText(amount, currency = 'CNY') {
  const current = Number(amount)
  if (!Number.isFinite(current) || current <= 0) {
    return currency === 'CNY' ? '待确认金额' : '待配置'
  }

  return `¥${(current / 100).toFixed(2)}`
}

function normalizeLimit(value, fallback = 50) {
  const current = Number(value)
  if (!Number.isFinite(current) || current <= 0) {
    return fallback
  }

  return Math.min(100, Math.max(1, Math.floor(current)))
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

async function safeGetListByIds(collectionName, fieldName, values = [], options = {}) {
  const ids = Array.isArray(values) ? values.map((item) => toText(item)).filter(Boolean).slice(0, 100) : []
  if (!ids.length) {
    return []
  }

  return safeGetList(collectionName, {
    [fieldName]: _.in(ids)
  }, options)
}

async function getOperatorConfig() {
  const flag = await safeGetOne('featureFlags', {
    flagKey: 'billing_internal_operator_v1'
  })
  const payload = flag && flag.payload && typeof flag.payload === 'object' ? flag.payload : {}
  return {
    operatorKey: toText(payload.operatorKey),
    operatorId: toText(payload.operatorId || 'billing_internal'),
    enabled: flag ? flag.enabled !== false : false
  }
}

async function ensureOperatorAuthorized(operatorKey) {
  const config = await getOperatorConfig()
  if (!config.enabled || !config.operatorKey || config.operatorKey !== toText(operatorKey)) {
    throw new Error('BILLING_OPERATOR_FORBIDDEN: 当前无权访问订单管理列表')
  }

  return config
}

function buildMapByField(list = [], fieldName = '') {
  return (Array.isArray(list) ? list : []).reduce((result, item) => {
    const key = toText(item && item[fieldName])
    if (key && !result[key]) {
      result[key] = item
    }
    return result
  }, {})
}

function formatDateText(value) {
  if (!value) {
    return ''
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toISOString()
}

function extractPaymentSession(record) {
  const requestPayload = record && record.requestPayload && typeof record.requestPayload === 'object'
    ? record.requestPayload
    : {}
  return requestPayload.paymentSession && typeof requestPayload.paymentSession === 'object'
    ? requestPayload.paymentSession
    : {}
}

function matchesKeyword(order, keyword = '') {
  const currentKeyword = toText(keyword).toLowerCase()
  if (!currentKeyword) {
    return true
  }

  return [
    order.orderId,
    order.accountId,
    order.title,
    order.productCode,
    order.productType
  ].some((item) => toText(item).toLowerCase().includes(currentKeyword))
}

function buildOrderSummary(order, accountMap, latestPaymentMap) {
  const orderId = toText(order && order.orderId)
  const accountId = toText(order && order.accountId)
  const account = accountMap[accountId] || {}
  const latestPayment = latestPaymentMap[orderId] || {}
  const paymentSession = extractPaymentSession(latestPayment)
  const pricingSnapshot = order && order.pricingSnapshot && typeof order.pricingSnapshot === 'object'
    ? order.pricingSnapshot
    : {}
  const amount = toNumber(order && order.amount, 0)
  const currency = toText(order && order.currency) || 'CNY'
  const originalPrice = toNumber(pricingSnapshot.originalPrice, 0)

  return {
    orderId,
    accountId,
    phone: toText(account.phone),
    title: toText(order && order.title),
    productCode: toText(order && order.productCode),
    productType: toText(order && order.productType),
    billingCycle: toText(order && order.billingCycle),
    amount,
    amountText: buildAmountText(amount, currency),
    currency,
    originalPrice,
    originalPriceText: originalPrice > amount ? buildAmountText(originalPrice, currency) : '',
    status: toText(order && order.status) || 'pending',
    createdAt: formatDateText(order && order.createdAt),
    updatedAt: formatDateText(order && order.updatedAt),
    paymentReadinessCode: toText(paymentSession.readinessCode || 'placeholder_only'),
    paymentCanInvoke: toBoolean(paymentSession.canInvokePayment),
    paymentPendingReason: toText(paymentSession.pendingReason || latestPayment.failureReason),
    latestPaymentTransaction: {
      transactionId: toText(latestPayment.transactionId || latestPayment._id),
      status: toText(latestPayment.status),
      channel: toText(latestPayment.channel || 'wechat_pay'),
      updatedAt: formatDateText(latestPayment.updatedAt)
    }
  }
}

exports.main = async (event = {}) => {
  const operatorConfig = await ensureOperatorAuthorized(event.operatorKey)
  const keyword = toText(event.keyword)
  const status = toText(event.status)
  const readiness = toText(event.readiness)
  const limit = normalizeLimit(event.limit, 50)

  const orderDocs = await safeGetList('orders', null, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc',
    limit: 200
  })

  const orderIds = orderDocs.map((item) => toText(item.orderId)).filter(Boolean)
  const accountIds = orderDocs.map((item) => toText(item.accountId)).filter(Boolean)
  const paymentTransactions = await safeGetListByIds('paymentTransactions', 'orderId', orderIds, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc',
    limit: 300
  })
  const accounts = await safeGetListByIds('accounts', 'accountId', accountIds, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc',
    limit: 200
  })

  const latestPaymentMap = buildMapByField(paymentTransactions, 'orderId')
  const accountMap = buildMapByField(accounts, 'accountId')

  const filteredOrders = orderDocs
    .filter((item) => !status || status === 'all' || toText(item.status) === status)
    .filter((item) => {
      if (!readiness || readiness === 'all') {
        return true
      }
      const paymentSession = extractPaymentSession(latestPaymentMap[toText(item.orderId)] || {})
      return toText(paymentSession.readinessCode || 'placeholder_only') === readiness
    })
    .filter((item) => matchesKeyword(item, keyword))
    .slice(0, limit)

  return {
    ok: true,
    operatorId: operatorConfig.operatorId,
    total: filteredOrders.length,
    orders: filteredOrders.map((item) => buildOrderSummary(item, accountMap, latestPaymentMap)),
    source: 'CloudBase'
  }
}
