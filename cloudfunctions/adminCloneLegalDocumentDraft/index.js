const cloud = require('wx-server-sdk')
const {
  toText,
  normalizeVersion,
  normalizeDocId,
  buildLegalDocumentSummary,
  buildLegalDocumentDetail
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
    throw new Error('BILLING_OPERATOR_FORBIDDEN: 当前无权复制协议草稿')
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
    // Keep draft cloning available even if audit logs are not deployed yet.
  }
}

exports.main = async (event = {}) => {
  const operatorConfig = await ensureOperatorAuthorized(event.operatorKey)
  const sourceDocId = toText(event.sourceDocId)
  const nextVersion = normalizeVersion(event.nextVersion)
  const now = new Date()

  if (!sourceDocId) {
    throw new Error('LEGAL_DOCUMENT_SOURCE_REQUIRED: 缺少来源协议')
  }
  if (!nextVersion) {
    throw new Error('LEGAL_DOCUMENT_VERSION_REQUIRED: 缺少新版本号')
  }

  const sourceDocument = await safeGetOne('legalDocuments', {
    docId: sourceDocId
  })
  if (!sourceDocument) {
    throw new Error('LEGAL_DOCUMENT_NOT_FOUND: 来源协议不存在')
  }

  const existingVersion = await safeGetOne('legalDocuments', {
    docType: sourceDocument.docType,
    version: nextVersion
  })
  if (existingVersion) {
    throw new Error('LEGAL_DOCUMENT_VERSION_DUPLICATED: 同类型协议版本号已存在')
  }

  const nextDocId = normalizeDocId('', sourceDocument.docType, nextVersion)
  const nextDocument = {
    docId: nextDocId,
    docType: sourceDocument.docType,
    title: sourceDocument.title,
    version: nextVersion,
    status: 'draft',
    isCurrent: false,
    contentFormat: sourceDocument.contentFormat || 'markdown',
    markdownSource: sourceDocument.markdownSource || '',
    htmlSnapshot: '',
    plainTextSnapshot: '',
    summary: '',
    changeNotes: [],
    requiresReconsent: sourceDocument.requiresReconsent === true,
    effectiveAt: sourceDocument.effectiveAt || now,
    publishedAt: null,
    archivedAt: null,
    hash: '',
    sourceDraftId: sourceDocId,
    previousVersion: toText(sourceDocument.version),
    currentRevision: 1,
    operatorId: operatorConfig.operatorId,
    updatedBy: operatorConfig.operatorId,
    updatedAt: now,
    createdAt: now
  }

  await db.collection('legalDocuments').add({
    data: nextDocument
  })

  const saved = await safeGetOne('legalDocuments', { docId: nextDocId }) || nextDocument

  await appendAuditLog(
    operatorConfig.operatorId,
    'clone_legal_document_draft',
    'legal_document',
    nextDocId,
    buildLegalDocumentDetail(sourceDocument),
    buildLegalDocumentDetail(saved),
    toText(event.reason || '复制协议为新草稿'),
    now
  )

  return {
    ok: true,
    operatorId: operatorConfig.operatorId,
    action: 'cloned',
    document: buildLegalDocumentSummary(saved)
  }
}
