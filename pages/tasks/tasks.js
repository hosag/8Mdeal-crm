const {
  loadTasksData,
  updateTaskStatusData,
  requestSpeechToTextData
} = require('../../services/data')
const { buildTaskCompletionFeedback, getTaskCompletionToastTitle } = require('../../services/task-feedback')
const { touchNotificationSync } = require('../../utils/notification-sync')
const { syncCustomTabBar, syncPageAppearance } = require('../../utils/appearance')
const { markProjectRelatedCachesDirty } = require('../../utils/core-page-cache')
const { ensureActionAllowed } = require('../../utils/entitlement-guard')
const { startVoiceRecordingTicker, stopVoiceRecordingTicker } = require('../../utils/voice-recording')
const { openTabPage } = require('../../utils/tab-bar-navigation')

const FILTER_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: 'open', label: '未完成' },
  { key: 'overdue', label: '逾期' },
  { key: 'today', label: '今日' },
  { key: 'done', label: '已完成' },
  { key: 'canceled', label: '已取消' }
]
const SORT_OPTIONS = [
  { key: 'priority', label: '优先处理' },
  { key: 'due', label: '截止时间' },
  { key: 'updated', label: '最近更新' }
]
const NEXT_TASK_TEMPLATES = [
  { type: 'send_solution', label: '待发方案' },
  { type: 'send_quote', label: '待报价' },
  { type: 'demo', label: '待演示' },
  { type: 'report_solution', label: '待汇报方案' },
  { type: 'business_negotiation', label: '待商务谈判' },
  { type: 'research', label: '待调研' },
  { type: 'callback', label: '待回访' },
  { type: 'meeting', label: '待约会面' },
  { type: 'contract', label: '待签约' },
  { type: 'other', label: '其他动作' }
]
const MAX_RECORD_DURATION = 60000

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeFilter(value) {
  const current = normalizeText(value)
  return FILTER_OPTIONS.some((item) => item.key === current) ? current : 'open'
}

function normalizeSort(value) {
  const current = normalizeText(value)
  return SORT_OPTIONS.some((item) => item.key === current) ? current : 'priority'
}

function getSpeechRecorderManager() {
  if (!wx || typeof wx.getRecorderManager !== 'function') {
    return null
  }

  return wx.getRecorderManager()
}

function normalizeRecognizedText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function getVoiceFileExtension(filePath = '') {
  const matched = /\.([^.\\/]+)$/.exec(String(filePath || '').trim().toLowerCase())
  const extension = matched ? matched[1] : 'mp3'
  if (['mp3', 'm4a', 'wav', 'aac', 'amr'].includes(extension)) {
    return extension
  }

  return 'mp3'
}

function buildDefaultSummary() {
  return {
    totalCount: 0,
    openCount: 0,
    overdueCount: 0,
    todayCount: 0,
    doneCount: 0,
    canceledCount: 0
  }
}

function buildDefaultNextTaskDraft() {
  const base = new Date()
  base.setDate(base.getDate() + 1)
  base.setHours(10, 0, 0, 0)

  return {
    dueDate: `${base.getFullYear()}-${`${base.getMonth() + 1}`.padStart(2, '0')}-${`${base.getDate()}`.padStart(2, '0')}`,
    dueTime: `${`${base.getHours()}`.padStart(2, '0')}:${`${base.getMinutes()}`.padStart(2, '0')}`
  }
}

function normalizeTask(item, index) {
  const task = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
  return {
    id: normalizeText(task.id) || `task-${index}`,
    projectId: normalizeText(task.projectId),
    title: normalizeText(task.title) || '未命名动作',
    description: normalizeText(task.description),
    resultSummary: normalizeText(task.resultSummary),
    status: normalizeText(task.status) || 'pending',
    statusText: normalizeText(task.statusText) || '未完成',
    urgencyCode: normalizeText(task.urgencyCode),
    urgencyText: normalizeText(task.urgencyText) || '待处理',
    urgencyBadgeClass: normalizeText(task.urgencyBadgeClass),
    dueAtRaw: normalizeText(task.dueAtRaw),
    dueText: normalizeText(task.dueText) || '待安排',
    priority: normalizeText(task.priority) || 'normal',
    priorityText: normalizeText(task.priorityText) || '常规',
    type: normalizeText(task.type) || 'other',
    typeText: normalizeText(task.typeText) || '其他动作',
    projectName: normalizeText(task.projectName) || '未命名项目',
    clientName: normalizeText(task.clientName) || '未填写客户',
    stage: normalizeText(task.stage) || '线索',
    ownerLabel: normalizeText(task.ownerLabel) || '我负责推进',
    updatedAtText: normalizeText(task.updatedAtText) || '刚刚更新',
    canComplete: task.canComplete !== false && normalizeText(task.status) !== 'done' && normalizeText(task.status) !== 'canceled',
    canViewProject: task.canViewProject !== false && !!normalizeText(task.projectId)
  }
}

function buildFilterOptions(summary) {
  const current = summary || buildDefaultSummary()
  const countMap = {
    all: Number(current.totalCount || 0),
    open: Number(current.openCount || 0),
    overdue: Number(current.overdueCount || 0),
    today: Number(current.todayCount || 0),
    done: Number(current.doneCount || 0),
    canceled: Number(current.canceledCount || 0)
  }

  return FILTER_OPTIONS.map((item) => ({
    ...item,
    count: countMap[item.key] || 0
  }))
}

function buildResultSummaryText(count, filter, sort, keyword) {
  const filterMeta = FILTER_OPTIONS.find((item) => item.key === filter) || FILTER_OPTIONS[1]
  const sortMeta = SORT_OPTIONS.find((item) => item.key === sort) || SORT_OPTIONS[0]
  const parts = [`${filterMeta.label} ${count} 条`]
  if (keyword) {
    parts.push(`搜索“${keyword}”`)
  }
  parts.push(`排序：${sortMeta.label}`)
  return parts.join(' · ')
}

Page({
  data: {
    appearancePageClass: '',
    filter: 'open',
    sort: 'priority',
    keyword: '',
    filterOptions: buildFilterOptions(buildDefaultSummary()),
    sortOptions: SORT_OPTIONS,
    summary: buildDefaultSummary(),
    tasks: [],
    resultSummaryText: '正在整理任务数据',
    emptyTitle: '暂无推进动作',
    emptyDesc: '项目里新增推进任务后，会自动出现在这里。',
    emptyActionText: '查看我的项目',
    nextTaskTemplates: NEXT_TASK_TEMPLATES,
    showTaskCompleteSheet: false,
    taskCompletionTaskId: '',
    taskCompletionProjectId: '',
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
    isTaskCompletionVoiceSupported: true,
    isTaskCompletionVoiceRecording: false,
    isTaskCompletionVoiceRecognizing: false,
    taskCompletionVoiceElapsedText: '',
    taskActionId: '',
    taskFeedback: {
      title: '',
      detail: ''
    },
    isLoading: true,
    isLoadFailed: false,
    loadError: '',
    dataSource: 'CloudBase'
  },

  async onLoad(options = {}) {
    this.isPageActive = true
    syncPageAppearance(this)
    this.setData({
      filter: normalizeFilter(options.filter),
      sort: normalizeSort(options.sort),
      keyword: normalizeText(options.keyword ? decodeURIComponent(options.keyword) : '')
    })
    this.initTaskCompletionKeyboard()
    await this.fetchTasks()
  },

  async onShow() {
    this.isPageActive = true
    syncPageAppearance(this)
    this.initTaskCompletionKeyboard()
    if (!this.data.isLoading) {
      await this.fetchTasks()
    }
  },

  onHide() {
    this.isPageActive = false
    this.stopTaskCompletionVoiceInput({ silent: true })
    stopVoiceRecordingTicker(this, 'taskCompletionVoiceTimer', 'taskCompletionVoiceElapsedText')
    this.clearTaskFeedbackTimer()
    this.destroyTaskCompletionKeyboard()
  },

  onUnload() {
    this.isPageActive = false
    this.stopTaskCompletionVoiceInput({ silent: true })
    stopVoiceRecordingTicker(this, 'taskCompletionVoiceTimer', 'taskCompletionVoiceElapsedText')
    this.clearTaskFeedbackTimer()
    this.destroyTaskCompletionKeyboard()
  },

  async onPullDownRefresh() {
    await this.fetchTasks()
    wx.stopPullDownRefresh()
  },

  clearTaskFeedbackTimer() {
    if (this.taskFeedbackTimer) {
      clearTimeout(this.taskFeedbackTimer)
      this.taskFeedbackTimer = null
    }
  },

  showTaskFeedback(feedback = {}) {
    this.clearTaskFeedbackTimer()
    this.setData({
      taskFeedback: {
        title: normalizeText(feedback.title),
        detail: normalizeText(feedback.detail)
      }
    })

    if (feedback.title) {
      this.taskFeedbackTimer = setTimeout(() => {
        this.dismissTaskFeedback()
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

  async fetchTasks() {
    this.setData({
      isLoading: true,
      isLoadFailed: false,
      loadError: ''
    })

    try {
      const result = await loadTasksData({
        filter: this.data.filter,
        sort: this.data.sort,
        keyword: this.data.keyword,
        limit: 120
      })
      const payload = result && result.data ? result.data : {}
      const summary = {
        ...buildDefaultSummary(),
        ...(payload.summary || {})
      }
      const tasks = (Array.isArray(payload.tasks) ? payload.tasks : []).map(normalizeTask)

      this.setData({
        summary,
        tasks,
        filterOptions: buildFilterOptions(summary),
        resultSummaryText: buildResultSummaryText(tasks.length, this.data.filter, this.data.sort, this.data.keyword),
        emptyTitle: this.data.keyword ? '没有找到匹配任务' : '暂无推进动作',
        emptyDesc: this.data.keyword ? '可以换任务、项目或客户关键词再试一次。' : '项目里新增推进任务后，会自动出现在这里。',
        emptyActionText: this.data.keyword ? '清空搜索' : '查看我的项目',
        isLoading: false,
        dataSource: result.source || 'CloudBase'
      })
    } catch (error) {
      const message = error && error.message ? error.message : '当前无法同步云端数据，请稍后重试'
      this.setData({
        summary: buildDefaultSummary(),
        tasks: [],
        filterOptions: buildFilterOptions(buildDefaultSummary()),
        resultSummaryText: message,
        isLoading: false,
        isLoadFailed: true,
        loadError: message
      })
      wx.showToast({
        title: message.indexOf('listTasks') >= 0 ? '请部署 listTasks' : '任务同步失败',
        icon: 'none'
      })
    }
  },

  retryFetch() {
    this.fetchTasks()
  },

  setFilter(event) {
    const filter = normalizeFilter(event.currentTarget.dataset.filter)
    if (filter === this.data.filter) {
      return
    }

    this.setData({ filter }, () => this.fetchTasks())
  },

  setSort(event) {
    const sort = normalizeSort(event.currentTarget.dataset.sort)
    if (sort === this.data.sort) {
      return
    }

    this.setData({ sort }, () => this.fetchTasks())
  },

  onSearchInput(event) {
    const keyword = normalizeText(event.detail.value)
    this.setData({ keyword })
    clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => this.fetchTasks(), 260)
  },

  clearSearch() {
    this.setData({ keyword: '' }, () => this.fetchTasks())
  },

  handleEmptyAction() {
    if (this.data.keyword) {
      this.clearSearch()
      return
    }

    openTabPage('/pages/projects/projects?quickFilter=task_open&sortMode=task&source=tasks-empty')
  },

  openProjectDetail(event) {
    const projectId = normalizeText(event.currentTarget.dataset.projectId)
    if (!projectId) {
      return
    }

    wx.navigateTo({
      url: `/pages/project-detail/project-detail?projectId=${projectId}&view=tasks`
    })
  },

  openTaskCompleteSheet(event) {
    const taskId = normalizeText(event.currentTarget.dataset.taskId)
    if (!taskId || this.data.taskActionId) {
      return
    }

    const currentTask = (this.data.tasks || []).find((item) => item.id === taskId)
    if (!currentTask || !currentTask.canComplete) {
      return
    }

    const defaultNextTaskDraft = buildDefaultNextTaskDraft()
    this.setData({
      showTaskCompleteSheet: true,
      taskCompletionTaskId: taskId,
      taskCompletionProjectId: currentTask.projectId || '',
      taskCompletionTaskTitle: currentTask.title || '当前任务',
      taskCompletionText: '',
      taskCompletionCreateNextTask: false,
      taskCompletionNextTaskTitle: '',
      taskCompletionNextTaskType: 'callback',
      taskCompletionNextTaskDate: defaultNextTaskDraft.dueDate,
      taskCompletionNextTaskTime: defaultNextTaskDraft.dueTime,
      taskCompletionNextTaskDescription: '',
      isTaskCompletionVoiceRecognizing: false
    }, () => {
      syncCustomTabBar(this, this.data.appearancePageClass)
    })
    this.syncTaskCompletionLayout(0, false)
    this.initTaskCompletionVoiceRecognition()
  },

  closeTaskCompleteSheet(force = false) {
    if (!force && this.data.taskActionId) {
      return
    }

    this.stopTaskCompletionVoiceInput({ silent: true })
    this.setData({
      showTaskCompleteSheet: false,
      taskCompletionTaskId: '',
      taskCompletionProjectId: '',
      taskCompletionTaskTitle: '',
      taskCompletionText: '',
      taskCompletionCreateNextTask: false,
      taskCompletionNextTaskTitle: '',
      taskCompletionNextTaskType: 'callback',
      taskCompletionNextTaskDate: '',
      taskCompletionNextTaskTime: '',
      taskCompletionNextTaskDescription: '',
      isTaskCompletionVoiceRecording: false,
      isTaskCompletionVoiceRecognizing: false
    }, () => {
      syncCustomTabBar(this, this.data.appearancePageClass)
    })
    this.syncTaskCompletionLayout(0, false)
  },

  onTaskCompletionInput(event) {
    this.setData({
      taskCompletionText: String(event.detail.value || '')
    })
  },

  openTaskCompletionVoiceGuide() {
    wx.showModal({
      title: '语音服务未就绪',
      content: '当前设备暂不支持原生录音，或云端语音识别服务尚未完成配置。请先确认真机环境与云函数配置。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  openTaskCompletionRecordSettingGuide() {
    wx.showModal({
      title: '需要麦克风权限',
      content: '语音录入需要使用麦克风。请允许录音权限后再试。',
      confirmText: '去设置',
      cancelText: '取消',
      success: (result) => {
        if (result.confirm) {
          wx.openSetting({})
        }
      }
    })
  },

  getSetting() {
    return new Promise((resolve, reject) => {
      wx.getSetting({
        success: resolve,
        fail: reject
      })
    })
  },

  authorizeRecordScope() {
    return new Promise((resolve, reject) => {
      wx.authorize({
        scope: 'scope.record',
        success: resolve,
        fail: reject
      })
    })
  },

  async ensureTaskCompletionRecordScope() {
    try {
      const setting = await this.getSetting()
      if (setting && setting.authSetting && setting.authSetting['scope.record']) {
        return true
      }

      await this.authorizeRecordScope()
      return true
    } catch (error) {
      this.openTaskCompletionRecordSettingGuide()
      return false
    }
  },

  initTaskCompletionVoiceRecognition() {
    if (this.taskCompletionVoiceManager) {
      return true
    }

    const manager = getSpeechRecorderManager()
    if (!manager || typeof manager.onStart !== 'function') {
      this.setData({
        isTaskCompletionVoiceSupported: false,
        isTaskCompletionVoiceRecording: false,
        isTaskCompletionVoiceRecognizing: false
      })
      return false
    }

    manager.onStart(() => {
      if (!this.isPageActive) {
        return
      }

      this.skipTaskCompletionVoiceCommit = false
      startVoiceRecordingTicker(this, 'taskCompletionVoiceTimer', 'taskCompletionVoiceElapsedText')
      this.setData({
        isTaskCompletionVoiceSupported: true,
        isTaskCompletionVoiceRecording: true,
        isTaskCompletionVoiceRecognizing: false
      })
    })

    manager.onStop(async (result) => {
      stopVoiceRecordingTicker(this, 'taskCompletionVoiceTimer', 'taskCompletionVoiceElapsedText')

      if (this.skipTaskCompletionVoiceCommit) {
        this.skipTaskCompletionVoiceCommit = false
        this.setData({
          isTaskCompletionVoiceRecording: false,
          isTaskCompletionVoiceRecognizing: false
        })
        return
      }

      if (!this.isPageActive || !this.data.showTaskCompleteSheet) {
        return
      }

      this.setData({
        isTaskCompletionVoiceRecording: false,
        isTaskCompletionVoiceRecognizing: true
      })

      await this.transcribeTaskCompletionVoiceFile(result)
    })

    manager.onError((error) => {
      if (!this.isPageActive) {
        return
      }

      stopVoiceRecordingTicker(this, 'taskCompletionVoiceTimer', 'taskCompletionVoiceElapsedText')
      const errMsg = error && (error.retmsg || error.msg || error.errMsg) ? (error.retmsg || error.msg || error.errMsg) : ''
      this.setData({
        isTaskCompletionVoiceRecording: false,
        isTaskCompletionVoiceRecognizing: false
      })

      if (errMsg && (errMsg.includes('auth deny') || errMsg.includes('auth denied') || errMsg.includes('permission'))) {
        this.openTaskCompletionRecordSettingGuide()
        return
      }

      wx.showToast({
        title: '语音录入失败',
        icon: 'none'
      })
    })

    this.taskCompletionVoiceManager = manager
    this.setData({
      isTaskCompletionVoiceSupported: true
    })
    return true
  },

  async handleTaskCompletionVoiceInput() {
    if (this.data.isTaskCompletionVoiceRecognizing || this.data.taskActionId) {
      return
    }

    if (this.data.isTaskCompletionVoiceRecording) {
      this.stopTaskCompletionVoiceInput()
      return
    }

    if (!this.initTaskCompletionVoiceRecognition()) {
      this.openTaskCompletionVoiceGuide()
      return
    }

    const decision = await ensureActionAllowed('speech', { guide: true })
    if (!decision.allowed) {
      return
    }

    const hasPermission = await this.ensureTaskCompletionRecordScope()
    if (!hasPermission) {
      return
    }

    try {
      this.setData({
        isTaskCompletionVoiceRecognizing: false
      })

      this.taskCompletionVoiceManager.start({
        duration: MAX_RECORD_DURATION,
        format: 'mp3',
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 32000
      })
    } catch (error) {
      this.setData({
        isTaskCompletionVoiceRecording: false,
        isTaskCompletionVoiceRecognizing: false
      })
      wx.showToast({
        title: '录音启动失败',
        icon: 'none'
      })
    }
  },

  stopTaskCompletionVoiceInput(options = {}) {
    if (!this.taskCompletionVoiceManager || !this.data.isTaskCompletionVoiceRecording) {
      return
    }

    this.skipTaskCompletionVoiceCommit = Boolean(options.silent)
    stopVoiceRecordingTicker(this, 'taskCompletionVoiceTimer', 'taskCompletionVoiceElapsedText')

    this.setData({
      isTaskCompletionVoiceRecording: false,
      isTaskCompletionVoiceRecognizing: !options.silent
    })

    try {
      this.taskCompletionVoiceManager.stop()
    } catch (error) {
      this.setData({
        isTaskCompletionVoiceRecognizing: false
      })
    }
  },

  async uploadTaskCompletionVoiceFile(filePath) {
    if (!wx.cloud || typeof wx.cloud.uploadFile !== 'function') {
      throw new Error('当前环境未连接云存储')
    }

    const extension = getVoiceFileExtension(filePath)
    const taskId = normalizeText(this.data.taskCompletionTaskId) || 'task'
    const cloudPath = `voiceInputs/task-completion/${taskId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
    const result = await wx.cloud.uploadFile({
      cloudPath,
      filePath
    })

    if (!result || !result.fileID) {
      throw new Error('录音上传失败，请重新试一次')
    }

    return {
      fileID: result.fileID,
      extension
    }
  },

  async transcribeTaskCompletionVoiceFile(result = {}) {
    const filePath = normalizeText(result.tempFilePath)
    if (!filePath) {
      this.setData({
        isTaskCompletionVoiceRecording: false,
        isTaskCompletionVoiceRecognizing: false
      })
      wx.showToast({
        title: '未生成有效音频',
        icon: 'none'
      })
      return
    }

    try {
      const uploadResult = await this.uploadTaskCompletionVoiceFile(filePath)
      if (!this.isPageActive || !this.data.showTaskCompleteSheet) {
        this.setData({
          isTaskCompletionVoiceRecording: false,
          isTaskCompletionVoiceRecognizing: false
        })
        return
      }

      const asrResult = await requestSpeechToTextData({
        fileID: uploadResult.fileID,
        voiceFormat: uploadResult.extension,
        projectId: '',
        taskId: this.data.taskCompletionTaskId || '',
        scene: 'task_completion_result',
        duration: Number(result.duration || 0) || 0
      })

      const recognizedText = normalizeRecognizedText(asrResult && asrResult.text)
      if (!recognizedText) {
        this.setData({
          isTaskCompletionVoiceRecording: false,
          isTaskCompletionVoiceRecognizing: false
        })
        wx.showToast({
          title: '未识别出有效内容',
          icon: 'none'
        })
        return
      }

      const currentContent = normalizeText(this.data.taskCompletionText)
      const nextContent = currentContent ? `${currentContent}\n${recognizedText}` : recognizedText

      this.setData({
        taskCompletionText: nextContent,
        isTaskCompletionVoiceRecording: false,
        isTaskCompletionVoiceRecognizing: false
      })

      wx.showToast({
        title: '语音已转文字',
        icon: 'success'
      })
    } catch (error) {
      const errMsg = error && error.message ? error.message : ''
      this.setData({
        isTaskCompletionVoiceRecording: false,
        isTaskCompletionVoiceRecognizing: false
      })

      if (/密钥|SECRET|语音识别服务/.test(errMsg)) {
        this.openTaskCompletionVoiceGuide()
        return
      }

      wx.showToast({
        title: '语音识别失败',
        icon: 'none'
      })
    }
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
    const actionsStyle = ''

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
    const taskId = normalizeText(this.data.taskCompletionTaskId)
    const resultSummary = normalizeText(this.data.taskCompletionText)
    const shouldCreateNextTask = !!this.data.taskCompletionCreateNextTask
    const nextTaskTitle = normalizeText(this.data.taskCompletionNextTaskTitle)
    const nextTaskDate = normalizeText(this.data.taskCompletionNextTaskDate)
    const nextTaskTime = normalizeText(this.data.taskCompletionNextTaskTime)
    const nextTaskDescription = normalizeText(this.data.taskCompletionNextTaskDescription)

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

    const decision = await ensureActionAllowed('create_task', { refresh: true, guide: true })
    if (!decision.allowed) {
      return
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

      const completedProjectId = String(this.data.taskCompletionProjectId || '').trim()
      touchNotificationSync('task_completed')
      markProjectRelatedCachesDirty({
        projectId: completedProjectId,
        includeHome: true,
        includeProjects: true,
        includeSharedOut: true,
        includeProjectDetail: true
      })
      this.closeTaskCompleteSheet(true)
      await this.fetchTasks()
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
  }
})
