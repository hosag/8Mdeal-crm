const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeProjectIds(value) {
  if (!Array.isArray(value)) {
    return []
  }

  const result = []
  value.forEach((item) => {
    const current = normalizeText(item)
    if (current && result.indexOf(current) < 0 && result.length < 60) {
      result.push(current)
    }
  })
  return result
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
  const projectIds = normalizeProjectIds(event.projectIds)

  if (!projectIds.length) {
    return {
      ok: true,
      memoriesByProjectId: {}
    }
  }

  const accountId = await resolveAccountId(wxContext.OPENID)

  let records = []
  try {
    const result = await db.collection('projectAliasMemories').where({
      accountId,
      projectId: db.command.in(projectIds),
      enabled: true
    }).get()
    records = Array.isArray(result.data) ? result.data : []
  } catch (error) {
    return {
      ok: true,
      memoriesByProjectId: {}
    }
  }

  const grouped = {}
  projectIds.forEach((projectId) => {
    grouped[projectId] = []
  })

  records
    .sort((left, right) => {
      const rightScore = Number(right.strength || 0) * 1000 + Number(right.hitCount || 0)
      const leftScore = Number(left.strength || 0) * 1000 + Number(left.hitCount || 0)
      return rightScore - leftScore
    })
    .forEach((item) => {
      const projectId = normalizeText(item.projectId)
      const aliasText = normalizeText(item.aliasText)
      if (!projectId || !aliasText || !grouped[projectId]) {
        return
      }
      if (grouped[projectId].indexOf(aliasText) >= 0 || grouped[projectId].length >= 12) {
        return
      }
      grouped[projectId].push(aliasText)
    })

  return {
    ok: true,
    memoriesByProjectId: grouped
  }
}
