const cloud = require('wx-server-sdk')
const {
  buildLegalDocumentSummary
} = require('./legalDocumentHelper')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async () => {
  const result = await db.collection('legalDocuments').where({
    status: 'published',
    isCurrent: true
  }).orderBy('publishedAt', 'desc').limit(20).get()

  const documents = Array.isArray(result.data)
    ? result.data.map((item) => ({
      docId: item.docId || item._id,
      docType: item.docType,
      title: item.title,
      version: item.version,
      effectiveAt: buildLegalDocumentSummary(item).effectiveAt,
      publishedAt: buildLegalDocumentSummary(item).publishedAt,
      requiresReconsent: item.requiresReconsent === true,
      hash: item.hash || ''
    }))
    : []

  return {
    ok: true,
    documents
  }
}
