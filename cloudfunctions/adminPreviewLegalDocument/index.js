const cloud = require('wx-server-sdk')
const {
  toText,
  normalizeMarkdownSource,
  renderMarkdownToHtml,
  buildPlainTextSnapshot
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
    throw new Error('BILLING_OPERATOR_FORBIDDEN: 当前无权预览协议正文')
  }
  return config
}

exports.main = async (event = {}) => {
  const operatorConfig = await ensureOperatorAuthorized(event.operatorKey)
  const markdownSource = normalizeMarkdownSource(event.markdownSource)

  return {
    ok: true,
    operatorId: operatorConfig.operatorId,
    contentFormat: 'markdown',
    markdownSource,
    html: renderMarkdownToHtml(markdownSource),
    plainText: buildPlainTextSnapshot(markdownSource)
  }
}
