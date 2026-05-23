const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

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

function startOfDay(date = new Date()) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function startOfPrevMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1)
}

function endOfPrevMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 0, 23, 59, 59, 999)
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

function formatMonthDelta(current, previous) {
  const delta = Number(current || 0) - Number(previous || 0)
  if (!delta) {
    return '较上月持平'
  }

  return delta > 0 ? `较上月 +${delta}` : `较上月 ${delta}`
}

function formatDateLabel(value, now = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '未安排'
  }

  const today = startOfDay(now).getTime()
  const target = startOfDay(date).getTime()
  const diff = Math.round((target - today) / 86400000)

  if (diff === 0) {
    return '今天'
  }

  if (diff === 1) {
    return '明天'
  }

  if (diff === -1) {
    return '昨天'
  }

  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${month}-${day}`
}

function formatTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${hour}:${minute}`
}

function parseDateTime(value) {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  const text = String(value).trim()
  if (!text) {
    return null
  }

  const normalized = text.includes('T') ? text : text.replace(' ', 'T')
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function isTaskClosed(status) {
  return status === 'done' || status === 'canceled'
}

function isClosedProject(project) {
  const stage = String(project && project.stage || '').trim()
  return stage === '成交' || stage === '流失' || !!(project && project.isClosed)
}

function buildTaskStats(tasks, now = new Date()) {
  const list = Array.isArray(tasks) ? tasks : []
  const openTasks = list.filter((task) => !isTaskClosed(task.status))
  const overdueCount = openTasks.filter((task) => {
    const dueAt = parseDateTime(task.dueAt)
    return dueAt && dueAt.getTime() < now.getTime()
  }).length
  const topTask = openTasks
    .map((task) => ({
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
    topTask
  }
}

function getTaskTypeLabel(type) {
  const labelMap = {
    send_solution: '待发方案',
    send_quote: '待报价',
    demo: '待演示',
    report_solution: '待汇报方案',
    business_negotiation: '待商务谈判',
    research: '待调研',
    callback: '待回访',
    meeting: '待约会面',
    contract: '待签约',
    collect_info: '补充信息',
    other: '其他动作'
  }

  return labelMap[String(type || '').trim()] || '其他动作'
}

function getTaskPriorityLabel(priority) {
  const labelMap = {
    high: '高优先',
    normal: '常规',
    low: '低优先'
  }

  return labelMap[String(priority || '').trim()] || '常规'
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '待安排'
  }

  return `${formatDateLabel(date)} ${formatTime(date)}`
}

function computeTaskUrgency(status, dueAt, priority, now = new Date()) {
  if (status === 'done' || status === 'canceled') {
    return {
      code: 'closed',
      text: status === 'done' ? '已完成' : '已取消',
      badgeClass: '',
      sortWeight: Number.MAX_SAFE_INTEGER
    }
  }

  if (!dueAt) {
    return {
      code: 'unscheduled',
      text: '待安排',
      badgeClass: '',
      sortWeight: Number.MAX_SAFE_INTEGER - 10
    }
  }

  const diff = dueAt.getTime() - now.getTime()
  const priorityWeight = priority === 'high' ? -3 : (priority === 'normal' ? -2 : -1)
  if (diff < 0) {
    return {
      code: 'overdue',
      text: '已逾期',
      badgeClass: 'is-danger',
      sortWeight: diff + priorityWeight
    }
  }

  const dayDiff = Math.round((startOfDay(dueAt).getTime() - startOfDay(now).getTime()) / 86400000)
  if (dayDiff === 0) {
    return {
      code: 'today',
      text: '今天处理',
      badgeClass: 'is-brand',
      sortWeight: diff + priorityWeight
    }
  }

  if (dayDiff === 1) {
    return {
      code: 'tomorrow',
      text: '提前准备',
      badgeClass: 'is-soft',
      sortWeight: diff + priorityWeight + 1000
    }
  }

  return {
    code: 'upcoming',
    text: '待处理',
    badgeClass: '',
    sortWeight: diff + priorityWeight + 2000
  }
}

function buildTaskFocus(task, project, urgency) {
  if (urgency.code === 'overdue') {
    return '这条动作已过计划时间，当前处于逾期状态。'
  }

  if (task.type === 'contract' || task.type === 'business_negotiation') {
    return '当前已经进入签约动作，可同步确认条款、金额和落款时间。'
  }

  if (task.type === 'send_quote') {
    return '当前是报价动作，确认版本后发出并留存回执。'
  }

  if (task.type === 'send_solution' || task.type === 'report_solution') {
    return '方案类动作最好一次发全，避免客户来回追问版本差异。'
  }

  if (task.type === 'demo') {
    return '演示类动作重点在场景和决策人，演示后及时记录真实反馈。'
  }

  if (task.type === 'research') {
    return '调研类动作先把需求边界、预算口径和关键人补清楚。'
  }

  if (task.type === 'callback') {
    return '回访类动作关键在节奏，不要只记结果，顺手补清对方反馈。'
  }

  if (project.isSharedProject) {
    return `这是 ${project.sharedFromName || '分享方'} 外发给你的项目动作，推进后记得把结果写回时间线。`
  }

  return '完成动作后，顺手回填结果并补下一步动作，首页节奏会自动往前推。'
}

function buildTaskBoard(taskMap, projectMap, now = new Date()) {
  const cards = []

  Object.keys(taskMap).forEach((projectId) => {
    const project = projectMap[projectId]
    const list = Array.isArray(taskMap[projectId]) ? taskMap[projectId] : []

    list.forEach((task) => {
      if (!project || isClosedProject(project) || isTaskClosed(task.status)) {
        return
      }

      const dueAt = parseDateTime(task.dueAt)
      const urgency = computeTaskUrgency(task.status, dueAt, task.priority, now)

      cards.push({
        id: task._id,
        projectId,
        title: String(task.title || '').trim() || '未命名动作',
        projectName: project.projectName || '未命名项目',
        clientName: project.clientName || '未填写客户',
        taskTypeLabel: getTaskTypeLabel(task.type),
        priorityLabel: getTaskPriorityLabel(task.priority),
        urgencyText: urgency.text,
        urgencyBadgeClass: urgency.badgeClass,
        dueText: task.dueDateText || formatDateTime(dueAt),
        ownerLabel: project.isSharedProject
          ? `${project.sharedFromName || '分享方'} 外发给我`
          : '我负责推进',
        ownerBadgeClass: project.isSharedProject ? 'is-brand' : '',
        stage: project.stage || '线索',
        amount: formatAmount(project.estimatedAmount),
        nextFollowUpText: task.dueDateText || formatDateTime(dueAt),
        focusText: buildTaskFocus(task, project, urgency),
        summaryText: String(task.description || '').trim() || '可补充结果说明，用于后续复盘。',
        canFollowUp: true,
        sortWeight: urgency.sortWeight,
        isOverdue: urgency.code === 'overdue',
        isToday: urgency.code === 'today'
      })
    })
  })

  cards.sort((left, right) => left.sortWeight - right.sortWeight)

  const openCount = cards.length
  const overdueCount = cards.filter((item) => item.isOverdue).length
  const todayCount = cards.filter((item) => item.isToday).length

  return {
    summary: {
      openCount,
      overdueCount,
      todayCount
    },
    cards: cards.slice(0, 10)
  }
}

function pushTimelineEvent(events, dateValue, time, title, desc, projectId) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue)
  if (Number.isNaN(date.getTime())) {
    return
  }

  events.push({
    sortTime: date,
    date: formatDateLabel(date),
    item: {
      time: time || formatTime(date),
      title,
      desc,
      projectId: projectId || ''
    }
  })
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = String(wxContext.OPENID || '').trim()
  const now = new Date()
  const monthStart = startOfMonth(now)
  const prevMonthStart = startOfPrevMonth(now)
  const prevMonthEnd = endOfPrevMonth(now)

  const projectItems = await safeGetOpenidList('projects', openid, {
    orderByField: 'updatedAt',
    orderByDirection: 'desc'
  })

  const visibleProjects = projectItems.filter((item) => !(item.handoverStatus === 'handed_over' && !item.isSharedProject))
  const activeProjects = visibleProjects.filter((item) => !isClosedProject(item))
  const projectIds = visibleProjects.map((item) => item._id)
  const projectMap = {}
  visibleProjects.forEach((item) => {
    projectMap[item._id] = item
  })

  let followUps = []
  if (projectIds.length) {
    followUps = (await safeGetOpenidList('followUps', openid, {
      orderByField: 'followUpTime',
      orderByDirection: 'desc'
    })).filter((item) => projectMap[item.projectId])
  }

  const taskMap = {}
  if (projectIds.length) {
    ;(await safeGetOpenidList('tasks', openid)).forEach((task) => {
      if (!task || !task.projectId || !projectMap[task.projectId]) {
        return
      }

      if (!taskMap[task.projectId]) {
        taskMap[task.projectId] = []
      }

      taskMap[task.projectId].push(task)
    })
  }

  const latestFollowMap = {}
  followUps.forEach((item) => {
    if (!item || !item.projectId || latestFollowMap[item.projectId]) {
      return
    }

    latestFollowMap[item.projectId] = item
  })

  let deals = []
  if (projectIds.length) {
    deals = (await safeGetOpenidList('deals', openid, {
      orderByField: 'contractDate',
      orderByDirection: 'desc'
    })).filter((item) => projectMap[item.projectId])
  }

  const currentMonthNewCount = visibleProjects.filter((item) => {
    const createdAt = item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt)
    return !Number.isNaN(createdAt.getTime()) && createdAt >= monthStart
  }).length

  const prevMonthNewCount = visibleProjects.filter((item) => {
    const createdAt = item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt)
    return !Number.isNaN(createdAt.getTime()) && createdAt >= prevMonthStart && createdAt <= prevMonthEnd
  }).length

  const closedAmount = visibleProjects.reduce((sum, item) => {
    const isClosed = item.stage === '成交' || item.isClosed || Number(item.actualAmount || 0) > 0
    return isClosed ? sum + Number(item.actualAmount || item.estimatedAmount || 0) : sum
  }, 0)

  const pipelineAmount = visibleProjects.reduce((sum, item) => {
    const isClosed = item.stage === '成交' || item.isClosed
    return isClosed ? sum : sum + Number(item.estimatedAmount || 0)
  }, 0)

  const activeProjectIdSet = new Set(activeProjects.map((item) => item._id))
  const taskDueCount = Object.keys(taskMap).reduce((count, projectId) => {
    if (!activeProjectIdSet.has(projectId)) {
      return count
    }

    const stats = buildTaskStats(taskMap[projectId], now)
    return count + stats.openCount
  }, 0)
  const taskBoard = buildTaskBoard(taskMap, projectMap, now)
  const overdueCount = taskBoard.summary.overdueCount
  const upcomingCount = activeProjects.filter((item) => buildTaskStats(taskMap[item._id], now).openCount > 0).length

  const timelineEvents = []

  visibleProjects.forEach((project) => {
    const createdAt = project.createdAt instanceof Date ? project.createdAt : new Date(project.createdAt)
    if (Number.isNaN(createdAt.getTime())) {
      return
    }

    pushTimelineEvent(
      timelineEvents,
      createdAt,
      formatTime(createdAt),
      `新增项目「${project.projectName || '未命名项目'}」`,
      project.isSharedProject
        ? `${project.sharedFromName || '分享方'} 外发给你，你已接手继续推进。`
        : `已录入客户「${project.clientName || '未填写客户'}」并进入项目池。`,
      project._id
    )
  })

  followUps.slice(0, 10).forEach((followUp) => {
    const project = projectMap[followUp.projectId] || {}
    const method = String(followUp.method || '').trim()
    const isTaskDone = !!followUp.autoGeneratedByTask || method === '任务完成' || method === '动作完成'
    const title = isTaskDone
      ? `${project.projectName || '未命名项目'} · 动作已完成`
      : `${project.projectName || '未命名项目'} · ${method || '跟进'}跟进`
    const summary = String(followUp.aiSummary || '').trim()
    const desc = summary || String(followUp.content || '已新增一条跟进记录').trim()
    pushTimelineEvent(
      timelineEvents,
      followUp.followUpTime,
      formatTime(followUp.followUpTime),
      title,
      desc,
      followUp.projectId
    )
  })

  deals.slice(0, 6).forEach((deal) => {
    const project = projectMap[deal.projectId] || {}
    pushTimelineEvent(
      timelineEvents,
      deal.contractDate,
      '已成交',
      `${project.projectName || deal.projectNameSnapshot || '未命名项目'} · 成交记录`,
      `成交金额 ${formatAmount(deal.actualAmount)}，回款状态 ${deal.paymentStatus || '未回款'}。`,
      deal.projectId
    )
  })

  const timeline = timelineEvents
    .sort((left, right) => right.sortTime.getTime() - left.sortTime.getTime())
    .slice(0, 8)
    .reduce((groups, entry) => {
      const lastGroup = groups[groups.length - 1]
      if (lastGroup && lastGroup.date === entry.date) {
        lastGroup.items.push(entry.item)
      } else {
        groups.push({
          date: entry.date,
          items: [entry.item]
        })
      }
      return groups
    }, [])

  return {
    ok: true,
    metrics: [
      { label: '本月新增', value: String(currentMonthNewCount), note: formatMonthDelta(currentMonthNewCount, prevMonthNewCount) },
      { label: '成交金额', value: formatAmount(closedAmount), note: `在谈池 ${formatAmount(pipelineAmount)}` },
      { label: '推进动作', value: String(taskDueCount), note: `逾期 ${overdueCount} 条 · 涉及 ${upcomingCount} 个项目` }
    ],
    taskBoard,
    todos: [],
    timeline
  }
}
