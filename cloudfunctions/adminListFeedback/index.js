const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function toText(value) {
  return String(value || '').trim()
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
    throw new Error('BILLING_OPERATOR_FORBIDDEN: 当前无权访问反馈后台')
  }
  return config
}

function matchesKeyword(record, keyword = '') {
  const currentKeyword = toText(keyword).toLowerCase()
  if (!currentKeyword) {
    return true
  }

  return [
    record._id,
    record.accountId,
    record.phoneMasked,
    record.displayName,
    record.type,
    record.typeLabel,
    record.scene,
    record.sceneLabel,
    record.content,
    record.contact,
    record.status,
    record.adminNote
  ].some((item) => toText(item).toLowerCase().includes(currentKeyword))
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

exports.main = async (event = {}) => {
  const operatorConfig = await ensureOperatorAuthorized(event.operatorKey)
  const status = toText(event.status)
  const type = toText(event.type)
  const keyword = toText(event.keyword)
  const limit = normalizeLimit(event.limit, 100)
  const scanLimit = normalizeLimit(event.scanLimit || event.maxScan, Math.max(200, limit))

  const feedbackItems = await safeGetList('feedback', null, {
    orderByField: 'createdAt',
    orderByDirection: 'desc',
    limit: scanLimit
  })

  const matchedItems = feedbackItems
    .filter((item) => !status || status === 'all' || toText(item.status || 'pending') === status)
    .filter((item) => !type || type === 'all' || toText(item.type) === type)
    .filter((item) => matchesKeyword(item, keyword))

  return {
    ok: true,
    operatorId: operatorConfig.operatorId,
    total: matchedItems.length,
    feedback: matchedItems.slice(0, limit).map((item) => buildFeedbackSummary(item)),
    source: 'CloudBase'
  }
}
