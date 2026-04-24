const {
  loadHomeData,
  loadProjectsData,
  saveProjectData,
  saveFollowUpData,
  reportSystemFailureData,
  loadNotificationsData,
  updateTaskStatusData,
  markNotificationReadData,
  resolveNotificationData
} = require('../../services/data')
const { buildTaskCompletionFeedback, getTaskCompletionToastTitle } = require('../../services/task-feedback')
const { appendQueryParams } = require('../../utils/navigation-context')
const { getNotificationPrimaryActionLabel } = require('../../utils/notification-meta')
const { getNotificationSyncVersion, touchNotificationSync } = require('../../utils/notification-sync')
const { syncPageAppearance } = require('../../utils/appearance')

const NEXT_TASK_TEMPLATES = [
  { type: 'send_solution', label: '待发方案' },
  { type: 'send_quote', label: '待报价' },
  { type: 'callback', label: '待回访' },
  { type: 'meeting', label: '待约会面' },
  { type: 'contract', label: '待签约' },
  { type: 'other', label: '其他动作' }
]

const QUICK_ENTRY_MODES = [
  {
    key: 'follow_up',
    label: '记跟进',
    desc: '快速记下刚发生的推进信息。'
  },
  {
    key: 'task',
    label: '补任务',
    desc: '顺手补一条动作，首页会自动跟进。'
  },
  {
    key: 'project',
    label: '新建项目',
    desc: '先把项目放进系统，后续再补细节。'
  }
]

const QUICK_ENTRY_STAGES = ['线索', '洽谈', '方案', '商务', '成交', '流失']
const QUICK_ENTRY_METHODS = ['电话', '微信', '邮件', '面谈', '其他']
const QUICK_ENTRY_DRAFT_STORAGE_KEY = 'homeQuickEntryDraftsV1'
const QUICK_ENTRY_DRAFT_TTL = 6 * 60 * 60 * 1000
const QUICK_ENTRY_PROJECT_STOP_WORDS = [
  '有限责任公司',
  '股份有限公司',
  '有限公司',
  '公司',
  '集团',
  '科技',
  '技术',
  '信息',
  '项目',
  '计划',
  '系统',
  '平台',
  '升级',
  '改造',
  '建设',
  '方案',
  '客户',
  '联系',
  '联系人'
]

function normalizeText(value) {
  return String(value || '').trim()
}

function padNumber(value) {
  return `${value}`.padStart(2, '0')
}

function formatDateInput(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`
}

function formatTimeInput(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`
}

function buildDefaultNextTaskDraft() {
  const base = new Date()
  base.setDate(base.getDate() + 1)
  base.setHours(10, 0, 0, 0)

  return {
    dueDate: formatDateInput(base),
    dueTime: formatTimeInput(base)
  }
}

function buildQuickEntryForm() {
  const now = new Date()
  const next = new Date(now)
  next.setDate(next.getDate() + 1)
  next.setHours(10, 0, 0, 0)

  return {
    projectName: '',
    clientName: '',
    stage: '线索',
    followUpContent: '',
    followUpDate: formatDateInput(now),
    followUpClock: formatTimeInput(now),
    followUpMethod: '面谈',
    taskContext: '',
    taskTitle: '',
    taskType: 'callback',
    taskDueDate: formatDateInput(next),
    taskDueTime: formatTimeInput(next),
    taskDescription: ''
  }
}

function cloneQuickEntryForm(form = {}) {
  return Object.assign(buildQuickEntryForm(), form || {})
}

function buildQuickEntryEmptyState(mode, projects = []) {
  const form = buildQuickEntryForm()
  const projectViews = buildQuickEntryProjectViews(projects, '')
  return {
    quickEntryMode: mode,
    quickEntryModeTitle: getQuickEntryModeMeta(mode).label,
    quickEntryModeDesc: getQuickEntryModeMeta(mode).desc,
    quickEntryShowProjectSearch: false,
    quickEntryProjectKeyword: '',
    quickEntrySuggestedProjects: projectViews.suggestedProjects,
    quickEntryVisibleProjects: projectViews.visibleProjects,
    quickEntryProjectSelectionMode: '',
    quickEntrySelectedProjectId: '',
    quickEntrySelectedProjectName: '未关联项目',
    quickEntrySelectedProjectMeta: null,
    quickEntryForm: form
  }
}

function buildQuickEntrySuccessState(payload = {}) {
  return {
    visible: !!payload.visible,
    mode: normalizeText(payload.mode) || 'follow_up',
    title: normalizeText(payload.title) || '已保存',
    detail: normalizeText(payload.detail),
    projectId: normalizeText(payload.projectId),
    projectName: normalizeText(payload.projectName),
    continueProjectId: normalizeText(payload.continueProjectId),
    continueProjectName: normalizeText(payload.continueProjectName)
  }
}

function normalizeProjectOption(item, index) {
  const name = normalizeText(item && item.name) || '未命名项目'
  const client = normalizeText(item && item.client) || '未填写客户'
  const stage = normalizeText(item && item.stage) || '线索'
  const latestSummary = normalizeText(item && item.latestSummary)
  const focusText = normalizeText(item && item.focusText)
  const nextText = normalizeText(item && item.next)
  const contactNames = Array.isArray(item && item.contactNames) ? item.contactNames : []
  const contactText = contactNames.length ? contactNames.join(' / ') : ''

  return {
    id: normalizeText(item && item.id) || `project-${index}`,
    name,
    client,
    stage,
    latestSummary,
    focusText,
    nextText,
    contactText,
    searchText: [
      name,
      client,
      stage,
      latestSummary,
      focusText,
      nextText,
      contactText
    ].join(' ').toLowerCase()
  }
}

function filterQuickEntryProjects(projects, keyword) {
  const list = Array.isArray(projects) ? projects : []
  const currentKeyword = normalizeText(keyword).toLowerCase()

  if (!currentKeyword) {
    return list.slice(0, 8)
  }

  return list.filter((item) => item.searchText.includes(currentKeyword)).slice(0, 8)
}

function moveQuickEntryProjectToFront(projects, projectId) {
  const list = Array.isArray(projects) ? projects.slice() : []
  const currentId = normalizeText(projectId)
  if (!currentId) {
    return list
  }

  const targetIndex = list.findIndex((item) => item.id === currentId)
  if (targetIndex <= 0) {
    return list
  }

  const target = list[targetIndex]
  list.splice(targetIndex, 1)
  list.unshift(target)
  return list
}

function buildQuickEntryProjectViews(projects, keyword, preferredProjectId = '') {
  const list = moveQuickEntryProjectToFront(projects, preferredProjectId)
  return {
    suggestedProjects: list.slice(0, 4),
    visibleProjects: filterQuickEntryProjects(list, keyword)
  }
}

function findQuickEntryProject(projects, projectId) {
  const list = Array.isArray(projects) ? projects : []
  const currentId = normalizeText(projectId)
  if (!currentId) {
    return null
  }

  return list.find((item) => item.id === currentId) || null
}

function getQuickEntryProjectLabel(projectMeta) {
  return projectMeta && projectMeta.name ? projectMeta.name : '未关联项目'
}

function replaceAllText(source, searchValue, replaceValue) {
  return String(source || '').split(searchValue).join(replaceValue)
}

function buildQuickEntryCoreText(value) {
  let current = normalizeText(value).toLowerCase()
  if (!current) {
    return ''
  }

  QUICK_ENTRY_PROJECT_STOP_WORDS.forEach((word) => {
    current = replaceAllText(current, word, ' ')
  })

  return current.replace(/\s+/g, ' ').trim()
}

function buildQuickEntryMatchTokens(value) {
  const raw = normalizeText(value).toLowerCase()
  const core = buildQuickEntryCoreText(raw)
  const segments = `${raw} ${core}`
    .split(/[\s,，。；;、\/\-()（）【】\[\]|·:：]+/)
    .map((item) => item.trim())
    .filter((item) => item && item.length >= 2)

  const seen = new Set()
  const result = []

  ;[raw, core].concat(segments).forEach((item) => {
    const current = normalizeText(item)
    if (!current || current.length < 2 || seen.has(current)) {
      return
    }
    seen.add(current)
    result.push(current)
  })

  return result.slice(0, 8)
}

function getQuickEntryRecommendationText(mode, form = {}) {
  if (mode === 'task') {
    return [
      normalizeText(form.taskTitle),
      normalizeText(form.taskContext),
      normalizeText(form.taskDescription)
    ].filter(Boolean).join(' ')
  }

  if (mode === 'follow_up') {
    return normalizeText(form.followUpContent)
  }

  return ''
}

function scoreQuickEntryProject(project, text) {
  const currentText = normalizeText(text).toLowerCase()
  if (!project || !currentText || currentText.length < 2) {
    return 0
  }

  const matchFields = [
    { value: project.name, exact: 18, token: 8 },
    { value: project.client, exact: 14, token: 6 },
    { value: project.contactText, exact: 12, token: 5 }
  ]

  let score = 0

  matchFields.forEach(({ value, exact, token }) => {
    const fieldText = normalizeText(value).toLowerCase()
    if (!fieldText) {
      return
    }

    if (currentText.includes(fieldText)) {
      score += exact
    }

    const coreText = buildQuickEntryCoreText(fieldText)
    if (coreText && coreText !== fieldText && currentText.includes(coreText)) {
      score += token + 3
    }

    buildQuickEntryMatchTokens(fieldText).forEach((matchToken) => {
      if (currentText.includes(matchToken)) {
        score += token + Math.min(Math.max(matchToken.length - 2, 0), 3)
      }
    })
  })

  return score
}

function findQuickEntryRecommendedProject(projects, text) {
  const list = Array.isArray(projects) ? projects : []
  const recommendationText = normalizeText(text)
  if (!recommendationText || recommendationText.length < 2) {
    return null
  }

  const rankedProjects = list
    .map((item) => ({
      project: item,
      score: scoreQuickEntryProject(item, recommendationText)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)

  if (!rankedProjects.length) {
    return null
  }

  const bestMatch = rankedProjects[0]
  const secondMatch = rankedProjects[1]
  if (bestMatch.score < 12) {
    return null
  }

  if (secondMatch && bestMatch.score - secondMatch.score < 4) {
    return null
  }

  return bestMatch.project
}

function shouldPersistQuickEntryDraft(mode, form = {}, selectedProjectId = '') {
  const currentForm = form || {}
  const currentProjectId = normalizeText(selectedProjectId)

  if (mode === 'project') {
    return !!(normalizeText(currentForm.projectName) || normalizeText(currentForm.clientName))
  }

  if (mode === 'task') {
    return !!(
      normalizeText(currentForm.taskTitle) ||
      normalizeText(currentForm.taskContext) ||
      normalizeText(currentForm.taskDescription) ||
      currentProjectId
    )
  }

  return !!(normalizeText(currentForm.followUpContent) || currentProjectId)
}

function getQuickEntryModeMeta(modeKey) {
  return QUICK_ENTRY_MODES.find((item) => item.key === modeKey) || QUICK_ENTRY_MODES[0]
}

function buildProjectListUrl(options = {}) {
  const query = []
  if (options.quickFilter) {
    query.push(`quickFilter=${options.quickFilter}`)
  }
  if (options.sortMode) {
    query.push(`sortMode=${options.sortMode}`)
  }
  if (options.stageFilter) {
    query.push(`stageFilter=${encodeURIComponent(options.stageFilter)}`)
  }
  if (options.source) {
    query.push(`source=${options.source}`)
  }

  return `/pages/projects/projects${query.length ? `?${query.join('&')}` : ''}`
}

function normalizeTodo(item, index) {
  const badge = String(item.badge || '').trim()
  let badgeClass = ''
  if (badge === '已逾期' || badge === '优先处理') {
    badgeClass = 'is-danger'
  } else if (badge === '今日跟进' || badge === '今天处理') {
    badgeClass = 'is-brand'
  } else if (badge === '高优先') {
    badgeClass = 'is-danger'
  } else if (badge === '待确认' || badge === '待推进' || badge === '待处理') {
    badgeClass = 'is-success'
  } else if (badge === '提前准备') {
    badgeClass = 'is-soft'
  }
  return {
    id: item.id || `todo-${index}`,
    projectId: item.projectId || '',
    title: item.title || '未命名项目',
    client: item.client || '未填写客户',
    stage: item.stage || '线索',
    estimatedAmount: item.estimatedAmount || '0',
    contactCount: Number(item.contactCount || 0),
    contactText: Number(item.contactCount || 0) ? `${Number(item.contactCount || 0)} 位` : '暂无',
    ownerLabel: item.ownerLabel || '我负责推进',
    ownerBadgeClass: String(item.ownerLabel || '').includes('外发给我') ? 'is-brand' : '',
    focusText: item.focusText || '当前阶段继续推进关键动作',
    latestSummary: item.latestSummary || '',
    time: item.time || '暂无时间',
    priority: item.priority || '先确认下一步动作',
    priorityText: String(item.priority || '先确认下一步动作').replace(/^优先动作：/, ''),
    steps: Array.isArray(item.steps) ? item.steps : [],
    stepSummary: Array.isArray(item.steps) && item.steps.length ? item.steps[0] : '先确认本次推进目标，再补跟进结果',
    openTaskCount: Number(item.openTaskCount || 0),
    overdueTaskCount: Number(item.overdueTaskCount || 0),
    topTaskTitle: item.topTaskTitle || '',
    topTaskDueText: item.topTaskDueText || '',
    badge,
    badgeClass
  }
}

function normalizeTaskCard(item, index) {
  return {
    id: item.id || `task-${index}`,
    projectId: item.projectId || '',
    title: item.title || '未命名动作',
    projectName: item.projectName || '未命名项目',
    clientName: item.clientName || '未填写客户',
    taskTypeLabel: item.taskTypeLabel || '其他动作',
    priorityLabel: item.priorityLabel || '常规',
    urgencyText: item.urgencyText || '待处理',
    urgencyBadgeClass: item.urgencyBadgeClass || '',
    dueText: item.dueText || '待安排',
    ownerLabel: item.ownerLabel || '我负责推进',
    ownerBadgeClass: item.ownerBadgeClass || '',
    stage: item.stage || '线索',
    amount: item.amount || '0',
    nextFollowUpText: item.nextFollowUpText || '暂无下次跟进',
    focusText: item.focusText || '先完成当前动作，再回填结果。',
    summaryText: item.summaryText || ''
  }
}

function decorateDashboard(data) {
  const todos = (Array.isArray(data.todos) ? data.todos : []).map(normalizeTodo)
  const taskBoard = data && data.taskBoard ? data.taskBoard : {}
  const taskCards = (Array.isArray(taskBoard.cards) ? taskBoard.cards : []).map(normalizeTaskCard)
  const timeline = Array.isArray(data.timeline) ? data.timeline : []
  const metrics = Array.isArray(data.metrics) ? data.metrics : []

  return {
    metrics,
    taskBoard: {
      summary: {
        openCount: Number(taskBoard.summary && taskBoard.summary.openCount || 0),
        overdueCount: Number(taskBoard.summary && taskBoard.summary.overdueCount || 0),
        todayCount: Number(taskBoard.summary && taskBoard.summary.todayCount || 0)
      },
      cards: taskCards
    },
    todos,
    timeline,
    hasContent: metrics.length > 0 || taskCards.length > 0 || todos.length > 0 || timeline.length > 0,
    overdueCount: todos.filter((item) => item.badge === '已逾期' || item.badge === '优先处理').length
  }
}

function shouldAutoResolveNotification(type) {
  const currentType = String(type || '').trim()
  return currentType === 'shared_opened' || currentType === 'shared_imported' || currentType === 'shared_followed'
}

function getNotificationHeadlineAppearance(type) {
  const currentType = String(type || '').trim()

  if (currentType === 'task_overdue' || currentType === 'todo_overdue' || currentType === 'save_failed') {
    return {
      toneClass: currentType === 'save_failed' ? 'is-system' : 'is-danger',
      badgeText: currentType === 'save_failed' ? '异常待处理' : '优先处理'
    }
  }

  if (currentType === 'task_due' || currentType === 'todo_due') {
    return {
      toneClass: 'is-brand',
      badgeText: '今天处理'
    }
  }

  if (currentType === 'task_upcoming' || currentType === 'todo_upcoming') {
    return {
      toneClass: 'is-soft',
      badgeText: '提前准备'
    }
  }

  if (currentType === 'shared_opened' || currentType === 'shared_imported' || currentType === 'shared_followed' || currentType === 'project_taken_over') {
    return {
      toneClass: 'is-soft',
      badgeText: currentType === 'project_taken_over' ? '接手动态' : '外发动态'
    }
  }

  if (currentType === 'ai_failed') {
    return {
      toneClass: 'is-system',
      badgeText: '异常待处理'
    }
  }

  return {
    toneClass: 'is-neutral',
    badgeText: '提醒'
  }
}

function buildNotificationHeadline(notifications, stats) {
  const list = Array.isArray(notifications) ? notifications : []
  const current = list[0] || null

  if (current) {
    const appearance = getNotificationHeadlineAppearance(current.type)
    return {
      id: current.id || '',
      type: current.type || '',
      title: current.title || '优先提醒',
      desc: current.summary || `${current.projectName || '当前项目'} 有新的提醒。`,
      actionText: getNotificationPrimaryActionLabel(current.type, current.actionLabel),
      actionUrl: current.actionUrl || '',
      autoResolve: shouldAutoResolveNotification(current.type),
      toneClass: appearance.toneClass,
      badgeText: appearance.badgeText
    }
  }

  const pendingCount = Number(stats && stats.pendingCount || 0)
  const unreadCount = Number(stats && stats.unreadCount || 0)

  if (pendingCount || unreadCount) {
    return {
      id: '',
      type: '',
      title: '站内提醒',
      desc: `当前有 ${pendingCount} 条待收口消息，待查看 ${unreadCount} 条。`,
      actionText: '打开消息',
      actionUrl: '',
      autoResolve: false,
      toneClass: 'is-neutral',
      badgeText: '待处理'
    }
  }

  return {
    id: '',
    type: '',
    title: '站内提醒',
    desc: '当前提醒都已收口，可以继续按首页任务和跟进节奏推进。',
    actionText: '打开消息',
    actionUrl: '',
    autoResolve: false,
    toneClass: 'is-success',
    badgeText: '已收口'
  }
}

Page({
  data: {
    appearancePageClass: '',
    dashboard: {
      metrics: [],
      taskBoard: {
        summary: {
          openCount: 0,
          overdueCount: 0,
          todayCount: 0
        },
        cards: []
      },
      todos: [],
      timeline: [],
      hasContent: false,
      overdueCount: 0
    },
    notificationUnreadCount: 0,
    notificationPendingCount: 0,
    notificationHeadlineId: '',
    notificationHeadlineType: '',
    notificationHeadlineTitle: '站内提醒',
    notificationHeadlineDesc: '当前提醒都已收口，可以继续按首页任务和跟进节奏推进。',
    notificationHeadlineActionText: '查看',
    notificationHeadlineUrl: '',
    notificationHeadlineAutoResolve: false,
    notificationHeadlineToneClass: 'is-success',
    notificationHeadlineBadgeText: '已收口',
    notificationSyncVersion: 0,
    nextTaskTemplates: NEXT_TASK_TEMPLATES,
    quickEntryModes: QUICK_ENTRY_MODES,
    quickEntryStages: QUICK_ENTRY_STAGES,
    quickEntryMethods: QUICK_ENTRY_METHODS,
    showQuickEntrySheet: false,
    quickEntryMode: 'follow_up',
    quickEntryModeTitle: getQuickEntryModeMeta('follow_up').label,
    quickEntryModeDesc: getQuickEntryModeMeta('follow_up').desc,
    quickEntryProjects: [],
    quickEntrySuggestedProjects: [],
    quickEntryVisibleProjects: [],
    quickEntryShowProjectSearch: false,
    quickEntryProjectKeyword: '',
    quickEntryProjectSelectionMode: '',
    quickEntrySelectedProjectId: '',
    quickEntrySelectedProjectName: '未关联项目',
    quickEntrySelectedProjectMeta: null,
    quickEntrySheetSource: '',
    quickEntryForm: buildQuickEntryForm(),
    quickEntryActionId: '',
    quickEntryKeyboardHeight: 0,
    quickEntryCursorSpacing: 120,
    quickEntrySheetStyle: '',
    quickEntryBodyStyle: '',
    quickEntryActionsStyle: '',
    isQuickEntryEditing: false,
    showQuickEntrySuccessPanel: false,
    quickEntrySuccessState: buildQuickEntrySuccessState(),
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
    this.initTaskCompletionKeyboard()
    this.pendingQuickEntryOpen = String(options && options.openQuickEntry || '').trim() === '1'
    this.setData({
      notificationSyncVersion: getNotificationSyncVersion()
    })
    await this.fetchDashboard()
    if (this.pendingQuickEntryOpen) {
      this.pendingQuickEntryOpen = false
      this.openQuickEntrySheet()
    }
  },

  async onShow() {
    syncPageAppearance(this)
    this.initTaskCompletionKeyboard()
    const currentSyncVersion = getNotificationSyncVersion()
    if (currentSyncVersion !== this.data.notificationSyncVersion) {
      this.setData({
        notificationSyncVersion: currentSyncVersion
      })
    }
    if (!this.data.isLoading) {
      await this.fetchDashboard()
    }
  },

  onHide() {
    this.persistCurrentQuickEntryDraft()
    this.clearTaskFeedbackTimer()
    this.clearQuickEntryDraftTimer()
    this.destroyTaskCompletionKeyboard()
  },

  onUnload() {
    this.persistCurrentQuickEntryDraft()
    this.clearTaskFeedbackTimer()
    this.clearQuickEntryDraftTimer()
    this.destroyTaskCompletionKeyboard()
  },

  clearTaskFeedbackTimer() {
    if (this.taskFeedbackTimer) {
      clearTimeout(this.taskFeedbackTimer)
      this.taskFeedbackTimer = null
    }
  },

  clearQuickEntryDraftTimer() {
    if (this.quickEntryDraftTimer) {
      clearTimeout(this.quickEntryDraftTimer)
      this.quickEntryDraftTimer = null
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

  async fetchDashboard() {
    this.setData({
      isLoading: true,
      isLoadFailed: false,
      loadError: ''
    })

    try {
      const dashboardResult = await loadHomeData()
      let notificationStats = {
        unreadCount: 0,
        pendingCount: 0
      }

      try {
        const notificationResult = await loadNotificationsData({
          limit: 6
        })
        if (notificationResult && notificationResult.stats) {
          notificationStats = {
            unreadCount: Number(notificationResult.stats.unreadCount || 0),
            pendingCount: Number(notificationResult.stats.pendingCount || 0)
          }
        }

        const headline = buildNotificationHeadline(
          notificationResult && notificationResult.notifications,
          notificationResult && notificationResult.stats
        )
        notificationStats = {
          ...notificationStats,
          headlineId: headline.id,
          headlineType: headline.type,
          headlineTitle: headline.title,
          headlineDesc: headline.desc,
          headlineActionText: headline.actionText,
          headlineUrl: headline.actionUrl,
          headlineAutoResolve: headline.autoResolve,
          headlineToneClass: headline.toneClass,
          headlineBadgeText: headline.badgeText
        }
      } catch (error) {
        notificationStats = {
          unreadCount: 0,
          pendingCount: 0,
          headlineId: '',
          headlineType: '',
          headlineTitle: '站内提醒',
          headlineDesc: '当前无法同步提醒摘要，点击可进入消息中心查看。',
          headlineActionText: '打开消息',
          headlineUrl: '',
          headlineAutoResolve: false,
          headlineToneClass: 'is-neutral',
          headlineBadgeText: '待处理'
        }
      }

      this.setData({
        dashboard: decorateDashboard(dashboardResult.data),
        notificationUnreadCount: notificationStats.unreadCount,
        notificationPendingCount: notificationStats.pendingCount,
        notificationHeadlineId: notificationStats.headlineId || '',
        notificationHeadlineType: notificationStats.headlineType || '',
        notificationHeadlineTitle: notificationStats.headlineTitle || '站内提醒',
        notificationHeadlineDesc: notificationStats.headlineDesc || '当前提醒都已收口，可以继续按首页任务和跟进节奏推进。',
        notificationHeadlineActionText: notificationStats.headlineActionText || '打开消息',
        notificationHeadlineUrl: notificationStats.headlineUrl || '',
        notificationHeadlineAutoResolve: !!notificationStats.headlineAutoResolve,
        notificationHeadlineToneClass: notificationStats.headlineToneClass || 'is-success',
        notificationHeadlineBadgeText: notificationStats.headlineBadgeText || '已收口',
        isLoading: false,
        dataSource: dashboardResult.source
      })
    } catch (error) {
      const message = error && error.message ? error.message : '当前无法同步云端数据，请稍后重试'
      this.setData({
        dashboard: {
          metrics: [],
          taskBoard: {
            summary: {
              openCount: 0,
              overdueCount: 0,
              todayCount: 0
            },
            cards: []
          },
          todos: [],
          timeline: [],
          hasContent: false,
          overdueCount: 0
        },
        notificationUnreadCount: 0,
        notificationPendingCount: 0,
        notificationHeadlineId: '',
        notificationHeadlineType: '',
        notificationHeadlineTitle: '站内提醒',
        notificationHeadlineDesc: '当前无法同步提醒摘要，点击可进入消息中心查看。',
        notificationHeadlineActionText: '打开消息',
        notificationHeadlineUrl: '',
        notificationHeadlineAutoResolve: false,
        notificationHeadlineToneClass: 'is-neutral',
        notificationHeadlineBadgeText: '待处理',
        isLoading: false,
        isLoadFailed: true,
        loadError: message
      })
      wx.showToast({
        title: '当前无法同步首页数据',
        icon: 'none'
      })
    }
  },

  retryFetch() {
    this.fetchDashboard()
  },

  openProjectDetail(event) {
    const { projectId } = event.currentTarget.dataset
    if (!projectId) {
      return
    }

    wx.navigateTo({
      url: `/pages/project-detail/project-detail?projectId=${projectId}&view=home-todo`
    })
  },

  openFollowUp(event) {
    const { projectId } = event.currentTarget.dataset
    if (!projectId) {
      return
    }

    wx.navigateTo({
      url: `/pages/follow-up/follow-up?projectId=${projectId}&entry=home-todo`
    })
  },

  openTaskProjectDetail(event) {
    const { projectId } = event.currentTarget.dataset
    if (!projectId) {
      return
    }

    wx.navigateTo({
      url: `/pages/project-detail/project-detail?projectId=${projectId}&view=home-task`
    })
  },

  openTaskCompleteSheet(event) {
    const { taskId } = event.currentTarget.dataset
    if (!taskId || this.data.taskActionId) {
      return
    }

    const currentTask = (this.data.dashboard.taskBoard && this.data.dashboard.taskBoard.cards || []).find((item) => item.id === taskId)
    if (!currentTask) {
      return
    }

    const defaultNextTaskDraft = buildDefaultNextTaskDraft()
    this.setData({
      showTaskCompleteSheet: true,
      taskCompletionTaskId: taskId,
      taskCompletionTaskTitle: currentTask.title || '当前动作',
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

  initTaskCompletionKeyboard() {
    if (typeof wx === 'undefined' || typeof wx.onKeyboardHeightChange !== 'function') {
      return
    }

    if (this.taskCompletionKeyboardHandler) {
      return
    }

    this.taskCompletionKeyboardHandler = (result) => {
      if (!this.data.showTaskCompleteSheet && !this.data.showQuickEntrySheet) {
        return
      }

      const height = Math.max(Number(result && result.height || 0), 0)
      if (this.data.showTaskCompleteSheet) {
        if (height > 0) {
          this.syncTaskCompletionLayout(height, true)
          return
        }

        this.syncTaskCompletionLayout(0, false)
      }

      if (this.data.showQuickEntrySheet) {
        if (height > 0) {
          this.syncQuickEntryLayout(height, true)
          return
        }

        this.syncQuickEntryLayout(0, false)
      }
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
      await this.fetchDashboard()
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

  openTimelineProject(event) {
    const { projectId } = event.currentTarget.dataset
    if (!projectId) {
      return
    }

    wx.navigateTo({
      url: `/pages/project-detail/project-detail?projectId=${projectId}&view=home-timeline`
    })
  },

  openProjectsPage() {
    wx.navigateTo({
      url: '/pages/projects/projects'
    })
  },

  openProjectsWithFilter(event) {
    const { quickFilter, sortMode, stageFilter, source } = event.currentTarget.dataset
    wx.navigateTo({
      url: buildProjectListUrl({
        quickFilter,
        sortMode,
        stageFilter,
        source
      })
    })
  },

  openProjectForm() {
    wx.navigateTo({
      url: '/pages/project-form/project-form'
    })
  },

  handleQuickEntryTap() {
    this.openQuickEntrySheet()
  },

  readQuickEntryDrafts() {
    if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') {
      return {}
    }

    try {
      const drafts = wx.getStorageSync(QUICK_ENTRY_DRAFT_STORAGE_KEY)
      return drafts && typeof drafts === 'object' ? drafts : {}
    } catch (error) {
      return {}
    }
  },

  writeQuickEntryDrafts(drafts) {
    if (typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') {
      return
    }

    try {
      wx.setStorageSync(QUICK_ENTRY_DRAFT_STORAGE_KEY, drafts && typeof drafts === 'object' ? drafts : {})
    } catch (error) {
      // ignore draft persistence failures in quick entry flow
    }
  },

  getQuickEntryDraft(mode) {
    const currentMode = normalizeText(mode)
    if (!currentMode) {
      return null
    }

    const drafts = this.readQuickEntryDrafts()
    const draft = drafts[currentMode]
    const savedAt = Number(draft && draft.savedAt || 0)
    if (!draft || !savedAt || Date.now() - savedAt > QUICK_ENTRY_DRAFT_TTL) {
      if (draft) {
        delete drafts[currentMode]
        this.writeQuickEntryDrafts(drafts)
      }
      return null
    }

    return draft
  },

  saveQuickEntryDraft(mode, draft) {
    const currentMode = normalizeText(mode)
    if (!currentMode || !draft) {
      return
    }

    const drafts = this.readQuickEntryDrafts()
    drafts[currentMode] = Object.assign({}, draft, {
      savedAt: Date.now()
    })
    this.writeQuickEntryDrafts(drafts)
  },

  clearQuickEntryDraft(mode) {
    const currentMode = normalizeText(mode)
    if (!currentMode) {
      return
    }

    const drafts = this.readQuickEntryDrafts()
    if (!drafts[currentMode]) {
      return
    }

    delete drafts[currentMode]
    this.writeQuickEntryDrafts(drafts)
  },

  buildQuickEntryStateFromDraft(mode, draft = null, projects = []) {
    if (!draft) {
      return buildQuickEntryEmptyState(mode, projects)
    }

    const form = cloneQuickEntryForm(draft.form)
    const selectedProjectId = normalizeText(draft.selectedProjectId)
    const selectedProjectMeta = findQuickEntryProject(projects, selectedProjectId)
    const currentSelectionMode = draft.selectionMode === 'manual'
      ? (selectedProjectMeta ? 'manual' : '')
      : (selectedProjectMeta ? 'auto' : '')
    const keyword = normalizeText(draft.projectKeyword)
    const projectViews = buildQuickEntryProjectViews(projects, keyword, selectedProjectMeta ? selectedProjectMeta.id : '')

    return {
      quickEntryMode: mode,
      quickEntryModeTitle: getQuickEntryModeMeta(mode).label,
      quickEntryModeDesc: getQuickEntryModeMeta(mode).desc,
      quickEntryShowProjectSearch: !!draft.showProjectSearch,
      quickEntryProjectKeyword: keyword,
      quickEntrySuggestedProjects: projectViews.suggestedProjects,
      quickEntryVisibleProjects: projectViews.visibleProjects,
      quickEntryProjectSelectionMode: currentSelectionMode,
      quickEntrySelectedProjectId: selectedProjectMeta ? selectedProjectMeta.id : '',
      quickEntrySelectedProjectName: getQuickEntryProjectLabel(selectedProjectMeta),
      quickEntrySelectedProjectMeta: selectedProjectMeta,
      quickEntryForm: form
    }
  },

  scheduleQuickEntryDraftPersist() {
    this.clearQuickEntryDraftTimer()
    this.quickEntryDraftTimer = setTimeout(() => {
      this.persistCurrentQuickEntryDraft()
    }, 240)
  },

  persistCurrentQuickEntryDraft() {
    const mode = normalizeText(this.data.quickEntryMode) || 'follow_up'
    if (this.data.showQuickEntrySuccessPanel) {
      this.clearQuickEntryDraft(mode)
      return
    }

    const form = cloneQuickEntryForm(this.data.quickEntryForm)
    const selectedProjectId = normalizeText(this.data.quickEntrySelectedProjectId)

    if (!shouldPersistQuickEntryDraft(mode, form, selectedProjectId)) {
      this.clearQuickEntryDraft(mode)
      return
    }

    this.saveQuickEntryDraft(mode, {
      form,
      selectedProjectId,
      selectionMode: this.data.quickEntryProjectSelectionMode || '',
      projectKeyword: this.data.quickEntryProjectKeyword || '',
      showProjectSearch: !!this.data.quickEntryShowProjectSearch
    })
  },

  async openQuickEntrySheet() {
    if (this.data.quickEntryActionId) {
      return
    }

    const mode = normalizeText(this.data.quickEntryMode) || 'follow_up'
    const draft = this.getQuickEntryDraft(mode)
    const draftState = this.buildQuickEntryStateFromDraft(mode, draft, this.data.quickEntryProjects)
    this.setData({
      showQuickEntrySheet: true,
      showQuickEntrySuccessPanel: false,
      quickEntrySuccessState: buildQuickEntrySuccessState(),
      ...draftState
    })
    this.syncQuickEntryLayout(0, false)

    try {
      await this.ensureQuickEntryProjects()
    } catch (error) {
      wx.showToast({
        title: error.message || '当前无法加载项目列表',
        icon: 'none'
      })
    }
  },

  closeQuickEntrySheet(force = false) {
    if (!force && this.data.quickEntryActionId) {
      return
    }

    if (!force && this.data.showQuickEntrySuccessPanel) {
      return
    }

    this.clearQuickEntryDraftTimer()
    if (!force && !this.data.showQuickEntrySuccessPanel) {
      this.persistCurrentQuickEntryDraft()
      this.setData({
        showQuickEntrySheet: false
      })
      this.syncQuickEntryLayout(0, false)
      return
    }

    const resetState = buildQuickEntryEmptyState('follow_up', this.data.quickEntryProjects)
    this.setData({
      showQuickEntrySheet: false,
      showQuickEntrySuccessPanel: false,
      quickEntrySuccessState: buildQuickEntrySuccessState(),
      ...resetState
    })
    this.syncQuickEntryLayout(0, false)
  },

  onQuickEntryMaskTap() {
    if (this.data.showQuickEntrySuccessPanel) {
      return
    }

    this.closeQuickEntrySheet(false)
  },

  onQuickEntryHeaderClose() {
    if (this.data.showQuickEntrySuccessPanel) {
      this.closeQuickEntryAfterSuccess()
      return
    }

    this.closeQuickEntrySheet(false)
  },

  async ensureQuickEntryProjects() {
    if (Array.isArray(this.data.quickEntryProjects) && this.data.quickEntryProjects.length) {
      const mode = normalizeText(this.data.quickEntryMode) || 'follow_up'
      const draft = this.getQuickEntryDraft(mode)
      if (draft) {
        this.setData(this.buildQuickEntryStateFromDraft(mode, draft, this.data.quickEntryProjects))
      } else {
        this.refreshQuickEntryProjectRecommendation()
      }
      return this.data.quickEntryProjects
    }

    const result = await loadProjectsData()
    const projects = (Array.isArray(result && result.data) ? result.data : []).map(normalizeProjectOption)
    this.setData({
      quickEntryProjects: projects,
      quickEntrySheetSource: result && result.source ? result.source : this.data.dataSource
    }, () => {
      const mode = normalizeText(this.data.quickEntryMode) || 'follow_up'
      const draft = this.getQuickEntryDraft(mode)
      if (draft) {
        this.setData(this.buildQuickEntryStateFromDraft(mode, draft, projects))
        return
      }
      this.refreshQuickEntryProjectRecommendation()
    })

    return projects
  },

  setQuickEntryMode(event) {
    const { mode } = event.currentTarget.dataset
    if (!mode || mode === this.data.quickEntryMode) {
      return
    }

    this.persistCurrentQuickEntryDraft()
    const draft = this.getQuickEntryDraft(mode)
    this.setData({
      showQuickEntrySuccessPanel: false,
      quickEntrySuccessState: buildQuickEntrySuccessState(),
      ...this.buildQuickEntryStateFromDraft(mode, draft, this.data.quickEntryProjects)
    }, () => {
      if (!draft) {
        this.refreshQuickEntryProjectRecommendation()
      }
    })
  },

  showQuickEntrySuccess(payload = {}) {
    const successState = buildQuickEntrySuccessState({
      visible: true,
      ...payload
    })

    if (typeof wx !== 'undefined' && typeof wx.hideKeyboard === 'function') {
      wx.hideKeyboard()
    }

    this.clearQuickEntryDraftTimer()
    this.setData({
      showQuickEntrySheet: true,
      showQuickEntrySuccessPanel: true,
      quickEntrySuccessState: successState
    })
    this.syncQuickEntryLayout(0, false)
  },

  continueQuickEntryAfterSuccess() {
    const successState = this.data.quickEntrySuccessState || {}
    if (!this.data.showQuickEntrySuccessPanel || !successState.visible) {
      return
    }

    const mode = normalizeText(successState.mode) || 'follow_up'
    const resetState = buildQuickEntryEmptyState(mode, this.data.quickEntryProjects)
    const continueProjectMeta = findQuickEntryProject(this.data.quickEntryProjects, successState.continueProjectId)

    if (continueProjectMeta && mode !== 'project') {
      const projectViews = buildQuickEntryProjectViews(this.data.quickEntryProjects, '', continueProjectMeta.id)
      resetState.quickEntrySuggestedProjects = projectViews.suggestedProjects
      resetState.quickEntryVisibleProjects = projectViews.visibleProjects
      resetState.quickEntryProjectSelectionMode = 'manual'
      resetState.quickEntrySelectedProjectId = continueProjectMeta.id
      resetState.quickEntrySelectedProjectName = getQuickEntryProjectLabel(continueProjectMeta)
      resetState.quickEntrySelectedProjectMeta = continueProjectMeta
    }

    this.setData({
      showQuickEntrySuccessPanel: false,
      quickEntrySuccessState: buildQuickEntrySuccessState(),
      ...resetState
    })
    this.syncQuickEntryLayout(0, false)
  },

  closeQuickEntryAfterSuccess() {
    this.closeQuickEntrySheet(true)
  },

  openQuickEntrySavedProject() {
    const successState = this.data.quickEntrySuccessState || {}
    const projectId = normalizeText(successState.projectId)
    if (!projectId) {
      this.closeQuickEntrySheet(true)
      return
    }

    this.closeQuickEntrySheet(true)
    wx.navigateTo({
      url: `/pages/project-detail/project-detail?projectId=${projectId}&view=home-quick-entry`
    })
  },

  onQuickEntryProjectSearch(event) {
    const keyword = String(event.detail.value || '')
    const projectViews = buildQuickEntryProjectViews(this.data.quickEntryProjects, keyword, this.data.quickEntrySelectedProjectId)
    this.setData({
      quickEntryProjectKeyword: keyword,
      quickEntryVisibleProjects: projectViews.visibleProjects
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  clearQuickEntryProjectSearch() {
    const projectViews = buildQuickEntryProjectViews(this.data.quickEntryProjects, '', this.data.quickEntrySelectedProjectId)
    this.setData({
      quickEntryProjectKeyword: '',
      quickEntryVisibleProjects: projectViews.visibleProjects
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  selectQuickEntryProject(event) {
    const { projectId } = event.currentTarget.dataset
    if (!projectId) {
      return
    }

    const currentProject = (this.data.quickEntryProjects || []).find((item) => item.id === projectId)
    this.setData({
      quickEntryProjectSelectionMode: 'manual',
      quickEntrySelectedProjectId: projectId,
      quickEntrySelectedProjectName: getQuickEntryProjectLabel(currentProject),
      quickEntrySelectedProjectMeta: currentProject || null
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  toggleQuickEntryProjectSearch() {
    const nextVisible = !this.data.quickEntryShowProjectSearch
    const keyword = nextVisible ? this.data.quickEntryProjectKeyword : ''
    const projectViews = buildQuickEntryProjectViews(this.data.quickEntryProjects, keyword, this.data.quickEntrySelectedProjectId)
    this.setData({
      quickEntryShowProjectSearch: nextVisible,
      quickEntryProjectKeyword: keyword,
      quickEntryVisibleProjects: projectViews.visibleProjects
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  refreshQuickEntryProjectRecommendation(formPatch = null) {
    const projects = Array.isArray(this.data.quickEntryProjects) ? this.data.quickEntryProjects : []
    const nextForm = formPatch ? Object.assign({}, this.data.quickEntryForm, formPatch) : this.data.quickEntryForm
    const selectionMode = this.data.quickEntryProjectSelectionMode
    const currentSelectionId = normalizeText(this.data.quickEntrySelectedProjectId)
    const recommendationText = getQuickEntryRecommendationText(this.data.quickEntryMode, nextForm)

    let targetProject = null
    let targetProjectId = ''
    let nextSelectionMode = selectionMode

    if (selectionMode === 'manual' && currentSelectionId) {
      targetProject = findQuickEntryProject(projects, currentSelectionId)
      targetProjectId = targetProject ? targetProject.id : ''
      if (!targetProjectId) {
        nextSelectionMode = ''
      }
    }

    if (!targetProjectId) {
      targetProject = findQuickEntryRecommendedProject(projects, recommendationText)
      targetProjectId = targetProject ? targetProject.id : ''
      nextSelectionMode = targetProjectId ? 'auto' : ''
    }

    const projectViews = buildQuickEntryProjectViews(projects, this.data.quickEntryProjectKeyword, targetProjectId)
    this.setData({
      quickEntrySuggestedProjects: projectViews.suggestedProjects,
      quickEntryVisibleProjects: projectViews.visibleProjects,
      quickEntryProjectSelectionMode: nextSelectionMode,
      quickEntrySelectedProjectId: targetProjectId,
      quickEntrySelectedProjectName: getQuickEntryProjectLabel(targetProject),
      quickEntrySelectedProjectMeta: targetProject || null
    })
  },

  setQuickEntryStage(event) {
    const { stage } = event.currentTarget.dataset
    if (!stage) {
      return
    }

    this.setData({
      'quickEntryForm.stage': stage
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  onQuickEntryFieldFocus() {
    this.syncQuickEntryLayout(this.data.quickEntryKeyboardHeight, true)
  },

  syncQuickEntryLayout(height = 0, isEditing = false) {
    const keyboardHeight = Math.max(Number(height || 0), 0)
    const cursorSpacing = keyboardHeight ? Math.min(Math.max(keyboardHeight - 24, 120), 320) : 120
    const sheetStyle = keyboardHeight
      ? `top: 16vh; padding-bottom: calc(${keyboardHeight}px + env(safe-area-inset-bottom));`
      : ''
    const bodyStyle = keyboardHeight
      ? `padding-bottom: ${keyboardHeight + 196}px;`
      : ''
    const actionsStyle = keyboardHeight
      ? `margin-bottom: calc(${keyboardHeight}px + env(safe-area-inset-bottom));`
      : ''

    this.setData({
      quickEntryKeyboardHeight: keyboardHeight,
      quickEntryCursorSpacing: cursorSpacing,
      quickEntrySheetStyle: sheetStyle,
      quickEntryBodyStyle: bodyStyle,
      quickEntryActionsStyle: actionsStyle,
      isQuickEntryEditing: !!isEditing
    })
  },

  onQuickEntryInput(event) {
    const { field } = event.currentTarget.dataset
    if (!field) {
      return
    }

    const nextValue = String(event.detail.value || '')
    this.setData({
      [`quickEntryForm.${field}`]: nextValue
    }, () => {
      if (field === 'followUpContent' || field === 'taskTitle' || field === 'taskContext' || field === 'taskDescription') {
        this.refreshQuickEntryProjectRecommendation({
          [field]: nextValue
        })
      }
      this.scheduleQuickEntryDraftPersist()
    })
  },

  onQuickEntryPicker(event) {
    const { field } = event.currentTarget.dataset
    if (!field) {
      return
    }

    this.setData({
      [`quickEntryForm.${field}`]: String(event.detail.value || '')
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  setQuickEntryMethod(event) {
    const { method } = event.currentTarget.dataset
    if (!method) {
      return
    }

    this.setData({
      'quickEntryForm.followUpMethod': method
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  setQuickEntryTaskType(event) {
    const { type } = event.currentTarget.dataset
    if (!type) {
      return
    }

    this.setData({
      'quickEntryForm.taskType': type
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  async submitQuickEntry() {
    const mode = this.data.quickEntryMode
    if (this.data.quickEntryActionId) {
      return
    }

    if (mode === 'project') {
      await this.submitQuickProject()
      return
    }

    if (mode === 'task') {
      await this.submitQuickTask()
      return
    }

    await this.submitQuickFollowUp()
  },

  async submitQuickProject() {
    const projectName = normalizeText(this.data.quickEntryForm.projectName)
    const clientName = normalizeText(this.data.quickEntryForm.clientName)
    const stage = normalizeText(this.data.quickEntryForm.stage) || '线索'

    if (!projectName || !clientName) {
      wx.showToast({
        title: '请先填写项目名称和客户名称',
        icon: 'none'
      })
      return
    }

    this.setData({
      quickEntryActionId: 'project'
    })

    try {
      const result = await saveProjectData({
        projectName,
        clientName,
        stage,
        estimatedAmount: '',
        expectedCommission: '',
        tagsText: '',
        description: '',
        contacts: []
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '项目创建失败')
      }

      await resolveNotificationData({
        projectId: '',
        types: ['save_failed'],
        scenes: ['quick_project_create']
      })

      this.clearQuickEntryDraft('project')
      await this.fetchDashboard()
      this.showQuickEntrySuccess({
        mode: 'project',
        title: '项目已创建',
        detail: `${projectName} 已加入我的项目，可继续录下一条或直接查看详情。`,
        projectId: result.projectId || '',
        projectName
      })
    } catch (error) {
      await reportSystemFailureData({
        type: 'save_failed',
        scene: 'quick_project_create',
        title: '快速新建项目失败',
        message: error.message || '当前无法新建项目，请稍后重试',
        projectName
      })

      wx.showToast({
        title: error.message || '当前无法新建项目，请稍后重试',
        icon: 'none'
      })
    } finally {
      this.setData({
        quickEntryActionId: ''
      })
    }
  },

  async submitQuickFollowUp() {
    const projectId = normalizeText(this.data.quickEntrySelectedProjectId)
    const content = normalizeText(this.data.quickEntryForm.followUpContent)

    if (!content) {
      wx.showToast({
        title: '请先填写跟进内容',
        icon: 'none'
      })
      return
    }

    if (!projectId) {
      wx.showToast({
        title: '请关联项目',
        icon: 'none'
      })
      return
    }

    this.setData({
      quickEntryActionId: 'follow_up'
    })

    try {
      const result = await saveFollowUpData({
        projectId,
        method: this.data.quickEntryForm.followUpMethod,
        followUpTime: `${this.data.quickEntryForm.followUpDate} ${this.data.quickEntryForm.followUpClock}`,
        content,
        stageChange: '',
        nextFollowUpTime: '',
        images: [],
        aiSummary: '',
        aiHighlights: [],
        aiRisks: [],
        aiRecommendedStage: '',
        aiStageChangeReason: '',
        aiMissingInfo: [],
        tasks: []
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '跟进保存失败')
      }

      await resolveNotificationData({
        projectId,
        types: ['save_failed'],
        scenes: ['quick_follow_up_save']
      })

      touchNotificationSync('quick_follow_up_saved')
      this.clearQuickEntryDraft('follow_up')
      await this.fetchDashboard()
      this.showQuickEntrySuccess({
        mode: 'follow_up',
        title: '跟进已提交',
        detail: `${this.data.quickEntrySelectedProjectName} 已更新，可继续录下一条或直接查看项目。`,
        projectId: result.projectId || projectId,
        projectName: this.data.quickEntrySelectedProjectName,
        continueProjectId: projectId,
        continueProjectName: this.data.quickEntrySelectedProjectName
      })
    } catch (error) {
      await reportSystemFailureData({
        type: 'save_failed',
        scene: 'quick_follow_up_save',
        title: '快速跟进失败',
        message: error.message || '当前无法保存跟进，请稍后重试',
        projectId,
        projectName: this.data.quickEntrySelectedProjectName
      })

      wx.showToast({
        title: error.message || '当前无法保存跟进，请稍后重试',
        icon: 'none'
      })
    } finally {
      this.setData({
        quickEntryActionId: ''
      })
    }
  },

  async submitQuickTask() {
    const projectId = normalizeText(this.data.quickEntrySelectedProjectId)
    const taskContext = normalizeText(this.data.quickEntryForm.taskContext)
    const taskTitle = normalizeText(this.data.quickEntryForm.taskTitle)
    const taskDueDate = normalizeText(this.data.quickEntryForm.taskDueDate)
    const taskDueTime = normalizeText(this.data.quickEntryForm.taskDueTime)
    const taskDescription = normalizeText(this.data.quickEntryForm.taskDescription)

    if (!taskTitle) {
      wx.showToast({
        title: '请先填写任务标题',
        icon: 'none'
      })
      return
    }

    if (!taskDueDate || !taskDueTime) {
      wx.showToast({
        title: '请先填写截止时间',
        icon: 'none'
      })
      return
    }

    if (!projectId) {
      wx.showToast({
        title: '请关联项目',
        icon: 'none'
      })
      return
    }

    this.setData({
      quickEntryActionId: 'task'
    })

    try {
      const now = new Date()
      const taskContextText = taskContext || `补充动作：${taskTitle}`
      const result = await saveFollowUpData({
        projectId,
        method: '其他',
        followUpTime: `${formatDateInput(now)} ${formatTimeInput(now)}`,
        content: taskContextText,
        stageChange: '',
        nextFollowUpTime: '',
        images: [],
        aiSummary: '',
        aiHighlights: [],
        aiRisks: [],
        aiRecommendedStage: '',
        aiStageChangeReason: '',
        aiMissingInfo: [],
        tasks: [
          {
            title: taskTitle,
            type: this.data.quickEntryForm.taskType || 'other',
            priority: 'normal',
            dueDate: taskDueDate,
            dueTime: taskDueTime,
            description: taskDescription
          }
        ]
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '任务保存失败')
      }

      await resolveNotificationData({
        projectId,
        types: ['save_failed'],
        scenes: ['quick_task_save']
      })

      touchNotificationSync('quick_task_saved')
      this.clearQuickEntryDraft('task')
      await this.fetchDashboard()
      this.showTaskFeedback({
        title: '下一步动作已加入推进清单',
        detail: `${taskTitle} 已进入首页“推进动作优先”，后续可直接完成并回填结果。`
      })
      this.showQuickEntrySuccess({
        mode: 'task',
        title: '任务已补进清单',
        detail: `${this.data.quickEntrySelectedProjectName} 已加入新的推进动作，可继续录下一条或查看项目。`,
        projectId: result.projectId || projectId,
        projectName: this.data.quickEntrySelectedProjectName,
        continueProjectId: projectId,
        continueProjectName: this.data.quickEntrySelectedProjectName
      })
    } catch (error) {
      await reportSystemFailureData({
        type: 'save_failed',
        scene: 'quick_task_save',
        title: '快速补任务失败',
        message: error.message || '当前无法补任务，请稍后重试',
        projectId,
        projectName: this.data.quickEntrySelectedProjectName
      })

      wx.showToast({
        title: error.message || '当前无法补任务，请稍后重试',
        icon: 'none'
      })
    } finally {
      this.setData({
        quickEntryActionId: ''
      })
    }
  },

  openNotificationsPage() {
    wx.navigateTo({
      url: '/pages/notifications/notifications'
    })
  },

  applyHeadlineNotificationFeedback(options = {}) {
    const shouldMarkRead = !!options.markRead
    const shouldResolve = !!options.resolve

    if (!shouldMarkRead && !shouldResolve) {
      return
    }

    const nextUnreadCount = Math.max(Number(this.data.notificationUnreadCount || 0) - (shouldMarkRead ? 1 : 0), 0)
    const nextPendingCount = Math.max(Number(this.data.notificationPendingCount || 0) - (shouldResolve ? 1 : 0), 0)
    const nextData = {
      notificationUnreadCount: nextUnreadCount,
      notificationPendingCount: nextPendingCount
    }

    if (shouldResolve) {
      nextData.notificationHeadlineId = ''
      nextData.notificationHeadlineType = ''
      nextData.notificationHeadlineTitle = nextPendingCount ? '提醒状态已更新' : '站内提醒'
      nextData.notificationHeadlineDesc = nextPendingCount
        ? '这条提醒已收口，返回首页后会自动同步下一条。'
        : '当前提醒都已收口，可以继续按首页动作和跟进节奏推进。'
      nextData.notificationHeadlineActionText = '打开消息'
      nextData.notificationHeadlineUrl = ''
      nextData.notificationHeadlineAutoResolve = false
      nextData.notificationHeadlineToneClass = nextPendingCount ? 'is-neutral' : 'is-success'
      nextData.notificationHeadlineBadgeText = nextPendingCount ? '待处理' : '已收口'
    }

    this.setData(nextData)
  },

  async openHeadlineNotification() {
    const notificationId = String(this.data.notificationHeadlineId || '').trim()
    const actionUrl = String(this.data.notificationHeadlineUrl || '').trim()
    const notificationType = String(this.data.notificationHeadlineType || '').trim()
    const shouldAutoResolve = !!this.data.notificationHeadlineAutoResolve
    let targetUrl = actionUrl

    if (actionUrl.indexOf('/pages/follow-up/follow-up') === 0) {
      targetUrl = appendQueryParams(actionUrl, {
        entry: 'notification',
        source: 'home-headline',
        type: notificationType
      })
    } else if (actionUrl.indexOf('/pages/project-detail/project-detail') === 0) {
      targetUrl = appendQueryParams(actionUrl, {
        source: 'home-headline',
        notificationType
      })
    } else if (actionUrl.indexOf('/pages/projects/projects') === 0 || actionUrl.indexOf('/pages/shared-out/shared-out') === 0) {
      targetUrl = appendQueryParams(actionUrl, {
        source: 'home-headline'
      })
    }

    if (!targetUrl) {
      this.openNotificationsPage()
      return
    }

    if (notificationId) {
      try {
        await markNotificationReadData({
          notificationId
        })
        touchNotificationSync('headline_read')
        this.applyHeadlineNotificationFeedback({
          markRead: true
        })
      } catch (error) {
        // Keep quick access available even if read-state sync fails.
      }
    }

    if (notificationId && shouldAutoResolve) {
      try {
        await resolveNotificationData({
          notificationId
        })
        touchNotificationSync('headline_resolved')
        this.applyHeadlineNotificationFeedback({
          resolve: true
        })
      } catch (error) {
        // Keep quick access available even if resolve-state sync fails.
      }
    }

    wx.navigateTo({
      url: targetUrl
    })
  },

  openPage(event) {
    const { url } = event.currentTarget.dataset
    wx.navigateTo({ url })
  }
})
