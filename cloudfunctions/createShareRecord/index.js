const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
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

function ensureShareOutAccess(context) {
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

  if (!entitlements.canSaveFollowUp && !entitlements.canCreateProject && !entitlements.canEditProject) {
    throw new Error('ENTITLEMENT_WRITE_DISABLED: 当前账号为只读状态')
  }
}

function ensureOutboundShareAccess(context) {
  const entitlements = context && context.entitlements ? context.entitlements : {}
  if (!entitlements.canShareOut) {
    throw new Error('ENTITLEMENT_SHARE_OUT_DISABLED: 当前套餐暂不支持项目外发')
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

function normalizeFlowMode(value, shareMode) {
  const text = normalizeText(value)
  if (shareMode !== 'outbound') {
    return ''
  }

  if (text === 'clone_seed') {
    return 'clone_seed'
  }

  return 'transfer_original'
}

function buildDefaultSeedProjectName(project) {
  const clientName = normalizeText(project && project.clientName)
  return clientName ? `${clientName} · 新需求` : '新需求项目'
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
  const accessContext = await resolveAccountAccessContext(wxContext.OPENID)
  const projectId = normalizeText(event.projectId)
  const shareRecordId = normalizeText(event.shareRecordId)
  const shareMode = normalizeText(event.shareMode) || 'info'
  const flowMode = normalizeFlowMode(event.flowMode, shareMode)
  const isCloneSeed = flowMode === 'clone_seed'
  const shareTagId = normalizeText(event.shareTagId)
  const shareTagName = shareMode === 'outbound' ? '转交项目' : '发送资料'
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

  ensureShareOutAccess(accessContext)
  if (shareMode === 'outbound') {
    ensureOutboundShareAccess(accessContext)
  }

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

    if (!isCloneSeed && project.handoverStatus === 'handed_over' && !project.isSharedProject) {
      return {
        ok: false,
        code: 'PROJECT_ALREADY_HANDED_OVER',
        message: '该项目已完成转交，请在外发项目中查看后续进展'
      }
    }
  }

  if (shareMode === 'outbound' && !isCloneSeed && !existingRecord && existingOutboundRecord) {
    existingRecord = existingOutboundRecord
  }

  const seedProjectName = isCloneSeed
    ? (normalizeText(event.seedProjectName) || buildDefaultSeedProjectName(project))
    : ''

  const payload = {
    accountId: accessContext.accountId,
    projectId,
    shareMode,
    shareModeTitle: getModeTitle(shareMode),
    flowMode,
    seedProjectName,
    shareTagId,
    shareTagName,
    shareTagFields,
    historyScope,
    aiBrief,
    summaryMode,
    summaryText,
    projectName: isCloneSeed ? seedProjectName : (normalizeText(project.projectName) || '未命名项目'),
    clientName: normalizeText(project.clientName) || '未填写客户',
    projectStage: isCloneSeed ? '线索' : (normalizeText(project.stage) || '线索'),
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
      reusedExistingOutbound: shareMode === 'outbound' && !isCloneSeed && existingRecord._id === (existingOutboundRecord && existingOutboundRecord._id),
      flowMode,
      seedProjectName,
      historyScope,
      aiBrief,
      summaryMode,
      summaryText
    }
  }

  const addResult = await db.collection('shareRecords').add({
    data: {
      _openid: wxContext.OPENID,
      accountId: accessContext.accountId,
      createdAt: now,
      ...payload
    }
  })

  return {
    ok: true,
    shareRecordId: addResult._id,
    flowMode,
    seedProjectName,
    historyScope,
    aiBrief,
    summaryMode,
    summaryText
  }
}
