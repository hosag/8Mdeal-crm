const cloud = require('wx-server-sdk')
const {
  toText,
  renderMarkdownToHtml,
  buildPlainTextSnapshot,
  buildDocumentHash,
  buildLegalDocumentSummary,
  buildLegalDocumentDetail,
  normalizeDate
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
    throw new Error('BILLING_OPERATOR_FORBIDDEN: 当前无权发布协议')
  }

  return config
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
    // Keep publish available even if audit logs are not deployed yet.
  }
}

exports.main = async (event = {}) => {
  const operatorConfig = await ensureOperatorAuthorized(event.operatorKey)
  const now = new Date()
  const docId = toText(event.docId)
  if (!docId) {
    throw new Error('LEGAL_DOCUMENT_ID_REQUIRED: 缺少协议标识')
  }

  const document = await safeGetOne('legalDocuments', { docId })
  if (!document || !document._id) {
    throw new Error('LEGAL_DOCUMENT_NOT_FOUND: 当前协议不存在')
  }
  if (toText(document.status) !== 'draft') {
    throw new Error('LEGAL_DOCUMENT_NOT_DRAFT: 当前协议不是草稿，不能直接发布')
  }
  if (!toText(document.docType) || !toText(document.version) || !toText(document.title) || !toText(document.markdownSource)) {
    throw new Error('LEGAL_DOCUMENT_INVALID: 当前协议信息不完整，无法发布')
  }

  const htmlSnapshot = renderMarkdownToHtml(document.markdownSource)
  const plainTextSnapshot = buildPlainTextSnapshot(document.markdownSource)
  const hash = buildDocumentHash({
    docType: document.docType,
    version: document.version,
    title: document.title,
    htmlSnapshot
  })

  const sameTypeCurrentDocs = await safeGetList('legalDocuments', {
    docType: document.docType,
    isCurrent: true
  }, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc',
    limit: 20
  })

  await Promise.all(
    sameTypeCurrentDocs
      .filter((item) => item._id && item._id !== document._id)
      .map((item) => db.collection('legalDocuments').doc(item._id).update({
        data: {
          isCurrent: false,
          updatedAt: now,
          updatedBy: operatorConfig.operatorId
        }
      }))
  )

  const beforeSnapshot = buildLegalDocumentDetail(document)
  const writeData = {
    status: 'published',
    isCurrent: true,
    htmlSnapshot,
    plainTextSnapshot,
    hash,
    publishedAt: now,
    effectiveAt: normalizeDate(document.effectiveAt, now),
    operatorId: operatorConfig.operatorId,
    updatedBy: operatorConfig.operatorId,
    updatedAt: now
  }

  await db.collection('legalDocuments').doc(document._id).update({
    data: writeData
  })

  const saved = await safeGetOne('legalDocuments', { docId }) || {
    ...document,
    ...writeData
  }
  const afterSnapshot = buildLegalDocumentDetail(saved)

  await appendAuditLog(
    operatorConfig.operatorId,
    'publish_legal_document',
    'legal_document',
    docId,
    beforeSnapshot,
    afterSnapshot,
    toText(event.reason || '发布协议'),
    now
  )

  return {
    ok: true,
    operatorId: operatorConfig.operatorId,
    action: 'published',
    document: buildLegalDocumentSummary(saved)
  }
}
