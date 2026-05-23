const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function normalizeText(value) {
  return String(value || '').trim()
}

function getDefaultReminderSettings() {
  return {
    followUpEnabled: true,
    followUpAdvance: 'same_day',
    taskEnabled: true,
    taskAdvance: 'same_day'
  }
}

function normalizeAdvance(value) {
  return normalizeText(value) === 'one_day_before' ? 'one_day_before' : 'same_day'
}

function normalizeReminderSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const defaults = getDefaultReminderSettings()
  return {
    followUpEnabled: typeof source.followUpEnabled === 'boolean' ? source.followUpEnabled : defaults.followUpEnabled,
    followUpAdvance: normalizeAdvance(source.followUpAdvance || defaults.followUpAdvance),
    taskEnabled: typeof source.taskEnabled === 'boolean' ? source.taskEnabled : defaults.taskEnabled,
    taskAdvance: normalizeAdvance(source.taskAdvance || defaults.taskAdvance)
  }
}

function parseDate(value) {
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

function formatBizDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfDay(date = new Date()) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

function isVisibleProject(project) {
  return !(project && project.handoverStatus === 'handed_over' && !project.isSharedProject)
}

function isClosedProject(project) {
  const stage = normalizeText(project && project.stage)
  return stage === '成交' || stage === '流失' || !!(project && project.isClosed)
}

function buildProjectName(project) {
  return normalizeText(project && project.projectName) || '未命名项目'
}

function isTaskClosed(status) {
  const current = normalizeText(status)
  return current === 'done' || current === 'canceled'
}

function buildTaskActionUrl(projectId, taskId) {
  const currentProjectId = normalizeText(projectId)
  const currentTaskId = normalizeText(taskId)
  if (!currentProjectId || !currentTaskId) {
    return ''
  }

  return `/pages/project-detail/project-detail?projectId=${currentProjectId}&view=home-task&taskId=${currentTaskId}&openTaskComplete=1`
}

function getTaskNotificationMeta(task, now = new Date()) {
  if (!task || isTaskClosed(task.status)) {
    return null
  }

  const dueAt = parseDate(task.dueAt)
  if (!dueAt) {
    return null
  }

  const todayStart = startOfDay(now).getTime()
  const dueStart = startOfDay(dueAt).getTime()

  if (dueAt.getTime() < now.getTime()) {
    return {
      type: 'task_overdue',
      level: 'high'
    }
  }

  if (dueStart === todayStart) {
    return {
      type: 'task_due',
      level: 'normal'
    }
  }

  return null
}

function getProjectNotificationMeta(project, reminderSettings, now = new Date()) {
  const settings = normalizeReminderSettings(reminderSettings)
  if (!settings.followUpEnabled) {
    return null
  }

  const silenceDays = Math.floor(Number(project && project.followUpSilenceDays) || 0)
  if (!silenceDays) {
    return null
  }

  if (project && project.hasOpenTask) {
    return null
  }

  const lastFollowUpAt = parseDate(project && project.lastFollowUpAt)
  const createdAt = parseDate(project && project.createdAt)
  const baseAt = lastFollowUpAt || createdAt
  if (!baseAt) {
    return null
  }

  const todayStart = startOfDay(now).getTime()
  const baseDay = startOfDay(baseAt).getTime()
  const silentDays = Math.max(0, Math.floor((todayStart - baseDay) / 86400000))

  if (silentDays >= silenceDays) {
    return {
      type: 'project_silent',
      level: 'info',
      title: '项目较久未推进',
      actionLabel: '查看项目',
      summaryBuilder(projectName) {
        return `${projectName} 已 ${silentDays} 天没有新增跟进，也没有待完成任务。`
      }
    }
  }

  return null
}

async function cleanupTaskNotifications(openid, taskReminderMap, now = new Date()) {
  const result = await db.collection('notifications').where({
    _openid: openid,
    type: _.in(['task_due', 'task_overdue', 'task_upcoming'])
  }).get()

  const closableItems = (result.data || []).filter((item) => {
    if (normalizeText(item.status) === 'resolved') {
      return false
    }

    const taskId = normalizeText(item.extra && item.extra.taskId)
    const expected = taskReminderMap[taskId]
    if (!expected) {
      return true
    }

    return normalizeText(item.type) !== expected.type || normalizeText(item.dedupeKey) !== expected.dedupeKey
  })

  if (!closableItems.length) {
    return
  }

  await Promise.all(closableItems.map((item) => {
    return db.collection('notifications').doc(item._id).update({
      data: {
        status: 'resolved',
        readAt: item.readAt || now,
        resolvedAt: now,
        updatedAt: now
      }
    })
  }))
}

async function cleanupProjectNotifications(openid, projectReminderMap, now = new Date()) {
  const result = await db.collection('notifications').where({
    _openid: openid,
    type: _.in(['todo_due', 'todo_overdue', 'todo_upcoming', 'project_silent'])
  }).get()

  const closableItems = (result.data || []).filter((item) => {
    if (normalizeText(item.status) === 'resolved') {
      return false
    }

    const projectId = normalizeText(item.projectId)
    const expected = projectReminderMap[projectId]
    if (!expected) {
      return true
    }

    return normalizeText(item.type) !== expected.type || normalizeText(item.dedupeKey) !== expected.dedupeKey
  })

  if (!closableItems.length) {
    return
  }

  await Promise.all(closableItems.map((item) => {
    return db.collection('notifications').doc(item._id).update({
      data: {
        status: 'resolved',
        readAt: item.readAt || now,
        resolvedAt: now,
        updatedAt: now
      }
    })
  }))
}

function buildLevelMeta(level) {
  const current = normalizeText(level)
  if (current === 'high') {
    return {
      text: '高优先',
      className: 'is-danger'
    }
  }

  if (current === 'info') {
    return {
      text: '提示',
      className: 'is-brand'
    }
  }

  return {
    text: '待处理',
    className: ''
  }
}

function buildStatusMeta(status) {
  const current = normalizeText(status)
  if (current === 'resolved') {
    return {
      text: '已处理',
      className: 'is-success'
    }
  }

  if (current === 'read') {
    return {
      text: '已读',
      className: ''
    }
  }

  return {
    text: '未读',
    className: 'is-danger'
  }
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '刚刚'
  }

  const now = new Date()
  const todayStart = startOfDay(now).getTime()
  const targetStart = startOfDay(date).getTime()
  const diff = Math.round((todayStart - targetStart) / 86400000)
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')

  if (diff === 0) {
    return `今天 ${hour}:${minute}`
  }

  if (diff === 1) {
    return `昨天 ${hour}:${minute}`
  }

  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

async function ensureNotification(recipientOpenid, payload) {
  const dedupeKey = normalizeText(payload.dedupeKey)
  if (dedupeKey) {
    const existedResult = await db.collection('notifications').where({
      _openid: recipientOpenid,
      dedupeKey
    }).limit(1).get()

    if (Array.isArray(existedResult.data) && existedResult.data.length) {
      return existedResult.data[0]
    }
  }

  const now = new Date()
  const data = {
    _openid: recipientOpenid,
    recipientOpenid,
    type: normalizeText(payload.type),
    level: normalizeText(payload.level) || 'normal',
    status: normalizeText(payload.status) || 'unread',
    title: normalizeText(payload.title) || '系统提醒',
    summary: normalizeText(payload.summary),
    projectId: normalizeText(payload.projectId),
    projectName: normalizeText(payload.projectName),
    shareRecordId: normalizeText(payload.shareRecordId),
    sourceOpenid: normalizeText(payload.sourceOpenid),
    sourceName: normalizeText(payload.sourceName),
    actionUrl: normalizeText(payload.actionUrl),
    actionLabel: normalizeText(payload.actionLabel) || '查看',
    bizDate: normalizeText(payload.bizDate) || formatBizDate(now),
    dedupeKey,
    extra: payload.extra && typeof payload.extra === 'object' && !Array.isArray(payload.extra) ? payload.extra : {},
    notifyTime: parseDate(payload.notifyTime),
    isSent: false,
    createdAt: now,
    updatedAt: now,
    readAt: null,
    resolvedAt: null
  }

  const result = await db.collection('notifications').add({ data })
  return {
    ...data,
    _id: result._id
  }
}

async function loadReminderSettings(openid) {
  const result = await db.collection('users').where({
    _openid: openid
  }).limit(1).get()

  return normalizeReminderSettings(result.data[0] && result.data[0].reminderSettings)
}

async function generateTodoNotifications(openid, reminderSettings) {
  const projectResult = await db.collection('projects').where({
    _openid: openid
  }).get()

  const now = new Date()
  const bizDate = formatBizDate(now)
  const projectReminderMap = {}
  const tasks = []
  const projects = projectResult.data || []
  const projectMap = {}

  projects.forEach((project) => {
    if (!project || !project._id) {
      return
    }
    projectMap[project._id] = project
  })

  try {
    const taskResult = await db.collection('tasks').where({
      _openid: openid
    }).get()
    ;(taskResult.data || []).forEach((task) => {
      const projectId = normalizeText(task && task.projectId)
      const project = projectMap[projectId]
      if (!project || isTaskClosed(task.status)) {
        return
      }
      project.hasOpenTask = true
    })
  } catch (error) {
    // Keep project silence reminders available even if the tasks collection is not ready.
  }

  try {
    const followResult = await db.collection('followUps').where({
      _openid: openid
    }).orderBy('followUpTime', 'desc').get()
    ;(followResult.data || []).forEach((followUp) => {
      const projectId = normalizeText(followUp && followUp.projectId)
      const project = projectMap[projectId]
      if (!project || project.lastFollowUpAt) {
        return
      }
      project.lastFollowUpAt = followUp.followUpTime || followUp.createdAt || null
    })
  } catch (error) {
    // New projects can still use createdAt as the silence baseline.
  }

  projects.forEach((project) => {
    if (!isVisibleProject(project) || isClosedProject(project)) {
      return
    }

    const reminderMeta = getProjectNotificationMeta(project, reminderSettings, now)
    if (!reminderMeta) {
      return
    }

    const projectName = buildProjectName(project)
    const actionUrl = `/pages/project-detail/project-detail?projectId=${project._id}&view=notifications`
    const dedupeKey = `${reminderMeta.type}_${project._id}_${bizDate}`

    projectReminderMap[project._id] = {
      type: reminderMeta.type,
      dedupeKey
    }

    tasks.push(ensureNotification(openid, {
      type: reminderMeta.type,
      level: reminderMeta.level,
      title: reminderMeta.title,
      summary: reminderMeta.summaryBuilder(projectName),
      projectId: project._id,
      projectName,
      actionUrl,
      actionLabel: reminderMeta.actionLabel,
      bizDate,
      dedupeKey,
      extra: {
        followUpSilenceDays: Number(project.followUpSilenceDays || 0),
        lastFollowUpAt: project.lastFollowUpAt || ''
      }
    }))
  })

  await cleanupProjectNotifications(openid, projectReminderMap, now)

  if (tasks.length) {
    await Promise.all(tasks)
  }
}

async function generateTaskNotifications(openid, reminderSettings) {
  const projectResult = await db.collection('projects').where({
    _openid: openid
  }).get()
  const projectMap = {}
  ;(projectResult.data || []).forEach((project) => {
    if (!project || !project._id || !isVisibleProject(project) || isClosedProject(project)) {
      return
    }

    projectMap[project._id] = project
  })

  let taskResult = { data: [] }
  let taskLoadSucceeded = true
  try {
    taskResult = await db.collection('tasks').where({
      _openid: openid
    }).get()
  } catch (error) {
    taskResult = { data: [] }
    taskLoadSucceeded = false
  }

  const now = new Date()
  const bizDate = formatBizDate(now)
  const taskReminderMap = {}
  const tasks = []

  ;(taskResult.data || []).forEach((task) => {
    const taskId = normalizeText(task && task._id)
    const projectId = normalizeText(task && task.projectId)
    const project = projectMap[projectId]
    const reminderMeta = (() => {
      const settings = normalizeReminderSettings(reminderSettings)
      if (!settings.taskEnabled) {
        return null
      }

      const currentReminder = getTaskNotificationMeta(task, now)
      if (currentReminder) {
        return currentReminder
      }

      const dueAt = parseDate(task && task.dueAt)
      if (!dueAt || settings.taskAdvance !== 'one_day_before' || isTaskClosed(task.status)) {
        return null
      }

      const todayStart = startOfDay(now).getTime()
      const dueStart = startOfDay(dueAt).getTime()
      if (dueStart !== todayStart + 86400000) {
        return null
      }

      return {
        type: 'task_upcoming',
        level: 'info'
      }
    })()

    if (!taskId) {
      return
    }

    if (!project || !reminderMeta) {
      return
    }

    const taskTitle = normalizeText(task.title) || '未命名动作'
    const projectName = buildProjectName(project)
    const dedupeKey = `${reminderMeta.type}_${taskId}_${bizDate}`
    const dueText = normalizeText(task.dueDateText) || formatDateTime(task.dueAt)

    taskReminderMap[taskId] = {
      type: reminderMeta.type,
      dedupeKey
    }

    tasks.push(ensureNotification(openid, {
      type: reminderMeta.type,
      level: reminderMeta.level,
      title: reminderMeta.type === 'task_overdue'
        ? '推进动作已逾期'
        : (reminderMeta.type === 'task_upcoming' ? '明天有推进动作' : '今天有推进动作'),
      summary: reminderMeta.type === 'task_overdue'
        ? `${taskTitle} 已超过计划时间，项目 ${projectName} 需要尽快处理。`
        : (reminderMeta.type === 'task_upcoming'
          ? `${taskTitle} 明天到期，项目 ${projectName} 可以先准备本次推进。`
          : `${taskTitle} 今天到期，项目 ${projectName} 需要处理。`),
      projectId,
      projectName,
      actionUrl: reminderMeta.type === 'task_upcoming'
        ? `/pages/project-detail/project-detail?projectId=${projectId}&view=home-task&taskId=${taskId}`
        : buildTaskActionUrl(projectId, taskId),
      actionLabel: reminderMeta.type === 'task_overdue'
        ? '立即完成'
        : (reminderMeta.type === 'task_upcoming' ? '查看动作' : '完成动作'),
      bizDate,
      dedupeKey,
      extra: {
        taskId,
        taskTitle,
        dueAt: task.dueAt || null,
        dueDateText: dueText
      }
    }))
  })

  if (taskLoadSucceeded) {
    await cleanupTaskNotifications(openid, taskReminderMap, now)
  }

  if (tasks.length) {
    await Promise.all(tasks)
  }
}

function shouldIncludeByStatus(notification, statusFilter) {
  const status = normalizeText(notification && notification.status) || 'unread'
  const currentFilter = normalizeText(statusFilter) || 'all'

  if (currentFilter === 'unread') {
    return status === 'unread'
  }

  if (currentFilter === 'resolved') {
    return status === 'resolved'
  }

  if (currentFilter === 'pending') {
    return status !== 'resolved'
  }

  return true
}

function buildActionUrl(item) {
  const actionUrl = normalizeText(item.actionUrl)
  if (actionUrl) {
    return actionUrl
  }

  if (normalizeText(item.projectId)) {
    return `/pages/project-detail/project-detail?projectId=${item.projectId}`
  }

  return ''
}

function getNotificationTime(item = {}) {
  return item.notifyTime || item.createdAt || item.updatedAt || null
}

function getNotificationTimeWeight(item = {}) {
  const value = getNotificationTime(item)
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 0
  }

  return date.getTime()
}

function compareNotifications(left, right) {
  return getNotificationTimeWeight(right) - getNotificationTimeWeight(left)
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const statusFilter = normalizeText(event.statusFilter) || 'all'
  const limit = Math.max(1, Math.min(Number(event.limit) || 20, 100))
  const skipGenerate = event && event.skipGenerate === true
  let reminderSettings = getDefaultReminderSettings()

  if (!skipGenerate) {
    try {
      reminderSettings = await loadReminderSettings(openid)
    } catch (error) {
      reminderSettings = getDefaultReminderSettings()
    }

    try {
      await generateTodoNotifications(openid, reminderSettings)
    } catch (error) {
      // Keep the notification center available even if today's reminder generation fails.
    }

    try {
      await generateTaskNotifications(openid, reminderSettings)
    } catch (error) {
      // Keep the notification center available even if task reminder generation fails.
    }
  }

  const result = await db.collection('notifications')
    .where({
      _openid: openid
    })
    .orderBy('createdAt', 'desc')
    .get()

  const notifications = (result.data || [])
    .filter((item) => shouldIncludeByStatus(item, statusFilter))
    .sort(compareNotifications)
    .slice(0, limit)
    .map((item) => {
      const statusMeta = buildStatusMeta(item.status)
      const levelMeta = buildLevelMeta(item.level)

      return {
        id: item._id,
        type: normalizeText(item.type),
        level: normalizeText(item.level) || 'normal',
        levelText: levelMeta.text,
        levelClassName: levelMeta.className,
        status: normalizeText(item.status) || 'unread',
        statusText: statusMeta.text,
        statusClassName: statusMeta.className,
        title: normalizeText(item.title) || '系统提醒',
        summary: normalizeText(item.summary) || '暂无摘要',
        projectId: normalizeText(item.projectId),
        projectName: normalizeText(item.projectName) || '未命名项目',
        taskId: normalizeText(item.extra && item.extra.taskId),
        actionUrl: buildActionUrl(item),
        actionLabel: normalizeText(item.actionLabel) || '查看',
        canMarkRead: (normalizeText(item.status) || 'unread') === 'unread',
        canResolve: (normalizeText(item.status) || 'unread') !== 'resolved',
        createdAt: item.createdAt || null,
        notifyTime: item.notifyTime || null,
        updatedAt: item.updatedAt || null,
        createdAtText: formatDateTime(getNotificationTime(item)),
        bizDate: normalizeText(item.bizDate),
        sourceName: normalizeText(item.sourceName)
      }
    })

  const allItems = result.data || []
  const unreadCount = allItems.filter((item) => (normalizeText(item.status) || 'unread') === 'unread').length
  const resolvedCount = allItems.filter((item) => normalizeText(item.status) === 'resolved').length

  return {
    ok: true,
    notifications,
    stats: {
      totalCount: allItems.length,
      unreadCount,
      resolvedCount,
      pendingCount: Math.max(allItems.length - resolvedCount, 0)
    }
  }
}
