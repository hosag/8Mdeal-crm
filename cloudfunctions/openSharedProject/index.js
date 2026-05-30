const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const CONTACT_CRYPTO_SECRET = String(process.env.CONTACT_CRYPTO_SECRET || '').trim()
if (!CONTACT_CRYPTO_SECRET) {
  throw new Error('CONTACT_CRYPTO_SECRET is required')
}
const CONTACT_CRYPTO_PREFIX = 'enc:v1'
const CONTACT_CRYPTO_KEY = crypto.createHash('sha256').update(CONTACT_CRYPTO_SECRET).digest()
const REFERRAL_REWARD_AI_TOKENS = 100000
const OUTBOUND_CLAIM_STALE_MS = 5 * 60 * 1000

const defaultShareTags = [
  {
    id: 't1',
    mode: 'info',
    name: '发送资料',
    desc: '对方仅查看资料，项目仍由我维护。',
    fields: ['项目名称', '客户名称', '当前阶段', '预计金额', '联系人姓名', '项目描述']
  },
  {
    id: 't2',
    mode: 'outbound',
    name: '转交项目',
    desc: '对方接手后继续推进，我在外发项目查看进展。',
    fields: ['项目名称', '客户名称', '当前阶段', '预计金额', '项目描述', '联系人姓名', '联系人电话', '联系人微信', '下一步动作', '分享来源']
  }
]

function normalizeText(value) {
  return String(value || '').trim()
}

function resolveUserDisplayName(user = {}, fallbackValue = '', defaultText = '微信用户') {
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

async function resolveAccountIdByOpenid(openid = '') {
  const currentOpenid = normalizeText(openid)
  if (!currentOpenid) {
    return ''
  }

  try {
    const result = await db.collection('accountIdentities').where({
      provider: 'wechat_mp',
      openid: currentOpenid
    }).limit(1).get()
    return normalizeText(result.data[0] && result.data[0].accountId)
  } catch (error) {
    return ''
  }
}

function isTransferredReadonlyProject(project) {
  return project && project.handoverStatus === 'handed_over' && !project.isSharedProject
}

function isAttributionEligibleProject(project) {
  if (!project || isTransferredReadonlyProject(project)) {
    return false
  }
  if (project.isSharedProject || project.importedFromShare || normalizeText(project.sharedFromOpenid) || normalizeText(project.sourceShareRecordId)) {
    return false
  }
  return true
}

async function safeGetOne(collectionName, query, options = {}) {
  try {
    let request = db.collection(collectionName).where(query)
    if (options.orderByField && options.orderByDirection) {
      request = request.orderBy(options.orderByField, options.orderByDirection)
    }
    const result = await request.limit(1).get()
    return result.data[0] || null
  } catch (error) {
    return null
  }
}

async function safeGetList(collectionName, query, options = {}) {
  try {
    let request = db.collection(collectionName).where(query)
    if (options.orderByField && options.orderByDirection) {
      request = request.orderBy(options.orderByField, options.orderByDirection)
    }
    if (options.limit) {
      request = request.limit(options.limit)
    }
    const result = await request.get()
    return Array.isArray(result.data) ? result.data : []
  } catch (error) {
    return []
  }
}

async function countAttributionEligibleProjects(accountId, openid) {
  const [projectsByOwner, projectsByAccount, projectsByOpenid] = await Promise.all([
    safeGetList('projects', {
      ownerAccountId: accountId
    }, {
      limit: 1000
    }),
    safeGetList('projects', {
      accountId
    }, {
      limit: 1000
    }),
    openid
      ? safeGetList('projects', {
        _openid: openid
      }, {
        limit: 1000
      })
      : Promise.resolve([])
  ])
  const projectMap = {}

  ;[projectsByOwner, projectsByAccount, projectsByOpenid].forEach((list) => {
    list.forEach((item) => {
      const key = normalizeText(item && item._id)
      if (!key || projectMap[key]) {
        return
      }
      projectMap[key] = item
    })
  })

  return Object.values(projectMap).filter(isAttributionEligibleProject).length
}

function getShareAttributionSourceType(shareRecord = {}) {
  return normalizeText(shareRecord.shareMode) === 'outbound'
    ? 'project_handover'
    : 'share_material'
}

async function ensureShareAttributionRelation(options = {}) {
  const referrerAccountId = normalizeText(options.referrerAccountId)
  const referrerOpenid = normalizeText(options.referrerOpenid)
  const inviteeAccountId = normalizeText(options.inviteeAccountId)
  const inviteeOpenid = normalizeText(options.inviteeOpenid)
  const shareRecord = options.shareRecord || {}
  const now = options.now instanceof Date ? options.now : new Date()

  if (!referrerAccountId || !inviteeAccountId || !inviteeOpenid) {
    return {
      ok: false,
      skipped: true,
      reason: 'account_not_ready'
    }
  }

  if (referrerAccountId === inviteeAccountId || referrerOpenid === inviteeOpenid) {
    return {
      ok: false,
      skipped: true,
      reason: 'self_attribution'
    }
  }

  const existing = await safeGetOne('referralRelations', {
    inviteeAccountId
  }, {
    orderByField: 'createdAt',
    orderByDirection: 'asc'
  })

  if (existing && existing._id) {
    return {
      ok: true,
      alreadyBound: true,
      relationId: existing._id,
      status: normalizeText(existing.status || 'pending'),
      sourceType: normalizeText(existing.sourceType || 'referral_code')
    }
  }

  const inviteeProjectCount = await countAttributionEligibleProjects(inviteeAccountId, inviteeOpenid)
  if (inviteeProjectCount > 0) {
    return {
      ok: false,
      skipped: true,
      reason: 'invitee_already_used_project_feature',
      inviteeProjectCount
    }
  }

  const sourceType = getShareAttributionSourceType(shareRecord)
  const sourceShareMode = normalizeText(shareRecord.shareMode) || 'info'

  try {
    const result = await db.collection('referralRelations').add({
      data: {
        _openid: inviteeOpenid,
        referrerAccountId,
        referrerOpenid,
        referrerCode: '',
        inviteeAccountId,
        inviteeOpenid,
        status: 'pending',
        rewardAiTokens: REFERRAL_REWARD_AI_TOKENS,
        referrerRewardAiTokens: REFERRAL_REWARD_AI_TOKENS,
        inviteeRewardAiTokens: REFERRAL_REWARD_AI_TOKENS,
        triggerScene: 'first_project_created',
        sourceType,
        sourceId: normalizeText(shareRecord._id),
        sourceProjectId: normalizeText(shareRecord.projectId),
        sourceShareMode,
        sourceFlowMode: normalizeText(shareRecord.flowMode),
        sourceShareTagId: normalizeText(shareRecord.shareTagId),
        sourceShareTagName: normalizeText(shareRecord.shareTagName),
        boundAt: now,
        createdAt: now,
        updatedAt: now
      }
    })

    return {
      ok: true,
      alreadyBound: false,
      relationId: result._id,
      status: 'pending',
      sourceType
    }
  } catch (error) {
    return {
      ok: false,
      skipped: true,
      reason: 'relation_create_failed',
      message: error && error.message ? error.message : 'relation create failed'
    }
  }
}

function isEncryptedValue(value) {
  return normalizeText(value).startsWith(`${CONTACT_CRYPTO_PREFIX}:`)
}

function encryptSensitiveValue(value) {
  const text = normalizeText(value)
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
  const text = normalizeText(value)
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
  const shareMode = normalizeText(record && record.shareMode) === 'outbound' ? 'outbound' : 'info'
  const scopeName = shareMode === 'outbound' ? '转交项目' : '发送资料'
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
      name: scopeName,
      fields: snapshotFields.length ? snapshotFields : matched.fields
    }
  }

  return {
    id: normalizeText(record.shareTagId) || (shareMode === 'outbound' ? 't2' : 't1'),
    name: scopeName,
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
        phone: decryptSensitiveValue(contact.phone),
        wechat: decryptSensitiveValue(contact.wechat),
        company: contact.company || ''
      }))
    : []
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
    importedAt,
    lastAction: normalizeText(current.lastAction || (normalizeText(current.importedProjectId) ? 'taken_over' : 'opened'))
  }
}

function getShareViewLogs(record) {
  const rawRecord = record && typeof record === 'object' && !Array.isArray(record) ? record : {}
  const rawLogs = Array.isArray(rawRecord.viewLogs) ? rawRecord.viewLogs : []
  const logs = rawLogs
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
      importedAt: legacyImportedAt,
      lastAction: legacyImportedProjectId ? 'taken_over' : 'opened'
    })
  }

  return logs
}

function serializeShareViewLogs(viewLogs) {
  return (Array.isArray(viewLogs) ? viewLogs : [])
    .map(normalizeShareViewLog)
    .filter((item) => item.viewerOpenid || item.viewerName || item.firstOpenedAt || item.lastViewedAt)
    .sort((left, right) => {
      const leftTime = (left.importedAt || left.lastViewedAt || left.firstOpenedAt || new Date(0)).getTime()
      const rightTime = (right.importedAt || right.lastViewedAt || right.firstOpenedAt || new Date(0)).getTime()
      return rightTime - leftTime
    })
    .map((item) => ({
      viewerOpenid: item.viewerOpenid,
      viewerName: item.viewerName,
      firstOpenedAt: item.firstOpenedAt || null,
      lastViewedAt: item.lastViewedAt || item.firstOpenedAt || null,
      viewCount: Math.max(0, Number(item.viewCount || 0) || 0),
      importedProjectId: item.importedProjectId,
      importedAt: item.importedAt || null,
      lastAction: item.lastAction
    }))
}

function buildShareViewMeta(viewLogs) {
  const logs = (Array.isArray(viewLogs) ? viewLogs : [])
    .map(normalizeShareViewLog)
    .filter((item) => item.viewerOpenid || item.viewerName || item.firstOpenedAt || item.lastViewedAt)

  let firstOpenedAt = null
  let lastViewedAt = null
  let latestViewer = null
  let viewCount = 0

  logs.forEach((item) => {
    const firstTime = item.firstOpenedAt ? item.firstOpenedAt.getTime() : NaN
    const lastTime = (item.importedAt || item.lastViewedAt || item.firstOpenedAt)
      ? (item.importedAt || item.lastViewedAt || item.firstOpenedAt).getTime()
      : NaN

    viewCount += Math.max(0, Number(item.viewCount || 0) || 0)

    if (!Number.isNaN(firstTime) && (!firstOpenedAt || firstTime < firstOpenedAt.getTime())) {
      firstOpenedAt = item.firstOpenedAt
    }

    if (!Number.isNaN(lastTime) && (!lastViewedAt || lastTime > lastViewedAt.getTime())) {
      lastViewedAt = item.importedAt || item.lastViewedAt || item.firstOpenedAt
      latestViewer = item
    }
  })

  return {
    viewCount,
    viewerCount: logs.length,
    firstOpenedAt,
    lastViewedAt,
    latestViewerOpenid: latestViewer ? latestViewer.viewerOpenid : '',
    latestViewerName: latestViewer ? latestViewer.viewerName : '',
    latestImportedProjectId: latestViewer ? latestViewer.importedProjectId : '',
    latestImportedAt: latestViewer ? latestViewer.importedAt : null
  }
}

function upsertShareViewLog(viewLogs, payload = {}) {
  const viewerOpenid = normalizeText(payload.viewerOpenid)
  const viewerName = normalizeText(payload.viewerName)
  const viewedAt = parseDate(payload.viewedAt) || new Date()
  const importedProjectId = normalizeText(payload.importedProjectId)
  const importedAt = parseDate(payload.importedAt)
  const logs = getShareViewLogs({ viewLogs })
  const matchedIndex = logs.findIndex((item) => item.viewerOpenid && item.viewerOpenid === viewerOpenid)
  const existing = matchedIndex > -1 ? normalizeShareViewLog(logs[matchedIndex]) : null
  const nextLog = {
    viewerOpenid,
    viewerName: viewerName || (existing ? existing.viewerName : ''),
    firstOpenedAt: existing && existing.firstOpenedAt ? existing.firstOpenedAt : viewedAt,
    lastViewedAt: viewedAt,
    viewCount: Math.max(0, Number(existing && existing.viewCount ? existing.viewCount : 0) || 0) + 1,
    importedProjectId: importedProjectId || (existing ? existing.importedProjectId : ''),
    importedAt: importedAt || (existing ? existing.importedAt : null),
    lastAction: importedProjectId ? 'taken_over' : 'opened'
  }

  if (matchedIndex > -1) {
    logs.splice(matchedIndex, 1, nextLog)
  } else {
    logs.push(nextLog)
  }

  return {
    viewLogs: logs,
    isFirstViewer: matchedIndex === -1
  }
}

function getUpdateCount(result) {
  if (result && result.stats && Number.isFinite(Number(result.stats.updated))) {
    return Number(result.stats.updated)
  }
  if (result && Number.isFinite(Number(result.updated))) {
    return Number(result.updated)
  }
  return 0
}

function buildClaimToken(receiverOpenid, now = new Date()) {
  const randomPart = crypto.randomBytes(8).toString('hex')
  return `${normalizeText(receiverOpenid) || 'anonymous'}:${now.getTime()}:${randomPart}`
}

function resolveClaimReceiverName(record, viewMeta, fallbackName = '') {
  return normalizeText(record && record.receiverName)
    || normalizeText(viewMeta && viewMeta.latestViewerName)
    || normalizeText(fallbackName)
    || '其他接手方'
}

function buildShareClaimBlockedResult(record, receiverOpenid, fallbackName = '') {
  const currentRecord = record && typeof record === 'object' && !Array.isArray(record) ? record : {}
  const viewMeta = buildShareViewMeta(getShareViewLogs(currentRecord))
  const receiverName = resolveClaimReceiverName(currentRecord, viewMeta, fallbackName)
  return {
    ok: false,
    blocked: true,
    blockedReason: 'already_taken_over',
    blockedReceiverName: receiverName,
    blockedMessage: `${receiverName} 已接手这个项目`,
    importedProjectId: normalizeText(currentRecord.importedProjectId) || normalizeText(viewMeta.latestImportedProjectId),
    receiverOpenid: normalizeText(currentRecord.receiverOpenid) || normalizeText(viewMeta.latestViewerOpenid) || normalizeText(receiverOpenid)
  }
}

function buildShareClaimInProgressResult(record, receiverOpenid, fallbackName = '') {
  const currentRecord = record && typeof record === 'object' && !Array.isArray(record) ? record : {}
  const viewMeta = buildShareViewMeta(getShareViewLogs(currentRecord))
  const receiverName = resolveClaimReceiverName(currentRecord, viewMeta, fallbackName)
  return {
    ok: false,
    blocked: true,
    blockedReason: 'takeover_in_progress',
    blockedReceiverName: receiverName,
    blockedMessage: `${receiverName} 正在接手这个项目，请稍后刷新`,
    importedProjectId: normalizeText(currentRecord.importedProjectId) || normalizeText(viewMeta.latestImportedProjectId),
    receiverOpenid: normalizeText(currentRecord.receiverOpenid) || normalizeText(viewMeta.latestViewerOpenid) || normalizeText(receiverOpenid)
  }
}

function isShareClaimStale(record, now = new Date()) {
  const claimStartedAt = parseDate(record && record.claimStartedAt)
  if (!claimStartedAt) {
    return false
  }

  return now.getTime() - claimStartedAt.getTime() > OUTBOUND_CLAIM_STALE_MS
}

async function loadShareRecord(shareRecordId) {
  const result = await db.collection('shareRecords').doc(shareRecordId).get()
  return result && result.data ? result.data : null
}

async function tryClaimOutboundShareRecord(options = {}) {
  const shareRecordId = normalizeText(options.shareRecordId)
  const shareRecord = options.shareRecord || {}
  const receiverOpenid = normalizeText(options.receiverOpenid)
  const receiverAccountId = normalizeText(options.receiverAccountId)
  const receiverName = normalizeText(options.receiverName) || '微信用户'
  const now = options.now instanceof Date ? options.now : new Date()
  const existingViewLogs = Array.isArray(options.existingViewLogs) ? options.existingViewLogs : getShareViewLogs(shareRecord)
  const existingViewMeta = buildShareViewMeta(existingViewLogs)
  const currentClaimStatus = normalizeText(shareRecord.claimStatus)
  const currentReceiverOpenid = normalizeText(shareRecord.receiverOpenid) || normalizeText(existingViewMeta.latestViewerOpenid)
  const currentImportedProjectId = normalizeText(shareRecord.importedProjectId) || normalizeText(existingViewMeta.latestImportedProjectId)

  if (!shareRecordId || !receiverOpenid) {
    return {
      ok: false,
      blocked: false,
      message: 'claim context is required'
    }
  }

  if (currentImportedProjectId || currentClaimStatus === 'claimed') {
    if (currentReceiverOpenid && currentReceiverOpenid !== receiverOpenid) {
      return buildShareClaimBlockedResult(shareRecord, receiverOpenid)
    }
    return {
      ok: true,
      alreadyClaimedByCurrentReceiver: true,
      claimToken: normalizeText(shareRecord.claimToken),
      viewLogs: existingViewLogs,
      viewMeta: existingViewMeta
    }
  }

  if (currentClaimStatus === 'claiming') {
    if (!isShareClaimStale(shareRecord, now)) {
      return buildShareClaimInProgressResult(shareRecord, receiverOpenid, receiverName)
    }
  }

  const shouldReplaceClaimReceiver = currentClaimStatus === 'claiming' && isShareClaimStale(shareRecord, now)
  const claimToken = buildClaimToken(receiverOpenid, now)
  const viewUpdate = upsertShareViewLog(existingViewLogs, {
    viewerOpenid: receiverOpenid,
    viewerName: receiverName,
    viewedAt: now
  })
  const nextViewMeta = buildShareViewMeta(viewUpdate.viewLogs)
  const claimData = {
    claimStatus: 'claiming',
    claimToken,
    claimStartedAt: now,
    receiverOpenid: shouldReplaceClaimReceiver ? receiverOpenid : (shareRecord.receiverOpenid || receiverOpenid),
    recipientAccountId: shouldReplaceClaimReceiver ? receiverAccountId : (shareRecord.recipientAccountId || receiverAccountId),
    receiverName: shouldReplaceClaimReceiver ? receiverName : (shareRecord.receiverName || receiverName),
    receiverLockedAt: shouldReplaceClaimReceiver ? now : (shareRecord.receiverLockedAt || now),
    firstOpenedAt: nextViewMeta.firstOpenedAt || shareRecord.firstOpenedAt || now,
    lastViewedAt: nextViewMeta.lastViewedAt || now,
    viewCount: nextViewMeta.viewCount,
    viewerCount: nextViewMeta.viewerCount,
    viewLogs: serializeShareViewLogs(viewUpdate.viewLogs),
    updatedAt: now
  }

  const query = currentClaimStatus === 'claiming'
    ? {
        _id: shareRecordId,
        claimStatus: 'claiming',
        claimStartedAt: _.lte(new Date(now.getTime() - OUTBOUND_CLAIM_STALE_MS)),
        importedProjectId: _.in(['', null])
      }
    : {
        _id: shareRecordId,
        claimStatus: _.nin(['claiming', 'claimed']),
        importedProjectId: _.in(['', null])
      }

  const claimResult = await db.collection('shareRecords').where(query).update({
    data: claimData
  })

  if (getUpdateCount(claimResult) > 0) {
    return {
      ok: true,
      claimToken,
      viewLogs: viewUpdate.viewLogs,
      viewMeta: nextViewMeta
    }
  }

  const latestRecord = await loadShareRecord(shareRecordId)
  const latestReceiverOpenid = normalizeText(latestRecord && latestRecord.receiverOpenid)
  const latestClaimStatus = normalizeText(latestRecord && latestRecord.claimStatus)
  const latestImportedProjectId = normalizeText(latestRecord && latestRecord.importedProjectId)

  if (latestRecord && latestReceiverOpenid === receiverOpenid && (latestClaimStatus === 'claimed' || latestImportedProjectId)) {
    return {
      ok: true,
      alreadyClaimedByCurrentReceiver: latestClaimStatus === 'claimed' || !!latestImportedProjectId,
      claimToken: normalizeText(latestRecord.claimToken),
      viewLogs: getShareViewLogs(latestRecord),
      viewMeta: buildShareViewMeta(getShareViewLogs(latestRecord))
    }
  }

  if (latestRecord && latestReceiverOpenid === receiverOpenid && latestClaimStatus === 'claiming') {
    return buildShareClaimInProgressResult(latestRecord, receiverOpenid, receiverName)
  }

  return buildShareClaimBlockedResult(latestRecord || shareRecord, receiverOpenid)
}

async function finalizeOutboundShareClaim(options = {}) {
  const shareRecordId = normalizeText(options.shareRecordId)
  const claimToken = normalizeText(options.claimToken)
  const shareRecord = options.shareRecord || {}
  const receiverOpenid = normalizeText(options.receiverOpenid)
  const receiverAccountId = normalizeText(options.receiverAccountId)
  const receiverName = normalizeText(options.receiverName) || '微信用户'
  const importedProjectId = normalizeText(options.importedProjectId)
  const now = options.now instanceof Date ? options.now : new Date()
  const importedAt = options.importedAt instanceof Date ? options.importedAt : now
  const viewUpdate = upsertShareViewLog(options.viewLogs || getShareViewLogs(shareRecord), {
    viewerOpenid: receiverOpenid,
    viewerName: receiverName,
    viewedAt: now,
    importedProjectId,
    importedAt
  })
  const nextViewMeta = buildShareViewMeta(viewUpdate.viewLogs)
  const data = {
    claimStatus: 'claimed',
    claimCompletedAt: now,
    receiverOpenid: shareRecord.receiverOpenid || receiverOpenid,
    recipientAccountId: shareRecord.recipientAccountId || receiverAccountId,
    receiverName: shareRecord.receiverName || receiverName,
    receiverLockedAt: shareRecord.receiverLockedAt || importedAt,
    firstOpenedAt: nextViewMeta.firstOpenedAt || shareRecord.firstOpenedAt || now,
    lastViewedAt: nextViewMeta.lastViewedAt || now,
    importedProjectId,
    importedAt,
    viewCount: nextViewMeta.viewCount,
    viewerCount: nextViewMeta.viewerCount,
    viewLogs: serializeShareViewLogs(viewUpdate.viewLogs),
    updatedAt: now
  }

  if (claimToken) {
    const result = await db.collection('shareRecords').where({
      _id: shareRecordId,
      claimToken
    }).update({
      data
    })
    return getUpdateCount(result) > 0
  }

  await db.collection('shareRecords').doc(shareRecordId).update({
    data
  })
  return true
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
    title = `${method}跟进`
  } else if (typeKey === 'shared_sync') {
    title = `${method}同步`
  } else {
    title = `${method}跟进`
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
    summaryLabel: typeKey === 'task_done' ? '完成结果' : (typeKey === 'collaborator_follow' ? '整理摘要' : '整理摘要'),
    highlightsLabel: typeKey === 'task_done' ? '补充说明' : '关键进展',
    rawLabel: typeKey === 'task_done' ? '任务原文' : '原始录入',
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

function buildImportedProjectPayload(sourceProject, shareRecord, ownerName, ownerAccountId, receiverOpenid, receiverName, receiverAccountId, now) {
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
    contacts: Array.isArray(sourceProject.contacts)
      ? sourceProject.contacts.map((contact, index) => ({
          ...clone(contact),
          contactId: normalizeText(contact && (contact.contactId || contact.id)) || `contact-${Date.now()}-${index}`,
          phone: encryptSensitiveValue(contact && contact.phone),
          wechat: encryptSensitiveValue(contact && contact.wechat)
        }))
      : [],
    tags: Array.isArray(sourceProject.tags) ? clone(sourceProject.tags) : [],
    accountId: receiverAccountId || normalizeText(sourceProject.accountId),
    ownerAccountId: receiverAccountId || normalizeText(sourceProject.ownerAccountId) || normalizeText(sourceProject.accountId),
    sharedFromAccountId: ownerAccountId || normalizeText(sourceProject.ownerAccountId) || normalizeText(sourceProject.accountId),
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

function buildDefaultSeedProjectName(sourceProject) {
  const clientName = normalizeText(sourceProject && sourceProject.clientName)
  return clientName ? `${clientName} · 新需求` : '新需求项目'
}

function isCloneSeedRecord(shareRecord) {
  return normalizeText(shareRecord && shareRecord.flowMode) === 'clone_seed'
}

function buildSeedProjectPayload(sourceProject, shareRecord, ownerName, ownerAccountId, receiverOpenid, receiverName, receiverAccountId, now) {
  const sourceName = normalizeText(sourceProject.projectName) || '未命名项目'
  const seedProjectName = normalizeText(shareRecord.seedProjectName || shareRecord.projectName) || buildDefaultSeedProjectName(sourceProject)

  return {
    projectName: seedProjectName,
    clientName: normalizeText(sourceProject.clientName) || '未填写客户',
    stage: '线索',
    estimatedAmount: 0,
    actualAmount: 0,
    expectedCommission: 0,
    description: '',
    nextFollowUpDate: '',
    status: '进行中',
    isClosed: false,
    contacts: Array.isArray(sourceProject.contacts)
      ? sourceProject.contacts.map((contact, index) => ({
          ...clone(contact),
          contactId: normalizeText(contact && (contact.contactId || contact.id)) || `contact-${Date.now()}-${index}`,
          phone: encryptSensitiveValue(contact && contact.phone),
          wechat: encryptSensitiveValue(contact && contact.wechat)
        }))
      : [],
    tags: [],
    accountId: receiverAccountId || normalizeText(sourceProject.accountId),
    ownerAccountId: receiverAccountId || normalizeText(sourceProject.ownerAccountId) || normalizeText(sourceProject.accountId),
    sharedFromAccountId: ownerAccountId || normalizeText(sourceProject.ownerAccountId) || normalizeText(sourceProject.accountId),
    isSharedProject: true,
    sourceProjectId: sourceProject._id,
    sourceProjectName: sourceName,
    sourceFlowMode: 'clone_seed',
    sourceFlowIntent: 'new_transfer',
    sourceFlowCreatedAt: now,
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

function buildImportedFollowUpPayload(
  followUp,
  receiverOpenid,
  receiverAccountId,
  importedProjectId,
  importedProjectOwnerAccountId,
  sourceOwnerOpenid,
  sourceOwnerAccountId,
  ownerName,
  now,
  historyScope
) {
  const scope = normalizeHistoryScope(historyScope)
  const basePayload = {
    _openid: receiverOpenid,
    accountId: receiverAccountId || normalizeText(followUp.accountId),
    projectId: importedProjectId,
    projectAccountId: importedProjectOwnerAccountId || sourceOwnerAccountId || normalizeText(followUp.projectAccountId),
    sourceFollowUpId: followUp._id,
    sharedFromOpenid: sourceOwnerOpenid,
    sharedFromAccountId: sourceOwnerAccountId || normalizeText(followUp.accountId),
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

async function syncImportedFollowUps(
  receiverOpenid,
  receiverAccountId,
  importedProjectId,
  importedProjectOwnerAccountId,
  sourceProjectId,
  sourceOwnerOpenid,
  sourceOwnerAccountId,
  ownerName,
  historyScope
) {
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
      data: buildImportedFollowUpPayload(
        followUp,
        receiverOpenid,
        receiverAccountId,
        importedProjectId,
        importedProjectOwnerAccountId,
        sourceOwnerOpenid,
        sourceOwnerAccountId,
        ownerName,
        now,
        scope
      )
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
  const ownerAccountId = await resolveAccountIdByOpenid(ownerOpenid)
  const receiverAccountId = await resolveAccountIdByOpenid(receiverOpenid)
  const now = new Date()
  let attributionResult = null

  if (receiverOpenid && receiverOpenid !== ownerOpenid) {
    attributionResult = await ensureShareAttributionRelation({
      referrerAccountId: ownerAccountId,
      referrerOpenid: ownerOpenid,
      inviteeAccountId: receiverAccountId,
      inviteeOpenid: receiverOpenid,
      shareRecord,
      now
    })
  }

  const ownerUserResult = await db.collection('users').where({
    _openid: ownerOpenid
  }).limit(1).get()
  const ownerUser = ownerUserResult.data[0] || {}
  const ownerName = resolveUserDisplayName(ownerUser, ownerAccountId, '分享方')
  const receiverUserResult = await db.collection('users').where({
    _openid: receiverOpenid
  }).limit(1).get()
  const receiverUser = receiverUserResult.data[0] || {}
  const receiverName = resolveUserDisplayName(receiverUser, receiverAccountId, '微信用户')
  const shareTag = resolveShareTag(shareRecord, ownerUser)
  const historyScope = normalizeHistoryScope(shareRecord.historyScope, shareRecord.shareMode)
  const existingViewLogs = getShareViewLogs(shareRecord)
  const existingViewMeta = buildShareViewMeta(existingViewLogs)
  const lockedReceiverOpenid = normalizeText(shareRecord.receiverOpenid) || existingViewMeta.latestViewerOpenid
  const lockedReceiverName = normalizeText(shareRecord.receiverName) || existingViewMeta.latestViewerName

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
  let blocked = false
  let blockedReason = ''
  let blockedMessage = ''
  let blockedReceiverName = ''

  if (shareRecord.shareMode === 'outbound' && receiverOpenid && receiverOpenid !== ownerOpenid) {
    const isCloneSeed = isCloneSeedRecord(shareRecord)
    const sourceOutboundShareRecordId = normalizeText(sourceProject.outboundShareRecordId)
    const handedOverToOpenid = normalizeText(sourceProject.handoverToOpenid)
    const projectLockedByAnotherRecord = !isCloneSeed
      && sourceProject.handoverStatus === 'handed_over'
      && sourceOutboundShareRecordId
      && sourceOutboundShareRecordId !== shareRecord._id

    const projectLockedByAnotherReceiver = !isCloneSeed
      && sourceProject.handoverStatus === 'handed_over'
      && sourceOutboundShareRecordId === shareRecord._id
      && handedOverToOpenid
      && handedOverToOpenid !== receiverOpenid
    const staleClaimCanBeReclaimed = normalizeText(shareRecord.claimStatus) === 'claiming'
      && isShareClaimStale(shareRecord, now)

    if (projectLockedByAnotherRecord || projectLockedByAnotherReceiver) {
      blocked = true
      blockedReason = 'project_already_handed_over'
      blockedReceiverName = normalizeText(sourceProject.handoverToName) || lockedReceiverName || '其他接手方'
      blockedMessage = `${blockedReceiverName} 已接手这个项目`
      importedProjectId = normalizeText(shareRecord.importedProjectId)
    } else if (!staleClaimCanBeReclaimed && lockedReceiverOpenid && lockedReceiverOpenid !== receiverOpenid) {
      blocked = true
      blockedReason = 'already_taken_over'
      blockedReceiverName = lockedReceiverName || '其他接手方'
      blockedMessage = `${blockedReceiverName} 已接手这个项目`
      importedProjectId = normalizeText(shareRecord.importedProjectId)
    } else {
      const claimResult = await tryClaimOutboundShareRecord({
        shareRecordId,
        shareRecord,
        receiverOpenid,
        receiverAccountId,
        receiverName,
        existingViewLogs,
        now
      })

      if (!claimResult.ok && claimResult.blocked) {
        blocked = true
        blockedReason = claimResult.blockedReason
        blockedReceiverName = claimResult.blockedReceiverName
        blockedMessage = claimResult.blockedMessage
        importedProjectId = claimResult.importedProjectId
      } else if (!claimResult.ok) {
        return {
          ok: false,
          message: claimResult.message || '项目接手失败，请稍后重试'
        }
      } else {
      const claimViewLogs = Array.isArray(claimResult.viewLogs) ? claimResult.viewLogs : existingViewLogs
      const existingProjectResult = await db.collection('projects').where(isCloneSeed
        ? {
            _openid: receiverOpenid,
            sourceShareRecordId: shareRecord._id,
            sharedFromOpenid: ownerOpenid
          }
        : {
            _openid: receiverOpenid,
            sourceProjectId: sourceProject._id,
            sharedFromOpenid: ownerOpenid
          }).limit(1).get()

      const importPayload = isCloneSeed
        ? buildSeedProjectPayload(
            sourceProject,
            shareRecord,
            ownerName,
            ownerAccountId,
            receiverOpenid,
            receiverName,
            receiverAccountId,
            now
          )
        : buildImportedProjectPayload(
            sourceProject,
            shareRecord,
            ownerName,
            ownerAccountId,
            receiverOpenid,
            receiverName,
            receiverAccountId,
            now
          )
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

      if (!isCloneSeed) {
        await syncImportedFollowUps(
          receiverOpenid,
          receiverAccountId,
          importedProjectId,
          receiverAccountId,
          sourceProject._id,
          ownerOpenid,
          ownerAccountId,
          ownerName,
          historyScope
        )

        await db.collection('projects').doc(sourceProject._id).update({
          data: {
            ownerAccountId: receiverAccountId || normalizeText(sourceProject.ownerAccountId) || normalizeText(sourceProject.accountId),
            handoverStatus: 'handed_over',
            handoverToOpenid: receiverOpenid,
            handoverToAccountId: receiverAccountId,
            handoverToName: receiverName,
            handedOverAt: shareRecord.importedAt || now,
            outboundShareRecordId: shareRecord._id,
            updatedAt: now
          }
        })
      }

      const importedProjectResult = await db.collection('projects').doc(importedProjectId).get()
      const importedFollowResult = isCloneSeed
        ? { data: [] }
        : await db.collection('followUps').where({
            _openid: receiverOpenid,
            projectId: importedProjectId
          }).orderBy('followUpTime', 'desc').get()

      effectiveProject = importedProjectResult.data
      effectiveFollowUps = importedFollowResult.data
      imported = true

      const nextImportedAt = shareRecord.importedAt || now
      await finalizeOutboundShareClaim({
        shareRecordId,
        claimToken: claimResult.claimToken,
        shareRecord,
        receiverOpenid,
        receiverAccountId,
        receiverName,
        importedProjectId,
        importedAt: nextImportedAt,
        viewLogs: claimViewLogs,
        now
      })

      if (isFirstImport) {
        await Promise.all([
          ensureNotification(receiverOpenid, {
            type: 'project_taken_over',
            level: 'normal',
            title: isCloneSeed ? '你已收到新项目' : '你已接手项目',
            summary: `${buildProjectDetail(effectiveProject).name} 已进入“我的项目”，后续由你继续推进。`,
            projectId: importedProjectId,
            projectName: buildProjectDetail(effectiveProject).name,
            shareRecordId,
            sourceOpenid: ownerOpenid,
            sourceName: ownerName,
            actionUrl: `/pages/project-detail/project-detail?projectId=${importedProjectId}&view=projects`,
            actionLabel: '查看项目',
            bizDate: formatBizDate(now),
            dedupeKey: `project_taken_over_${importedProjectId}`,
            extra: {
              importedProjectId,
              sourceProjectId: sourceProject._id,
              flowMode: isCloneSeed ? 'clone_seed' : 'transfer_original'
            },
            createdAt: now
          }),
          ensureNotification(ownerOpenid, {
            type: 'shared_imported',
            level: 'normal',
            title: isCloneSeed ? '对方已接收新建转交' : '对方已接手项目',
            summary: `${receiverName} 已接收 ${buildProjectDetail(effectiveProject).name}，后续将由对方独立推进。`,
            projectId: sourceProject._id,
            projectName: buildProjectDetail(sourceProject).name,
            shareRecordId,
            sourceOpenid: receiverOpenid,
            sourceName: receiverName,
            actionUrl: `/pages/project-detail/project-detail?projectId=${sourceProject._id}&view=shared-out`,
            actionLabel: '进入外发项目',
            bizDate: formatBizDate(now),
            dedupeKey: `shared_imported_${shareRecordId}`,
            extra: {
              importedProjectId,
              receiverOpenid,
              flowMode: isCloneSeed ? 'clone_seed' : 'transfer_original'
            },
            createdAt: now
          })
        ])
      }
      }
    }
  } else if (receiverOpenid && receiverOpenid !== ownerOpenid) {
    const viewUpdate = upsertShareViewLog(existingViewLogs, {
      viewerOpenid: receiverOpenid,
      viewerName: receiverName,
      viewedAt: now
    })
    const nextViewMeta = buildShareViewMeta(viewUpdate.viewLogs)

    await db.collection('shareRecords').doc(shareRecordId).update({
      data: {
        receiverOpenid: nextViewMeta.latestViewerOpenid || receiverOpenid,
        recipientAccountId: shareRecord.recipientAccountId || receiverAccountId,
        receiverName: nextViewMeta.latestViewerName || receiverName,
        firstOpenedAt: nextViewMeta.firstOpenedAt || shareRecord.firstOpenedAt || now,
        lastViewedAt: nextViewMeta.lastViewedAt || now,
        viewCount: nextViewMeta.viewCount,
        viewerCount: nextViewMeta.viewerCount,
        viewLogs: serializeShareViewLogs(viewUpdate.viewLogs),
        updatedAt: now,
      }
    })

    if (viewUpdate.isFirstViewer) {
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
        dedupeKey: `shared_opened_${shareRecordId}_${receiverOpenid}`,
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
    isShareOwner: receiverOpenid === ownerOpenid,
    imported,
    importedProjectId,
    shareMode: shareRecord.shareMode || 'info',
    flowMode: normalizeText(shareRecord.flowMode),
    seedProjectName: normalizeText(shareRecord.seedProjectName),
    historyScope,
    blocked,
    blockedReason,
    blockedMessage,
    blockedReceiverName,
    attributionResult,
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
