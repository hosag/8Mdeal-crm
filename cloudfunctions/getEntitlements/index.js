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
const AI_MODEL_ROUTING_FLAG_KEY = 'ai_model_routing_v1'

function toText(value) {
  return String(value || '').trim()
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

function normalizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeNumber(value, fallback) {
  const current = Number(value)
  return Number.isFinite(current) ? current : fallback
}

function buildDefaultEntitlements() {
  return {
    status: 'trialing',
    aiQuotaPolicy: 'local_quota',
    bindRequiredForWrite: false,
    canCreateProject: true,
    canEditProject: true,
    canSaveFollowUp: true,
    canCreateTask: true,
    canUseQuickEntry: true,
    canUseSpeechToText: true,
    canUseAi: true,
    canShareOut: true,
    projectLimit: DEFAULT_TRIAL_POLICY.freeProjectLimit,
    currentProjectCount: 0,
    voiceSecondsTotal: DEFAULT_TRIAL_POLICY.trialVoiceSeconds,
    voiceSecondsUsed: 0,
    voiceSecondsRemaining: DEFAULT_TRIAL_POLICY.trialVoiceSeconds,
    aiTokensTotal: DEFAULT_TRIAL_POLICY.trialAiTokens,
    aiTokensUsed: 0,
    aiTokensRemaining: DEFAULT_TRIAL_POLICY.trialAiTokens,
    effectiveFrom: '',
    effectiveTo: '',
    reasonSummary: ''
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

async function safeCount(collectionName, query) {
  try {
    const result = await db.collection(collectionName).where(query).count()
    return Number(result.total || 0)
  } catch (error) {
    return 0
  }
}

async function safeGetList(collectionName, query, options = {}) {
  try {
    let request = db.collection(collectionName).where(query)
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

async function countVisibleProjectsForAccount(accountId, openid) {
  const openids = Array.from(new Set(
    [String(openid || '').trim()]
      .concat(await resolveAccountOpenids(accountId))
      .filter(Boolean)
  ))

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

async function loadRecentUsage(accountId, limit = 12) {
  try {
    const result = await db.collection('usageLedger').where({
      accountId
    }).orderBy('occurredAt', 'desc').limit(limit).get()
    return (Array.isArray(result.data) ? result.data : []).map((item) => ({
      recordId: toText(item && item._id),
      usageType: toText(item && item.usageType),
      sourceType: toText(item && item.sourceType),
      sourceId: toText(item && item.sourceId),
      delta: normalizeNumber(item && item.delta, 0),
      unit: toText(item && item.unit),
      beforeBalance: normalizeNumber(item && item.beforeBalance, 0),
      afterBalance: normalizeNumber(item && item.afterBalance, 0),
      traceId: toText(item && item.traceId),
      occurredAt: toDate(item && item.occurredAt) ? toDate(item && item.occurredAt).toISOString() : '',
      meta: item && item.meta && typeof item.meta === 'object' ? item.meta : {}
    }))
  } catch (error) {
    return []
  }
}

async function loadTrialPolicy() {
  const flag = await safeGetOne('featureFlags', {
    flagKey: 'trial_policy_v1'
  })

  const payload = flag && flag.payload && typeof flag.payload === 'object' ? flag.payload : {}
  return {
    trialDays: normalizeNumber(payload.trialDays, DEFAULT_TRIAL_POLICY.trialDays),
    freeProjectLimit: normalizeNumber(payload.freeProjectLimit, DEFAULT_TRIAL_POLICY.freeProjectLimit),
    trialVoiceSeconds: normalizeNumber(payload.trialVoiceSeconds, DEFAULT_TRIAL_POLICY.trialVoiceSeconds),
    trialAiTokens: normalizeNumber(payload.trialAiTokens, DEFAULT_TRIAL_POLICY.trialAiTokens),
    readonlyAfterTrial: normalizeBoolean(payload.readonlyAfterTrial, DEFAULT_TRIAL_POLICY.readonlyAfterTrial),
    writeRequiresPhoneBinding: normalizeBoolean(payload.writeRequiresPhoneBinding, DEFAULT_TRIAL_POLICY.writeRequiresPhoneBinding)
  }
}

async function loadAiQuotaPolicy() {
  const flag = await safeGetOne('featureFlags', {
    flagKey: AI_MODEL_ROUTING_FLAG_KEY
  })
  const payload = flag && flag.payload && typeof flag.payload === 'object' ? flag.payload : {}
  return toText(payload.quotaPolicy) === 'provider_plan' ? 'provider_plan' : 'local_quota'
}

function buildReasonSummary(status, bindRequiredForWrite, projectCount, projectLimit, voiceSecondsRemaining, aiTokensRemaining, aiQuotaPolicy) {
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

  if (aiQuotaPolicy !== 'provider_plan' && aiTokensRemaining <= 0) {
    return '当前 AI 额度已用完'
  }

  return ''
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = String(wxContext.OPENID || '').trim()

  if (!openid) {
    throw new Error('无法解析当前微信身份，请稍后重试')
  }

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

  const trialPolicy = await loadTrialPolicy()
  const aiQuotaPolicy = await loadAiQuotaPolicy()
  const activeSubscription = await safeGetOne('subscriptions', {
    accountId: identity.accountId,
    status: 'active'
  }, {
    orderByField: 'expiresAt',
    orderByDirection: 'desc'
  })
  const latestSubscription = activeSubscription || await safeGetOne('subscriptions', {
    accountId: identity.accountId
  }, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc'
  })

  const now = new Date()
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

  const currentProjectCount = await countVisibleProjectsForAccount(identity.accountId, openid)

  const voiceUsageSummary = await safeUsageSummary(identity.accountId, 'voice_seconds')
  const aiUsageSummary = await safeUsageSummary(identity.accountId, 'ai_tokens')

  const defaultEntitlements = buildDefaultEntitlements()
  const voiceSecondsBaseTotal = hasActiveSubscription
    ? normalizeNumber(activeSubscription.grantedVoiceSeconds, defaultEntitlements.voiceSecondsTotal)
    : (status === 'trialing' ? trialPolicy.trialVoiceSeconds : 0)
  const aiTokensBaseTotal = hasActiveSubscription
    ? normalizeNumber(activeSubscription.grantedAiTokens, defaultEntitlements.aiTokensTotal)
    : (status === 'trialing' ? trialPolicy.trialAiTokens : 0)
  const voiceSecondsTotal = Math.max(0, voiceSecondsBaseTotal + Number(voiceUsageSummary.granted || 0))
  const aiTokensTotal = Math.max(0, aiTokensBaseTotal + Number(aiUsageSummary.granted || 0))

  const voiceSecondsUsed = Math.max(0, Number(voiceUsageSummary.consumed || 0))
  const aiTokensUsed = Math.max(0, Number(aiUsageSummary.consumed || 0))
  const voiceSecondsRemaining = Math.max(0, voiceSecondsTotal - voiceSecondsUsed)
  const aiTokensRemaining = Math.max(0, aiTokensTotal - aiTokensUsed)

  const projectLimit = hasActiveSubscription
    ? normalizeNumber(activeSubscription.projectLimit, -1)
    : trialPolicy.freeProjectLimit
  const bindRequiredForWrite = trialPolicy.writeRequiresPhoneBinding && !account.phoneVerified

  const baseWritable = status === 'trialing' || status === 'active_paid'
  const canCreateProject = baseWritable && (projectLimit < 0 || currentProjectCount < projectLimit)
  const canEditProject = baseWritable
  const canSaveFollowUp = baseWritable
  const canCreateTask = baseWritable
  const canUseQuickEntry = baseWritable
  const canUseSpeechToText = baseWritable && voiceSecondsRemaining > 0
  const canUseAi = baseWritable && (aiQuotaPolicy === 'provider_plan' || aiTokensRemaining > 0)
  const canShareOut = baseWritable
  const reasonSummary = buildReasonSummary(
    status,
    bindRequiredForWrite,
    currentProjectCount,
    projectLimit,
    voiceSecondsRemaining,
    aiTokensRemaining,
    aiQuotaPolicy
  )

  const summary = {
    accountId: identity.accountId,
    status,
    currentAccessLevel,
    aiQuotaPolicy,
    bindRequiredForWrite,
    phoneVerified: Boolean(account.phoneVerified),
    canCreateProject,
    canEditProject,
    canSaveFollowUp,
    canCreateTask,
    canUseQuickEntry,
    canUseSpeechToText,
    canUseAi,
    canShareOut,
    projectLimit,
    currentProjectCount,
    voiceSecondsTotal,
    voiceSecondsUsed,
    voiceSecondsRemaining,
    aiTokensTotal,
    aiTokensUsed,
    aiTokensRemaining,
    recentUsage: await loadRecentUsage(identity.accountId),
    effectiveFrom: hasActiveSubscription && activeSubscription.startedAt
      ? new Date(activeSubscription.startedAt).toISOString()
      : '',
    effectiveTo: hasActiveSubscription && activeSubscription.expiresAt
      ? new Date(activeSubscription.expiresAt).toISOString()
      : (trialEndsAt ? trialEndsAt.toISOString() : ''),
    reasonSummary
  }

  const entitlementsCollection = db.collection('entitlements')
  const existingEntitlements = await safeGetOne('entitlements', {
    accountId: identity.accountId
  })

  if (existingEntitlements && existingEntitlements._id) {
    await entitlementsCollection.doc(existingEntitlements._id).update({
      data: {
        ...summary,
        updatedAt: now
      }
    })
  } else {
    try {
      await entitlementsCollection.add({
        data: {
          ...summary,
          updatedAt: now
        }
      })
    } catch (error) {
      // Keep the response available even when the collection is not ready yet.
    }
  }

  if (account._id) {
    await db.collection('accounts').doc(account._id).update({
      data: {
        status,
        currentAccessLevel,
        updatedAt: now
      }
    })
  }

  return {
    ok: true,
    ...summary
  }
}
