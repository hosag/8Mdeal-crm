const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => normalizeText(item))
    .filter(Boolean)
}

function normalizeTaskType(value) {
  const current = normalizeText(value)
  const allowed = ['send_solution', 'send_quote', 'callback', 'meeting', 'contract', 'collect_info', 'other']
  return allowed.includes(current) ? current : 'other'
}

function normalizeTaskPriority(value) {
  const current = normalizeText(value)
  const allowed = ['high', 'normal', 'low']
  return allowed.includes(current) ? current : 'normal'
}

function formatDateOnly(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
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

function parseDateTime(value, fallback) {
  const text = normalizeText(value)
  if (!text) {
    return fallback
  }

  const normalized = text.replace(' ', 'T')
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) {
    return fallback
  }

  return date
}

function buildTaskDueDate(task) {
  const dueAtText = normalizeText(task && task.dueAt)
  if (dueAtText) {
    return parseDateTime(dueAtText, null)
  }

  const dueDate = normalizeText(task && task.dueDate)
  const dueTime = normalizeText(task && task.dueTime) || '18:00'
  if (!dueDate) {
    return null
  }

  return parseDateTime(`${dueDate} ${dueTime}`, null)
}

function buildTaskDueText(task, dueAt) {
  const dueDate = normalizeText(task && task.dueDate)
  const dueTime = normalizeText(task && task.dueTime)
  if (dueDate && dueTime) {
    return `${dueDate} ${dueTime}`
  }

  if (dueDate) {
    return dueDate
  }

  return dueAt ? `${formatDateOnly(dueAt)} ${`${dueAt.getHours()}`.padStart(2, '0')}:${`${dueAt.getMinutes()}`.padStart(2, '0')}` : ''
}

function normalizeTaskPayloads(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((task) => {
      const title = normalizeText(task && task.title)
      const description = normalizeText(task && task.description)
      const dueAt = buildTaskDueDate(task)
      const hasAnyValue = Boolean(title || description || normalizeText(task && task.dueDate) || normalizeText(task && task.dueTime))

      if (!hasAnyValue) {
        return null
      }

      return {
        title,
        description,
        type: normalizeTaskType(task && task.type),
        priority: normalizeTaskPriority(task && task.priority),
        dueAt,
        dueDateText: buildTaskDueText(task, dueAt)
      }
    })
    .filter(Boolean)
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

  const createdAt = payload.createdAt instanceof Date ? payload.createdAt : new Date()
  const result = await db.collection('notifications').add({
    data: {
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
      bizDate: normalizeText(payload.bizDate) || formatBizDate(createdAt),
      dedupeKey,
      extra: payload.extra && typeof payload.extra === 'object' && !Array.isArray(payload.extra) ? payload.extra : {},
      notifyTime: null,
      isSent: false,
      createdAt,
      updatedAt: createdAt,
      readAt: null,
      resolvedAt: null
    }
  })

  return {
    _id: result._id
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()

  if (!event.projectId || !normalizeText(event.content)) {
    return {
      ok: false,
      message: 'projectId and content are required'
    }
  }

  const projectResult = await db.collection('projects').where({
    _id: event.projectId,
    _openid: wxContext.OPENID
  }).limit(1).get()

  if (!projectResult.data.length) {
    return {
      ok: false,
      message: 'project not found'
    }
  }

  if (projectResult.data[0].handoverStatus === 'handed_over' && !projectResult.data[0].isSharedProject) {
    return {
      ok: false,
      message: 'project already handed over'
    }
  }

  const now = new Date()
  const followUpTime = parseDateTime(event.followUpTime, now)
  const selectedStage = normalizeText(event.stageChange)
  const shouldUpdateStage = selectedStage && selectedStage !== '不变更'
  const userResult = await db.collection('users').where({
    _openid: wxContext.OPENID
  }).limit(1).get()
  const actorProfile = userResult.data[0] || {}
  const actorName = normalizeText(actorProfile.nickName) || '当前用户'
  const taskPayloads = normalizeTaskPayloads(event.tasks)

  const invalidTask = taskPayloads.find((task) => !task.title || !task.dueAt)
  if (invalidTask) {
    return {
      ok: false,
      message: '任务需要填写标题和截止时间'
    }
  }

  const addResult = await db.collection('followUps').add({
    data: {
      _openid: wxContext.OPENID,
      projectId: event.projectId,
      actorOpenid: wxContext.OPENID,
      actorName,
      followUpTime,
      method: normalizeText(event.method) || '其他',
      content: normalizeText(event.content),
      images: Array.isArray(event.images) ? event.images : [],
      stageChange: shouldUpdateStage ? selectedStage : '',
      nextFollowUpTime: normalizeText(event.nextFollowUpTime),
      aiSummary: normalizeText(event.aiSummary),
      aiHighlights: normalizeStringArray(event.aiHighlights),
      aiRisks: normalizeStringArray(event.aiRisks),
      aiRecommendedStage: normalizeText(event.aiRecommendedStage),
      aiStageChangeReason: normalizeText(event.aiStageChangeReason),
      aiMissingInfo: normalizeStringArray(event.aiMissingInfo),
      createdAt: now
    }
  })

  if (taskPayloads.length) {
    await Promise.all(taskPayloads.map((task) => db.collection('tasks').add({
      data: {
        _openid: wxContext.OPENID,
        projectId: event.projectId,
        sourceFollowUpId: addResult._id,
        ownerOpenid: wxContext.OPENID,
        ownerName: actorName,
        creatorOpenid: wxContext.OPENID,
        creatorName: actorName,
        title: task.title,
        type: task.type,
        priority: task.priority,
        status: 'pending',
        dueAt: task.dueAt,
        dueDateText: task.dueDateText,
        description: task.description,
        resultSummary: '',
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        completedAt: null,
        completedByOpenid: '',
        completedByName: '',
        canceledAt: null,
        canceledByOpenid: '',
        canceledByName: ''
      }
    })))
  }

  const updatePayload = {
    updatedAt: now
  }

  if (normalizeText(event.nextFollowUpTime)) {
    updatePayload.nextFollowUpDate = normalizeText(event.nextFollowUpTime)
  }

  if (shouldUpdateStage) {
    updatePayload.stage = selectedStage
  }

  await db.collection('projects').doc(event.projectId).update({
    data: updatePayload
  })

  try {
    const notificationResult = await db.collection('notifications').where({
      _openid: wxContext.OPENID,
      projectId: event.projectId
    }).get()

    const closableNotifications = (notificationResult.data || []).filter((item) => {
      const type = normalizeText(item.type)
      return (type === 'todo_due' || type === 'todo_overdue' || type === 'todo_upcoming') && normalizeText(item.status) !== 'resolved'
    })

    if (closableNotifications.length) {
      await Promise.all(closableNotifications.map((item) => {
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

    if (projectResult.data[0].isSharedProject) {
      const handoverNotifications = (notificationResult.data || []).filter((item) => {
        return normalizeText(item.type) === 'project_taken_over' && normalizeText(item.status) !== 'resolved'
      })

      if (handoverNotifications.length) {
        await Promise.all(handoverNotifications.map((item) => {
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
    }
  } catch (error) {
    // Do not block follow-up saving when the notifications collection is not ready.
  }

  try {
    const project = projectResult.data[0]
    const sharedFromOpenid = normalizeText(project.sharedFromOpenid)
    const sourceProjectId = normalizeText(project.sourceProjectId)
    const sourceShareRecordId = normalizeText(project.sourceShareRecordId)

    if (project.isSharedProject && sharedFromOpenid && sourceProjectId && sourceShareRecordId) {
      const sourceShareRecordResult = await db.collection('shareRecords').doc(sourceShareRecordId).get()
      const sourceShareRecord = sourceShareRecordResult.data || {}
      const sourceProjectResult = await db.collection('projects').where({
        _id: sourceProjectId,
        _openid: sharedFromOpenid
      }).limit(1).get()
      const sourceProject = sourceProjectResult.data[0] || {}
      const sourceProjectName = normalizeText(sourceProject.projectName) || normalizeText(project.projectName) || '未命名项目'
      const bizDate = formatBizDate(now)

      await db.collection('shareRecords').doc(sourceShareRecordId).update({
        data: {
          updatedAt: now,
          lastCollaboratorFollowAt: now
        }
      })

      await ensureNotification(sharedFromOpenid, {
        type: 'shared_followed',
        level: 'normal',
        title: '对方已继续推进',
        summary: `${actorName} 已更新 ${sourceProjectName} 的跟进记录，可在外发项目中查看最新进展。`,
        projectId: sourceProjectId,
        projectName: sourceProjectName,
        shareRecordId: sourceShareRecordId,
        sourceOpenid: wxContext.OPENID,
        sourceName: actorName,
        actionUrl: `/pages/project-detail/project-detail?projectId=${sourceProjectId}&view=shared-out`,
        actionLabel: '查看外发进展',
        bizDate,
        dedupeKey: `shared_followed_${sourceShareRecordId}_${bizDate}`,
        extra: {
          importedProjectId: event.projectId,
          followUpId: addResult._id,
          sharedFromOpenid,
          receiverOpenid: wxContext.OPENID,
          receiverName: actorName,
          latestContent: normalizeText(event.content).slice(0, 80),
          shareMode: normalizeText(sourceShareRecord.shareMode) || 'outbound'
        },
        createdAt: now
      })
    }
  } catch (error) {
    // Do not block follow-up saving when collaborative notifications fail.
  }

  return {
    ok: true,
    followUpId: addResult._id,
    projectId: event.projectId,
    taskCount: taskPayloads.length,
    updatedStage: shouldUpdateStage ? selectedStage : projectResult.data[0].stage,
    nextFollowUpDate: normalizeText(event.nextFollowUpTime) || formatDateOnly(projectResult.data[0].nextFollowUpDate)
  }
}
