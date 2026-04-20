const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const defaultShareTags = [
  {
    id: 't1',
    name: '基础浏览',
    desc: '隐藏电话、微信，仅展示项目基础信息与联系人姓名。',
    fields: ['项目名称', '客户名称', '当前阶段', '预计金额', '联系人姓名', '项目描述']
  },
  {
    id: 't2',
    name: '完整外发',
    desc: '展示完整联系方式与下一步动作，适合项目接手。',
    fields: ['项目名称', '客户名称', '当前阶段', '预计金额', '项目描述', '联系人姓名', '联系人电话', '联系人微信', '下一步动作', '分享来源']
  },
  {
    id: 't3',
    name: '全量查看',
    desc: '展示全部可分享字段，并附带来源说明。',
    fields: ['全部字段']
  }
]

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeHistoryScope(value, mode) {
  const text = normalizeText(value)
  if (text === 'full' || text === 'key' || text === 'none') {
    return text
  }

  return mode === 'outbound' ? 'full' : 'key'
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

function clone(data) {
  return JSON.parse(JSON.stringify(data))
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

function buildTimelineKey(prefix, id, time, suffix = '') {
  const baseId = String(id || '').trim() || 'record'
  const rawTime = time instanceof Date ? time.getTime() : new Date(time).getTime()
  const timeKey = Number.isNaN(rawTime) ? 'time' : String(rawTime)
  const tail = String(suffix || '').trim()
  return [prefix, baseId, timeKey, tail].filter(Boolean).join('-')
}

function normalizeShareTag(tag, index = 0) {
  return {
    id: normalizeText(tag && tag.id) || `tag-${index + 1}`,
    name: normalizeText(tag && tag.name) || `标签${index + 1}`,
    desc: normalizeText(tag && tag.desc),
    fields: Array.isArray(tag && tag.fields)
      ? tag.fields.map((field) => normalizeText(field)).filter(Boolean)
      : []
  }
}

function resolveShareTag(record, ownerUser) {
  const ownerTags = Array.isArray(ownerUser && ownerUser.shareTags) && ownerUser.shareTags.length
    ? ownerUser.shareTags.map(normalizeShareTag)
    : defaultShareTags.map(normalizeShareTag)

  const snapshotFields = Array.isArray(record.shareTagFields)
    ? record.shareTagFields.map((field) => normalizeText(field)).filter(Boolean)
    : []

  const matched = ownerTags.find((item) => item.id === record.shareTagId)
    || ownerTags.find((item) => item.name === record.shareTagName)

  if (matched) {
    return {
      ...matched,
      fields: snapshotFields.length ? snapshotFields : matched.fields
    }
  }

  return {
    id: normalizeText(record.shareTagId) || 'shared-tag',
    name: normalizeText(record.shareTagName) || '分享标签',
    desc: '',
    fields: snapshotFields.length ? snapshotFields : ['全部字段']
  }
}

function mapContacts(contacts) {
  return Array.isArray(contacts)
    ? contacts.map((contact, index) => ({
        id: contact.contactId || contact.id || `contact-${index}`,
        name: contact.name || '',
        role: contact.role || '',
        phone: contact.phone || '',
        wechat: contact.wechat || '',
        company: contact.company || ''
      }))
    : []
}

function buildTimelineItem(followUp, extra = {}) {
  const method = normalizeText(followUp.method) || '跟进'
  const stageChange = normalizeText(followUp.stageChange)
  const nextFollowUpText = normalizeText(followUp.nextFollowUpTime)
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
    fromCollaborator
  }
}

function buildKeyHistorySummary(item) {
  if (normalizeText(item.summary)) {
    return normalizeText(item.summary)
  }

  if (item.typeKey === 'task_done') {
    return normalizeText(item.title) || '动作已完成'
  }

  if (normalizeText(item.stageChange)) {
    return `阶段已更新为 ${normalizeText(item.stageChange)}`
  }

  if (normalizeText(item.nextFollowUpText)) {
    return `已约定下次跟进 ${normalizeText(item.nextFollowUpText)}`
  }

  return `${normalizeText(item.methodLabel || item.typeLabel) || '跟进'}已记录`
}

function filterTimelineByHistoryScope(followTimeline, historyScope) {
  const scope = normalizeHistoryScope(historyScope)
  if (scope === 'none') {
    return []
  }

  if (scope === 'full') {
    return followTimeline
  }

  return (Array.isArray(followTimeline) ? followTimeline : []).map((group) => ({
    ...group,
    items: (Array.isArray(group.items) ? group.items : []).map((item) => ({
      ...item,
      summary: buildKeyHistorySummary(item),
      desc: '',
      rawLabel: '',
      highlights: Array.isArray(item.highlights) ? item.highlights : [],
      risks: Array.isArray(item.risks) ? item.risks : [],
      missingInfo: Array.isArray(item.missingInfo) ? item.missingInfo : []
    }))
  }))
}

function normalizeBriefPayload(value) {
  const payload = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const overviewLines = Array.isArray(payload.overviewLines) ? payload.overviewLines : payload.briefLines
  const timelineInsight = normalizeText(payload.timelineInsight || payload.shareGoal)
  const summaryText = normalizeText(payload.summaryText) || (Array.isArray(overviewLines)
    ? overviewLines.map((item) => normalizeText(item)).filter(Boolean).concat(timelineInsight ? [timelineInsight] : []).join(' ')
    : timelineInsight)
  return {
    title: normalizeText(payload.title),
    summaryText,
    overviewLines: Array.isArray(overviewLines)
      ? overviewLines.map((item) => normalizeText(item)).filter(Boolean).slice(0, 4)
      : [],
    timelineInsight,
    briefLines: summaryText ? [summaryText] : (Array.isArray(overviewLines)
      ? overviewLines.map((item) => normalizeText(item)).filter(Boolean).slice(0, 4)
      : []),
    shareGoal: summaryText || timelineInsight,
    cta: normalizeText(payload.cta),
    tone: normalizeText(payload.tone),
    sourceType: normalizeText(payload.sourceType),
    sourceLabel: normalizeText(payload.sourceLabel),
    providerLabel: normalizeText(payload.providerLabel),
    modelName: normalizeText(payload.modelName),
    canRegenerate: payload.canRegenerate !== false
  }
}

function normalizeSummaryMode(value) {
  const text = normalizeText(value)
  if (text === 'system' || text === 'replace' || text === 'append') {
    return text
  }

  return 'system'
}

function buildTimeline(followUps, fallbackActorName) {
  const groupedMap = {}

  ;(Array.isArray(followUps) ? followUps : []).forEach((followUp) => {
    const label = formatDateLabel(followUp.followUpTime)
    if (!groupedMap[label]) {
      groupedMap[label] = []
    }

    groupedMap[label].push(buildTimelineItem({
      ...followUp,
      actorName: followUp.actorName || fallbackActorName || '分享方'
    }))
  })

  return Object.keys(groupedMap).map((label) => ({
    date: label,
    items: groupedMap[label]
  }))
}

function buildProjectDetail(project) {
  return {
    id: project._id,
    name: project.projectName || '未命名项目',
    client: project.clientName || '未填写客户',
    stage: project.stage || '线索',
    estimatedAmount: formatAmount(project.estimatedAmount),
    estimatedAmountValue: project.estimatedAmount || 0,
    actualAmount: formatAmount(project.actualAmount),
    actualAmountValue: project.actualAmount || 0,
    expectedCommission: formatAmount(project.expectedCommission),
    expectedCommissionValue: project.expectedCommission || 0,
    nextFollowUp: project.nextFollowUpDate || '待设置',
    description: project.description || '暂无项目摘要',
    tags: Array.isArray(project.tags) ? clone(project.tags) : []
  }
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
  const createdAt = parseDate(payload.createdAt) || now
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
      notifyTime: parseDate(payload.notifyTime),
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

function buildImportedProjectPayload(sourceProject, shareRecord, ownerName, receiverOpenid, receiverName, now) {
  return {
    projectName: sourceProject.projectName || '未命名项目',
    clientName: sourceProject.clientName || '未填写客户',
    stage: sourceProject.stage || '线索',
    estimatedAmount: Number(sourceProject.estimatedAmount || 0),
    actualAmount: Number(sourceProject.actualAmount || 0),
    expectedCommission: Number(sourceProject.expectedCommission || 0),
    description: sourceProject.description || '',
    nextFollowUpDate: sourceProject.nextFollowUpDate || '',
    status: sourceProject.status || '进行中',
    isClosed: !!sourceProject.isClosed,
    contacts: Array.isArray(sourceProject.contacts) ? clone(sourceProject.contacts) : [],
    tags: Array.isArray(sourceProject.tags) ? clone(sourceProject.tags) : [],
    isSharedProject: true,
    sourceProjectId: sourceProject._id,
    sharedFromOpenid: shareRecord._openid,
    sharedFromName: ownerName || '分享方',
    receiverOpenid,
    receiverName,
    sourceShareRecordId: shareRecord._id,
    sharedMode: shareRecord.shareMode || 'outbound',
    sharedTagId: shareRecord.shareTagId || '',
    sharedTagName: shareRecord.shareTagName || '',
    updatedAt: now
  }
}

function buildImportedFollowUpPayload(followUp, receiverOpenid, importedProjectId, sourceOwnerOpenid, ownerName, now, historyScope) {
  const scope = normalizeHistoryScope(historyScope)
  const basePayload = {
    _openid: receiverOpenid,
    projectId: importedProjectId,
    sourceFollowUpId: followUp._id,
    sharedFromOpenid: sourceOwnerOpenid,
    importedFromShare: true,
    actorOpenid: followUp.actorOpenid || sourceOwnerOpenid,
    actorName: followUp.actorName || ownerName || '分享方',
    followUpTime: followUp.followUpTime,
    method: followUp.method || '其他',
    images: Array.isArray(followUp.images) ? clone(followUp.images) : [],
    stageChange: followUp.stageChange || '',
    nextFollowUpTime: followUp.nextFollowUpTime || '',
    createdAt: followUp.createdAt || now
  }

  if (scope === 'key') {
    return {
      ...basePayload,
      content: '',
      aiSummary: followUp.aiSummary || '',
      aiHighlights: Array.isArray(followUp.aiHighlights) ? clone(followUp.aiHighlights) : [],
      aiRisks: Array.isArray(followUp.aiRisks) ? clone(followUp.aiRisks) : [],
      aiRecommendedStage: followUp.aiRecommendedStage || '',
      aiStageChangeReason: followUp.aiStageChangeReason || '',
      aiMissingInfo: Array.isArray(followUp.aiMissingInfo) ? clone(followUp.aiMissingInfo) : []
    }
  }

  return {
    ...basePayload,
    content: followUp.content || '',
    aiSummary: followUp.aiSummary || '',
    aiHighlights: Array.isArray(followUp.aiHighlights) ? clone(followUp.aiHighlights) : [],
    aiRisks: Array.isArray(followUp.aiRisks) ? clone(followUp.aiRisks) : [],
    aiRecommendedStage: followUp.aiRecommendedStage || '',
    aiStageChangeReason: followUp.aiStageChangeReason || '',
    aiMissingInfo: Array.isArray(followUp.aiMissingInfo) ? clone(followUp.aiMissingInfo) : []
  }
}

async function syncImportedFollowUps(receiverOpenid, importedProjectId, sourceProjectId, sourceOwnerOpenid, ownerName, historyScope) {
  const scope = normalizeHistoryScope(historyScope, 'outbound')
  if (scope === 'none') {
    return
  }

  const sourceFollowResult = await db.collection('followUps').where({
    _openid: sourceOwnerOpenid,
    projectId: sourceProjectId
  }).orderBy('followUpTime', 'asc').get()

  const existingImported = await db.collection('followUps').where({
    _openid: receiverOpenid,
    projectId: importedProjectId
  }).get()

  const existingSourceIds = new Set(
    existingImported.data
      .map((item) => normalizeText(item.sourceFollowUpId))
      .filter(Boolean)
  )

  const now = new Date()

  for (const followUp of sourceFollowResult.data) {
    if (existingSourceIds.has(followUp._id)) {
      continue
    }

    await db.collection('followUps').add({
      data: buildImportedFollowUpPayload(followUp, receiverOpenid, importedProjectId, sourceOwnerOpenid, ownerName, now, scope)
    })
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const shareRecordId = normalizeText(event.shareRecordId)

  if (!shareRecordId) {
    return {
      ok: false,
      message: 'shareRecordId is required'
    }
  }

  const shareRecordResult = await db.collection('shareRecords').doc(shareRecordId).get()
  const shareRecord = shareRecordResult.data

  if (!shareRecord || !shareRecord.projectId) {
    return {
      ok: false,
      message: 'share record not found'
    }
  }

  const ownerOpenid = shareRecord._openid
  const receiverOpenid = wxContext.OPENID
  const ownerUserResult = await db.collection('users').where({
    _openid: ownerOpenid
  }).limit(1).get()
  const ownerUser = ownerUserResult.data[0] || {}
  const ownerName = normalizeText(ownerUser.nickName) || '分享方'
  const receiverUserResult = await db.collection('users').where({
    _openid: receiverOpenid
  }).limit(1).get()
  const receiverUser = receiverUserResult.data[0] || {}
  const receiverName = normalizeText(receiverUser.nickName) || '微信用户'
  const shareTag = resolveShareTag(shareRecord, ownerUser)
  const historyScope = normalizeHistoryScope(shareRecord.historyScope, shareRecord.shareMode)

  const sourceProjectResult = await db.collection('projects').where({
    _id: shareRecord.projectId,
    _openid: ownerOpenid
  }).limit(1).get()

  if (!sourceProjectResult.data.length) {
    return {
      ok: false,
      message: 'shared project not found'
    }
  }

  const sourceProject = sourceProjectResult.data[0]
  const sourceFollowResult = await db.collection('followUps').where({
    _openid: ownerOpenid,
    projectId: sourceProject._id
  }).orderBy('followUpTime', 'desc').get()

  let effectiveProject = sourceProject
  let effectiveFollowUps = sourceFollowResult.data
  let importedProjectId = ''
  let imported = false

  if (shareRecord.shareMode === 'outbound' && receiverOpenid && receiverOpenid !== ownerOpenid) {
    const existingProjectResult = await db.collection('projects').where({
      _openid: receiverOpenid,
      sourceProjectId: sourceProject._id,
      sharedFromOpenid: ownerOpenid
    }).limit(1).get()

    const now = new Date()
    const importPayload = buildImportedProjectPayload(sourceProject, shareRecord, ownerName, receiverOpenid, receiverName, now)
    const isFirstImport = !existingProjectResult.data.length && !normalizeText(shareRecord.importedProjectId)

    if (existingProjectResult.data.length) {
      importedProjectId = existingProjectResult.data[0]._id
      await db.collection('projects').doc(importedProjectId).update({
        data: importPayload
      })
    } else {
      const addResult = await db.collection('projects').add({
        data: {
          _openid: receiverOpenid,
          createdAt: now,
          ...importPayload
        }
      })
      importedProjectId = addResult._id
    }

    await syncImportedFollowUps(receiverOpenid, importedProjectId, sourceProject._id, ownerOpenid, ownerName, historyScope)

    await db.collection('projects').doc(sourceProject._id).update({
      data: {
        handoverStatus: 'handed_over',
        handoverToOpenid: receiverOpenid,
        handoverToName: receiverName,
        handedOverAt: shareRecord.importedAt || now,
        outboundShareRecordId: shareRecord._id,
        updatedAt: now
      }
    })

    const importedProjectResult = await db.collection('projects').doc(importedProjectId).get()
    const importedFollowResult = await db.collection('followUps').where({
      _openid: receiverOpenid,
      projectId: importedProjectId
    }).orderBy('followUpTime', 'desc').get()

    effectiveProject = importedProjectResult.data
    effectiveFollowUps = importedFollowResult.data
    imported = true

    await db.collection('shareRecords').doc(shareRecordId).update({
      data: {
        receiverOpenid,
        receiverName,
        firstOpenedAt: shareRecord.firstOpenedAt || now,
        lastViewedAt: now,
        importedProjectId,
        importedAt: shareRecord.importedAt || now,
        updatedAt: now,
        viewCount: _.inc(1)
      }
    })

    if (isFirstImport) {
      await Promise.all([
        ensureNotification(receiverOpenid, {
          type: 'project_taken_over',
          level: 'normal',
          title: '你已接手项目',
          summary: `${buildProjectDetail(sourceProject).name} 已进入“我的项目”，后续由你继续推进。`,
          projectId: importedProjectId,
          projectName: buildProjectDetail(sourceProject).name,
          shareRecordId,
          sourceOpenid: ownerOpenid,
          sourceName: ownerName,
          actionUrl: `/pages/project-detail/project-detail?projectId=${importedProjectId}&view=projects`,
          actionLabel: '查看项目',
          bizDate: formatBizDate(now),
          dedupeKey: `project_taken_over_${importedProjectId}`,
          extra: {
            importedProjectId,
            sourceProjectId: sourceProject._id
          },
          createdAt: now
        }),
        ensureNotification(ownerOpenid, {
          type: 'shared_imported',
          level: 'normal',
          title: '对方已接手项目',
          summary: `${receiverName} 已接手 ${buildProjectDetail(sourceProject).name}，后续将由对方继续推进。`,
          projectId: sourceProject._id,
          projectName: buildProjectDetail(sourceProject).name,
          shareRecordId,
          sourceOpenid: receiverOpenid,
          sourceName: receiverName,
          actionUrl: `/pages/project-detail/project-detail?projectId=${sourceProject._id}&view=shared-out`,
          actionLabel: '查看外发进展',
          bizDate: formatBizDate(now),
          dedupeKey: `shared_imported_${shareRecordId}`,
          extra: {
            importedProjectId,
            receiverOpenid
          },
          createdAt: now
        })
      ])
    }
  } else if (receiverOpenid && receiverOpenid !== ownerOpenid) {
    const now = new Date()
    const isFirstOpen = !shareRecord.firstOpenedAt

    await db.collection('shareRecords').doc(shareRecordId).update({
      data: {
        receiverOpenid,
        receiverName,
        firstOpenedAt: shareRecord.firstOpenedAt || now,
        lastViewedAt: now,
        updatedAt: now,
        viewCount: _.inc(1)
      }
    })

    if (isFirstOpen) {
      await ensureNotification(ownerOpenid, {
        type: 'shared_opened',
        level: 'info',
        title: '对方已查看卡片',
        summary: `${receiverName} 已查看 ${buildProjectDetail(sourceProject).name} 的分享卡片。`,
        projectId: sourceProject._id,
        projectName: buildProjectDetail(sourceProject).name,
        shareRecordId,
        sourceOpenid: receiverOpenid,
        sourceName: receiverName,
        actionUrl: `/pages/project-detail/project-detail?projectId=${sourceProject._id}&view=projects`,
        actionLabel: '查看项目',
        bizDate: formatBizDate(now),
        dedupeKey: `shared_opened_${shareRecordId}`,
        extra: {
          receiverOpenid,
          receiverName,
          shareMode: normalizeText(shareRecord.shareMode) || 'info'
        },
        createdAt: now
      })
    }
  }

  return {
    ok: true,
    imported,
    importedProjectId,
    shareMode: shareRecord.shareMode || 'info',
    historyScope,
    summaryMode: normalizeSummaryMode(shareRecord.summaryMode),
    summaryText: normalizeText(shareRecord.summaryText),
    aiBrief: normalizeBriefPayload(shareRecord.aiBrief),
    shareTag,
    shareProject: {
      projectDetail: buildProjectDetail(effectiveProject),
      contacts: mapContacts(effectiveProject.contacts),
      followTimeline: filterTimelineByHistoryScope(buildTimeline(effectiveFollowUps, ownerName), historyScope)
    }
  }
}
