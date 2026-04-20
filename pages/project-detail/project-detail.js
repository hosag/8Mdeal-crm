const { loadProjectDetailData, updateTaskStatusData, markNotificationReadData, resolveNotificationData } = require('../../services/data')
const { buildProjectDetailEntryContext } = require('../../utils/navigation-context')
const { touchNotificationSync } = require('../../utils/notification-sync')
const {
  buildTaskCompletionFeedback,
  buildTaskStatusFeedback,
  getTaskCompletionToastTitle,
  getTaskStatusToastTitle
} = require('../../services/task-feedback')

const NEXT_TASK_TEMPLATES = [
  { type: 'send_solution', label: '待发方案' },
  { type: 'send_quote', label: '待报价' },
  { type: 'callback', label: '待回访' },
  { type: 'meeting', label: '待约会面' },
  { type: 'contract', label: '待签约' },
  { type: 'other', label: '其他动作' }
]

const SHARE_ACTION_OPTIONS = [
  {
    key: 'info',
    title: '发送资料',
    desc: '发资料给对方查看，不转移项目。',
    badge: '仅查看'
  },
  {
    key: 'outbound',
    title: '转交项目',
    desc: '把项目交给对方，后续由对方推进。',
    badge: '接手管理权'
  }
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
    title: '',
    type: 'callback',
    dueDate: formatDateInput(base),
    dueTime: formatTimeInput(base),
    description: ''
  }
}


function getStageFocus(stage) {
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

function countTimelineRecords(followTimeline) {
  return (Array.isArray(followTimeline) ? followTimeline : []).reduce((total, group) => {
    return total + (Array.isArray(group.items) ? group.items.length : 0)
  }, 0)
}

function getLatestTimelineItem(followTimeline) {
  const groups = Array.isArray(followTimeline) ? followTimeline : []
  for (let i = 0; i < groups.length; i += 1) {
    const items = Array.isArray(groups[i].items) ? groups[i].items : []
    if (items.length) {
      return items[0]
    }
  }

  return null
}

function buildProjectBadges(projectDetail, isReadOnlySharedOut) {
  const detail = projectDetail || {}
  const badges = [
    {
      text: detail.stage || '线索',
      className: 'status-badge'
    }
  ]

  if (detail.isSharedProject) {
    badges.push({
      text: '我接手的项目',
      className: 'soft-badge'
    })
  } else if (isReadOnlySharedOut) {
    badges.push({
      text: '外发只读',
      className: 'soft-badge'
    })
  } else {
    badges.push({
      text: '我负责推进',
      className: 'chip'
    })
  }

  if (detail.handoverStatus === 'handed_over') {
    badges.push({
      text: detail.handoverToName ? `已外发给 ${detail.handoverToName}` : '外发追踪中',
      className: 'chip'
    })
  } else if (detail.nextFollowUp && detail.nextFollowUp !== '待设置') {
    badges.push({
      text: `下次跟进 ${detail.nextFollowUp}`,
      className: 'chip'
    })
  }

  return badges
}

function buildHeroMetrics(projectDetail, contacts, shareHistory, isReadOnlySharedOut) {
  const detail = projectDetail || {}
  const contactCount = Array.isArray(contacts) ? contacts.length : 0
  const shareCount = Array.isArray(shareHistory) ? shareHistory.length : 0

  return [
    {
      label: '预计金额',
      value: detail.estimatedAmount || '0',
      note: '当前项目体量'
    },
    {
      label: '已签金额',
      value: detail.actualAmount || '0',
      note: '已确认成交'
    },
    {
      label: '联系人',
      value: `${contactCount} 位`,
      note: contactCount ? '已录入关键联系人' : '暂无联系人'
    },
    {
      label: isReadOnlySharedOut ? '外发状态' : '分享记录',
      value: isReadOnlySharedOut ? '外发中' : `${shareCount} 次`,
      note: isReadOnlySharedOut ? '当前页为外发只读视图' : (shareCount ? '已发起外发或分享' : '尚未发起分享')
    }
  ]
}

function buildSummaryHighlights(projectDetail, contacts, shareHistory, isReadOnlySharedOut) {
  const detail = projectDetail || {}
  const contactsList = Array.isArray(contacts) ? contacts : []
  const historyList = Array.isArray(shareHistory) ? shareHistory : []
  const latestShare = historyList[0] || null

  return [
    {
      label: '当前阶段',
      value: detail.stage || '线索',
      note: getStageFocus(detail.stage)
    },
    {
      label: '下次跟进',
      value: detail.nextFollowUp || '未设置',
      note: detail.nextFollowUp && detail.nextFollowUp !== '待设置'
        ? '按约定时间继续推进'
        : '首页会自动汇总待办'
    },
    {
      label: '联系人',
      value: contactsList.length ? `${contactsList.length} 位` : '未录入',
      note: contactsList.length
        ? `当前主要对接 ${contactsList[0].name || '联系人'}`
        : '当前未录入联系人'
    },
    {
      label: '分享状态',
      value: isReadOnlySharedOut ? '外发只读' : (historyList.length ? `${historyList.length} 次分享` : '未分享'),
      note: isReadOnlySharedOut
        ? '后续推进改在“外发项目”追踪'
        : (latestShare ? `最近一次状态：${latestShare.status}` : '当前项目还没有分享记录')
    }
  ]
}

function buildProjectOverview(projectDetail, contacts, followTimeline, shareHistory, isReadOnlySharedOut) {
  const detail = projectDetail || {}
  const contactList = Array.isArray(contacts) ? contacts : []
  const historyList = Array.isArray(shareHistory) ? shareHistory : []
  const latestTimelineItem = getLatestTimelineItem(followTimeline)
  const totalRecords = countTimelineRecords(followTimeline)
  const latestShare = historyList[0] || null

  let ownerLabel = '我负责推进'
  if (detail.isSharedProject) {
    ownerLabel = `${detail.sharedFromName || '分享方'} 外发给我`
  } else if (isReadOnlySharedOut) {
    ownerLabel = detail.handoverToName ? `已外发给 ${detail.handoverToName}` : '已外发追踪中'
  }

  return {
    ownerLabel,
    focusText: getStageFocus(detail.stage),
    latestSummary: latestTimelineItem
      ? String(latestTimelineItem.summary || latestTimelineItem.desc || '').trim()
      : '当前还没有跟进摘要',
    nextFollowUpText: detail.nextFollowUp || '未设置',
    primaryContactText: contactList.length
      ? `${contactList[0].name || '联系人'}${contactList[0].role ? ` / ${contactList[0].role}` : ''}`
      : '暂无联系人',
    recordCountText: totalRecords ? `${totalRecords} 条` : '暂无记录',
    latestFollowText: latestTimelineItem
      ? `${latestTimelineItem.time || '--:--'} · ${(latestTimelineItem.actorName || '当前用户')}回填`
      : '暂无回填记录',
    shareStatusText: isReadOnlySharedOut
      ? '当前项目已转入外发追踪视图'
      : (latestShare ? `最近一次分享状态：${latestShare.status}` : '当前项目还没有分享记录')
  }
}

function buildContactSummary(contacts) {
  const list = Array.isArray(contacts) ? contacts : []
  if (!list.length) {
    return '当前还没有录入联系人。'
  }

  const first = list[0]
  return `已录入 ${list.length} 位联系人，当前主要对接 ${first.name || '联系人'}${first.role ? `（${first.role}）` : ''}。`
}

function buildTimelineSummary(followTimeline) {
  const total = countTimelineRecords(followTimeline)
  if (!total) {
    return '当前还没有跟进记录。新增一条后，这里会按时间沉淀完整时间线。'
  }

  const latest = getLatestTimelineItem(followTimeline)
  let collaboratorCount = 0
  let taskDoneCount = 0

  ;(Array.isArray(followTimeline) ? followTimeline : []).forEach((group) => {
    const items = Array.isArray(group.items) ? group.items : []
    collaboratorCount += items.filter((item) => item && item.fromCollaborator).length
    taskDoneCount += items.filter((item) => item && item.typeKey === 'task_done').length
  })

  const parts = [
    `共 ${total} 条记录`,
    `最新一条由 ${(latest && latest.actorName) || '当前用户'} 在 ${(latest && latest.time) || '--:--'} 录入`
  ]

  if (taskDoneCount) {
    parts.push(`任务完成 ${taskDoneCount} 条`)
  }

  if (collaboratorCount) {
    parts.push(`接手方推进 ${collaboratorCount} 条`)
  }

  return parts.join(' · ')
}

function buildShareHistorySummary(shareHistory) {
  const list = Array.isArray(shareHistory) ? shareHistory : []
  if (!list.length) {
    return ''
  }

  const openedCount = list.filter((item) => item.status === '已打开').length
  const importedCount = list.filter((item) => item.status === '已导入' || item.status === '已跟进').length
  const followedCount = list.filter((item) => item.status === '已跟进').length

  return `共 ${list.length} 次分享 · 已打开 ${openedCount} 次 · 已接手 ${importedCount} 次 · 已新增推进 ${followedCount} 次`
}

function buildTaskSummary(taskSummary) {
  const summary = taskSummary || {}
  const openCount = Number(summary.openCount || 0)
  const overdueCount = Number(summary.overdueCount || 0)
  const completedCount = Number(summary.completedCount || 0)

  if (!Number(summary.total || 0)) {
    return '当前还没有推进任务。'
  }

  return `未完成 ${openCount} 条 · 逾期 ${overdueCount} 条 · 已完成 ${completedCount} 条`
}

function normalizeShareHistory(records) {
  return (Array.isArray(records) ? records : []).map((item) => {
    const isOutbound = item.mode === '项目外发'
    let statusSummary = '已发出，等待对方查看'
    let collaborationSummary = isOutbound
      ? '接收方打开后会自动进入对方“我的项目”'
      : '这类分享只用于信息同步，不进入对方“我的项目”'

    if (item.status === '已打开') {
      statusSummary = isOutbound ? '对方已查看，正在等待接手' : '对方已查看卡片'
      collaborationSummary = isOutbound
        ? '如果对方准备继续推进，下一次打开会自动进入对方“我的项目”'
        : '后续推进仍在你自己的项目里完成'
    }

    if (item.status === '已导入') {
      statusSummary = '对方已接手项目'
      collaborationSummary = '项目已进入对方“我的项目”，等待对方补第一条推进记录'
    }

    if (item.status === '已跟进') {
      statusSummary = `对方已新增推进记录 ${Number(item.collaboratorFollowCount || 0)} 条`
      collaborationSummary = item.collaboratorLatestFollowAt
        ? `最近一次推进记录：${item.collaboratorLatestFollowAt}`
        : '可以去“外发项目”查看推进时间线'
    }

    return {
      ...item,
      statusSummary,
      collaborationSummary,
      progressText: isOutbound
        ? (item.status === '已跟进'
          ? `已推进 ${Number(item.collaboratorFollowCount || 0)} 条`
          : (item.status === '已导入' ? '已接手' : (item.status === '已打开' ? '已查看，待接手' : '等待查看')))
        : (item.status === '已打开' ? '信息已查看' : '等待查看'),
      collaborationCountText: isOutbound ? `${Number(item.collaboratorFollowCount || 0)} 条` : '查看型分享',
      statusBadgeClass: item.status === '已跟进'
        ? 'is-success'
        : (item.status === '已打开' || item.status === '已导入' ? 'is-brand' : (item.status === '未打开' ? 'is-danger' : ''))
    }
  })
}

Page({
  data: {
    projectId: '',
    viewMode: 'default',
    entrySource: '',
    notificationType: '',
    pendingTaskId: '',
    pendingOpenTaskComplete: false,
    projectDetail: {},
    contacts: [],
    tasks: [],
    taskSummary: {},
    followTimeline: [],
    shareHistory: [],
    showContacts: false,
    showShareSheet: false,
    shareActionOptions: SHARE_ACTION_OPTIONS,
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
    nextTaskTemplates: NEXT_TASK_TEMPLATES,
    projectBadges: [],
    heroMetrics: [],
    summaryHighlights: [],
    contactSummaryText: '',
    taskSummaryText: '',
    timelineSummaryText: '',
    shareHistorySummaryText: '',
    projectOverview: {},
    entryContextText: '',
    isShareLoading: false,
    isSharing: false,
    taskActionId: '',
    canMarkDeal: true,
    isReadOnlySharedOut: false,
    isLoading: true,
    dataSource: 'Mock Demo'
  },

  onLoad(options) {
    this.setData({
      projectId: options.projectId || '',
      viewMode: options.view || 'default',
      entrySource: options.source || '',
      notificationType: options.notificationType || '',
      pendingTaskId: options.taskId || '',
      pendingOpenTaskComplete: options.openTaskComplete === '1'
    })

    this.initTaskCompletionKeyboard()
    this.fetchProjectDetail()
  },

  onShow() {
    this.initTaskCompletionKeyboard()
    if (this.data.projectId && !this.data.isLoading) {
      this.fetchProjectDetail()
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

  async fetchProjectDetail() {
    this.setData({ isLoading: true })
    try {
      const { data, source } = await loadProjectDetailData(this.data.projectId)
      const normalizedShareHistory = normalizeShareHistory(data.shareHistory || [])
      const isReadOnlySharedOut = data.projectDetail.handoverStatus === 'handed_over' && !data.projectDetail.isSharedProject

      this.setData({
        projectDetail: data.projectDetail,
        contacts: data.contacts,
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        taskSummary: data.taskSummary || {},
        followTimeline: data.followTimeline,
        shareHistory: normalizedShareHistory,
        projectBadges: buildProjectBadges(data.projectDetail, isReadOnlySharedOut),
        heroMetrics: buildHeroMetrics(data.projectDetail, data.contacts, normalizedShareHistory, isReadOnlySharedOut),
        summaryHighlights: buildSummaryHighlights(data.projectDetail, data.contacts, normalizedShareHistory, isReadOnlySharedOut),
        projectOverview: buildProjectOverview(
          data.projectDetail,
          data.contacts,
          data.followTimeline,
          normalizedShareHistory,
          isReadOnlySharedOut
        ),
        contactSummaryText: buildContactSummary(data.contacts),
        taskSummaryText: buildTaskSummary(data.taskSummary),
        timelineSummaryText: buildTimelineSummary(data.followTimeline),
        shareHistorySummaryText: buildShareHistorySummary(normalizedShareHistory),
        entryContextText: buildProjectDetailEntryContext(
          this.data.viewMode,
          this.data.entrySource,
          this.data.notificationType
        ),
        canMarkDeal: !(data.projectDetail.stage === '成交' || Number(data.projectDetail.actualAmountValue || 0) > 0),
        isReadOnlySharedOut,
        isLoading: false,
        dataSource: source
      }, () => {
        this.consumePendingTaskCompletion()
      })

      this.syncNotificationReadState(data.projectDetail, normalizedShareHistory)
    } catch (error) {
      this.setData({
        isLoading: false
      })
      wx.showToast({
        title: '暂时无法加载项目详情',
        icon: 'none'
      })
    }
  },

  async syncNotificationReadState(projectDetail, shareHistory = []) {
    const detail = projectDetail || {}
    const tasks = []

    if (this.data.viewMode === 'shared-out' && this.data.projectId) {
      tasks.push(
        markNotificationReadData({
          projectId: this.data.projectId,
          types: ['shared_imported', 'shared_followed']
        }),
        resolveNotificationData({
          projectId: this.data.projectId,
          types: ['shared_imported', 'shared_followed']
        })
      )
    }

    if (!detail.isSharedProject && this.data.projectId && Array.isArray(shareHistory) && shareHistory.length) {
      tasks.push(
        markNotificationReadData({
          projectId: this.data.projectId,
          types: ['shared_opened']
        }),
        resolveNotificationData({
          projectId: this.data.projectId,
          types: ['shared_opened']
        })
      )
    }

    if (detail.isSharedProject && this.data.projectId) {
      tasks.push(markNotificationReadData({
        projectId: this.data.projectId,
        types: ['project_taken_over']
      }))
    }

    if (!tasks.length) {
      return
    }

    try {
      await Promise.all(tasks)
      touchNotificationSync('detail_notification_synced')
    } catch (error) {
      // Keep the detail page available even if read-state sync fails.
    }
  },

  consumePendingTaskCompletion() {
    const taskId = String(this.data.pendingTaskId || '').trim()
    if (!this.data.pendingOpenTaskComplete || !taskId || this.data.showTaskCompleteSheet) {
      return
    }

    const currentTask = (this.data.tasks || []).find((item) => item.id === taskId)
    this.setData({
      pendingTaskId: '',
      pendingOpenTaskComplete: false
    }, () => {
      if (!currentTask || !currentTask.canComplete) {
        return
      }

      this.openTaskCompleteSheet({
        currentTarget: {
          dataset: {
            taskId
          }
        }
      })
    })
  },

  toggleContacts() {
    this.setData({
      showContacts: !this.data.showContacts
    })
  },

  goEditProject() {
    if (!this.data.projectId || this.data.isReadOnlySharedOut) {
      return
    }

    wx.navigateTo({
      url: `/pages/project-form/project-form?projectId=${this.data.projectId}`
    })
  },

  openFollowUp() {
    if (this.data.isReadOnlySharedOut) {
      wx.showToast({
        title: '该项目已外发，由接手方继续跟进',
        icon: 'none'
      })
      return
    }

    const url = this.data.projectId
      ? `/pages/follow-up/follow-up?projectId=${this.data.projectId}`
      : '/pages/follow-up/follow-up'

    wx.navigateTo({ url })
  },

  async updateTaskStatus(event) {
    const { taskId, status } = event.currentTarget.dataset
    if (!taskId || !status || this.data.taskActionId) {
      return
    }

    this.setData({
      taskActionId: taskId
    })

    try {
      const feedback = buildTaskStatusFeedback(status)
      const result = await updateTaskStatusData({
        taskId,
        status
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '任务状态更新失败')
      }

      wx.showToast({
        title: getTaskStatusToastTitle(status),
        icon: 'success'
      })

      touchNotificationSync('task_status_updated')
      await this.fetchProjectDetail()
      this.showTaskFeedback(feedback)
    } catch (error) {
      wx.showToast({
        title: error.message || '任务状态更新失败',
        icon: 'none'
      })
    } finally {
      this.setData({
        taskActionId: ''
      })
    }
  },

  openTaskCompleteSheet(event) {
    const { taskId } = event.currentTarget.dataset
    if (!taskId || this.data.taskActionId) {
      return
    }

    const currentTask = (this.data.tasks || []).find((item) => item.id === taskId)
    if (!currentTask) {
      return
    }

    const defaultNextTaskDraft = buildDefaultNextTaskDraft()

    this.setData({
      showTaskCompleteSheet: true,
      taskCompletionTaskId: taskId,
      taskCompletionTaskTitle: currentTask.title || '当前动作',
      taskCompletionText: currentTask.resultSummary || '',
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
    const shouldForce = force === true
    if (!shouldForce && this.data.taskActionId) {
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
      await this.fetchProjectDetail()
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

  openShareSheet() {
    if (this.data.isReadOnlySharedOut) {
      wx.showToast({
        title: '该项目已外发，无需再次分享',
        icon: 'none'
      })
      return
    }

    this.setData({
      showShareSheet: true
    })
  },

  closeShareSheet() {
    this.setData({
      showShareSheet: false
    })
  },

  openShareFlow(event) {
    const mode = String(event.currentTarget.dataset.mode || 'info').trim() || 'info'
    if (!this.data.projectId) {
      return
    }

    this.setData({
      showShareSheet: false
    })

    wx.navigateTo({
      url: `/pages/share-card/share-card?projectId=${this.data.projectId}&mode=${mode}&entry=sender`
    })
  },

  openDealPage() {
    if (!this.data.projectId || this.data.isReadOnlySharedOut) {
      return
    }

    if (!this.data.canMarkDeal) {
      wx.showToast({
        title: '该项目已成交',
        icon: 'none'
      })
      return
    }

    wx.navigateTo({
      url: `/pages/mark-deal/mark-deal?projectId=${this.data.projectId}`
    })
  },

  openPage(event) {
    const { url } = event.currentTarget.dataset

    if (url === '/pages/share-config/share-config' && this.data.projectId) {
      wx.navigateTo({
        url: `${url}?projectId=${this.data.projectId}`
      })
      return
    }

    wx.navigateTo({ url })
  },

  openSharedOutPage() {
    wx.navigateTo({
      url: '/pages/shared-out/shared-out'
    })
  }
})
