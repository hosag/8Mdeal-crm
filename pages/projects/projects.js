const { loadProjectsData, updateTaskStatusData } = require('../../services/data')
const { buildTaskCompletionFeedback, getTaskCompletionToastTitle } = require('../../services/task-feedback')
const { buildProjectsEntryContext } = require('../../utils/navigation-context')
const { touchNotificationSync } = require('../../utils/notification-sync')
const { syncPageAppearance } = require('../../utils/appearance')

const STAGES = ['全部阶段', '线索', '洽谈', '方案', '商务', '成交', '流失']
const QUICK_FILTERS = [
  { key: 'all', label: '全部项目' },
  { key: 'today', label: '今天推进' },
  { key: 'overdue', label: '已逾期' },
  { key: 'task_open', label: '有待办' },
  { key: 'no_task', label: '待补动作' },
  { key: 'quote', label: '待报价' },
  { key: 'callback', label: '待回访' },
  { key: 'high_value', label: '高金额' },
  { key: 'shared', label: '我接手的' }
]
const SORT_OPTIONS = [
  { key: 'updated', label: '最近更新' },
  { key: 'task', label: '动作优先' },
  { key: 'amount', label: '金额优先' }
]
const HIGH_VALUE_THRESHOLD = 500000

function normalizeQuickFilter(value) {
  if (value === 'todo') {
    return 'task_open'
  }

  if (value === 'overdue') {
    return 'overdue'
  }

  if (value === 'tasks') {
    return 'task_open'
  }

  if (value === 'today_tasks') {
    return 'today'
  }

  if (value === 'overdue_tasks') {
    return 'overdue'
  }

  if (value === 'no_tasks') {
    return 'no_task'
  }

  return QUICK_FILTERS.some((item) => item.key === value) ? value : 'all'
}

function normalizeSortMode(value) {
  if (value === 'next') {
    return 'task'
  }

  return SORT_OPTIONS.some((item) => item.key === value) ? value : 'task'
}

function normalizeStageFilter(value) {
  return STAGES.includes(value) ? value : '全部阶段'
}

function startOfDay(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function parseAmountValue(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  const text = String(value || '').trim()
  if (!text) {
    return 0
  }

  const amount = Number.parseFloat(text)
  if (Number.isNaN(amount)) {
    return 0
  }

  return text.includes('万') ? amount * 10000 : amount
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

  const now = new Date()
  const relativeMatch = text.match(/^(今天|明天|昨天)\s*(\d{1,2}):(\d{2})/)
  if (relativeMatch) {
    const relativeMap = {
      今天: 0,
      明天: 1,
      昨天: -1
    }
    const target = new Date(now)
    target.setDate(now.getDate() + relativeMap[relativeMatch[1]])
    target.setHours(Number(relativeMatch[2]), Number(relativeMatch[3]), 0, 0)
    return target
  }

  const monthDayMatch = text.match(/^(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})/)
  if (monthDayMatch) {
    return new Date(
      now.getFullYear(),
      Number(monthDayMatch[1]) - 1,
      Number(monthDayMatch[2]),
      Number(monthDayMatch[3]),
      Number(monthDayMatch[4]),
      0,
      0
    )
  }

  const shortMatch = text.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/)
  if (shortMatch) {
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

function normalizeTextList(values) {
  return Array.isArray(values)
    ? values.map((item) => String(item || '').trim()).filter(Boolean)
    : []
}

function containsKeyword(value, keyword) {
  return String(value || '').toLowerCase().includes(String(keyword || '').toLowerCase())
}

function buildHighlightSegments(text, keyword, options = {}) {
  const sourceText = String(text || '').trim()
  const searchKeyword = String(keyword || '').trim()
  const maxLength = Number(options.maxLength || 34)

  if (!sourceText) {
    return []
  }

  if (!searchKeyword) {
    return [
      {
        text: sourceText,
        isHighlight: false
      }
    ]
  }

  const lowerText = sourceText.toLowerCase()
  const lowerKeyword = searchKeyword.toLowerCase()
  const matchIndex = lowerText.indexOf(lowerKeyword)

  if (matchIndex < 0) {
    return [
      {
        text: sourceText,
        isHighlight: false
      }
    ]
  }

  const safeLength = Math.max(maxLength, searchKeyword.length + 6)
  let start = Math.max(0, matchIndex - Math.floor((safeLength - searchKeyword.length) / 2))
  let end = Math.min(sourceText.length, start + safeLength)

  if (end - start < safeLength) {
    start = Math.max(0, end - safeLength)
  }

  const prefix = sourceText.slice(start, matchIndex)
  const matchText = sourceText.slice(matchIndex, matchIndex + searchKeyword.length)
  const suffix = sourceText.slice(matchIndex + searchKeyword.length, end)
  const segments = []

  if (start > 0) {
    segments.push({
      text: '...',
      isHighlight: false
    })
  }

  if (prefix) {
    segments.push({
      text: prefix,
      isHighlight: false
    })
  }

  segments.push({
    text: matchText,
    isHighlight: true
  })

  if (suffix) {
    segments.push({
      text: suffix,
      isHighlight: false
    })
  }

  if (end < sourceText.length) {
    segments.push({
      text: '...',
      isHighlight: false
    })
  }

  return segments
}

function buildSearchTargets(project) {
  const targets = []
  const contactNames = Array.isArray(project.contactNames) ? project.contactNames : []

  targets.push({
    label: '项目名称',
    value: project.name,
    detail: '',
    priority: 1
  })
  targets.push({
    label: '客户名称',
    value: project.client,
    detail: '',
    priority: 2
  })

  contactNames.forEach((contactName) => {
    targets.push({
      label: '联系人',
      value: contactName,
      detail: contactName,
      priority: 3
    })
  })

  if (project.nextTaskTitle) {
    targets.push({
      label: '待办任务',
      value: project.nextTaskTitle,
      detail: project.nextTaskTitle,
      priority: 4
    })
  }

  if (project.latestSummary) {
    targets.push({
      label: '跟进摘要',
      value: project.latestSummary,
      detail: '',
      priority: 5
    })
  }

  if (project.description) {
    targets.push({
      label: '项目描述',
      value: project.description,
      detail: '',
      priority: 6
    })
  }

  if (project.tagsText) {
    targets.push({
      label: '标签',
      value: project.tagsText,
      detail: '',
      priority: 7
    })
  }

  if (project.ownerLabel) {
    targets.push({
      label: '项目归属',
      value: project.ownerLabel,
      detail: project.ownerLabel,
      priority: 8
    })
  }

  if (project.focusText) {
    targets.push({
      label: '当前重点',
      value: project.focusText,
      detail: '',
      priority: 9
    })
  }

  if (project.stage) {
    targets.push({
      label: '项目阶段',
      value: project.stage,
      detail: '',
      priority: 10
    })
  }

  return targets
}

function buildSearchExplain(project, keyword) {
  const searchKeyword = String(keyword || '').trim()
  if (!searchKeyword) {
    return null
  }

  const targets = buildSearchTargets(project)
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index]
    const value = String(target.value || '').trim()
    if (!value || !containsKeyword(value, searchKeyword)) {
      continue
    }

    return {
      label: target.label,
      detail: String(target.detail || '').trim(),
      detailText: String(target.detail || '').trim() ? ` · ${String(target.detail || '').trim()}` : '',
      snippetSegments: buildHighlightSegments(value, searchKeyword),
      priority: Number(target.priority || 99),
      matchIndex: value.toLowerCase().indexOf(searchKeyword.toLowerCase())
    }
  }

  return null
}

function buildResultSummaryText({ count, total, stageFilter, quickFilter, sortMode, keyword }) {
  const parts = [`共 ${count} 个结果 / ${total} 个项目`]
  const activeQuickFilter = QUICK_FILTERS.find((item) => item.key === quickFilter)
  const currentSort = SORT_OPTIONS.find((item) => item.key === sortMode)

  if (keyword) {
    parts.push(`搜索“${keyword}”`)
  }

  if (stageFilter !== '全部阶段') {
    parts.push(`阶段：${stageFilter}`)
  }

  if (activeQuickFilter && activeQuickFilter.key !== 'all') {
    parts.push(`筛选：${activeQuickFilter.label}`)
  }

  if (currentSort) {
    parts.push(`排序：${currentSort.label}`)
  }

  return parts.join(' · ')
}

function getStageFocus(stage, ownerType) {
  if (ownerType === 'shared_in') {
    return '接手后先确认共享历史，再继续推进'
  }

  const focusMap = {
    线索: '先确认客户背景、真实需求和决策链路',
    洽谈: '把需求边界和关键联系人补完整',
    方案: '推动方案确认，准备商务前置条件',
    商务: '围绕报价、合同条款和预算拍板推进',
    成交: '跟进回款、交付与复盘沉淀',
    流失: '沉淀流失原因，保留后续再激活机会'
  }

  return focusMap[stage] || '围绕当前阶段继续推进关键动作'
}

function getPrimaryTaskStatusMeta(project, nextTaskDate, today) {
  const hasOpenTask = Number(project.openTaskCount || 0) > 0
  if (!hasOpenTask) {
    const nextFollowDate = parseDateTime(project.nextFollowUpAt || project.nextFollowUpDate || project.next)
    if (project.dueStatus === 'overdue') {
      return {
        text: '优先处理',
        badgeClass: 'is-danger'
      }
    }

    if (project.dueStatus === 'today') {
      return {
        text: '今天处理',
        badgeClass: 'is-brand'
      }
    }

    if (nextFollowDate && Math.round((startOfDay(nextFollowDate).getTime() - today.getTime()) / 86400000) === 1) {
      return {
        text: '提前准备',
        badgeClass: 'is-soft'
      }
    }

    return {
      text: project.dueStatus === 'closed'
        ? (project.stage === '成交' ? '已成交' : '已流失')
        : '待处理',
      badgeClass: project.dueStatus === 'closed'
        ? (project.stage === '成交' ? 'is-success' : '')
        : ''
    }
  }

  if (Number(project.overdueTaskCount || 0) > 0) {
    return {
      text: '优先处理',
      badgeClass: 'is-danger'
    }
  }

  if (nextTaskDate && startOfDay(nextTaskDate).getTime() === today.getTime()) {
    return {
      text: '今天处理',
      badgeClass: 'is-brand'
    }
  }

  if (nextTaskDate && Math.round((startOfDay(nextTaskDate).getTime() - today.getTime()) / 86400000) === 1) {
    return {
      text: '提前准备',
      badgeClass: 'is-soft'
    }
  }

  return {
    text: '待处理',
    badgeClass: ''
  }
}

function normalizeProject(project, index) {
  const nextDate = parseDateTime(project.nextFollowUpAt || project.nextFollowUpDate || project.next)
  const nextTaskDate = parseDateTime(project.nextTaskDueAt)
  const updatedAt = parseDateTime(project.updatedAtRaw || project.updatedAt || project.latest)
  const contactNames = normalizeTextList(project.contactNames)
  const tagNames = normalizeTextList(project.tags)
  const openTaskTypes = normalizeTextList(project.openTaskTypes)
  const stage = project.stage || '线索'
  const isClosed = stage === '成交' || stage === '流失'
  const today = startOfDay()
  const nextDiff = nextDate ? Math.round((startOfDay(nextDate).getTime() - today.getTime()) / 86400000) : null

  let dueStatus = isClosed ? 'closed' : (project.nextStatus || '')
  let dueStatusText = project.nextStatusText || ''
  if (!dueStatus) {
    if (isClosed) {
      dueStatus = 'closed'
      dueStatusText = stage === '成交' ? '已成交' : '已流失'
    } else if (!nextDate) {
      dueStatus = 'unplanned'
      dueStatusText = '待安排'
    } else if (nextDiff < 0) {
      dueStatus = 'overdue'
      dueStatusText = '已逾期'
    } else if (nextDiff === 0) {
      dueStatus = 'today'
      dueStatusText = '今天跟进'
    } else {
      dueStatus = 'upcoming'
      dueStatusText = '待跟进'
    }
  }

  const ownerType = project.ownerType || (project.tag === '外发给我' ? 'shared_in' : 'owned')
  const primaryTaskStatus = getPrimaryTaskStatusMeta(project, nextTaskDate, today)
  const contactCount = Number(project.contactCount || contactNames.length || 0)
  const amountValue = Number(project.amountValue || parseAmountValue(project.amount))
  const latestSummary = String(project.latestSummary || '暂无跟进摘要').trim()
  const description = String(project.description || '').trim()
  const nextTaskTitle = String(project.nextTaskTitle || '').trim()
  const hasQuoteTask = openTaskTypes.includes('send_quote') || containsKeyword(nextTaskTitle, '报价')
  const hasCallbackTask = openTaskTypes.includes('callback') || containsKeyword(nextTaskTitle, '回访')
  const isTodayFollowUp = dueStatus === 'today'
  const isOverdueFollowUp = dueStatus === 'overdue'
  return {
    id: project.id || `project-${index}`,
    name: project.name || '未命名项目',
    client: project.client || '未填写客户',
    stage,
    isClosed,
    canMarkDeal: !isClosed,
    dealStatusText: stage === '成交' ? '已成交' : (stage === '流失' ? '已流失' : '登记成交'),
    nextDisplay: project.next || '暂无下次跟进',
    amount: project.amount || '0',
    amountValue,
    commission: project.commission || '0',
    commissionValue: Number(project.commissionValue || parseAmountValue(project.commission)),
    latest: project.latest || '最近更新',
    updatedAt,
    progress: Number(project.progress || 0),
    tag: project.tag || (ownerType === 'shared_in' ? '外发给我' : '我创建'),
    ownerType,
    ownerLabel: project.ownerLabel || (ownerType === 'shared_in'
      ? `${project.sharedFromName || '分享方'} 外发给我`
      : '我负责推进'),
    ownerBadgeClass: ownerType === 'shared_in' ? 'is-brand' : '',
    dueStatus,
    dueStatusText,
    dueBadgeClass: dueStatus === 'overdue'
      ? 'is-danger'
      : (dueStatus === 'today'
        ? 'is-brand'
        : (dueStatus === 'closed' && stage === '成交' ? 'is-success' : '')),
    nextDate,
    nextSortWeight: dueStatus === 'closed'
      ? Number.MAX_SAFE_INTEGER - 1
      : ((nextTaskDate || nextDate) ? (nextTaskDate || nextDate).getTime() : Number.MAX_SAFE_INTEGER),
    contactNames,
    contactCount,
    contactText: contactCount
      ? `${contactCount} 位`
      : '暂无',
    contactSummary: contactNames.length ? contactNames.join(' / ') : '',
    tags: tagNames,
    tagsText: tagNames.join(' / '),
    focusText: project.focusText || getStageFocus(stage, ownerType),
    latestSummary,
    description,
    openTaskTypes,
    openTaskCount: Number(project.openTaskCount || 0),
    overdueTaskCount: Number(project.overdueTaskCount || 0),
    hasOpenTask: Number(project.openTaskCount || 0) > 0,
    hasOverdueTask: Number(project.overdueTaskCount || 0) > 0,
    hasQuoteTask,
    hasCallbackTask,
    isHighValue: amountValue >= HIGH_VALUE_THRESHOLD,
    isTodayFollowUp,
    isOverdueFollowUp,
    hasTodayTask: !!nextTaskDate && startOfDay(nextTaskDate).getTime() === today.getTime(),
    primaryTaskStatusText: primaryTaskStatus.text,
    primaryTaskStatusBadgeClass: primaryTaskStatus.badgeClass,
    nextTaskId: String(project.nextTaskId || '').trim(),
    nextTaskTitle,
    nextTaskDueText: String(project.nextTaskDueText || '').trim(),
    taskSummaryText: String(project.nextTaskDueText || '').trim()
      ? `截止 ${String(project.nextTaskDueText || '').trim()}`
      : '暂无截止时间',
    primaryTaskSortWeight: Number(project.openTaskCount || 0)
      ? ((nextTaskDate ? nextTaskDate.getTime() : Number.MAX_SAFE_INTEGER) - (Number(project.overdueTaskCount || 0) ? 86400000 : 0))
      : Number.MAX_SAFE_INTEGER,
    taskActionText: Number(project.openTaskCount || 0) ? '完成动作' : '新增跟进',
    searchText: [
      project.name,
      project.client,
      project.stage,
      description,
      latestSummary,
      nextTaskTitle,
      project.nextTaskDueText,
      project.ownerLabel,
      project.tag,
      project.sharedFromName,
      contactNames.join(' '),
      tagNames.join(' '),
      openTaskTypes.join(' '),
      project.focusText,
      primaryTaskStatus.text
    ].join(' ').toLowerCase()
  }
}

Page({
  data: {
    appearancePageClass: '',
    searchKeyword: '',
    quickFilter: 'all',
    sortMode: 'updated',
    stageFilter: '全部阶段',
    stages: STAGES,
    sortOptions: SORT_OPTIONS,
    projectCards: [],
    filteredProjects: [],
    summaryCards: [],
    resultSummaryText: '正在整理项目数据',
    emptyTitle: '当前筛选下暂无项目',
    emptyDesc: '你可以切回全部项目，或直接新建项目。',
    emptyActionText: '新建项目',
    entryContextText: '',
    nextTaskTemplates: [
      { type: 'send_solution', label: '待发方案' },
      { type: 'send_quote', label: '待报价' },
      { type: 'callback', label: '待回访' },
      { type: 'meeting', label: '待约会面' },
      { type: 'contract', label: '待签约' },
      { type: 'other', label: '其他动作' }
    ],
    showTaskCompleteSheet: false,
    taskCompletionTaskId: '',
    taskCompletionTaskTitle: '',
    taskCompletionText: '',
    taskCompletionCreateNextTask: false,
    taskCompletionNextTaskTitle: '',
    taskCompletionNextTaskType: 'callback',
    taskCompletionNextTaskDate: '',
    taskCompletionNextTaskTime: '',
    taskCompletionNextTaskDescription: '',
    taskCompletionKeyboardHeight: 0,
    taskCompletionCursorSpacing: 120,
    taskCompleteSheetStyle: '',
    taskCompleteBodyStyle: '',
    taskCompleteActionsStyle: '',
    isTaskCompletionEditing: false,
    taskFeedback: {
      title: '',
      detail: ''
    },
    taskActionId: '',
    isLoading: true,
    isLoadFailed: false,
    loadError: '',
    dataSource: 'Mock Demo'
  },

  async onLoad(options) {
    syncPageAppearance(this)
    const quickFilter = normalizeQuickFilter(options && options.quickFilter)
    const sortMode = normalizeSortMode(options && options.sortMode)
    const stageFilter = normalizeStageFilter(options && options.stageFilter ? decodeURIComponent(options.stageFilter) : '全部阶段')
    this.setData({
      quickFilter,
      sortMode,
      stageFilter,
      entryContextText: buildProjectsEntryContext(
        options && options.source,
        quickFilter,
        stageFilter
      )
    })

    this.initTaskCompletionKeyboard()
    await this.fetchProjects()
  },

  async onShow() {
    syncPageAppearance(this)
    this.initTaskCompletionKeyboard()
    if (!this.data.isLoading) {
      await this.fetchProjects()
    }
  },

  onHide() {
    this.clearTaskFeedbackTimer()
    this.destroyTaskCompletionKeyboard()
  },

  onUnload() {
    this.clearTaskFeedbackTimer()
    this.destroyTaskCompletionKeyboard()
  },

  clearTaskFeedbackTimer() {
    if (this.taskFeedbackTimer) {
      clearTimeout(this.taskFeedbackTimer)
      this.taskFeedbackTimer = null
    }
  },

  showTaskFeedback(feedback) {
    const nextFeedback = feedback && feedback.title
      ? feedback
      : {
          title: '',
          detail: ''
        }

    this.clearTaskFeedbackTimer()
    this.setData({
      taskFeedback: nextFeedback
    })

    if (nextFeedback.title) {
      this.taskFeedbackTimer = setTimeout(() => {
        this.setData({
          taskFeedback: {
            title: '',
            detail: ''
          }
        })
        this.taskFeedbackTimer = null
      }, 5000)
    }
  },

  dismissTaskFeedback() {
    this.clearTaskFeedbackTimer()
    this.setData({
      taskFeedback: {
        title: '',
        detail: ''
      }
    })
  },

  async fetchProjects() {
    this.setData({
      isLoading: true,
      isLoadFailed: false,
      loadError: ''
    })

    try {
      const { data, source } = await loadProjectsData()
      const projectCards = (Array.isArray(data) ? data : []).map(normalizeProject)
      this.setData(
        {
          projectCards,
          isLoading: false,
          dataSource: source
        },
        () => this.applyFilters()
      )
    } catch (error) {
      const message = error && error.message ? error.message : '当前无法同步云端数据，请稍后重试'
      this.setData({
        projectCards: [],
        filteredProjects: [],
        summaryCards: [],
        resultSummaryText: '当前无法同步项目数据',
        emptyTitle: '当前无法同步项目数据',
        emptyDesc: '请检查网络或云环境连接后重新加载。',
        emptyActionText: '新建项目',
        isLoading: false,
        isLoadFailed: true,
        loadError: message
      })
      wx.showToast({
        title: '当前无法同步项目数据',
        icon: 'none'
      })
    }
  },

  retryFetch() {
    this.fetchProjects()
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

  setSortMode(event) {
    const sortMode = event.currentTarget.dataset.sort
    this.setData({
      sortMode
    }, () => this.applyFilters())
  },

  setStage(event) {
    const stageFilter = event.currentTarget.dataset.stage
    this.setData({
      stageFilter
    }, () => this.applyFilters())
  },

  applyFilters() {
    const rawKeyword = String(this.data.searchKeyword || '').trim()
    const keyword = rawKeyword.toLowerCase()
    const stageFilter = this.data.stageFilter
    const quickFilter = this.data.quickFilter
    const sortMode = this.data.sortMode

    const allProjects = this.data.projectCards.slice()
    const filteredProjects = allProjects
      .filter((project) => (stageFilter === '全部阶段' ? true : project.stage === stageFilter))
      .filter((project) => {
        if (quickFilter === 'today') {
          return project.hasTodayTask || project.isTodayFollowUp
        }

        if (quickFilter === 'overdue') {
          return project.hasOverdueTask || project.isOverdueFollowUp
        }

        if (quickFilter === 'task_open') {
          return project.hasOpenTask
        }

        if (quickFilter === 'no_task') {
          return !project.isClosed && !project.hasOpenTask
        }

        if (quickFilter === 'quote') {
          return project.hasQuoteTask
        }

        if (quickFilter === 'callback') {
          return project.hasCallbackTask
        }

        if (quickFilter === 'high_value') {
          return project.isHighValue
        }

        if (quickFilter === 'shared') {
          return project.ownerType === 'shared_in'
        }

        return true
      })
      .map((project) => {
        const searchExplain = keyword ? buildSearchExplain(project, rawKeyword) : null
        return {
          ...project,
          searchExplain
        }
      })
      .filter((project) => (keyword ? !!project.searchExplain : true))
      .sort((left, right) => {
        if (keyword) {
          const leftPriority = left.searchExplain ? left.searchExplain.priority : Number.MAX_SAFE_INTEGER
          const rightPriority = right.searchExplain ? right.searchExplain.priority : Number.MAX_SAFE_INTEGER
          if (leftPriority !== rightPriority) {
            return leftPriority - rightPriority
          }

          const leftMatchIndex = left.searchExplain ? left.searchExplain.matchIndex : Number.MAX_SAFE_INTEGER
          const rightMatchIndex = right.searchExplain ? right.searchExplain.matchIndex : Number.MAX_SAFE_INTEGER
          if (leftMatchIndex !== rightMatchIndex) {
            return leftMatchIndex - rightMatchIndex
          }
        }

        if (sortMode === 'amount') {
          return right.amountValue - left.amountValue
        }

        if (sortMode === 'task') {
          if (left.primaryTaskSortWeight !== right.primaryTaskSortWeight) {
            return left.primaryTaskSortWeight - right.primaryTaskSortWeight
          }
          return (right.updatedAt ? right.updatedAt.getTime() : 0) - (left.updatedAt ? left.updatedAt.getTime() : 0)
        }

        return (right.updatedAt ? right.updatedAt.getTime() : 0) - (left.updatedAt ? left.updatedAt.getTime() : 0)
      })

    const totalCount = allProjects.length
    const activeCount = allProjects.filter((project) => !project.isClosed).length
    const dealCount = allProjects.filter((project) => project.stage === '成交').length
    const summaryCards = [
      { label: '全部项目', value: String(totalCount), note: '当前项目池' },
      { label: '待推进', value: String(activeCount), note: '仍在持续跟进' },
      { label: '已成交', value: String(dealCount), note: '已完成签约' }
    ]

    const hasCustomFilter = Boolean(keyword) || quickFilter !== 'all' || stageFilter !== '全部阶段'
    const emptyTitle = keyword
      ? '没有找到匹配项目'
      : (quickFilter === 'overdue'
        ? '暂无优先处理项目'
        : '当前筛选下暂无项目')
    const emptyDesc = keyword
      ? '可以换项目名、客户名、联系人、摘要关键词或任务关键词再试一次。'
      : (quickFilter === 'overdue'
        ? '当前没有逾期项目，可切回全部项目继续查看。'
        : '你可以调整筛选条件，或直接新建项目。')

    this.setData({
      filteredProjects,
      summaryCards,
      resultSummaryText: buildResultSummaryText({
        count: filteredProjects.length,
        total: totalCount,
        stageFilter,
        quickFilter,
        sortMode,
        keyword: rawKeyword
      }),
      emptyTitle,
      emptyDesc,
      emptyActionText: hasCustomFilter ? '重置筛选' : '新建项目'
    })
  },

  resetFilters() {
    this.setData({
      searchKeyword: '',
      quickFilter: 'all',
      stageFilter: '全部阶段',
      sortMode: 'task'
    }, () => this.applyFilters())
  },

  handleEmptyAction() {
    if (this.data.emptyActionText === '重置筛选') {
      this.resetFilters()
      return
    }

    this.openProjectForm()
  },

  openProjectForm() {
    wx.navigateTo({
      url: '/pages/project-form/project-form'
    })
  },

  openProjectDetail(event) {
    const { projectId } = event.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/project-detail/project-detail?projectId=${projectId}&view=projects`
    })
  },

  openFollowUp(event) {
    const { projectId } = event.currentTarget.dataset
    if (!projectId) {
      return
    }

    wx.navigateTo({
      url: `/pages/follow-up/follow-up?projectId=${projectId}&entry=projects`
    })
  },

  openTaskPrimaryAction(event) {
    const { taskId, projectId, hasTask } = event.currentTarget.dataset
    const hasOpenTask = hasTask === true || hasTask === 'true'

    if (hasOpenTask) {
      if (!taskId) {
        wx.showToast({
          title: '任务数据未同步，请重新上传 listProjects',
          icon: 'none'
        })
        return
      }

      this.openTaskCompleteSheet({
        currentTarget: {
          dataset: {
            taskId
          }
        }
      })
      return
    }

    this.openFollowUp({
      currentTarget: {
        dataset: {
          projectId
        }
      }
    })
  },

  buildDefaultNextTaskDraft() {
    const base = new Date()
    base.setDate(base.getDate() + 1)
    base.setHours(10, 0, 0, 0)

    return {
      dueDate: `${base.getFullYear()}-${`${base.getMonth() + 1}`.padStart(2, '0')}-${`${base.getDate()}`.padStart(2, '0')}`,
      dueTime: `${`${base.getHours()}`.padStart(2, '0')}:${`${base.getMinutes()}`.padStart(2, '0')}`
    }
  },

  openTaskCompleteSheet(event) {
    const { taskId } = event.currentTarget.dataset
    if (!taskId || this.data.taskActionId) {
      return
    }

    const currentProject = (this.data.filteredProjects || []).find((item) => item.nextTaskId === taskId)
    if (!currentProject) {
      return
    }

    const defaultNextTaskDraft = this.buildDefaultNextTaskDraft()
    this.setData({
      showTaskCompleteSheet: true,
      taskCompletionTaskId: taskId,
      taskCompletionTaskTitle: currentProject.nextTaskTitle || '当前动作',
      taskCompletionText: '',
      taskCompletionCreateNextTask: false,
      taskCompletionNextTaskTitle: '',
      taskCompletionNextTaskType: 'callback',
      taskCompletionNextTaskDate: defaultNextTaskDraft.dueDate,
      taskCompletionNextTaskTime: defaultNextTaskDraft.dueTime,
      taskCompletionNextTaskDescription: ''
    })
    this.syncTaskCompletionLayout(0, false)
  },

  closeTaskCompleteSheet(force = false) {
    if (!force && this.data.taskActionId) {
      return
    }

    this.setData({
      showTaskCompleteSheet: false,
      taskCompletionTaskId: '',
      taskCompletionTaskTitle: '',
      taskCompletionText: '',
      taskCompletionCreateNextTask: false,
      taskCompletionNextTaskTitle: '',
      taskCompletionNextTaskType: 'callback',
      taskCompletionNextTaskDate: '',
      taskCompletionNextTaskTime: '',
      taskCompletionNextTaskDescription: ''
    })
    this.syncTaskCompletionLayout(0, false)
  },

  onTaskCompletionInput(event) {
    this.setData({
      taskCompletionText: String(event.detail.value || '')
    })
  },

  toggleTaskCompletionCreateNextTask() {
    this.setData({
      taskCompletionCreateNextTask: !this.data.taskCompletionCreateNextTask
    })
  },

  onTaskCompletionNextTaskInput(event) {
    const field = event.currentTarget.dataset.field
    if (!field) {
      return
    }

    this.setData({
      [field]: String(event.detail.value || '')
    })
  },

  onTaskCompletionNextTaskPicker(event) {
    const field = event.currentTarget.dataset.field
    if (!field) {
      return
    }

    this.setData({
      [field]: String(event.detail.value || '')
    })
  },

  setTaskCompletionNextTaskType(event) {
    const { type } = event.currentTarget.dataset
    if (!type) {
      return
    }

    this.setData({
      taskCompletionNextTaskType: type
    })
  },

  initTaskCompletionKeyboard() {
    if (typeof wx === 'undefined' || typeof wx.onKeyboardHeightChange !== 'function') {
      return
    }

    if (this.taskCompletionKeyboardHandler) {
      return
    }

    this.taskCompletionKeyboardHandler = (result) => {
      if (!this.data.showTaskCompleteSheet) {
        return
      }

      const height = Math.max(Number(result && result.height || 0), 0)
      if (height > 0) {
        this.syncTaskCompletionLayout(height, true)
        return
      }

      this.syncTaskCompletionLayout(0, false)
    }

    wx.onKeyboardHeightChange(this.taskCompletionKeyboardHandler)
  },

  destroyTaskCompletionKeyboard() {
    if (!this.taskCompletionKeyboardHandler || typeof wx === 'undefined' || typeof wx.offKeyboardHeightChange !== 'function') {
      return
    }

    wx.offKeyboardHeightChange(this.taskCompletionKeyboardHandler)
    this.taskCompletionKeyboardHandler = null
  },

  syncTaskCompletionLayout(height = 0, isEditing = false) {
    const keyboardHeight = Math.max(Number(height || 0), 0)
    const cursorSpacing = keyboardHeight ? Math.min(Math.max(keyboardHeight - 24, 120), 320) : 120
    const sheetStyle = keyboardHeight
      ? `top: 18vh; padding-bottom: calc(${keyboardHeight}px + env(safe-area-inset-bottom));`
      : ''
    const bodyStyle = keyboardHeight
      ? `padding-bottom: ${keyboardHeight + 188}px;`
      : ''
    const actionsStyle = keyboardHeight
      ? `margin-bottom: calc(${keyboardHeight}px + env(safe-area-inset-bottom));`
      : ''

    this.setData({
      taskCompletionKeyboardHeight: keyboardHeight,
      taskCompletionCursorSpacing: cursorSpacing,
      taskCompleteSheetStyle: sheetStyle,
      taskCompleteBodyStyle: bodyStyle,
      taskCompleteActionsStyle: actionsStyle,
      isTaskCompletionEditing: !!isEditing
    })
  },

  onTaskCompletionFieldFocus() {
    this.syncTaskCompletionLayout(this.data.taskCompletionKeyboardHeight, true)
  },

  async submitTaskCompletion() {
    const taskId = String(this.data.taskCompletionTaskId || '').trim()
    const resultSummary = String(this.data.taskCompletionText || '').trim()
    const shouldCreateNextTask = !!this.data.taskCompletionCreateNextTask
    const nextTaskTitle = String(this.data.taskCompletionNextTaskTitle || '').trim()
    const nextTaskDate = String(this.data.taskCompletionNextTaskDate || '').trim()
    const nextTaskTime = String(this.data.taskCompletionNextTaskTime || '').trim()
    const nextTaskDescription = String(this.data.taskCompletionNextTaskDescription || '').trim()

    if (!taskId || this.data.taskActionId) {
      return
    }

    if (!resultSummary) {
      wx.showToast({
        title: '请先填写完成情况',
        icon: 'none'
      })
      return
    }

    if (shouldCreateNextTask) {
      if (!nextTaskTitle) {
        wx.showToast({
          title: '请填写下一步动作标题',
          icon: 'none'
        })
        return
      }

      if (!nextTaskDate || !nextTaskTime) {
        wx.showToast({
          title: '请填写下一步动作时间',
          icon: 'none'
        })
        return
      }
    }

    this.setData({
      taskActionId: taskId
    })

    try {
      const feedback = buildTaskCompletionFeedback({
        shouldCreateNextTask,
        nextTaskTitle
      })
      const nextTask = shouldCreateNextTask
        ? {
            title: nextTaskTitle,
            type: this.data.taskCompletionNextTaskType || 'other',
            priority: 'normal',
            dueDate: nextTaskDate,
            dueTime: nextTaskTime,
            description: nextTaskDescription
          }
        : null

      const result = await updateTaskStatusData({
        taskId,
        status: 'done',
        resultSummary,
        nextTask
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '动作完成失败')
      }

      wx.showToast({
        title: getTaskCompletionToastTitle(shouldCreateNextTask),
        icon: 'success'
      })

      touchNotificationSync('task_completed')
      this.closeTaskCompleteSheet(true)
      await this.fetchProjects()
      this.showTaskFeedback(feedback)
    } catch (error) {
      wx.showToast({
        title: error.message || '动作完成失败',
        icon: 'none'
      })
    } finally {
      this.setData({
        taskActionId: ''
      })
    }
  },

  openDealPage(event) {
    const { projectId, stage } = event.currentTarget.dataset
    if (!projectId) {
      return
    }

    if (stage === '成交' || stage === '流失') {
      return
    }

    wx.navigateTo({
      url: `/pages/mark-deal/mark-deal?projectId=${projectId}`
    })
  },

  noop() {},

  openPage(event) {
    const { url } = event.currentTarget.dataset
    wx.navigateTo({ url })
  }
})
