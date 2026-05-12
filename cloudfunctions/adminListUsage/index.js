const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const LOW_VOICE_ALERT_THRESHOLD = 120
const LOW_AI_ALERT_THRESHOLD = 10000
const SUBSCRIPTION_EXPIRING_SOON_DAYS = 7

function toText(value) {
  return String(value || '').trim()
}

function toBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function toNumber(value, fallback = 0) {
  const current = Number(value)
  return Number.isFinite(current) ? current : fallback
}

function normalizeLimit(value, fallback = 50) {
  const current = Number(value)
  if (!Number.isFinite(current) || current <= 0) {
    return fallback
  }

  return Math.min(100, Math.max(1, Math.floor(current)))
}

function normalizePage(value, fallback = 1) {
  const current = Number(value)
  if (!Number.isFinite(current) || current <= 0) {
    return fallback
  }

  return Math.max(1, Math.floor(current))
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
    if (options.skip) {
      request = request.skip(Math.max(0, Math.floor(toNumber(options.skip, 0))))
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

async function safeGetListBatched(collectionName, query = null, options = {}) {
  const batchSize = Math.min(100, Math.max(1, Math.floor(toNumber(options.batchSize, 100))))
  const maxItems = Math.max(batchSize, Math.floor(toNumber(options.maxItems, batchSize)))
  let skip = Math.max(0, Math.floor(toNumber(options.skip, 0)))
  let result = []

  while (result.length < maxItems) {
    const remaining = maxItems - result.length
    const currentBatch = await safeGetList(collectionName, query, {
      orderByField: options.orderByField,
      orderByDirection: options.orderByDirection,
      limit: Math.min(batchSize, remaining),
      skip
    })

    if (!currentBatch.length) {
      break
    }

    result = result.concat(currentBatch)
    skip += currentBatch.length
    if (currentBatch.length < Math.min(batchSize, remaining)) {
      break
    }
  }

  return result
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
    throw new Error('BILLING_OPERATOR_FORBIDDEN: 当前无权访问额度与订阅视图')
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

function formatDateText(value) {
  if (!value) {
    return ''
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toISOString()
}

function parseDateMs(value) {
  const text = toText(value)
  if (!text) {
    return 0
  }
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function isExpiringSoon(value, days = SUBSCRIPTION_EXPIRING_SOON_DAYS) {
  const expiresAtMs = parseDateMs(value)
  if (!expiresAtMs) {
    return false
  }
  const nowMs = Date.now()
  const windowMs = Math.max(1, Math.floor(toNumber(days, SUBSCRIPTION_EXPIRING_SOON_DAYS))) * 24 * 60 * 60 * 1000
  return expiresAtMs >= nowMs && expiresAtMs <= nowMs + windowMs
}

function getStartOfDayMs(date = new Date()) {
  const current = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(current.getTime())) {
    return 0
  }
  return new Date(current.getFullYear(), current.getMonth(), current.getDate(), 0, 0, 0, 0).getTime()
}

function getEndOfDayMs(date = new Date()) {
  const current = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(current.getTime())) {
    return 0
  }
  return new Date(current.getFullYear(), current.getMonth(), current.getDate(), 23, 59, 59, 999).getTime()
}

function resolveOccurredAtRange(event = {}) {
  const explicitDateFrom = toText(event.dateFrom)
  const explicitDateTo = toText(event.dateTo)
  if (explicitDateFrom || explicitDateTo) {
    const fromMs = explicitDateFrom ? getStartOfDayMs(explicitDateFrom) : 0
    const toMs = explicitDateTo ? getEndOfDayMs(explicitDateTo) : 0
    return { fromMs, toMs }
  }

  const timeWindow = toText(event.timeWindow || event.usageTimeWindow)
  if (!timeWindow || timeWindow === 'all') {
    return { fromMs: 0, toMs: 0 }
  }

  const now = new Date()
  if (timeWindow === 'today') {
    return {
      fromMs: getStartOfDayMs(now),
      toMs: getEndOfDayMs(now)
    }
  }

  const days = timeWindow === 'last_7d'
    ? 7
    : (timeWindow === 'last_30d' ? 30 : 0)
  if (!days) {
    return { fromMs: 0, toMs: 0 }
  }

  return {
    fromMs: now.getTime() - days * 24 * 60 * 60 * 1000,
    toMs: now.getTime()
  }
}

function buildUsageLedgerFilters(event = {}) {
  return {
    usageType: toText(event.usageType),
    sourceType: toText(event.sourceType),
    ledgerKeyword: toText(event.ledgerKeyword).toLowerCase(),
    providerKeyword: toText(event.providerKey || event.provider || event.providerKeyword).toLowerCase(),
    modelKeyword: toText(event.model || event.modelKeyword).toLowerCase(),
    projectIdKeyword: toText(event.projectId).toLowerCase(),
    occurredAtRange: resolveOccurredAtRange(event)
  }
}

function hasLedgerScopedFilter(filters = {}) {
  return Boolean(
    (filters.usageType && filters.usageType !== 'all')
    || (filters.sourceType && filters.sourceType !== 'all')
    || filters.ledgerKeyword
    || filters.providerKeyword
    || filters.modelKeyword
    || filters.projectIdKeyword
    || Number(filters.occurredAtRange && filters.occurredAtRange.fromMs || 0) > 0
    || Number(filters.occurredAtRange && filters.occurredAtRange.toMs || 0) > 0
  )
}

function matchesLedgerFilters(item = {}, filters = {}) {
  const usageType = toText(filters.usageType)
  if (usageType && usageType !== 'all' && toText(item.usageType) !== usageType) {
    return false
  }

  const sourceType = toText(filters.sourceType)
  if (sourceType && sourceType !== 'all' && toText(item.sourceType) !== sourceType) {
    return false
  }

  const occurredAtMs = parseDateMs(item.occurredAt)
  const fromMs = toNumber(filters.occurredAtRange && filters.occurredAtRange.fromMs, 0)
  const toMs = toNumber(filters.occurredAtRange && filters.occurredAtRange.toMs, 0)
  if (fromMs > 0 && (!occurredAtMs || occurredAtMs < fromMs)) {
    return false
  }
  if (toMs > 0 && (!occurredAtMs || occurredAtMs > toMs)) {
    return false
  }

  const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
  if (filters.ledgerKeyword) {
    const keyword = filters.ledgerKeyword
    const matched = [
      item.accountId,
      item.traceId,
      item.sourceId,
      meta.projectId,
      meta.projectName,
      meta.projectTitle,
      meta.providerKey,
      meta.providerLabel,
      meta.model,
      meta.pageKey,
      meta.routeKey,
      meta.externalTransactionId
    ].some((value) => toText(value).toLowerCase().includes(keyword))

    if (!matched) {
      return false
    }
  }

  if (filters.providerKeyword) {
    const providerKey = toText(meta.providerKey).toLowerCase()
    const providerLabel = toText(meta.providerLabel).toLowerCase()
    if (![providerKey, providerLabel].some((value) => value.includes(filters.providerKeyword))) {
      return false
    }
  }

  if (filters.modelKeyword) {
    const model = toText(meta.model).toLowerCase()
    if (!model.includes(filters.modelKeyword)) {
      return false
    }
  }

  if (filters.projectIdKeyword) {
    const projectId = toText(meta.projectId).toLowerCase()
    if (!projectId.includes(filters.projectIdKeyword)) {
      return false
    }
  }

  return true
}

function matchesUsageEventFilters(item = {}, filters = {}) {
  const usageType = toText(filters.usageType)
  if (usageType && usageType !== 'all' && toText(item.usageType) !== usageType) {
    return false
  }

  const sourceType = toText(filters.sourceType)
  if (sourceType && sourceType !== 'all' && toText(item.sourceType) !== sourceType) {
    return false
  }

  const occurredAtMs = parseDateMs(item.occurredAt)
  const fromMs = toNumber(filters.occurredAtRange && filters.occurredAtRange.fromMs, 0)
  const toMs = toNumber(filters.occurredAtRange && filters.occurredAtRange.toMs, 0)
  if (fromMs > 0 && (!occurredAtMs || occurredAtMs < fromMs)) {
    return false
  }
  if (toMs > 0 && (!occurredAtMs || occurredAtMs > toMs)) {
    return false
  }

  const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
  if (filters.ledgerKeyword) {
    const keyword = filters.ledgerKeyword
    const matched = [
      item.accountId,
      item.traceId,
      item.sourceId,
      item.eventKey,
      meta.projectId,
      meta.projectName,
      meta.projectTitle,
      meta.providerKey,
      meta.providerLabel,
      meta.model,
      meta.plannedProviderKey,
      meta.plannedProviderLabel,
      meta.plannedModel,
      meta.pageKey,
      meta.routeKey,
      meta.clientRequestId,
      meta.providerRequestId,
      meta.primaryError,
      meta.errorMessage
    ].some((value) => toText(value).toLowerCase().includes(keyword))

    if (!matched) {
      return false
    }
  }

  if (filters.providerKeyword) {
    const providerCandidates = [
      meta.providerKey,
      meta.providerLabel,
      meta.plannedProviderKey,
      meta.plannedProviderLabel
    ].map((value) => toText(value).toLowerCase())
    if (!providerCandidates.some((value) => value.includes(filters.providerKeyword))) {
      return false
    }
  }

  if (filters.modelKeyword) {
    const modelCandidates = [
      meta.model,
      meta.plannedModel
    ].map((value) => toText(value).toLowerCase())
    if (!modelCandidates.some((value) => value.includes(filters.modelKeyword))) {
      return false
    }
  }

  if (filters.projectIdKeyword) {
    const projectId = toText(meta.projectId).toLowerCase()
    if (!projectId.includes(filters.projectIdKeyword)) {
      return false
    }
  }

  return true
}

function buildDisplayProfile(user = {}, account = {}) {
  const wechatNickname = toText(user.wechatNickname || user.nickName)
  const customDisplayName = toText(user.customDisplayName)
  if (customDisplayName) {
    return {
      wechatNickname,
      customDisplayName,
      displayName: customDisplayName,
      displayNameSource: 'custom'
    }
  }
  if (wechatNickname) {
    return {
      wechatNickname,
      customDisplayName,
      displayName: wechatNickname,
      displayNameSource: 'wechat'
    }
  }
  if (toText(account.phone)) {
    return {
      wechatNickname,
      customDisplayName,
      displayName: toText(account.phone),
      displayNameSource: 'phone'
    }
  }
  return {
    wechatNickname,
    customDisplayName,
    displayName: toText(account.accountId),
    displayNameSource: 'account'
  }
}

function matchesKeyword(account, keyword = '', user = {}) {
  const currentKeyword = toText(keyword).toLowerCase()
  if (!currentKeyword) {
    return true
  }

  const displayProfile = buildDisplayProfile(user, account)
  return [
    account.accountId,
    account.phone,
    displayProfile.wechatNickname,
    displayProfile.customDisplayName,
    displayProfile.displayName,
    account.status,
    account.currentAccessLevel
  ].some((item) => toText(item).toLowerCase().includes(currentKeyword))
}

function getSourceTypeLabel(sourceType = '') {
  return {
    speech_to_text: '语音转写',
    quick_entry_match: '闪录匹配',
    quick_entry_project_match: 'AI 匹配项目',
    summarize_followup: 'AI 整理',
    followup_summary: 'AI 生成摘要',
    followup_next_action: 'AI 下一步建议',
    project_judgement: '项目 AI 研判',
    project_review: '项目 AI 复盘',
    dormant_project_wake: '项目 AI 唤醒',
    share_brief: '分享 AI 摘要',
    billing_subscription: '订阅到账',
    billing_voice_pack: '语音包到账',
    billing_ai_pack: 'AI 包到账',
    feedback_reward: '反馈奖励',
    referral_reward: '推荐奖励',
    admin_console: '后台补量',
    compensate: '补偿发放',
    refund_revert: '退款回滚'
  }[toText(sourceType)] || toText(sourceType)
}

function getUsageEventStatusLabel(eventStatus = '') {
  return {
    success: '成功',
    failed: '失败'
  }[toText(eventStatus)] || toText(eventStatus || 'unknown')
}

function getRouteKeyLabel(routeKey = '') {
  return {
    quick_entry_project: '闪录项目匹配',
    followup_summary: '跟进摘要',
    followup_next_action: '下一步建议'
  }[toText(routeKey)] || toText(routeKey)
}

function formatProjectLabel(meta = {}) {
  const projectName = toText(meta.projectName || meta.projectTitle)
  if (projectName) {
    return projectName
  }
  return toText(meta.projectId)
}

function paginateItems(list = [], page = 1, pageSize = 40, includeItems = true) {
  const currentPage = normalizePage(page, 1)
  const currentPageSize = normalizeLimit(pageSize, 40)
  const total = Array.isArray(list) ? list.length : 0
  const totalPages = total > 0 ? Math.ceil(total / currentPageSize) : 1
  const safePage = Math.min(currentPage, totalPages)
  const offset = (safePage - 1) * currentPageSize
  const items = includeItems
    ? (Array.isArray(list) ? list.slice(offset, offset + currentPageSize) : [])
    : []

  return {
    page: safePage,
    pageSize: currentPageSize,
    total,
    totalPages,
    hasPrev: safePage > 1,
    hasNext: offset + currentPageSize < total,
    offset,
    returned: items.length,
    items
  }
}

function buildLedgerStats(ledger = []) {
  return (Array.isArray(ledger) ? ledger : []).reduce((stats, item) => {
    stats.records += 1
    const usageType = toText(item.usageType)
    const delta = toNumber(item.delta, 0)
    const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}

    if (delta < 0) {
      stats.consumeCount += 1
      if (usageType === 'voice_seconds') {
        stats.consumeVoiceSeconds += Math.abs(delta)
      } else if (usageType === 'ai_tokens') {
        stats.consumeAiTokens += Math.abs(delta)
      }
    } else if (delta > 0) {
      stats.grantCount += 1
      if (usageType === 'voice_seconds') {
        stats.grantVoiceSeconds += delta
      } else if (usageType === 'ai_tokens') {
        stats.grantAiTokens += delta
      }
    }

    if (meta.fallbackUsed === true) {
      stats.fallbackCount += 1
    }
    return stats
  }, {
    records: 0,
    consumeCount: 0,
    grantCount: 0,
    consumeVoiceSeconds: 0,
    consumeAiTokens: 0,
    grantVoiceSeconds: 0,
    grantAiTokens: 0,
    fallbackCount: 0
  })
}

function buildSourceStats(ledger = []) {
  const map = {}
  ;(Array.isArray(ledger) ? ledger : []).forEach((item) => {
    const sourceType = toText(item.sourceType) || 'unknown'
    if (!map[sourceType]) {
      map[sourceType] = {
        sourceType,
        sourceLabel: getSourceTypeLabel(sourceType),
        records: 0,
        consumeCount: 0,
        grantCount: 0,
        consumeVoiceSeconds: 0,
        consumeAiTokens: 0,
        grantVoiceSeconds: 0,
        grantAiTokens: 0
      }
    }
    const current = map[sourceType]
    current.records += 1
    const usageType = toText(item.usageType)
    const delta = toNumber(item.delta, 0)
    if (delta < 0) {
      current.consumeCount += 1
      if (usageType === 'voice_seconds') {
        current.consumeVoiceSeconds += Math.abs(delta)
      } else if (usageType === 'ai_tokens') {
        current.consumeAiTokens += Math.abs(delta)
      }
    } else if (delta > 0) {
      current.grantCount += 1
      if (usageType === 'voice_seconds') {
        current.grantVoiceSeconds += delta
      } else if (usageType === 'ai_tokens') {
        current.grantAiTokens += delta
      }
    }
  })

  return Object.values(map).sort((left, right) => {
    if (right.consumeAiTokens !== left.consumeAiTokens) {
      return right.consumeAiTokens - left.consumeAiTokens
    }
    if (right.consumeVoiceSeconds !== left.consumeVoiceSeconds) {
      return right.consumeVoiceSeconds - left.consumeVoiceSeconds
    }
    return right.records - left.records
  })
}

function buildProviderStats(ledger = []) {
  const map = {}
  ;(Array.isArray(ledger) ? ledger : []).forEach((item) => {
    const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
    const providerKey = toText(meta.providerKey)
    if (!providerKey) {
      return
    }
    if (!map[providerKey]) {
      map[providerKey] = {
        providerKey,
        providerLabel: toText(meta.providerLabel || providerKey),
        records: 0,
        consumeCount: 0,
        consumeVoiceSeconds: 0,
        consumeAiTokens: 0
      }
    }
    const current = map[providerKey]
    current.records += 1
    const delta = toNumber(item.delta, 0)
    if (delta >= 0) {
      return
    }
    current.consumeCount += 1
    if (toText(item.usageType) === 'voice_seconds') {
      current.consumeVoiceSeconds += Math.abs(delta)
    } else if (toText(item.usageType) === 'ai_tokens') {
      current.consumeAiTokens += Math.abs(delta)
    }
  })

  return Object.values(map).sort((left, right) => {
    if (right.consumeAiTokens !== left.consumeAiTokens) {
      return right.consumeAiTokens - left.consumeAiTokens
    }
    if (right.consumeVoiceSeconds !== left.consumeVoiceSeconds) {
      return right.consumeVoiceSeconds - left.consumeVoiceSeconds
    }
    return right.records - left.records
  })
}

function buildModelStats(ledger = []) {
  const map = {}
  ;(Array.isArray(ledger) ? ledger : []).forEach((item) => {
    const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
    const model = toText(meta.model)
    if (!model) {
      return
    }
    const providerKey = toText(meta.providerKey || 'unknown_provider')
    const compositeKey = `${providerKey}::${model}`
    if (!map[compositeKey]) {
      map[compositeKey] = {
        compositeKey,
        model,
        providerKey,
        providerLabel: toText(meta.providerLabel || providerKey),
        records: 0,
        consumeCount: 0,
        consumeVoiceSeconds: 0,
        consumeAiTokens: 0
      }
    }
    const current = map[compositeKey]
    current.records += 1
    const delta = toNumber(item.delta, 0)
    if (delta >= 0) {
      return
    }
    current.consumeCount += 1
    if (toText(item.usageType) === 'voice_seconds') {
      current.consumeVoiceSeconds += Math.abs(delta)
    } else if (toText(item.usageType) === 'ai_tokens') {
      current.consumeAiTokens += Math.abs(delta)
    }
  })

  return Object.values(map).sort((left, right) => {
    if (right.consumeAiTokens !== left.consumeAiTokens) {
      return right.consumeAiTokens - left.consumeAiTokens
    }
    if (right.consumeVoiceSeconds !== left.consumeVoiceSeconds) {
      return right.consumeVoiceSeconds - left.consumeVoiceSeconds
    }
    return right.records - left.records
  })
}

function buildAccountStats(summaries = [], ledger = []) {
  const map = {}
  ;(Array.isArray(summaries) ? summaries : []).forEach((item) => {
    const accountId = toText(item.accountId)
    if (!accountId) {
      return
    }
    map[accountId] = {
      accountId,
      phone: toText(item.phone),
      displayName: toText(item.displayName || item.customDisplayName || item.wechatNickname || item.phone || accountId),
      status: toText(item.status),
      currentAccessLevel: toText(item.currentAccessLevel),
      records: 0,
      consumeCount: 0,
      consumeVoiceSeconds: 0,
      consumeAiTokens: 0
    }
  })

  ;(Array.isArray(ledger) ? ledger : []).forEach((item) => {
    const accountId = toText(item.accountId)
    if (!accountId || !map[accountId]) {
      return
    }
    const current = map[accountId]
    current.records += 1
    const delta = toNumber(item.delta, 0)
    if (delta >= 0) {
      return
    }
    current.consumeCount += 1
    if (toText(item.usageType) === 'voice_seconds') {
      current.consumeVoiceSeconds += Math.abs(delta)
    } else if (toText(item.usageType) === 'ai_tokens') {
      current.consumeAiTokens += Math.abs(delta)
    }
  })

  return Object.values(map).sort((left, right) => {
    if (right.consumeAiTokens !== left.consumeAiTokens) {
      return right.consumeAiTokens - left.consumeAiTokens
    }
    if (right.consumeVoiceSeconds !== left.consumeVoiceSeconds) {
      return right.consumeVoiceSeconds - left.consumeVoiceSeconds
    }
    return right.consumeCount - left.consumeCount
  })
}

function buildDimensionStats(ledger = [], keyGetter, labelGetter) {
  const map = {}
  ;(Array.isArray(ledger) ? ledger : []).forEach((item) => {
    const key = toText(typeof keyGetter === 'function' ? keyGetter(item) : '')
    if (!key) {
      return
    }
    if (!map[key]) {
      map[key] = {
        key,
        label: toText(typeof labelGetter === 'function' ? labelGetter(item) : key) || key,
        records: 0,
        consumeCount: 0,
        consumeAmount: 0
      }
    }
    const current = map[key]
    current.records += 1
    const delta = toNumber(item.delta, 0)
    if (delta < 0) {
      current.consumeCount += 1
      current.consumeAmount += Math.abs(delta)
    }
  })
  return Object.values(map).sort((left, right) => {
    if (right.consumeAmount !== left.consumeAmount) {
      return right.consumeAmount - left.consumeAmount
    }
    if (right.consumeCount !== left.consumeCount) {
      return right.consumeCount - left.consumeCount
    }
    return right.records - left.records
  })
}

function buildDailyStats(ledger = []) {
  const map = {}
  ;(Array.isArray(ledger) ? ledger : []).forEach((item) => {
    const occurredAtMs = parseDateMs(item.occurredAt)
    if (!occurredAtMs) {
      return
    }
    const dateKey = formatDateText(new Date(getStartOfDayMs(occurredAtMs))).slice(0, 10)
    if (!map[dateKey]) {
      map[dateKey] = {
        date: dateKey,
        records: 0,
        consumeCount: 0,
        grantCount: 0,
        consumeVoiceSeconds: 0,
        consumeAiTokens: 0,
        grantVoiceSeconds: 0,
        grantAiTokens: 0,
        fallbackCount: 0,
        accountIds: {}
      }
    }
    const current = map[dateKey]
    current.records += 1
    current.accountIds[toText(item.accountId)] = true
    const delta = toNumber(item.delta, 0)
    const usageType = toText(item.usageType)
    const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}

    if (delta < 0) {
      current.consumeCount += 1
      if (usageType === 'voice_seconds') {
        current.consumeVoiceSeconds += Math.abs(delta)
      } else if (usageType === 'ai_tokens') {
        current.consumeAiTokens += Math.abs(delta)
      }
    } else if (delta > 0) {
      current.grantCount += 1
      if (usageType === 'voice_seconds') {
        current.grantVoiceSeconds += delta
      } else if (usageType === 'ai_tokens') {
        current.grantAiTokens += delta
      }
    }

    if (meta.fallbackUsed === true) {
      current.fallbackCount += 1
    }
  })

  return Object.values(map)
    .map((item) => ({
      date: item.date,
      records: item.records,
      consumeCount: item.consumeCount,
      grantCount: item.grantCount,
      consumeVoiceSeconds: item.consumeVoiceSeconds,
      consumeAiTokens: item.consumeAiTokens,
      grantVoiceSeconds: item.grantVoiceSeconds,
      grantAiTokens: item.grantAiTokens,
      fallbackCount: item.fallbackCount,
      accountCount: Object.keys(item.accountIds).filter(Boolean).length
    }))
    .sort((left, right) => right.date.localeCompare(left.date))
}

function buildLowBalanceAccounts(summaries = []) {
  return (Array.isArray(summaries) ? summaries : [])
    .filter((item) => {
      return toBoolean(item.bindRequiredForWrite)
        || toNumber(item.voiceSecondsRemaining, 0) <= LOW_VOICE_ALERT_THRESHOLD
        || toNumber(item.aiTokensRemaining, 0) <= LOW_AI_ALERT_THRESHOLD
    })
    .map((item) => ({
      accountId: toText(item.accountId),
      phone: toText(item.phone),
      displayName: toText(item.displayName),
      status: toText(item.status),
      currentAccessLevel: toText(item.currentAccessLevel),
      bindRequiredForWrite: toBoolean(item.bindRequiredForWrite),
      voiceSecondsRemaining: toNumber(item.voiceSecondsRemaining, 0),
      aiTokensRemaining: toNumber(item.aiTokensRemaining, 0)
    }))
    .sort((left, right) => {
      if (left.bindRequiredForWrite !== right.bindRequiredForWrite) {
        return left.bindRequiredForWrite ? -1 : 1
      }
      if (left.aiTokensRemaining !== right.aiTokensRemaining) {
        return left.aiTokensRemaining - right.aiTokensRemaining
      }
      return left.voiceSecondsRemaining - right.voiceSecondsRemaining
    })
}

function buildAccountUsageMap(ledger = []) {
  return (Array.isArray(ledger) ? ledger : []).reduce((result, item) => {
    const accountId = toText(item.accountId)
    if (!accountId) {
      return result
    }
    if (!result[accountId]) {
      result[accountId] = {
        accountId,
        records: 0,
        consumeCount: 0,
        grantCount: 0,
        consumeVoiceSeconds: 0,
        consumeAiTokens: 0,
        grantVoiceSeconds: 0,
        grantAiTokens: 0,
        latestOccurredAtMs: 0
      }
    }
    const current = result[accountId]
    current.records += 1
    current.latestOccurredAtMs = Math.max(current.latestOccurredAtMs, parseDateMs(item.occurredAt))
    const delta = toNumber(item.delta, 0)
    const usageType = toText(item.usageType)
    if (delta < 0) {
      current.consumeCount += 1
      if (usageType === 'voice_seconds') {
        current.consumeVoiceSeconds += Math.abs(delta)
      } else if (usageType === 'ai_tokens') {
        current.consumeAiTokens += Math.abs(delta)
      }
    } else if (delta > 0) {
      current.grantCount += 1
      if (usageType === 'voice_seconds') {
        current.grantVoiceSeconds += delta
      } else if (usageType === 'ai_tokens') {
        current.grantAiTokens += delta
      }
    }
    return result
  }, {})
}

function buildAccountEventMap(usageEvents = []) {
  return (Array.isArray(usageEvents) ? usageEvents : []).reduce((result, item) => {
    const accountId = toText(item.accountId)
    if (!accountId) {
      return result
    }
    if (!result[accountId]) {
      result[accountId] = {
        accountId,
        totalEvents: 0,
        successCount: 0,
        failedCount: 0,
        fallbackCount: 0,
        latestOccurredAtMs: 0
      }
    }
    const current = result[accountId]
    current.totalEvents += 1
    current.latestOccurredAtMs = Math.max(current.latestOccurredAtMs, parseDateMs(item.occurredAt))
    if (toText(item.eventStatus) === 'success') {
      current.successCount += 1
    } else if (toText(item.eventStatus) === 'failed') {
      current.failedCount += 1
    }
    const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
    if (meta.fallbackUsed === true) {
      current.fallbackCount += 1
    }
    return result
  }, {})
}

function resolveSummaryPlanBucket(summary = {}) {
  const latestSubscription = summary.latestSubscription && typeof summary.latestSubscription === 'object'
    ? summary.latestSubscription
    : {}
  const planCode = toText(latestSubscription.planCode)
  const planName = toText(latestSubscription.planName)
  if (planCode || planName) {
    return {
      planKey: planCode || planName,
      planCode,
      planName: planName || planCode || '已开订阅',
      planType: 'subscription',
      billingCycle: toText(latestSubscription.billingCycle),
      subscriptionStatus: toText(latestSubscription.status)
    }
  }
  if (toText(summary.status) === 'trialing' || toText(summary.currentAccessLevel) === 'trial_full') {
    return {
      planKey: 'trial_preview_v1',
      planCode: 'trial_preview_v1',
      planName: '试用体验',
      planType: 'trial',
      billingCycle: 'trial',
      subscriptionStatus: ''
    }
  }
  if (toBoolean(summary.bindRequiredForWrite)) {
    return {
      planKey: 'unbound_preview',
      planCode: 'unbound_preview',
      planName: '未绑定体验',
      planType: 'preview',
      billingCycle: 'preview',
      subscriptionStatus: ''
    }
  }
  return {
    planKey: 'no_active_plan',
    planCode: 'no_active_plan',
    planName: '未开订阅/只读',
    planType: 'readonly',
    billingCycle: '',
    subscriptionStatus: ''
  }
}

function buildWarningSummary(summaries = [], riskAccounts = []) {
  const totalAccounts = Array.isArray(summaries) ? summaries.length : 0
  return (Array.isArray(summaries) ? summaries : []).reduce((result, item) => {
    const voiceRemaining = Math.max(0, toNumber(item.voiceSecondsRemaining, 0))
    const aiRemaining = Math.max(0, toNumber(item.aiTokensRemaining, 0))
    const latestSubscription = item.latestSubscription && typeof item.latestSubscription === 'object'
      ? item.latestSubscription
      : {}
    if (toBoolean(item.bindRequiredForWrite)) {
      result.bindRequiredCount += 1
    }
    if (voiceRemaining <= LOW_VOICE_ALERT_THRESHOLD) {
      result.lowVoiceCount += 1
    }
    if (aiRemaining <= LOW_AI_ALERT_THRESHOLD) {
      result.lowAiCount += 1
    }
    if (voiceRemaining <= LOW_VOICE_ALERT_THRESHOLD && aiRemaining <= LOW_AI_ALERT_THRESHOLD) {
      result.bothLowCount += 1
    }
    if (voiceRemaining <= 0) {
      result.voiceExhaustedCount += 1
    }
    if (aiRemaining <= 0) {
      result.aiExhaustedCount += 1
    }
    if (toBoolean(item.canCreateProject) === false || (toNumber(item.projectLimit, -1) >= 0 && toNumber(item.currentProjectCount, 0) >= toNumber(item.projectLimit, -1))) {
      result.blockedProjectCount += 1
    }
    if (isExpiringSoon(latestSubscription.expiresAt) && toText(latestSubscription.status) === 'active') {
      result.expiringSoonCount += 1
    }
    if (toText(item.status) === 'active_paid') {
      result.paidAccountCount += 1
    }
    if (toText(item.status) === 'trialing') {
      result.trialAccountCount += 1
    }
    if (toText(item.currentAccessLevel).includes('readonly') || ['expired_readonly', 'free_limited'].includes(toText(item.status))) {
      result.readonlyCount += 1
    }
    return result
  }, {
    totalAccounts,
    bindRequiredCount: 0,
    lowVoiceCount: 0,
    lowAiCount: 0,
    bothLowCount: 0,
    voiceExhaustedCount: 0,
    aiExhaustedCount: 0,
    blockedProjectCount: 0,
    expiringSoonCount: 0,
    paidAccountCount: 0,
    trialAccountCount: 0,
    readonlyCount: 0,
    highRiskCount: Array.isArray(riskAccounts)
      ? riskAccounts.filter((item) => toText(item.riskLevel) === 'high').length
      : 0
  })
}

function buildPlanHealthStats(summaries = [], ledger = []) {
  const usageMap = buildAccountUsageMap(ledger)
  const map = {}
  ;(Array.isArray(summaries) ? summaries : []).forEach((item) => {
    const bucket = resolveSummaryPlanBucket(item)
    if (!map[bucket.planKey]) {
      map[bucket.planKey] = {
        planKey: bucket.planKey,
        planCode: bucket.planCode,
        planName: bucket.planName,
        planType: bucket.planType,
        billingCycle: bucket.billingCycle,
        subscriptionStatus: bucket.subscriptionStatus,
        accountCount: 0,
        paidAccountCount: 0,
        trialAccountCount: 0,
        readonlyCount: 0,
        bindRequiredCount: 0,
        blockedProjectCount: 0,
        lowVoiceCount: 0,
        lowAiCount: 0,
        bothLowCount: 0,
        voiceExhaustedCount: 0,
        aiExhaustedCount: 0,
        expiresSoonCount: 0,
        totalVoiceRemaining: 0,
        totalAiRemaining: 0,
        totalVoiceUsedRatio: 0,
        totalAiUsedRatio: 0,
        consumeVoiceSeconds: 0,
        consumeAiTokens: 0,
        consumeCount: 0
      }
    }

    const current = map[bucket.planKey]
    const latestSubscription = item.latestSubscription && typeof item.latestSubscription === 'object'
      ? item.latestSubscription
      : {}
    const voiceTotal = Math.max(0, toNumber(item.voiceSecondsTotal, 0))
    const voiceUsed = Math.max(0, toNumber(item.voiceSecondsUsed, 0))
    const voiceRemaining = Math.max(0, toNumber(item.voiceSecondsRemaining, 0))
    const aiTotal = Math.max(0, toNumber(item.aiTokensTotal, 0))
    const aiUsed = Math.max(0, toNumber(item.aiTokensUsed, 0))
    const aiRemaining = Math.max(0, toNumber(item.aiTokensRemaining, 0))
    const usage = usageMap[toText(item.accountId)] || {}

    current.accountCount += 1
    current.totalVoiceRemaining += voiceRemaining
    current.totalAiRemaining += aiRemaining
    current.totalVoiceUsedRatio += voiceTotal > 0 ? Math.min(1, voiceUsed / voiceTotal) : 0
    current.totalAiUsedRatio += aiTotal > 0 ? Math.min(1, aiUsed / aiTotal) : 0
    current.consumeVoiceSeconds += Math.max(0, toNumber(usage.consumeVoiceSeconds, 0))
    current.consumeAiTokens += Math.max(0, toNumber(usage.consumeAiTokens, 0))
    current.consumeCount += Math.max(0, toNumber(usage.consumeCount, 0))

    if (toBoolean(item.bindRequiredForWrite)) {
      current.bindRequiredCount += 1
    }
    if (toText(item.status) === 'active_paid') {
      current.paidAccountCount += 1
    }
    if (toText(item.status) === 'trialing') {
      current.trialAccountCount += 1
    }
    if (toText(item.currentAccessLevel).includes('readonly') || ['expired_readonly', 'free_limited'].includes(toText(item.status))) {
      current.readonlyCount += 1
    }
    if (toBoolean(item.canCreateProject) === false || (toNumber(item.projectLimit, -1) >= 0 && toNumber(item.currentProjectCount, 0) >= toNumber(item.projectLimit, -1))) {
      current.blockedProjectCount += 1
    }
    if (voiceRemaining <= LOW_VOICE_ALERT_THRESHOLD) {
      current.lowVoiceCount += 1
    }
    if (aiRemaining <= LOW_AI_ALERT_THRESHOLD) {
      current.lowAiCount += 1
    }
    if (voiceRemaining <= LOW_VOICE_ALERT_THRESHOLD && aiRemaining <= LOW_AI_ALERT_THRESHOLD) {
      current.bothLowCount += 1
    }
    if (voiceRemaining <= 0) {
      current.voiceExhaustedCount += 1
    }
    if (aiRemaining <= 0) {
      current.aiExhaustedCount += 1
    }
    if (isExpiringSoon(latestSubscription.expiresAt) && toText(latestSubscription.status) === 'active') {
      current.expiresSoonCount += 1
    }
  })

  return Object.values(map).map((item) => {
    const accountCount = Math.max(1, toNumber(item.accountCount, 0))
    const weightedRiskScore = (
      item.bindRequiredCount * 1.8
      + item.blockedProjectCount * 1.4
      + item.bothLowCount * 1.8
      + item.lowVoiceCount * 0.8
      + item.lowAiCount * 0.8
      + item.expiresSoonCount * 1.2
      + item.readonlyCount * 1.1
    ) / accountCount
    const usagePressure = Math.max(
      toNumber(item.totalVoiceUsedRatio, 0) / accountCount,
      toNumber(item.totalAiUsedRatio, 0) / accountCount
    )
    const healthScore = Math.max(0, Math.min(100, Math.round(100 - weightedRiskScore * 22 - usagePressure * 24)))
    return {
      planKey: item.planKey,
      planCode: item.planCode,
      planName: item.planName,
      planType: item.planType,
      billingCycle: item.billingCycle,
      subscriptionStatus: item.subscriptionStatus,
      accountCount: item.accountCount,
      paidAccountCount: item.paidAccountCount,
      trialAccountCount: item.trialAccountCount,
      readonlyCount: item.readonlyCount,
      bindRequiredCount: item.bindRequiredCount,
      blockedProjectCount: item.blockedProjectCount,
      lowVoiceCount: item.lowVoiceCount,
      lowAiCount: item.lowAiCount,
      bothLowCount: item.bothLowCount,
      voiceExhaustedCount: item.voiceExhaustedCount,
      aiExhaustedCount: item.aiExhaustedCount,
      expiresSoonCount: item.expiresSoonCount,
      totalVoiceRemaining: item.totalVoiceRemaining,
      totalAiRemaining: item.totalAiRemaining,
      avgVoiceRemaining: item.totalVoiceRemaining / accountCount,
      avgAiRemaining: item.totalAiRemaining / accountCount,
      avgVoiceUsedRatio: toNumber(item.totalVoiceUsedRatio, 0) / accountCount,
      avgAiUsedRatio: toNumber(item.totalAiUsedRatio, 0) / accountCount,
      consumeVoiceSeconds: item.consumeVoiceSeconds,
      consumeAiTokens: item.consumeAiTokens,
      consumeCount: item.consumeCount,
      healthScore,
      healthLevel: healthScore >= 80 ? 'healthy' : (healthScore >= 60 ? 'watch' : 'risk')
    }
  }).sort((left, right) => {
    if (right.accountCount !== left.accountCount) {
      return right.accountCount - left.accountCount
    }
    if (right.consumeAiTokens !== left.consumeAiTokens) {
      return right.consumeAiTokens - left.consumeAiTokens
    }
    return right.consumeVoiceSeconds - left.consumeVoiceSeconds
  })
}

function buildRiskAccounts(summaries = [], ledger = [], usageEvents = []) {
  const usageMap = buildAccountUsageMap(ledger)
  const eventMap = buildAccountEventMap(usageEvents)

  return (Array.isArray(summaries) ? summaries : []).map((item) => {
    const accountId = toText(item.accountId)
    const latestSubscription = item.latestSubscription && typeof item.latestSubscription === 'object'
      ? item.latestSubscription
      : {}
    const usage = usageMap[accountId] || {}
    const events = eventMap[accountId] || {}
    const reasons = []
    let riskScore = 0

    const voiceRemaining = Math.max(0, toNumber(item.voiceSecondsRemaining, 0))
    const aiRemaining = Math.max(0, toNumber(item.aiTokensRemaining, 0))

    if (toText(item.status) === 'disabled') {
      riskScore += 100
      reasons.push('账户已禁用')
    }
    if (toBoolean(item.bindRequiredForWrite)) {
      riskScore += 36
      reasons.push('待绑定手机号，正式写入受限')
    }
    if (toText(item.currentAccessLevel).includes('readonly') || ['expired_readonly', 'free_limited'].includes(toText(item.status))) {
      riskScore += 30
      reasons.push('当前为只读状态')
    }
    if (toBoolean(item.canCreateProject) === false) {
      riskScore += 22
      reasons.push('当前不可新建项目')
    }
    if (toNumber(item.projectLimit, -1) >= 0 && toNumber(item.currentProjectCount, 0) >= toNumber(item.projectLimit, -1)) {
      riskScore += 16
      reasons.push(`项目数已达上限(${toNumber(item.currentProjectCount, 0)}/${toNumber(item.projectLimit, -1)})`)
    }
    if (voiceRemaining <= 0) {
      riskScore += 32
      reasons.push('语音额度已耗尽')
    } else if (voiceRemaining <= LOW_VOICE_ALERT_THRESHOLD) {
      riskScore += 14
      reasons.push(`语音额度偏低(${voiceRemaining} 秒)`)
    }
    if (aiRemaining <= 0) {
      riskScore += 32
      reasons.push('AI 额度已耗尽')
    } else if (aiRemaining <= LOW_AI_ALERT_THRESHOLD) {
      riskScore += 14
      reasons.push(`AI 额度偏低(${aiRemaining} token)`)
    }
    if (isExpiringSoon(latestSubscription.expiresAt) && toText(latestSubscription.status) === 'active') {
      riskScore += 16
      reasons.push(`订阅将在 ${formatDateText(latestSubscription.expiresAt).slice(0, 10)} 到期`)
    }
    if (toNumber(events.failedCount, 0) >= 3) {
      riskScore += 14
      reasons.push(`近 30 天失败调用 ${toNumber(events.failedCount, 0)} 次`)
    }
    if (toNumber(events.fallbackCount, 0) >= 5) {
      riskScore += 8
      reasons.push(`近 30 天 fallback ${toNumber(events.fallbackCount, 0)} 次`)
    }
    if (toNumber(usage.consumeAiTokens, 0) >= 100000) {
      riskScore += 10
      reasons.push(`近 30 天 AI 消耗较高(${toNumber(usage.consumeAiTokens, 0)} token)`)
    }
    if (toNumber(usage.consumeVoiceSeconds, 0) >= 1800) {
      riskScore += 8
      reasons.push(`近 30 天语音消耗较高(${toNumber(usage.consumeVoiceSeconds, 0)} 秒)`)
    }

    return {
      accountId,
      phone: toText(item.phone),
      displayName: toText(item.displayName),
      status: toText(item.status),
      currentAccessLevel: toText(item.currentAccessLevel),
      planCode: toText(latestSubscription.planCode),
      planName: toText(latestSubscription.planName),
      subscriptionStatus: toText(latestSubscription.status),
      subscriptionExpiresAt: toText(latestSubscription.expiresAt),
      bindRequiredForWrite: toBoolean(item.bindRequiredForWrite),
      canCreateProject: toBoolean(item.canCreateProject, true),
      projectLimit: toNumber(item.projectLimit, -1),
      currentProjectCount: toNumber(item.currentProjectCount, 0),
      voiceSecondsRemaining: voiceRemaining,
      aiTokensRemaining: aiRemaining,
      consumeVoiceSeconds: Math.max(0, toNumber(usage.consumeVoiceSeconds, 0)),
      consumeAiTokens: Math.max(0, toNumber(usage.consumeAiTokens, 0)),
      failedCount: Math.max(0, toNumber(events.failedCount, 0)),
      fallbackCount: Math.max(0, toNumber(events.fallbackCount, 0)),
      riskScore,
      riskLevel: riskScore >= 80 ? 'high' : (riskScore >= 45 ? 'medium' : (riskScore > 0 ? 'attention' : 'stable')),
      riskReasons: reasons.slice(0, 4)
    }
  }).filter((item) => item.riskScore > 0)
    .sort((left, right) => {
      if (right.riskScore !== left.riskScore) {
        return right.riskScore - left.riskScore
      }
      if (right.failedCount !== left.failedCount) {
        return right.failedCount - left.failedCount
      }
      if (right.consumeAiTokens !== left.consumeAiTokens) {
        return right.consumeAiTokens - left.consumeAiTokens
      }
      return right.consumeVoiceSeconds - left.consumeVoiceSeconds
    })
}

function createUsageEventBucket(usageType = '') {
  return {
    usageType: toText(usageType),
    totalEvents: 0,
    successCount: 0,
    failedCount: 0,
    fallbackCount: 0,
    usageRecordedCount: 0,
    usageReusedCount: 0,
    durationMsTotal: 0,
    durationMsCount: 0,
    successDurationMsTotal: 0,
    successDurationMsCount: 0,
    billedTokensTotal: 0,
    billedSecondsTotal: 0,
    rawTotalTokens: 0,
    outputCharsTotal: 0,
    inputCharsTotal: 0,
    accountIds: {}
  }
}

function finalizeUsageEventBucket(bucket = {}) {
  const totalEvents = Math.max(0, toNumber(bucket.totalEvents, 0))
  const successCount = Math.max(0, toNumber(bucket.successCount, 0))
  const failedCount = Math.max(0, toNumber(bucket.failedCount, 0))
  const durationMsCount = Math.max(0, toNumber(bucket.durationMsCount, 0))
  const successDurationMsCount = Math.max(0, toNumber(bucket.successDurationMsCount, 0))
  return {
    usageType: toText(bucket.usageType),
    totalEvents,
    successCount,
    failedCount,
    fallbackCount: Math.max(0, toNumber(bucket.fallbackCount, 0)),
    usageRecordedCount: Math.max(0, toNumber(bucket.usageRecordedCount, 0)),
    usageReusedCount: Math.max(0, toNumber(bucket.usageReusedCount, 0)),
    coverAccountCount: Object.keys(bucket.accountIds || {}).filter(Boolean).length,
    successRate: totalEvents > 0 ? successCount / totalEvents : 0,
    avgDurationMs: durationMsCount > 0 ? toNumber(bucket.durationMsTotal, 0) / durationMsCount : 0,
    avgSuccessDurationMs: successDurationMsCount > 0 ? toNumber(bucket.successDurationMsTotal, 0) / successDurationMsCount : 0,
    billedTokensTotal: Math.max(0, toNumber(bucket.billedTokensTotal, 0)),
    billedSecondsTotal: Math.max(0, toNumber(bucket.billedSecondsTotal, 0)),
    rawTotalTokens: Math.max(0, toNumber(bucket.rawTotalTokens, 0)),
    outputCharsTotal: Math.max(0, toNumber(bucket.outputCharsTotal, 0)),
    inputCharsTotal: Math.max(0, toNumber(bucket.inputCharsTotal, 0)),
    avgBilledTokens: successCount > 0 ? Math.max(0, toNumber(bucket.billedTokensTotal, 0)) / successCount : 0,
    avgBilledSeconds: successCount > 0 ? Math.max(0, toNumber(bucket.billedSecondsTotal, 0)) / successCount : 0,
    avgRawTokens: successCount > 0 ? Math.max(0, toNumber(bucket.rawTotalTokens, 0)) / successCount : 0
  }
}

function buildUsageEventStats(events = []) {
  const overall = createUsageEventBucket('all')
  const byUsageTypeMap = {}
  ;(Array.isArray(events) ? events : []).forEach((item) => {
    const usageType = toText(item.usageType) || 'unknown'
    if (!byUsageTypeMap[usageType]) {
      byUsageTypeMap[usageType] = createUsageEventBucket(usageType)
    }
    const buckets = [overall, byUsageTypeMap[usageType]]
    const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
    const eventStatus = toText(item.eventStatus)
    const durationMs = Math.max(0, toNumber(meta.durationMs, 0))
    const billedTokens = Math.max(0, toNumber(meta.billedTokens, 0))
    const billedSeconds = Math.max(0, toNumber(meta.billedSeconds, 0))
    const rawTotalTokens = Math.max(0, toNumber(meta.rawTotalTokens, 0))
    const outputChars = Math.max(0, toNumber(meta.outputChars, 0))
    const inputChars = Math.max(0, toNumber(meta.inputChars, 0))
    buckets.forEach((bucket) => {
      bucket.totalEvents += 1
      bucket.accountIds[toText(item.accountId)] = true
      if (durationMs > 0) {
        bucket.durationMsTotal += durationMs
        bucket.durationMsCount += 1
      }
      if (meta.fallbackUsed === true) {
        bucket.fallbackCount += 1
      }
      if (meta.usageRecorded !== false) {
        bucket.usageRecordedCount += 1
      }
      if (meta.usageReused === true) {
        bucket.usageReusedCount += 1
      }
      if (eventStatus === 'success') {
        bucket.successCount += 1
        bucket.billedTokensTotal += billedTokens
        bucket.billedSecondsTotal += billedSeconds
        bucket.rawTotalTokens += rawTotalTokens
        bucket.outputCharsTotal += outputChars
        bucket.inputCharsTotal += inputChars
        if (durationMs > 0) {
          bucket.successDurationMsTotal += durationMs
          bucket.successDurationMsCount += 1
        }
      } else if (eventStatus === 'failed') {
        bucket.failedCount += 1
      }
    })
  })

  const byUsageType = Object.keys(byUsageTypeMap).reduce((result, key) => {
    result[key] = finalizeUsageEventBucket(byUsageTypeMap[key])
    return result
  }, {})

  return {
    ...finalizeUsageEventBucket(overall),
    byUsageType
  }
}

function buildUsageRouteStats(events = []) {
  const map = {}
  ;(Array.isArray(events) ? events : []).forEach((item) => {
    if (toText(item.usageType) !== 'ai_tokens') {
      return
    }
    const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
    const routeKey = toText(meta.routeKey)
    if (!routeKey) {
      return
    }
    if (!map[routeKey]) {
      map[routeKey] = {
        routeKey,
        routeLabel: getRouteKeyLabel(routeKey),
        totalEvents: 0,
        successCount: 0,
        failedCount: 0,
        fallbackCount: 0,
        durationMsTotal: 0,
        durationMsCount: 0,
        rawTotalTokens: 0,
        billedTokensTotal: 0,
        multiplierTotal: 0,
        inputCharsTotal: 0,
        outputCharsTotal: 0,
        latestOccurredAtMs: 0,
        runtimeKeys: {}
      }
    }
    const current = map[routeKey]
    const durationMs = Math.max(0, toNumber(meta.durationMs, 0))
    const eventStatus = toText(item.eventStatus)
    current.totalEvents += 1
    if (durationMs > 0) {
      current.durationMsTotal += durationMs
      current.durationMsCount += 1
    }
    if (meta.fallbackUsed === true) {
      current.fallbackCount += 1
    }
    current.latestOccurredAtMs = Math.max(current.latestOccurredAtMs, parseDateMs(item.occurredAt))
    if (eventStatus === 'success') {
      current.successCount += 1
      current.rawTotalTokens += Math.max(0, toNumber(meta.rawTotalTokens, 0))
      current.billedTokensTotal += Math.max(0, toNumber(meta.billedTokens, 0))
      current.multiplierTotal += Math.max(0, toNumber(meta.multiplier, 0))
      current.inputCharsTotal += Math.max(0, toNumber(meta.inputChars, 0))
      current.outputCharsTotal += Math.max(0, toNumber(meta.outputChars, 0))
      const runtimeKey = `${toText(meta.providerKey)}::${toText(meta.model)}`
      if (!current.runtimeKeys[runtimeKey]) {
        current.runtimeKeys[runtimeKey] = {
          providerKey: toText(meta.providerKey),
          providerLabel: toText(meta.providerLabel || meta.providerKey),
          model: toText(meta.model),
          count: 0
        }
      }
      current.runtimeKeys[runtimeKey].count += 1
    } else if (eventStatus === 'failed') {
      current.failedCount += 1
    }
  })

  return Object.values(map).map((item) => {
    const runtimeSummary = Object.values(item.runtimeKeys || {}).sort((left, right) => right.count - left.count)[0] || {}
    return {
      routeKey: item.routeKey,
      routeLabel: item.routeLabel,
      totalEvents: item.totalEvents,
      successCount: item.successCount,
      failedCount: item.failedCount,
      fallbackCount: item.fallbackCount,
      successRate: item.totalEvents > 0 ? item.successCount / item.totalEvents : 0,
      fallbackRate: item.totalEvents > 0 ? item.fallbackCount / item.totalEvents : 0,
      avgDurationMs: item.durationMsCount > 0 ? item.durationMsTotal / item.durationMsCount : 0,
      avgRawTokens: item.successCount > 0 ? item.rawTotalTokens / item.successCount : 0,
      avgBilledTokens: item.successCount > 0 ? item.billedTokensTotal / item.successCount : 0,
      avgMultiplier: item.successCount > 0 ? item.multiplierTotal / item.successCount : 0,
      avgInputChars: item.successCount > 0 ? item.inputCharsTotal / item.successCount : 0,
      avgOutputChars: item.successCount > 0 ? item.outputCharsTotal / item.successCount : 0,
      latestOccurredAt: item.latestOccurredAtMs ? formatDateText(new Date(item.latestOccurredAtMs)) : '',
      providerKey: toText(runtimeSummary.providerKey),
      providerLabel: toText(runtimeSummary.providerLabel),
      model: toText(runtimeSummary.model)
    }
  }).sort((left, right) => {
    if (right.totalEvents !== left.totalEvents) {
      return right.totalEvents - left.totalEvents
    }
    return right.avgBilledTokens - left.avgBilledTokens
  })
}

function buildUsageModelEfficiencyStats(events = []) {
  const map = {}
  ;(Array.isArray(events) ? events : []).forEach((item) => {
    if (toText(item.usageType) !== 'ai_tokens') {
      return
    }
    const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
    const providerKey = toText(meta.providerKey || meta.plannedProviderKey || 'unknown_provider')
    const providerLabel = toText(meta.providerLabel || meta.plannedProviderLabel || providerKey)
    const model = toText(meta.model || meta.plannedModel)
    if (!model) {
      return
    }
    const compositeKey = `${providerKey}::${model}`
    if (!map[compositeKey]) {
      map[compositeKey] = {
        compositeKey,
        providerKey,
        providerLabel,
        model,
        totalEvents: 0,
        successCount: 0,
        failedCount: 0,
        fallbackCount: 0,
        durationMsTotal: 0,
        durationMsCount: 0,
        rawTotalTokens: 0,
        billedTokensTotal: 0,
        multiplierTotal: 0,
        outputCharsTotal: 0,
        sourceTypes: {},
        latestOccurredAtMs: 0
      }
    }
    const current = map[compositeKey]
    const durationMs = Math.max(0, toNumber(meta.durationMs, 0))
    current.totalEvents += 1
    current.latestOccurredAtMs = Math.max(current.latestOccurredAtMs, parseDateMs(item.occurredAt))
    if (durationMs > 0) {
      current.durationMsTotal += durationMs
      current.durationMsCount += 1
    }
    if (meta.fallbackUsed === true) {
      current.fallbackCount += 1
    }
    const sourceType = toText(item.sourceType)
    if (sourceType) {
      current.sourceTypes[sourceType] = (current.sourceTypes[sourceType] || 0) + 1
    }
    if (toText(item.eventStatus) === 'success') {
      current.successCount += 1
      current.rawTotalTokens += Math.max(0, toNumber(meta.rawTotalTokens, 0))
      current.billedTokensTotal += Math.max(0, toNumber(meta.billedTokens, 0))
      current.multiplierTotal += Math.max(0, toNumber(meta.multiplier, 0))
      current.outputCharsTotal += Math.max(0, toNumber(meta.outputChars, 0))
    } else if (toText(item.eventStatus) === 'failed') {
      current.failedCount += 1
    }
  })

  return Object.values(map).map((item) => {
    const topSourceType = Object.keys(item.sourceTypes || {}).sort((left, right) => item.sourceTypes[right] - item.sourceTypes[left])[0] || ''
    return {
      compositeKey: item.compositeKey,
      providerKey: item.providerKey,
      providerLabel: item.providerLabel,
      model: item.model,
      totalEvents: item.totalEvents,
      successCount: item.successCount,
      failedCount: item.failedCount,
      fallbackCount: item.fallbackCount,
      successRate: item.totalEvents > 0 ? item.successCount / item.totalEvents : 0,
      avgDurationMs: item.durationMsCount > 0 ? item.durationMsTotal / item.durationMsCount : 0,
      avgRawTokens: item.successCount > 0 ? item.rawTotalTokens / item.successCount : 0,
      avgBilledTokens: item.successCount > 0 ? item.billedTokensTotal / item.successCount : 0,
      avgMultiplier: item.successCount > 0 ? item.multiplierTotal / item.successCount : 0,
      avgOutputChars: item.successCount > 0 ? item.outputCharsTotal / item.successCount : 0,
      billedTokensPerOutputChar: item.outputCharsTotal > 0 ? item.billedTokensTotal / item.outputCharsTotal : 0,
      latestOccurredAt: item.latestOccurredAtMs ? formatDateText(new Date(item.latestOccurredAtMs)) : '',
      topSourceType,
      topSourceLabel: getSourceTypeLabel(topSourceType)
    }
  }).sort((left, right) => {
    if (right.successCount !== left.successCount) {
      return right.successCount - left.successCount
    }
    return right.avgBilledTokens - left.avgBilledTokens
  })
}

function buildUsageSourceEfficiencyStats(events = []) {
  const map = {}
  ;(Array.isArray(events) ? events : []).forEach((item) => {
    const usageType = toText(item.usageType) || 'unknown'
    const sourceType = toText(item.sourceType) || 'unknown'
    const compositeKey = `${usageType}::${sourceType}`
    if (!map[compositeKey]) {
      map[compositeKey] = {
        compositeKey,
        usageType,
        sourceType,
        sourceLabel: getSourceTypeLabel(sourceType),
        totalEvents: 0,
        successCount: 0,
        failedCount: 0,
        fallbackCount: 0,
        durationMsTotal: 0,
        durationMsCount: 0,
        billedTokensTotal: 0,
        billedSecondsTotal: 0,
        rawTotalTokens: 0,
        outputCharsTotal: 0,
        latestOccurredAtMs: 0
      }
    }
    const current = map[compositeKey]
    const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
    const durationMs = Math.max(0, toNumber(meta.durationMs, 0))
    current.totalEvents += 1
    current.latestOccurredAtMs = Math.max(current.latestOccurredAtMs, parseDateMs(item.occurredAt))
    if (durationMs > 0) {
      current.durationMsTotal += durationMs
      current.durationMsCount += 1
    }
    if (meta.fallbackUsed === true) {
      current.fallbackCount += 1
    }
    if (toText(item.eventStatus) === 'success') {
      current.successCount += 1
      current.billedTokensTotal += Math.max(0, toNumber(meta.billedTokens, 0))
      current.billedSecondsTotal += Math.max(0, toNumber(meta.billedSeconds, 0))
      current.rawTotalTokens += Math.max(0, toNumber(meta.rawTotalTokens, 0))
      current.outputCharsTotal += Math.max(0, toNumber(meta.outputChars, 0))
    } else if (toText(item.eventStatus) === 'failed') {
      current.failedCount += 1
    }
  })

  return Object.values(map).map((item) => ({
    compositeKey: item.compositeKey,
    usageType: item.usageType,
    sourceType: item.sourceType,
    sourceLabel: item.sourceLabel,
    totalEvents: item.totalEvents,
    successCount: item.successCount,
    failedCount: item.failedCount,
    fallbackCount: item.fallbackCount,
    successRate: item.totalEvents > 0 ? item.successCount / item.totalEvents : 0,
    avgDurationMs: item.durationMsCount > 0 ? item.durationMsTotal / item.durationMsCount : 0,
    avgBilledTokens: item.successCount > 0 ? item.billedTokensTotal / item.successCount : 0,
    avgBilledSeconds: item.successCount > 0 ? item.billedSecondsTotal / item.successCount : 0,
    avgRawTokens: item.successCount > 0 ? item.rawTotalTokens / item.successCount : 0,
    avgOutputChars: item.successCount > 0 ? item.outputCharsTotal / item.successCount : 0,
    latestOccurredAt: item.latestOccurredAtMs ? formatDateText(new Date(item.latestOccurredAtMs)) : ''
  })).sort((left, right) => {
    if (right.totalEvents !== left.totalEvents) {
      return right.totalEvents - left.totalEvents
    }
    if (right.avgBilledTokens !== left.avgBilledTokens) {
      return right.avgBilledTokens - left.avgBilledTokens
    }
    return right.avgBilledSeconds - left.avgBilledSeconds
  })
}

function buildRecentUsageEvents(events = [], limit = 20) {
  return (Array.isArray(events) ? events : [])
    .slice()
    .sort((left, right) => parseDateMs(right.occurredAt) - parseDateMs(left.occurredAt))
    .slice(0, Math.max(1, Math.floor(toNumber(limit, 20))))
    .map((item) => {
      const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
      const routeKey = toText(meta.routeKey)
      return {
        eventId: toText(item._id),
        eventKey: toText(item.eventKey),
        accountId: toText(item.accountId),
        usageType: toText(item.usageType),
        usageTypeLabel: toText(item.usageType) === 'voice_seconds' ? '语音额度' : 'AI 额度',
        sourceType: toText(item.sourceType),
        sourceLabel: getSourceTypeLabel(item.sourceType),
        sourceId: toText(item.sourceId),
        traceId: toText(item.traceId),
        eventStatus: toText(item.eventStatus),
        eventStatusLabel: getUsageEventStatusLabel(item.eventStatus),
        occurredAt: formatDateText(item.occurredAt),
        routeKey,
        routeLabel: routeKey ? getRouteKeyLabel(routeKey) : '',
        meta: {
          projectId: toText(meta.projectId),
          pageKey: toText(meta.pageKey),
          providerKey: toText(meta.providerKey),
          providerLabel: toText(meta.providerLabel),
          providerType: toText(meta.providerType),
          model: toText(meta.model),
          plannedProviderKey: toText(meta.plannedProviderKey),
          plannedProviderLabel: toText(meta.plannedProviderLabel),
          plannedProviderType: toText(meta.plannedProviderType),
          plannedModel: toText(meta.plannedModel),
          fallbackUsed: meta.fallbackUsed === true,
          primaryError: toText(meta.primaryError),
          errorMessage: toText(meta.errorMessage),
          billingMethod: toText(meta.billingMethod),
          rawTotalTokens: Math.max(0, toNumber(meta.rawTotalTokens, 0)),
          rawPromptTokens: Math.max(0, toNumber(meta.rawPromptTokens, 0)),
          rawCompletionTokens: Math.max(0, toNumber(meta.rawCompletionTokens, 0)),
          billedTokens: Math.max(0, toNumber(meta.billedTokens, 0)),
          billedSeconds: Math.max(0, toNumber(meta.billedSeconds, 0)),
          multiplier: toNumber(meta.multiplier, 1),
          inputChars: Math.max(0, toNumber(meta.inputChars, 0)),
          outputChars: Math.max(0, toNumber(meta.outputChars, 0)),
          durationMs: Math.max(0, toNumber(meta.durationMs, 0)),
          usageRecorded: meta.usageRecorded !== false,
          usageReused: meta.usageReused === true,
          clientRequestId: toText(meta.clientRequestId),
          providerRequestId: toText(meta.providerRequestId)
        }
      }
    })
}

function buildUsageReport({ summaries = [], ledger = [], usageEvents = [], pageInfo = {}, usageFilters = {}, keyword = '', event = {} } = {}) {
  const riskAccounts = buildRiskAccounts(summaries, ledger, usageEvents)
  return {
    generatedAt: new Date().toISOString(),
    scope: {
      keyword: toText(keyword),
      ledgerKeyword: toText(usageFilters.ledgerKeyword),
      usageType: toText(usageFilters.usageType || 'all'),
      sourceType: toText(usageFilters.sourceType || 'all'),
      providerKeyword: toText(usageFilters.providerKeyword),
      modelKeyword: toText(usageFilters.modelKeyword),
      projectIdKeyword: toText(usageFilters.projectIdKeyword),
      timeWindow: toText(event.timeWindow || event.usageTimeWindow || 'all'),
      dateFrom: toText(event.dateFrom),
      dateTo: toText(event.dateTo)
    },
    pageInfo: {
      page: toNumber(pageInfo.page, 1),
      pageSize: toNumber(pageInfo.pageSize, 40),
      total: toNumber(pageInfo.total, Array.isArray(ledger) ? ledger.length : 0),
      totalPages: toNumber(pageInfo.totalPages, 1),
      hasPrev: toBoolean(pageInfo.hasPrev),
      hasNext: toBoolean(pageInfo.hasNext),
      returned: toNumber(pageInfo.returned, 0)
    },
    stats: buildLedgerStats(ledger),
    sourceStats: buildSourceStats(ledger).slice(0, 12),
    providerStats: buildProviderStats(ledger).slice(0, 12),
    modelStats: buildModelStats(ledger).slice(0, 12),
    accountStats: buildAccountStats(summaries, ledger).slice(0, 12),
    pageStats: buildDimensionStats(ledger, (item) => {
      const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
      return toText(meta.pageKey)
    }, (item) => {
      const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
      return toText(meta.pageKey)
    }).slice(0, 12),
    projectStats: buildDimensionStats(ledger, (item) => {
      const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
      return formatProjectLabel(meta)
    }, (item) => {
      const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
      return formatProjectLabel(meta)
    }).slice(0, 12),
    dailyStats: buildDailyStats(ledger).slice(0, 30),
    lowBalanceAccounts: buildLowBalanceAccounts(summaries).slice(0, 12),
    warningSummary: buildWarningSummary(summaries, riskAccounts),
    planHealthStats: buildPlanHealthStats(summaries, ledger).slice(0, 12),
    riskAccounts: riskAccounts.slice(0, 12),
    coverAccountCount: Array.from(new Set((Array.isArray(ledger) ? ledger : []).map((item) => toText(item.accountId)).filter(Boolean))).length,
    eventStats: buildUsageEventStats(usageEvents),
    routeStats: buildUsageRouteStats(usageEvents).slice(0, 12),
    modelEfficiencyStats: buildUsageModelEfficiencyStats(usageEvents).slice(0, 12),
    sourceEfficiencyStats: buildUsageSourceEfficiencyStats(usageEvents).slice(0, 16),
    recentEvents: buildRecentUsageEvents(usageEvents, 20)
  }
}

function normalizePlan(plan = {}) {
  return {
    planCode: toText(plan.planCode || plan.productCode),
    planName: toText(plan.planName || plan.productName),
    planType: toText(plan.planType || plan.productType),
    billingCycle: toText(plan.billingCycle),
    price: toNumber(plan.price, 0),
    originalPrice: toNumber(plan.originalPrice, 0),
    originalPriceText: toText(plan.originalPriceText),
    isPricePending: toBoolean(plan.isPricePending, false),
    displayPriceText: toText(plan.displayPriceText || plan.priceLabel),
    displayBillingText: toText(plan.displayBillingText),
    projectLimit: toNumber(plan.projectLimit, -1),
    monthlyVoiceSeconds: toNumber(plan.monthlyVoiceSeconds || plan.includedVoiceSeconds, 0),
    monthlyAiTokens: toNumber(plan.monthlyAiTokens || plan.includedAiTokens, 0),
    summary: toText(plan.summary),
    featureLines: Array.isArray(plan.featureLines) ? plan.featureLines.map((item) => toText(item)).filter(Boolean) : [],
    supportsShareOut: toBoolean(plan.supportsShareOut, false),
    supportsQuickEntry: toBoolean(plan.supportsQuickEntry, false),
    supportsAi: toBoolean(plan.supportsAi, false),
    supportsSpeechToText: toBoolean(plan.supportsSpeechToText, false),
    trialEligible: toBoolean(plan.trialEligible, false),
    enabled: toBoolean(plan.enabled, true),
    sortOrder: toNumber(plan.sortOrder, 0)
  }
}

function buildLedgerSummaryItem(item = {}) {
  return {
    recordId: toText(item._id),
    accountId: toText(item.accountId),
    usageType: toText(item.usageType),
    sourceType: toText(item.sourceType),
    sourceId: toText(item.sourceId),
    delta: toNumber(item.delta, 0),
    unit: toText(item.unit),
    beforeBalance: toNumber(item.beforeBalance, 0),
    afterBalance: toNumber(item.afterBalance, 0),
    traceId: toText(item.traceId),
    occurredAt: formatDateText(item.occurredAt),
    meta: item.meta && typeof item.meta === 'object' ? item.meta : {}
  }
}

function buildUsageSummary(account, entitlementsMap, latestSubscriptionMap, latestLedgerMap, planMap, userMap) {
  const accountId = toText(account && account.accountId)
  const entitlements = entitlementsMap[accountId] || {}
  const latestSubscription = latestSubscriptionMap[accountId] || {}
  const latestLedger = latestLedgerMap[accountId] || {}
  const plan = planMap[toText(latestSubscription.planCode)] || {}
  const userProfile = userMap[accountId] || {}
  const displayProfile = buildDisplayProfile(userProfile, account || {})

  return {
    accountId,
    status: toText(account && account.status),
    currentAccessLevel: toText(account && account.currentAccessLevel),
    phone: toText(account && account.phone),
    phoneVerified: toBoolean(account && account.phoneVerified),
    wechatNickname: displayProfile.wechatNickname,
    customDisplayName: displayProfile.customDisplayName,
    displayName: displayProfile.displayName,
    displayNameSource: displayProfile.displayNameSource,
    bindRequiredForWrite: toBoolean(entitlements.bindRequiredForWrite),
    canCreateProject: toBoolean(entitlements.canCreateProject, true),
    canUseSpeechToText: toBoolean(entitlements.canUseSpeechToText, true),
    canUseAi: toBoolean(entitlements.canUseAi, true),
    canShareOut: toBoolean(entitlements.canShareOut, true),
    projectLimit: toNumber(entitlements.projectLimit, toNumber(latestSubscription.projectLimit, -1)),
    currentProjectCount: toNumber(entitlements.currentProjectCount, 0),
    voiceSecondsTotal: toNumber(entitlements.voiceSecondsTotal, 0),
    voiceSecondsUsed: toNumber(entitlements.voiceSecondsUsed, 0),
    voiceSecondsRemaining: toNumber(entitlements.voiceSecondsRemaining, 0),
    aiTokensTotal: toNumber(entitlements.aiTokensTotal, 0),
    aiTokensUsed: toNumber(entitlements.aiTokensUsed, 0),
    aiTokensRemaining: toNumber(entitlements.aiTokensRemaining, 0),
    reasonSummary: toText(entitlements.reasonSummary),
    latestUsageAt: formatDateText(latestLedger.occurredAt),
    latestSubscription: {
      planCode: toText(latestSubscription.planCode),
      planName: toText(latestSubscription.planName || plan.planName),
      status: toText(latestSubscription.status),
      billingCycle: toText(latestSubscription.billingCycle || plan.billingCycle),
      expiresAt: formatDateText(latestSubscription.expiresAt),
      grantedVoiceSeconds: toNumber(latestSubscription.grantedVoiceSeconds, 0),
      grantedAiTokens: toNumber(latestSubscription.grantedAiTokens, 0),
      sourceOrderId: toText(latestSubscription.sourceOrderId)
    }
  }
}

exports.main = async (event = {}) => {
  const operatorConfig = await ensureOperatorAuthorized(event.operatorKey)
  const keyword = toText(event.keyword)
  const limit = normalizeLimit(event.limit, 50)
  const page = normalizePage(event.page, 1)
  const pageSize = normalizeLimit(event.pageSize || event.ledgerLimit, 40)
  const ledgerLimit = normalizeLimit(event.ledgerLimit, 100)
  const maxLedgerScan = Math.max(
    Math.min(3000, Math.floor(toNumber(event.maxLedgerScan, 1500))),
    Math.max(pageSize * 5, ledgerLimit * 5, 500)
  )
  const includeLedger = event.includeLedger !== false
  const usageFilters = buildUsageLedgerFilters(event)
  const useLedgerScopedFilter = hasLedgerScopedFilter(usageFilters)

  const usersList = await safeGetListBatched('users', null, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc',
    batchSize: 100,
    maxItems: 300
  })
  const userMap = buildMapByField(usersList, 'accountId')
  const accountPool = await safeGetListBatched('accounts', null, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc',
    batchSize: 100,
    maxItems: 300
  })

  let filteredAccounts = []
  let filteredLedgerPool = []
  let filteredUsageEventPool = []

  if (useLedgerScopedFilter) {
    const ledgerPool = await safeGetListBatched('usageLedger', null, {
      orderByField: 'occurredAt',
      orderByDirection: 'desc',
      batchSize: 100,
      maxItems: maxLedgerScan
    })
    const usageEventPool = await safeGetListBatched('usageEvents', null, {
      orderByField: 'occurredAt',
      orderByDirection: 'desc',
      batchSize: 100,
      maxItems: maxLedgerScan
    })
    const baseLedgerFilters = {
      ...usageFilters,
      ledgerKeyword: ''
    }
    const baseMatchedLedger = ledgerPool.filter((item) => matchesLedgerFilters(item, baseLedgerFilters))
    const baseMatchedUsageEvents = usageEventPool.filter((item) => matchesUsageEventFilters(item, baseLedgerFilters))
    const baseScopedAccountIds = Array.from(new Set(
      baseMatchedLedger
        .map((item) => toText(item.accountId))
        .concat(baseMatchedUsageEvents.map((item) => toText(item.accountId)))
        .filter(Boolean)
    ))
    const baseScopedAccountIdSet = new Set(baseScopedAccountIds)
    const ledgerKeywordMatchedAccountIds = usageFilters.ledgerKeyword
      ? Array.from(new Set(
        baseMatchedLedger
          .filter((item) => matchesLedgerFilters(item, usageFilters))
          .map((item) => toText(item.accountId))
          .filter(Boolean)
      ))
      : []
    const eventKeywordMatchedAccountIds = usageFilters.ledgerKeyword
      ? Array.from(new Set(
        baseMatchedUsageEvents
          .filter((item) => matchesUsageEventFilters(item, usageFilters))
          .map((item) => toText(item.accountId))
          .filter(Boolean)
      ))
      : []
    const accountKeywordMatchedAccountIds = keyword
      ? accountPool.filter((item) => matchesKeyword(item, keyword, userMap[toText(item.accountId)] || {}))
        .map((item) => toText(item.accountId))
        .filter(Boolean)
      : []
    const keywordScopedAccountIds = Array.from(new Set(
      accountKeywordMatchedAccountIds.concat(ledgerKeywordMatchedAccountIds, eventKeywordMatchedAccountIds)
    ))
    const visibleAccountIds = keywordScopedAccountIds.length
      ? keywordScopedAccountIds.filter((accountId) => baseScopedAccountIdSet.has(accountId))
      : baseScopedAccountIds
    const visibleAccountIdSet = new Set(visibleAccountIds)
    filteredAccounts = accountPool
      .filter((item) => visibleAccountIdSet.has(toText(item.accountId)))
      .slice(0, limit)
    const filteredAccountIdSet = new Set(filteredAccounts.map((item) => toText(item.accountId)).filter(Boolean))
    filteredLedgerPool = baseMatchedLedger
      .filter((item) => filteredAccountIdSet.has(toText(item.accountId)))
    filteredUsageEventPool = baseMatchedUsageEvents
      .filter((item) => filteredAccountIdSet.has(toText(item.accountId)))
  } else {
    filteredAccounts = accountPool
      .filter((item) => matchesKeyword(item, keyword, userMap[toText(item.accountId)] || {}))
      .slice(0, limit)

    const accountIdsForLedger = filteredAccounts.map((item) => toText(item.accountId)).filter(Boolean)
    const ledgerList = await safeGetListByIds('usageLedger', 'accountId', accountIdsForLedger, {
      orderByField: 'occurredAt',
      orderByDirection: 'desc',
      limit: Math.max(ledgerLimit * 5, 200)
    })
    const usageEventList = await safeGetListByIds('usageEvents', 'accountId', accountIdsForLedger, {
      orderByField: 'occurredAt',
      orderByDirection: 'desc',
      limit: Math.max(ledgerLimit * 6, 300)
    })

    filteredLedgerPool = ledgerList
      .filter((item) => matchesLedgerFilters(item, usageFilters))
    filteredUsageEventPool = usageEventList
      .filter((item) => matchesUsageEventFilters(item, usageFilters))
  }

  const accountIds = filteredAccounts.map((item) => toText(item.accountId)).filter(Boolean)
  const entitlementsList = await safeGetListByIds('entitlements', 'accountId', accountIds, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc',
    limit: Math.max(limit * 2, 50)
  })
  const subscriptionsList = await safeGetListByIds('subscriptions', 'accountId', accountIds, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc',
    limit: Math.max(limit * 3, 100)
  })
  const plansList = await safeGetList('plans', null, {
    orderByField: 'sortOrder',
    orderByDirection: 'asc',
    limit: 50
  })
  const normalizedPlans = plansList.map((item) => normalizePlan(item))

  const entitlementsMap = buildMapByField(entitlementsList, 'accountId')
  const latestSubscriptionMap = buildMapByField(subscriptionsList, 'accountId')
  const planMap = buildMapByField(normalizedPlans, 'planCode')
  const pagedLedger = paginateItems(filteredLedgerPool, page, pageSize, includeLedger)
  const latestLedgerMap = buildMapByField(filteredLedgerPool, 'accountId')
  const summaries = filteredAccounts.map((item) => buildUsageSummary(item, entitlementsMap, latestSubscriptionMap, latestLedgerMap, planMap, userMap))
  const report = buildUsageReport({
    summaries,
    ledger: filteredLedgerPool,
    usageEvents: filteredUsageEventPool,
    pageInfo: pagedLedger,
    usageFilters,
    keyword,
    event
  })

  return {
    ok: true,
    operatorId: operatorConfig.operatorId,
    total: filteredAccounts.length,
    pageInfo: {
      page: pagedLedger.page,
      pageSize: pagedLedger.pageSize,
      total: pagedLedger.total,
      totalPages: pagedLedger.totalPages,
      hasPrev: pagedLedger.hasPrev,
      hasNext: pagedLedger.hasNext,
      returned: pagedLedger.returned
    },
    summaries,
    ledger: pagedLedger.items.map((item) => buildLedgerSummaryItem(item)),
    report,
    plans: normalizedPlans,
    source: 'CloudBase'
  }
}
