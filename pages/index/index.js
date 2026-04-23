const {
  loadHomeData,
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
      badgeText: '业务动态'
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

  async onLoad() {
    syncPageAppearance(this)
    this.initTaskCompletionKeyboard()
    this.setData({
      notificationSyncVersion: getNotificationSyncVersion()
    })
    await this.fetchDashboard()
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
