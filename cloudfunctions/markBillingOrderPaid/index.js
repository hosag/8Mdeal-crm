const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const DEFAULT_TRIAL_POLICY = {
  trialDays: 7,
  freeProjectLimit: 3,
  trialVoiceSeconds: 600,
  trialAiTokens: 50000,
  readonlyAfterTrial: true,
  writeRequiresPhoneBinding: true
}

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

function toBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function toDate(value) {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function addCycle(source, billingCycle) {
  const base = source instanceof Date ? new Date(source.getTime()) : new Date(source)
  if (Number.isNaN(base.getTime())) {
    return null
  }

  if (billingCycle === 'yearly') {
    base.setFullYear(base.getFullYear() + 1)
    return base
  }

  base.setMonth(base.getMonth() + 1)
  return base
}

function mergeProjectLimit(currentLimit, nextLimit) {
  const current = toNumber(currentLimit, -1)
  const next = toNumber(nextLimit, -1)
  if (current < 0 || next < 0) {
    return -1
  }

  return Math.max(current, next)
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

async function safeCount(collectionName, query) {
  try {
    const result = await db.collection(collectionName).where(query).count()
    return Number(result.total || 0)
  } catch (error) {
    return 0
  }
}

function isTransferredReadonlyProject(project) {
  return project && project.handoverStatus === 'handed_over' && !project.isSharedProject
}

function buildProjectCountKey(project = {}) {
  return String(project && project._id || '').trim()
}

async function resolveAccountOpenids(accountId) {
  const identities = await safeGetList('accountIdentities', {
    accountId
  }, {
    limit: 20
  })

  return identities
    .map((item) => String(item && item.openid || '').trim())
    .filter(Boolean)
}

async function countVisibleProjectsForAccount(accountId) {
  const openids = await resolveAccountOpenids(accountId)
  const [projectsByOwner, projectsByAccount, projectsByOpenid] = await Promise.all([
    safeGetList('projects', {
      ownerAccountId: accountId
    }, {
      limit: 1000
    }),
    safeGetList('projects', {
      accountId
    }, {
      limit: 1000
    }),
    openids.length
      ? safeGetList('projects', {
        _openid: _.in(openids)
      }, {
        limit: 1000
      })
      : Promise.resolve([])
  ])

  const projectMap = {}
  ;[projectsByOwner, projectsByAccount, projectsByOpenid].forEach((list) => {
    list.forEach((item) => {
      const key = buildProjectCountKey(item)
      if (!key || projectMap[key]) {
        return
      }
      projectMap[key] = item
    })
  })

  return Object.values(projectMap).filter((item) => !isTransferredReadonlyProject(item)).length
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

async function loadTrialPolicy() {
  const flag = await safeGetOne('featureFlags', {
    flagKey: 'trial_policy_v1'
  })
  const payload = flag && flag.payload && typeof flag.payload === 'object' ? flag.payload : {}
  return {
    trialDays: toNumber(payload.trialDays, DEFAULT_TRIAL_POLICY.trialDays),
    freeProjectLimit: toNumber(payload.freeProjectLimit, DEFAULT_TRIAL_POLICY.freeProjectLimit),
    trialVoiceSeconds: toNumber(payload.trialVoiceSeconds, DEFAULT_TRIAL_POLICY.trialVoiceSeconds),
    trialAiTokens: toNumber(payload.trialAiTokens, DEFAULT_TRIAL_POLICY.trialAiTokens),
    readonlyAfterTrial: toBoolean(payload.readonlyAfterTrial, DEFAULT_TRIAL_POLICY.readonlyAfterTrial),
    writeRequiresPhoneBinding: toBoolean(payload.writeRequiresPhoneBinding, DEFAULT_TRIAL_POLICY.writeRequiresPhoneBinding)
  }
}

async function ensureOperatorAuthorized(operatorKey) {
  const config = await getOperatorConfig()
  if (!config.enabled || !config.operatorKey || config.operatorKey !== toText(operatorKey)) {
    throw new Error('BILLING_OPERATOR_FORBIDDEN: 当前无权执行内部到账操作')
  }

  return config
}

function normalizeProduct(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    productCode: toText(source.productCode || source.planCode),
    productName: toText(source.productName || source.planName),
    productType: toText(source.productType || source.planType),
    billingCycle: toText(source.billingCycle),
    projectLimit: toNumber(source.projectLimit, -1),
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
    fulfillmentStatus: toText(order.fulfillmentStatus),
    fulfillmentAppliedAt: order.fulfillmentAppliedAt ? new Date(order.fulfillmentAppliedAt).toISOString() : ''
  }
}

function buildReasonSummary(status, bindRequiredForWrite, projectCount, projectLimit, voiceSecondsRemaining, aiTokensRemaining) {
  if (bindRequiredForWrite) {
    return '保存正式数据前需要先绑定手机号'
  }

  if (status === 'disabled') {
    return '当前账号已被禁用'
  }

  if (status === 'free_limited') {
    return '试用已结束，请开通订阅后继续新增与使用 AI 能力'
  }

  if (status === 'expired_readonly') {
    return '当前订阅已过期，请续费后继续使用完整能力'
  }

  if (projectLimit > -1 && projectCount >= projectLimit) {
    return '当前项目数量已达上限'
  }

  if (voiceSecondsRemaining <= 0) {
    return '当前语音时长额度已用完'
  }

  if (aiTokensRemaining <= 0) {
    return '当前 AI 额度已用完'
  }

  return ''
}

async function getEntitlementsSnapshot(accountId) {
  const entitlements = await safeGetOne('entitlements', {
    accountId
  })

  return entitlements && typeof entitlements === 'object' ? entitlements : {}
}

async function safeUsageSummary(accountId, usageType) {
  try {
    const result = await db.collection('usageLedger').where({
      accountId,
      usageType
    }).limit(1000).get()

    return (Array.isArray(result.data) ? result.data : []).reduce((summary, item) => {
      const delta = Number(item && item.delta)
      if (!Number.isFinite(delta)) {
        return summary
      }

      summary.net += delta
      if (delta > 0) {
        summary.granted += delta
      }
      if (delta < 0) {
        summary.consumed += Math.abs(delta)
      }
      return summary
    }, {
      net: 0,
      granted: 0,
      consumed: 0
    })
  } catch (error) {
    return {
      net: 0,
      granted: 0,
      consumed: 0
    }
  }
}

async function upsertEntitlements(accountId, patch, now) {
  const entitlements = await safeGetOne('entitlements', {
    accountId
  })

  if (entitlements && entitlements._id) {
    await db.collection('entitlements').doc(entitlements._id).update({
      data: {
        ...patch,
        updatedAt: now
      }
    })
    return
  }

  await db.collection('entitlements').add({
    data: {
      accountId,
      ...patch,
      updatedAt: now
    }
  })
}

async function syncAccountAccessSnapshot(account, now) {
  if (!account || !account.accountId || !account._id) {
    return null
  }

  const accountId = toText(account.accountId)
  const trialPolicy = await loadTrialPolicy()
  const activeSubscription = await safeGetOne('subscriptions', {
    accountId,
    status: 'active'
  }, {
    orderByField: 'expiresAt',
    orderByDirection: 'desc'
  })
  const latestSubscription = activeSubscription || await safeGetOne('subscriptions', {
    accountId
  }, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc'
  })

  const trialEndsAt = toDate(account.trialEndsAt)
  const subscriptionExpiresAt = toDate(activeSubscription && activeSubscription.expiresAt)
  const hasActiveSubscription = Boolean(subscriptionExpiresAt && subscriptionExpiresAt.getTime() > now.getTime())
  const hasSubscriptionHistory = Boolean(latestSubscription)

  let status = 'trialing'
  let currentAccessLevel = 'trial_full'

  if (account.status === 'disabled') {
    status = 'disabled'
    currentAccessLevel = 'disabled'
  } else if (hasActiveSubscription) {
    status = 'active_paid'
    currentAccessLevel = 'paid_active'
  } else if (trialEndsAt && trialEndsAt.getTime() > now.getTime()) {
    status = 'trialing'
    currentAccessLevel = 'trial_full'
  } else if (hasSubscriptionHistory) {
    status = 'expired_readonly'
    currentAccessLevel = 'paid_readonly'
  } else if (trialPolicy.readonlyAfterTrial) {
    status = 'free_limited'
    currentAccessLevel = 'free_readonly'
  }

  const currentProjectCount = await countVisibleProjectsForAccount(accountId)

  const voiceUsageSummary = await safeUsageSummary(accountId, 'voice_seconds')
  const aiUsageSummary = await safeUsageSummary(accountId, 'ai_tokens')
  const voiceSecondsBaseTotal = hasActiveSubscription
    ? toNumber(activeSubscription.grantedVoiceSeconds, trialPolicy.trialVoiceSeconds)
    : (status === 'trialing' ? trialPolicy.trialVoiceSeconds : 0)
  const aiTokensBaseTotal = hasActiveSubscription
    ? toNumber(activeSubscription.grantedAiTokens, trialPolicy.trialAiTokens)
    : (status === 'trialing' ? trialPolicy.trialAiTokens : 0)
  const voiceSecondsTotal = Math.max(0, voiceSecondsBaseTotal + toNumber(voiceUsageSummary.granted, 0))
  const aiTokensTotal = Math.max(0, aiTokensBaseTotal + toNumber(aiUsageSummary.granted, 0))
  const voiceSecondsUsed = Math.max(0, toNumber(voiceUsageSummary.consumed, 0))
  const aiTokensUsed = Math.max(0, toNumber(aiUsageSummary.consumed, 0))
  const voiceSecondsRemaining = Math.max(0, voiceSecondsTotal - voiceSecondsUsed)
  const aiTokensRemaining = Math.max(0, aiTokensTotal - aiTokensUsed)
  const projectLimit = hasActiveSubscription
    ? toNumber(activeSubscription.projectLimit, -1)
    : trialPolicy.freeProjectLimit
  const bindRequiredForWrite = trialPolicy.writeRequiresPhoneBinding && !account.phoneVerified
  const baseWritable = status === 'trialing' || status === 'active_paid'
  const canCreateProject = baseWritable && (projectLimit < 0 || currentProjectCount < projectLimit)
  const reasonSummary = buildReasonSummary(
    status,
    bindRequiredForWrite,
    currentProjectCount,
    projectLimit,
    voiceSecondsRemaining,
    aiTokensRemaining
  )

  await db.collection('accounts').doc(account._id).update({
    data: {
      status,
      currentAccessLevel,
      updatedAt: now
    }
  })

  await upsertEntitlements(accountId, {
    status,
    currentAccessLevel,
    bindRequiredForWrite,
    phoneVerified: Boolean(account.phoneVerified),
    canCreateProject,
    canEditProject: baseWritable,
    canSaveFollowUp: baseWritable,
    canCreateTask: baseWritable,
    canUseQuickEntry: baseWritable,
    canUseSpeechToText: baseWritable && voiceSecondsRemaining > 0,
    canUseAi: baseWritable && aiTokensRemaining > 0,
    canShareOut: baseWritable,
    projectLimit,
    currentProjectCount,
    voiceSecondsTotal,
    voiceSecondsUsed,
    voiceSecondsRemaining,
    aiTokensTotal,
    aiTokensUsed,
    aiTokensRemaining,
    effectiveFrom: hasActiveSubscription && activeSubscription.startedAt
      ? new Date(activeSubscription.startedAt).toISOString()
      : '',
    effectiveTo: hasActiveSubscription && activeSubscription.expiresAt
      ? new Date(activeSubscription.expiresAt).toISOString()
      : (trialEndsAt ? trialEndsAt.toISOString() : ''),
    reasonSummary
  }, now)

  return {
    status,
    currentAccessLevel,
    projectLimit,
    currentProjectCount,
    voiceSecondsRemaining,
    aiTokensRemaining
  }
}

async function ensureGrantLedger(accountId, usageType, delta, sourceType, sourceId, beforeBalance, occurredAt, meta = {}) {
  const traceId = `${sourceId}:${usageType}:grant`
  const existing = await safeGetOne('usageLedger', {
    traceId
  })

  if (existing) {
    return {
      reused: true,
      recordId: existing._id || '',
      traceId
    }
  }

  const before = Math.max(0, toNumber(beforeBalance, 0))
  const after = Math.max(0, before + delta)

  await db.collection('usageLedger').add({
    data: {
      accountId,
      usageType,
      sourceType,
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

async function ensureSubscriptionApplied(accountId, order, product, paidAt, now) {
  const existing = await safeGetOne('subscriptions', {
    sourceOrderId: toText(order.orderId)
  })

  if (existing) {
    return {
      reused: true,
      subscriptionId: existing._id || '',
      planCode: existing.planCode || product.productCode,
      grantedVoiceSeconds: toNumber(existing.grantedVoiceSeconds, product.includedVoiceSeconds),
      grantedAiTokens: toNumber(existing.grantedAiTokens, product.includedAiTokens)
    }
  }

  const activeSubscription = await safeGetOne('subscriptions', {
    accountId,
    status: 'active'
  }, {
    orderByField: 'expiresAt',
    orderByDirection: 'desc'
  })

  if (activeSubscription && activeSubscription._id && activeSubscription.expiresAt) {
    const previousExpiresAt = new Date(activeSubscription.expiresAt)
    if (!Number.isNaN(previousExpiresAt.getTime()) && previousExpiresAt.getTime() > paidAt.getTime()) {
      const extendedExpiresAt = addCycle(previousExpiresAt, product.billingCycle)
      const relatedOrderIds = Array.isArray(activeSubscription.relatedOrderIds)
        ? activeSubscription.relatedOrderIds.map((item) => toText(item)).filter(Boolean)
        : []
      if (relatedOrderIds.indexOf(toText(order.orderId)) === -1) {
        relatedOrderIds.push(toText(order.orderId))
      }

      await db.collection('subscriptions').doc(activeSubscription._id).update({
        data: {
          expiresAt: extendedExpiresAt,
          updatedAt: now,
          lastSourceOrderId: toText(order.orderId),
          relatedOrderIds,
          grantedVoiceSeconds: Math.max(
            toNumber(activeSubscription.grantedVoiceSeconds, 0),
            toNumber(product.includedVoiceSeconds, 0)
          ),
          grantedAiTokens: Math.max(
            toNumber(activeSubscription.grantedAiTokens, 0),
            toNumber(product.includedAiTokens, 0)
          ),
          projectLimit: mergeProjectLimit(activeSubscription.projectLimit, product.projectLimit)
        }
      })

      return {
        reused: false,
        subscriptionId: activeSubscription._id,
        planCode: activeSubscription.planCode || product.productCode,
        grantedVoiceSeconds: Math.max(
          toNumber(activeSubscription.grantedVoiceSeconds, 0),
          toNumber(product.includedVoiceSeconds, 0)
        ),
        grantedAiTokens: Math.max(
          toNumber(activeSubscription.grantedAiTokens, 0),
          toNumber(product.includedAiTokens, 0)
        ),
        startedAt: activeSubscription.startedAt ? new Date(activeSubscription.startedAt).toISOString() : '',
        expiresAt: extendedExpiresAt ? extendedExpiresAt.toISOString() : ''
      }
    }
  }

  const currentStartAt = new Date(paidAt.getTime())
  const currentExpiresAt = addCycle(currentStartAt, product.billingCycle)

  const record = {
    accountId,
    planCode: product.productCode,
    planName: product.productName || order.title,
    status: 'active',
    startedAt: currentStartAt,
    expiresAt: currentExpiresAt,
    renewType: 'manual',
    sourceOrderId: toText(order.orderId),
    grantedVoiceSeconds: toNumber(product.includedVoiceSeconds, 0),
    grantedAiTokens: toNumber(product.includedAiTokens, 0),
    projectLimit: toNumber(product.projectLimit, -1),
    createdAt: now,
    updatedAt: now
  }

  await db.collection('subscriptions').add({
    data: record
  })

  return {
    reused: false,
    subscriptionId: '',
    planCode: record.planCode,
    grantedVoiceSeconds: record.grantedVoiceSeconds,
    grantedAiTokens: record.grantedAiTokens,
    startedAt: currentStartAt.toISOString(),
    expiresAt: currentExpiresAt ? currentExpiresAt.toISOString() : ''
  }
}

async function ensurePaymentTransactionSuccess(accountId, orderId, event, paidAt, now) {
  const query = event.transactionId
    ? {
      accountId,
      orderId,
      transactionId: toText(event.transactionId)
    }
    : {
      accountId,
      orderId
    }

  const existing = await safeGetOne('paymentTransactions', query, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc'
  })

  const callbackPayload = {
    placeholder: true,
    markedPaidAt: paidAt.toISOString(),
    operatorId: toText(event.operatorId),
    externalTransactionId: toText(event.externalTransactionId),
    source: toText(event.source || 'internal_mark_paid'),
    rawEvent: clone(event)
  }

  if (existing && existing._id) {
    // Older placeholder records may have callbackPayload stored as null.
    // Remove the field first so the next update can safely replace it with an object.
    if (Object.prototype.hasOwnProperty.call(existing, 'callbackPayload') && existing.callbackPayload === null) {
      await db.collection('paymentTransactions').doc(existing._id).update({
        data: {
          callbackPayload: _.remove()
        }
      })
    }

    await db.collection('paymentTransactions').doc(existing._id).update({
      data: {
        channel: toText(existing.channel) || 'wechat_pay',
        transactionId: toText(event.externalTransactionId || existing.transactionId),
        callbackPayload,
        status: 'success',
        failureReason: '',
        updatedAt: now
      }
    })

    return {
      reused: true,
      paymentTransactionId: existing._id
    }
  }

  await db.collection('paymentTransactions').add({
    data: {
      orderId,
      accountId,
      channel: 'wechat_pay',
      transactionId: toText(event.externalTransactionId),
      requestPayload: {
        placeholder: true,
        synthesizedBy: 'markBillingOrderPaid'
      },
      callbackPayload,
      status: 'success',
      failureReason: '',
      createdAt: now,
      updatedAt: now
    }
  })

  return {
    reused: false,
    paymentTransactionId: ''
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
    // Keep the main billing flow available even if audit logs are not deployed yet.
  }
}

exports.main = async (event = {}) => {
  const config = await ensureOperatorAuthorized(event.operatorKey)
  const orderId = toText(event.orderId)
  const paidAt = event.paidAt ? new Date(event.paidAt) : new Date()
  const now = new Date()

  if (!orderId) {
    throw new Error('BILLING_ORDER_NOT_FOUND: 当前订单不存在或已无权查看')
  }

  if (Number.isNaN(paidAt.getTime())) {
    throw new Error('BILLING_ORDER_STATUS_INVALID: 当前订单状态不支持继续发起支付')
  }

  const order = await safeGetOne('orders', {
    orderId
  })

  if (!order || !order.accountId) {
    throw new Error('BILLING_ORDER_NOT_FOUND: 当前订单不存在或已无权查看')
  }

  const beforeSnapshot = buildOrderSummary(order)
  const account = await safeGetOne('accounts', {
    accountId: order.accountId
  })

  if (toText(order.status) === 'paid' && toText(order.fulfillmentStatus) === 'applied') {
    const accessSnapshot = await syncAccountAccessSnapshot(account, now)
    return {
      ok: true,
      reused: true,
      order: beforeSnapshot,
      fulfillment: clone(order.fulfillmentSnapshot || {}),
      accessSnapshot
    }
  }

  if (['closed', 'refunded'].indexOf(toText(order.status)) > -1) {
    throw new Error('BILLING_ORDER_STATUS_INVALID: 当前订单状态不支持继续发起支付')
  }

  const productMap = await loadProducts()
  const product = productMap[toText(order.productCode)]

  if (!product) {
    throw new Error('BILLING_PRODUCT_NOT_FOUND: 当前商品未配置，请稍后重试')
  }

  const entitlements = await getEntitlementsSnapshot(order.accountId)
  const fulfillment = {
    productCode: product.productCode,
    productType: product.productType,
    grantedVoiceSeconds: 0,
    grantedAiTokens: 0,
    subscriptionApplied: null,
    usageGrantTraceIds: []
  }

  if (product.productType === 'subscription') {
    const subscriptionResult = await ensureSubscriptionApplied(order.accountId, order, product, paidAt, now)
    fulfillment.subscriptionApplied = subscriptionResult
    fulfillment.grantedVoiceSeconds = toNumber(subscriptionResult.grantedVoiceSeconds, 0)
    fulfillment.grantedAiTokens = toNumber(subscriptionResult.grantedAiTokens, 0)
  }

  if (product.productType === 'voice_pack') {
    const grantResult = await ensureGrantLedger(
      order.accountId,
      'voice_seconds',
      toNumber(product.includedVoiceSeconds, 0),
      'grant',
      orderId,
      entitlements.voiceSecondsRemaining,
      paidAt,
      {
        orderId,
        productCode: product.productCode,
        actionType: 'add_voice'
      }
    )
    fulfillment.grantedVoiceSeconds = toNumber(product.includedVoiceSeconds, 0)
    fulfillment.usageGrantTraceIds.push(grantResult.traceId)
  }

  if (product.productType === 'ai_pack') {
    const grantResult = await ensureGrantLedger(
      order.accountId,
      'ai_tokens',
      toNumber(product.includedAiTokens, 0),
      'grant',
      orderId,
      entitlements.aiTokensRemaining,
      paidAt,
      {
        orderId,
        productCode: product.productCode,
        actionType: 'add_ai'
      }
    )
    fulfillment.grantedAiTokens = toNumber(product.includedAiTokens, 0)
    fulfillment.usageGrantTraceIds.push(grantResult.traceId)
  }

  const paymentTransactionResult = await ensurePaymentTransactionSuccess(order.accountId, orderId, {
    ...event,
    operatorId: config.operatorId
  }, paidAt, now)

  await syncAccountAccessSnapshot(account, now)

  await db.collection('orders').where({
    orderId
  }).update({
    data: {
      status: 'paid',
      paidAt,
      updatedAt: now,
      fulfillmentStatus: 'applied',
      fulfillmentAppliedAt: now,
      fulfillmentSnapshot: fulfillment,
      paymentEnabled: false
    }
  })

  const updatedOrder = {
    ...order,
    status: 'paid',
    paidAt,
    updatedAt: now,
    fulfillmentStatus: 'applied',
    fulfillmentAppliedAt: now,
    fulfillmentSnapshot: fulfillment
  }

  await appendAuditLog(
    config.operatorId,
    product.productType === 'voice_pack'
      ? 'add_voice'
      : (product.productType === 'ai_pack' ? 'add_ai' : 'grant_plan'),
    'order',
    orderId,
    beforeSnapshot,
    {
      ...buildOrderSummary(updatedOrder),
      fulfillment
    },
    event.reason || 'mark billing order paid',
    now
  )

  return {
    ok: true,
    reused: false,
    paymentTransaction: paymentTransactionResult,
    order: buildOrderSummary(updatedOrder),
    fulfillment,
    accessSnapshot: await getEntitlementsSnapshot(order.accountId)
  }
}
