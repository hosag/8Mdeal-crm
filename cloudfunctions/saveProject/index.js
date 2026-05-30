const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const CONTACT_CRYPTO_SECRET = String(process.env.CONTACT_CRYPTO_SECRET || '').trim()
if (!CONTACT_CRYPTO_SECRET) {
  throw new Error('CONTACT_CRYPTO_SECRET is required')
}
const CONTACT_CRYPTO_PREFIX = 'enc:v1'
const CONTACT_CRYPTO_KEY = crypto.createHash('sha256').update(CONTACT_CRYPTO_SECRET).digest()
const REFERRAL_REWARD_AI_TOKENS = 100000
const PROJECT_ALIAS_BLOCK_WORDS = [
  '项目',
  '客户',
  '方案',
  '报价',
  '合同',
  '合作',
  '跟进',
  '进度',
  '需求',
  '老板',
  '领导',
  '对方',
  '这个项目',
  '那个项目',
  '这单',
  '那单',
  '语音',
  '录音',
  '微信',
  '电话',
  '邮件',
  '面谈',
  '任务',
  '动作',
  '情况',
  '内容',
  '记录',
  '客户那边',
  '对方那边',
  '他们那边',
  '这个客户',
  '那个客户',
  '这个单子',
  '那个单子'
]

function isEncryptedValue(value) {
  return String(value || '').trim().startsWith(`${CONTACT_CRYPTO_PREFIX}:`)
}

function encryptSensitiveValue(value) {
  const text = String(value || '').trim()
  if (!text) {
    return ''
  }

  if (isEncryptedValue(text)) {
    return text
  }

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', CONTACT_CRYPTO_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    CONTACT_CRYPTO_PREFIX,
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64')
  ].join(':')
}

function normalizeNumber(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

function normalizeSilenceDays(value) {
  const days = Math.floor(Number(value) || 0)
  return [0, 7, 14, 30].includes(days) ? days : 0
}

function normalizeText(value) {
  return String(value || '').trim()
}

function isClosedProjectStage(stage) {
  const current = normalizeText(stage)
  return current === '成交' || current === '流失'
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

async function closeOpenProjectTasks(openid, projectId, stage, now) {
  if (!isClosedProjectStage(stage)) {
    return
  }

  const currentStage = normalizeText(stage)
  const reason = currentStage === '成交'
    ? '项目已成交，系统自动取消未完成推进任务'
    : '项目已流失，系统自动取消未完成推进任务'

  try {
    const taskResult = await db.collection('tasks').where({
      _openid: openid,
      projectId,
      status: _.in(['pending', 'in_progress'])
    }).get()
    const tasks = taskResult.data || []

    if (tasks.length) {
      await Promise.all(tasks.map((task) => db.collection('tasks').doc(task._id).update({
        data: {
          status: 'canceled',
          canceledAt: now,
          canceledByOpenid: openid,
          canceledByName: '系统',
          cancelReason: reason,
          canceledReason: reason,
          updatedAt: now
        }
      })))
    }
  } catch (error) {
    // Closing a project should not fail only because the tasks collection is not ready.
  }

  try {
    const notificationResult = await db.collection('notifications').where({
      _openid: openid,
      projectId
    }).get()
    const closableTypes = ['task_due', 'task_overdue', 'task_upcoming', 'todo_due', 'todo_overdue', 'todo_upcoming', 'project_silent']
    const closableItems = (notificationResult.data || []).filter((item) => {
      return closableTypes.includes(normalizeText(item.type)) && normalizeText(item.status) !== 'resolved'
    })

    if (closableItems.length) {
      await Promise.all(closableItems.map((item) => db.collection('notifications').doc(item._id).update({
        data: {
          status: 'resolved',
          readAt: item.readAt || now,
          resolvedAt: now,
          updatedAt: now
        }
      })))
    }
  } catch (error) {
    // Notification cleanup is best-effort and should not block project saving.
  }
}

function buildProjectCountKey(project = {}) {
  return normalizeText(project && project._id)
}

function isTransferredReadonlyProject(project) {
  return project && project.handoverStatus === 'handed_over' && !project.isSharedProject
}

function isAttributionEligibleProject(project) {
  if (!project || isTransferredReadonlyProject(project)) {
    return false
  }
  if (project.isSharedProject || project.importedFromShare || normalizeText(project.sharedFromOpenid) || normalizeText(project.sourceShareRecordId)) {
    return false
  }
  return true
}

async function countOwnedVisibleProjects(accountId, openid) {
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
    openid
      ? safeGetList('projects', {
        _openid: openid
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

  return Object.values(projectMap).filter(isAttributionEligibleProject).length
}

async function upsertReferralRewardEntitlements(accountId, amount, now) {
  const entitlements = await safeGetOne('entitlements', {
    accountId
  }) || {}

  const patch = {
    aiTokensTotal: Math.max(0, normalizeNumber(entitlements.aiTokensTotal) + amount),
    aiTokensRemaining: Math.max(0, normalizeNumber(entitlements.aiTokensRemaining) + amount),
    canUseAi: true,
    reasonSummary: '',
    updatedAt: now
  }

  if (entitlements && entitlements._id) {
    await db.collection('entitlements').doc(entitlements._id).update({
      data: patch
    })
    return {
      beforeBalance: Math.max(0, normalizeNumber(entitlements.aiTokensRemaining)),
      afterBalance: patch.aiTokensRemaining
    }
  }

  await db.collection('entitlements').add({
    data: {
      accountId,
      ...patch,
      createdAt: now
    }
  })
  return {
    beforeBalance: 0,
    afterBalance: amount
  }
}

async function ensureReferralGrantLedger(accountId, relationId, role, amount, beforeBalance, occurredAt, attributionSourceType = '') {
  const traceId = `referral:${relationId}:${role}:ai_tokens:reward`
  const existing = await safeGetOne('usageLedger', {
    traceId
  })
  if (existing) {
    return {
      reused: true,
      traceId
    }
  }

  const before = Math.max(0, normalizeNumber(beforeBalance))
  const after = Math.max(0, before + amount)

  const relationSourceType = normalizeText(attributionSourceType || 'referral_code')

  await db.collection('usageLedger').add({
    data: {
      accountId,
      usageType: 'ai_tokens',
      sourceType: 'referral_reward',
      sourceId: relationId,
      delta: amount,
      unit: 'token',
      beforeBalance: before,
      afterBalance: after,
      traceId,
      meta: {
        relationId,
        role,
        rewardAiTokens: amount,
        attributionSourceType: relationSourceType,
        reason: role === 'referrer'
          ? '传播带来新用户创建首个项目，发放 AI 额度奖励'
          : '通过传播入口创建首个项目，发放 AI 额度奖励'
      },
      occurredAt
    }
  })

  return {
    reused: false,
    traceId
  }
}

async function createReferralRewardNotification(openid, role, amount, relationId, now) {
  if (!openid) {
    return
  }

  try {
    const title = role === 'referrer' ? '推荐奖励已到账' : '新用户奖励已到账'
    const dedupeKey = `referral_rewarded:${relationId}:${role}`
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
        type: 'referral_rewarded',
        level: 'success',
        status: 'unread',
        title,
        summary: `已为你发放 ${amount.toLocaleString()} AI 额度。`,
        projectId: '',
        projectName: '',
        actionUrl: '/pages/entitlements/entitlements',
        actionLabel: '查看额度',
        bizDate: now,
        dedupeKey,
        extra: {
          relationId,
          role,
          rewardAiTokens: amount
        },
        notifyTime: now,
        isSent: false,
        createdAt: now,
        updatedAt: now
      }
    })
  } catch (error) {
    // Reward granting should not depend on the notification collection.
  }
}

async function tryGrantReferralReward(accessContext, openid, projectId, now) {
  try {
    const relation = await safeGetOne('referralRelations', {
      inviteeAccountId: accessContext.accountId,
      status: 'pending'
    }, {
      orderByField: 'createdAt',
      orderByDirection: 'asc'
    })

    if (!relation || !relation._id) {
      return null
    }

    const referrerAccountId = normalizeText(relation.referrerAccountId)
    if (!referrerAccountId || referrerAccountId === accessContext.accountId) {
      await db.collection('referralRelations').doc(relation._id).update({
        data: {
          status: 'blocked',
          blockReason: 'self_referral_or_missing_referrer',
          updatedAt: now
        }
      })
      return {
        ok: false,
        skipped: true,
        reason: 'invalid_relation'
      }
    }

    const projectCount = await countOwnedVisibleProjects(accessContext.accountId, openid)
    if (projectCount > 1) {
      return {
        ok: false,
        skipped: true,
        reason: 'not_first_project',
        projectCount
      }
    }

    const rewardAiTokens = Math.max(1, Math.floor(Number(relation.rewardAiTokens || REFERRAL_REWARD_AI_TOKENS)))
    const referrerEntitlements = await safeGetOne('entitlements', {
      accountId: referrerAccountId
    }) || {}
    const inviteeEntitlements = await safeGetOne('entitlements', {
      accountId: accessContext.accountId
    }) || {}

    const referrerLedger = await ensureReferralGrantLedger(
      referrerAccountId,
      relation._id,
      'referrer',
      rewardAiTokens,
      referrerEntitlements.aiTokensRemaining,
      now,
      relation.sourceType
    )
    if (!referrerLedger.reused) {
      await upsertReferralRewardEntitlements(referrerAccountId, rewardAiTokens, now)
    }

    const inviteeLedger = await ensureReferralGrantLedger(
      accessContext.accountId,
      relation._id,
      'invitee',
      rewardAiTokens,
      inviteeEntitlements.aiTokensRemaining,
      now,
      relation.sourceType
    )
    if (!inviteeLedger.reused) {
      await upsertReferralRewardEntitlements(accessContext.accountId, rewardAiTokens, now)
    }

    await db.collection('referralRelations').doc(relation._id).update({
      data: {
        status: 'rewarded',
        qualifiedAt: now,
        rewardedAt: now,
        qualifiedProjectId: projectId,
        rewardLedgerTraceIds: {
          referrer: referrerLedger.traceId,
          invitee: inviteeLedger.traceId
        },
        updatedAt: now
      }
    })

    await Promise.all([
      createReferralRewardNotification(normalizeText(relation.referrerOpenid), 'referrer', rewardAiTokens, relation._id, now),
      createReferralRewardNotification(openid, 'invitee', rewardAiTokens, relation._id, now)
    ])

    return {
      ok: true,
      rewardAiTokens,
      referrerLedgerTraceId: referrerLedger.traceId,
      inviteeLedgerTraceId: inviteeLedger.traceId
    }
  } catch (error) {
    return {
      ok: false,
      skipped: true,
      reason: 'reward_failed',
      message: error && error.message ? error.message : 'referral reward failed'
    }
  }
}

function normalizeTags(tagsText) {
  if (!tagsText) {
    return []
  }

  return String(tagsText)
    .split(/[，,\/]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeAliasCheckKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_/，,。；;:：、]+/g, '')
}

function isValidAlias(value, reservedTexts = []) {
  const text = String(value || '').trim()
  const key = normalizeAliasCheckKey(text)
  if (!text || text.length < 2 || text.length > 16 || !key) {
    return false
  }

  if (PROJECT_ALIAS_BLOCK_WORDS.indexOf(key) >= 0) {
    return false
  }

  return reservedTexts.every((item) => normalizeAliasCheckKey(item) !== key)
}

function normalizeAliasList(value, reservedTexts = []) {
  const list = Array.isArray(value)
    ? value
    : String(value || '').split(/[\n,，\/；;]+/)
  const seen = new Set()
  const result = []

  list.forEach((item) => {
    const current = String(item || '').trim()
    const currentKey = normalizeAliasCheckKey(current)
    if (!isValidAlias(current, reservedTexts) || seen.has(currentKey)) {
      return
    }

    seen.add(currentKey)
    result.push(current)
  })

  return result.slice(0, 12)
}

function normalizeContacts(contacts) {
  if (!Array.isArray(contacts)) {
    return []
  }

  return contacts
    .map((contact, index) => ({
      contactId: contact.contactId || `contact-${Date.now()}-${index}`,
      name: String(contact.name || '').trim(),
      role: String(contact.role || '').trim(),
      phone: encryptSensitiveValue(contact.phone),
      wechat: encryptSensitiveValue(contact.wechat),
      company: String(contact.company || '').trim()
    }))
    .filter((contact) => contact.name)
}

async function resolveAccountAccessContext(openid) {
  const identityResult = await db.collection('accountIdentities').where({
    provider: 'wechat_mp',
    openid
  }).limit(1).get()
  const identity = identityResult.data[0] || null
  const accountId = normalizeText(identity && identity.accountId)

  if (!accountId) {
    throw new Error('ACCOUNT_NOT_INITIALIZED: 当前账号尚未初始化，请重新进入小程序后再试')
  }

  const accountResult = await db.collection('accounts').where({
    accountId
  }).limit(1).get()
  const entitlementsResult = await db.collection('entitlements').where({
    accountId
  }).limit(1).get()

  return {
    accountId,
    account: accountResult.data[0] || null,
    entitlements: entitlementsResult.data[0] || null
  }
}

function ensureWritableAccess(context, mode) {
  const account = context && context.account ? context.account : {}
  const entitlements = context && context.entitlements ? context.entitlements : {}
  const status = normalizeText(entitlements.status || account.status || 'trialing')

  if (status === 'disabled') {
    throw new Error('ACCOUNT_DISABLED: 当前账号已被禁用')
  }

  if (account.phoneVerified !== true || (entitlements && entitlements.bindRequiredForWrite)) {
    throw new Error('ACCOUNT_PHONE_REQUIRED: 保存正式数据前需要先绑定手机号')
  }

  if (!entitlements || !Object.keys(entitlements).length) {
    if (status === 'free_limited' || status === 'expired_readonly') {
      throw new Error('ENTITLEMENT_WRITE_DISABLED: 当前账号为只读状态')
    }
    return
  }

  if (mode === 'create' && !entitlements.canCreateProject) {
    const projectLimit = Number(entitlements.projectLimit)
    const currentProjectCount = Number(entitlements.currentProjectCount)
    if (projectLimit > -1 && currentProjectCount >= projectLimit) {
      throw new Error('ENTITLEMENT_PROJECT_LIMIT_REACHED: 当前项目数量已达上限')
    }
    throw new Error('ENTITLEMENT_WRITE_DISABLED: 当前账号为只读状态')
  }

  if (mode === 'update' && !entitlements.canEditProject) {
    throw new Error('ENTITLEMENT_WRITE_DISABLED: 当前账号为只读状态')
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const accessContext = await resolveAccountAccessContext(wxContext.OPENID)

  if (!event.projectName || !event.clientName || !event.stage) {
    return {
      ok: false,
      message: 'projectName, clientName and stage are required'
    }
  }

  const now = new Date()
  const reservedAliasTexts = [
    String(event.projectName || '').trim(),
    String(event.clientName || '').trim()
  ]
  const payload = {
    accountId: accessContext.accountId,
    ownerAccountId: accessContext.accountId,
    projectName: String(event.projectName).trim(),
    clientName: String(event.clientName).trim(),
    stage: String(event.stage).trim(),
    estimatedAmount: normalizeNumber(event.estimatedAmount),
    actualAmount: normalizeNumber(event.actualAmount),
    expectedCommission: normalizeNumber(event.expectedCommission),
    followUpSilenceDays: normalizeSilenceDays(event.followUpSilenceDays),
    description: String(event.description || '').trim(),
    tags: normalizeTags(event.tagsText),
    voiceAliases: normalizeAliasList(event.voiceAliasesText || event.voiceAliases, reservedAliasTexts),
    contacts: normalizeContacts(event.contacts),
    isClosed: isClosedProjectStage(event.stage),
    updatedAt: now
  }

  if (event.projectId) {
    ensureWritableAccess(accessContext, 'update')
    const existing = await db.collection('projects').where({
      _id: event.projectId,
      _openid: wxContext.OPENID
    }).limit(1).get()

    if (!existing.data.length) {
      return {
        ok: false,
        message: 'project not found'
      }
    }

    if (existing.data[0].handoverStatus === 'handed_over' && !existing.data[0].isSharedProject) {
      return {
        ok: false,
        message: 'project already handed over'
      }
    }

    await db.collection('projects').doc(event.projectId).update({
      data: payload
    })
    await closeOpenProjectTasks(wxContext.OPENID, event.projectId, payload.stage, now)

    return {
      ok: true,
      projectId: event.projectId,
      mode: 'update'
    }
  }

  ensureWritableAccess(accessContext, 'create')
  const result = await db.collection('projects').add({
    data: {
      _openid: wxContext.OPENID,
      accountId: accessContext.accountId,
      ownerAccountId: accessContext.accountId,
      writeSource: 'account_migrated',
      createdAt: now,
      ...payload
    }
  })
  const referralReward = await tryGrantReferralReward(accessContext, wxContext.OPENID, result._id, now)

  return {
    ok: true,
    projectId: result._id,
    mode: 'create',
    referralReward
  }
}
