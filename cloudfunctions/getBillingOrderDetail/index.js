const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

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

function buildAmountText(amount, currency = 'CNY') {
  const current = Number(amount)
  if (!Number.isFinite(current) || current <= 0) {
    return currency === 'CNY' ? '价格待定' : '待配置'
  }

  return `¥${(current / 100).toFixed(2)}`
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

function buildOrderSummary(order) {
  const pricingSnapshot = order && order.pricingSnapshot && typeof order.pricingSnapshot === 'object'
    ? order.pricingSnapshot
    : {}
  const amount = toNumber(order && order.amount, 0)
  const currency = toText(order && order.currency) || 'CNY'
  const originalPrice = toNumber(pricingSnapshot.originalPrice, 0)
  return {
    orderId: toText(order && order.orderId),
    title: toText(order && order.title),
    productCode: toText(order && order.productCode),
    productType: toText(order && order.productType),
    billingCycle: toText(order && order.billingCycle),
    amount,
    amountText: buildAmountText(amount, currency),
    currency,
    status: toText(order && order.status) || 'pending',
    source: toText(order && order.source) || 'mini_program',
    paymentEnabled: order && order.paymentEnabled === true,
    createdAt: order && order.createdAt ? new Date(order.createdAt).toISOString() : '',
    paidAt: order && order.paidAt ? new Date(order.paidAt).toISOString() : '',
    updatedAt: order && order.updatedAt ? new Date(order.updatedAt).toISOString() : '',
    pricingSnapshot: {
      productName: toText(pricingSnapshot.productName || order.title),
      productCode: toText(pricingSnapshot.productCode || order.productCode),
      productType: toText(pricingSnapshot.productType || order.productType),
      billingCycle: toText(pricingSnapshot.billingCycle || order.billingCycle),
      price: toNumber(pricingSnapshot.price, amount),
      priceText: buildAmountText(toNumber(pricingSnapshot.price, amount), currency),
      originalPrice,
      originalPriceText: originalPrice > toNumber(pricingSnapshot.price, amount)
        ? buildAmountText(originalPrice, currency)
        : '',
      isPricePending: pricingSnapshot.isPricePending === true,
      displayPriceText: toText(pricingSnapshot.displayPriceText || pricingSnapshot.priceLabel),
      displayBillingText: toText(pricingSnapshot.displayBillingText),
      summary: toText(pricingSnapshot.summary),
      projectLimit: toNumber(pricingSnapshot.projectLimit, -1),
      supportsShareOut: toBoolean(pricingSnapshot.supportsShareOut, false),
      supportsQuickEntry: toBoolean(pricingSnapshot.supportsQuickEntry, false),
      supportsAi: toBoolean(pricingSnapshot.supportsAi, false),
      supportsSpeechToText: toBoolean(pricingSnapshot.supportsSpeechToText, false),
      includedVoiceSeconds: toNumber(pricingSnapshot.includedVoiceSeconds || pricingSnapshot.monthlyVoiceSeconds, 0),
      includedAiTokens: toNumber(pricingSnapshot.includedAiTokens || pricingSnapshot.monthlyAiTokens, 0),
      featureLines: Array.isArray(pricingSnapshot.featureLines)
        ? pricingSnapshot.featureLines.map((item) => toText(item)).filter(Boolean).slice(0, 8)
        : []
    }
  }
}

function buildTransactionSummary(record) {
  if (!record) {
    return null
  }

  const requestPayload = record.requestPayload && typeof record.requestPayload === 'object'
    ? record.requestPayload
    : {}
  const paymentSession = requestPayload.paymentSession && typeof requestPayload.paymentSession === 'object'
    ? requestPayload.paymentSession
    : {}
  const channelOrder = requestPayload.channelOrder && typeof requestPayload.channelOrder === 'object'
    ? requestPayload.channelOrder
    : {}

  return {
    transactionId: toText(record.transactionId || record._id),
    merchantTradeNo: toText(record.merchantTradeNo || record.transactionId || record._id),
    orderId: toText(record.orderId),
    accountId: toText(record.accountId),
    channel: toText(record.channel) || 'wechat_pay',
    channelTradeNo: toText(record.channelTradeNo),
    status: toText(record.status) || 'pending',
    failureReason: toText(record.failureReason),
    createdAt: record.createdAt ? new Date(record.createdAt).toISOString() : '',
    updatedAt: record.updatedAt ? new Date(record.updatedAt).toISOString() : '',
    expiresAt: record.expiresAt ? new Date(record.expiresAt).toISOString() : '',
    paymentSession: {
      sessionId: toText(paymentSession.sessionId || record.transactionId || record._id),
      provider: toText(paymentSession.provider || record.channel) || 'wechat_pay',
      mode: toText(paymentSession.mode || 'placeholder') || 'placeholder',
      paymentEnabled: paymentSession.paymentEnabled === true,
      canInvokePayment: paymentSession.canInvokePayment === true,
      preparedAt: toText(paymentSession.preparedAt || (record.createdAt ? new Date(record.createdAt).toISOString() : '')),
      expiresAt: toText(paymentSession.expiresAt || (record.expiresAt ? new Date(record.expiresAt).toISOString() : '')),
      pendingReason: toText(paymentSession.pendingReason || record.failureReason || 'payment_not_enabled_yet'),
      callbackFunctionName: toText(paymentSession.callbackFunctionName || 'handleBillingPaymentCallback'),
      readinessCode: toText(paymentSession.readinessCode || 'placeholder_only'),
      readinessLabel: toText(paymentSession.readinessLabel || '当前仅占位'),
      profileCode: toText(paymentSession.profileCode || 'billing_payment_profile_v1'),
      merchantConfigReady: paymentSession.merchantConfigReady === true,
      privateKeyReady: paymentSession.privateKeyReady === true,
      prepayId: toText(paymentSession.prepayId),
      prepayIdReady: Boolean(toText(paymentSession.prepayId)),
      prepayIdSource: toText(paymentSession.prepayIdSource),
      signStrategy: toText(paymentSession.signStrategy || 'none'),
      missingConfigKeys: Array.isArray(paymentSession.missingConfigKeys) ? paymentSession.missingConfigKeys.slice(0, 10) : [],
      channelOrder: {
        outTradeNo: toText(channelOrder.outTradeNo || record.merchantTradeNo || record.transactionId || record._id),
        prepayId: toText(channelOrder.prepayId || paymentSession.prepayId),
        prepayIdSource: toText(channelOrder.prepayIdSource || paymentSession.prepayIdSource),
        requestAt: toText(channelOrder.requestAt),
        requestError: toText(channelOrder.requestError),
        responseStatusCode: Number(channelOrder.responseStatusCode) || 0
      }
    }
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = toText(wxContext.OPENID)
  const orderId = toText(event.orderId)

  if (!openid) {
    throw new Error('无法解析当前微信身份，请稍后重试')
  }

  if (!orderId) {
    throw new Error('BILLING_ORDER_NOT_FOUND: 当前订单不存在或已无权查看')
  }

  const context = await resolveAccountContext(openid)
  const order = await safeGetOne('orders', {
    accountId: context.accountId,
    orderId
  })

  if (!order) {
    throw new Error('BILLING_ORDER_NOT_FOUND: 当前订单不存在或已无权查看')
  }

  const latestPaymentTransaction = await safeGetOne('paymentTransactions', {
    accountId: context.accountId,
    orderId
  }, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc'
  })

  return {
    ok: true,
    order: buildOrderSummary(order),
    latestPaymentTransaction: buildTransactionSummary(latestPaymentTransaction),
    paymentEnabled: order.paymentEnabled === true,
    source: 'CloudBase'
  }
}
