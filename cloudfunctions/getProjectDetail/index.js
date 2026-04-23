const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const CONTACT_CRYPTO_SECRET = process.env.CONTACT_CRYPTO_SECRET || 'deal-crm-contact-v1'
const CONTACT_CRYPTO_PREFIX = 'enc:v1'
const CONTACT_CRYPTO_KEY = crypto.createHash('sha256').update(CONTACT_CRYPTO_SECRET).digest()

function isEncryptedValue(value) {
  return String(value || '').trim().startsWith(`${CONTACT_CRYPTO_PREFIX}:`)
}

function encryptSensitiveValue(value) {
  const text = String(value || '').trim()
  if (!text) {
    return ''
  }

  if (isEncryptedValue(text)) {
    return text
  }

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', CONTACT_CRYPTO_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    CONTACT_CRYPTO_PREFIX,
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64')
  ].join(':')
}

function decryptSensitiveValue(value) {
  const text = String(value || '').trim()
  if (!text) {
    return ''
  }

  if (!isEncryptedValue(text)) {
    return text
  }

  const parts = text.split(':')
  if (parts.length !== 5) {
    return ''
  }

  try {
    const iv = Buffer.from(parts[2], 'base64')
    const authTag = Buffer.from(parts[3], 'base64')
    const encrypted = Buffer.from(parts[4], 'base64')
    const decipher = crypto.createDecipheriv('aes-256-gcm', CONTACT_CRYPTO_KEY, iv)
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return decrypted.toString('utf8').trim()
  } catch (error) {
    return ''
  }
}

function startOfDay(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
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

function formatDateLabel(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '最近'
  }

  const today = new Date()
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const diff = Math.round((current - target) / 86400000)

  if (diff === 0) {
    return '今天'
  }

  if (diff === 1) {
    return '昨天'
  }

  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${month}-${day}`
}

function formatTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '--:--'
  }

  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${hour}:${minute}`
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '最近'
  }

  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

function maskOpenid(value) {
  const text = String(value || '').trim()
  if (!text) {
    return ''
  }

  if (text.length <= 8) {
    return text
  }

  return `${text.slice(0, 4)}...${text.slice(-4)}`
}

function parseDate(value) {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeShareViewLog(item) {
  const current = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
  const firstOpenedAt = parseDate(current.firstOpenedAt || current.openedAt || current.createdAt)
  const lastViewedAt = parseDate(current.lastViewedAt || current.firstOpenedAt || current.updatedAt)
  const importedAt = parseDate(current.importedAt)

  return {
    viewerOpenid: normalizeText(current.viewerOpenid || current.openid),
    viewerName: normalizeText(current.viewerName || current.name),
    firstOpenedAt,
    lastViewedAt: lastViewedAt || firstOpenedAt,
    viewCount: Math.max(0, Number(current.viewCount || 0) || 0),
    importedProjectId: normalizeText(current.importedProjectId),
    importedAt
  }
}

function getShareViewLogs(record) {
  const rawRecord = record && typeof record === 'object' && !Array.isArray(record) ? record : {}
  const logs = (Array.isArray(rawRecord.viewLogs) ? rawRecord.viewLogs : [])
    .map(normalizeShareViewLog)
    .filter((item) => item.viewerOpenid || item.viewerName || item.firstOpenedAt || item.lastViewedAt)

  const legacyViewerOpenid = normalizeText(rawRecord.receiverOpenid)
  const legacyViewerName = normalizeText(rawRecord.receiverName)
  const legacyFirstOpenedAt = parseDate(rawRecord.firstOpenedAt)
  const legacyLastViewedAt = parseDate(rawRecord.lastViewedAt)
  const legacyImportedProjectId = normalizeText(rawRecord.importedProjectId)
  const legacyImportedAt = parseDate(rawRecord.importedAt)
  const hasLegacyViewer = legacyViewerOpenid || legacyViewerName || legacyFirstOpenedAt || legacyLastViewedAt

  if (hasLegacyViewer && !logs.some((item) => item.viewerOpenid && item.viewerOpenid === legacyViewerOpenid)) {
    logs.push({
      viewerOpenid: legacyViewerOpenid,
      viewerName: legacyViewerName,
      firstOpenedAt: legacyFirstOpenedAt,
      lastViewedAt: legacyLastViewedAt || legacyFirstOpenedAt,
      viewCount: Math.max(0, Number(rawRecord.viewCount || 0) || 0),
      importedProjectId: legacyImportedProjectId,
      importedAt: legacyImportedAt
    })
  }

  return logs
}

function buildShareViewMeta(record) {
  const logs = getShareViewLogs(record)
  let firstOpenedAt = parseDate(record && record.firstOpenedAt)
  let lastViewedAt = parseDate(record && record.lastViewedAt)
  let latestViewer = null
  let totalViewCount = Math.max(0, Number(record && record.viewCount ? record.viewCount : 0) || 0)

  if (!logs.length) {
    return {
      totalViewCount,
      viewerCount: Math.max(0, Number(record && record.viewerCount ? record.viewerCount : 0) || 0),
      firstOpenedAt,
      lastViewedAt,
      latestViewerOpenid: normalizeText(record && record.receiverOpenid),
      latestViewerName: normalizeText(record && record.receiverName)
    }
  }

  totalViewCount = 0

  logs.forEach((item) => {
    const firstTime = item.firstOpenedAt ? item.firstOpenedAt.getTime() : NaN
    const latestTime = (item.importedAt || item.lastViewedAt || item.firstOpenedAt)
      ? (item.importedAt || item.lastViewedAt || item.firstOpenedAt).getTime()
      : NaN

    totalViewCount += Math.max(0, Number(item.viewCount || 0) || 0)

    if (!Number.isNaN(firstTime) && (!firstOpenedAt || firstTime < firstOpenedAt.getTime())) {
      firstOpenedAt = item.firstOpenedAt
    }

    if (!Number.isNaN(latestTime) && (!lastViewedAt || latestTime > lastViewedAt.getTime())) {
      lastViewedAt = item.importedAt || item.lastViewedAt || item.firstOpenedAt
      latestViewer = item
    }
  })

  return {
    totalViewCount,
    viewerCount: logs.length,
    firstOpenedAt,
    lastViewedAt,
    latestViewerOpenid: latestViewer ? latestViewer.viewerOpenid : '',
    latestViewerName: latestViewer ? latestViewer.viewerName : ''
  }
}

function buildTimelineKey(prefix, id, time, suffix = '') {
  const baseId = String(id || '').trim() || 'record'
  const rawTime = time instanceof Date ? time.getTime() : new Date(time).getTime()
  const timeKey = Number.isNaN(rawTime) ? 'time' : String(rawTime)
  const tail = String(suffix || '').trim()
  return [prefix, baseId, timeKey, tail].filter(Boolean).join('-')
}

function buildTimelineItem(followUp, extra = {}) {
  const method = String(followUp.method || '').trim() || '跟进'
  const stageChange = String(followUp.stageChange || '').trim()
  const nextFollowUpText = String(followUp.nextFollowUpTime || '').trim()
  const autoGeneratedByTask = !!followUp.autoGeneratedByTask || method === '任务完成' || method === '动作完成'
  const fromCollaborator = !!extra.fromCollaborator
  const fromSharedSync = !!followUp.importedFromShare && !fromCollaborator

  let typeKey = 'follow_up'
  let typeLabel = method
  let typeBadgeClass = ''

  if (autoGeneratedByTask) {
    typeKey = 'task_done'
    typeLabel = '动作完成'
    typeBadgeClass = 'is-success'
  } else if (fromCollaborator) {
    typeKey = 'collaborator_follow'
    typeLabel = '接手方推进'
    typeBadgeClass = 'is-brand'
  } else if (fromSharedSync) {
    typeKey = 'shared_sync'
    typeLabel = '分享方同步'
    typeBadgeClass = ''
  } else if (stageChange) {
    typeKey = 'stage_change'
    typeLabel = '阶段推进'
    typeBadgeClass = 'is-brand'
  }

  let title = `${method}记录`
  if (typeKey === 'task_done') {
    title = '动作已完成'
  } else if (typeKey === 'stage_change') {
    title = `阶段已更新为 ${stageChange}`
  } else if (typeKey === 'collaborator_follow') {
    title = `${method}推进`
  } else if (typeKey === 'shared_sync') {
    title = `${method}同步`
  }

  return {
    time: formatTime(followUp.followUpTime),
    title,
    actorName: followUp.actorName || '当前用户',
    desc: followUp.content || '暂无内容',
    summary: followUp.aiSummary || '',
    highlights: Array.isArray(followUp.aiHighlights) ? followUp.aiHighlights : [],
    risks: Array.isArray(followUp.aiRisks) ? followUp.aiRisks : [],
    recommendedStage: followUp.aiRecommendedStage || '',
    stageChangeReason: followUp.aiStageChangeReason || '',
    missingInfo: Array.isArray(followUp.aiMissingInfo) ? followUp.aiMissingInfo : [],
    timelineKey: buildTimelineKey(
      'follow',
      followUp._id || followUp.id || followUp.sourceTaskId,
      followUp.followUpTime,
      typeKey
    ),
    typeKey,
    typeLabel,
    typeBadgeClass,
    methodLabel: method,
    stageChange,
    nextFollowUpText,
    summaryLabel: typeKey === 'task_done' ? '完成动作' : (typeKey === 'collaborator_follow' ? '推进摘要' : 'AI 摘要'),
    highlightsLabel: typeKey === 'task_done' ? '完成情况' : '关键进展',
    rawLabel: typeKey === 'task_done' ? '完成详情' : '原始记录',
    collaborationLabel: extra.collaborationLabel || '',
    fromCollaborator: !!extra.fromCollaborator
  }
}

function buildTaskTimelineItem(task) {
  const completedAt = task.completedAt instanceof Date ? task.completedAt : new Date(task.completedAt || task.updatedAt || task.createdAt)
  const title = String(task.title || '').trim() || '未命名动作'
  const resultSummary = String(task.resultSummary || '').trim()
  const actorName = String(task.completedByName || task.ownerName || '当前用户').trim() || '当前用户'

  return {
    time: formatTime(completedAt),
    title: '动作已完成',
    actorName,
    desc: '',
    summary: `已完成推进动作「${title}」`,
    highlights: resultSummary ? [resultSummary] : [],
    risks: [],
    recommendedStage: '',
    stageChangeReason: '',
    missingInfo: [],
    timelineKey: buildTimelineKey(
      'task',
      task._id || task.id || title,
      completedAt,
      'done'
    ),
    typeKey: 'task_done',
    typeLabel: '动作完成',
    typeBadgeClass: 'is-success',
    methodLabel: '动作完成',
    stageChange: '',
    nextFollowUpText: '',
    summaryLabel: '完成动作',
    highlightsLabel: '完成情况',
    rawLabel: '完成详情',
    collaborationLabel: '',
    fromCollaborator: false
  }
}

function getTaskTypeLabel(type) {
  const labelMap = {
    send_solution: '待发方案',
    send_quote: '待报价',
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

function normalizeTaskStatus(status, dueAt) {
  const current = String(status || '').trim() || 'pending'
  const now = new Date()
  const isOverdue = dueAt instanceof Date && !Number.isNaN(dueAt.getTime()) && dueAt.getTime() < now.getTime() && current !== 'done' && current !== 'canceled'
  const isToday = dueAt instanceof Date && !Number.isNaN(dueAt.getTime()) && startOfDay(dueAt).getTime() === startOfDay(now).getTime() && current !== 'done' && current !== 'canceled'

  if (current === 'done') {
    return {
      code: 'done',
      text: '已完成',
      badgeClass: 'is-success',
      isOverdue: false
    }
  }

  if (current === 'canceled') {
    return {
      code: 'canceled',
      text: '已取消',
      badgeClass: '',
      isOverdue: false
    }
  }

  if (isOverdue) {
    return {
      code: current,
      text: '已逾期',
      badgeClass: 'is-danger',
      isOverdue: true
    }
  }

  if (isToday) {
    return {
      code: current === 'in_progress' ? 'in_progress' : 'pending',
      text: '今天处理',
      badgeClass: 'is-brand',
      isOverdue: false
    }
  }

  return {
    code: current === 'in_progress' ? 'in_progress' : 'pending',
    text: '待处理',
    badgeClass: '',
    isOverdue: false
  }
}

function buildTaskItem(task) {
  const dueAt = task.dueAt instanceof Date ? task.dueAt : new Date(task.dueAt)
  const statusMeta = normalizeTaskStatus(task.status, dueAt)
  return {
    id: task._id,
    title: task.title || '未命名动作',
    type: task.type || 'other',
    typeLabel: getTaskTypeLabel(task.type),
    priority: task.priority || 'normal',
    priorityLabel: getTaskPriorityLabel(task.priority),
    status: statusMeta.code,
    statusText: statusMeta.text,
    statusBadgeClass: statusMeta.badgeClass,
    isOverdue: statusMeta.isOverdue,
    canStart: statusMeta.code === 'pending',
    canComplete: statusMeta.code === 'pending' || statusMeta.code === 'in_progress',
    canCancel: statusMeta.code === 'pending' || statusMeta.code === 'in_progress',
    hasActions: statusMeta.code === 'pending' || statusMeta.code === 'in_progress',
    dueAt: Number.isNaN(dueAt.getTime()) ? null : dueAt,
    dueText: task.dueDateText || (Number.isNaN(dueAt.getTime()) ? '待设置' : formatDateTime(dueAt)),
    description: task.description || '',
    resultSummary: task.resultSummary || '',
    createdAt: formatDateTime(task.createdAt),
    completedAt: task.completedAt ? formatDateTime(task.completedAt) : '',
    ownerName: task.ownerName || '我'
  }
}

async function syncSharedSourceFollowUps(item) {
  if (!item.isSharedProject || !item.sourceProjectId || !item.sharedFromOpenid) {
    return
  }

  const sourceFollowResult = await db.collection('followUps').where({
    _openid: item.sharedFromOpenid,
    projectId: item.sourceProjectId
  }).orderBy('followUpTime', 'asc').get()

  const importedFollowResult = await db.collection('followUps').where({
    _openid: item._openid,
    projectId: item._id
  }).get()

  const existingSourceIds = new Set(
    importedFollowResult.data
      .map((followUp) => String(followUp.sourceFollowUpId || '').trim())
      .filter(Boolean)
  )

  for (const followUp of sourceFollowResult.data) {
    if (existingSourceIds.has(followUp._id)) {
      continue
    }

    await db.collection('followUps').add({
      data: {
        _openid: item._openid,
        projectId: item._id,
        sourceFollowUpId: followUp._id,
        sharedFromOpenid: item.sharedFromOpenid,
        importedFromShare: true,
        actorOpenid: followUp.actorOpenid || item.sharedFromOpenid,
        actorName: followUp.actorName || item.sharedFromName || '分享方',
        followUpTime: followUp.followUpTime,
        method: followUp.method || '其他',
        content: followUp.content || '',
        images: Array.isArray(followUp.images) ? followUp.images : [],
        stageChange: followUp.stageChange || '',
        nextFollowUpTime: followUp.nextFollowUpTime || '',
        aiSummary: followUp.aiSummary || '',
        aiHighlights: Array.isArray(followUp.aiHighlights) ? followUp.aiHighlights : [],
        aiRisks: Array.isArray(followUp.aiRisks) ? followUp.aiRisks : [],
        aiRecommendedStage: followUp.aiRecommendedStage || '',
        aiStageChangeReason: followUp.aiStageChangeReason || '',
        aiMissingInfo: Array.isArray(followUp.aiMissingInfo) ? followUp.aiMissingInfo : [],
        createdAt: followUp.createdAt || new Date()
      }
    })
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()

  if (!event.projectId) {
    return {
      ok: false,
      message: 'projectId is required'
    }
  }

  const result = await db.collection('projects').where({
    _id: event.projectId,
    _openid: wxContext.OPENID
  }).limit(1).get()

  if (!result.data.length) {
    return {
      ok: false,
      message: 'project not found'
    }
  }

  const item = result.data[0]
  const rawContacts = Array.isArray(item.contacts) ? item.contacts : []
  const shouldMigrateContacts = rawContacts.some((contact) => {
    const phone = String(contact && contact.phone ? contact.phone : '').trim()
    const wechat = String(contact && contact.wechat ? contact.wechat : '').trim()
    return (phone && !isEncryptedValue(phone)) || (wechat && !isEncryptedValue(wechat))
  })

  if (shouldMigrateContacts) {
    const encryptedContacts = rawContacts.map((contact) => ({
      ...contact,
      phone: encryptSensitiveValue(contact && contact.phone),
      wechat: encryptSensitiveValue(contact && contact.wechat)
    }))

    await db.collection('projects').doc(item._id).update({
      data: {
        contacts: encryptedContacts
      }
    })

    item.contacts = encryptedContacts
  }

  await syncSharedSourceFollowUps(item)

  const followResult = await db.collection('followUps').where({
    projectId: event.projectId,
    _openid: wxContext.OPENID
  }).orderBy('followUpTime', 'desc').get()
  let taskResult = { data: [] }
  try {
    taskResult = await db.collection('tasks').where({
      projectId: event.projectId,
      _openid: wxContext.OPENID
    }).orderBy('dueAt', 'asc').get()
  } catch (error) {
    taskResult = { data: [] }
  }
  const shareResult = await db.collection('shareRecords').where({
    projectId: event.projectId,
    _openid: wxContext.OPENID,
    shareMode: 'info'
  }).orderBy('updatedAt', 'desc').get()

  const contacts = Array.isArray(item.contacts)
    ? item.contacts.map((contact, index) => ({
        id: contact.contactId || `contact-${index}`,
        name: contact.name || '',
        role: contact.role || '',
        phone: decryptSensitiveValue(contact.phone),
        wechat: decryptSensitiveValue(contact.wechat),
        company: contact.company || ''
      }))
    : []

  const mergedFollowUps = []
  const sourceTaskIdSet = new Set()
  followResult.data.forEach((followUp) => {
    const sourceTaskId = String(followUp.sourceTaskId || '').trim()
    if (sourceTaskId) {
      sourceTaskIdSet.add(sourceTaskId)
    }

    mergedFollowUps.push({
      sortTime: followUp.followUpTime,
      label: formatDateLabel(followUp.followUpTime),
      item: buildTimelineItem(followUp, {
        collaborationLabel: followUp.importedFromShare ? '分享方同步' : ''
      })
    })
  })

  ;(taskResult.data || []).forEach((task) => {
    const taskId = String(task && task._id ? task._id : '').trim()
    const taskStatus = String(task && task.status ? task.status : '').trim()
    const completedAt = task && task.completedAt ? new Date(task.completedAt) : null
    const fallbackTime = task && task.updatedAt ? new Date(task.updatedAt) : null
    const timelineTime = completedAt instanceof Date && !Number.isNaN(completedAt.getTime())
      ? completedAt
      : (fallbackTime instanceof Date && !Number.isNaN(fallbackTime.getTime()) ? fallbackTime : null)

    if (!taskId || taskStatus !== 'done' || sourceTaskIdSet.has(taskId) || !timelineTime) {
      return
    }

    mergedFollowUps.push({
      sortTime: timelineTime,
      label: formatDateLabel(timelineTime),
      item: buildTaskTimelineItem(task)
    })
  })

  if (!item.isSharedProject) {
    const importedProjectsResult = await db.collection('projects').where({
      sourceProjectId: event.projectId,
      sharedFromOpenid: wxContext.OPENID
    }).get()

    const importedProjects = importedProjectsResult.data || []
    if (importedProjects.length) {
      const importedProjectIds = importedProjects.map((project) => project._id)
      const importedProjectMap = {}
      importedProjects.forEach((project) => {
        importedProjectMap[project._id] = project
      })

      const collaboratorFollowResult = await db.collection('followUps').where({
        projectId: _.in(importedProjectIds),
        importedFromShare: _.neq(true)
      }).orderBy('followUpTime', 'desc').get()

      collaboratorFollowResult.data.forEach((followUp) => {
        const collaboratorProject = importedProjectMap[followUp.projectId] || {}
        mergedFollowUps.push({
          sortTime: followUp.followUpTime,
          label: formatDateLabel(followUp.followUpTime),
          item: buildTimelineItem(followUp, {
            collaborationLabel: `接手方跟进${collaboratorProject.receiverName ? ` · ${collaboratorProject.receiverName}` : ''}`,
            fromCollaborator: true
          })
        })
      })
    }
  }

  mergedFollowUps.sort((left, right) => new Date(right.sortTime).getTime() - new Date(left.sortTime).getTime())

  const groupedMap = {}
  mergedFollowUps.forEach((entry) => {
    if (!groupedMap[entry.label]) {
      groupedMap[entry.label] = []
    }

    groupedMap[entry.label].push(entry.item)
  })

  const followTimeline = Object.keys(groupedMap).map((label) => ({
    date: label,
    items: groupedMap[label]
  }))
  const tasks = (taskResult.data || [])
    .map(buildTaskItem)
    .sort((left, right) => {
      const closedWeight = (left.status === 'done' || left.status === 'canceled' ? 1 : 0) - (right.status === 'done' || right.status === 'canceled' ? 1 : 0)
      if (closedWeight !== 0) {
        return closedWeight
      }

      const overdueWeight = Number(right.isOverdue) - Number(left.isOverdue)
      if (overdueWeight !== 0) {
        return overdueWeight
      }

      const leftTime = left.dueAt ? left.dueAt.getTime() : Number.MAX_SAFE_INTEGER
      const rightTime = right.dueAt ? right.dueAt.getTime() : Number.MAX_SAFE_INTEGER
      return leftTime - rightTime
    })
  const taskSummary = {
    total: tasks.length,
    openCount: tasks.filter((item) => item.status === 'pending' || item.status === 'in_progress').length,
    overdueCount: tasks.filter((item) => item.isOverdue).length,
    completedCount: tasks.filter((item) => item.status === 'done').length,
    latestDoneText: (() => {
      const latestDone = tasks.find((item) => item.status === 'done')
      return latestDone ? `${latestDone.title} · ${latestDone.completedAt || '刚刚完成'}` : ''
    })()
  }

  const importedProjectIds = shareResult.data
    .map((record) => String(record.importedProjectId || '').trim())
    .filter(Boolean)
  const collaboratorFollowCountMap = {}

  if (importedProjectIds.length) {
    const collaboratorFollowResult = await db.collection('followUps').where({
      projectId: _.in(importedProjectIds),
      importedFromShare: _.neq(true)
    }).get()

    collaboratorFollowResult.data.forEach((followUp) => {
      const projectId = String(followUp.projectId || '').trim()
      if (!projectId) {
        return
      }

      if (!collaboratorFollowCountMap[projectId]) {
        collaboratorFollowCountMap[projectId] = {
          count: 0,
          latestAt: ''
        }
      }

      collaboratorFollowCountMap[projectId].count += 1
      collaboratorFollowCountMap[projectId].latestAt = formatDateTime(followUp.followUpTime || followUp.createdAt)
    })
  }

  const shareHistory = shareResult.data.map((record) => {
    const collaboratorFollow = collaboratorFollowCountMap[record.importedProjectId] || { count: 0, latestAt: '' }
    const shareViewMeta = buildShareViewMeta(record)
    const isOutbound = record.shareMode === 'outbound'
    const firstOpenedAt = shareViewMeta.firstOpenedAt || parseDate(record.firstOpenedAt)
    const lastViewedAt = shareViewMeta.lastViewedAt || parseDate(record.lastViewedAt)
    const singleViewerName = shareViewMeta.latestViewerName || normalizeText(record.receiverName)
    const singleViewerMasked = maskOpenid(shareViewMeta.latestViewerOpenid || record.receiverOpenid)
    const receiverDisplayName = isOutbound
      ? (singleViewerName || singleViewerMasked || '待接手方')
      : (shareViewMeta.viewerCount > 1
        ? `${shareViewMeta.viewerCount}人查看`
        : (singleViewerName || singleViewerMasked || '暂未识别'))
    const status = record.shareMode === 'outbound'
      ? (collaboratorFollow.count > 0
        ? '已跟进'
        : (record.importedProjectId ? '已导入' : ((firstOpenedAt || shareViewMeta.totalViewCount > 0) ? '已打开' : '未打开')))
      : ((firstOpenedAt || shareViewMeta.totalViewCount > 0) ? '已打开' : '未打开')

    return {
      id: record._id,
      mode: '发送资料',
      tagName: record.shareTagName || '未命名标签',
      viewed: shareViewMeta.totalViewCount,
      viewCount: shareViewMeta.totalViewCount,
      viewerCount: shareViewMeta.viewerCount,
      receiverName: receiverDisplayName,
      receiverOpenidMasked: singleViewerMasked,
      latestViewerName: singleViewerName,
      createdAt: formatDateTime(record.createdAt),
      firstOpenedAt: firstOpenedAt ? formatDateTime(firstOpenedAt) : '',
      lastViewedAt: lastViewedAt ? formatDateTime(lastViewedAt) : '',
      updatedAt: formatDateTime(record.updatedAt || record.createdAt),
      status,
      importedProjectId: record.importedProjectId || '',
      importedAt: record.importedAt ? formatDateTime(record.importedAt) : '',
      receiverOpenid: shareViewMeta.latestViewerOpenid || record.receiverOpenid || '',
      collaboratorFollowCount: collaboratorFollow.count,
      collaboratorLatestFollowAt: collaboratorFollow.latestAt
    }
  })

  return {
    ok: true,
    projectDetail: {
      id: item._id,
      name: item.projectName || '未命名项目',
      client: item.clientName || '未填写客户',
      stage: item.stage || '线索',
      estimatedAmount: formatAmount(item.estimatedAmount),
      estimatedAmountValue: item.estimatedAmount || 0,
      actualAmount: formatAmount(item.actualAmount),
      actualAmountValue: item.actualAmount || 0,
      expectedCommission: formatAmount(item.expectedCommission),
      expectedCommissionValue: item.expectedCommission || 0,
      nextFollowUp: item.nextFollowUpDate || '待设置',
      description: item.description || '暂无项目摘要',
      tags: Array.isArray(item.tags) ? item.tags : [],
      isSharedProject: !!item.isSharedProject,
      handoverStatus: item.handoverStatus || '',
      handoverToName: item.handoverToName || '',
      handedOverAt: item.handedOverAt ? formatDateTime(item.handedOverAt) : '',
      sharedFromName: item.sharedFromName || ''
    },
    contacts,
    tasks,
    taskSummary,
    followTimeline,
    shareHistory
  }
}
