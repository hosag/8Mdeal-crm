const { loadOutboundData, markNotificationReadData, resolveNotificationData } = require('../../services/data')
const { syncPageAppearance } = require('../../utils/appearance')

const STATUS_FILTERS = [
  { key: 'all', label: '全部外发' },
  { key: 'unopened', label: '未打开' },
  { key: 'opened', label: '已打开' },
  { key: 'imported', label: '已接手' },
  { key: 'followed', label: '已跟进' }
]
const SORT_OPTIONS = [
  { key: 'updated', label: '最近更新' },
  { key: 'viewed', label: '浏览优先' }
]

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

function normalizeRecord(record, index) {
  const updatedAt = parseDateTime(record.updatedAtRaw || record.importedAtRaw || record.firstOpenedAtRaw || record.createdAtRaw || record.createdAt)
  const statusText = record.statusText || '未打开'
  const receiverName = record.receiverName || record.receiverOpenidMasked || '暂未识别'
  const isOutbound = (record.mode || '项目外发') === '项目外发'
  let statusSummary = '已发出，等待对方查看'
  let trackingSummary = '已发出，当前还在等待对方打开交接卡。'

  if (statusText === '已打开') {
    statusSummary = isOutbound
      ? '对方已查看，正在等待正式接手'
      : '对方已查看，这次分享主要用于信息同步'
    trackingSummary = isOutbound
      ? `${receiverName} 已查看交接卡，暂未接手项目。`
      : `${receiverName} 已查看资料卡，本次分享仍由你继续维护。`
  }

  if (statusText === '已导入') {
    statusSummary = '对方已接手项目，正在等待首条推进记录'
    trackingSummary = `${receiverName} 已接手项目，暂未新增推进记录。`
  }

  if (statusText === '已跟进') {
    statusSummary = `对方已继续跟进 ${Number(record.collaboratorFollowCount || 0)} 条`
    trackingSummary = record.collaboratorLatestFollowAt
      ? `${receiverName} 已新增 ${Number(record.collaboratorFollowCount || 0)} 条推进记录，最近更新 ${record.collaboratorLatestFollowAt}。`
      : `${receiverName} 已开始继续推进，当前可进入详情查看完整时间线。`
  }

  let receiverSummary = '等待接手方打开交接卡'
  if (statusText === '已打开') {
    receiverSummary = `${receiverName} 已查看交接卡`
  } else if (statusText === '已导入' || statusText === '已跟进') {
    receiverSummary = `${receiverName} 已接手项目`
  }

  return {
    id: record.id || `share-record-${index}`,
    projectId: record.projectId || '',
    importedProjectId: record.importedProjectId || '',
    name: record.name || '未命名项目',
    partner: record.partner || '未命名标签',
    mode: record.mode || '项目外发',
    viewed: record.viewed || `预览 ${Number(record.viewCount || 0)} 次`,
    viewCount: Number(record.viewCount || 0),
    receiverName,
    createdAt: record.createdAt || '最近',
    importedAt: record.importedAt || '',
    firstOpenedAt: record.firstOpenedAt || '',
    lastViewedAt: record.lastViewedAt || '',
    collaboratorFollowCount: Number(record.collaboratorFollowCount || 0),
    collaboratorLatestFollowAt: record.collaboratorLatestFollowAt || '',
    status: record.status || '进行中',
    statusText,
    statusSummary,
    trackingSummary,
    receiverSummary,
    syncSummary: statusText === '已跟进'
      ? `对方已新增推进记录 ${Number(record.collaboratorFollowCount || 0)} 条`
      : (statusText === '已导入'
        ? '项目已进入对方“我的项目”'
        : (statusText === '已打开' ? '对方已查看，待决定是否接手' : '当前还在等待对方查看')),
    stage: record.stage || '线索',
    updatedAt,
    searchText: [
      record.name,
      record.partner,
      record.mode,
      record.receiverName,
      record.receiverOpenidMasked,
      record.stage
    ].join(' ').toLowerCase(),
    statusBadgeClass: record.status === '已成交'
      ? 'is-success'
      : (record.status === '已流失' ? 'is-danger' : ''),
    progressBadgeClass: statusText === '已跟进'
      ? 'is-success'
      : (statusText === '未打开' ? 'is-danger' : (statusText === '已打开' ? 'is-brand' : '')),
    latestTrackingAt: record.collaboratorLatestFollowAt || record.importedAt || record.firstOpenedAt || record.lastViewedAt || record.createdAt || ''
  }
}

function buildResultSummaryText({ count, total, statusFilter, sortMode, keyword }) {
  const parts = [`共 ${count} 条记录 / ${total} 条外发`]
  const currentStatus = STATUS_FILTERS.find((item) => item.key === statusFilter)
  const currentSort = SORT_OPTIONS.find((item) => item.key === sortMode)

  if (keyword) {
    parts.push(`搜索“${keyword}”`)
  }

  if (currentStatus && currentStatus.key !== 'all') {
    parts.push(`状态：${currentStatus.label}`)
  }

  if (currentSort) {
    parts.push(`排序：${currentSort.label}`)
  }

  return parts.join(' · ')
}

Page({
  data: {
    appearancePageClass: '',
    searchKeyword: '',
    statusFilter: 'all',
    sortMode: 'updated',
    statusFilters: STATUS_FILTERS,
    sortOptions: SORT_OPTIONS,
    outboundProjects: [],
    filteredRecords: [],
    summaryCards: [],
    resultSummaryText: '正在整理外发数据',
    emptyTitle: '当前筛选下暂无外发记录',
    emptyDesc: '你可以切回全部外发项目，或先发起一次项目外发。',
    emptyActionText: '查看我的项目',
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
    await this.fetchOutboundProjects()
  },

  async onShow() {
    this.isPageActive = true
    syncPageAppearance(this)
    if (!this.data.isLoading) {
      await this.fetchOutboundProjects()
    }
  },

  onHide() {
    this.isPageActive = false
  },

  onUnload() {
    this.isPageActive = false
  },

  async fetchOutboundProjects() {
    this.safeSetData({
      isLoading: true,
      isLoadFailed: false,
      loadError: ''
    })

    try {
      const { data, source } = await loadOutboundData()
      const outboundProjects = (Array.isArray(data) ? data : []).map(normalizeRecord)
      this.safeSetData({
        outboundProjects,
        isLoading: false,
        dataSource: source
      }, () => this.applyFilters())
      this.syncSharedNotifications()
    } catch (error) {
      const message = error && error.message ? error.message : '当前无法同步云端数据，请稍后重试'
      this.safeSetData({
        outboundProjects: [],
        filteredRecords: [],
        summaryCards: [],
        resultSummaryText: '当前无法同步外发数据',
        emptyTitle: '当前无法同步外发数据',
        emptyDesc: '请检查网络或云环境连接后重新加载。',
        emptyActionText: '查看我的项目',
        isLoading: false,
        isLoadFailed: true,
        loadError: message
      })
      wx.showToast({
        title: '当前无法同步外发数据',
        icon: 'none'
      })
    }
  },

  retryFetch() {
    this.fetchOutboundProjects()
  },

  async syncSharedNotifications() {
    try {
      await Promise.all([
        markNotificationReadData({
          types: ['shared_imported', 'shared_followed']
        }),
        resolveNotificationData({
          types: ['shared_imported', 'shared_followed']
        })
      ])
    } catch (error) {
      // Keep the tracking page available even if notification sync fails.
    }
  },

  onSearchInput(event) {
    this.setData({
      searchKeyword: String(event.detail.value || '')
    }, () => this.applyFilters())
  },

  clearSearch() {
    this.setData({
      searchKeyword: ''
    }, () => this.applyFilters())
  },

  setStatusFilter(event) {
    this.setData({
      statusFilter: event.currentTarget.dataset.filter
    }, () => this.applyFilters())
  },

  setSortMode(event) {
    this.setData({
      sortMode: event.currentTarget.dataset.sort
    }, () => this.applyFilters())
  },

  applyFilters() {
    const rawKeyword = String(this.data.searchKeyword || '').trim()
    const keyword = rawKeyword.toLowerCase()
    const statusFilter = this.data.statusFilter
    const sortMode = this.data.sortMode

    const filteredRecords = this.data.outboundProjects
      .filter((item) => (keyword ? item.searchText.includes(keyword) : true))
      .filter((item) => {
        if (statusFilter === 'unopened') {
          return item.statusText === '未打开'
        }
        if (statusFilter === 'opened') {
          return item.statusText === '已打开'
        }
        if (statusFilter === 'imported') {
          return item.statusText === '已导入'
        }
        if (statusFilter === 'followed') {
          return item.statusText === '已跟进'
        }
        return true
      })
      .sort((left, right) => {
        if (sortMode === 'viewed') {
          if (right.viewCount !== left.viewCount) {
            return right.viewCount - left.viewCount
          }
        }
        return (right.updatedAt ? right.updatedAt.getTime() : 0) - (left.updatedAt ? left.updatedAt.getTime() : 0)
      })

    const allRecords = this.data.outboundProjects
    const summaryCards = [
      { label: '全部外发', value: String(allRecords.length), note: '当前追踪池' },
      { label: '待查看', value: String(allRecords.filter((item) => item.statusText === '未打开').length), note: '对方还未打开' },
      { label: '已接手', value: String(allRecords.filter((item) => item.statusText === '已导入' || item.statusText === '已跟进').length), note: '已进入对方项目池' }
    ]

    const hasCustomFilter = Boolean(keyword) || statusFilter !== 'all'
    this.setData({
      filteredRecords,
      summaryCards,
      resultSummaryText: buildResultSummaryText({
        count: filteredRecords.length,
        total: allRecords.length,
        statusFilter,
        sortMode,
        keyword: rawKeyword
      }),
      emptyTitle: keyword ? '没有找到匹配记录' : '当前筛选下暂无外发记录',
      emptyDesc: keyword
        ? '可以换项目名、接收方或标签再试一次。'
        : '你可以切回全部外发项目，或先发起一次项目外发。',
      emptyActionText: hasCustomFilter ? '重置筛选' : '查看我的项目'
    })
  },

  resetFilters() {
    this.setData({
      searchKeyword: '',
      statusFilter: 'all',
      sortMode: 'updated'
    }, () => this.applyFilters())
  },

  handleEmptyAction() {
    if (this.data.emptyActionText === '重置筛选') {
      this.resetFilters()
      return
    }

    this.openPage({
      currentTarget: {
        dataset: {
          url: '/pages/projects/projects'
        }
      }
    })
  },

  openPage(event) {
    const { url, projectId } = event.currentTarget.dataset
    if (url === '/pages/project-detail/project-detail' && projectId) {
      wx.navigateTo({
        url: `${url}?projectId=${projectId}&view=shared-out`
      })
      return
    }

    wx.navigateTo({ url })
  },

  openRecordDetail(event) {
    const { projectId } = event.currentTarget.dataset
    if (!projectId) {
      return
    }

    this.openPage({
      currentTarget: {
        dataset: {
          url: '/pages/project-detail/project-detail',
          projectId
        }
      }
    })
  }
})
