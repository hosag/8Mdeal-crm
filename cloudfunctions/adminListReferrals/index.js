const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const REFERRAL_REWARD_AI_TOKENS = 100000

function toText(value) {
  return String(value || '').trim()
}

function toNumber(value, fallback = 0) {
  const current = Number(value)
  return Number.isFinite(current) ? current : fallback
}

function normalizeLimit(value, fallback = 100) {
  const current = Number(value)
  if (!Number.isFinite(current) || current <= 0) {
    return fallback
  }
  return Math.min(500, Math.max(1, Math.floor(current)))
}

function formatDateText(value) {
  if (!value) {
    return ''
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function parseDateMs(value) {
  const text = toText(value)
  if (!text) {
    return 0
  }
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function getWindowStartMs(timeWindow = '') {
  const current = toText(timeWindow || 'all')
  if (current === 'last_7d') {
    return Date.now() - 7 * 24 * 60 * 60 * 1000
  }
  if (current === 'last_30d') {
    return Date.now() - 30 * 24 * 60 * 60 * 1000
  }
  return 0
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
    const totalLimit = normalizeLimit(options.limit, 100)
    const batchSize = Math.min(100, totalLimit)
    const data = []

    while (data.length < totalLimit) {
      let request = query ? db.collection(collectionName).where(query) : db.collection(collectionName)
      if (options.orderByField && options.orderByDirection) {
        request = request.orderBy(options.orderByField, options.orderByDirection)
      }
      request = request.skip(data.length).limit(Math.min(batchSize, totalLimit - data.length))
      const result = await request.get()
      const currentData = Array.isArray(result.data) ? result.data : []
      data.push(...currentData)
      if (currentData.length < batchSize) {
        break
      }
    }

    return data
  } catch (error) {
    return []
  }
}

async function safeGetListByIds(collectionName, fieldName, values = [], options = {}) {
  const ids = Array.isArray(values) ? values.map((item) => toText(item)).filter(Boolean).slice(0, 100) : []
  if (!ids.length) {
    return []
  }

  return safeGetList(collectionName, {
    [fieldName]: _.in(ids)
  }, options)
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
    throw new Error('BILLING_OPERATOR_FORBIDDEN: 当前无权访问推荐奖励后台')
  }
  return config
}

function buildMapByField(list = [], fieldName = '') {
  return (Array.isArray(list) ? list : []).reduce((result, item) => {
    const key = toText(item && item[fieldName])
    if (key && !result[key]) {
      result[key] = item
    }
    return result
  }, {})
}

function buildDisplayProfile(user = {}, account = {}) {
  const wechatNickname = toText(user.wechatNickname || user.nickName)
  const customDisplayName = toText(user.customDisplayName)
  const phone = toText(account.phone || user.phoneMasked)
  if (customDisplayName) {
    return { wechatNickname, customDisplayName, displayName: customDisplayName, displayNameSource: 'custom' }
  }
  if (wechatNickname) {
    return { wechatNickname, customDisplayName, displayName: wechatNickname, displayNameSource: 'wechat' }
  }
  if (phone) {
    return { wechatNickname, customDisplayName, displayName: phone, displayNameSource: 'phone' }
  }
  return {
    wechatNickname,
    customDisplayName,
    displayName: toText(account.accountId),
    displayNameSource: 'account'
  }
}

function buildAccountSummary(account = {}, user = {}, entitlements = {}) {
  const displayProfile = buildDisplayProfile(user, account)
  return {
    accountId: toText(account.accountId),
    phone: toText(account.phone),
    phoneVerified: account.phoneVerified === true,
    wechatNickname: displayProfile.wechatNickname,
    customDisplayName: displayProfile.customDisplayName,
    displayName: displayProfile.displayName,
    displayNameSource: displayProfile.displayNameSource,
    status: toText(account.status),
    currentAccessLevel: toText(account.currentAccessLevel),
    aiTokensRemaining: toNumber(entitlements.aiTokensRemaining, 0),
    aiTokensTotal: toNumber(entitlements.aiTokensTotal, 0),
    currentProjectCount: toNumber(entitlements.currentProjectCount, 0),
    createdAt: formatDateText(account.createdAt),
    updatedAt: formatDateText(account.updatedAt)
  }
}

function getStatusLabel(status = '') {
  return {
    pending: '待首个项目',
    rewarded: '已奖励',
    blocked: '已阻止'
  }[toText(status)] || toText(status || 'pending')
}

function getSourceTypeLabel(sourceType = '') {
  return {
    referral_code: '推荐码',
    share_material: '分享资料',
    project_handover: '外发项目'
  }[toText(sourceType)] || '推荐码'
}

function getLedgerByRole(ledger = [], relationId = '', role = '') {
  const currentRole = toText(role)
  return (Array.isArray(ledger) ? ledger : []).find((item) => {
    const meta = item && item.meta && typeof item.meta === 'object' ? item.meta : {}
    return toText(item.sourceId) === relationId && toText(meta.role) === currentRole
  }) || null
}

function buildReferralSummary(record = {}, maps = {}) {
  const relationId = toText(record._id || record.relationId)
  const referrerAccountId = toText(record.referrerAccountId)
  const inviteeAccountId = toText(record.inviteeAccountId)
  const referrerLedger = getLedgerByRole(maps.ledger || [], relationId, 'referrer')
  const inviteeLedger = getLedgerByRole(maps.ledger || [], relationId, 'invitee')
  const project = maps.projects[toText(record.qualifiedProjectId)] || {}
  const status = toText(record.status || 'pending')
  const rewardAiTokens = Math.max(1, Math.floor(toNumber(record.rewardAiTokens, REFERRAL_REWARD_AI_TOKENS)))
  const referrerAccount = buildAccountSummary(
    maps.accounts[referrerAccountId] || { accountId: referrerAccountId },
    maps.users[referrerAccountId] || {},
    maps.entitlements[referrerAccountId] || {}
  )
  const inviteeAccount = buildAccountSummary(
    maps.accounts[inviteeAccountId] || { accountId: inviteeAccountId },
    maps.users[inviteeAccountId] || {},
    maps.entitlements[inviteeAccountId] || {}
  )
  const anomalyLabels = []

  if (status === 'rewarded' && (!referrerLedger || !inviteeLedger)) {
    anomalyLabels.push('奖励流水缺失')
  }
  if (referrerAccountId && referrerAccountId === inviteeAccountId) {
    anomalyLabels.push('同账户推荐')
  }
  if (status === 'pending' && toNumber(inviteeAccount.currentProjectCount, 0) > 0) {
    anomalyLabels.push('可重检')
  }

  return {
    relationId,
    referrerCode: toText(record.referrerCode),
    status,
    statusLabel: getStatusLabel(status),
    rewardAiTokens,
    referrerRewardAiTokens: Math.max(0, Math.floor(toNumber(record.referrerRewardAiTokens, rewardAiTokens))),
    inviteeRewardAiTokens: Math.max(0, Math.floor(toNumber(record.inviteeRewardAiTokens, rewardAiTokens))),
    referrerAccount,
    inviteeAccount,
    referrerAccountId,
    inviteeAccountId,
    sourceType: toText(record.sourceType || 'referral_code'),
    sourceTypeLabel: getSourceTypeLabel(record.sourceType || 'referral_code'),
    sourceId: toText(record.sourceId),
    sourceProjectId: toText(record.sourceProjectId),
    sourceShareMode: toText(record.sourceShareMode),
    sourceFlowMode: toText(record.sourceFlowMode),
    triggerScene: toText(record.triggerScene || 'first_project_created'),
    qualifiedProjectId: toText(record.qualifiedProjectId),
    qualifiedProjectName: toText(project.projectName || project.name),
    boundAt: formatDateText(record.boundAt || record.createdAt),
    qualifiedAt: formatDateText(record.qualifiedAt),
    rewardedAt: formatDateText(record.rewardedAt),
    createdAt: formatDateText(record.createdAt),
    updatedAt: formatDateText(record.updatedAt),
    blockReason: toText(record.blockReason),
    referrerLedger: referrerLedger ? buildLedgerSummary(referrerLedger) : null,
    inviteeLedger: inviteeLedger ? buildLedgerSummary(inviteeLedger) : null,
    ledgerStatus: status === 'rewarded'
      ? (referrerLedger && inviteeLedger ? 'complete' : 'missing')
      : 'not_required',
    anomalyLabels
  }
}

function buildLedgerSummary(item = {}) {
  return {
    recordId: toText(item._id || item.recordId),
    accountId: toText(item.accountId),
    sourceId: toText(item.sourceId),
    delta: toNumber(item.delta, 0),
    traceId: toText(item.traceId),
    occurredAt: formatDateText(item.occurredAt),
    beforeBalance: toNumber(item.beforeBalance, 0),
    afterBalance: toNumber(item.afterBalance, 0)
  }
}

function matchesKeyword(item, keyword = '') {
  const currentKeyword = toText(keyword).toLowerCase()
  if (!currentKeyword) {
    return true
  }
  return [
    item.relationId,
    item.referrerCode,
    item.referrerAccountId,
    item.inviteeAccountId,
    item.referrerAccount.displayName,
    item.referrerAccount.phone,
    item.inviteeAccount.displayName,
    item.inviteeAccount.phone,
    item.statusLabel,
    item.qualifiedProjectName,
    item.qualifiedProjectId
  ].some((value) => toText(value).toLowerCase().includes(currentKeyword))
}

function withinTimeWindow(item, timeWindow = 'all') {
  const startMs = getWindowStartMs(timeWindow)
  if (!startMs) {
    return true
  }
  const targetMs = parseDateMs(item.rewardedAt || item.boundAt || item.createdAt)
  return Boolean(targetMs && targetMs >= startMs)
}

function buildStats(items = [], allLedger = []) {
  const rewarded = items.filter((item) => item.status === 'rewarded')
  const pending = items.filter((item) => item.status === 'pending')
  const blocked = items.filter((item) => item.status === 'blocked')
  const ledgerGrantedAiTokens = (Array.isArray(allLedger) ? allLedger : []).reduce((total, item) => {
    return total + Math.max(0, toNumber(item.delta, 0))
  }, 0)
  const missingLedgerCount = rewarded.filter((item) => item.ledgerStatus === 'missing').length

  return {
    totalCount: items.length,
    pendingCount: pending.length,
    rewardedCount: rewarded.length,
    blockedCount: blocked.length,
    ledgerGrantedAiTokens,
    missingLedgerCount
  }
}

exports.main = async (event = {}) => {
  const operatorConfig = await ensureOperatorAuthorized(event.operatorKey)
  const status = toText(event.status || 'all')
  const keyword = toText(event.keyword)
  const timeWindow = toText(event.timeWindow || 'all')
  const limit = normalizeLimit(event.limit, 100)
  const scanLimit = normalizeLimit(event.scanLimit || event.maxScan, Math.max(200, limit))

  const relations = await safeGetList('referralRelations', null, {
    orderByField: 'createdAt',
    orderByDirection: 'desc',
    limit: scanLimit
  })
  const accountIds = Array.from(new Set(relations.flatMap((item) => [
    toText(item.referrerAccountId),
    toText(item.inviteeAccountId)
  ]).filter(Boolean)))
  const relationIds = relations.map((item) => toText(item._id || item.relationId)).filter(Boolean)
  const projectIds = relations.map((item) => toText(item.qualifiedProjectId)).filter(Boolean)

  const [accounts, users, entitlements, projects, ledger] = await Promise.all([
    safeGetListByIds('accounts', 'accountId', accountIds, { limit: Math.max(100, accountIds.length) }),
    safeGetListByIds('users', 'accountId', accountIds, { limit: Math.max(100, accountIds.length) }),
    safeGetListByIds('entitlements', 'accountId', accountIds, { limit: Math.max(100, accountIds.length) }),
    safeGetListByIds('projects', '_id', projectIds, { limit: Math.max(100, projectIds.length) }),
    relationIds.length
      ? safeGetList('usageLedger', {
        sourceType: 'referral_reward',
        sourceId: _.in(relationIds.slice(0, 100))
      }, {
        orderByField: 'occurredAt',
        orderByDirection: 'desc',
        limit: Math.max(100, relationIds.length * 2)
      })
      : Promise.resolve([])
  ])

  const maps = {
    accounts: buildMapByField(accounts, 'accountId'),
    users: buildMapByField(users, 'accountId'),
    entitlements: buildMapByField(entitlements, 'accountId'),
    projects: buildMapByField(projects, '_id'),
    ledger
  }
  const allItems = relations.map((item) => buildReferralSummary(item, maps))
  const matchedItems = allItems
    .filter((item) => status === 'all' || item.status === status)
    .filter((item) => withinTimeWindow(item, timeWindow))
    .filter((item) => matchesKeyword(item, keyword))

  return {
    ok: true,
    operatorId: operatorConfig.operatorId,
    total: matchedItems.length,
    stats: buildStats(allItems, ledger),
    referrals: matchedItems.slice(0, limit),
    source: 'CloudBase'
  }
}
