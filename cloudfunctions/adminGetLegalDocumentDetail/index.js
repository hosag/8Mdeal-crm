const cloud = require('wx-server-sdk')
const {
  toText,
  normalizeDocType,
  normalizeVersion,
  buildLegalDocumentDetail
} = require('./legalDocumentHelper')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

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
    throw new Error('BILLING_OPERATOR_FORBIDDEN: 当前无权读取协议详情')
  }
  return config
}

async function resolveDocument(event = {}) {
  const docId = toText(event.docId)
  if (docId) {
    return safeGetOne('legalDocuments', { docId })
  }

  const docType = normalizeDocType(event.docType)
  const version = normalizeVersion(event.version)
  if (!docType) {
    return null
  }

  if (version) {
    return safeGetOne('legalDocuments', {
      docType,
      version
    })
  }

  return safeGetOne('legalDocuments', {
    docType,
    isCurrent: true
  }, {
    orderByField: 'publishedAt',
    orderByDirection: 'desc'
  })
}

exports.main = async (event = {}) => {
  const operatorConfig = await ensureOperatorAuthorized(event.operatorKey)
  const document = await resolveDocument(event)

  if (!document) {
    throw new Error('LEGAL_DOCUMENT_NOT_FOUND: 当前协议不存在')
  }

  return {
    ok: true,
    operatorId: operatorConfig.operatorId,
    document: buildLegalDocumentDetail(document)
  }
}
