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

function normalizeAction(value) {
  const current = toText(value)
  return ['accept', 'reject', 'close', 'reward'].includes(current) ? current : ''
}

function formatDateText(value) {
  if (!value) {
    return ''
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
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
    throw new Error('BILLING_OPERATOR_FORBIDDEN: 当前无权处理反馈')
  }
  return config
}

function getStatusMeta(action) {
  if (action === 'accept') {
    return { status: 'accepted', statusLabel: '已采纳' }
  }
  if (action === 'reject') {
    return { status: 'rejected', statusLabel: '不采纳' }
  }
  if (action === 'close') {
    return { status: 'closed', statusLabel: '已关闭' }
  }
  return { status: 'rewarded', statusLabel: '已发奖' }
}

function buildFeedbackSummary(record = {}) {
  return {
    feedbackId: toText(record._id || record.feedbackId),
    openid: toText(record._openid || record.openid),
    accountId: toText(record.accountId),
    phoneMasked: toText(record.phoneMasked),
    displayName: toText(record.displayName),
    type: toText(record.type),
    typeLabel: toText(record.typeLabel || record.type),
    scene: toText(record.scene),
    sceneLabel: toText(record.sceneLabel || record.scene),
    content: toText(record.content),
    contact: toText(record.contact),
    allowContact: record.allowContact !== false,
    status: toText(record.status || 'pending'),
    statusLabel: toText(record.statusLabel || '待处理'),
    rewardAiTokens: Math.max(0, Number(record.rewardAiTokens) || 0),
    adminNote: toText(record.adminNote),
    clientInfo: record.clientInfo && typeof record.clientInfo === 'object' ? record.clientInfo : {},
    createdAt: formatDateText(record.createdAt),
    updatedAt: formatDateText(record.updatedAt),
    handledAt: formatDateText(record.handledAt),
    rewardedAt: formatDateText(record.rewardedAt)
  }
}

function buildFeedbackSnapshot(record = {}) {
  return {
    feedbackId: toText(record._id || record.feedbackId),
    accountId: toText(record.accountId),
    status: toText(record.status || 'pending'),
    statusLabel: toText(record.statusLabel || '待处理'),
    rewardAiTokens: Math.max(0, Number(record.rewardAiTokens) || 0),
    adminNote: toText(record.adminNote)
  }
}

async function appendAuditLog(operatorId, actionType, targetId, beforeSnapshot, afterSnapshot, reason, now) {
  try {
    await db.collection('adminAuditLogs').add({
      data: {
        operatorId,
        actionType,
        targetType: 'feedback',
        targetId,
        beforeSnapshot,
        afterSnapshot,
        reason: toText(reason),
        createdAt: now
      }
    })
  } catch (error) {
    // Feedback handling should not fail only because audit logs are unavailable.
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
    return entitlements
  }

  await db.collection('entitlements').add({
    data: {
      accountId,
      ...patch,
      createdAt: now,
      updatedAt: now
    }
  })
  return {}
}

async function ensureGrantLedger(accountId, feedbackId, amount, beforeBalance, occurredAt, meta = {}) {
  const traceId = `feedback:${feedbackId}:ai_tokens:reward`
  const existing = await safeGetOne('usageLedger', {
    traceId
  })
  if (existing) {
    return { reused: true, traceId }
  }

  const before = Math.max(0, toNumber(beforeBalance, 0))
  const after = Math.max(0, before + amount)
  await db.collection('usageLedger').add({
    data: {
      accountId,
      usageType: 'ai_tokens',
      sourceType: 'feedback_reward',
      sourceId: feedbackId,
      delta: amount,
      unit: 'token',
      beforeBalance: before,
      afterBalance: after,
      traceId,
      meta,
      occurredAt
    }
  })

  return { reused: false, traceId }
}

async function createRewardNotification(feedback, amount, now) {
  try {
    const openid = toText(feedback._openid || feedback.openid)
    if (!openid) {
      return
    }

    const feedbackId = toText(feedback._id || feedback.feedbackId)
    const dedupeKey = `feedback_rewarded:${feedbackId}`
    const existing = await safeGetOne('notifications', {
      dedupeKey
    })
    if (existing) {
      return
    }

    await db.collection('notifications').add({
      data: {
        _openid: openid,
        recipientOpenid: openid,
        type: 'feedback_rewarded',
        level: 'success',
        status: 'unread',
        title: '反馈已被采纳',
        summary: `平台已为你发放 ${amount.toLocaleString()} AI 额度奖励。`,
        projectId: '',
        projectName: '',
        actionUrl: '/pages/entitlements/entitlements',
        actionLabel: '查看额度',
        bizDate: now,
        dedupeKey,
        extra: {
          feedbackId,
          rewardAiTokens: amount
        },
        notifyTime: now,
        isSent: false,
        createdAt: now,
        updatedAt: now
      }
    })
  } catch (error) {
    // Reward granting should still succeed if the notification collection is not ready.
  }
}

exports.main = async (event = {}) => {
  const operatorConfig = await ensureOperatorAuthorized(event.operatorKey)
  const feedbackId = toText(event.feedbackId)
  const action = normalizeAction(event.action)
  const adminNote = toText(event.adminNote)
  const now = new Date()

  if (!feedbackId) {
    throw new Error('FEEDBACK_NOT_FOUND: 缺少反馈记录')
  }
  if (!action) {
    throw new Error('FEEDBACK_ACTION_INVALID: 当前反馈处理动作无效')
  }

  const feedback = await safeGetOne('feedback', {
    _id: feedbackId
  })
  if (!feedback || !feedback._id) {
    throw new Error('FEEDBACK_NOT_FOUND: 当前反馈记录不存在')
  }

  const beforeSnapshot = buildFeedbackSnapshot(feedback)
  const statusMeta = getStatusMeta(action)
  const patch = {
    ...statusMeta,
    adminNote,
    handledAt: now,
    updatedAt: now
  }
  let rewardAiTokens = Math.max(0, Math.floor(toNumber(feedback.rewardAiTokens, 0)))

  if (action === 'reward') {
    const accountId = toText(feedback.accountId)
    if (!accountId) {
      throw new Error('ACCOUNT_NOT_INITIALIZED: 当前反馈缺少账户 ID，无法发放 AI 额度')
    }

    const requestedAmount = Math.max(1, Math.floor(toNumber(event.rewardAiTokens, 1000000)))
    const entitlements = await safeGetOne('entitlements', {
      accountId
    }) || {}
    const alreadyRewarded = toText(feedback.status) === 'rewarded' && toNumber(feedback.rewardAiTokens, 0) > 0

    if (alreadyRewarded) {
      rewardAiTokens = Math.max(1, Math.floor(toNumber(feedback.rewardAiTokens, requestedAmount)))
    } else {
      const ledgerResult = await ensureGrantLedger(accountId, feedbackId, requestedAmount, entitlements.aiTokensRemaining, now, {
        operatorId: operatorConfig.operatorId,
        reason: adminNote || '反馈被采纳，发放 AI 额度奖励'
      })
      if (!ledgerResult.reused) {
        await upsertEntitlements(accountId, {
          aiTokensTotal: Math.max(0, toNumber(entitlements.aiTokensTotal, 0) + requestedAmount),
          aiTokensRemaining: Math.max(0, toNumber(entitlements.aiTokensRemaining, 0) + requestedAmount),
          canUseAi: true,
          reasonSummary: ''
        }, now)
      }
      await createRewardNotification(feedback, requestedAmount, now)
      rewardAiTokens = requestedAmount
    }

    patch.rewardAiTokens = rewardAiTokens
    patch.rewardedAt = feedback.rewardedAt || now
  }

  await db.collection('feedback').doc(feedback._id).update({
    data: patch
  })

  const updatedFeedback = await safeGetOne('feedback', {
    _id: feedbackId
  }) || {
    ...feedback,
    ...patch
  }
  const afterSnapshot = buildFeedbackSnapshot(updatedFeedback)

  await appendAuditLog(
    operatorConfig.operatorId,
    `feedback_${action}`,
    feedbackId,
    beforeSnapshot,
    afterSnapshot,
    adminNote || statusMeta.statusLabel,
    now
  )

  return {
    ok: true,
    operatorId: operatorConfig.operatorId,
    action,
    feedback: buildFeedbackSummary(updatedFeedback),
    beforeSnapshot,
    afterSnapshot,
    source: 'CloudBase'
  }
}
