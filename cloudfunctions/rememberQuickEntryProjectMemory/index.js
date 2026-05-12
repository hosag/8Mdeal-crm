const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeAliasText(value) {
  return normalizeText(value).replace(/\s+/g, '')
}

function isValidAliasText(value) {
  const text = normalizeAliasText(value)
  return text.length >= 2 && text.length <= 24
}

function normalizeAliasTexts(value) {
  if (!Array.isArray(value)) {
    return []
  }

  const result = []
  value.forEach((item) => {
    const current = normalizeAliasText(item)
    if (isValidAliasText(current) && result.indexOf(current) < 0 && result.length < 6) {
      result.push(current)
    }
  })
  return result
}

function normalizeSourceType(value) {
  const current = normalizeText(value)
  return ['manual_confirm', 'ai_high_confidence', 'speech_variant'].includes(current)
    ? current
    : 'manual_confirm'
}

async function resolveAccountId(openid) {
  const identityResult = await db.collection('accountIdentities').where({
    provider: 'wechat_mp',
    openid
  }).limit(1).get()
  const identity = identityResult.data[0] || null
  const accountId = normalizeText(identity && identity.accountId)
  if (!accountId) {
    throw new Error('ACCOUNT_NOT_INITIALIZED: 当前账号尚未初始化，请重新进入小程序后再试')
  }
  return accountId
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const projectId = normalizeText(event.projectId)
  const aliasTexts = normalizeAliasTexts(event.aliasTexts)
  const sourceType = normalizeSourceType(event.sourceType)

  if (!projectId || !aliasTexts.length) {
    return {
      ok: true,
      acceptedAliases: []
    }
  }

  const accountId = await resolveAccountId(wxContext.OPENID)
  const now = new Date()
  const acceptedAliases = []

  for (const aliasText of aliasTexts) {
    const normalizedAliasText = aliasText.toLowerCase()
    try {
      const existingResult = await db.collection('projectAliasMemories').where({
        accountId,
        projectId,
        normalizedAliasText
      }).limit(1).get()
      const existing = existingResult.data[0] || null

      if (existing && existing._id) {
        await db.collection('projectAliasMemories').doc(existing._id).update({
          data: {
            aliasText,
            sourceType,
            enabled: true,
            hitCount: Number(existing.hitCount || 0) + 1,
            strength: Math.min(10, Number(existing.strength || 0) + (sourceType === 'manual_confirm' ? 2 : 1)),
            lastUsedAt: now,
            updatedAt: now
          }
        })
      } else {
        await db.collection('projectAliasMemories').add({
          data: {
            accountId,
            projectId,
            aliasText,
            normalizedAliasText,
            sourceType,
            hitCount: 1,
            strength: sourceType === 'manual_confirm' ? 4 : 2,
            enabled: true,
            createdAt: now,
            updatedAt: now,
            lastUsedAt: now
          }
        })
      }
      acceptedAliases.push(aliasText)
    } catch (error) {
      // ignore single-alias write failures to keep flash entry smooth
    }
  }

  return {
    ok: true,
    acceptedAliases
  }
}
