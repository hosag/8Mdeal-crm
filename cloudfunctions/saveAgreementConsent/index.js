const cloud = require('wx-server-sdk')
const {
  toText,
  normalizeDocType,
  normalizeVersion
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

function normalizeMeta(value, fallback = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    ...fallback,
    ...source,
    docType: normalizeDocType(source.docType || fallback.docType),
    title: toText(source.title || fallback.title),
    hash: toText(source.hash || fallback.hash),
    sourcePage: toText(source.sourcePage || fallback.sourcePage),
    triggerScene: toText(source.triggerScene || fallback.triggerScene)
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = toText(wxContext.OPENID)
  if (!openid) {
    throw new Error('ACCOUNT_NOT_INITIALIZED: 无法解析当前微信身份')
  }

  const agreementType = normalizeDocType(event.agreementType || event.docType)
  const version = normalizeVersion(event.version)
  if (!agreementType) {
    throw new Error('AGREEMENT_TYPE_REQUIRED: 缺少协议类型')
  }
  if (!version) {
    throw new Error('AGREEMENT_VERSION_REQUIRED: 缺少协议版本号')
  }

  const identity = await safeGetOne('accountIdentities', {
    provider: 'wechat_mp',
    openid
  })
  if (!identity || !identity.accountId) {
    throw new Error('ACCOUNT_NOT_INITIALIZED: 当前账号尚未初始化')
  }

  const document = await safeGetOne('legalDocuments', {
    docType: agreementType,
    version,
    status: 'published'
  })
  if (!document) {
    throw new Error('LEGAL_DOCUMENT_NOT_FOUND: 当前协议版本不存在')
  }

  const now = new Date()
  const existing = await safeGetOne('agreementConsents', {
    accountId: identity.accountId,
    agreementType,
    version
  }, {
    orderByField: 'acceptedAt',
    orderByDirection: 'desc'
  })

  const meta = normalizeMeta(event.meta, {
    docType: agreementType,
    title: document.title,
    hash: document.hash,
    sourcePage: '',
    triggerScene: ''
  })

  if (existing && existing._id) {
    await db.collection('agreementConsents').doc(existing._id).update({
      data: {
        acceptedAt: now,
        clientType: 'mini_program',
        meta,
        updatedAt: now
      }
    })

    return {
      ok: true,
      accountId: identity.accountId,
      agreementType,
      version,
      acceptedAt: now.toISOString()
    }
  }

  await db.collection('agreementConsents').add({
    data: {
      accountId: identity.accountId,
      agreementType,
      version,
      acceptedAt: now,
      clientType: 'mini_program',
      ipHint: '',
      meta,
      createdAt: now,
      updatedAt: now
    }
  })

  return {
    ok: true,
    accountId: identity.accountId,
    agreementType,
    version,
    acceptedAt: now.toISOString()
  }
}
