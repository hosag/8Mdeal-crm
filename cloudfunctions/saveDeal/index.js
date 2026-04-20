const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function normalizeNumber(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

function normalizeText(value) {
  return String(value || '').trim()
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

  const actualAmount = normalizeNumber(event.actualAmount)
  const expectedCommission = normalizeNumber(event.expectedCommission)
  const contractDate = normalizeText(event.contractDate)
  const paymentStatus = normalizeText(event.paymentStatus) || '未回款'
  const note = normalizeText(event.note)

  if (!actualAmount || !contractDate) {
    return {
      ok: false,
      message: 'actualAmount and contractDate are required'
    }
  }

  const now = new Date()
  const project = projectResult.data[0]
  const payload = {
    projectId,
    actualAmount,
    contractDate,
    paymentStatus,
    expectedCommission,
    note,
    projectNameSnapshot: project.projectName || '',
    updatedAt: now
  }

  const existingResult = await db.collection('deals').where({
    _openid: wxContext.OPENID,
    projectId
  }).limit(1).get()

  let dealId = ''

  if (existingResult.data.length) {
    dealId = existingResult.data[0]._id
    await db.collection('deals').doc(dealId).update({
      data: payload
    })
  } else {
    const addResult = await db.collection('deals').add({
      data: {
        _openid: wxContext.OPENID,
        createdAt: now,
        ...payload
      }
    })
    dealId = addResult._id
  }

  await db.collection('projects').doc(projectId).update({
    data: {
      stage: '成交',
      isClosed: true,
      actualAmount,
      expectedCommission,
      updatedAt: now
    }
  })

  return {
    ok: true,
    dealId,
    projectId
  }
}
