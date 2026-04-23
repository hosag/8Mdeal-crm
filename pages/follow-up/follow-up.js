const {
  loadProjectDetailData,
  requestFollowUpSummary,
  requestNextFollowUpSuggestion,
  saveFollowUpData,
  reportSystemFailureData,
  resolveNotificationData
} = require('../../services/data')
const { buildFollowUpEntryHint } = require('../../utils/navigation-context')
const { touchNotificationSync } = require('../../utils/notification-sync')
const { syncPageAppearance } = require('../../utils/appearance')

const MAX_RECORD_DURATION = 60000

const HELP_CONTENTS = {
  record_intro: {
    title: '记录说明',
    content: '先写原始跟进内容，再让 AI 帮你整理摘要、风险和阶段建议。确认无误后再保存，这样时间线会更清晰。'
  },
  basic_meta: {
    title: '基础信息',
    content: '这里决定这条记录的时间和触达方式，后续 AI 整理和时间线展示都会基于这部分内容。'
  },
  follow_up_time: {
    title: '跟进时间',
    content: '这里记录本次实际发生的跟进时间，时间线会按这个时间排序。点击日期或时间框即可使用系统选择器。'
  },
  follow_up_method: {
    title: '跟进方式',
    content: '用于区分这次是电话、微信、邮件还是面谈，后续复盘时能快速看出推进节奏。'
  },
  advance_settings: {
    title: '推进设置',
    content: '这里决定项目后续的阶段与待办节奏。保存后，项目详情和首页待办都会基于这部分变化更新。'
  },
  stage_change: {
    title: '用户手动阶段变更',
    content: '如果这次跟进推动了项目进展，你可以手动改阶段；如果只是补充信息，保持“不变更”即可。'
  },
  next_follow: {
    title: '下次跟进时间',
    content: '这里记录下次动作时间，首页待办和项目详情会基于这个时间更新。'
  },
  task_board: {
    title: '推进动作',
    content: '这里记录接下来要落地的具体动作，例如发方案、报价、回访。动作会进入项目详情、首页动作优先和消息中心提醒。'
  },
  attachments: {
    title: '附件材料',
    content: '支持上传会议照片、聊天截图和现场资料。最多 9 张，上传后会进入云存储，并随这条跟进一起保存。'
  },
  raw_content: {
    title: '原始跟进内容',
    content: '这里尽量写原话和现场判断，不用先润色。越贴近真实对话，AI 整理后的摘要和风险提示通常越准确，也支持直接语音录入转文字。'
  },
  ai_result: {
    title: 'AI 整理结果',
    content: 'AI 会把原始记录拆成摘要、关键进展、风险和阶段建议。回填整理结果时，如果建议阶段与当前阶段不同，系统会顺手让你确认是否同步更新。'
  },
  ai_next: {
    title: 'AI 下一步建议',
    content: '基于本次整理结果，AI 会进一步给出下一步动作、建议对象、建议时间和任务草稿。你可以一键回填到下次跟进时间和推进动作。'
  }
}

function getDraftStorageKey(projectId) {
  return `follow-up-draft:${projectId || 'default'}`
}

function padNumber(value) {
  return `${value}`.padStart(2, '0')
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`
}

function formatTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  return `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`
}

function createDefaultDates() {
  const now = new Date()
  const next = new Date(now)
  next.setDate(now.getDate() + 1)

  return {
    followUpDate: formatDate(now),
    followUpClock: formatTime(now),
    nextFollowUpDate: formatDate(next),
    nextFollowUpClock: '10:00'
  }
}

const defaultDates = createDefaultDates()

const MODEL_SOURCE_DEFAULTS = {
  sourceType: 'model',
  sourceLabel: '大模型建议',
  providerLabel: 'CloudBase AI',
  modelName: 'hunyuan-exp / hunyuan-turbos-latest',
  canRegenerate: true
}

const FALLBACK_SOURCE_DEFAULTS = {
  sourceType: 'fallback',
  sourceLabel: '基础建议',
  providerLabel: '本地规则引擎',
  modelName: '',
  canRegenerate: true
}

function getSpeechPlugin() {
  return null
}

function normalizeRecognizedText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

const TASK_TEMPLATES = [
  { type: 'send_solution', label: '待发方案' },
  { type: 'send_quote', label: '待报价' },
  { type: 'callback', label: '待回访' },
  { type: 'contract', label: '待签约' },
  { type: 'other', label: '其他动作' }
]

function getTaskTypeLabel(type) {
  const current = String(type || '').trim()
  const currentTemplate = TASK_TEMPLATES.find((item) => item.type === current)
  return currentTemplate ? currentTemplate.label : '其他动作'
}

function buildTaskDraft(partial = {}, defaultDatesValue = defaultDates) {
  return {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: partial.title || '',
    type: partial.type || 'other',
    typeLabel: partial.typeLabel || getTaskTypeLabel(partial.type),
    priority: partial.priority || 'normal',
    dueDate: partial.dueDate || defaultDatesValue.nextFollowUpDate,
    dueTime: partial.dueTime || defaultDatesValue.nextFollowUpClock,
    description: partial.description || ''
  }
}

function normalizeTaskDrafts(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => buildTaskDraft(item))
}

function normalizeAiSourceMeta(value) {
  const payload = value && typeof value === 'object' ? value : {}
  const sourceType = String(payload.sourceType || (payload.fallback ? 'fallback' : 'model')).trim() === 'fallback'
    ? 'fallback'
    : 'model'
  const defaults = sourceType === 'fallback' ? FALLBACK_SOURCE_DEFAULTS : MODEL_SOURCE_DEFAULTS
  const providerLabel = String(payload.providerLabel || defaults.providerLabel).trim()
  const modelName = String(payload.modelName || defaults.modelName).trim()
  const sourceLabel = String(payload.sourceLabel || defaults.sourceLabel).trim()
  const canRegenerate = payload.canRegenerate !== false

  return {
    sourceType,
    sourceLabel,
    providerLabel,
    modelName,
    canRegenerate,
    sourceCaption: modelName ? `${providerLabel} · ${modelName}` : providerLabel,
    regenerateLabel: sourceType === 'fallback' ? '再次获取大模型建议' : '重新建议'
  }
}

function mergeSuggestedTaskDrafts(existingDrafts, suggestionDrafts) {
  const baseList = Array.isArray(existingDrafts) ? existingDrafts.slice() : []
  const nextList = Array.isArray(suggestionDrafts) ? suggestionDrafts : []
  const seenKeys = new Set(baseList.map((item) => `${String(item.title || '').trim()}::${String(item.type || '').trim()}`))

  nextList.forEach((item) => {
    if (baseList.length >= 3) {
      return
    }

    const title = String(item.title || '').trim()
    const type = String(item.type || '').trim()
    const dedupeKey = `${title}::${type}`
    if (!title || seenKeys.has(dedupeKey)) {
      return
    }

    seenKeys.add(dedupeKey)
    baseList.push(buildTaskDraft(item))
  })

  return baseList.slice(0, 3)
}

function normalizeNextSuggestion(value) {
  const suggestion = value && typeof value === 'object' ? value : {}
  const taskDrafts = Array.isArray(suggestion.taskDrafts)
    ? suggestion.taskDrafts.map((item) => ({
        ...item,
        typeLabel: getTaskTypeLabel(item && item.type)
      }))
    : []

  return {
    ...suggestion,
    ...normalizeAiSourceMeta(suggestion),
    taskDrafts
  }
}

function normalizeAiSummaryResult(value) {
  const result = value && typeof value === 'object' ? value : {}
  return {
    ...result,
    ...normalizeAiSourceMeta(result)
  }
}

function showStageConfirmModal(payload = {}) {
  return new Promise((resolve) => {
    wx.showModal({
      title: `AI 建议将阶段调整为“${payload.recommendedStage || ''}”`,
      content: payload.reason ? `原因：${payload.reason}` : '是否在回填整理结果时，同时更新项目阶段？',
      confirmText: '同时更新',
      cancelText: '只回填内容',
      success: resolve,
      fail: () => resolve({
        confirm: false,
        cancel: true
      })
    })
  })
}

Page({
  data: {
    appearancePageClass: '',
    projectId: '',
    projectTitle: '未指定项目',
    projectStage: '线索',
    entryHintText: '',
    methods: ['电话', '微信', '邮件', '面谈', '其他'],
    currentMethod: '面谈',
    stages: ['不变更', '线索', '洽谈', '方案', '商务', '成交', '流失'],
    stageIndex: 0,
    followUpDate: defaultDates.followUpDate,
    followUpClock: defaultDates.followUpClock,
    nextFollowUpDate: defaultDates.nextFollowUpDate,
    nextFollowUpClock: defaultDates.nextFollowUpClock,
    content: '',
    attachments: [],
    isAiLoading: false,
    isSaving: false,
    aiResult: null,
    aiNextSuggestion: null,
    aiError: '',
    aiNextError: '',
    isAiNextLoading: false,
    showAiDialog: false,
    draftUpdatedAt: '',
    showHelpDialog: false,
    helpTitle: '',
    helpContent: '',
    dataSource: 'Mock Demo',
    isVoiceSupported: false,
    isVoiceRecording: false,
    isVoiceRecognizing: false,
    voiceStatusText: '点击语音录入，可把口述内容自动追加到记录框',
    voicePreviewText: '',
    taskTemplates: TASK_TEMPLATES,
    taskDrafts: []
  },

  async onLoad(options) {
    syncPageAppearance(this)
    this.isPageActive = true
    const projectId = options.projectId || ''
    const entryHintText = buildFollowUpEntryHint(options.entry, options.source, options.type)
    this.setData({
      projectId,
      entryHintText
    })

    if (!projectId) {
      const app = getApp()
      this.setData({
        dataSource: app && app.globalData ? app.globalData.dataSourceLabel : 'Mock Demo'
      })
      this.restoreDraft()
      this.initVoiceRecognition()
      return
    }

    try {
      const { data, source } = await loadProjectDetailData(projectId)
      this.setData({
        dataSource: source,
        projectTitle: data.projectDetail.name,
        projectStage: data.projectDetail.stage,
        stageIndex: 0
      })
    } catch (error) {
      wx.showToast({
        title: '当前无法加载完整项目上下文，将使用简化模式',
        icon: 'none'
      })
    }

    this.restoreDraft()
    this.initVoiceRecognition()
  },

  onShow() {
    syncPageAppearance(this)
    this.isPageActive = true
  },

  onHide() {
    this.isPageActive = false
    if (this.submitRedirectTimer) {
      clearTimeout(this.submitRedirectTimer)
      this.submitRedirectTimer = null
    }
    this.stopVoiceInput({
      silent: true
    })
  },

  onUnload() {
    this.isPageActive = false
    if (this.submitRedirectTimer) {
      clearTimeout(this.submitRedirectTimer)
      this.submitRedirectTimer = null
    }
    this.stopVoiceInput({
      silent: true
    })
  },

  setMethod(event) {
    this.setData({
      currentMethod: event.currentTarget.dataset.method
    })
  },

  onContentInput(event) {
    this.setData({
      content: event.detail.value
    })
  },

  onStageChange(event) {
    this.setData({
      stageIndex: Number(event.detail.value)
    })
  },

  setStage(event) {
    this.setData({
      stageIndex: Number(event.currentTarget.dataset.index)
    })
  },

  onFollowUpDateInput(event) {
    this.setData({
      followUpDate: event.detail.value
    })
  },

  onFollowUpClockInput(event) {
    this.setData({
      followUpClock: event.detail.value
    })
  },

  onNextFollowUpDateInput(event) {
    this.setData({
      nextFollowUpDate: event.detail.value
    })
  },

  onNextFollowUpClockInput(event) {
    this.setData({
      nextFollowUpClock: event.detail.value
    })
  },

  openHelp(event) {
    const key = event.currentTarget.dataset.key
    const payload = HELP_CONTENTS[key]
    if (!payload) {
      return
    }

    this.setData({
      showHelpDialog: true,
      helpTitle: payload.title,
      helpContent: payload.content
    })
  },

  closeHelp() {
    this.setData({
      showHelpDialog: false,
      helpTitle: '',
      helpContent: ''
    })
  },

  restoreDraft() {
    try {
      const draft = wx.getStorageSync(getDraftStorageKey(this.data.projectId))
      if (!draft || typeof draft !== 'object') {
        return
      }

      this.setData({
        currentMethod: draft.currentMethod || this.data.currentMethod,
        stageIndex: typeof draft.stageIndex === 'number' ? draft.stageIndex : this.data.stageIndex,
        followUpDate: draft.followUpDate || this.data.followUpDate,
        followUpClock: draft.followUpClock || this.data.followUpClock,
        nextFollowUpDate: draft.nextFollowUpDate || this.data.nextFollowUpDate,
        nextFollowUpClock: draft.nextFollowUpClock || this.data.nextFollowUpClock,
        content: draft.content || '',
        attachments: Array.isArray(draft.attachments) ? draft.attachments : [],
        taskDrafts: normalizeTaskDrafts(draft.taskDrafts),
        aiResult: draft.aiResult ? normalizeAiSummaryResult(draft.aiResult) : null,
        aiNextSuggestion: draft.aiNextSuggestion ? normalizeNextSuggestion(draft.aiNextSuggestion) : null,
        aiError: '',
        aiNextError: '',
        draftUpdatedAt: draft.draftUpdatedAt || ''
      })

      wx.showToast({
        title: '已恢复暂存草稿',
        icon: 'none'
      })
    } catch (error) {
      // Ignore local draft restore errors to avoid blocking input.
    }
  },

  clearDraft() {
    try {
      wx.removeStorageSync(getDraftStorageKey(this.data.projectId))
    } catch (error) {
      // Ignore local draft cleanup errors.
    }

    this.setData({
      draftUpdatedAt: ''
    })
  },

  saveDraft() {
    const now = new Date()
    const draft = {
      currentMethod: this.data.currentMethod,
      stageIndex: this.data.stageIndex,
      followUpDate: this.data.followUpDate,
      followUpClock: this.data.followUpClock,
      nextFollowUpDate: this.data.nextFollowUpDate,
      nextFollowUpClock: this.data.nextFollowUpClock,
      content: this.data.content,
      attachments: this.data.attachments.map((item) => ({
        name: item.name || '',
        fileId: item.fileId || '',
        tempFilePath: item.tempFilePath || '',
        previewPath: item.previewPath || item.tempFilePath || item.fileId || ''
      })),
      taskDrafts: this.data.taskDrafts.map((item) => ({
        localId: item.localId,
        title: item.title,
        type: item.type,
        typeLabel: item.typeLabel,
        priority: item.priority,
        dueDate: item.dueDate,
        dueTime: item.dueTime,
        description: item.description
      })),
      aiResult: this.data.aiResult,
      aiNextSuggestion: this.data.aiNextSuggestion,
      draftUpdatedAt: `${formatDate(now)} ${formatTime(now)}`
    }

    try {
      wx.setStorageSync(getDraftStorageKey(this.data.projectId), draft)
      this.setData({
        draftUpdatedAt: draft.draftUpdatedAt
      })
      wx.showToast({
        title: '草稿已暂存',
        icon: 'success'
      })
    } catch (error) {
      wx.showToast({
        title: '草稿暂存失败',
        icon: 'none'
      })
    }
  },

  addTaskTemplate(event) {
    if (this.data.taskDrafts.length >= 3) {
      wx.showToast({
        title: '最多添加 3 条任务',
        icon: 'none'
      })
      return
    }

    const { type, label } = event.currentTarget.dataset
    const taskDrafts = this.data.taskDrafts.concat(buildTaskDraft({
      title: label || '',
      type: type || 'other',
      typeLabel: getTaskTypeLabel(type || 'other'),
      dueDate: this.data.nextFollowUpDate,
      dueTime: this.data.nextFollowUpClock
    }))

    this.setData({
      taskDrafts
    })
  },

  addCustomTask() {
    if (this.data.taskDrafts.length >= 3) {
      wx.showToast({
        title: '最多添加 3 条任务',
        icon: 'none'
      })
      return
    }

    this.setData({
      taskDrafts: this.data.taskDrafts.concat(buildTaskDraft({
        dueDate: this.data.nextFollowUpDate,
        dueTime: this.data.nextFollowUpClock
      }))
    })
  },

  updateTaskDraftField(event) {
    const index = Number(event.currentTarget.dataset.index)
    const field = event.currentTarget.dataset.field
    if (Number.isNaN(index) || !field || !this.data.taskDrafts[index]) {
      return
    }

    const taskDrafts = this.data.taskDrafts.slice()
    taskDrafts[index] = {
      ...taskDrafts[index],
      [field]: String(event.detail.value || '')
    }

    this.setData({
      taskDrafts
    })
  },

  updateTaskDraftPicker(event) {
    const index = Number(event.currentTarget.dataset.index)
    const field = event.currentTarget.dataset.field
    if (Number.isNaN(index) || !field || !this.data.taskDrafts[index]) {
      return
    }

    const taskDrafts = this.data.taskDrafts.slice()
    taskDrafts[index] = {
      ...taskDrafts[index],
      [field]: String(event.detail.value || '')
    }

    this.setData({
      taskDrafts
    })
  },

  removeTaskDraft(event) {
    const index = Number(event.currentTarget.dataset.index)
    if (Number.isNaN(index)) {
      return
    }

    const taskDrafts = this.data.taskDrafts.slice()
    taskDrafts.splice(index, 1)
    this.setData({
      taskDrafts
    })
  },

  buildTaskPayloads() {
    const tasks = []
    for (let index = 0; index < this.data.taskDrafts.length; index += 1) {
      const draft = this.data.taskDrafts[index] || {}
      const title = String(draft.title || '').trim()
      const description = String(draft.description || '').trim()
      const dueDate = String(draft.dueDate || '').trim()
      const dueTime = String(draft.dueTime || '').trim()
      const hasAnyValue = Boolean(title || description || dueDate || dueTime)

      if (!hasAnyValue) {
        continue
      }

      if (!title) {
        return {
          ok: false,
          message: `第 ${index + 1} 条任务还没填写标题`
        }
      }

      if (!dueDate || !dueTime) {
        return {
          ok: false,
          message: `第 ${index + 1} 条任务还没填写截止时间`
        }
      }

      tasks.push({
        title,
        type: draft.type || 'other',
        priority: draft.priority || 'normal',
        dueDate,
        dueTime,
        description
      })
    }

    return {
      ok: true,
      tasks
    }
  },

  async chooseImages() {
    if (!wx.cloud || !wx.cloud.uploadFile) {
      wx.showToast({
        title: '当前环境未连接云存储',
        icon: 'none'
      })
      return
    }

    const remainCount = 9 - this.data.attachments.length
    if (remainCount <= 0) {
      wx.showToast({
        title: '最多上传 9 张图片',
        icon: 'none'
      })
      return
    }

    try {
      const result = await wx.chooseMedia({
        count: remainCount,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed']
      })

      const tempFiles = Array.isArray(result.tempFiles) ? result.tempFiles : []
      if (!tempFiles.length) {
        return
      }

      wx.showLoading({
        title: '图片上传中'
      })

      const uploadedFiles = []
      for (let index = 0; index < tempFiles.length; index += 1) {
        const file = tempFiles[index]
        const filePath = file.tempFilePath
        const extensionMatch = /\.([^.\\/]+)$/.exec(filePath)
        const extension = extensionMatch ? extensionMatch[1] : 'jpg'
        const cloudPath = `followUps/${this.data.projectId || 'draft'}/${Date.now()}-${index}.${extension}`
        const uploadResult = await wx.cloud.uploadFile({
          cloudPath,
          filePath
        })

        uploadedFiles.push({
          name: cloudPath.split('/').pop(),
          tempFilePath: filePath,
          previewPath: filePath,
          fileId: uploadResult.fileID
        })
      }

      this.setData({
        attachments: this.data.attachments.concat(uploadedFiles)
      })

      wx.showToast({
        title: `已添加 ${uploadedFiles.length} 张`,
        icon: 'success'
      })
    } catch (error) {
      const errMsg = error && error.errMsg ? error.errMsg : ''
      if (errMsg.includes('cancel')) {
        return
      }

      wx.showToast({
        title: '图片上传失败',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
    }
  },

  async removeAttachment(event) {
    const index = Number(event.currentTarget.dataset.index)
    const attachments = this.data.attachments.slice()
    const current = attachments[index]
    if (!current) {
      return
    }

    attachments.splice(index, 1)
    this.setData({
      attachments
    })

    if (current.fileId && wx.cloud && wx.cloud.deleteFile) {
      try {
        await wx.cloud.deleteFile({
          fileList: [current.fileId]
        })
      } catch (error) {
        // Ignore delete errors to avoid interrupting the user flow.
      }
    }
  },

  initVoiceRecognition() {
    if (this.voiceManager) {
      return true
    }

    const speechPlugin = getSpeechPlugin()
    if (!speechPlugin || typeof speechPlugin.getRecordRecognitionManager !== 'function') {
      this.setData({
        isVoiceSupported: false,
        voiceStatusText: '当前账号下语音转文字不可用，建议改接云端语音识别服务',
        voicePreviewText: ''
      })
      return false
    }

    const manager = speechPlugin.getRecordRecognitionManager()
    if (!manager) {
      this.setData({
        isVoiceSupported: false,
        voiceStatusText: '语音识别管理器初始化失败，请重新编译后再试',
        voicePreviewText: ''
      })
      return false
    }

    manager.onStart = () => {
      if (!this.isPageActive) {
        return
      }

      this.skipNextVoiceCommit = false
      this.setData({
        isVoiceSupported: true,
        isVoiceRecording: true,
        isVoiceRecognizing: false,
        voiceStatusText: '录音中，再点一次结束并转成文字',
        voicePreviewText: ''
      })
    }

    manager.onRecognize = (result) => {
      if (!this.isPageActive) {
        return
      }

      const previewText = normalizeRecognizedText(result && result.result)
      this.setData({
        voicePreviewText: previewText,
        voiceStatusText: previewText ? '正在识别语音内容' : '录音中，再点一次结束并转成文字'
      })
    }

    manager.onStop = (result) => {
      if (!this.isPageActive) {
        return
      }

      if (this.skipNextVoiceCommit) {
        this.skipNextVoiceCommit = false
        this.setData({
          isVoiceRecording: false,
          isVoiceRecognizing: false,
          voicePreviewText: '',
          voiceStatusText: '点击语音录入，可把口述内容自动追加到记录框'
        })
        return
      }

      const recognizedText = normalizeRecognizedText((result && result.result) || this.data.voicePreviewText)

      if (!recognizedText) {
        this.setData({
          isVoiceRecording: false,
          isVoiceRecognizing: false,
          voicePreviewText: '',
          voiceStatusText: '这次没有识别出有效内容，可以再试一次'
        })
        return
      }

      const currentContent = String(this.data.content || '').trim()
      const nextContent = currentContent ? `${currentContent}\n${recognizedText}` : recognizedText

      this.setData({
        content: nextContent,
        isVoiceRecording: false,
        isVoiceRecognizing: false,
        voicePreviewText: recognizedText,
        voiceStatusText: `已追加 ${recognizedText.length} 个字到记录框`
      })

      wx.showToast({
        title: '语音已转文字',
        icon: 'success'
      })
    }

    manager.onError = (error) => {
      if (!this.isPageActive) {
        return
      }

      const errMsg = error && (error.retmsg || error.msg || error.errMsg) ? (error.retmsg || error.msg || error.errMsg) : ''
      this.setData({
        isVoiceRecording: false,
        isVoiceRecognizing: false,
        voicePreviewText: '',
        voiceStatusText: errMsg ? `语音识别失败：${errMsg}` : '语音识别失败，请稍后再试'
      })

      if (errMsg && (errMsg.includes('auth deny') || errMsg.includes('auth denied') || errMsg.includes('permission'))) {
        this.openRecordSettingGuide()
        return
      }

      wx.showToast({
        title: '语音识别失败',
        icon: 'none'
      })
    }

    this.voiceManager = manager
    this.setData({
      isVoiceSupported: true
    })
    return true
  },

  openVoicePluginGuide() {
    wx.showModal({
      title: '当前方案不可用',
      content: '你当前的小程序账号未获得该语音插件授权，继续走插件方案会反复卡住。更稳的做法是改为云端语音识别服务。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  openRecordSettingGuide() {
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

  async ensureRecordScope() {
    try {
      const setting = await this.getSetting()
      if (setting && setting.authSetting && setting.authSetting['scope.record']) {
        return true
      }

      await this.authorizeRecordScope()
      return true
    } catch (error) {
      this.openRecordSettingGuide()
      return false
    }
  },

  async handleVoiceInput() {
    if (this.data.isVoiceRecognizing) {
      return
    }

    if (this.data.isVoiceRecording) {
      this.stopVoiceInput()
      return
    }

    if (!this.initVoiceRecognition()) {
      this.openVoicePluginGuide()
      return
    }

    const hasPermission = await this.ensureRecordScope()
    if (!hasPermission) {
      return
    }

    try {
      this.setData({
        isVoiceRecognizing: false,
        voicePreviewText: '',
        voiceStatusText: '正在启动录音...'
      })

      this.voiceManager.start({
        lang: 'zh_CN',
        duration: MAX_RECORD_DURATION
      })
    } catch (error) {
      this.setData({
        isVoiceRecording: false,
        isVoiceRecognizing: false,
        voicePreviewText: '',
        voiceStatusText: '录音启动失败，请重新试一次'
      })
      wx.showToast({
        title: '录音启动失败',
        icon: 'none'
      })
    }
  },

  stopVoiceInput(options = {}) {
    if (!this.voiceManager || !this.data.isVoiceRecording) {
      return
    }

    this.skipNextVoiceCommit = Boolean(options.silent)

    this.setData({
      isVoiceRecording: false,
      isVoiceRecognizing: true,
      voiceStatusText: options.silent ? '语音录入已结束' : '语音识别中...',
      voicePreviewText: options.silent ? '' : this.data.voicePreviewText
    })

    try {
      this.voiceManager.stop()
    } catch (error) {
      this.setData({
        isVoiceRecognizing: false,
        voiceStatusText: '录音结束失败，请重新试一次'
      })
    }
  },

  async handleAiSummary() {
    if (this.data.isAiLoading) {
      return
    }

    if (!String(this.data.content || '').trim()) {
      wx.showToast({
        title: '请先输入原始跟进内容',
        icon: 'none'
      })
      return
    }

    this.setData({
      isAiLoading: true,
      aiError: '',
      aiResult: null,
      aiNextSuggestion: null,
      aiNextError: ''
    })

    try {
      const selectedStage = this.data.stages[this.data.stageIndex]
      const result = await requestFollowUpSummary({
        projectId: this.data.projectId,
        method: this.data.currentMethod,
        content: this.data.content,
        stageChange: selectedStage === '不变更' ? '' : selectedStage,
        projectContext: {
          projectName: this.data.projectTitle,
          clientName: '',
          stage: this.data.projectStage,
          description: ''
        }
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '当前无法完成 AI 整理')
      }

      await resolveNotificationData({
        projectId: this.data.projectId,
        types: ['ai_failed'],
        scenes: ['follow_up_ai']
      })

      this.setData({
        aiResult: normalizeAiSummaryResult(result),
        showAiDialog: true
      })
    } catch (error) {
      await reportSystemFailureData({
        type: 'ai_failed',
        scene: 'follow_up_ai',
        title: '当前无法完成 AI 整理',
        message: error.message || '当前无法完成 AI 整理，请稍后重试',
        projectId: this.data.projectId,
        projectName: this.data.projectTitle,
        actionUrl: this.data.projectId
          ? `/pages/follow-up/follow-up?projectId=${this.data.projectId}`
          : '/pages/follow-up/follow-up',
        actionLabel: '重新整理'
      })

      this.setData({
        aiError: error.message || '当前无法完成 AI 整理，请稍后重试'
      })
      wx.showToast({
        title: '当前无法完成 AI 整理',
        icon: 'none'
      })
    } finally {
      this.setData({
        isAiLoading: false
      })
    }
  },

  buildAiSummaryContent() {
    if (!this.data.aiResult) {
      return ''
    }

    const sections = [this.data.aiResult.summary]

    if (this.data.aiResult.highlights && this.data.aiResult.highlights.length) {
      sections.push(`关键进展：${this.data.aiResult.highlights.join('；')}`)
    }

    if (this.data.aiResult.risks && this.data.aiResult.risks.length) {
      sections.push(`风险提示：${this.data.aiResult.risks.join('；')}`)
    }

    return sections.filter(Boolean).join('\n')
  },

  getEffectiveStage() {
    if (this.data.stageIndex > 0) {
      return this.data.stages[this.data.stageIndex] || this.data.projectStage
    }

    return this.data.projectStage
  },

  async applyAiSummary() {
    if (!this.data.aiResult) {
      return
    }

    const nextContent = this.buildAiSummaryContent()
    const recommendedStage = String(this.data.aiResult.recommendedStage || '').trim()
    const reason = String(this.data.aiResult.stageChangeReason || '').trim()
    const currentStage = this.getEffectiveStage()
    const shouldConfirmStage = Boolean(
      recommendedStage
      && recommendedStage !== '不变更'
      && recommendedStage !== currentStage
      && this.data.stages.indexOf(recommendedStage) > -1
    )

    if (!shouldConfirmStage) {
      this.setData({
        content: nextContent,
        showAiDialog: false
      })

      wx.showToast({
        title: '已回填到记录框',
        icon: 'success'
      })
      return
    }

    const modalResult = await showStageConfirmModal({
      recommendedStage,
      reason
    })
    const nextUpdate = {
      content: nextContent,
      showAiDialog: false
    }

    if (modalResult && modalResult.confirm) {
      nextUpdate.stageIndex = this.data.stages.indexOf(recommendedStage)
    }

    this.setData(nextUpdate)

    wx.showToast({
      title: modalResult && modalResult.confirm ? '内容和阶段已更新' : '已回填到记录框',
      icon: 'success'
    })
  },

  closeAiDialog() {
    this.setData({
      showAiDialog: false
    })
  },

  async handleAiNextSuggestion() {
    if (this.data.isAiNextLoading) {
      return
    }

    if (!this.data.aiResult || !String(this.data.aiResult.summary || '').trim()) {
      wx.showToast({
        title: '请先完成 AI整理',
        icon: 'none'
      })
      return
    }

    this.setData({
      isAiNextLoading: true,
      aiNextError: ''
    })

    try {
      const result = await requestNextFollowUpSuggestion({
        projectId: this.data.projectId,
        currentSummary: this.data.aiResult.summary
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '当前无法生成下一步建议')
      }

      await resolveNotificationData({
        projectId: this.data.projectId,
        types: ['ai_failed'],
        scenes: ['follow_up_ai_next']
      })

      this.setData({
        aiNextSuggestion: normalizeNextSuggestion(result),
        showAiDialog: true
      })
    } catch (error) {
      await reportSystemFailureData({
        type: 'ai_failed',
        scene: 'follow_up_ai_next',
        title: '当前无法生成下一步建议',
        message: error.message || '当前无法生成下一步建议，请稍后重试',
        projectId: this.data.projectId,
        projectName: this.data.projectTitle,
        actionUrl: this.data.projectId
          ? `/pages/follow-up/follow-up?projectId=${this.data.projectId}`
          : '/pages/follow-up/follow-up',
        actionLabel: '重新建议'
      })

      this.setData({
        aiNextError: error.message || '当前无法生成下一步建议，请稍后重试'
      })
      wx.showToast({
        title: '当前无法生成下一步建议',
        icon: 'none'
      })
    } finally {
      this.setData({
        isAiNextLoading: false
      })
    }
  },

  applyAiNextSuggestion() {
    const suggestion = this.data.aiNextSuggestion
    if (!suggestion) {
      return
    }

    const taskDrafts = mergeSuggestedTaskDrafts(this.data.taskDrafts, suggestion.taskDrafts)
    const nextFollowUpDate = String(suggestion.recommendedDate || '').trim() || this.data.nextFollowUpDate
    const nextFollowUpClock = String(suggestion.recommendedTime || '').trim() || this.data.nextFollowUpClock

    this.setData({
      nextFollowUpDate,
      nextFollowUpClock,
      taskDrafts,
      showAiDialog: false
    })

    wx.showToast({
      title: '已回填下一步建议',
      icon: 'success'
    })
  },

  async handleSave() {
    if (this.data.isSaving) {
      return
    }

    if (!this.data.projectId) {
      wx.showToast({
        title: '缺少项目信息，当前无法提交跟进',
        icon: 'none'
      })
      return
    }

    if (!String(this.data.content || '').trim()) {
      wx.showToast({
        title: '请先填写跟进内容',
        icon: 'none'
      })
      return
    }

    const taskBuildResult = this.buildTaskPayloads()
    if (!taskBuildResult.ok) {
      wx.showToast({
        title: taskBuildResult.message,
        icon: 'none'
      })
      return
    }

    this.setData({
      isSaving: true
    })

    try {
      const selectedStage = this.data.stages[this.data.stageIndex]
      const result = await saveFollowUpData({
        projectId: this.data.projectId,
        method: this.data.currentMethod,
        followUpTime: `${this.data.followUpDate} ${this.data.followUpClock}`,
        content: this.data.content,
        stageChange: selectedStage === '不变更' ? '' : selectedStage,
        nextFollowUpTime: `${this.data.nextFollowUpDate} ${this.data.nextFollowUpClock}`,
        images: this.data.attachments.map((item) => item.fileId),
        aiSummary: this.data.aiResult ? this.data.aiResult.summary : '',
        aiHighlights: this.data.aiResult ? this.data.aiResult.highlights : [],
        aiRisks: this.data.aiResult ? this.data.aiResult.risks : [],
        aiRecommendedStage: this.data.aiResult ? this.data.aiResult.recommendedStage : '',
        aiStageChangeReason: this.data.aiResult ? this.data.aiResult.stageChangeReason : '',
        aiMissingInfo: this.data.aiResult ? this.data.aiResult.missingInfo : [],
        tasks: taskBuildResult.tasks
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '提交跟进失败')
      }

      await resolveNotificationData({
        projectId: this.data.projectId,
        types: ['save_failed'],
        scenes: ['follow_up_save']
      })

      touchNotificationSync('follow_up_saved')
      wx.showToast({
        title: '跟进已提交',
        icon: 'success'
      })

      this.clearDraft()

      this.submitRedirectTimer = setTimeout(() => {
        this.submitRedirectTimer = null
        wx.redirectTo({
          url: `/pages/project-detail/project-detail?projectId=${this.data.projectId}`
        })
      }, 320)
    } catch (error) {
      await reportSystemFailureData({
        type: 'save_failed',
        scene: 'follow_up_save',
        title: '跟进保存失败',
        message: error.message || '当前无法提交跟进，请稍后重试',
        projectId: this.data.projectId,
        projectName: this.data.projectTitle,
        actionUrl: this.data.projectId
          ? `/pages/follow-up/follow-up?projectId=${this.data.projectId}`
          : '/pages/follow-up/follow-up',
        actionLabel: '继续填写'
      })

      wx.showToast({
        title: error.message || '当前无法提交跟进，请稍后重试',
        icon: 'none'
      })
    } finally {
      this.setData({
        isSaving: false
      })
    }
  }
})
