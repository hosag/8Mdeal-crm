const { loadContactsData } = require('../../services/data')
const { syncPageAppearance } = require('../../utils/appearance')

function normalizeText(value) {
  return String(value || '').trim()
}

function parseDateTime(value) {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  const text = String(value).trim()
  if (!text) {
    return null
  }

  const directDate = new Date(text.includes('T') ? text : text.replace(' ', 'T'))
  if (!Number.isNaN(directDate.getTime())) {
    return directDate
  }

  const shortMatch = text.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/)
  if (shortMatch) {
    const now = new Date()
    return new Date(
      now.getFullYear(),
      Number(shortMatch[1]) - 1,
      Number(shortMatch[2]),
      Number(shortMatch[3]),
      Number(shortMatch[4]),
      0,
      0
    )
  }

  return null
}

function containsKeyword(value, keyword) {
  return normalizeText(value).toLowerCase().includes(normalizeText(keyword).toLowerCase())
}

function normalizeContact(item, index) {
  const projectCards = Array.isArray(item.projectCards) ? item.projectCards : []
  const projectNames = Array.isArray(item.projectNames) ? item.projectNames : []
  const relationTags = Array.isArray(item.relationTags) ? item.relationTags : []
  const stageTags = Array.isArray(item.stageTags) ? item.stageTags : []
  const projectCount = Number(item.projectCount || projectCards.length || 0)
  const latestProjectName = normalizeText(item.latestProjectName) || (projectCards[0] ? projectCards[0].name : '')
  const latestFollowUpText = normalizeText(item.latestFollowUpText) || '最近'
  const latestSummary = normalizeText(item.latestSummary) || '当前还没有沟通摘要'
  const company = normalizeText(item.company) || '未填写公司'
  const roleSummary = normalizeText(item.roleSummary) || '未标注角色'
  const summaryProjectText = projectCount <= 1
    ? (projectNames[0] || latestProjectName || '当前未关联项目')
    : `${projectNames[0] || latestProjectName || '当前联系人'} 等 ${projectCount} 个项目`
  const latestContextText = latestProjectName
    ? `${latestProjectName} · ${latestFollowUpText}`
    : latestFollowUpText
  const projectCountText = projectCount <= 1 ? '当前聚焦 1 个项目' : `当前关联 ${projectCount} 个项目`

  return {
    id: normalizeText(item.id) || `contact-${index}`,
    name: normalizeText(item.name) || '未命名联系人',
    company,
    roleSummary,
    latestSummary,
    latestFollowUpText,
    latestFollowUpAt: parseDateTime(item.latestFollowUpTimeRaw),
    latestProjectId: normalizeText(item.latestProjectId),
    latestProjectName,
    latestOwnerLabel: normalizeText(item.latestOwnerLabel),
    relationTags: relationTags.slice(0, 3),
    stageTags: stageTags.slice(0, 3),
    projectCount,
    projectSummaryText: summaryProjectText,
    latestContextText,
    projectCountText,
    badgeText: item.isKeyContact ? '关键人' : `关联 ${Math.max(projectCount, 1)} 项目`,
    badgeClass: item.isKeyContact ? 'is-brand' : 'is-soft',
    searchText: [
      item.name,
      company,
      roleSummary,
      latestSummary,
      latestProjectName,
      ...projectNames,
      ...relationTags,
      ...stageTags
    ].join(' ').toLowerCase()
  }
}

function buildSummaryCards(contacts) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const sevenDaysAgo = start - (6 * 86400000)
  const activeCount = contacts.filter((item) => {
    return item.latestFollowUpAt && item.latestFollowUpAt.getTime() >= sevenDaysAgo
  }).length
  const linkedProjectCount = contacts.reduce((sum, item) => sum + Number(item.projectCount || 0), 0)
  const keyContactCount = contacts.filter((item) => item.badgeClass === 'is-brand').length

  return [
    {
      label: '联系人',
      value: String(contacts.length),
      note: '关键联系人'
    },
    {
      label: '关键人',
      value: String(keyContactCount),
      note: '优先盯拍板链路'
    },
    {
      label: '近 7 天有沟通',
      value: String(activeCount),
      note: `关联 ${linkedProjectCount} 个项目`
    }
  ]
}

function buildResultSummaryText({ count, total, keyword }) {
  const parts = [`共 ${count} 位联系人 / 全部 ${total} 位`]
  if (keyword) {
    parts.push(`搜索“${keyword}”`)
  }
  return parts.join(' · ')
}

Page({
  data: {
    appearancePageClass: '',
    contacts: [],
    filteredContacts: [],
    summaryCards: [],
    resultSummaryText: '正在整理联系人',
    searchKeyword: '',
    emptyTitle: '当前还没有联系人',
    emptyDesc: '先在项目里补一个联系人，后面就能从这里直接找关键人。',
    emptyActionText: '新建项目',
    isLoading: true,
    isLoadFailed: false,
    loadError: '',
    dataSource: 'Mock Demo'
  },

  safeSetData(update, callback) {
    if (!this.isPageActive) {
      return
    }

    this.setData(update, callback)
  },

  async onLoad() {
    this.isPageActive = true
    syncPageAppearance(this)
    await this.fetchContacts()
  },

  async onShow() {
    this.isPageActive = true
    syncPageAppearance(this)
    if (!this.data.isLoading) {
      await this.fetchContacts()
    }
  },

  onHide() {
    this.isPageActive = false
  },

  onUnload() {
    this.isPageActive = false
  },

  async fetchContacts() {
    this.safeSetData({
      isLoading: true,
      isLoadFailed: false,
      loadError: ''
    })

    try {
      const { data, source } = await loadContactsData()
      const contacts = (Array.isArray(data) ? data : []).map(normalizeContact)

      this.safeSetData({
        contacts,
        isLoading: false,
        dataSource: source
      }, () => this.applyFilters())
    } catch (error) {
      this.safeSetData({
        contacts: [],
        filteredContacts: [],
        summaryCards: [],
        resultSummaryText: '当前无法同步联系人数据',
        emptyTitle: '当前无法同步联系人数据',
        emptyDesc: '请检查网络或云环境连接后重新加载。',
        emptyActionText: '重新加载',
        isLoading: false,
        isLoadFailed: true,
        loadError: error && error.message ? error.message : '当前无法同步联系人数据'
      })

      wx.showToast({
        title: '当前无法同步联系人数据',
        icon: 'none'
      })
    }
  },

  retryFetch() {
    this.fetchContacts()
  },

  onSearchInput(event) {
    this.setData({
      searchKeyword: event.detail.value || ''
    }, () => this.applyFilters())
  },

  clearSearch() {
    this.setData({
      searchKeyword: ''
    }, () => this.applyFilters())
  },

  applyFilters() {
    const keyword = normalizeText(this.data.searchKeyword).toLowerCase()
    const contacts = Array.isArray(this.data.contacts) ? this.data.contacts.slice() : []
    const filteredContacts = keyword
      ? contacts.filter((item) => containsKeyword(item.searchText, keyword))
      : contacts

    const total = contacts.length
    const count = filteredContacts.length
    const hasKeyword = Boolean(keyword)
    const emptyTitle = total
      ? (hasKeyword ? '没有找到对应联系人' : '当前还没有联系人')
      : '当前还没有联系人'
    const emptyDesc = total
      ? (hasKeyword ? '试试换一个姓名、公司、角色或项目关键词。' : '先在项目里补一个联系人，后面就能从这里直接找关键人。')
      : '先在项目里补一个联系人，后面就能从这里直接找关键人。'
    const emptyActionText = hasKeyword ? '清空搜索' : '新建项目'

    this.setData({
      filteredContacts,
      summaryCards: buildSummaryCards(contacts),
      resultSummaryText: buildResultSummaryText({
        count,
        total,
        keyword: this.data.searchKeyword
      }),
      emptyTitle,
      emptyDesc,
      emptyActionText
    })
  },

  openContactDetail(event) {
    const contactId = event.currentTarget.dataset.contactId
    if (!contactId) {
      return
    }

    wx.navigateTo({
      url: `/pages/contact-detail/contact-detail?contactId=${contactId}`
    })
  },

  openLatestProject(event) {
    const projectId = event.currentTarget.dataset.projectId
    if (!projectId) {
      return
    }

    wx.navigateTo({
      url: `/pages/project-detail/project-detail?projectId=${projectId}`
    })
  },

  handleEmptyAction() {
    if (normalizeText(this.data.searchKeyword)) {
      this.clearSearch()
      return
    }

    wx.navigateTo({
      url: '/pages/project-form/project-form'
    })
  }
})
