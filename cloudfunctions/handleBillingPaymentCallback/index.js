const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function toText(value) {
  return String(value || '').trim()
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
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

function normalizeProvider(value) {
  const current = toText(value).toLowerCase()
  if (!current) {
    return 'wechat_pay'
  }

  return current
}

function normalizeCallbackStatus(value) {
  const current = toText(value).toLowerCase()

  if (['success', 'paid', 'succeeded', 'successed', 'trade_success'].indexOf(current) > -1) {
    return 'success'
  }

  if (['fail', 'failed', 'error', 'payment_failed', 'trade_error'].indexOf(current) > -1) {
    return 'fail'
  }

  if (['close', 'closed', 'cancel', 'cancelled', 'canceled', 'trade_closed'].indexOf(current) > -1) {
    return 'close'
  }

  if (['refund', 'refunded', 'refund_success'].indexOf(current) > -1) {
    return 'refund'
  }

  if (['pending', 'processing', 'userpaying', 'notpay'].indexOf(current) > -1) {
    return 'pending'
  }

  return ''
}

function buildTraceId(event, provider, orderId, callbackStatus) {
  const explicitTraceId = toText(
    event.callbackTraceId || event.traceId || event.eventId || event.notifyId || event.callbackId
  )
  if (explicitTraceId) {
    return explicitTraceId
  }

  const transactionId = toText(
    event.externalTransactionId || event.providerTransactionId || event.transactionId
  )
  const actionAt = toText(event.paidAt || event.actionAt || event.refundedAt)
  return [provider, orderId, callbackStatus || 'unknown', transactionId || 'no_txn', actionAt || 'no_time'].join(':')
}

function buildOrderSummary(order) {
  return {
    orderId: toText(order && order.orderId),
    accountId: toText(order && order.accountId),
    status: toText(order && order.status) || 'pending',
    productCode: toText(order && order.productCode),
    productType: toText(order && order.productType),
    amount: Number(order && order.amount) || 0,
    paidAt: order && order.paidAt ? new Date(order.paidAt).toISOString() : '',
    updatedAt: order && order.updatedAt ? new Date(order.updatedAt).toISOString() : '',
    fulfillmentStatus: toText(order && order.fulfillmentStatus)
  }
}

function buildCallbackEventSummary(record) {
  if (!record) {
    return null
  }

  return {
    callbackTraceId: toText(record.callbackTraceId),
    provider: toText(record.provider),
    callbackStatus: toText(record.callbackStatus),
    mappedAction: toText(record.mappedAction),
    orderId: toText(record.orderId),
    accountId: toText(record.accountId),
    status: toText(record.status),
    reason: toText(record.reason),
    appliedAt: record.appliedAt ? new Date(record.appliedAt).toISOString() : '',
    createdAt: record.createdAt ? new Date(record.createdAt).toISOString() : '',
    updatedAt: record.updatedAt ? new Date(record.updatedAt).toISOString() : ''
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
    // Keep callback processing available even if audit logs are not deployed yet.
  }
}

async function resolveOrder(orderId) {
  if (!orderId) {
    return null
  }

  return safeGetOne('orders', {
    orderId
  })
}

async function callInternalTransition(name, data) {
  const result = await cloud.callFunction({
    name,
    data
  })

  return result && result.result ? result.result : null
}

exports.main = async (event = {}) => {
  const operatorConfig = await ensureOperatorAuthorized(event.operatorKey)
  const provider = normalizeProvider(event.provider)
  const orderId = toText(event.orderId || event.outTradeNo || event.merchantOrderId)
  const callbackStatus = normalizeCallbackStatus(event.status || event.tradeState || event.callbackStatus)
  const externalTransactionId = toText(
    event.externalTransactionId || event.providerTransactionId || event.transactionId
  )
  const reason = toText(event.reason || event.failureReason || event.message)
  const now = new Date()

  if (!orderId || !callbackStatus) {
    throw new Error('BILLING_ORDER_STATUS_INVALID: 当前订单状态不支持继续发起支付')
  }

  const callbackTraceId = buildTraceId(event, provider, orderId, callbackStatus)
  const existingEvent = await safeGetOne('billingCallbackEvents', {
    provider,
    callbackTraceId
  }, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc'
  })

  if (existingEvent && ['applied', 'ignored'].indexOf(toText(existingEvent.status)) > -1) {
    return {
      ok: true,
      reused: true,
      callbackEvent: buildCallbackEventSummary(existingEvent),
      transitionResult: clone(existingEvent.responsePayload || {})
    }
  }

  const order = await resolveOrder(orderId)
  if (!order || !order.accountId) {
    throw new Error('BILLING_ORDER_NOT_FOUND: 当前订单不存在或已无权查看')
  }

  const mappedAction = callbackStatus === 'success'
    ? 'mark_paid'
    : callbackStatus === 'fail'
      ? 'fail'
      : callbackStatus === 'close'
        ? 'close'
        : callbackStatus === 'refund'
          ? 'refund'
          : 'ignore'

  const callbackEventRecord = {
    callbackTraceId,
    provider,
    callbackStatus,
    mappedAction,
    orderId,
    accountId: toText(order.accountId),
    externalTransactionId,
    reason,
    source: toText(event.source || 'billing_callback_adapter'),
    requestPayload: clone(event),
    responsePayload: null,
    status: mappedAction === 'ignore' ? 'ignored' : 'processing',
    appliedAt: null,
    createdAt: now,
    updatedAt: now
  }

  let callbackEventDocId = ''
  if (existingEvent && existingEvent._id) {
    callbackEventDocId = existingEvent._id
    await db.collection('billingCallbackEvents').doc(existingEvent._id).update({
      data: {
        accountId: toText(order.accountId),
        externalTransactionId,
        reason,
        requestPayload: clone(event),
        mappedAction,
        callbackStatus,
        status: mappedAction === 'ignore' ? 'ignored' : 'processing',
        updatedAt: now
      }
    })
  } else {
    try {
      const created = await db.collection('billingCallbackEvents').add({
        data: callbackEventRecord
      })
      callbackEventDocId = created && created._id ? created._id : ''
    } catch (error) {
      // Soft idempotency only. If event log collection is missing, continue with the core transition.
    }
  }

  if (mappedAction === 'ignore') {
    return {
      ok: true,
      reused: false,
      ignored: true,
      callbackEvent: buildCallbackEventSummary({
        ...callbackEventRecord,
        _id: callbackEventDocId
      }),
      order: buildOrderSummary(order),
      message: '当前回调状态仍在处理中，暂不推进订单状态'
    }
  }

  let transitionResult = null
  try {
    if (mappedAction === 'mark_paid') {
      transitionResult = await callInternalTransition('markBillingOrderPaid', {
        operatorKey: event.operatorKey,
        orderId,
        paidAt: event.paidAt || event.actionAt || now.toISOString(),
        externalTransactionId,
        source: `${provider}_callback`,
        callbackTraceId,
        provider,
        rawCallback: clone(event)
      })
    } else {
      transitionResult = await callInternalTransition('updateBillingOrderStatus', {
        operatorKey: event.operatorKey,
        orderId,
        action: mappedAction,
        actionAt: event.actionAt || event.refundedAt || event.paidAt || now.toISOString(),
        reason: reason || `${provider} callback ${callbackStatus}`,
        source: `${provider}_callback`,
        callbackTraceId,
        provider,
        rawCallback: clone(event)
      })
    }
  } catch (error) {
    if (callbackEventDocId) {
      await db.collection('billingCallbackEvents').doc(callbackEventDocId).update({
        data: {
          status: 'failed',
          reason: toText(error && error.message) || reason,
          responsePayload: {
            ok: false,
            errorMessage: toText(error && error.message)
          },
          updatedAt: new Date()
        }
      })
    }
    throw error
  }

  const refreshedOrder = await resolveOrder(orderId)
  const afterSnapshot = buildOrderSummary(refreshedOrder || order)
  const responsePayload = clone(transitionResult || {})

  if (callbackEventDocId) {
    await db.collection('billingCallbackEvents').doc(callbackEventDocId).update({
      data: {
        status: 'applied',
        responsePayload,
        appliedAt: new Date(),
        updatedAt: new Date()
      }
    })
  }

  await appendAuditLog(
    operatorConfig.operatorId,
    'handle_payment_callback',
    'order',
    orderId,
    buildOrderSummary(order),
    {
      ...afterSnapshot,
      callbackTraceId,
      callbackStatus,
      mappedAction
    },
    reason || `${provider} callback ${callbackStatus}`,
    new Date()
  )

  return {
    ok: true,
    reused: false,
    provider,
    callbackTraceId,
    callbackStatus,
    mappedAction,
    order: afterSnapshot,
    transitionResult: responsePayload
  }
}
