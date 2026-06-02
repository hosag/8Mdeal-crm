const crypto = require('crypto')
const https = require('https')
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

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function createTransactionId(now) {
  return `txn_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`
}

function addMinutes(source, minutes) {
  const base = source instanceof Date ? new Date(source.getTime()) : new Date(source)
  if (Number.isNaN(base.getTime())) {
    return null
  }

  base.setMinutes(base.getMinutes() + minutes)
  return base
}

async function getPaymentProfileFlag() {
  return safeGetOne('featureFlags', {
    flagKey: 'billing_payment_profile_v1'
  })
}

function getEnvText(key) {
  return toText(process.env[key])
}

function normalizePrivateKey(value) {
  const current = toText(value)
  if (!current) {
    return ''
  }

  return current.includes('\\n') ? current.replace(/\\n/g, '\n') : current
}

function createNonceStr() {
  return crypto.randomBytes(16).toString('hex')
}

function buildJsapiPackage(prepayId) {
  const current = toText(prepayId)
  return current ? `prepay_id=${current}` : ''
}

function buildWechatPaySignatureMessage(appId, timeStamp, nonceStr, packageValue) {
  return `${toText(appId)}\n${toText(timeStamp)}\n${toText(nonceStr)}\n${toText(packageValue)}\n`
}

function buildWechatRequestSignMessage(method, urlPath, timestamp, nonceStr, bodyText) {
  return `${toText(method).toUpperCase()}\n${toText(urlPath)}\n${toText(timestamp)}\n${toText(nonceStr)}\n${toText(bodyText)}\n`
}

function buildSignedClientPayload(appId, privateKey, prepayId) {
  const packageValue = buildJsapiPackage(prepayId)
  if (!appId || !privateKey || !packageValue) {
    return normalizeClientPayload(null)
  }

  const timeStamp = `${Math.floor(Date.now() / 1000)}`
  const nonceStr = createNonceStr()
  const signType = 'RSA'
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(buildWechatPaySignatureMessage(appId, timeStamp, nonceStr, packageValue))
  sign.end()

  return {
    timeStamp,
    nonceStr,
    package: packageValue,
    signType,
    paySign: sign.sign(privateKey, 'base64')
  }
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value)
  } catch (error) {
    return fallback
  }
}

function resolvePrepayId(options = {}) {
  const event = options.event && typeof options.event === 'object' ? options.event : {}
  const transaction = options.transaction && typeof options.transaction === 'object' ? options.transaction : {}
  const payload = options.payload && typeof options.payload === 'object' ? options.payload : {}
  const requestPayload = transaction.requestPayload && typeof transaction.requestPayload === 'object'
    ? transaction.requestPayload
    : {}
  const channelOrder = requestPayload.channelOrder && typeof requestPayload.channelOrder === 'object'
    ? requestPayload.channelOrder
    : {}

  const candidates = [
    {
      value: event.prepayId,
      source: 'event.prepayId'
    },
    {
      value: channelOrder.prepayId,
      source: 'transaction.channelOrder.prepayId'
    },
    {
      value: payload.debugPrepayId,
      source: 'feature_flag.debugPrepayId'
    },
    {
      value: getEnvText('BILLING_WECHAT_PAY_DEBUG_PREPAY_ID'),
      source: 'env.BILLING_WECHAT_PAY_DEBUG_PREPAY_ID'
    }
  ]

  const matched = candidates.find((item) => toText(item.value))
  return {
    prepayId: matched ? toText(matched.value) : '',
    prepayIdSource: matched ? matched.source : ''
  }
}

function buildWechatNotifyUrl(paymentProfile) {
  const explicitUrl = toText(getEnvText('BILLING_WECHAT_PAY_NOTIFY_URL'))
  if (explicitUrl) {
    return explicitUrl
  }

  const notifyFunctionName = toText(paymentProfile && paymentProfile.notifyFunctionName)
  const notifyBaseUrl = toText(getEnvText('BILLING_WECHAT_PAY_NOTIFY_BASE_URL'))
  if (notifyBaseUrl && notifyFunctionName) {
    return `${notifyBaseUrl.replace(/\/$/, '')}/${notifyFunctionName}`
  }

  return ''
}

function buildWechatPayRequestAuthorization(options = {}) {
  const mchId = toText(options.mchId)
  const serialNo = toText(options.serialNo)
  const nonceStr = toText(options.nonceStr)
  const timestamp = toText(options.timestamp)
  const signature = toText(options.signature)

  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${serialNo}"`
}

function signWechatPayRequest(method, urlPath, bodyText, privateKey, mchId, serialNo) {
  const timestamp = `${Math.floor(Date.now() / 1000)}`
  const nonceStr = createNonceStr()
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(buildWechatRequestSignMessage(method, urlPath, timestamp, nonceStr, bodyText))
  sign.end()
  const signature = sign.sign(privateKey, 'base64')

  return {
    timestamp,
    nonceStr,
    signature,
    authorization: buildWechatPayRequestAuthorization({
      mchId,
      serialNo,
      nonceStr,
      timestamp,
      signature
    })
  }
}

function shouldTryCreateWechatPrepay(profile) {
  return Boolean(
    profile &&
    profile.flagEnabled === true &&
    profile.mode === 'native_jsapi' &&
    profile.merchantConfigReady === true &&
    profile.privateKeyReady === true &&
    profile.appId &&
    profile.mchId &&
    profile.serialNo &&
    profile.notifyUrl &&
    !profile.prepayId
  )
}

function buildWechatJsapiOrderRequest(order, paymentProfile, openid, outTradeNo) {
  return {
    appid: toText(paymentProfile.appId),
    mchid: toText(paymentProfile.mchId),
    description: toText(order.title || order.productCode || '成交CRM订单').slice(0, 127) || '成交CRM订单',
    out_trade_no: toText(outTradeNo),
    notify_url: toText(paymentProfile.notifyUrl),
    amount: {
      total: Math.max(1, toNumber(order.amount, 0)),
      currency: toText(order.currency || 'CNY') || 'CNY'
    },
    payer: {
      openid: toText(openid)
    },
    attach: JSON.stringify({
      o: toText(order.orderId),
      t: toText(outTradeNo)
    })
  }
}

function requestWechatJsapiOrder(options = {}) {
  const apiBase = toText(options.apiBase || 'https://api.mch.weixin.qq.com')
  const urlPath = '/v3/pay/transactions/jsapi'
  const bodyText = JSON.stringify(options.body || {})
  const url = new URL(urlPath, apiBase)
  const signed = signWechatPayRequest(
    'POST',
    `${url.pathname}${url.search}`,
    bodyText,
    options.privateKey,
    options.mchId,
    options.serialNo
  )

  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: signed.authorization,
        'Wechatpay-Serial': toText(options.serialNo),
        'User-Agent': 'chengjiao-crm-miniapp/1.0',
        'Content-Length': Buffer.byteLength(bodyText)
      }
    }, (response) => {
      const chunks = []
      response.on('data', (chunk) => {
        chunks.push(chunk)
      })
      response.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8')
        const responseBody = safeJsonParse(rawBody, null)
        const statusCode = Number(response.statusCode) || 0

        if (statusCode >= 200 && statusCode < 300 && responseBody && toText(responseBody.prepay_id)) {
          resolve({
            ok: true,
            statusCode,
            prepayId: toText(responseBody.prepay_id),
            responseBody
          })
          return
        }

        reject(new Error(
          `WECHAT_PAY_UNIFIED_ORDER_FAILED:${statusCode}:${toText(responseBody && (responseBody.message || responseBody.code) || rawBody)}`
        ))
      })
    })

    request.on('error', (error) => {
      reject(error)
    })

    request.setTimeout(12000, () => {
      request.destroy(new Error('WECHAT_PAY_UNIFIED_ORDER_TIMEOUT'))
    })

    request.write(bodyText)
    request.end()
  })
}

function normalizeClientPayload(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    timeStamp: toText(source.timeStamp),
    nonceStr: toText(source.nonceStr),
    package: toText(source.package),
    signType: toText(source.signType || 'RSA') || 'RSA',
    paySign: toText(source.paySign)
  }
}

function isClientPayloadReady(value) {
  const payload = normalizeClientPayload(value)
  return Boolean(
    payload.timeStamp &&
    payload.nonceStr &&
    payload.package &&
    payload.signType &&
    payload.paySign
  )
}

function normalizePaymentProfile(flag, options = {}) {
  const payload = flag && flag.payload && typeof flag.payload === 'object' ? flag.payload : {}
  const mode = toText(payload.mode || 'placeholder') || 'placeholder'
  const enabled = flag ? flag.enabled !== false : false
  const appId = toText(payload.appId || getEnvText('BILLING_WECHAT_PAY_APPID'))
  const mchId = toText(payload.mchId || getEnvText('BILLING_WECHAT_PAY_MCHID'))
  const notifyFunctionName = toText(
    payload.notifyFunctionName || getEnvText('BILLING_WECHAT_PAY_NOTIFY_FUNCTION') || 'handleBillingPaymentCallback'
  ) || 'handleBillingPaymentCallback'
  const privateKey = normalizePrivateKey(getEnvText('BILLING_WECHAT_PAY_PRIVATE_KEY'))
  const privateKeyReady = Boolean(privateKey)
  const serialNo = toText(getEnvText('BILLING_WECHAT_PAY_MERCHANT_SERIAL_NO'))
  const notifyUrl = buildWechatNotifyUrl({
    notifyFunctionName
  })
  const apiBase = toText(getEnvText('BILLING_WECHAT_PAY_API_BASE') || 'https://api.mch.weixin.qq.com')
  const { prepayId, prepayIdSource } = resolvePrepayId({
    ...options,
    payload
  })
  const merchantConfigReady = payload.merchantConfigReady === true
  let clientPayload = normalizeClientPayload(payload.clientPayload)
  const missingConfigKeys = []

  if (mode === 'native_jsapi') {
    if (!appId) {
      missingConfigKeys.push('appId')
    }
    if (!mchId) {
      missingConfigKeys.push('mchId')
    }
    if (!merchantConfigReady) {
      missingConfigKeys.push('merchantConfigReady')
    }
    if (!serialNo) {
      missingConfigKeys.push('merchantSerialNo')
    }
    if (!notifyUrl) {
      missingConfigKeys.push('notifyUrl')
    }
    if (!privateKeyReady) {
      missingConfigKeys.push('merchantPrivateKey')
    }
    if (!prepayId) {
      missingConfigKeys.push('prepayId')
    }
    if (enabled && merchantConfigReady && privateKeyReady && appId && prepayId) {
      try {
        clientPayload = buildSignedClientPayload(appId, privateKey, prepayId)
      } catch (error) {
        clientPayload = normalizeClientPayload(payload.clientPayload)
        missingConfigKeys.push('clientPayloadSignFailed')
      }
    } else if (!isClientPayloadReady(clientPayload)) {
      missingConfigKeys.push('clientPayload')
    }
  }

  const clientPayloadReady = isClientPayloadReady(clientPayload)
  const canInvokePayment = enabled && mode === 'native_jsapi' && merchantConfigReady && clientPayloadReady

  return {
    flagEnabled: enabled,
    profileCode: toText(payload.profileCode || 'billing_payment_profile_v1') || 'billing_payment_profile_v1',
    provider: toText(payload.provider || 'wechat_pay') || 'wechat_pay',
    mode,
    appId,
    mchId,
    merchantConfigReady,
    notifyFunctionName,
    notifyUrl,
    apiBase,
    serialNo,
    prepayId,
    prepayIdSource,
    privateKeyReady,
    privateKey,
    clientPayload,
    clientPayloadReady,
    canInvokePayment,
    missingConfigKeys,
    readinessCode: canInvokePayment
      ? 'ready'
      : (mode === 'native_jsapi' ? 'config_incomplete' : 'placeholder_only'),
    readinessLabel: canInvokePayment
      ? '支付参数已就绪'
      : (mode === 'native_jsapi' ? '支付参数待补齐' : '当前仅占位'),
    pendingReason: canInvokePayment
      ? ''
      : (mode === 'native_jsapi'
        ? 'native_jsapi_profile_incomplete'
        : 'payment_not_enabled_yet'),
    signStrategy: canInvokePayment ? 'server_rsa' : 'none'
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
  return {
    orderId: toText(order.orderId),
    title: toText(order.title),
    productCode: toText(order.productCode),
    productType: toText(order.productType),
    billingCycle: toText(order.billingCycle),
    amount: toNumber(order.amount, 0),
    currency: toText(order.currency) || 'CNY',
    status: toText(order.status) || 'pending',
    createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : '',
    paidAt: order.paidAt ? new Date(order.paidAt).toISOString() : '',
    updatedAt: order.updatedAt ? new Date(order.updatedAt).toISOString() : ''
  }
}

function buildTransactionSummary(record) {
  const requestPayload = record && record.requestPayload && typeof record.requestPayload === 'object'
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
      prepayIdReady: Boolean(toText(paymentSession.prepayId)),
      prepayId: toText(paymentSession.prepayId),
      prepayIdSource: toText(paymentSession.prepayIdSource),
      signStrategy: toText(paymentSession.signStrategy || 'none'),
      missingConfigKeys: Array.isArray(paymentSession.missingConfigKeys) ? paymentSession.missingConfigKeys.slice(0, 10) : [],
      channelOrder: {
        outTradeNo: toText(channelOrder.outTradeNo || record.merchantTradeNo || record.transactionId || record._id),
        prepayId: toText(channelOrder.prepayId || paymentSession.prepayId),
        prepayIdSource: toText(channelOrder.prepayIdSource || paymentSession.prepayIdSource),
        requestAt: toText(channelOrder.requestAt),
        requestError: toText(channelOrder.requestError),
        responseStatusCode: toNumber(channelOrder.responseStatusCode, 0)
      },
      clientPayload: paymentSession.clientPayload && typeof paymentSession.clientPayload === 'object'
        ? clone(paymentSession.clientPayload)
        : {
            timeStamp: '',
            nonceStr: '',
            package: '',
            signType: '',
            paySign: ''
          }
    }
  }
}

function buildPaymentSession(order, transactionId, preparedAt, expiresAt, profile) {
  const preparedAtText = preparedAt instanceof Date ? preparedAt.toISOString() : toText(preparedAt)
  const expiresAtText = expiresAt instanceof Date ? expiresAt.toISOString() : toText(expiresAt)
  const currentProfile = profile && typeof profile === 'object' ? profile : normalizePaymentProfile(null)

  return {
    sessionId: transactionId,
    profileCode: toText(currentProfile.profileCode || 'billing_payment_profile_v1'),
    provider: toText(currentProfile.provider || 'wechat_pay') || 'wechat_pay',
    mode: toText(currentProfile.mode || 'placeholder') || 'placeholder',
    paymentEnabled: currentProfile.flagEnabled === true,
    canInvokePayment: currentProfile.canInvokePayment === true,
    preparedAt: preparedAtText,
    expiresAt: expiresAtText,
    pendingReason: toText(currentProfile.pendingReason || 'payment_not_enabled_yet'),
    callbackFunctionName: toText(currentProfile.notifyFunctionName || 'handleBillingPaymentCallback'),
    readinessCode: toText(currentProfile.readinessCode || 'placeholder_only'),
    readinessLabel: toText(currentProfile.readinessLabel || '当前仅占位'),
    merchantConfigReady: currentProfile.merchantConfigReady === true,
    privateKeyReady: currentProfile.privateKeyReady === true,
    prepayId: toText(currentProfile.prepayId),
    prepayIdSource: toText(currentProfile.prepayIdSource),
    signStrategy: toText(currentProfile.signStrategy || 'none'),
    missingConfigKeys: Array.isArray(currentProfile.missingConfigKeys) ? currentProfile.missingConfigKeys.slice(0, 10) : [],
    clientPayload: currentProfile.clientPayload && typeof currentProfile.clientPayload === 'object'
      ? clone(currentProfile.clientPayload)
      : {
          timeStamp: '',
          nonceStr: '',
          package: '',
          signType: 'RSA',
          paySign: ''
        },
    orderSnapshot: clone({
      orderId: order.orderId,
      productCode: order.productCode,
      productType: order.productType,
      amount: order.amount,
      currency: order.currency
    })
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = toText(wxContext.OPENID)
  const orderId = toText(event.orderId)
  const now = new Date()

  if (!openid) {
    throw new Error('无法解析当前微信身份，请稍后重试')
  }

  if (!orderId) {
    throw new Error('BILLING_ORDER_NOT_FOUND: 当前订单不存在或已无权查看')
  }

  const context = await resolveAccountContext(openid)

  if (!context.account.phoneVerified) {
    throw new Error('ACCOUNT_PHONE_REQUIRED: 请先绑定手机号后再继续')
  }

  const order = await safeGetOne('orders', {
    accountId: context.accountId,
    orderId
  })

  if (!order) {
    throw new Error('BILLING_ORDER_NOT_FOUND: 当前订单不存在或已无权查看')
  }

  if (toText(order.status) !== 'pending') {
    throw new Error('BILLING_ORDER_STATUS_INVALID: 当前订单状态不支持继续发起支付')
  }

  const paymentProfileFlag = await getPaymentProfileFlag()

  const existingPendingTransaction = await safeGetOne('paymentTransactions', {
    accountId: context.accountId,
    orderId,
    status: 'pending'
  }, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc'
  })

  if (existingPendingTransaction && existingPendingTransaction.updatedAt) {
    const updatedAt = new Date(existingPendingTransaction.updatedAt)
    if (!Number.isNaN(updatedAt.getTime()) && now.getTime() - updatedAt.getTime() <= 10 * 60 * 1000) {
      const currentTransactionId = toText(existingPendingTransaction.transactionId) || createTransactionId(now)
      const currentExpiresAt = existingPendingTransaction.expiresAt
        ? new Date(existingPendingTransaction.expiresAt)
        : addMinutes(now, 10)
      const paymentProfile = normalizePaymentProfile(paymentProfileFlag, {
        event,
        transaction: existingPendingTransaction
      })
      const currentMerchantTradeNo = toText(existingPendingTransaction.merchantTradeNo || currentTransactionId)
      if (shouldTryCreateWechatPrepay(paymentProfile)) {
        try {
          const unifiedOrderResult = await requestWechatJsapiOrder({
            apiBase: paymentProfile.apiBase,
            privateKey: paymentProfile.privateKey,
            mchId: paymentProfile.mchId,
            serialNo: paymentProfile.serialNo,
            body: buildWechatJsapiOrderRequest(order, paymentProfile, openid, currentMerchantTradeNo)
          })
          existingPendingTransaction.requestPayload = {
            ...(existingPendingTransaction.requestPayload && typeof existingPendingTransaction.requestPayload === 'object'
              ? existingPendingTransaction.requestPayload
              : {}),
            channelOrder: {
              ...(existingPendingTransaction.requestPayload &&
                existingPendingTransaction.requestPayload.channelOrder &&
                typeof existingPendingTransaction.requestPayload.channelOrder === 'object'
                ? existingPendingTransaction.requestPayload.channelOrder
                : {}),
              outTradeNo: currentMerchantTradeNo,
              prepayId: unifiedOrderResult.prepayId,
              prepayIdSource: 'wechat_unified_order',
              appId: toText(paymentProfile.appId),
              mchId: toText(paymentProfile.mchId),
              signStrategy: 'server_rsa',
              requestAt: now.toISOString(),
              requestError: '',
              responseStatusCode: unifiedOrderResult.statusCode
            }
          }
          existingPendingTransaction.failureReason = ''
        } catch (error) {
          existingPendingTransaction.requestPayload = {
            ...(existingPendingTransaction.requestPayload && typeof existingPendingTransaction.requestPayload === 'object'
              ? existingPendingTransaction.requestPayload
              : {}),
            channelOrder: {
              ...(existingPendingTransaction.requestPayload &&
                existingPendingTransaction.requestPayload.channelOrder &&
                typeof existingPendingTransaction.requestPayload.channelOrder === 'object'
                ? existingPendingTransaction.requestPayload.channelOrder
                : {}),
              outTradeNo: currentMerchantTradeNo,
              requestAt: now.toISOString(),
              requestError: toText(error && error.message) || 'unified_order_failed'
            }
          }
          existingPendingTransaction.failureReason = toText(error && error.message) || 'unified_order_failed'
        }
      }
      const refreshedProfile = normalizePaymentProfile(paymentProfileFlag, {
        event,
        transaction: existingPendingTransaction
      })
      const paymentSession = buildPaymentSession(order, currentTransactionId, now, currentExpiresAt, refreshedProfile)

      if (
        !toText(existingPendingTransaction.transactionId) ||
        !existingPendingTransaction.requestPayload ||
        !existingPendingTransaction.requestPayload.paymentSession ||
        !existingPendingTransaction.expiresAt ||
        toText(existingPendingTransaction.requestPayload.paymentSession.mode) !== paymentSession.mode ||
        Boolean(existingPendingTransaction.requestPayload.paymentSession.canInvokePayment) !== paymentSession.canInvokePayment ||
        Boolean(
          existingPendingTransaction.requestPayload &&
          existingPendingTransaction.requestPayload.channelOrder &&
          existingPendingTransaction.requestPayload.channelOrder.requestAt
        )
      ) {
        try {
          await db.collection('paymentTransactions').doc(existingPendingTransaction._id).update({
            data: {
              transactionId: currentTransactionId,
              merchantTradeNo: toText(existingPendingTransaction.merchantTradeNo || currentTransactionId),
              expiresAt: currentExpiresAt,
              requestPayload: {
                placeholder: paymentSession.mode === 'placeholder',
                paymentSession,
                channelOrder: {
                  outTradeNo: currentMerchantTradeNo,
                  prepayId: toText(paymentSession.prepayId),
                  prepayIdSource: toText(paymentSession.prepayIdSource),
                  appId: toText(refreshedProfile.appId),
                  mchId: toText(refreshedProfile.mchId),
                  signStrategy: toText(paymentSession.signStrategy),
                  requestAt: toText(
                    existingPendingTransaction.requestPayload &&
                    existingPendingTransaction.requestPayload.channelOrder &&
                    existingPendingTransaction.requestPayload.channelOrder.requestAt
                  ),
                  requestError: toText(
                    existingPendingTransaction.requestPayload &&
                    existingPendingTransaction.requestPayload.channelOrder &&
                    existingPendingTransaction.requestPayload.channelOrder.requestError
                  ),
                  responseStatusCode: toNumber(
                    existingPendingTransaction.requestPayload &&
                    existingPendingTransaction.requestPayload.channelOrder &&
                    existingPendingTransaction.requestPayload.channelOrder.responseStatusCode,
                    0
                  )
                },
                preparedAt: now.toISOString(),
                orderSnapshot: clone(paymentSession.orderSnapshot)
              },
              failureReason: paymentSession.canInvokePayment
                ? ''
                : toText(
                  existingPendingTransaction.failureReason ||
                  (existingPendingTransaction.requestPayload &&
                    existingPendingTransaction.requestPayload.channelOrder &&
                    existingPendingTransaction.requestPayload.channelOrder.requestError) ||
                  paymentSession.pendingReason
                ),
              updatedAt: now
            }
          })
        } catch (error) {
          // Continue to return the synthesized session even if the backfill write fails.
        }
      }

      return {
        ok: true,
        reused: true,
        paymentEnabled: paymentSession.paymentEnabled === true,
        order: buildOrderSummary(order),
        paymentTransaction: buildTransactionSummary({
          ...existingPendingTransaction,
          transactionId: currentTransactionId,
          merchantTradeNo: currentMerchantTradeNo,
          expiresAt: currentExpiresAt,
          failureReason: paymentSession.canInvokePayment
            ? ''
            : toText(
              existingPendingTransaction.failureReason ||
              (existingPendingTransaction.requestPayload &&
                existingPendingTransaction.requestPayload.channelOrder &&
                existingPendingTransaction.requestPayload.channelOrder.requestError) ||
              paymentSession.pendingReason
            ),
          requestPayload: {
            ...(existingPendingTransaction.requestPayload && typeof existingPendingTransaction.requestPayload === 'object'
              ? existingPendingTransaction.requestPayload
              : {}),
            placeholder: paymentSession.mode === 'placeholder',
            paymentSession,
            channelOrder: existingPendingTransaction.requestPayload &&
              existingPendingTransaction.requestPayload.channelOrder &&
              typeof existingPendingTransaction.requestPayload.channelOrder === 'object'
              ? clone(existingPendingTransaction.requestPayload.channelOrder)
              : {}
          },
          updatedAt: now
        }),
        paymentSession,
        message: paymentSession.canInvokePayment
          ? '已复用一笔可直接拉起的微信支付会话'
          : (paymentSession.mode === 'native_jsapi'
            ? '已复用一笔 JSAPI 支付会话，但仍有配置未补齐'
            : '当前还未接入微信支付，已复用最近一笔支付准备记录')
      }
    }
  }

  const transactionId = createTransactionId(now)
  const expiresAt = addMinutes(now, 10)
  const paymentProfile = normalizePaymentProfile(paymentProfileFlag, {
    event,
    transaction: {
      transactionId,
      merchantTradeNo: transactionId
    }
  })
  let nextPaymentProfile = paymentProfile
  let channelOrder = {
    outTradeNo: transactionId,
    prepayId: toText(paymentProfile.prepayId),
    prepayIdSource: toText(paymentProfile.prepayIdSource),
    appId: toText(paymentProfile.appId),
    mchId: toText(paymentProfile.mchId),
    signStrategy: paymentProfile.canInvokePayment ? 'server_rsa' : 'none'
  }

  if (shouldTryCreateWechatPrepay(paymentProfile)) {
    try {
      const unifiedOrderResult = await requestWechatJsapiOrder({
        apiBase: paymentProfile.apiBase,
        privateKey: paymentProfile.privateKey,
        mchId: paymentProfile.mchId,
        serialNo: paymentProfile.serialNo,
        body: buildWechatJsapiOrderRequest(order, paymentProfile, openid, transactionId)
      })
      channelOrder = {
        ...channelOrder,
        prepayId: unifiedOrderResult.prepayId,
        prepayIdSource: 'wechat_unified_order',
        signStrategy: 'server_rsa',
        requestAt: now.toISOString(),
        responseStatusCode: unifiedOrderResult.statusCode
      }
      nextPaymentProfile = normalizePaymentProfile(paymentProfileFlag, {
        event,
        transaction: {
          transactionId,
          merchantTradeNo: transactionId,
          requestPayload: {
            channelOrder
          }
        }
      })
    } catch (error) {
      channelOrder = {
        ...channelOrder,
        requestAt: now.toISOString(),
        requestError: toText(error && error.message) || 'unified_order_failed'
      }
    }
  }

  const paymentSession = buildPaymentSession(order, transactionId, now, expiresAt, nextPaymentProfile)
  const paymentTransaction = {
    orderId,
    accountId: context.accountId,
    channel: 'wechat_pay',
    transactionId,
    merchantTradeNo: transactionId,
    channelTradeNo: '',
    requestPayload: {
      placeholder: paymentSession.mode === 'placeholder',
      preparedAt: now.toISOString(),
      channelOrder,
      paymentSession,
      orderSnapshot: clone(paymentSession.orderSnapshot)
    },
    callbackPayload: null,
    status: 'pending',
    failureReason: toText(channelOrder.requestError || paymentSession.pendingReason || 'payment_not_enabled_yet'),
    expiresAt,
    createdAt: now,
    updatedAt: now
  }

  try {
    await db.collection('paymentTransactions').add({
      data: paymentTransaction
    })
  } catch (error) {
    throw new Error('BILLING_PAYMENT_PREPARE_UNAVAILABLE: 当前暂时无法准备支付，请稍后重试')
  }

  return {
    ok: true,
    reused: false,
    paymentEnabled: paymentSession.paymentEnabled === true,
    order: buildOrderSummary(order),
    paymentTransaction: buildTransactionSummary(paymentTransaction),
    paymentSession,
    message: paymentSession.canInvokePayment
      ? '已生成可直接拉起的微信支付会话'
      : (paymentSession.mode === 'native_jsapi'
        ? '已生成 JSAPI 支付会话骨架，但仍有配置未补齐'
        : '当前还未接入微信支付，已完成支付发起占位记录')
  }
}
