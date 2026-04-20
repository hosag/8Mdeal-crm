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

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const recordsResult = await db.collection('shareRecords').where({
    _openid: wxContext.OPENID,
    shareMode: 'outbound'
  }).orderBy('updatedAt', 'desc').get()

  const records = recordsResult.data || []
  if (!records.length) {
    return {
      ok: true,
      records: []
    }
  }

  const projectIds = Array.from(new Set(records.map((item) => item.projectId).filter(Boolean)))
  const importedProjectIds = Array.from(new Set(records.map((item) => item.importedProjectId).filter(Boolean)))
  const projectsResult = projectIds.length
    ? await db.collection('projects').where({
      _openid: wxContext.OPENID,
      _id: _.in(projectIds)
    }).get()
    : { data: [] }
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

  const projectMap = {}
  projectsResult.data.forEach((item) => {
    projectMap[item._id] = item
  })

  return {
    ok: true,
    records: records.map((item) => {
      const project = projectMap[item.projectId] || {}
      const stage = project.stage || item.projectStage || '线索'
      const collaboratorFollow = collaboratorFollowCountMap[item.importedProjectId] || { count: 0, latestAt: '' }
      return {
        id: item._id,
        projectId: item.projectId,
        importedProjectId: item.importedProjectId || '',
        name: project.projectName || item.projectName || '未命名项目',
        partner: item.shareTagName || '未命名标签',
        mode: item.shareModeTitle || '分享信息',
        viewed: formatViewLabel(item.viewCount),
        viewCount: Number(item.viewCount || 0),
        receiverName: item.receiverName || '',
        receiverOpenidMasked: maskOpenid(item.receiverOpenid),
        createdAt: formatDateTime(item.createdAt),
        createdAtRaw: item.createdAt ? new Date(item.createdAt).toISOString() : '',
        updatedAtRaw: item.updatedAt ? new Date(item.updatedAt).toISOString() : '',
        firstOpenedAt: item.firstOpenedAt ? formatDateTime(item.firstOpenedAt) : '',
        firstOpenedAtRaw: item.firstOpenedAt ? new Date(item.firstOpenedAt).toISOString() : '',
        lastViewedAt: item.lastViewedAt ? formatDateTime(item.lastViewedAt) : '',
        importedAt: item.importedAt ? formatDateTime(item.importedAt) : '',
        importedAtRaw: item.importedAt ? new Date(item.importedAt).toISOString() : '',
        statusText: collaboratorFollow.count > 0 ? '已跟进' : (item.importedProjectId ? '已导入' : (item.firstOpenedAt ? '已打开' : '未打开')),
        collaboratorFollowCount: collaboratorFollow.count,
        collaboratorLatestFollowAt: collaboratorFollow.latestAt,
        status: normalizeStatus(stage),
        stage
      }
    })
  }
}
