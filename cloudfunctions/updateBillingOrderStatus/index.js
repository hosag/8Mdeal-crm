const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const DEFAULT_PRODUCTS = [
  {
    productCode: 'starter_monthly_v1',
    productName: '基础版月付',
    productType: 'subscription',
    billingCycle: 'monthly',
    projectLimit: -1,
    includedVoiceSeconds: 1800,
    includedAiTokens: 200000
  },
  {
    productCode: 'starter_yearly_v1',
    productName: '基础版年付',
    productType: 'subscription',
    billingCycle: 'yearly',
    projectLimit: -1,
    includedVoiceSeconds: 24000,
    includedAiTokens: 2400000
  },
  {
    productCode: 'voice_pack_growth_v1',
    productName: '语音转写包',
    productType: 'voice_pack',
    billingCycle: 'one_time',
    includedVoiceSeconds: 1800,
    includedAiTokens: 0
  },
  {
    productCode: 'ai_pack_growth_v1',
    productName: 'AI 额度包',
    productType: 'ai_pack',
    billingCycle: 'one_time',
    includedVoiceSeconds: 0,
    includedAiTokens: 200000
  }
]

function toText(value) {
  return String(value || '').trim()
}

function toNumber(value, fallback = 0) {
  const current = Number(value)
  return Number.isFinite(current) ? current : fallback
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function subtractCycle(source, billingCycle) {
  const base = source instanceof Date ? new Date(source.getTime()) : new Date(source)
  if (Number.isNaN(base.getTime())) {
    return null
  }

  if (billingCycle === 'yearly') {
    base.setFullYear(base.getFullYear() - 1)
    return base
  }

  base.setMonth(base.getMonth() - 1)
  return base
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
    throw new Error('BILLING_OPERATOR_FORBIDDEN: 当前无权执行内部到账操作')
  }

  return config
}

function normalizeAction(value) {
  const current = toText(value)
  if (current === 'close' || current === 'fail' || current === 'refund') {
    return current
  }

  return ''
}

function normalizeProduct(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    productCode: toText(source.productCode || source.planCode),
    productName: toText(source.productName || source.planName),
    productType: toText(source.productType || source.planType),
    billingCycle: toText(source.billingCycle),
    includedVoiceSeconds: toNumber(source.includedVoiceSeconds || source.monthlyVoiceSeconds, 0),
    includedAiTokens: toNumber(source.includedAiTokens || source.monthlyAiTokens, 0)
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

  const list = (planDocs.length ? planDocs : DEFAULT_PRODUCTS)
    .map((item) => normalizeProduct(item))
    .filter((item) => item.productCode)

  return list.reduce((result, item) => {
    result[item.productCode] = item
    return result
  }, {})
}

function buildOrderSummary(order) {
  return {
    orderId: toText(order.orderId),
    title: toText(order.title),
    productCode: toText(order.productCode),
    productType: toText(order.productType),
    billingCycle: toText(order.billingCycle),
    amount: toNumber(order.amount, 0),
    currency: toText(order.currency || 'CNY') || 'CNY',
    status: toText(order.status || 'pending') || 'pending',
    paidAt: order.paidAt ? new Date(order.paidAt).toISOString() : '',
    updatedAt: order.updatedAt ? new Date(order.updatedAt).toISOString() : '',
    fulfillmentStatus: toText(order.fulfillmentStatus),
    fulfillmentAppliedAt: order.fulfillmentAppliedAt ? new Date(order.fulfillmentAppliedAt).toISOString() : '',
    fulfillmentRevertedAt: order.fulfillmentRevertedAt ? new Date(order.fulfillmentRevertedAt).toISOString() : ''
  }
}

async function appendAuditLog(operatorId, actionType, targetType, targetId, beforeSnapshot, afterSnapshot, reason, now) {
  try {
    await db.collection('adminAuditLogs').add({
      data: {
        operatorId,
        actionType,
        targetType,
        targetId,
        beforeSnapshot,
        afterSnapshot,
        reason: toText(reason),
        createdAt: now
      }
    })
  } catch (error) {
    // Keep lifecycle transitions usable even if audit logs are not deployed yet.
  }
}

async function getEntitlementsSnapshot(accountId) {
  const entitlements = await safeGetOne('entitlements', {
    accountId
  })

  return entitlements && typeof entitlements === 'object' ? entitlements : {}
}

async function ensureCompensateLedger(accountId, usageType, delta, sourceId, beforeBalance, occurredAt, meta = {}) {
  const traceId = `${sourceId}:${usageType}:refund`
  const existing = await safeGetOne('usageLedger', {
    traceId
  })

  if (existing) {
    return {
      reused: true,
      traceId
    }
  }

  const before = Math.max(0, toNumber(beforeBalance, 0))
  const after = Math.max(0, before + delta)

  await db.collection('usageLedger').add({
    data: {
      accountId,
      usageType,
      sourceType: 'compensate',
      sourceId,
      delta,
      unit: usageType === 'voice_seconds' ? 'second' : 'token',
      beforeBalance: before,
      afterBalance: after,
      traceId,
      meta,
      occurredAt
    }
  })

  return {
    reused: false,
    traceId
  }
}

async function closePendingTransactions(accountId, orderId, now, failureReason) {
  const pendingTransactions = await safeGetList('paymentTransactions', {
    accountId,
    orderId,
    status: 'pending'
  }, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc',
    limit: 20
  })

  for (let index = 0; index < pendingTransactions.length; index += 1) {
    const item = pendingTransactions[index]
    if (!item || !item._id) {
      continue
    }

    await db.collection('paymentTransactions').doc(item._id).update({
      data: {
        status: 'failed',
        failureReason,
        updatedAt: now
      }
    })
  }

  return pendingTransactions.length
}

async function markSuccessfulTransactionsRefunded(accountId, orderId, now, event) {
  const successTransactions = await safeGetList('paymentTransactions', {
    accountId,
    orderId,
    status: 'success'
  }, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc',
    limit: 20
  })

  for (let index = 0; index < successTransactions.length; index += 1) {
    const item = successTransactions[index]
    if (!item || !item._id) {
      continue
    }

    const callbackPayload = item.callbackPayload && typeof item.callbackPayload === 'object'
      ? clone(item.callbackPayload)
      : {}
    callbackPayload.refundAppliedAt = now.toISOString()
    callbackPayload.refundReason = toText(event.reason)
    callbackPayload.refundOperatorId = toText(event.operatorId)
    callbackPayload.refundSource = toText(event.source || 'internal_update_status')

    await db.collection('paymentTransactions').doc(item._id).update({
      data: {
        callbackPayload,
        updatedAt: now
      }
    })
  }

  return successTransactions.length
}

async function reverseSubscriptionFulfillment(accountId, orderId, product, refundedAt, now) {
  const subscriptions = await safeGetList('subscriptions', {
    accountId
  }, {
    orderByField: 'expiresAt',
    orderByDirection: 'desc',
    limit: 30
  })

  const directSubscription = subscriptions.find((item) => toText(item.sourceOrderId) === orderId)
  if (directSubscription && directSubscription._id) {
    await db.collection('subscriptions').doc(directSubscription._id).update({
      data: {
        status: 'canceled',
        expiresAt: refundedAt,
        refundedAt,
        refundSourceOrderId: orderId,
        updatedAt: now
      }
    })

    return {
      mode: 'direct_cancel',
      subscriptionId: directSubscription._id
    }
  }

  const extendedSubscription = subscriptions.find((item) => {
    const relatedOrderIds = Array.isArray(item && item.relatedOrderIds) ? item.relatedOrderIds : []
    return relatedOrderIds.map((value) => toText(value)).indexOf(orderId) > -1
  })

  if (extendedSubscription && extendedSubscription._id && extendedSubscription.expiresAt) {
    const relatedOrderIds = Array.isArray(extendedSubscription.relatedOrderIds)
      ? extendedSubscription.relatedOrderIds.map((value) => toText(value)).filter(Boolean)
      : []
    const nextRelatedOrderIds = relatedOrderIds.filter((value) => value !== orderId)
    const currentExpiresAt = new Date(extendedSubscription.expiresAt)
    const nextExpiresAt = subtractCycle(currentExpiresAt, product.billingCycle)
    const nextStatus = nextExpiresAt && nextExpiresAt.getTime() > now.getTime() ? 'active' : 'expired'

    await db.collection('subscriptions').doc(extendedSubscription._id).update({
      data: {
        status: nextStatus,
        expiresAt: nextExpiresAt,
        relatedOrderIds: nextRelatedOrderIds,
        refundedOrderIds: (Array.isArray(extendedSubscription.refundedOrderIds)
          ? extendedSubscription.refundedOrderIds.map((value) => toText(value)).filter(Boolean)
          : []).concat(orderId),
        updatedAt: now
      }
    })

    return {
      mode: 'remove_extension',
      subscriptionId: extendedSubscription._id,
      expiresAt: nextExpiresAt ? nextExpiresAt.toISOString() : ''
    }
  }

  return {
    mode: 'not_found',
    subscriptionId: ''
  }
}

async function reverseOrderFulfillment(order, product, refundedAt, now) {
  const fulfillmentSnapshot = order.fulfillmentSnapshot && typeof order.fulfillmentSnapshot === 'object'
    ? order.fulfillmentSnapshot
    : {}
  const entitlements = await getEntitlementsSnapshot(order.accountId)
  const result = {
    productType: product.productType,
    compensatedVoiceSeconds: 0,
    compensatedAiTokens: 0,
    usageCompensationTraceIds: [],
    subscriptionRevert: null
  }

  if (product.productType === 'subscription') {
    result.subscriptionRevert = await reverseSubscriptionFulfillment(
      order.accountId,
      order.orderId,
      product,
      refundedAt,
      now
    )
    return result
  }

  if (product.productType === 'voice_pack') {
    const delta = -Math.abs(toNumber(fulfillmentSnapshot.grantedVoiceSeconds, product.includedVoiceSeconds))
    if (delta !== 0) {
      const grantResult = await ensureCompensateLedger(
        order.accountId,
        'voice_seconds',
        delta,
        order.orderId,
        entitlements.voiceSecondsRemaining,
        refundedAt,
        {
          orderId: order.orderId,
          productCode: product.productCode,
          actionType: 'refund_voice'
        }
      )
      result.compensatedVoiceSeconds = Math.abs(delta)
      result.usageCompensationTraceIds.push(grantResult.traceId)
    }
  }

  if (product.productType === 'ai_pack') {
    const delta = -Math.abs(toNumber(fulfillmentSnapshot.grantedAiTokens, product.includedAiTokens))
    if (delta !== 0) {
      const grantResult = await ensureCompensateLedger(
        order.accountId,
        'ai_tokens',
        delta,
        order.orderId,
        entitlements.aiTokensRemaining,
        refundedAt,
        {
          orderId: order.orderId,
          productCode: product.productCode,
          actionType: 'refund_ai'
        }
      )
      result.compensatedAiTokens = Math.abs(delta)
      result.usageCompensationTraceIds.push(grantResult.traceId)
    }
  }

  return result
}

function buildActionConfig(action) {
  if (action === 'close') {
    return {
      nextStatus: 'closed',
      validFromStatuses: ['pending'],
      transactionFailureReason: 'order_closed_manually',
      actionType: 'close_order'
    }
  }

  if (action === 'fail') {
    return {
      nextStatus: 'failed',
      validFromStatuses: ['pending'],
      transactionFailureReason: 'payment_failed_manually',
      actionType: 'close_order'
    }
  }

  if (action === 'refund') {
    return {
      nextStatus: 'refunded',
      validFromStatuses: ['paid'],
      transactionFailureReason: '',
      actionType: 'close_order'
    }
  }

  return null
}

exports.main = async (event = {}) => {
  const operatorConfig = await ensureOperatorAuthorized(event.operatorKey)
  const action = normalizeAction(event.action)
  const orderId = toText(event.orderId)
  const now = new Date()
  const actionAt = event.actionAt ? new Date(event.actionAt) : now

  if (!action || !orderId || Number.isNaN(actionAt.getTime())) {
    throw new Error('BILLING_ORDER_STATUS_INVALID: 当前订单状态不支持继续发起支付')
  }

  const actionConfig = buildActionConfig(action)
  if (!actionConfig) {
    throw new Error('BILLING_ORDER_STATUS_INVALID: 当前订单状态不支持继续发起支付')
  }

  const order = await safeGetOne('orders', {
    orderId
  })

  if (!order || !order.accountId) {
    throw new Error('BILLING_ORDER_NOT_FOUND: 当前订单不存在或已无权查看')
  }

  const beforeSnapshot = buildOrderSummary(order)
  if (toText(order.status) === actionConfig.nextStatus) {
    return {
      ok: true,
      reused: true,
      order: beforeSnapshot
    }
  }

  if (action === 'refund' && toText(order.status) === 'refunded' && toText(order.fulfillmentStatus) === 'reverted') {
    return {
      ok: true,
      reused: true,
      order: beforeSnapshot,
      reverseResult: clone(order.refundSnapshot || {})
    }
  }

  if (actionConfig.validFromStatuses.indexOf(toText(order.status)) === -1) {
    throw new Error('BILLING_ORDER_STATUS_INVALID: 当前订单状态不支持继续发起支付')
  }

  const productMap = await loadProducts()
  const product = productMap[toText(order.productCode)] || normalizeProduct(order.pricingSnapshot || {})

  if (!product || !product.productCode) {
    throw new Error('BILLING_PRODUCT_NOT_FOUND: 当前商品未配置，请稍后重试')
  }

  let reverseResult = null
  if (action === 'refund') {
    reverseResult = await reverseOrderFulfillment(order, product, actionAt, now)
    await markSuccessfulTransactionsRefunded(order.accountId, orderId, now, {
      operatorId: operatorConfig.operatorId,
      reason: event.reason,
      source: event.source || 'internal_update_status'
    })
  } else {
    await closePendingTransactions(order.accountId, orderId, now, actionConfig.transactionFailureReason)
  }

  const updateData = {
    status: actionConfig.nextStatus,
    updatedAt: now,
    paymentEnabled: false
  }

  if (action === 'close') {
    updateData.closedAt = actionAt
    updateData.closedReason = toText(event.reason)
  }

  if (action === 'fail') {
    updateData.failedAt = actionAt
    updateData.failedReason = toText(event.reason)
  }

  if (action === 'refund') {
    updateData.refundedAt = actionAt
    updateData.refundReason = toText(event.reason)
    updateData.fulfillmentStatus = 'reverted'
    updateData.fulfillmentRevertedAt = now
    updateData.refundSnapshot = reverseResult
  }

  try {
    await db.collection('orders').where({
      orderId
    }).update({
      data: updateData
    })
  } catch (error) {
    throw new Error('BILLING_ORDER_TRANSITION_UNAVAILABLE: 当前暂时无法更新订单状态，请稍后重试')
  }

  const updatedOrder = {
    ...order,
    ...updateData
  }

  await appendAuditLog(
    operatorConfig.operatorId,
    actionConfig.actionType,
    'order',
    orderId,
    beforeSnapshot,
    {
      ...buildOrderSummary(updatedOrder),
      reverseResult
    },
    event.reason || `billing order ${action}`,
    now
  )

  return {
    ok: true,
    reused: false,
    action,
    order: buildOrderSummary(updatedOrder),
    reverseResult
  }
}
