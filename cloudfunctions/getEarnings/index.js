const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

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

function formatPlainAmount(value) {
  const amount = Number(value || 0)
  if (!amount) {
    return '0'
  }
  return String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function normalizeNumber(value) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? amount : 0
}

function normalizeRecordList(value) {
  const list = Array.isArray(value) ? value : []
  return list.map((item, index) => {
    const record = item && typeof item === 'object' ? item : {}
    return {
      id: String(record.id || `record-${index}`).trim(),
      paymentAmount: normalizeNumber(record.paymentAmount),
      commissionAmount: normalizeNumber(record.commissionAmount),
      date: formatDateOnly(record.date),
      note: String(record.note || '').trim()
    }
  }).filter((item) => item.paymentAmount > 0 || item.commissionAmount > 0)
}

function buildRevenueRecords(item) {
  const records = normalizeRecordList(item && item.revenueRecords)
  if (records.length) {
    return records
  }

  const paidAmount = normalizeNumber(item && item.paidAmount)
  const settledCommission = normalizeNumber(item && item.settledCommission)
  if (paidAmount <= 0 && settledCommission <= 0) {
    return []
  }

  return [{
    id: 'legacy-revenue-record',
    paymentAmount: paidAmount,
    commissionAmount: settledCommission,
    date: formatDateOnly((item && (item.latestPaymentDate || item.commissionSettledDate || item.contractDate)) || new Date()),
    note: ''
  }]
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

function getPaymentStatusClass(status) {
  if (status === '全部回款') {
    return 'is-success'
  }
  if (status === '未回款') {
    return 'is-danger'
  }
  return ''
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

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const dealsResult = await db.collection('deals')
    .where({
      _openid: wxContext.OPENID
    })
    .orderBy('contractDate', 'desc')
    .get()

  const deals = dealsResult.data || []
  const currentMonthDeals = deals.filter((item) => {
    const contractDate = item.contractDate instanceof Date ? item.contractDate : new Date(item.contractDate)
    return !Number.isNaN(contractDate.getTime()) && contractDate >= monthStart
  })

  const totalActualAmount = currentMonthDeals.reduce((sum, item) => sum + normalizeNumber(item.actualAmount), 0)
  const totalCommission = currentMonthDeals.reduce((sum, item) => sum + normalizeNumber(item.expectedCommission), 0)
  const totalPaidAmount = currentMonthDeals.reduce((sum, item) => {
    const records = buildRevenueRecords(item)
    return sum + records.reduce((recordSum, record) => recordSum + record.paymentAmount, 0)
  }, 0)
  const totalSettledCommission = currentMonthDeals.reduce((sum, item) => {
    const records = buildRevenueRecords(item)
    return sum + records.reduce((recordSum, record) => recordSum + record.commissionAmount, 0)
  }, 0)

  const projectIds = deals
    .map((item) => String(item.projectId || '').trim())
    .filter(Boolean)

  let projectMap = {}
  if (projectIds.length) {
    const projectResult = await db.collection('projects')
      .where({
        _openid: wxContext.OPENID
      })
      .get()

    projectMap = (projectResult.data || []).reduce((map, item) => {
      map[item._id] = item
      return map
    }, {})
  }

  return {
    ok: true,
    summary: [
      { label: '合同金额', value: formatAmount(totalActualAmount) },
      { label: '预期提成', value: formatAmount(totalCommission) },
      { label: '已回款', value: formatAmount(totalPaidAmount) },
      { label: '已兑现', value: formatAmount(totalSettledCommission) }
    ],
    deals: deals.map((item) => {
      const project = projectMap[item.projectId] || {}
      const actualAmount = normalizeNumber(item.actualAmount)
      const expectedCommission = normalizeNumber(item.expectedCommission)
      const revenueRecords = buildRevenueRecords(item)
      const paidAmount = revenueRecords.reduce((sum, record) => sum + record.paymentAmount, 0)
      const settledCommission = revenueRecords.reduce((sum, record) => sum + record.commissionAmount, 0)
      const paymentStatus = getPaymentStatus(paidAmount, actualAmount)
      const commissionStatus = getCommissionStatus(settledCommission, expectedCommission)
      return {
        id: item._id,
        projectId: item.projectId || '',
        name: project.projectName || item.projectNameSnapshot || '未命名项目',
        client: project.clientName || project.client || '',
        amount: formatPlainAmount(actualAmount),
        amountValue: actualAmount,
        amountInput: actualAmount ? formatPlainAmount(actualAmount) : '',
        commission: formatPlainAmount(expectedCommission),
        commissionValue: expectedCommission,
        commissionInput: expectedCommission ? formatPlainAmount(expectedCommission) : '',
        paidAmount: formatPlainAmount(paidAmount),
        paidAmountValue: paidAmount,
        settledCommission: formatPlainAmount(settledCommission),
        settledCommissionValue: settledCommission,
        status: paymentStatus,
        paymentStatus,
        paymentStatusClass: getPaymentStatusClass(paymentStatus),
        commissionStatus,
        revenueRecords,
        date: formatDateOnly(item.contractDate),
        note: item.note || ''
      }
    })
  }
}
