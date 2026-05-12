const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const DEFAULT_TRIAL_POLICY = {
  readonlyAfterTrial: true
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

function addDays(source, days) {
  const base = source instanceof Date ? new Date(source.getTime()) : new Date(source)
  if (Number.isNaN(base.getTime())) {
    return null
  }

  base.setDate(base.getDate() + Math.max(0, Math.floor(toNumber(days, 0))))
  return base
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

function normalizeAction(value) {
  const current = toText(value)
  const supported = [
    'add_voice',
    'add_ai',
    'extend_trial',
    'disable_account',
    'enable_account',
    'grant_subscription',
    'expire_subscription'
  ]
  return supported.includes(current) ? current : ''
}

function normalizeBillingCycle(value) {
  const current = toText(value)
  if (current === 'yearly') {
    return 'yearly'
  }

  return 'monthly'
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
    throw new Error('BILLING_OPERATOR_FORBIDDEN: 当前无权执行后台权益操作')
  }

  return config
}

async function loadTrialPolicy() {
  const flag = await safeGetOne('featureFlags', {
    flagKey: 'trial_policy_v1'
  })
  const payload = flag && flag.payload && typeof flag.payload === 'object' ? flag.payload : {}
  return {
    readonlyAfterTrial: toBoolean(payload.readonlyAfterTrial, DEFAULT_TRIAL_POLICY.readonlyAfterTrial)
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
    // Keep entitlement updates available even if audit logs are not deployed yet.
  }
}

async function ensureGrantLedger(accountId, usageType, delta, sourceId, beforeBalance, occurredAt, meta = {}) {
  const traceId = `${sourceId}:${usageType}:grant`
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
      sourceType: 'admin_console',
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

async function resolveAccount(accountId) {
  const account = await safeGetOne('accounts', {
    accountId
  })

  if (!account || !account._id) {
    throw new Error('ACCOUNT_NOT_INITIALIZED: 当前账号尚未初始化，请稍后重试')
  }

  return account
}

async function resolveActiveSubscription(accountId) {
  return safeGetOne('subscriptions', {
    accountId,
    status: 'active'
  }, {
    orderByField: 'expiresAt',
    orderByDirection: 'desc'
  })
}

async function resolveRestoredAccountState(accountId, account, activeSubscription, now) {
  const trialPolicy = await loadTrialPolicy()
  const subscriptionExpiresAt = toDate(activeSubscription && activeSubscription.expiresAt)
  const trialEndsAt = toDate(account && account.trialEndsAt)
  const latestSubscription = activeSubscription || await safeGetOne('subscriptions', {
    accountId
  }, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc'
  })

  if (subscriptionExpiresAt && subscriptionExpiresAt.getTime() > now.getTime()) {
    return {
      status: 'active_paid',
      currentAccessLevel: 'paid_active'
    }
  }

  if (trialEndsAt && trialEndsAt.getTime() > now.getTime()) {
    return {
      status: 'trialing',
      currentAccessLevel: 'trial_full'
    }
  }

  if (latestSubscription) {
    return {
      status: 'expired_readonly',
      currentAccessLevel: 'paid_readonly'
    }
  }

  if (trialPolicy.readonlyAfterTrial) {
    return {
      status: 'free_limited',
      currentAccessLevel: 'free_readonly'
    }
  }

  return {
    status: 'trialing',
    currentAccessLevel: 'trial_full'
  }
}

function buildAccountSnapshot(account = {}, entitlements = {}, subscription = null) {
  return {
    accountId: toText(account.accountId),
    status: toText(account.status),
    currentAccessLevel: toText(account.currentAccessLevel),
    trialEndsAt: account.trialEndsAt ? new Date(account.trialEndsAt).toISOString() : '',
    phoneVerified: toBoolean(account.phoneVerified),
    voiceSecondsRemaining: toNumber(entitlements.voiceSecondsRemaining, 0),
    aiTokensRemaining: toNumber(entitlements.aiTokensRemaining, 0),
    entitlementsStatus: toText(entitlements.status),
    subscription: subscription ? {
      planCode: toText(subscription.planCode),
      planName: toText(subscription.planName),
      status: toText(subscription.status),
      expiresAt: subscription.expiresAt ? new Date(subscription.expiresAt).toISOString() : '',
      grantedVoiceSeconds: toNumber(subscription.grantedVoiceSeconds, 0),
      grantedAiTokens: toNumber(subscription.grantedAiTokens, 0),
      projectLimit: toNumber(subscription.projectLimit, -1)
    } : null
  }
}

exports.main = async (event = {}) => {
  const operatorConfig = await ensureOperatorAuthorized(event.operatorKey)
  const accountId = toText(event.accountId)
  const action = normalizeAction(event.action)
  const reason = toText(event.reason)
  const now = new Date()

  if (!accountId) {
    throw new Error('ACCOUNT_NOT_INITIALIZED: 当前账号尚未初始化，请稍后重试')
  }

  if (!action) {
    throw new Error('ENTITLEMENT_WRITE_DISABLED: 当前后台操作类型无效')
  }

  const account = await resolveAccount(accountId)
  const entitlements = await safeGetOne('entitlements', {
    accountId
  }) || {}
  const activeSubscription = await resolveActiveSubscription(accountId)
  const beforeSnapshot = buildAccountSnapshot(account, entitlements, activeSubscription)

  if (action === 'add_voice') {
    const amount = Math.max(1, Math.floor(toNumber(event.amount, 0)))
    const sourceId = `admin:${accountId}:voice:${Date.now()}`
    await ensureGrantLedger(accountId, 'voice_seconds', amount, sourceId, entitlements.voiceSecondsRemaining, now, {
      operatorId: operatorConfig.operatorId,
      reason
    })
    await upsertEntitlements(accountId, {
      voiceSecondsTotal: Math.max(0, toNumber(entitlements.voiceSecondsTotal, 0) + amount),
      voiceSecondsRemaining: Math.max(0, toNumber(entitlements.voiceSecondsRemaining, 0) + amount),
      canUseSpeechToText: true,
      reasonSummary: ''
    }, now)
  }

  if (action === 'add_ai') {
    const amount = Math.max(1, Math.floor(toNumber(event.amount, 0)))
    const sourceId = `admin:${accountId}:ai:${Date.now()}`
    await ensureGrantLedger(accountId, 'ai_tokens', amount, sourceId, entitlements.aiTokensRemaining, now, {
      operatorId: operatorConfig.operatorId,
      reason
    })
    await upsertEntitlements(accountId, {
      aiTokensTotal: Math.max(0, toNumber(entitlements.aiTokensTotal, 0) + amount),
      aiTokensRemaining: Math.max(0, toNumber(entitlements.aiTokensRemaining, 0) + amount),
      canUseAi: true,
      reasonSummary: ''
    }, now)
  }

  if (action === 'extend_trial') {
    const days = Math.max(1, Math.floor(toNumber(event.days, 0)))
    const currentTrialEndsAt = account.trialEndsAt ? new Date(account.trialEndsAt) : now
    const baseDate = Number.isNaN(currentTrialEndsAt.getTime()) || currentTrialEndsAt.getTime() < now.getTime()
      ? now
      : currentTrialEndsAt
    const nextTrialEndsAt = addDays(baseDate, days)

    await db.collection('accounts').doc(account._id).update({
      data: {
        status: account.status === 'disabled' ? account.status : 'trialing',
        currentAccessLevel: account.status === 'disabled' ? account.currentAccessLevel : 'trial_full',
        trialEndsAt: nextTrialEndsAt,
        updatedAt: now
      }
    })

    const disabledStatus = account.status === 'disabled'
    await upsertEntitlements(accountId, {
      status: disabledStatus ? 'disabled' : 'trialing',
      currentAccessLevel: disabledStatus ? 'disabled' : 'trial_full',
      effectiveTo: nextTrialEndsAt ? nextTrialEndsAt.toISOString() : '',
      reasonSummary: disabledStatus ? '当前账号已被后台禁用' : '',
      canCreateProject: !disabledStatus,
      canEditProject: !disabledStatus,
      canSaveFollowUp: !disabledStatus,
      canCreateTask: !disabledStatus,
      canUseQuickEntry: !disabledStatus,
      canUseSpeechToText: disabledStatus ? false : toNumber(entitlements.voiceSecondsRemaining, 0) > 0,
      canUseAi: disabledStatus ? false : toNumber(entitlements.aiTokensRemaining, 0) > 0,
      canShareOut: !disabledStatus
    }, now)
  }

  if (action === 'disable_account') {
    await db.collection('accounts').doc(account._id).update({
      data: {
        status: 'disabled',
        currentAccessLevel: 'disabled',
        updatedAt: now
      }
    })

    await upsertEntitlements(accountId, {
      status: 'disabled',
      currentAccessLevel: 'disabled',
      canCreateProject: false,
      canEditProject: false,
      canSaveFollowUp: false,
      canCreateTask: false,
      canUseQuickEntry: false,
      canUseSpeechToText: false,
      canUseAi: false,
      canShareOut: false,
      reasonSummary: '当前账号已被后台禁用'
    }, now)
  }

  if (action === 'enable_account') {
    const restoredState = await resolveRestoredAccountState(accountId, account, activeSubscription, now)
    const writable = restoredState.status === 'trialing' || restoredState.status === 'active_paid'

    await db.collection('accounts').doc(account._id).update({
      data: {
        status: restoredState.status,
        currentAccessLevel: restoredState.currentAccessLevel,
        updatedAt: now
      }
    })

    await upsertEntitlements(accountId, {
      status: restoredState.status,
      currentAccessLevel: restoredState.currentAccessLevel,
      canCreateProject: writable,
      canEditProject: writable,
      canSaveFollowUp: writable,
      canCreateTask: writable,
      canUseQuickEntry: writable,
      canUseSpeechToText: writable && toNumber(entitlements.voiceSecondsRemaining, 0) > 0,
      canUseAi: writable && toNumber(entitlements.aiTokensRemaining, 0) > 0,
      canShareOut: writable,
      reasonSummary: restoredState.status === 'free_limited'
        ? '试用已结束，请开通订阅后继续新增与使用 AI 能力'
        : (restoredState.status === 'expired_readonly' ? '当前订阅已过期，请续费后继续使用完整能力' : '')
    }, now)
  }

  if (action === 'grant_subscription') {
    const billingCycle = normalizeBillingCycle(event.billingCycle)
    const grantedVoiceSeconds = Math.max(0, Math.floor(toNumber(event.grantedVoiceSeconds, 1800)))
    const grantedAiTokens = Math.max(0, Math.floor(toNumber(event.grantedAiTokens, 200000)))
    const projectLimit = toNumber(event.projectLimit, -1)
    const planCode = toText(event.planCode || `manual_${billingCycle}`)
    const planName = toText(event.planName || (billingCycle === 'yearly' ? '后台手动年付订阅' : '后台手动月付订阅'))

    if (activeSubscription && activeSubscription._id) {
      const baseDate = activeSubscription.expiresAt ? new Date(activeSubscription.expiresAt) : now
      const effectiveBase = Number.isNaN(baseDate.getTime()) || baseDate.getTime() < now.getTime() ? now : baseDate
      const nextExpiresAt = event.days
        ? addDays(effectiveBase, Math.max(1, Math.floor(toNumber(event.days, 0))))
        : addCycle(effectiveBase, billingCycle)
      await db.collection('subscriptions').doc(activeSubscription._id).update({
        data: {
          planCode,
          planName,
          status: 'active',
          renewType: 'manual',
          expiresAt: nextExpiresAt,
          grantedVoiceSeconds: Math.max(toNumber(activeSubscription.grantedVoiceSeconds, 0), grantedVoiceSeconds),
          grantedAiTokens: Math.max(toNumber(activeSubscription.grantedAiTokens, 0), grantedAiTokens),
          projectLimit: mergeProjectLimit(activeSubscription.projectLimit, projectLimit),
          updatedAt: now
        }
      })
    } else {
      const startedAt = new Date(now.getTime())
      const expiresAt = event.days
        ? addDays(startedAt, Math.max(1, Math.floor(toNumber(event.days, 0))))
        : addCycle(startedAt, billingCycle)
      await db.collection('subscriptions').add({
        data: {
          accountId,
          planCode,
          planName,
          status: 'active',
          startedAt,
          expiresAt,
          renewType: 'manual',
          sourceOrderId: '',
          grantedVoiceSeconds,
          grantedAiTokens,
          projectLimit,
          createdAt: now,
          updatedAt: now
        }
      })
    }

    await db.collection('accounts').doc(account._id).update({
      data: {
        status: 'active_paid',
        currentAccessLevel: 'paid_active',
        updatedAt: now
      }
    })

    const nextSubscription = await resolveActiveSubscription(accountId)
    await upsertEntitlements(accountId, {
      status: 'active_paid',
      currentAccessLevel: 'paid_active',
      projectLimit: nextSubscription ? toNumber(nextSubscription.projectLimit, -1) : projectLimit,
      voiceSecondsTotal: nextSubscription ? toNumber(nextSubscription.grantedVoiceSeconds, grantedVoiceSeconds) : grantedVoiceSeconds,
      aiTokensTotal: nextSubscription ? toNumber(nextSubscription.grantedAiTokens, grantedAiTokens) : grantedAiTokens,
      canCreateProject: true,
      canEditProject: true,
      canSaveFollowUp: true,
      canCreateTask: true,
      canUseQuickEntry: true,
      canUseSpeechToText: true,
      canUseAi: true,
      canShareOut: true,
      effectiveFrom: nextSubscription && nextSubscription.startedAt ? new Date(nextSubscription.startedAt).toISOString() : now.toISOString(),
      effectiveTo: nextSubscription && nextSubscription.expiresAt ? new Date(nextSubscription.expiresAt).toISOString() : '',
      reasonSummary: ''
    }, now)
  }

  if (action === 'expire_subscription') {
    if (activeSubscription && activeSubscription._id) {
      await db.collection('subscriptions').doc(activeSubscription._id).update({
        data: {
          status: 'expired',
          expiresAt: now,
          updatedAt: now
        }
      })
    }

    await db.collection('accounts').doc(account._id).update({
      data: {
        status: 'expired_readonly',
        currentAccessLevel: 'paid_readonly',
        updatedAt: now
      }
    })

    await upsertEntitlements(accountId, {
      status: 'expired_readonly',
      currentAccessLevel: 'paid_readonly',
      canCreateProject: false,
      canEditProject: false,
      canSaveFollowUp: false,
      canCreateTask: false,
      canUseQuickEntry: false,
      canUseSpeechToText: false,
      canUseAi: false,
      canShareOut: false,
      effectiveTo: now.toISOString(),
      reasonSummary: '当前订阅已被后台设为到期'
    }, now)
  }

  const nextAccount = await resolveAccount(accountId)
  const nextEntitlements = await safeGetOne('entitlements', {
    accountId
  }) || {}
  const nextSubscription = await resolveActiveSubscription(accountId)
  const afterSnapshot = buildAccountSnapshot(nextAccount, nextEntitlements, nextSubscription)

  await appendAuditLog(
    operatorConfig.operatorId,
    action,
    'account',
    accountId,
    beforeSnapshot,
    afterSnapshot,
    reason,
    now
  )

  return {
    ok: true,
    operatorId: operatorConfig.operatorId,
    action,
    accountId,
    beforeSnapshot,
    afterSnapshot,
    source: 'CloudBase'
  }
}
