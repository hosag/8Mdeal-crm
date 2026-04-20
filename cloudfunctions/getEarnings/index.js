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

  const totalActualAmount = currentMonthDeals.reduce((sum, item) => sum + Number(item.actualAmount || 0), 0)
  const totalCommission = currentMonthDeals.reduce((sum, item) => sum + Number(item.expectedCommission || 0), 0)
  const totalReceived = currentMonthDeals.reduce((sum, item) => {
    const actualAmount = Number(item.actualAmount || 0)
    if (item.paymentStatus === '全部回款') {
      return sum + actualAmount
    }
    if (item.paymentStatus === '部分回款') {
      return sum + Math.round(actualAmount * 0.5)
    }
    return sum
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
      { label: '本月成交', value: formatAmount(totalActualAmount) },
      { label: '预期提成', value: formatAmount(totalCommission) },
      { label: '已回款', value: formatAmount(totalReceived) }
    ],
    deals: deals.map((item) => {
      const project = projectMap[item.projectId] || {}
      return {
        id: item._id,
        projectId: item.projectId || '',
        name: project.projectName || item.projectNameSnapshot || '未命名项目',
        amount: formatAmount(item.actualAmount),
        commission: formatAmount(item.expectedCommission),
        status: item.paymentStatus || '未回款',
        date: formatDateOnly(item.contractDate),
        note: item.note || ''
      }
    })
  }
}
