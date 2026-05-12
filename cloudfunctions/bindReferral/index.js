const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const REFERRAL_REWARD_AI_TOKENS = 100000

function normalizeText(value) {
  return String(value || '').trim()
}

function isCollectionMissingError(error) {
  const message = normalizeText(error && (error.message || error.errMsg || error.errorMessage))
  return /collection not exists|DATABASE_COLLECTION_NOT_EXIST|Db or Table not exist|ResourceNotFound/i.test(message)
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

function isTransferredReadonlyProject(project) {
  return project && project.handoverStatus === 'handed_over' && !project.isSharedProject
}

function parseDate(value) {
  if (!value) {
    return null
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
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

  return Object.values(projectMap).filter((item) => !isTransferredReadonlyProject(item))
}

async function countInviteeVisibleProjects(accountId, openid) {
  const projects = await loadInviteeVisibleProjects(accountId, openid)
  return projects.length
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

exports.main = async (event = {}) => {
  const now = new Date()
  const referrerCode = normalizeText(event.referrerCode || event.code || event.inviteCode).toUpperCase()
  if (!referrerCode) {
    return {
      ok: false,
      code: 'REFERRAL_CODE_EMPTY',
      message: '推荐码为空'
    }
  }

  const { openid, accountId } = await resolveAccountContext()
  const referralCode = await safeGetOne('referralCodes', {
    code: referrerCode,
    status: 'active'
  })

  if (!referralCode || !referralCode._id) {
    return {
      ok: false,
      code: 'REFERRAL_CODE_INVALID',
      message: '推荐链接已失效'
    }
  }

  const referrerAccountId = normalizeText(referralCode.accountId)
  const referrerOpenid = normalizeText(referralCode._openid || referralCode.openid)

  if (!referrerAccountId || referrerAccountId === accountId || referrerOpenid === openid) {
    return {
      ok: false,
      code: 'REFERRAL_SELF_NOT_ALLOWED',
      message: '不能绑定自己的推荐链接'
    }
  }

  const existing = await safeGetOne('referralRelations', {
    inviteeAccountId: accountId
  }, {
    orderByField: 'createdAt',
    orderByDirection: 'asc'
  })

  if (existing && existing._id) {
    const existingStatus = normalizeText(existing.status) || 'pending'
    if (existingStatus !== 'rewarded') {
      const inviteeProjects = await loadInviteeVisibleProjects(accountId, openid)
      if (hasProjectBeforeRelation(inviteeProjects, existing)) {
        await db.collection('referralRelations').doc(existing._id).update({
          data: {
            status: 'blocked',
            blockReason: 'invitee_already_used_project_feature',
            blockedAt: now,
            updatedAt: now
          }
        })
        return {
          ok: false,
          code: 'REFERRAL_INVITEE_NOT_NEW',
          status: 'blocked',
          message: '当前账号已使用过项目功能，不参与新用户推荐奖励',
          inviteeProjectCount: inviteeProjects.length
        }
      }
    }

    return {
      ok: true,
      alreadyBound: true,
      status: existingStatus,
      message: normalizeText(existing.referrerCode) === referrerCode
        ? '推荐关系已确认'
        : '当前账号已绑定过推荐关系',
      rewardAiTokens: Number(existing.rewardAiTokens || REFERRAL_REWARD_AI_TOKENS)
    }
  }

  const inviteeProjectCount = await countInviteeVisibleProjects(accountId, openid)
  if (inviteeProjectCount > 0) {
    return {
      ok: false,
      code: 'REFERRAL_INVITEE_NOT_NEW',
      message: '当前账号已使用过项目功能，不参与新用户推荐奖励',
      inviteeProjectCount
    }
  }

  let result
  try {
    result = await db.collection('referralRelations').add({
      data: {
        _openid: openid,
        referrerAccountId,
        referrerOpenid,
        referrerCode,
        inviteeAccountId: accountId,
        inviteeOpenid: openid,
        status: 'pending',
        rewardAiTokens: REFERRAL_REWARD_AI_TOKENS,
        referrerRewardAiTokens: REFERRAL_REWARD_AI_TOKENS,
        inviteeRewardAiTokens: REFERRAL_REWARD_AI_TOKENS,
        triggerScene: 'first_project_created',
        boundAt: now,
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
    ok: true,
    alreadyBound: false,
    relationId: result._id,
    status: 'pending',
    message: '推荐关系已确认',
    rewardAiTokens: REFERRAL_REWARD_AI_TOKENS
  }
}
