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

function normalizeBriefPayload(value) {
  const payload = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const overviewLines = Array.isArray(payload.overviewLines) ? payload.overviewLines : payload.briefLines
  const timelineInsight = normalizeText(payload.timelineInsight || payload.shareGoal)
  const summaryText = normalizeText(payload.summaryText) || normalizeStringArray(overviewLines).concat(timelineInsight ? [timelineInsight] : []).join(' ')
  return {
    title: normalizeText(payload.title),
    summaryText,
    overviewLines: normalizeStringArray(overviewLines).slice(0, 4),
    timelineInsight,
    briefLines: summaryText ? [summaryText] : normalizeStringArray(overviewLines).slice(0, 4),
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

function normalizeSummaryText(value) {
  return normalizeText(value)
}

function normalizeHistoryScope(value, mode) {
  const text = normalizeText(value)
  if (text === 'full' || text === 'key' || text === 'none') {
    return text
  }

  return mode === 'outbound' ? 'full' : 'key'
}

function getModeTitle(mode) {
  return mode === 'outbound' ? '项目外发' : '分享信息'
}

function pickPreferredOutboundRecord(records = []) {
  const list = Array.isArray(records) ? records.slice() : []
  if (!list.length) {
    return null
  }

  return list.sort((left, right) => {
    const leftImported = Number(Boolean(left && left.importedProjectId))
    const rightImported = Number(Boolean(right && right.importedProjectId))
    if (rightImported !== leftImported) {
      return rightImported - leftImported
    }

    const leftUpdated = new Date(left && (left.updatedAt || left.createdAt || 0)).getTime()
    const rightUpdated = new Date(right && (right.updatedAt || right.createdAt || 0)).getTime()
    return rightUpdated - leftUpdated
  })[0]
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const projectId = normalizeText(event.projectId)
  const shareRecordId = normalizeText(event.shareRecordId)
  const shareMode = normalizeText(event.shareMode) || 'info'
  const shareTagId = normalizeText(event.shareTagId)
  const shareTagName = normalizeText(event.shareTagName) || '未命名标签'
  const shareTagFields = normalizeStringArray(event.shareTagFields)
  const historyScope = normalizeHistoryScope(event.historyScope, shareMode)
  const aiBrief = normalizeBriefPayload(event.aiBrief)
  const summaryMode = normalizeSummaryMode(event.summaryMode)
  const summaryText = normalizeSummaryText(event.summaryText)

  if (!projectId) {
    return {
      ok: false,
      message: 'projectId is required'
    }
  }

  const projectResult = await db.collection('projects').where({
    _id: projectId,
    _openid: wxContext.OPENID
  }).limit(1).get()

  if (!projectResult.data.length) {
    return {
      ok: false,
      message: 'project not found'
    }
  }

  const project = projectResult.data[0]
  const now = new Date()
  let existingRecord = null
  let existingOutboundRecord = null

  if (shareRecordId) {
    const existingResult = await db.collection('shareRecords').where({
      _id: shareRecordId,
      _openid: wxContext.OPENID,
      projectId
    }).limit(1).get()

    existingRecord = existingResult.data[0] || null
  }

  if (shareMode === 'outbound') {
    const outboundResult = await db.collection('shareRecords').where({
      _openid: wxContext.OPENID,
      projectId,
      shareMode: 'outbound'
    }).get()

    const outboundRecords = (outboundResult.data || []).filter((item) => {
      return !existingRecord || item._id !== existingRecord._id
    })

    existingOutboundRecord = pickPreferredOutboundRecord(outboundRecords)

    if (project.handoverStatus === 'handed_over' && !project.isSharedProject) {
      return {
        ok: false,
        code: 'PROJECT_ALREADY_HANDED_OVER',
        message: '该项目已完成转交，请在外发项目中查看后续进展'
      }
    }
  }

  if (shareMode === 'outbound' && !existingRecord && existingOutboundRecord) {
    existingRecord = existingOutboundRecord
  }

  const payload = {
    projectId,
    shareMode,
    shareModeTitle: getModeTitle(shareMode),
    shareTagId,
    shareTagName,
    shareTagFields,
    historyScope,
    aiBrief,
    summaryMode,
    summaryText,
    projectName: normalizeText(project.projectName) || '未命名项目',
    clientName: normalizeText(project.clientName) || '未填写客户',
    projectStage: normalizeText(project.stage) || '线索',
    viewCount: Number(existingRecord && existingRecord.viewCount ? existingRecord.viewCount : 0),
    viewerCount: Number(existingRecord && existingRecord.viewerCount ? existingRecord.viewerCount : 0),
    viewLogs: Array.isArray(existingRecord && existingRecord.viewLogs) ? existingRecord.viewLogs : [],
    receiverOpenid: existingRecord && existingRecord.receiverOpenid ? existingRecord.receiverOpenid : '',
    receiverName: existingRecord && existingRecord.receiverName ? existingRecord.receiverName : '',
    receiverLockedAt: existingRecord && existingRecord.receiverLockedAt ? existingRecord.receiverLockedAt : null,
    firstOpenedAt: existingRecord && existingRecord.firstOpenedAt ? existingRecord.firstOpenedAt : null,
    lastViewedAt: existingRecord && existingRecord.lastViewedAt ? existingRecord.lastViewedAt : null,
    importedAt: existingRecord && existingRecord.importedAt ? existingRecord.importedAt : null,
    importedProjectId: existingRecord && existingRecord.importedProjectId ? existingRecord.importedProjectId : '',
    lastCollaboratorFollowAt: existingRecord && existingRecord.lastCollaboratorFollowAt ? existingRecord.lastCollaboratorFollowAt : null,
    updatedAt: now
  }

  if (existingRecord) {
    await db.collection('shareRecords').doc(existingRecord._id).update({
      data: payload
    })

    return {
      ok: true,
      shareRecordId: existingRecord._id,
      reusedExistingOutbound: shareMode === 'outbound' && existingRecord._id === (existingOutboundRecord && existingOutboundRecord._id),
      historyScope,
      aiBrief,
      summaryMode,
      summaryText
    }
  }

  const addResult = await db.collection('shareRecords').add({
    data: {
      _openid: wxContext.OPENID,
      createdAt: now,
      ...payload
    }
  })

  return {
    ok: true,
    shareRecordId: addResult._id,
    historyScope,
    aiBrief,
    summaryMode,
    summaryText
  }
}
