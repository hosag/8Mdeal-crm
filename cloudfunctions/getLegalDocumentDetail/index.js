const cloud = require('wx-server-sdk')
const {
  toText,
  normalizeDocType,
  normalizeVersion,
  buildLegalDocumentDetail
} = require('./legalDocumentHelper')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

async function safeGetOne(query, options = {}) {
  try {
    let request = db.collection('legalDocuments').where(query)
    if (options.orderByField && options.orderByDirection) {
      request = request.orderBy(options.orderByField, options.orderByDirection)
    }
    const result = await request.limit(1).get()
    return result.data[0] || null
  } catch (error) {
    return null
  }
}

exports.main = async (event = {}) => {
  const docId = toText(event.docId)
  let document = null

  if (docId) {
    document = await safeGetOne({
      docId,
      status: 'published'
    })
  } else {
    const docType = normalizeDocType(event.docType)
    const version = normalizeVersion(event.version)
    if (!docType) {
      throw new Error('LEGAL_DOCUMENT_TYPE_REQUIRED: 缺少协议类型')
    }

    if (version) {
      document = await safeGetOne({
        docType,
        version,
        status: 'published'
      })
    } else {
      document = await safeGetOne({
        docType,
        status: 'published',
        isCurrent: true
      }, {
        orderByField: 'publishedAt',
        orderByDirection: 'desc'
      })
    }
  }

  if (!document) {
    throw new Error('LEGAL_DOCUMENT_NOT_FOUND: 当前协议不存在')
  }

  return {
    ok: true,
    document: {
      docId: document.docId || document._id,
      docType: document.docType,
      title: document.title,
      version: document.version,
      htmlSnapshot: buildLegalDocumentDetail(document).htmlSnapshot,
      effectiveAt: buildLegalDocumentDetail(document).effectiveAt,
      publishedAt: buildLegalDocumentDetail(document).publishedAt,
      requiresReconsent: document.requiresReconsent === true,
      hash: document.hash || ''
    }
  }
}
