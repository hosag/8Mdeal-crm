const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function toText(value) {
  return String(value || '').trim()
}

function normalizeLimit(value, fallback = 50) {
  const current = Number(value)
  if (!Number.isFinite(current) || current <= 0) {
    return fallback
  }

  return Math.min(500, Math.max(1, Math.floor(current)))
}

function normalizeTextList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean)
  }

  return toText(value)
    .split(',')
    .map((item) => toText(item))
    .filter(Boolean)
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
    const requestedLimit = Number(options.limit)
    const totalLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.floor(requestedLimit)
      : 100
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
    throw new Error('BILLING_OPERATOR_FORBIDDEN: 当前无权访问审计日志')
  }

  return config
}

function matchesKeyword(log, keyword = '') {
  const currentKeyword = toText(keyword).toLowerCase()
  if (!currentKeyword) {
    return true
  }

  return [
    log.operatorId,
    log.actionType,
    log.targetType,
    log.targetId,
    log.reason
  ].some((item) => toText(item).toLowerCase().includes(currentKeyword))
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

function buildAuditSummary(record) {
  return {
    logId: toText(record && (record._id || record.logId)),
    operatorId: toText(record && record.operatorId),
    actionType: toText(record && record.actionType),
    targetType: toText(record && record.targetType),
    targetId: toText(record && record.targetId),
    reason: toText(record && record.reason),
    beforeSnapshot: record && typeof record.beforeSnapshot === 'object' ? record.beforeSnapshot : {},
    afterSnapshot: record && typeof record.afterSnapshot === 'object' ? record.afterSnapshot : {},
    createdAt: formatDateText(record && record.createdAt)
  }
}

exports.main = async (event = {}) => {
  const operatorConfig = await ensureOperatorAuthorized(event.operatorKey)
  const keyword = toText(event.keyword)
  const targetType = toText(event.targetType)
  const targetId = toText(event.targetId || event.accountId)
  const actionTypes = normalizeTextList(event.actionTypes || event.actionType)
  const limit = normalizeLimit(event.limit, 50)
  const scanLimit = normalizeLimit(event.scanLimit || event.maxScan, Math.max(200, limit))

  const auditLogs = await safeGetList('adminAuditLogs', null, {
    orderByField: 'createdAt',
    orderByDirection: 'desc',
    limit: scanLimit
  })

  const matchedLogs = auditLogs
    .filter((item) => !targetType || targetType === 'all' || toText(item.targetType) === targetType)
    .filter((item) => !targetId || toText(item.targetId) === targetId)
    .filter((item) => !actionTypes.length || actionTypes.includes(toText(item.actionType)))
    .filter((item) => matchesKeyword(item, keyword))

  return {
    ok: true,
    operatorId: operatorConfig.operatorId,
    total: matchedLogs.length,
    logs: matchedLogs.slice(0, limit).map((item) => buildAuditSummary(item)),
    source: 'CloudBase'
  }
}
