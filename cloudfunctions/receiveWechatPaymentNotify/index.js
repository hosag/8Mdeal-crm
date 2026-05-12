const crypto = require('crypto')
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function toText(value) {
  return String(value || '').trim()
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value)
  } catch (error) {
    return fallback
  }
}

function normalizePem(value) {
  const current = toText(value)
  if (!current) {
    return ''
  }

  return current.includes('\\n') ? current.replace(/\\n/g, '\n') : current
}

function getEnvText(key) {
  return toText(process.env[key])
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

function buildWechatReply(code, message, extra = {}) {
  return {
    ok: code === 'SUCCESS',
    httpStatusCode: 200,
    responseBody: {
      code,
      message
    },
    ...extra
  }
}

function normalizeHeaders(headers) {
  const source = headers && typeof headers === 'object' && !Array.isArray(headers) ? headers : {}
  return Object.keys(source).reduce((result, key) => {
    result[String(key || '').toLowerCase()] = source[key]
    return result
  }, {})
}

function extractHeaders(event = {}) {
  return normalizeHeaders(
    event.headers ||
    event.header ||
    (event.request && event.request.headers) ||
    {}
  )
}

function extractRawBody(event = {}) {
  if (typeof event.rawBody === 'string') {
    return event.rawBody
  }

  if (typeof event.body === 'string') {
    return event.body
  }

  if (typeof event.payload === 'string') {
    return event.payload
  }

  if (event.body && typeof event.body === 'object') {
    return JSON.stringify(event.body)
  }

  if (event.payload && typeof event.payload === 'object') {
    return JSON.stringify(event.payload)
  }

  return ''
}

function buildWechatNotifySignMessage(timestamp, nonce, rawBody) {
  return `${toText(timestamp)}\n${toText(nonce)}\n${rawBody}\n`
}

function verifyWechatNotifySignature(rawBody, headers) {
  const timestamp = toText(headers['wechatpay-timestamp'])
  const nonce = toText(headers['wechatpay-nonce'])
  const signature = toText(headers['wechatpay-signature'])
  const serial = toText(headers['wechatpay-serial'])
  const platformPem = normalizePem(getEnvText('BILLING_WECHAT_PAY_PLATFORM_CERT'))
  const expectedSerial = toText(getEnvText('BILLING_WECHAT_PAY_PLATFORM_SERIAL_NO'))

  if (!timestamp || !nonce || !signature || !serial) {
    throw new Error('WECHAT_PAY_NOTIFY_INVALID_HEADERS')
  }

  if (!platformPem) {
    throw new Error('WECHAT_PAY_NOTIFY_CERT_MISSING')
  }

  if (expectedSerial && expectedSerial !== serial) {
    throw new Error('WECHAT_PAY_NOTIFY_SERIAL_MISMATCH')
  }

  const verify = crypto.createVerify('RSA-SHA256')
  verify.update(buildWechatNotifySignMessage(timestamp, nonce, rawBody))
  verify.end()

  const passed = verify.verify(platformPem, signature, 'base64')
  if (!passed) {
    throw new Error('WECHAT_PAY_NOTIFY_VERIFY_FAILED')
  }

  return {
    timestamp,
    nonce,
    signature,
    serial
  }
}

function decryptWechatNotifyResource(resource) {
  const source = resource && typeof resource === 'object' ? resource : {}
  const apiV3Key = getEnvText('BILLING_WECHAT_PAY_API_V3_KEY')
  const ciphertext = toText(source.ciphertext)
  const nonce = toText(source.nonce)
  const associatedData = toText(source.associated_data)

  if (!apiV3Key || apiV3Key.length !== 32) {
    throw new Error('WECHAT_PAY_NOTIFY_API_V3_KEY_INVALID')
  }

  if (!ciphertext || !nonce) {
    throw new Error('WECHAT_PAY_NOTIFY_RESOURCE_INVALID')
  }

  const encryptedBuffer = Buffer.from(ciphertext, 'base64')
  if (encryptedBuffer.length <= 16) {
    throw new Error('WECHAT_PAY_NOTIFY_RESOURCE_INVALID')
  }

  const authTag = encryptedBuffer.slice(encryptedBuffer.length - 16)
  const encrypted = encryptedBuffer.slice(0, encryptedBuffer.length - 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(apiV3Key, 'utf8'), Buffer.from(nonce, 'utf8'))

  if (associatedData) {
    decipher.setAAD(Buffer.from(associatedData, 'utf8'))
  }
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]).toString('utf8')

  const parsed = safeJsonParse(decrypted, null)
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('WECHAT_PAY_NOTIFY_DECRYPT_PARSE_FAILED')
  }

  return parsed
}

function mapTransactionTradeState(tradeState) {
  const current = toText(tradeState).toUpperCase()
  if (current === 'SUCCESS') {
    return 'success'
  }
  if (current === 'CLOSED' || current === 'REVOKED') {
    return 'close'
  }
  if (current === 'PAYERROR') {
    return 'fail'
  }
  if (current === 'USERPAYING' || current === 'NOTPAY') {
    return 'pending'
  }
  return ''
}

function mapWechatNotifyToInternalEvent(eventType, notifyBody, verifyResult) {
  const currentEventType = toText(eventType).toUpperCase()
  const source = notifyBody && typeof notifyBody === 'object' ? notifyBody : {}
  const outTradeNo = toText(source.out_trade_no)
  const transactionId = toText(source.transaction_id)
  const successTime = toText(source.success_time)
  const tradeState = toText(source.trade_state)
  const refundStatus = toText(source.refund_status || source.refund_state)
  const refundSuccessTime = toText(source.success_time)

  if (currentEventType === 'TRANSACTION.SUCCESS' || currentEventType === 'TRANSACTION.CLOSED') {
    return {
      provider: 'wechat_pay',
      orderId: outTradeNo,
      outTradeNo,
      merchantOrderId: outTradeNo,
      externalTransactionId: transactionId,
      providerTransactionId: transactionId,
      transactionId,
      tradeState,
      status: mapTransactionTradeState(tradeState) || (currentEventType === 'TRANSACTION.SUCCESS' ? 'success' : 'close'),
      paidAt: successTime,
      actionAt: successTime,
      callbackTraceId: `${toText(verifyResult.timestamp)}:${toText(verifyResult.nonce)}:${currentEventType}:${outTradeNo || transactionId}`,
      eventId: `${currentEventType}:${outTradeNo || transactionId}`,
      source: 'wechat_pay_notify',
      message: toText(source.trade_state_desc || source.trade_state),
      rawCallback: clone(source)
    }
  }

  if (currentEventType === 'REFUND.SUCCESS') {
    return {
      provider: 'wechat_pay',
      orderId: outTradeNo,
      outTradeNo,
      merchantOrderId: outTradeNo,
      externalTransactionId: transactionId,
      providerTransactionId: transactionId,
      transactionId,
      tradeState: refundStatus || 'SUCCESS',
      status: 'refund',
      refundedAt: refundSuccessTime,
      actionAt: refundSuccessTime,
      callbackTraceId: `${toText(verifyResult.timestamp)}:${toText(verifyResult.nonce)}:${currentEventType}:${outTradeNo || transactionId}`,
      eventId: `${currentEventType}:${outTradeNo || transactionId}`,
      source: 'wechat_pay_notify',
      message: refundStatus || 'refund_success',
      rawCallback: clone(source)
    }
  }

  return {
    provider: 'wechat_pay',
    orderId: outTradeNo,
    outTradeNo,
    merchantOrderId: outTradeNo,
    externalTransactionId: transactionId,
    providerTransactionId: transactionId,
    transactionId,
    tradeState,
    status: mapTransactionTradeState(tradeState) || 'pending',
    paidAt: successTime,
    actionAt: successTime,
    callbackTraceId: `${toText(verifyResult.timestamp)}:${toText(verifyResult.nonce)}:${currentEventType}:${outTradeNo || transactionId}`,
    eventId: `${currentEventType}:${outTradeNo || transactionId}`,
    source: 'wechat_pay_notify',
    message: toText(source.trade_state_desc || source.summary || currentEventType),
    rawCallback: clone(source)
  }
}

exports.main = async (event = {}) => {
  const headers = extractHeaders(event)
  const rawBody = extractRawBody(event)
  const body = safeJsonParse(rawBody, null)

  if (!rawBody || !body || typeof body !== 'object') {
    return buildWechatReply('FAIL', 'invalid notify body', {
      errorCode: 'WECHAT_PAY_NOTIFY_BODY_INVALID'
    })
  }

  let verifyResult = null
  try {
    verifyResult = verifyWechatNotifySignature(rawBody, headers)
  } catch (error) {
    return buildWechatReply('FAIL', 'signature verify failed', {
      errorCode: toText(error && error.message) || 'WECHAT_PAY_NOTIFY_VERIFY_FAILED'
    })
  }

  let decryptedBody = null
  try {
    decryptedBody = decryptWechatNotifyResource(body.resource)
  } catch (error) {
    return buildWechatReply('FAIL', 'decrypt failed', {
      errorCode: toText(error && error.message) || 'WECHAT_PAY_NOTIFY_DECRYPT_FAILED'
    })
  }

  const operatorConfig = await getOperatorConfig()
  if (!operatorConfig.enabled || !operatorConfig.operatorKey) {
    return buildWechatReply('FAIL', 'operator config missing', {
      errorCode: 'WECHAT_PAY_NOTIFY_OPERATOR_CONFIG_MISSING'
    })
  }

  const mappedEvent = mapWechatNotifyToInternalEvent(body.event_type || body.eventType, decryptedBody, verifyResult)
  if (!toText(mappedEvent.orderId) || !toText(mappedEvent.status)) {
    return buildWechatReply('SUCCESS', 'ignored', {
      ignored: true,
      eventType: toText(body.event_type || body.eventType),
      decryptedBody
    })
  }

  try {
    const transitionResult = await cloud.callFunction({
      name: 'handleBillingPaymentCallback',
      data: {
        operatorKey: operatorConfig.operatorKey,
        ...mappedEvent,
        notifyId: toText(body.id),
        traceId: toText(body.id || mappedEvent.callbackTraceId),
        callbackId: toText(body.id),
        wechatpaySerial: toText(verifyResult.serial),
        wechatpayTimestamp: toText(verifyResult.timestamp),
        rawWechatNotify: clone(body),
        rawWechatHeaders: clone(headers)
      }
    })

    return buildWechatReply('SUCCESS', 'success', {
      notifyId: toText(body.id),
      eventType: toText(body.event_type || body.eventType),
      mappedEvent,
      transitionResult: transitionResult && transitionResult.result ? transitionResult.result : null
    })
  } catch (error) {
    return buildWechatReply('FAIL', 'callback transition failed', {
      notifyId: toText(body.id),
      eventType: toText(body.event_type || body.eventType),
      mappedEvent,
      errorCode: toText(error && error.message) || 'WECHAT_PAY_NOTIFY_TRANSITION_FAILED'
    })
  }
}
