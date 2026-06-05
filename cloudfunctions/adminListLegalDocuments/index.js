const cloud = require('wx-server-sdk')
const {
  toText,
  normalizeLimit,
  normalizeDocType,
  normalizeStatus,
  matchesKeyword,
  buildLegalDocumentSummary
} = require('./legalDocumentHelper')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

async function safeGetOne(collectionName, query) {
  try {
    const result = await db.collection(collectionName).where(query).limit(1).get()
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
    throw new Error('BILLING_OPERATOR_FORBIDDEN: 当前无权访问协议中心')
  }

  return config
}

exports.main = async (event = {}) => {
  const operatorConfig = await ensureOperatorAuthorized(event.operatorKey)
  const docType = normalizeDocType(event.docType)
  const status = toText(event.status || 'all')
  const keyword = toText(event.keyword)
  const limit = normalizeLimit(event.limit, 50, 100)

  const query = {}
  if (docType) {
    query.docType = docType
  }
  if (normalizeStatus(status, '') && status !== 'all') {
    query.status = normalizeStatus(status, 'draft')
  }

  const documents = await safeGetList('legalDocuments', Object.keys(query).length ? query : null, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc',
    limit: Math.max(limit, 100)
  })

  const matched = documents
    .filter((item) => matchesKeyword(item, keyword))
    .slice(0, limit)
    .map((item) => buildLegalDocumentSummary(item))

  return {
    ok: true,
    operatorId: operatorConfig.operatorId,
    total: matched.length,
    documents: matched
  }
}
