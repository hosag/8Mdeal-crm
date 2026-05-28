const { loadEarningsData, saveDealData } = require('../../services/data')
const { syncPageAppearance } = require('../../utils/appearance')
const { openTabPage } = require('../../utils/tab-bar-navigation')

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeAmountInput(value) {
  const text = String(value || '').replace(/[^\d.]/g, '')
  if (!text) {
    return ''
  }
  const amount = Number(text)
  return Number.isFinite(amount) ? String(amount) : ''
}

function normalizeAmountPayload(value) {
  return String(value || '').replace(/[^\d.]/g, '')
}

function parseAmountValue(value) {
  const text = normalizeText(value).replace(/,/g, '')
  if (!text) {
    return 0
  }
  const matched = text.match(/[\d.]+/)
  if (!matched) {
    return 0
  }
  const amount = Number(matched[0])
  if (!Number.isFinite(amount)) {
    return 0
  }
  return text.includes('万') ? amount * 10000 : amount
}

function getDealAmountValue(deal = {}, valueKey, fallbackKeys = []) {
  const directValue = Number(deal[valueKey] || 0)
  if (Number.isFinite(directValue) && directValue > 0) {
    return directValue
  }
  const fallbackValue = fallbackKeys.reduce((result, key) => {
    return result || parseAmountValue(deal[key])
  }, 0)
  return fallbackValue
}

function formatSummaryAmount(value) {
  const amount = Number(value || 0)
  if (!amount) {
    return '0'
  }
  if (amount >= 10000) {
    const wan = amount / 10000
    return `${Number.isInteger(wan) ? wan : wan.toFixed(1)}万`
  }
  return String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function parseDateText(value) {
  const text = normalizeText(value)
  if (!text) {
    return null
  }
  const date = new Date(text.replace(/-/g, '/'))
  return Number.isNaN(date.getTime()) ? null : date
}

function getTodayText() {
  const date = new Date()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function buildRecordId() {
  return `record-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

function normalizeRevenueRecord(record = {}) {
  return {
    id: normalizeText(record.id) || buildRecordId(),
    paymentAmount: record.paymentAmount ? String(record.paymentAmount) : '',
    commissionAmount: record.commissionAmount ? String(record.commissionAmount) : '',
    date: normalizeText(record.date) || getTodayText(),
    note: normalizeText(record.note)
  }
}

function getSummaryValue(summary, label, fallback = '0') {
  const list = Array.isArray(summary) ? summary : []
  const item = list.find((current) => normalizeText(current.label) === label)
  return item && normalizeText(item.value) ? normalizeText(item.value) : fallback
}

function buildEarningsHero(earnings = {}) {
  const summary = Array.isArray(earnings.summary) ? earnings.summary : []
  return {
    periodLabel: normalizeText(earnings.periodLabel) || '本年',
    mainValue: getSummaryValue(summary, '合同金额'),
    metrics: [
      { key: 'commission', label: '预期提成', value: getSummaryValue(summary, '预期提成') },
      { key: 'paid', label: '已回款', value: getSummaryValue(summary, '已回款') },
      { key: 'settled', label: '已兑现', value: getSummaryValue(summary, '已兑现') }
    ]
  }
}

function isDealInFilter(deal = {}, filterKey) {
  if (filterKey === 'all') {
    return true
  }
  const date = parseDateText(deal.date)
  if (!date) {
    return false
  }
  const now = new Date()
  if (filterKey === 'month') {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  }
  return date.getFullYear() === now.getFullYear()
}

function getFilterLabel(filters, filterKey) {
  const current = filters.find((item) => item.key === filterKey)
  return current ? current.label : '本年'
}

function buildEarningsSummary(deals) {
  const totalActualAmount = deals.reduce((sum, item) => {
    return sum + getDealAmountValue(item, 'amountValue', ['amountInput', 'amount'])
  }, 0)
  const totalCommission = deals.reduce((sum, item) => {
    return sum + getDealAmountValue(item, 'commissionValue', ['commissionInput', 'commission'])
  }, 0)
  const totalPaidAmount = deals.reduce((sum, item) => {
    return sum + getDealAmountValue(item, 'paidAmountValue', ['paidAmount'])
  }, 0)
  const totalSettledCommission = deals.reduce((sum, item) => {
    return sum + getDealAmountValue(item, 'settledCommissionValue', ['settledCommission'])
  }, 0)

  return [
    { label: '合同金额', value: formatSummaryAmount(totalActualAmount) },
    { label: '预期提成', value: formatSummaryAmount(totalCommission) },
    { label: '已回款', value: formatSummaryAmount(totalPaidAmount) },
    { label: '已兑现', value: formatSummaryAmount(totalSettledCommission) }
  ]
}

function buildFilteredEarnings(source = {}, filterKey = 'year', filters = []) {
  const deals = Array.isArray(source.deals) ? source.deals : []
  const filteredDeals = deals.filter((item) => isDealInFilter(item, filterKey))
  const periodLabel = getFilterLabel(filters, filterKey)
  return {
    ...source,
    periodLabel,
    summary: buildEarningsSummary(filteredDeals),
    deals: filteredDeals
  }
}

function buildRevenueForm(deal = {}) {
  return {
    dealId: normalizeText(deal.id),
    projectId: normalizeText(deal.projectId),
    projectName: normalizeText(deal.name) || '未命名项目',
    actualAmount: deal.amountValue ? String(deal.amountValue) : '',
    expectedCommission: deal.commissionValue ? String(deal.commissionValue) : '',
    contractDate: normalizeText(deal.date) || getTodayText(),
    records: Array.isArray(deal.revenueRecords) && deal.revenueRecords.length
      ? deal.revenueRecords.map(normalizeRevenueRecord)
      : []
  }
}

Page({
  data: {
    appearancePageClass: '',
    earnings: {
      summary: [],
      deals: []
    },
    allEarnings: {
      summary: [],
      deals: []
    },
    earningsHero: buildEarningsHero(),
    earningsFilter: 'year',
    earningsFilters: [
      { key: 'month', label: '本月' },
      { key: 'year', label: '本年' },
      { key: 'all', label: '全部' }
    ],
    revenueForm: buildRevenueForm(),
    showRevenueSheet: false,
    isSavingRevenue: false,
    isLoading: true,
    dataSource: 'Mock Demo'
  },

  async onLoad() {
    syncPageAppearance(this)
    await this.fetchEarnings()
  },

  async onShow() {
    syncPageAppearance(this)
    if (!this.data.isLoading) {
      await this.fetchEarnings()
    }
  },

  async fetchEarnings() {
    try {
      const { data, source } = await loadEarningsData()
      const earnings = buildFilteredEarnings(data, this.data.earningsFilter, this.data.earningsFilters)
      this.setData({
        allEarnings: data,
        earnings,
        earningsHero: buildEarningsHero(earnings),
        isLoading: false,
        dataSource: source
      })
    } catch (error) {
      this.setData({
        isLoading: false
      })
      wx.showToast({
        title: '当前无法同步收益数据',
        icon: 'none'
      })
    }
  },

  setEarningsFilter(event) {
    const { filter } = event.currentTarget.dataset
    if (!filter || filter === this.data.earningsFilter) {
      return
    }

    const earnings = buildFilteredEarnings(this.data.allEarnings, filter, this.data.earningsFilters)
    this.setData({
      earningsFilter: filter,
      earnings,
      earningsHero: buildEarningsHero(earnings)
    })
  },

  openDealProject(event) {
    const { projectId } = event.currentTarget.dataset
    if (!projectId) {
      return
    }

    wx.navigateTo({
      url: `/pages/project-detail/project-detail?projectId=${projectId}`
    })
  },

  onDealAmountInput(event) {
    const { dealId, field } = event.currentTarget.dataset
    const value = normalizeAmountInput(event.detail.value)
    const deals = (this.data.earnings.deals || []).map((item) => {
      if (item.id !== dealId) {
        return item
      }
      return {
        ...item,
        [field]: value
      }
    })
    const allDeals = (this.data.allEarnings.deals || []).map((item) => {
      if (item.id !== dealId) {
        return item
      }
      return {
        ...item,
        [field]: value
      }
    })
    const allEarnings = {
      ...this.data.allEarnings,
      deals: allDeals
    }
    this.setData({
      allEarnings,
      'earnings.deals': deals
    })
  },

  async saveDealAmounts(event) {
    const { dealId } = event.currentTarget.dataset
    const deal = (this.data.earnings.deals || []).find((item) => item.id === dealId)
    if (!deal || this.data.isSavingRevenue) {
      return
    }

    this.setData({
      isSavingRevenue: true
    })

    try {
      const result = await saveDealData({
        projectId: deal.projectId,
        actualAmount: normalizeAmountPayload(deal.amountInput),
        expectedCommission: normalizeAmountPayload(deal.commissionInput),
        contractDate: deal.date || getTodayText(),
        revenueRecords: deal.revenueRecords || [],
        note: deal.note || ''
      })
      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '保存失败')
      }
      await this.fetchEarnings()
      wx.showToast({
        title: '金额已保存',
        icon: 'success'
      })
    } catch (error) {
      wx.showToast({
        title: error.message || '当前无法保存金额',
        icon: 'none'
      })
    } finally {
      this.setData({
        isSavingRevenue: false
      })
    }
  },

  openRevenueSheet(event) {
    const { dealId } = event.currentTarget.dataset
    const deal = (this.data.earnings.deals || []).find((item) => item.id === dealId)
    if (!deal) {
      wx.showToast({
        title: '当前无法读取成交记录',
        icon: 'none'
      })
      return
    }

    const revenueForm = buildRevenueForm(deal)
    if (!revenueForm.records.length) {
      revenueForm.records = [normalizeRevenueRecord()]
    }

    this.setData({
      revenueForm,
      showRevenueSheet: true
    })
  },

  closeRevenueSheet() {
    if (this.data.isSavingRevenue) {
      return
    }

    this.setData({
      showRevenueSheet: false
    })
  },

  addRevenueRecord() {
    const records = (this.data.revenueForm.records || []).concat(normalizeRevenueRecord())
    this.setData({
      'revenueForm.records': records
    })
  },

  removeRevenueRecord(event) {
    const index = Number(event.currentTarget.dataset.index)
    const records = (this.data.revenueForm.records || []).filter((item, itemIndex) => itemIndex !== index)
    this.setData({
      'revenueForm.records': records.length ? records : [normalizeRevenueRecord()]
    })
  },

  onRevenueRecordInput(event) {
    const index = Number(event.currentTarget.dataset.index)
    const field = event.currentTarget.dataset.field
    const records = (this.data.revenueForm.records || []).slice()
    const current = records[index] || normalizeRevenueRecord()
    const value = event.detail.value
    records[index] = {
      ...current,
      [field]: field === 'paymentAmount' || field === 'commissionAmount'
        ? normalizeAmountInput(value)
        : value
    }
    this.setData({
      'revenueForm.records': records
    })
  },

  onRevenueRecordDateChange(event) {
    const index = Number(event.currentTarget.dataset.index)
    const records = (this.data.revenueForm.records || []).slice()
    const current = records[index] || normalizeRevenueRecord()
    records[index] = {
      ...current,
      date: event.detail.value
    }
    this.setData({
      'revenueForm.records': records
    })
  },

  async saveRevenueRecords() {
    if (this.data.isSavingRevenue) {
      return
    }

    const form = this.data.revenueForm || {}
    if (!form.projectId) {
      wx.showToast({
        title: '缺少项目上下文',
        icon: 'none'
      })
      return
    }

    const records = (form.records || []).filter((item) => {
      return Number(item.paymentAmount || 0) > 0 || Number(item.commissionAmount || 0) > 0
    })

    this.setData({
      isSavingRevenue: true
    })

    try {
      const result = await saveDealData({
        projectId: form.projectId,
        actualAmount: normalizeAmountPayload(form.actualAmount),
        expectedCommission: normalizeAmountPayload(form.expectedCommission),
        contractDate: form.contractDate || getTodayText(),
        revenueRecords: records
      })
      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '保存失败')
      }

      await this.fetchEarnings()
      this.setData({
        showRevenueSheet: false
      })
      wx.showToast({
        title: '记录已保存',
        icon: 'success'
      })
    } catch (error) {
      wx.showToast({
        title: error.message || '当前无法保存记录',
        icon: 'none'
      })
    } finally {
      this.setData({
        isSavingRevenue: false
      })
    }
  },

  openPage(event) {
    const { url } = event.currentTarget.dataset
    if (openTabPage(url)) {
      return
    }

    wx.navigateTo({ url })
  }
})
