const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function normalizeText(value) {
  return String(value || '').trim()
}

function isClosedProjectStage(stage) {
  const current = normalizeText(stage)
  return current === '成交' || current === '流失'
}

async function closeOpenProjectTasks(openid, projectId, stage, now) {
  if (!isClosedProjectStage(stage)) {
    return
  }

  const currentStage = normalizeText(stage)
  const reason = currentStage === '成交'
    ? '项目已成交，系统自动取消未完成推进任务'
    : '项目已流失，系统自动取消未完成推进任务'

  try {
    const taskResult = await db.collection('tasks').where({
      _openid: openid,
      projectId,
      status: _.in(['pending', 'in_progress'])
    }).get()
    const tasks = taskResult.data || []

    if (tasks.length) {
      await Promise.all(tasks.map((task) => db.collection('tasks').doc(task._id).update({
        data: {
          status: 'canceled',
          canceledAt: now,
          canceledByOpenid: openid,
          canceledByName: '系统',
          cancelReason: reason,
          canceledReason: reason,
          updatedAt: now
        }
      })))
    }
  } catch (error) {
    // Closing a project should not fail only because the tasks collection is not ready.
  }

  try {
    const notificationResult = await db.collection('notifications').where({
      _openid: openid,
      projectId
    }).get()
    const closableTypes = ['task_due', 'task_overdue', 'task_upcoming', 'todo_due', 'todo_overdue', 'todo_upcoming']
    const closableItems = (notificationResult.data || []).filter((item) => {
      return closableTypes.includes(normalizeText(item.type)) && normalizeText(item.status) !== 'resolved'
    })

    if (closableItems.length) {
      await Promise.all(closableItems.map((item) => db.collection('notifications').doc(item._id).update({
        data: {
          status: 'resolved',
          readAt: item.readAt || now,
          resolvedAt: now,
          updatedAt: now
        }
      })))
    }
  } catch (error) {
    // Notification cleanup is best-effort and should not block follow-up saving.
  }
}

function resolveUserDisplayName(user = {}, fallbackValue = '', defaultText = '当前用户') {
  const customDisplayName = normalizeText(user.customDisplayName)
  if (customDisplayName) {
    return customDisplayName
  }

  const wechatNickname = normalizeText(user.wechatNickname || user.nickName)
  if (wechatNickname) {
    return wechatNickname
  }

  const phoneValue = normalizeText(user.phoneMasked || user.phone)
  if (phoneValue) {
    return phoneValue
  }

  return normalizeText(fallbackValue) || defaultText
}

async function resolveAccountAccessContext(openid) {
  const identityResult = await db.collection('accountIdentities').where({
    provider: 'wechat_mp',
    openid
  }).limit(1).get()
  const identity = identityResult.data[0] || null
  const accountId = normalizeText(identity && identity.accountId)

  if (!accountId) {
    throw new Error('ACCOUNT_NOT_INITIALIZED: 当前账号尚未初始化，请重新进入小程序后再试')
  }

  const accountResult = await db.collection('accounts').where({
    accountId
  }).limit(1).get()
  const entitlementsResult = await db.collection('entitlements').where({
    accountId
  }).limit(1).get()

  return {
    accountId,
    account: accountResult.data[0] || null,
    entitlements: entitlementsResult.data[0] || null
  }
}

function ensureFollowUpWritable(context) {
  const account = context && context.account ? context.account : {}
  const entitlements = context && context.entitlements ? context.entitlements : {}
  const status = normalizeText(entitlements.status || account.status || 'trialing')

  if (status === 'disabled') {
    throw new Error('ACCOUNT_DISABLED: 当前账号已被禁用')
  }

  if (entitlements && entitlements.bindRequiredForWrite) {
    throw new Error('ACCOUNT_PHONE_REQUIRED: 保存正式数据前需要先绑定手机号')
  }

  if (!entitlements || !Object.keys(entitlements).length) {
    if (status === 'free_limited' || status === 'expired_readonly') {
      throw new Error('ENTITLEMENT_WRITE_DISABLED: 当前账号为只读状态')
    }
    return
  }

  if (!entitlements.canSaveFollowUp) {
    throw new Error('ENTITLEMENT_WRITE_DISABLED: 当前账号为只读状态')
  }
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
  const allowed = ['send_solution', 'send_quote', 'demo', 'report_solution', 'business_negotiation', 'research', 'callback', 'meeting', 'contract', 'collect_info', 'other']
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
      accountId: normalizeText(payload.accountId),
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
  const accessContext = await resolveAccountAccessContext(wxContext.OPENID)
  ensureFollowUpWritable(accessContext)

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

  const project = projectResult.data[0]
  const currentProjectClosed = isClosedProjectStage(project.stage) || project.isClosed === true
  if (currentProjectClosed) {
    return {
      ok: false,
      message: project.stage === '流失'
        ? '项目已流失，当前不再新增跟进'
        : '项目已成交，当前不再新增跟进'
    }
  }

  const projectOwnerAccountId = normalizeText(project.ownerAccountId || project.accountId || accessContext.accountId)
  const now = new Date()
  const followUpTime = parseDateTime(event.followUpTime, now)
  const selectedStage = normalizeText(event.stageChange)
  const shouldUpdateStage = selectedStage && selectedStage !== '不变更'
  const shouldCloseProject = shouldUpdateStage && isClosedProjectStage(selectedStage)
  const userResult = await db.collection('users').where({
    _openid: wxContext.OPENID
  }).limit(1).get()
  const actorProfile = userResult.data[0] || {}
  const actorName = resolveUserDisplayName(actorProfile, accessContext.accountId)
  const taskPayloads = shouldCloseProject ? [] : normalizeTaskPayloads(event.tasks)

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
      accountId: accessContext.accountId,
      projectAccountId: projectOwnerAccountId,
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
      aiNextAction: normalizeText(event.aiNextAction),
      aiNextRecommendedTarget: normalizeText(event.aiNextRecommendedTarget),
      aiNextRecommendedMethod: normalizeText(event.aiNextRecommendedMethod),
      aiNextRecommendedTimeWindow: normalizeText(event.aiNextRecommendedTimeWindow),
      aiNextRecommendedDate: normalizeText(event.aiNextRecommendedDate),
      aiNextRecommendedTime: normalizeText(event.aiNextRecommendedTime),
      aiNextTalkTrack: normalizeText(event.aiNextTalkTrack),
      aiNextReason: normalizeText(event.aiNextReason),
      aiNextMissingInfo: normalizeStringArray(event.aiNextMissingInfo),
      aiSuggestedTaskTitle: normalizeText(event.aiSuggestedTaskTitle),
      aiSuggestedTaskType: normalizeText(event.aiSuggestedTaskType),
      aiSuggestedTaskDueDate: normalizeText(event.aiSuggestedTaskDueDate),
      aiSuggestedTaskDueTime: normalizeText(event.aiSuggestedTaskDueTime),
      aiSuggestedTaskDescription: normalizeText(event.aiSuggestedTaskDescription),
      createdAt: now
    }
  })

  if (taskPayloads.length) {
    await Promise.all(taskPayloads.map((task) => db.collection('tasks').add({
      data: {
        _openid: wxContext.OPENID,
        accountId: accessContext.accountId,
        projectAccountId: projectOwnerAccountId,
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

  if (shouldUpdateStage) {
    updatePayload.stage = selectedStage
    updatePayload.isClosed = shouldCloseProject
  }

  await db.collection('projects').doc(event.projectId).update({
    data: updatePayload
  })
  await closeOpenProjectTasks(wxContext.OPENID, event.projectId, selectedStage, now)

  try {
    const notificationResult = await db.collection('notifications').where({
      _openid: wxContext.OPENID,
      projectId: event.projectId
    }).get()

    const closableNotifications = (notificationResult.data || []).filter((item) => {
      const type = normalizeText(item.type)
      return (type === 'todo_due' || type === 'todo_overdue' || type === 'todo_upcoming' || type === 'project_silent') && normalizeText(item.status) !== 'resolved'
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
        accountId: normalizeText(project.sharedFromAccountId || projectOwnerAccountId),
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
        actionLabel: '进入外发项目',
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
    updatedStage: shouldUpdateStage ? selectedStage : projectResult.data[0].stage
  }
}
