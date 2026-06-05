const cloud = require('wx-server-sdk')
const {
  toText,
  toBoolean,
  normalizeDocType,
  normalizeTitle,
  normalizeVersion,
  normalizeChangeNotes,
  normalizeMarkdownSource,
  normalizeDocId,
  normalizeDate,
  buildLegalDocumentSummary,
  buildLegalDocumentDetail,
  clone
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
    throw new Error('BILLING_OPERATOR_FORBIDDEN: 当前无权维护协议草稿')
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
    // Keep draft writes available even if audit logs are not deployed yet.
  }
}

exports.main = async (event = {}) => {
  const operatorConfig = await ensureOperatorAuthorized(event.operatorKey)
  const now = new Date()
  const docId = toText(event.docId)
  const existing = docId ? await safeGetOne('legalDocuments', { docId }) : null

  if (existing && existing.status === 'published') {
    throw new Error('LEGAL_DOCUMENT_PUBLISHED_READONLY: 已发布版本不可直接编辑，请复制为新草稿')
  }

  const docType = normalizeDocType(event.docType || (existing && existing.docType))
  const version = normalizeVersion(event.version || (existing && existing.version))
  const title = normalizeTitle(event.title || (existing && existing.title), docType)
  const markdownSource = normalizeMarkdownSource(
    Object.prototype.hasOwnProperty.call(event, 'markdownSource')
      ? event.markdownSource
      : (existing && existing.markdownSource)
  )

  if (!docType) {
    throw new Error('LEGAL_DOCUMENT_TYPE_REQUIRED: 缺少协议类型')
  }
  if (!title) {
    throw new Error('LEGAL_DOCUMENT_TITLE_REQUIRED: 缺少协议标题')
  }
  if (!version) {
    throw new Error('LEGAL_DOCUMENT_VERSION_REQUIRED: 缺少协议版本号')
  }
  if (!markdownSource) {
    throw new Error('LEGAL_DOCUMENT_CONTENT_REQUIRED: 缺少协议正文')
  }

  const nextDocId = normalizeDocId(docId || (existing && existing.docId), docType, version)
  const duplicate = await safeGetOne('legalDocuments', {
    docType,
    version
  })
  if (duplicate && toText(duplicate.docId || duplicate._id) !== toText(nextDocId)) {
    throw new Error('LEGAL_DOCUMENT_VERSION_DUPLICATED: 同类型协议版本号已存在')
  }

  const writeData = {
    docId: nextDocId,
    docType,
    title,
    version,
    status: 'draft',
    isCurrent: false,
    contentFormat: 'markdown',
    markdownSource,
    htmlSnapshot: existing && existing.status === 'draft' ? toText(existing.htmlSnapshot) : '',
    plainTextSnapshot: existing && existing.status === 'draft' ? toText(existing.plainTextSnapshot) : '',
    summary: toText(event.summary || (existing && existing.summary)),
    changeNotes: normalizeChangeNotes(
      Object.prototype.hasOwnProperty.call(event, 'changeNotes') ? event.changeNotes : (existing && existing.changeNotes)
    ),
    requiresReconsent: toBoolean(
      Object.prototype.hasOwnProperty.call(event, 'requiresReconsent') ? event.requiresReconsent : (existing && existing.requiresReconsent),
      false
    ),
    effectiveAt: normalizeDate(event.effectiveAt || (existing && existing.effectiveAt), now),
    publishedAt: existing ? existing.publishedAt || null : null,
    archivedAt: existing ? existing.archivedAt || null : null,
    hash: existing ? toText(existing.hash) : '',
    sourceDraftId: toText(event.sourceDraftId || (existing && existing.sourceDraftId)),
    previousVersion: toText(event.previousVersion || (existing && existing.previousVersion)),
    currentRevision: Number(existing && existing.currentRevision ? existing.currentRevision : 0) + 1,
    operatorId: operatorConfig.operatorId,
    updatedBy: operatorConfig.operatorId,
    updatedAt: now
  }

  const beforeSnapshot = existing ? buildLegalDocumentDetail(existing) : {}

  if (existing && existing._id) {
    await db.collection('legalDocuments').doc(existing._id).update({
      data: writeData
    })
  } else {
    await db.collection('legalDocuments').add({
      data: {
        ...writeData,
        createdAt: now
      }
    })
  }

  const saved = await safeGetOne('legalDocuments', { docId: nextDocId }) || {
    ...clone(writeData),
    createdAt: now
  }
  const afterSnapshot = buildLegalDocumentDetail(saved)

  await appendAuditLog(
    operatorConfig.operatorId,
    'upsert_legal_document_draft',
    'legal_document',
    nextDocId,
    beforeSnapshot,
    afterSnapshot,
    toText(event.reason || '维护协议草稿'),
    now
  )

  return {
    ok: true,
    operatorId: operatorConfig.operatorId,
    action: existing && existing._id ? 'updated' : 'created',
    document: buildLegalDocumentSummary(saved)
  }
}
