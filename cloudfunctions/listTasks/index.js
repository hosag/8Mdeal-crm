const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function normalizeText(value) {
  return String(value || '').trim()
}

function startOfDay(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function parseDateTime(value) {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  const text = normalizeText(value)
  if (!text) {
    return null
  }

  const date = new Date(text.includes('T') ? text : text.replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateLabel(value, now = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '待安排'
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

function formatDateTime(value, now = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '待安排'
  }

  return `${formatDateLabel(date, now)} ${formatTime(date)}`
}

function isTaskClosed(status) {
  const current = normalizeText(status)
  return current === 'done' || current === 'canceled'
}

function isClosedProject(project) {
  const stage = normalizeText(project && project.stage)
  return stage === '成交' || stage === '流失' || !!(project && project.isClosed)
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

  return labelMap[normalizeText(type)] || '其他动作'
}

function getTaskPriorityLabel(priority) {
  const labelMap = {
    high: '高优先',
    normal: '常规',
    low: '低优先'
  }

  return labelMap[normalizeText(priority)] || '常规'
}

function getTaskStatusText(status) {
  const current = normalizeText(status)
  if (current === 'done') {
    return '已完成'
  }
  if (current === 'canceled') {
    return '已取消'
  }
  if (current === 'in_progress') {
    return '处理中'
  }
  return '未完成'
}

function computeTaskUrgency(task, now = new Date()) {
  const status = normalizeText(task && task.status)
  const dueAt = parseDateTime(task && task.dueAt)
  const priority = normalizeText(task && task.priority)
  const updatedAt = parseDateTime(task && (task.updatedAt || task.createdAt))

  if (status === 'done' || status === 'canceled') {
    return {
      code: status,
      text: status === 'done' ? '已完成' : '已取消',
      badgeClass: status === 'done' ? 'is-success' : '',
      sortWeight: Number.MAX_SAFE_INTEGER - (updatedAt ? updatedAt.getTime() : 0)
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

function normalizeFilter(value) {
  const current = normalizeText(value)
  return ['all', 'open', 'overdue', 'today', 'done', 'canceled'].indexOf(current) >= 0 ? current : 'open'
}

function normalizeSort(value) {
  const current = normalizeText(value)
  return ['priority', 'due', 'updated'].indexOf(current) >= 0 ? current : 'priority'
}

function containsKeyword(task, keyword) {
  const currentKeyword = normalizeText(keyword).toLowerCase()
  if (!currentKeyword) {
    return true
  }

  const text = [
    task.title,
    task.description,
    task.resultSummary,
    task.projectName,
    task.clientName,
    task.stage,
    task.typeText,
    task.priorityText,
    task.statusText,
    task.urgencyText
  ].join(' ').toLowerCase()

  return text.indexOf(currentKeyword) >= 0
}

function buildSortWeight(task, sortMode) {
  const dueAt = parseDateTime(task.dueAtRaw)
  const updatedAt = parseDateTime(task.updatedAtRaw)
  if (sortMode === 'due') {
    return dueAt ? dueAt.getTime() : Number.MAX_SAFE_INTEGER
  }

  if (sortMode === 'updated') {
    return -(updatedAt ? updatedAt.getTime() : 0)
  }

  return Number(task.prioritySortWeight || 0)
}

function shouldIncludeTask(task, filter) {
  if (filter === 'all') {
    return true
  }

  if (filter === 'open') {
    return task.status !== 'done' && task.status !== 'canceled'
  }

  if (filter === 'overdue') {
    return task.urgencyCode === 'overdue'
  }

  if (filter === 'today') {
    return task.urgencyCode === 'today'
  }

  if (filter === 'done') {
    return task.status === 'done'
  }

  if (filter === 'canceled') {
    return task.status === 'canceled'
  }

  return true
}

function buildSummary(tasks) {
  const list = Array.isArray(tasks) ? tasks : []
  return {
    totalCount: list.length,
    openCount: list.filter((item) => item.status !== 'done' && item.status !== 'canceled').length,
    overdueCount: list.filter((item) => item.urgencyCode === 'overdue').length,
    todayCount: list.filter((item) => item.urgencyCode === 'today').length,
    doneCount: list.filter((item) => item.status === 'done').length,
    canceledCount: list.filter((item) => item.status === 'canceled').length
  }
}

function buildTaskItem(task, project, now = new Date()) {
  const urgency = computeTaskUrgency(task, now)
  const dueAt = parseDateTime(task.dueAt)
  const updatedAt = parseDateTime(task.updatedAt || task.createdAt)
  const status = normalizeText(task.status) || 'pending'
  const projectName = normalizeText(project && project.projectName) || '未命名项目'
  const clientName = normalizeText(project && project.clientName) || '未填写客户'

  return {
    id: task._id,
    projectId: normalizeText(task.projectId),
    title: normalizeText(task.title) || '未命名动作',
    description: normalizeText(task.description),
    resultSummary: normalizeText(task.resultSummary),
    status,
    statusText: getTaskStatusText(status),
    urgencyCode: urgency.code,
    urgencyText: urgency.text,
    urgencyBadgeClass: urgency.badgeClass,
    dueAtRaw: dueAt ? dueAt.toISOString() : '',
    dueText: normalizeText(task.dueDateText) || formatDateTime(dueAt, now),
    priority: normalizeText(task.priority) || 'normal',
    priorityText: getTaskPriorityLabel(task.priority),
    prioritySortWeight: urgency.sortWeight,
    type: normalizeText(task.type) || 'other',
    typeText: getTaskTypeLabel(task.type),
    projectName,
    clientName,
    stage: normalizeText(project && project.stage) || '线索',
    amount: Number(project && project.estimatedAmount || 0),
    ownerLabel: project && project.isSharedProject
      ? `${project.sharedFromName || '分享方'} 外发给我`
      : '我负责推进',
    updatedAtRaw: updatedAt ? updatedAt.toISOString() : '',
    updatedAtText: updatedAt ? formatDateTime(updatedAt, now) : '刚刚更新',
    canComplete: status !== 'done' && status !== 'canceled' && !isClosedProject(project),
    canViewProject: !!normalizeText(task.projectId)
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const now = new Date()
  const filter = normalizeFilter(event.filter)
  const sort = normalizeSort(event.sort)
  const keyword = normalizeText(event.keyword)
  const limit = Math.min(Math.max(Number(event.limit || 100) || 100, 20), 200)

  const projectResult = await db.collection('projects').where({
    _openid: wxContext.OPENID
  }).get()
  const projectMap = {}
  ;(projectResult.data || []).forEach((project) => {
    if (!project || !project._id || (project.handoverStatus === 'handed_over' && !project.isSharedProject)) {
      return
    }

    projectMap[project._id] = project
  })

  let taskResult = { data: [] }
  try {
    taskResult = await db.collection('tasks').where({
      _openid: wxContext.OPENID,
      projectId: _.in(Object.keys(projectMap))
    }).get()
  } catch (error) {
    try {
      taskResult = await db.collection('tasks').where({
        _openid: wxContext.OPENID
      }).get()
    } catch (fallbackError) {
      taskResult = { data: [] }
    }
  }

  const allTasks = (taskResult.data || [])
    .map((task) => {
      const project = projectMap[normalizeText(task && task.projectId)]
      if (!project) {
        return null
      }

      if (isClosedProject(project) && !isTaskClosed(task.status)) {
        return null
      }

      return buildTaskItem(task, project, now)
    })
    .filter(Boolean)

  const filteredTasks = allTasks
    .filter((task) => shouldIncludeTask(task, filter))
    .filter((task) => containsKeyword(task, keyword))
    .map((task) => ({
      ...task,
      sortWeight: buildSortWeight(task, sort)
    }))
    .sort((left, right) => {
      if (left.sortWeight !== right.sortWeight) {
        return left.sortWeight - right.sortWeight
      }

      const leftUpdated = parseDateTime(left.updatedAtRaw)
      const rightUpdated = parseDateTime(right.updatedAtRaw)
      return (rightUpdated ? rightUpdated.getTime() : 0) - (leftUpdated ? leftUpdated.getTime() : 0)
    })
    .slice(0, limit)
    .map(({ sortWeight, prioritySortWeight, ...task }) => task)

  return {
    ok: true,
    summary: buildSummary(allTasks),
    tasks: filteredTasks,
    filter,
    sort,
    keyword
  }
}
