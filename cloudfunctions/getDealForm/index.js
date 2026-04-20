const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
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

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const projectId = normalizeText(event.projectId)

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
  const dealResult = await db.collection('deals').where({
    _openid: wxContext.OPENID,
    projectId
  }).limit(1).get()
  const deal = dealResult.data[0] || {}
  const hasExistingDeal = !!dealResult.data.length
  const alreadyClosed = !!project.isClosed || project.stage === '成交' || Number(project.actualAmount || 0) > 0

  return {
    ok: true,
    existingDeal: hasExistingDeal || alreadyClosed,
    form: {
      projectId,
      projectName: project.projectName || '未命名项目',
      actualAmount: deal.actualAmount || project.actualAmount || '',
      contractDate: deal.contractDate || formatDateOnly(new Date()),
      paymentStatus: deal.paymentStatus || '未回款',
      expectedCommission: deal.expectedCommission || project.expectedCommission || '',
      note: deal.note || ''
    }
  }
}
