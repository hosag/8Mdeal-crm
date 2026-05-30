const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function extractErrorMessage(error) {
  if (!error) {
    return ''
  }

  if (typeof error === 'string') {
    return error.trim()
  }

  return String(error.errMsg || error.message || '').trim()
}

function isMissingCollectionError(error) {
  const message = extractErrorMessage(error)
  return /collection/i.test(message) && /not exist|not exists|does not exist|不存在/i.test(message)
}

async function safeGetOpenidList(collectionName, openid, options = {}) {
  try {
    let request = db.collection(collectionName).where({
      _openid: openid
    })

    if (options.orderByField && options.orderByDirection) {
      request = request.orderBy(options.orderByField, options.orderByDirection)
    }

    const result = await request.get()
    return Array.isArray(result.data) ? result.data : []
  } catch (error) {
    if (isMissingCollectionError(error)) {
      return []
    }

    throw error
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
    if (isMissingCollectionError(error)) {
      return []
    }

    throw error
  }
}

function normalizeText(value) {
  return String(value || '').trim()
}

function maskOpenid(value) {
  const text = normalizeText(value)
  if (!text) {
    return ''
  }

  return text.length <= 8 ? text : `${text.slice(0, 4)}...${text.slice(-4)}`
}

function uniqueValues(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => normalizeText(value))
    .filter(Boolean))]
}

function getSortableTime(value) {
  const date = parseDateTime(value)
  return date ? date.getTime() : 0
}

function chunkList(values, size = 20) {
  const list = Array.isArray(values) ? values : []
  const chunks = []
  for (let index = 0; index < list.length; index += size) {
    chunks.push(list.slice(index, index + size))
  }
  return chunks
}

async function resolveAccountScope(openid) {
  const identity = await safeGetList('accountIdentities', {
    provider: 'wechat_mp',
    openid
  }, {
    limit: 1
  }).then((items) => items[0] || null)
  const primaryAccountId = normalizeText(identity && identity.accountId)
  const accountIds = primaryAccountId ? [primaryAccountId] : []

  const account = primaryAccountId
    ? (await safeGetList('accounts', { accountId: primaryAccountId }, { limit: 1 }))[0] || null
    : null
  const phone = normalizeText(account && account.phone)

  if (phone && account && account.phoneVerified === true) {
    const phoneAccounts = await safeGetList('accounts', {
      phone,
      phoneVerified: true
    }, {
      limit: 100
    })

    phoneAccounts.forEach((item) => {
      accountIds.push(item && item.accountId)
    })
  }

  return {
    primaryAccountId,
    accountIds: uniqueValues(accountIds)
  }
}

async function loadScopedProjects(openid, accountIds, debugMeta = null) {
  const projectMap = {}
  const lists = []

  if (openid) {
    const projectsByOpenid = await safeGetList('projects', {
      _openid: openid
    }, {
      limit: 1000
    })
    if (debugMeta) {
      debugMeta.projectsByOpenid = projectsByOpenid.length
    }
    lists.push(projectsByOpenid)
  }

  if (accountIds.length) {
    const projectsByOwnerAccount = await safeGetList('projects', {
      ownerAccountId: _.in(accountIds)
    }, {
      limit: 1000
    })
    const projectsByAccount = await safeGetList('projects', {
      accountId: _.in(accountIds)
    }, {
      limit: 1000
    })
    if (debugMeta) {
      debugMeta.projectsByOwnerAccount = projectsByOwnerAccount.length
      debugMeta.projectsByAccount = projectsByAccount.length
    }
    lists.push(projectsByOwnerAccount)
    lists.push(projectsByAccount)
  }

  lists.forEach((list) => {
    ;(Array.isArray(list) ? list : []).forEach((item) => {
      const key = normalizeText(item && item._id)
      if (key && !projectMap[key]) {
        projectMap[key] = item
      }
    })
  })

  return Object.values(projectMap).sort((left, right) => {
    return getSortableTime(right.updatedAt || right.createdAt) - getSortableTime(left.updatedAt || left.createdAt)
  })
}

async function safeGetProjectRelatedList(collectionName, projectIds, options = {}) {
  const ids = uniqueValues(projectIds)
  if (!ids.length) {
    return []
  }

  const results = []
  for (const chunk of chunkList(ids)) {
    results.push(...await safeGetList(collectionName, {
      projectId: _.in(chunk)
    }, options))
  }

  return results
}

function startOfDay(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function computeDormantDays(value, now = new Date()) {
  const date = parseDateTime(value)
  if (!date) {
    return 0
  }

  return Math.max(0, Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86400000))
}

function parseDateTime(value) {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatAmount(value) {
  const amount = Number(value || 0)
  if (!amount) {
    return '0'
  }
  if (amount >= 10000) {
    const wan = amount / 10000
    return `${Number.isInteger(wan) ? wan : wan.toFixed(1)}万`
  }
  return String(amount)
}

function formatDateTime(value) {
  if (!value) {
    return '刚刚更新'
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '刚刚更新'
  }

  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

function computeProgress(stage) {
  const progressMap = {
    线索: 18,
    洽谈: 36,
    方案: 58,
    商务: 82,
    成交: 100,
    流失: 0
  }

  return progressMap[stage] || 12
}

function parseBoolean(value) {
  if (typeof value === 'boolean') {
    return value
  }

  const text = normalizeText(value).toLowerCase()
  return text === '1' || text === 'true' || text === 'yes'
}

function computeTaskStatus(stage, taskStats, now = new Date()) {
  if (isClosedProjectStage(stage)) {
    return {
      code: 'closed',
      text: stage === '成交' ? '已成交' : '已流失'
    }
  }

  const stats = taskStats || {}
  const openCount = Number(stats.openCount || 0)
  const nextTaskDueAt = parseDateTime(stats.nextTaskDueAt)
  if (!openCount) {
    return {
      code: 'unplanned',
      text: '待补动作'
    }
  }

  if (Number(stats.overdueCount || 0) > 0) {
    return {
      code: 'overdue',
      text: '优先处理'
    }
  }

  if (!nextTaskDueAt) {
    return {
      code: 'upcoming',
      text: '待处理'
    }
  }

  const diff = Math.round((startOfDay(nextTaskDueAt).getTime() - startOfDay(now).getTime()) / 86400000)
  if (diff < 0) {
    return {
      code: 'overdue',
      text: '优先处理'
    }
  }

  if (diff === 0) {
    return {
      code: 'today',
      text: '今天处理'
    }
  }

  return {
    code: 'upcoming',
    text: diff === 1 ? '提前准备' : '待处理'
  }
}

function isClosedProjectStage(stage) {
  const current = normalizeText(stage)
  return current === '成交' || current === '流失'
}

function buildReviewSummary(aiReview, stage) {
  const review = aiReview && typeof aiReview === 'object' && !Array.isArray(aiReview) ? aiReview : null
  if (!review) {
    return ''
  }

  const candidates = []
  if (stage === '成交') {
    candidates.push(
      ...(Array.isArray(review.reusableLessons) ? review.reusableLessons : []),
      ...(Array.isArray(review.effectiveActions) ? review.effectiveActions : []),
      ...(Array.isArray(review.turningPoints) ? review.turningPoints : [])
    )
  } else {
    candidates.push(
      ...(Array.isArray(review.lossReasons) ? review.lossReasons : []),
      ...(Array.isArray(review.slowdownPoints) ? review.slowdownPoints : [])
    )
    if (review.reactivationAdvice) {
      candidates.push(review.reactivationAdvice)
    }
  }

  candidates.push(review.reviewOverview)
  return normalizeText(candidates.find((item) => normalizeText(item)))
}

function getStageFocus(stage, isSharedProject) {
  if (isSharedProject) {
    return '接手后先确认共享历史，再继续推进'
  }

  const focusMap = {
    线索: '先确认客户背景、真实需求和决策链路',
    洽谈: '把需求边界和关键联系人补完整',
    方案: '推动方案确认，准备商务前置条件',
    商务: '围绕报价、合同条款和预算拍板推进',
    成交: '跟进回款、交付与复盘沉淀',
    流失: '沉淀流失原因，保留后续再激活机会'
  }

  return focusMap[stage] || '围绕当前阶段继续推进关键动作'
}

function isTaskClosed(status) {
  return status === 'done' || status === 'canceled'
}

function buildTaskStats(tasks) {
  const list = Array.isArray(tasks) ? tasks : []
  const now = new Date()
  const openTasks = list.filter((task) => !isTaskClosed(task.status))
  const openTaskTypes = [...new Set(openTasks
    .map((task) => String(task.type || '').trim())
    .filter(Boolean))]
  const overdueCount = openTasks.filter((task) => {
    const dueAt = parseDateTime(task.dueAt)
    return dueAt && dueAt.getTime() < now.getTime()
  }).length
  const nextTask = openTasks
    .map((task) => ({
      id: task._id,
      title: String(task.title || '').trim(),
      dueText: String(task.dueDateText || '').trim(),
      dueAt: parseDateTime(task.dueAt)
    }))
    .filter((task) => task.title)
    .sort((left, right) => {
      const leftTime = left.dueAt ? left.dueAt.getTime() : Number.MAX_SAFE_INTEGER
      const rightTime = right.dueAt ? right.dueAt.getTime() : Number.MAX_SAFE_INTEGER
      return leftTime - rightTime
    })[0] || null

  return {
    openCount: openTasks.length,
    overdueCount,
    openTaskTypes,
    nextTaskId: nextTask ? nextTask.id : '',
    nextTaskTitle: nextTask ? nextTask.title : '',
    nextTaskDueText: nextTask ? nextTask.dueText : '',
    nextTaskDueAt: nextTask && nextTask.dueAt ? nextTask.dueAt.toISOString() : ''
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const now = new Date()
  const includeReadonlySharedOut = parseBoolean(event.includeReadonlySharedOut)
  const debugEnabled = parseBoolean(event.debug)
  const debugMeta = debugEnabled
    ? {
        openidMasked: maskOpenid(wxContext.OPENID),
        accountIds: [],
        projectsByOpenid: 0,
        projectsByOwnerAccount: 0,
        projectsByAccount: 0,
        mergedProjectCount: 0,
        visibleProjectCount: 0
      }
    : null

  const accountScope = await resolveAccountScope(wxContext.OPENID)
  if (debugMeta) {
    debugMeta.primaryAccountId = accountScope.primaryAccountId
    debugMeta.accountIds = accountScope.accountIds
  }
  const projectItems = await loadScopedProjects(wxContext.OPENID, accountScope.accountIds, debugMeta)

  const visibleProjects = includeReadonlySharedOut
    ? projectItems
    : projectItems.filter((item) => !(item.handoverStatus === 'handed_over' && !item.isSharedProject))
  if (debugMeta) {
    debugMeta.mergedProjectCount = projectItems.length
    debugMeta.visibleProjectCount = visibleProjects.length
  }
  const projectIds = visibleProjects.map((item) => item._id)
  const latestFollowMap = {}

  if (projectIds.length) {
    ;(await safeGetProjectRelatedList('followUps', projectIds, {
      orderByField: 'followUpTime',
      orderByDirection: 'desc'
    })).forEach((followUp) => {
      if (!followUp || !followUp.projectId || latestFollowMap[followUp.projectId]) {
        return
      }

      latestFollowMap[followUp.projectId] = followUp
    })
  }

  const taskStatsMap = {}
  if (projectIds.length) {
    ;(await safeGetProjectRelatedList('tasks', projectIds)).forEach((task) => {
      if (!task || !task.projectId || projectIds.indexOf(task.projectId) === -1) {
        return
      }

      if (!taskStatsMap[task.projectId]) {
        taskStatsMap[task.projectId] = []
      }

      taskStatsMap[task.projectId].push(task)
    })
  }

  return {
    ok: true,
    debug: debugMeta,
    projects: visibleProjects.map((item) => {
      const updatedAt = parseDateTime(item.updatedAt || item.createdAt)
      const contactNames = Array.isArray(item.contacts)
        ? item.contacts
          .map((contact) => String(contact.name || '').trim())
          .filter(Boolean)
        : []
      const latestFollow = latestFollowMap[item._id] || null
      const latestSummary = String((latestFollow && (latestFollow.aiSummary || latestFollow.content)) || '').trim()
      const rawTaskStats = buildTaskStats(taskStatsMap[item._id])
      const nextStatus = computeTaskStatus(item.stage, rawTaskStats, now)
      const latestFollowAt = parseDateTime(latestFollow && (latestFollow.followUpTime || latestFollow.createdAt))
      const lastActiveAt = latestFollowAt || updatedAt
      const dormantDays = computeDormantDays(lastActiveAt, now)
      const isClosed = isClosedProjectStage(item.stage) || item.isClosed === true
      const isReadOnlySharedOut = item.handoverStatus === 'handed_over' && !item.isSharedProject
      const ownerType = item.isSharedProject
        ? 'shared_in'
        : (isReadOnlySharedOut ? 'shared_out_readonly' : 'owned')
      const handoverToName = normalizeText(item.handoverToName)
      const canEditProject = !isReadOnlySharedOut
      const aiReview = item.aiReview && typeof item.aiReview === 'object' ? item.aiReview : null
      const closedStageText = item.stage === '成交' ? '已成交' : (item.stage === '流失' ? '已流失' : '已关闭')
      const reviewSummary = buildReviewSummary(aiReview, item.stage)
      const closedSummaryText = reviewSummary || `${closedStageText}，待复盘`
      const taskStats = isClosed
        ? {
            openCount: 0,
            overdueCount: 0,
            openTaskTypes: [],
            nextTaskId: '',
            nextTaskTitle: '',
            nextTaskDueText: '',
            nextTaskDueAt: ''
          }
        : rawTaskStats

      return {
        id: item._id,
        name: item.projectName || '未命名项目',
        client: item.clientName || '未填写客户',
        voiceAliases: Array.isArray(item.voiceAliases)
          ? item.voiceAliases.map((alias) => String(alias || '').trim()).filter(Boolean)
          : [],
        stage: item.stage || '线索',
        next: taskStats.nextTaskTitle
          ? `推进任务 ${taskStats.nextTaskTitle}${taskStats.nextTaskDueText ? ` · 截止 ${taskStats.nextTaskDueText}` : ''}`
          : (isClosed ? closedStageText : '暂无推进任务'),
        nextFollowUpAt: '',
        nextStatus: nextStatus.code,
        nextStatusText: nextStatus.text,
        amount: formatAmount(item.estimatedAmount),
        amountValue: Number(item.estimatedAmount || 0),
        commission: formatAmount(item.expectedCommission),
        commissionValue: Number(item.expectedCommission || 0),
        latest: formatDateTime(updatedAt || item.updatedAt || item.createdAt),
        updatedAtRaw: updatedAt ? updatedAt.toISOString() : '',
        lastActiveAt: lastActiveAt ? lastActiveAt.toISOString() : '',
        lastActiveText: formatDateTime(lastActiveAt || updatedAt || item.updatedAt || item.createdAt),
        dormantDays,
        showAiWakeAction: canEditProject && !isClosed && dormantDays >= 7,
        progress: computeProgress(item.stage),
        tag: item.isSharedProject
          ? '外发给我'
          : (isReadOnlySharedOut ? '已转交' : '我创建'),
        ownerType,
        ownerLabel: item.isSharedProject
          ? `${item.sharedFromName || '分享方'} 外发给我`
          : (isReadOnlySharedOut ? `已转交给 ${handoverToName || '接手方'}` : '我负责推进'),
        contactCount: contactNames.length,
        contactNames,
        tags: Array.isArray(item.tags) ? item.tags : [],
        sharedFromName: item.sharedFromName || '',
        handoverToName,
        description: String(item.description || '').trim(),
        focusText: isReadOnlySharedOut
          ? `项目已转交给 ${handoverToName || '接手方'}，当前仅保留只读追踪。`
          : (isClosed ? `${closedStageText}，${aiReview ? '已复盘' : '待复盘'}` : getStageFocus(item.stage || '线索', !!item.isSharedProject)),
        latestSummary: isClosed ? closedSummaryText : (latestSummary || '当前还没有跟进摘要'),
        isClosedProject: isClosed,
        closedStageText,
        reviewStatusText: aiReview ? '已复盘' : '待复盘',
        closedSummaryText,
        openTaskCount: taskStats.openCount,
        overdueTaskCount: taskStats.overdueCount,
        openTaskTypes: taskStats.openTaskTypes,
        nextTaskId: taskStats.nextTaskId,
        nextTaskTitle: taskStats.nextTaskTitle,
        nextTaskDueText: taskStats.nextTaskDueText,
        nextTaskDueAt: taskStats.nextTaskDueAt,
        canEditProject,
        canAdvanceProject: canEditProject && !isClosed,
        canShareProject: canEditProject,
        canManageTasks: canEditProject && !isClosed,
        canMarkDeal: canEditProject && !isClosed,
        canReviewProject: canEditProject && isClosed,
        isReadOnlySharedOut,
        aiReview,
        reviewActionText: aiReview ? '查看复盘' : 'AI复盘'
      }
    })
  }
}
