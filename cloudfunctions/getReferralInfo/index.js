const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const REFERRAL_REWARD_AI_TOKENS = 100000

function normalizeText(value) {
  return String(value || '').trim()
}

function toDate(value) {
  if (!value) {
    return null
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function toIso(value) {
  const date = toDate(value)
  return date ? date.toISOString() : ''
}

function isCollectionMissingError(error) {
  const message = normalizeText(error && (error.message || error.errMsg || error.errorMessage))
  return /collection not exists|DATABASE_COLLECTION_NOT_EXIST|Db or Table not exist|ResourceNotFound/i.test(message)
}

function parseDate(value) {
  if (!value) {
    return null
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

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

async function safeGetList(collectionName, query, options = {}) {
  try {
    let request = db.collection(collectionName).where(query)
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

async function resolveAccountContext() {
  const wxContext = cloud.getWXContext()
  const openid = normalizeText(wxContext.OPENID)
  if (!openid) {
    throw new Error('ACCOUNT_NOT_INITIALIZED: 无法解析当前微信身份')
  }

  const identity = await safeGetOne('accountIdentities', {
    provider: 'wechat_mp',
    openid
  })
  const accountId = normalizeText(identity && identity.accountId)
  if (!accountId) {
    throw new Error('ACCOUNT_NOT_INITIALIZED: 当前账号尚未初始化')
  }

  return {
    openid,
    accountId
  }
}

function createReferralCode(accountId) {
  const hash = crypto
    .createHash('sha1')
    .update(`${accountId}:${Date.now()}:${Math.random()}`)
    .digest('base64')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase()

  return `BMC${hash.slice(0, 9)}`
}

async function ensureReferralCode(accountId, openid, now) {
  const existing = await safeGetOne('referralCodes', {
    accountId,
    status: 'active'
  }, {
    orderByField: 'createdAt',
    orderByDirection: 'asc'
  })

  if (existing && existing.code) {
    return existing
  }

  for (let index = 0; index < 6; index += 1) {
    const code = createReferralCode(accountId)
    const duplicated = await safeGetOne('referralCodes', {
      code
    })
    if (duplicated) {
      continue
    }

    let result
    try {
      result = await db.collection('referralCodes').add({
        data: {
          _openid: openid,
          accountId,
          code,
          status: 'active',
          rewardAiTokens: REFERRAL_REWARD_AI_TOKENS,
          createdAt: now,
          updatedAt: now
        }
      })
    } catch (error) {
      if (isCollectionMissingError(error)) {
        throw new Error('REFERRAL_COLLECTION_NOT_READY: 推荐功能数据表未就绪，请先创建 referralCodes 和 referralRelations 集合')
      }
      throw error
    }

    return {
      _id: result._id,
      _openid: openid,
      accountId,
      code,
      status: 'active',
      rewardAiTokens: REFERRAL_REWARD_AI_TOKENS,
      createdAt: now,
      updatedAt: now
    }
  }

  throw new Error('REFERRAL_CODE_CREATE_FAILED: 推荐码生成失败，请稍后重试')
}

async function loadReferralRelations(accountId) {
  try {
    const result = await db.collection('referralRelations').where({
      referrerAccountId: accountId
    }).orderBy('createdAt', 'desc').limit(100).get()
    return Array.isArray(result.data) ? result.data : []
  } catch (error) {
    return []
  }
}

async function loadInviteeVisibleProjects(accountId, openid) {
  const queries = [
    safeGetList('projects', {
      ownerAccountId: accountId
    }, {
      limit: 1000
    }),
    safeGetList('projects', {
      accountId
    }, {
      limit: 1000
    })
  ]

  if (openid) {
    queries.push(safeGetList('projects', {
      _openid: openid
    }, {
      limit: 1000
    }))
  }

  const lists = await Promise.all(queries)
  const projectMap = {}
  lists.forEach((list) => {
    list.forEach((item) => {
      const projectId = normalizeText(item && item._id)
      if (!projectId || projectMap[projectId]) {
        return
      }
      projectMap[projectId] = item
    })
  })

  return Object.values(projectMap).filter((item) => {
    const handoverStatus = normalizeText(item && item.handoverStatus)
    return !(handoverStatus === 'handed_over' && !item.isSharedProject)
  })
}

function hasProjectBeforeRelation(projects, relation = {}) {
  const relationAt = parseDate(relation.boundAt || relation.createdAt)
  if (!relationAt) {
    return projects.length > 0
  }

  return projects.some((project) => {
    const projectAt = parseDate(project && (project.createdAt || project.createdTime || project.updatedAt))
    return !projectAt || projectAt.getTime() <= relationAt.getTime()
  })
}

function buildRelationRow(item = {}) {
  const status = normalizeText(item.status)
  const rewarded = status === 'rewarded'
  return {
    relationId: normalizeText(item._id),
    status: status || 'pending',
    statusLabel: rewarded ? '已奖励' : '待完成',
    rewardAiTokens: Number(item.rewardAiTokens || REFERRAL_REWARD_AI_TOKENS),
    boundAt: toIso(item.boundAt || item.createdAt),
    rewardedAt: toIso(item.rewardedAt),
    triggerScene: normalizeText(item.triggerScene),
    title: rewarded ? '朋友已创建首个项目' : '朋友已接受推荐',
    desc: rewarded ? '双方 AI 额度已发放' : '朋友创建第一个项目后，双方各得奖励'
  }
}

exports.main = async () => {
  const now = new Date()
  const { openid, accountId } = await resolveAccountContext()
  const referralCode = await ensureReferralCode(accountId, openid, now)
  const relations = await loadReferralRelations(accountId)
  const relationVisibility = await Promise.all(relations.map(async (item) => {
    const status = normalizeText(item.status)
    if (status === 'blocked') {
      return false
    }
    if (status === 'pending') {
      const inviteeAccountId = normalizeText(item.inviteeAccountId)
      const inviteeOpenid = normalizeText(item.inviteeOpenid || item._openid)
      const inviteeProjects = inviteeAccountId
        ? await loadInviteeVisibleProjects(inviteeAccountId, inviteeOpenid)
        : []
      return !hasProjectBeforeRelation(inviteeProjects, item)
    }
    return true
  }))
  const visibleRelations = relations.filter((item, index) => relationVisibility[index])
  const rewardedCount = visibleRelations.filter((item) => normalizeText(item.status) === 'rewarded').length
  const pendingCount = visibleRelations.filter((item) => normalizeText(item.status) === 'pending').length

  return {
    ok: true,
    accountId,
    code: normalizeText(referralCode.code),
    rewardAiTokens: REFERRAL_REWARD_AI_TOKENS,
    sharePath: `/pages/referral/referral?referrerCode=${encodeURIComponent(normalizeText(referralCode.code))}`,
    stats: {
      invitedCount: visibleRelations.length,
      pendingCount,
      rewardedCount,
      rewardedAiTokens: rewardedCount * REFERRAL_REWARD_AI_TOKENS
    },
    relations: visibleRelations.slice(0, 20).map(buildRelationRow),
    source: 'CloudBase'
  }
}
