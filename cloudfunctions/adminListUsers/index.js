const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function toText(value) {
  return String(value || '').trim()
}

function toNumber(value, fallback = 0) {
  const current = Number(value)
  return Number.isFinite(current) ? current : fallback
}

function toBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeLimit(value, fallback = 50, max = 500) {
  const current = Number(value)
  if (!Number.isFinite(current) || current <= 0) {
    return fallback
  }

  return Math.min(max, Math.max(1, Math.floor(current)))
}

function normalizePage(value, fallback = 1) {
  const current = Number(value)
  if (!Number.isFinite(current) || current <= 0) {
    return fallback
  }

  return Math.max(1, Math.floor(current))
}

function resolvePageSize(event = {}) {
  const explicitPageSize = Number(event.pageSize)
  if (Number.isFinite(explicitPageSize) && explicitPageSize > 0) {
    return normalizeLimit(explicitPageSize, 50, 500)
  }
  return normalizeLimit(event.limit, 50, 500)
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

async function safeGetList(collectionName, query = null, options = {}) {
  try {
    const requestedLimit = Number(options.limit)
    const totalLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.floor(requestedLimit)
      : 100
    const batchSize = Math.min(100, totalLimit)
    const data = []

    while (data.length < totalLimit) {
      let request = query ? db.collection(collectionName).where(query) : db.collection(collectionName)
      if (options.orderByField && options.orderByDirection) {
        request = request.orderBy(options.orderByField, options.orderByDirection)
      }
      request = request.skip(data.length).limit(Math.min(batchSize, totalLimit - data.length))
      const result = await request.get()
      const currentData = Array.isArray(result.data) ? result.data : []
      data.push(...currentData)
      if (currentData.length < batchSize) {
        break
      }
    }

    return data
  } catch (error) {
    return []
  }
}

async function safeGetListByIds(collectionName, fieldName, values = [], options = {}) {
  const ids = Array.isArray(values) ? values.map((item) => toText(item)).filter(Boolean).slice(0, 100) : []
  if (!ids.length) {
    return []
  }

  return safeGetList(collectionName, {
    [fieldName]: _.in(ids)
  }, options)
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
    throw new Error('BILLING_OPERATOR_FORBIDDEN: 当前无权访问后台管理列表')
  }

  return config
}

function buildMapByField(list = [], fieldName = '') {
  return (Array.isArray(list) ? list : []).reduce((result, item) => {
    const key = toText(item && item[fieldName])
    if (key && !result[key]) {
      result[key] = item
    }
    return result
  }, {})
}

function formatDateText(value) {
  if (!value) {
    return ''
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toISOString()
}

function buildDisplayProfile(user = {}, account = {}) {
  const wechatNickname = toText(user.wechatNickname || user.nickName)
  const customDisplayName = toText(user.customDisplayName)
  if (customDisplayName) {
    return {
      wechatNickname,
      customDisplayName,
      displayName: customDisplayName,
      displayNameSource: 'custom'
    }
  }
  if (wechatNickname) {
    return {
      wechatNickname,
      customDisplayName,
      displayName: wechatNickname,
      displayNameSource: 'wechat'
    }
  }
  if (toText(account.phone)) {
    return {
      wechatNickname,
      customDisplayName,
      displayName: toText(account.phone),
      displayNameSource: 'phone'
    }
  }
  return {
    wechatNickname,
    customDisplayName,
    displayName: toText(account.accountId),
    displayNameSource: 'account'
  }
}

function matchesKeyword(account, keyword = '', user = {}) {
  const currentKeyword = toText(keyword).toLowerCase()
  if (!currentKeyword) {
    return true
  }

  const displayProfile = buildDisplayProfile(user, account)
  return [
    account.accountId,
    account.phone,
    account.phoneMasked,
    displayProfile.wechatNickname,
    displayProfile.customDisplayName,
    displayProfile.displayName,
    account.status,
    account.currentAccessLevel
  ].some((item) => toText(item).toLowerCase().includes(currentKeyword))
}

function buildUserSummary(account, entitlementsMap, latestSubscriptionMap, latestOrderMap, userMap) {
  const accountId = toText(account && account.accountId)
  const entitlements = entitlementsMap[accountId] || {}
  const latestSubscription = latestSubscriptionMap[accountId] || {}
  const latestOrder = latestOrderMap[accountId] || {}
  const userProfile = userMap[accountId] || {}
  const displayProfile = buildDisplayProfile(userProfile, account || {})

  return {
    accountId,
    status: toText(account && account.status),
    currentAccessLevel: toText(account && account.currentAccessLevel),
    phone: toText(account && account.phone),
    phoneVerified: toBoolean(account && account.phoneVerified),
    wechatNickname: displayProfile.wechatNickname,
    customDisplayName: displayProfile.customDisplayName,
    displayName: displayProfile.displayName,
    displayNameSource: displayProfile.displayNameSource,
    bindStatus: toBoolean(account && account.phoneVerified) ? 'bound' : 'unbound',
    trialStartedAt: formatDateText(account && account.trialStartedAt),
    trialEndsAt: formatDateText(account && account.trialEndsAt),
    createdAt: formatDateText(account && account.createdAt),
    updatedAt: formatDateText(account && account.updatedAt),
    entitlements: {
      bindRequiredForWrite: toBoolean(entitlements.bindRequiredForWrite),
      canCreateProject: toBoolean(entitlements.canCreateProject),
      canUseSpeechToText: toBoolean(entitlements.canUseSpeechToText),
      canUseAi: toBoolean(entitlements.canUseAi),
      canShareOut: toBoolean(entitlements.canShareOut),
      projectLimit: toNumber(entitlements.projectLimit, 0),
      currentProjectCount: toNumber(entitlements.currentProjectCount, 0),
      voiceSecondsRemaining: toNumber(entitlements.voiceSecondsRemaining, 0),
      aiTokensRemaining: toNumber(entitlements.aiTokensRemaining, 0),
      effectiveTo: toText(entitlements.effectiveTo),
      reasonSummary: toText(entitlements.reasonSummary)
    },
    latestSubscription: {
      planCode: toText(latestSubscription.planCode),
      planName: toText(latestSubscription.planName),
      status: toText(latestSubscription.status),
      expiresAt: formatDateText(latestSubscription.expiresAt)
    },
    latestOrder: {
      orderId: toText(latestOrder.orderId),
      title: toText(latestOrder.title),
      status: toText(latestOrder.status),
      updatedAt: formatDateText(latestOrder.updatedAt)
    }
  }
}

function buildPageInfo(page, pageSize, total, returned) {
  const safeTotal = Math.max(0, Math.floor(toNumber(total, 0)))
  const safePageSize = Math.max(1, Math.floor(toNumber(pageSize, 50)))
  const totalPages = Math.max(1, safeTotal > 0 ? Math.ceil(safeTotal / safePageSize) : 1)
  const safePage = Math.min(Math.max(1, Math.floor(toNumber(page, 1))), totalPages)
  const safeReturned = Math.max(0, Math.floor(toNumber(returned, 0)))
  return {
    page: safePage,
    pageSize: safePageSize,
    total: safeTotal,
    totalPages,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
    returned: safeReturned
  }
}

exports.main = async (event = {}) => {
  const operatorConfig = await ensureOperatorAuthorized(event.operatorKey)
  const keyword = toText(event.keyword)
  const status = toText(event.status)
  const page = normalizePage(event.page, 1)
  const pageSize = resolvePageSize(event)
  const scanLimit = normalizeLimit(event.scanLimit || Math.max(page * pageSize, 200), Math.max(page * pageSize, 200), 2000)

  const accountDocs = await safeGetList('accounts', null, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc',
    limit: scanLimit
  })

  const usersList = await safeGetList('users', null, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc',
    limit: Math.max(scanLimit, 300)
  })
  const userMap = buildMapByField(usersList, 'accountId')

  const matchedAccounts = accountDocs
    .filter((item) => !status || status === 'all' || toText(item.status) === status)
    .filter((item) => matchesKeyword(item, keyword, userMap[toText(item.accountId)] || {}))

  const total = matchedAccounts.length
  const pageInfo = buildPageInfo(page, pageSize, total, 0)
  const pageStart = (pageInfo.page - 1) * pageInfo.pageSize
  const pagedAccounts = matchedAccounts.slice(pageStart, pageStart + pageInfo.pageSize)
  pageInfo.returned = pagedAccounts.length

  const accountIds = pagedAccounts.map((item) => toText(item.accountId)).filter(Boolean)
  const entitlementsList = await safeGetListByIds('entitlements', 'accountId', accountIds, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc',
    limit: Math.max(pageInfo.pageSize * 2, 50)
  })
  const subscriptionsList = await safeGetListByIds('subscriptions', 'accountId', accountIds, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc',
    limit: Math.max(pageInfo.pageSize * 3, 100)
  })
  const ordersList = await safeGetListByIds('orders', 'accountId', accountIds, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc',
    limit: Math.max(pageInfo.pageSize * 3, 100)
  })

  const entitlementsMap = buildMapByField(entitlementsList, 'accountId')
  const latestSubscriptionMap = buildMapByField(subscriptionsList, 'accountId')
  const latestOrderMap = buildMapByField(ordersList, 'accountId')

  return {
    ok: true,
    operatorId: operatorConfig.operatorId,
    total,
    users: pagedAccounts.map((item) => buildUserSummary(item, entitlementsMap, latestSubscriptionMap, latestOrderMap, userMap)),
    pageInfo,
    source: 'CloudBase'
  }
}
