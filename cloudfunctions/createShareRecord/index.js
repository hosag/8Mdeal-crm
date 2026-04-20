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

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const projectId = normalizeText(event.projectId)
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
  const existing = await db.collection('shareRecords').where({
    _openid: wxContext.OPENID,
    projectId,
    shareMode,
    shareTagId,
    historyScope
  }).limit(1).get()

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
    viewCount: Number(existing.data[0] && existing.data[0].viewCount ? existing.data[0].viewCount : 0),
    receiverOpenid: existing.data[0] && existing.data[0].receiverOpenid ? existing.data[0].receiverOpenid : '',
    receiverName: existing.data[0] && existing.data[0].receiverName ? existing.data[0].receiverName : '',
    firstOpenedAt: existing.data[0] && existing.data[0].firstOpenedAt ? existing.data[0].firstOpenedAt : null,
    lastViewedAt: existing.data[0] && existing.data[0].lastViewedAt ? existing.data[0].lastViewedAt : null,
    importedAt: existing.data[0] && existing.data[0].importedAt ? existing.data[0].importedAt : null,
    importedProjectId: existing.data[0] && existing.data[0].importedProjectId ? existing.data[0].importedProjectId : '',
    updatedAt: now
  }

  if (existing.data.length) {
    await db.collection('shareRecords').doc(existing.data[0]._id).update({
      data: payload
    })

    return {
      ok: true,
      shareRecordId: existing.data[0]._id,
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
