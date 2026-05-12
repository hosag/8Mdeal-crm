const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function normalizeNumber(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

function normalizeText(value) {
  return String(value || '').trim()
}

async function closeOpenProjectTasks(openid, projectId, stage, now) {
  const currentStage = normalizeText(stage)
  if (currentStage !== '成交' && currentStage !== '流失') {
    return
  }

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
    const closableTypes = ['task_due', 'task_overdue', 'task_upcoming', 'todo_due', 'todo_overdue', 'todo_upcoming', 'project_silent']
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
    // Notification cleanup is best-effort and should not block deal saving.
  }
}

function normalizeRecordList(value) {
  const list = Array.isArray(value) ? value : []
  return list.map((item, index) => {
    const record = item && typeof item === 'object' ? item : {}
    return {
      id: normalizeText(record.id) || `record-${Date.now()}-${index}`,
      paymentAmount: normalizeNumber(record.paymentAmount),
      commissionAmount: normalizeNumber(record.commissionAmount),
      date: normalizeText(record.date) || new Date().toISOString().slice(0, 10),
      note: normalizeText(record.note)
    }
  }).filter((item) => item.paymentAmount > 0 || item.commissionAmount > 0)
}

function getPaymentStatus(paidAmount, actualAmount) {
  if (paidAmount <= 0) {
    return '未回款'
  }
  if (actualAmount > 0 && paidAmount >= actualAmount) {
    return '全部回款'
  }
  return '部分回款'
}

function getCommissionStatus(settledCommission, expectedCommission) {
  if (settledCommission <= 0) {
    return '待兑现'
  }
  if (expectedCommission > 0 && settledCommission >= expectedCommission) {
    return '已兑现'
  }
  return '部分兑现'
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
  const revenueRecords = normalizeRecordList(event.revenueRecords)
  const paidAmount = revenueRecords.reduce((sum, item) => sum + item.paymentAmount, 0)
  const settledCommission = revenueRecords.reduce((sum, item) => sum + item.commissionAmount, 0)
  const contractDate = normalizeText(event.contractDate) || new Date().toISOString().slice(0, 10)
  const paymentStatus = getPaymentStatus(paidAmount, actualAmount)
  const latestPaymentDate = revenueRecords.filter((item) => item.paymentAmount > 0).map((item) => item.date).sort().pop() || ''
  const commissionStatus = getCommissionStatus(settledCommission, expectedCommission)
  const commissionSettledDate = revenueRecords.filter((item) => item.commissionAmount > 0).map((item) => item.date).sort().pop() || ''
  const note = normalizeText(event.note)

  if (!contractDate) {
    return {
      ok: false,
      message: 'contractDate is required'
    }
  }

  const now = new Date()
  const project = projectResult.data[0]
  const payload = {
    projectId,
    actualAmount,
    contractDate,
    paymentStatus,
    paidAmount,
    latestPaymentDate,
    expectedCommission,
    commissionStatus,
    settledCommission,
    commissionSettledDate,
    revenueRecords,
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
      paymentStatus,
      paidAmount,
      commissionStatus,
      settledCommission,
      revenueRecords,
      updatedAt: now
    }
  })
  await closeOpenProjectTasks(wxContext.OPENID, projectId, '成交', now)

  return {
    ok: true,
    dealId,
    projectId
  }
}
