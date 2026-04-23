const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function formatViewLabel(count) {
  return `预览 ${Number(count || 0)} 次`
}

function normalizeStatus(stage) {
  if (stage === '成交') {
    return '已成交'
  }

  if (stage === '流失') {
    return '已流失'
  }

  return '进行中'
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

function pickEffectiveOutboundRecord(records = [], project = {}) {
  const list = Array.isArray(records) ? records.slice() : []
  if (!list.length) {
    return null
  }

  const targetRecordId = normalizeText(project && project.outboundShareRecordId)
  if (targetRecordId) {
    const matched = list.find((item) => item && item._id === targetRecordId)
    if (matched) {
      return matched
    }
  }

  const importedMatched = list.find((item) => normalizeText(item && item.importedProjectId))
  if (importedMatched) {
    return importedMatched
  }

  return list.sort((left, right) => {
    const leftUpdated = new Date(left && (left.updatedAt || left.createdAt || 0)).getTime()
    const rightUpdated = new Date(right && (right.updatedAt || right.createdAt || 0)).getTime()
    return rightUpdated - leftUpdated
  })[0]
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const recordsResult = await db.collection('shareRecords').where({
    _openid: wxContext.OPENID,
    shareMode: 'outbound'
  }).orderBy('updatedAt', 'desc').get()

  const allRecords = recordsResult.data || []
  if (!allRecords.length) {
    return {
      ok: true,
      records: []
    }
  }

  const projectIds = Array.from(new Set(allRecords.map((item) => item.projectId).filter(Boolean)))
  const projectsResult = projectIds.length
    ? await db.collection('projects').where({
      _openid: wxContext.OPENID,
      _id: _.in(projectIds)
    }).get()
    : { data: [] }

  const projectMap = {}
  projectsResult.data.forEach((item) => {
    projectMap[item._id] = item
  })

  const groupedRecords = {}
  allRecords.forEach((item) => {
    const projectId = String(item && item.projectId ? item.projectId : '').trim()
    if (!projectId) {
      return
    }

    if (!groupedRecords[projectId]) {
      groupedRecords[projectId] = []
    }

    groupedRecords[projectId].push(item)
  })

  const records = Object.keys(groupedRecords)
    .map((projectId) => pickEffectiveOutboundRecord(groupedRecords[projectId], projectMap[projectId] || {}))
    .filter(Boolean)
    .sort((left, right) => {
      const leftUpdated = new Date(left && (left.updatedAt || left.createdAt || 0)).getTime()
      const rightUpdated = new Date(right && (right.updatedAt || right.createdAt || 0)).getTime()
      return rightUpdated - leftUpdated
    })

  const importedProjectIds = Array.from(new Set(records.map((item) => item.importedProjectId).filter(Boolean)))
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

  return {
    ok: true,
    records: records.map((item) => {
      const project = projectMap[item.projectId] || {}
      const stage = project.stage || item.projectStage || '线索'
      const collaboratorFollow = collaboratorFollowCountMap[item.importedProjectId] || { count: 0, latestAt: '' }
      const shareViewMeta = buildShareViewMeta(item)
      const receiverName = shareViewMeta.latestViewerName || normalizeText(item.receiverName) || '待接手方'
      const receiverOpenidMasked = maskOpenid(shareViewMeta.latestViewerOpenid || item.receiverOpenid)
      const firstOpenedAt = shareViewMeta.firstOpenedAt || parseDate(item.firstOpenedAt)
      const lastViewedAt = shareViewMeta.lastViewedAt || parseDate(item.lastViewedAt)
      const statusText = collaboratorFollow.count > 0
        ? '已跟进'
        : (item.importedProjectId
          ? '已导入'
          : ((firstOpenedAt || shareViewMeta.totalViewCount > 0) ? '已打开' : '未打开'))

      return {
        id: item._id,
        projectId: item.projectId,
        importedProjectId: item.importedProjectId || '',
        name: project.projectName || item.projectName || '未命名项目',
        partner: item.shareTagName || '未命名标签',
        mode: '项目外发',
        viewed: formatViewLabel(shareViewMeta.totalViewCount),
        viewCount: shareViewMeta.totalViewCount,
        viewerCount: shareViewMeta.viewerCount,
        receiverName,
        receiverOpenidMasked,
        createdAt: formatDateTime(item.createdAt),
        createdAtRaw: item.createdAt ? new Date(item.createdAt).toISOString() : '',
        updatedAtRaw: item.updatedAt ? new Date(item.updatedAt).toISOString() : '',
        firstOpenedAt: firstOpenedAt ? formatDateTime(firstOpenedAt) : '',
        firstOpenedAtRaw: firstOpenedAt ? firstOpenedAt.toISOString() : '',
        lastViewedAt: lastViewedAt ? formatDateTime(lastViewedAt) : '',
        importedAt: item.importedAt ? formatDateTime(item.importedAt) : '',
        importedAtRaw: item.importedAt ? new Date(item.importedAt).toISOString() : '',
        statusText,
        collaboratorFollowCount: collaboratorFollow.count,
        collaboratorLatestFollowAt: collaboratorFollow.latestAt,
        status: normalizeStatus(stage),
        stage
      }
    })
  }
}
