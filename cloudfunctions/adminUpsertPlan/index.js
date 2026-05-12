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

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizePlanType(value) {
  const current = toText(value)
  return ['trial', 'subscription', 'voice_pack', 'ai_pack'].includes(current) ? current : 'subscription'
}

function normalizeBillingCycle(value) {
  const current = toText(value)
  return ['trial', 'monthly', 'yearly', 'one_time'].includes(current) ? current : 'monthly'
}

function normalizeFeatureLines(value) {
  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean)
  }

  const text = toText(value)
  if (!text) {
    return []
  }

  return text.split('\n').map((item) => toText(item)).filter(Boolean)
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
    throw new Error('BILLING_OPERATOR_FORBIDDEN: 当前无权维护商品目录')
  }

  return config
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
    // Keep catalog writes available even if audit logs are not deployed yet.
  }
}

function buildPlanSnapshot(plan = {}) {
  return {
    planCode: toText(plan.planCode || plan.productCode),
    planName: toText(plan.planName || plan.productName),
    planType: toText(plan.planType || plan.productType),
    billingCycle: toText(plan.billingCycle),
    price: toNumber(plan.price, 0),
    originalPrice: toNumber(plan.originalPrice, 0),
    isPricePending: toBoolean(plan.isPricePending, false),
    displayPriceText: toText(plan.displayPriceText || plan.priceLabel),
    displayBillingText: toText(plan.displayBillingText),
    projectLimit: toNumber(plan.projectLimit, -1),
    monthlyVoiceSeconds: toNumber(plan.monthlyVoiceSeconds || plan.includedVoiceSeconds, 0),
    monthlyAiTokens: toNumber(plan.monthlyAiTokens || plan.includedAiTokens, 0),
    summary: toText(plan.summary),
    featureLines: toArray(plan.featureLines).map((item) => toText(item)).filter(Boolean),
    supportsShareOut: toBoolean(plan.supportsShareOut, false),
    supportsQuickEntry: toBoolean(plan.supportsQuickEntry, false),
    supportsAi: toBoolean(plan.supportsAi, false),
    supportsSpeechToText: toBoolean(plan.supportsSpeechToText, false),
    trialEligible: toBoolean(plan.trialEligible, false),
    enabled: toBoolean(plan.enabled, true),
    sortOrder: toNumber(plan.sortOrder, 0)
  }
}

function buildPlanWriteData(event = {}, existingPlan = {}) {
  const planCode = toText(event.planCode || existingPlan.planCode || existingPlan.productCode)
  const planType = normalizePlanType(event.planType || existingPlan.planType || existingPlan.productType)
  const billingCycle = normalizeBillingCycle(event.billingCycle || existingPlan.billingCycle)
  const featureLines = normalizeFeatureLines(
    Array.isArray(event.featureLines) || toText(event.featureLines)
      ? event.featureLines
      : existingPlan.featureLines
  )

  return {
    planCode,
    productCode: planCode,
    planName: toText(event.planName || event.productName || existingPlan.planName || existingPlan.productName),
    productName: toText(event.planName || event.productName || existingPlan.planName || existingPlan.productName),
    planType,
    productType: planType,
    billingCycle,
    price: Math.max(0, Math.floor(toNumber(event.price, existingPlan.price))),
    originalPrice: Math.max(0, Math.floor(toNumber(event.originalPrice, existingPlan.originalPrice))),
    isPricePending: toBoolean(event.isPricePending, toBoolean(existingPlan.isPricePending, false)),
    displayPriceText: toText(event.displayPriceText || event.priceLabel || existingPlan.displayPriceText || existingPlan.priceLabel),
    priceLabel: toText(event.displayPriceText || event.priceLabel || existingPlan.displayPriceText || existingPlan.priceLabel),
    displayBillingText: toText(event.displayBillingText || existingPlan.displayBillingText),
    summary: toText(event.summary || existingPlan.summary),
    featureLines,
    projectLimit: Math.floor(toNumber(event.projectLimit, toNumber(existingPlan.projectLimit, -1))),
    monthlyVoiceSeconds: Math.max(0, Math.floor(toNumber(event.monthlyVoiceSeconds, toNumber(existingPlan.monthlyVoiceSeconds || existingPlan.includedVoiceSeconds, 0)))),
    includedVoiceSeconds: Math.max(0, Math.floor(toNumber(event.monthlyVoiceSeconds, toNumber(existingPlan.monthlyVoiceSeconds || existingPlan.includedVoiceSeconds, 0)))),
    monthlyAiTokens: Math.max(0, Math.floor(toNumber(event.monthlyAiTokens, toNumber(existingPlan.monthlyAiTokens || existingPlan.includedAiTokens, 0)))),
    includedAiTokens: Math.max(0, Math.floor(toNumber(event.monthlyAiTokens, toNumber(existingPlan.monthlyAiTokens || existingPlan.includedAiTokens, 0)))),
    supportsShareOut: toBoolean(event.supportsShareOut, toBoolean(existingPlan.supportsShareOut, false)),
    supportsQuickEntry: toBoolean(event.supportsQuickEntry, toBoolean(existingPlan.supportsQuickEntry, false)),
    supportsAi: toBoolean(event.supportsAi, toBoolean(existingPlan.supportsAi, false)),
    supportsSpeechToText: toBoolean(event.supportsSpeechToText, toBoolean(existingPlan.supportsSpeechToText, false)),
    trialEligible: toBoolean(event.trialEligible, toBoolean(existingPlan.trialEligible, false)),
    enabled: toBoolean(event.enabled, toBoolean(existingPlan.enabled, true)),
    sortOrder: Math.floor(toNumber(event.sortOrder, toNumber(existingPlan.sortOrder, 0)))
  }
}

exports.main = async (event = {}) => {
  const operatorConfig = await ensureOperatorAuthorized(event.operatorKey)
  const planCode = toText(event.planCode)
  const reason = toText(event.reason)
  const now = new Date()

  if (!planCode) {
    throw new Error('PLAN_CODE_REQUIRED: 缺少商品编码，无法保存')
  }

  let plan = await safeGetOne('plans', {
    planCode
  })

  if (!plan) {
    plan = await safeGetOne('plans', {
      productCode: planCode
    })
  }

  const beforeSnapshot = plan ? buildPlanSnapshot(plan) : {}
  const nextPlan = buildPlanWriteData(event, plan || {})

  if (!nextPlan.planName) {
    throw new Error('PLAN_NAME_REQUIRED: 缺少商品名称，无法保存')
  }

  const writeData = {
    ...nextPlan,
    updatedAt: now
  }

  if (plan && plan._id) {
    await db.collection('plans').doc(plan._id).update({
      data: writeData
    })
  } else {
    await db.collection('plans').add({
      data: {
        ...writeData,
        createdAt: now
      }
    })
  }

  const savedPlan = await safeGetOne('plans', {
    planCode
  }) || {
    ...writeData
  }
  const afterSnapshot = buildPlanSnapshot(savedPlan)

  await appendAuditLog(
    operatorConfig.operatorId,
    'upsert_plan',
    'plan',
    planCode,
    beforeSnapshot,
    afterSnapshot,
    reason || '后台维护商品目录',
    now
  )

  return {
    ok: true,
    operatorId: operatorConfig.operatorId,
    action: plan && plan._id ? 'updated' : 'created',
    plan: afterSnapshot
  }
}
