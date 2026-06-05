const {
  loadProjectDetailData,
  requestFollowUpSummary,
  requestSpeechToTextData,
  requestNextFollowUpSuggestion,
  saveFollowUpData,
  reportSystemFailureData,
  resolveNotificationData
} = require('../../services/data')
const { buildFollowUpEntryHint } = require('../../utils/navigation-context')
const { touchNotificationSync } = require('../../utils/notification-sync')
const { syncPageAppearance } = require('../../utils/appearance')
const { markHomePageCacheDirty, markProjectRelatedCachesDirty } = require('../../utils/core-page-cache')
const { ensureActionAllowed, getEntitlementSnapshot, buildEntitlementPagePrompt } = require('../../utils/entitlement-guard')
const {
  FOLLOW_UP_METHODS,
  normalizeFollowUpMethod,
  detectFollowUpMethodFromContent,
  normalizeFollowUpOccurredMeta,
  buildDefaultFollowUpOccurredMeta,
  extractFollowUpOccurredMetaFromContent,
  resolvePreferredFollowUpMethod,
  resolvePreferredFollowUpOccurredMeta
} = require('../../utils/follow-up-meta')
const { startVoiceRecordingTicker, stopVoiceRecordingTicker } = require('../../utils/voice-recording')
const { buildAccountScopedStorageKey } = require('../../utils/account-scope')
const { ensurePrivacyAuthorization } = require('../../utils/privacy-authorization')

const MAX_RECORD_DURATION = 60000

function getDraftStorageKey(projectId) {
  return buildAccountScopedStorageKey(`follow-up-draft:${projectId || 'default'}`)
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

function formatAiGeneratedTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return `${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())} ${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`
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
  sourceLabel: 'AI整理',
  providerLabel: 'CloudBase AI',
  modelName: 'hunyuan-exp / hunyuan-turbos-latest',
  canRegenerate: true
}

const FALLBACK_SOURCE_DEFAULTS = {
  sourceType: 'fallback',
  sourceLabel: '系统整理',
  providerLabel: '',
  modelName: '',
  canRegenerate: true
}

function getSpeechPlugin() {
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

function extractWxErrorMessage(error) {
  if (!error) {
    return ''
  }

  if (typeof error === 'string') {
    return error.trim()
  }

  const messages = [
    error.errMsg,
    error.message,
    error.reason
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean)

  return Array.from(new Set(messages)).join('；')
}

function normalizeVoiceUploadError(error) {
  const rawMessage = extractWxErrorMessage(error)

  if (/ERR_PROXY_CONNECTION_FAILED|proxy|代理/i.test(rawMessage)) {
    const normalized = new Error('录音上传失败：网络连接失败，请检查后重试')
    normalized.code = 'VOICE_UPLOAD_PROXY_FAILED'
    normalized.rawMessage = rawMessage
    return normalized
  }

  if (/timeout|timed out|超时/i.test(rawMessage)) {
    const normalized = new Error('录音上传超时，请检查网络后重试')
    normalized.code = 'VOICE_UPLOAD_TIMEOUT'
    normalized.rawMessage = rawMessage
    return normalized
  }

  if (/uploadFile|request:fail|network|Network Error|ERR_INTERNET|abort|socket|fail/i.test(rawMessage)) {
    const normalized = new Error('录音上传失败，请检查网络和云环境后重试')
    normalized.code = 'VOICE_UPLOAD_FAILED'
    normalized.rawMessage = rawMessage
    return normalized
  }

  return new Error(rawMessage || '录音上传失败，请重新试一次')
}

function normalizeVoiceRecognitionError(error) {
  const message = String(error && error.message ? error.message : '').trim()
  const code = String(error && error.code ? error.code : '').trim()

  if (code === 'CLOUD_PROXY_CONNECTION_FAILED' || /ERR_PROXY_CONNECTION_FAILED|proxy|代理/i.test(message)) {
    return {
      message: '语音识别失败：网络连接异常，请检查后重试',
      toastTitle: '网络连接失败',
      modalTitle: '语音识别失败',
      modalContent: '网络连接失败，请检查后重试。',
      showModal: true
    }
  }

  if (code === 'NETWORK_ERROR' || /网络连接异常|Network Error|request:fail|Failed to fetch|socket|abort/i.test(message)) {
    return {
      message: '语音识别失败：网络连接异常，请检查后重试',
      toastTitle: '语音识别失败',
      modalTitle: '语音识别失败',
      modalContent: '网络连接失败，请检查后重试。',
      showModal: true
    }
  }

  return {
    message: message || '语音处理失败，请稍后再试',
    toastTitle: /上传/.test(message) ? '录音上传失败' : '语音识别失败',
    modalTitle: '',
    modalContent: '',
    showModal: false
  }
}

const TASK_TEMPLATES = [
  { type: 'send_solution', label: '待发方案' },
  { type: 'send_quote', label: '待报价' },
  { type: 'demo', label: '待演示' },
  { type: 'report_solution', label: '待汇报方案' },
  { type: 'business_negotiation', label: '待商务谈判' },
  { type: 'research', label: '待调研' },
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

function cloneSnapshot(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  return JSON.parse(JSON.stringify(value))
}

function buildAiSummaryVersionKey(value) {
  const payload = value && typeof value === 'object' ? value : {}
  if (payload.generatedAt) {
    return `summary:${String(payload.generatedAt).trim()}`
  }

  return `summary:${[
    payload.summary,
    payload.recommendedStage,
    Array.isArray(payload.highlights) ? payload.highlights.join('|') : '',
    Array.isArray(payload.risks) ? payload.risks.join('|') : ''
  ].map((item) => String(item || '').trim()).join('::')}`
}

function buildAiNextVersionKey(value) {
  const payload = value && typeof value === 'object' ? value : {}
  if (payload.generatedAt) {
    return `next:${String(payload.generatedAt).trim()}`
  }

  return `next:${[
    payload.nextAction,
    payload.recommendedTarget,
    payload.recommendedDate,
    payload.recommendedTime,
    payload.talkTrack
  ].map((item) => String(item || '').trim()).join('::')}`
}

function decorateAiSummaryResult(value, adoptedKey = '') {
  const payload = value && typeof value === 'object' ? value : {}
  const versionKey = buildAiSummaryVersionKey(payload)
  return {
    ...payload,
    versionKey,
    isAdopted: Boolean(adoptedKey && adoptedKey === versionKey)
  }
}

function decorateAiNextSuggestion(value, adoptedKey = '') {
  const payload = value && typeof value === 'object' ? value : {}
  const versionKey = buildAiNextVersionKey(payload)
  return {
    ...payload,
    versionKey,
    isAdopted: Boolean(adoptedKey && adoptedKey === versionKey),
    canApplyAll: false
  }
}

function decorateAiDialogState(summary, nextSuggestion, adoptedSummaryKey = '', adoptedNextKey = '') {
  const decoratedSummary = summary
    ? decorateAiSummaryResult(summary, adoptedSummaryKey)
    : null
  const decoratedNext = nextSuggestion
    ? decorateAiNextSuggestion(nextSuggestion, adoptedNextKey)
    : null
  const canApplyAll = Boolean(
    decoratedSummary
    && decoratedNext
    && !decoratedSummary.isAdopted
    && !decoratedNext.isAdopted
  )

  if (decoratedNext) {
    decoratedNext.canApplyAll = canApplyAll
  }

  return {
    aiResult: decoratedSummary,
    aiNextSuggestion: decoratedNext,
    canApplyAllAiSuggestions: canApplyAll
  }
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
  const generatedAt = String(payload.generatedAt || '').trim()
  const generatedAtText = formatAiGeneratedTime(payload.generatedAt)
  const sourceMetaParts = [sourceLabel]
  if (sourceType !== 'fallback' && modelName) {
    sourceMetaParts.push(modelName)
  }
  if (generatedAtText) {
    sourceMetaParts.push(`生成于 ${generatedAtText}`)
  }

  return {
    sourceType,
    sourceLabel,
    providerLabel,
    modelName,
    canRegenerate,
    generatedAt,
    generatedAtText,
    sourceMetaText: sourceMetaParts.join(' · '),
    sourceCaption: modelName ? `${providerLabel} · ${modelName}` : providerLabel,
    sourceDisplayText: sourceType === 'fallback'
      ? '系统整理'
      : `AI整理${modelName ? ` · ${modelName}` : ''}`,
    regenerateLabel: '重新生成'
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
  const normalizedSource = normalizeAiSourceMeta(result)
  const recommendedStage = String(result.recommendedStage || '').trim()
  const currentStage = String(result.currentStage || '').trim()
  const normalizedOccurredMeta = normalizeFollowUpOccurredMeta(result)
  return {
    ...result,
    ...normalizedSource,
    followUpMethod: normalizeFollowUpMethod(result.followUpMethod, ''),
    followUpOccurredDate: normalizedOccurredMeta ? normalizedOccurredMeta.followUpOccurredDate : '',
    followUpOccurredTime: normalizedOccurredMeta ? normalizedOccurredMeta.followUpOccurredTime : '',
    followUpOccurredTimePrecision: normalizedOccurredMeta ? normalizedOccurredMeta.followUpOccurredTimePrecision : '',
    recommendedStage,
    showRecommendedStage: Boolean(
      recommendedStage
      && recommendedStage !== '不变更'
      && recommendedStage !== currentStage
    )
  }
}

function showStageConfirmModal(payload = {}) {
  return new Promise((resolve) => {
    wx.showModal({
      title: `AI 建议将阶段调整为“${payload.recommendedStage || ''}”`,
      content: payload.reason ? `原因：${payload.reason}` : '是否在采用整理时，同时更新项目阶段？',
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
    methods: FOLLOW_UP_METHODS,
    currentMethod: '',
    methodTouched: false,
    followUpDateTouched: false,
    followUpClockTouched: false,
    showMethodOptions: false,
    stages: ['不变更', '线索', '洽谈', '方案', '商务', '成交', '流失'],
    followUpDate: defaultDates.followUpDate,
    followUpClock: defaultDates.followUpClock,
    nextFollowUpDate: defaultDates.nextFollowUpDate,
    nextFollowUpClock: defaultDates.nextFollowUpClock,
    content: '',
    attachments: [],
    isAiLoading: false,
    isSaving: false,
    aiResult: null,
    aiResultBackup: null,
    adoptedAiSummaryVersionKey: '',
    aiNextSuggestion: null,
    adoptedAiNextVersionKey: '',
    aiError: '',
    aiNextError: '',
    isAiNextLoading: false,
    showAiDialog: false,
    draftUpdatedAt: '',
    dataSource: 'Mock Demo',
    isVoiceSupported: true,
    isVoiceRecording: false,
    isVoiceRecognizing: false,
    voiceRecordingElapsedText: '',
    voiceStatusText: '点击语音录入，可把口述内容自动追加到记录框',
    voicePreviewText: '',
    taskTemplates: TASK_TEMPLATES,
    taskDrafts: [],
    entitlementPrompt: {
      visible: false,
      tone: 'neutral',
      title: '',
      desc: '',
      actionText: '',
      actionType: '',
      actionUrl: ''
    }
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
    await this.refreshEntitlementPrompt()

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
        projectStage: data.projectDetail.stage
      })
    } catch (error) {
      wx.showToast({
        title: '项目信息加载失败，将使用简化模式',
        icon: 'none'
      })
    }

    this.restoreDraft()
    this.initVoiceRecognition()
  },

  async onShow() {
    syncPageAppearance(this)
    this.isPageActive = true
    await this.refreshEntitlementPrompt()
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
    stopVoiceRecordingTicker(this, 'voiceRecordingTimer', 'voiceRecordingElapsedText')
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
    stopVoiceRecordingTicker(this, 'voiceRecordingTimer', 'voiceRecordingElapsedText')
  },

  async handleAccountStorageScopeChanged() {
    if (this.submitRedirectTimer) {
      clearTimeout(this.submitRedirectTimer)
      this.submitRedirectTimer = null
    }
    this.stopVoiceInput({
      silent: true
    })
    stopVoiceRecordingTicker(this, 'voiceRecordingTimer', 'voiceRecordingElapsedText')

    const dates = createDefaultDates()
    this.setData({
      projectTitle: '未指定项目',
      projectStage: '线索',
      currentMethod: '',
      methodTouched: false,
      followUpDateTouched: false,
      followUpClockTouched: false,
      followUpDate: dates.followUpDate,
      followUpClock: dates.followUpClock,
      nextFollowUpDate: dates.nextFollowUpDate,
      nextFollowUpClock: dates.nextFollowUpClock,
      content: '',
      attachments: [],
      aiResult: null,
      aiResultBackup: null,
      adoptedAiSummaryVersionKey: '',
      aiNextSuggestion: null,
      adoptedAiNextVersionKey: '',
      aiError: '',
      aiNextError: '',
      isAiNextLoading: false,
      showAiDialog: false,
      draftUpdatedAt: '',
      isVoiceRecording: false,
      isVoiceRecognizing: false,
      voiceRecordingElapsedText: '',
      voiceStatusText: '点击语音录入，可把口述内容自动追加到记录框',
      voicePreviewText: '',
      taskDrafts: []
    })

    if (this.data.projectId) {
      try {
        const { data, source } = await loadProjectDetailData(this.data.projectId)
        this.setData({
          dataSource: source,
          projectTitle: data.projectDetail.name,
          projectStage: data.projectDetail.stage
        })
      } catch (error) {
        // Keep the form blank when the new account cannot load the old project context.
      }
    }
    this.restoreDraft()
  },

  async refreshEntitlementPrompt(options = {}) {
    const snapshot = await getEntitlementSnapshot({
      refresh: options.refresh === true
    })
    if (!this.isPageActive) {
      return
    }

    this.setData({
      entitlementPrompt: buildEntitlementPagePrompt(snapshot, 'follow_up')
    })
  },

  handleEntitlementPromptAction() {
    const { actionUrl } = this.data.entitlementPrompt || {}
    if (!actionUrl) {
      return
    }

    wx.navigateTo({
      url: actionUrl
    })
  },

  setMethod(event) {
    this.setData({
      currentMethod: normalizeFollowUpMethod(event.currentTarget.dataset.method, '其他'),
      methodTouched: true,
      showMethodOptions: false
    })
  },

  toggleMethodOptions() {
    this.setData({
      showMethodOptions: !this.data.showMethodOptions
    })
  },

  onContentInput(event) {
    this.setData({
      content: event.detail.value
    })
  },

  onFollowUpDateInput(event) {
    this.setData({
      followUpDate: event.detail.value,
      followUpDateTouched: true
    })
  },

  onFollowUpClockInput(event) {
    this.setData({
      followUpClock: event.detail.value,
      followUpClockTouched: true
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

  restoreDraft() {
    try {
      const storageKey = getDraftStorageKey(this.data.projectId)
      const draft = storageKey ? wx.getStorageSync(storageKey) : null
      if (!draft || typeof draft !== 'object') {
        return
      }

      this.setData({
        currentMethod: normalizeFollowUpMethod(draft.currentMethod, this.data.currentMethod),
        methodTouched: draft.methodTouched === true,
        followUpDateTouched: draft.followUpDateTouched === true,
        followUpClockTouched: draft.followUpClockTouched === true,
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
      const storageKey = getDraftStorageKey(this.data.projectId)
      if (storageKey) {
        wx.removeStorageSync(storageKey)
      }
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
      methodTouched: this.data.methodTouched === true,
      followUpDateTouched: this.data.followUpDateTouched === true,
      followUpClockTouched: this.data.followUpClockTouched === true,
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
      const storageKey = getDraftStorageKey(this.data.projectId)
      if (!storageKey) {
        wx.showToast({
          title: '账号初始化后再暂存',
          icon: 'none'
        })
        return
      }
      wx.setStorageSync(storageKey, draft)
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
    const privacyAllowed = await ensurePrivacyAuthorization({
      page: this
    })
    if (!privacyAllowed) {
      return
    }

    if (!wx.cloud || !wx.cloud.uploadFile) {
      wx.showToast({
        title: '录音上传失败',
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

    const manager = getSpeechPlugin()
    if (!manager || typeof manager.onStart !== 'function') {
      this.setData({
        isVoiceSupported: false,
        voiceStatusText: '当前微信版本暂不支持语音录入，请升级后再试',
        voicePreviewText: ''
      })
      return false
    }

    manager.onStart(() => {
      if (!this.isPageActive) {
        return
      }

      this.skipNextVoiceCommit = false
      startVoiceRecordingTicker(this, 'voiceRecordingTimer', 'voiceRecordingElapsedText')
      this.setData({
        isVoiceSupported: true,
        isVoiceRecording: true,
        isVoiceRecognizing: false,
        voiceStatusText: '录音中，再点一次结束并转成文字',
        voicePreviewText: ''
      })
    })

    manager.onStop(async (result) => {
      stopVoiceRecordingTicker(this, 'voiceRecordingTimer', 'voiceRecordingElapsedText')

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

      if (!this.isPageActive) {
        return
      }

      this.setData({
        isVoiceRecording: false,
        isVoiceRecognizing: true,
        voicePreviewText: '',
        voiceStatusText: '录音上传中...'
      })

      await this.transcribeVoiceFile(result)
    })

    manager.onError((error) => {
      if (!this.isPageActive) {
        return
      }

      stopVoiceRecordingTicker(this, 'voiceRecordingTimer', 'voiceRecordingElapsedText')
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
    })

    this.voiceManager = manager
    this.setData({
      isVoiceSupported: true
    })
    return true
  },

  openVoicePluginGuide() {
    wx.showModal({
      title: '语音服务未就绪',
      content: '当前设备暂不支持语音录入，请稍后再试。',
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

    const decision = await ensureActionAllowed('speech', { guide: true })
    if (!decision.allowed) {
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
        duration: MAX_RECORD_DURATION,
        format: 'mp3',
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 32000
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

  async uploadVoiceFile(filePath) {
    if (!wx.cloud || typeof wx.cloud.uploadFile !== 'function') {
      throw new Error('录音上传失败，请检查网络后重试')
    }

    const extension = getVoiceFileExtension(filePath)
    const cloudPath = `voiceInputs/${this.data.projectId || 'draft'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
    let result
    try {
      result = await wx.cloud.uploadFile({
        cloudPath,
        filePath
      })
    } catch (error) {
      throw normalizeVoiceUploadError(error)
    }

    if (!result || !result.fileID) {
      throw normalizeVoiceUploadError(new Error('uploadFile missing fileID'))
    }

    return {
      fileID: result.fileID,
      extension
    }
  },

  async transcribeVoiceFile(result = {}) {
    const filePath = String(result.tempFilePath || '').trim()
    if (!filePath) {
      this.setData({
        isVoiceRecording: false,
        isVoiceRecognizing: false,
        voicePreviewText: '',
        voiceStatusText: '本次录音未生成有效音频，请重新试一次'
      })
      return
    }

    try {
      const uploadResult = await this.uploadVoiceFile(filePath)
      if (!this.isPageActive) {
        this.setData({
          isVoiceRecording: false,
          isVoiceRecognizing: false,
          voicePreviewText: '',
          voiceStatusText: '点击语音录入，可把口述内容自动追加到记录框'
        })
        return
      }

      this.setData({
        voiceStatusText: '语音识别中...'
      })

      const asrResult = await requestSpeechToTextData({
        fileID: uploadResult.fileID,
        voiceFormat: uploadResult.extension,
        projectId: this.data.projectId || '',
        scene: 'follow_up_raw_content',
        duration: Number(result.duration || 0) || 0
      })

      const recognizedText = normalizeRecognizedText(asrResult && asrResult.text)
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
    } catch (error) {
      const recognitionError = normalizeVoiceRecognitionError(error)
      const errMsg = recognitionError.message
      this.setData({
        isVoiceRecording: false,
        isVoiceRecognizing: false,
        voicePreviewText: '',
        voiceStatusText: errMsg
      })

      if (/密钥|SECRET|语音识别服务/.test(errMsg)) {
        this.openVoicePluginGuide()
        return
      }

      if (error && error.code === 'VOICE_UPLOAD_PROXY_FAILED') {
        wx.showModal({
          title: '网络连接失败',
          content: '录音上传失败，请检查网络后重试。',
          showCancel: false,
          confirmText: '知道了'
        })
        return
      }

      if (recognitionError.showModal) {
        wx.showModal({
          title: recognitionError.modalTitle,
          content: recognitionError.modalContent,
          showCancel: false,
          confirmText: '知道了'
        })
        return
      }

      wx.showToast({
        title: recognitionError.toastTitle,
        icon: 'none'
      })
    }
  },

  stopVoiceInput(options = {}) {
    if (!this.voiceManager || !this.data.isVoiceRecording) {
      return
    }

    this.skipNextVoiceCommit = Boolean(options.silent)
    stopVoiceRecordingTicker(this, 'voiceRecordingTimer', 'voiceRecordingElapsedText')

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
        title: '请先输入跟进记录',
        icon: 'none'
      })
      return
    }

    const decision = await ensureActionAllowed('ai', { guide: true })
    if (!decision.allowed) {
      return
    }

    this.setData({
      isAiLoading: true,
      aiError: '',
      aiResultBackup: this.data.aiResult ? cloneSnapshot(this.data.aiResult) : this.data.aiResultBackup,
      aiNextSuggestion: null,
      adoptedAiNextVersionKey: '',
      aiNextError: ''
    })

    const requestNow = new Date()
    const referenceNowMeta = buildDefaultFollowUpOccurredMeta({
      now: requestNow
    })
    const detectedMethod = detectFollowUpMethodFromContent(this.data.content, {
      now: requestNow
    })
    const detectedOccurredMeta = extractFollowUpOccurredMetaFromContent(this.data.content, {
      now: requestNow
    })

    try {
      const result = await requestFollowUpSummary({
        projectId: this.data.projectId,
        method: this.data.methodTouched ? this.data.currentMethod : '',
        content: this.data.content,
        stageChange: '',
        referenceNowDate: referenceNowMeta.followUpOccurredDate,
        referenceNowTime: referenceNowMeta.followUpOccurredTime,
        detectedFollowUpMethod: detectedMethod,
        detectedFollowUpOccurredDate: detectedOccurredMeta.followUpOccurredDate,
        detectedFollowUpOccurredTime: detectedOccurredMeta.followUpOccurredTime,
        detectedFollowUpOccurredTimePrecision: detectedOccurredMeta.followUpOccurredTimePrecision,
        projectContext: {
          projectName: this.data.projectTitle,
          clientName: '',
          stage: this.data.projectStage,
          description: ''
        }
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '当前无法生成整理结果')
      }

      await resolveNotificationData({
        projectId: this.data.projectId,
        types: ['ai_failed'],
        scenes: ['follow_up_ai']
      })
      markHomePageCacheDirty()

      const nextAiResult = normalizeAiSummaryResult({
        ...result,
        generatedAt: result.generatedAt || new Date().toISOString(),
        currentStage: this.getEffectiveStage()
      })
      const hadPreviousVersion = !!this.data.aiResult
      const shouldApplyAiMethod = this.data.methodTouched !== true
      const shouldApplyAiDate = this.data.followUpDateTouched !== true
      const shouldApplyAiClock = this.data.followUpClockTouched !== true
      const resolvedOccurredMeta = resolvePreferredFollowUpOccurredMeta(nextAiResult, detectedOccurredMeta, {
        now: requestNow
      })
      const nextData = {
        ...decorateAiDialogState(
          nextAiResult,
          this.data.aiNextSuggestion,
          this.data.adoptedAiSummaryVersionKey,
          this.data.adoptedAiNextVersionKey
        ),
        showAiDialog: true
      }

      if (shouldApplyAiMethod) {
        nextData.currentMethod = resolvePreferredFollowUpMethod({
          aiMethod: nextAiResult.followUpMethod,
          detectedMethod,
          fallbackMethod: this.data.currentMethod || '其他'
        })
      }

      if (shouldApplyAiDate) {
        nextData.followUpDate = resolvedOccurredMeta.followUpOccurredDate
      }

      if (shouldApplyAiClock) {
        nextData.followUpClock = resolvedOccurredMeta.followUpOccurredTime
      }

      this.setData(nextData)

      if (hadPreviousVersion) {
        wx.showToast({
          title: '新结果已生成，可恢复上一版',
          icon: 'none'
        })
      }
    } catch (error) {
      await reportSystemFailureData({
        type: 'ai_failed',
        scene: 'follow_up_ai',
        title: '当前无法生成整理结果',
        message: error.message || '当前无法生成整理结果，请稍后重试',
        projectId: this.data.projectId,
        projectName: this.data.projectTitle,
        actionUrl: this.data.projectId
          ? `/pages/follow-up/follow-up?projectId=${this.data.projectId}`
          : '/pages/follow-up/follow-up',
        actionLabel: '重新生成'
      })

      const resolvedFallbackOccurredMeta = resolvePreferredFollowUpOccurredMeta(null, detectedOccurredMeta, {
        now: requestNow
      })
      const nextData = {
        aiError: error.message || '当前无法生成整理结果，请稍后重试'
      }
      if (this.data.methodTouched !== true && detectedMethod !== '其他') {
        nextData.currentMethod = detectedMethod
      }
      if (this.data.followUpDateTouched !== true && resolvedFallbackOccurredMeta.followUpOccurredTimePrecision !== 'default_now') {
        nextData.followUpDate = resolvedFallbackOccurredMeta.followUpOccurredDate
      }
      if (this.data.followUpClockTouched !== true && resolvedFallbackOccurredMeta.followUpOccurredTimePrecision !== 'default_now') {
        nextData.followUpClock = resolvedFallbackOccurredMeta.followUpOccurredTime
      }

      this.setData(nextData)
      wx.showToast({
        title: '当前无法生成整理结果',
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

    const sections = []

    if (this.data.aiResult.summary) {
      sections.push(`跟进摘要：${this.data.aiResult.summary}`)
    }

    if (this.data.aiResult.highlights && this.data.aiResult.highlights.length) {
      sections.push(`关键进展：${this.data.aiResult.highlights.join('；')}`)
    }

    if (this.data.aiResult.risks && this.data.aiResult.risks.length) {
      sections.push(`风险提示：${this.data.aiResult.risks.join('；')}`)
    }

    if (this.data.aiResult.missingInfo && this.data.aiResult.missingInfo.length) {
      sections.push(`还需补充：${this.data.aiResult.missingInfo.join('；')}`)
    }

    return sections.filter(Boolean).join('\n')
  },

  getEffectiveStage() {
    return this.data.projectStage
  },

  getPendingRecommendedStage() {
    const aiResult = this.data.aiResult || {}
    const recommendedStage = String(aiResult.recommendedStage || '').trim()
    if (
      !aiResult.isAdopted
      || !recommendedStage
      || recommendedStage === '不变更'
      || recommendedStage === this.data.projectStage
      || this.data.stages.indexOf(recommendedStage) === -1
    ) {
      return null
    }

    return {
      recommendedStage,
      reason: String(aiResult.stageChangeReason || '').trim()
    }
  },

  async applyAiSummaryToForm(options = {}) {
    const aiResult = this.data.aiResult
    if (!aiResult || aiResult.isAdopted) {
      return false
    }

    const nextContent = this.buildAiSummaryContent()
    const nextUpdate = {
      content: nextContent,
      adoptedAiSummaryVersionKey: aiResult.versionKey,
      ...decorateAiDialogState(
        aiResult,
        this.data.aiNextSuggestion,
        aiResult.versionKey,
        this.data.adoptedAiNextVersionKey
      )
    }

    if (options.closeDialog !== false) {
      nextUpdate.showAiDialog = false
    }

    this.setData(nextUpdate)
    return 'summary'
  },

  async applyAiSummary() {
    if (!this.data.aiResult) {
      return
    }

    if (this.data.aiResult.isAdopted) {
      wx.showToast({
        title: '当前整理已采用',
        icon: 'none'
      })
      return
    }

    await this.applyAiSummaryToForm({ closeDialog: false })

    wx.showToast({
      title: '整理已采用',
      icon: 'success'
    })
  },

  closeAiDialog() {
    this.setData({
      showAiDialog: false
    })
  },

  restoreAiSummaryVersion() {
    if (!this.data.aiResultBackup) {
      return
    }

    this.setData({
      ...decorateAiDialogState(
        cloneSnapshot(this.data.aiResultBackup),
        null,
        this.data.adoptedAiSummaryVersionKey,
        ''
      ),
      aiResultBackup: cloneSnapshot(this.data.aiResult),
      aiNextSuggestion: null,
      adoptedAiNextVersionKey: '',
      aiNextError: ''
    })

    wx.showToast({
      title: '已恢复上一版整理结果',
      icon: 'success'
    })
  },

  async handleAiNextSuggestion() {
    if (this.data.isAiNextLoading) {
      return
    }

    if (!this.data.aiResult || !String(this.data.aiResult.summary || '').trim()) {
      wx.showToast({
        title: '请先生成整理结果',
        icon: 'none'
      })
      return
    }

    const decision = await ensureActionAllowed('ai', { guide: true })
    if (!decision.allowed) {
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
      markHomePageCacheDirty()

      const nextSuggestion = normalizeNextSuggestion({
        ...result,
        generatedAt: result.generatedAt || new Date().toISOString()
      })

      this.setData({
        ...decorateAiDialogState(
          this.data.aiResult,
          nextSuggestion,
          this.data.adoptedAiSummaryVersionKey,
          this.data.adoptedAiNextVersionKey
        ),
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
        actionLabel: '重新生成'
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

  applyAiNextSuggestionToForm(options = {}) {
    const suggestion = this.data.aiNextSuggestion
    if (!suggestion || suggestion.isAdopted) {
      return false
    }

    const taskDrafts = mergeSuggestedTaskDrafts(this.data.taskDrafts, suggestion.taskDrafts)
    const nextFollowUpDate = String(suggestion.recommendedDate || '').trim() || this.data.nextFollowUpDate
    const nextFollowUpClock = String(suggestion.recommendedTime || '').trim() || this.data.nextFollowUpClock

    const nextUpdate = {
      nextFollowUpDate,
      nextFollowUpClock,
      taskDrafts,
      adoptedAiNextVersionKey: suggestion.versionKey,
      ...decorateAiDialogState(
        this.data.aiResult,
        suggestion,
        this.data.adoptedAiSummaryVersionKey,
        suggestion.versionKey
      )
    }

    if (options.closeDialog !== false) {
      nextUpdate.showAiDialog = false
    }

    this.setData(nextUpdate)
    return true
  },

  applyAiNextSuggestion() {
    const suggestion = this.data.aiNextSuggestion
    if (!suggestion) {
      return
    }

    if (suggestion.isAdopted) {
      wx.showToast({
        title: '当前动作已采用',
        icon: 'none'
      })
      return
    }

    this.applyAiNextSuggestionToForm({ closeDialog: false })

    wx.showToast({
      title: '动作已采用',
      icon: 'success'
    })
  },

  async applyAllAiSuggestions() {
    const canApplySummary = this.data.aiResult && !this.data.aiResult.isAdopted
    const canApplyNext = this.data.aiNextSuggestion && !this.data.aiNextSuggestion.isAdopted
    if (!canApplySummary && !canApplyNext) {
      wx.showToast({
        title: '当前内容已采用',
        icon: 'none'
      })
      return
    }

    let summaryResult = false
    let nextResult = false
    if (canApplySummary) {
      summaryResult = await this.applyAiSummaryToForm({ closeDialog: false })
    }
    if (canApplyNext) {
      nextResult = this.applyAiNextSuggestionToForm({ closeDialog: false })
    }

    this.setData({
      showAiDialog: false
    })

    wx.showToast({
      title: summaryResult && nextResult ? '整理和动作已采用' : '已采用',
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

    const decision = await ensureActionAllowed('save_follow_up', { refresh: true, guide: true })
    if (!decision.allowed) {
      this.setData({
        isSaving: false
      })
      return
    }

    let stageChange = ''
    const pendingStage = this.getPendingRecommendedStage()
    if (pendingStage) {
      const modalResult = await showStageConfirmModal(pendingStage)
      if (modalResult && modalResult.confirm) {
        stageChange = pendingStage.recommendedStage
      }
    }

    try {
      const selectedMethod = normalizeFollowUpMethod(this.data.currentMethod, '其他')
      const nextSuggestion = this.data.aiNextSuggestion || null
      const suggestedTaskSnapshot = taskBuildResult.tasks[0] || null
      const result = await saveFollowUpData({
        projectId: this.data.projectId,
        method: selectedMethod,
        followUpTime: `${this.data.followUpDate} ${this.data.followUpClock}`,
        content: this.data.content,
        stageChange,
        nextFollowUpTime: '',
        images: this.data.attachments.map((item) => item.fileId),
        aiSummary: this.data.aiResult ? this.data.aiResult.summary : '',
        aiHighlights: this.data.aiResult ? this.data.aiResult.highlights : [],
        aiRisks: this.data.aiResult ? this.data.aiResult.risks : [],
        aiRecommendedStage: this.data.aiResult ? this.data.aiResult.recommendedStage : '',
        aiStageChangeReason: this.data.aiResult ? this.data.aiResult.stageChangeReason : '',
        aiMissingInfo: this.data.aiResult ? this.data.aiResult.missingInfo : [],
        aiNextAction: nextSuggestion ? nextSuggestion.nextAction : '',
        aiNextRecommendedTarget: nextSuggestion ? nextSuggestion.recommendedTarget : '',
        aiNextRecommendedMethod: nextSuggestion ? nextSuggestion.recommendedMethod : '',
        aiNextRecommendedTimeWindow: nextSuggestion ? nextSuggestion.recommendedTimeWindow : '',
        aiNextRecommendedDate: nextSuggestion ? nextSuggestion.recommendedDate : '',
        aiNextRecommendedTime: nextSuggestion ? nextSuggestion.recommendedTime : '',
        aiNextTalkTrack: nextSuggestion ? nextSuggestion.talkTrack : '',
        aiNextReason: nextSuggestion ? nextSuggestion.reason : '',
        aiNextMissingInfo: nextSuggestion ? nextSuggestion.missingInfo : [],
        aiSuggestedTaskTitle: suggestedTaskSnapshot ? suggestedTaskSnapshot.title : '',
        aiSuggestedTaskType: suggestedTaskSnapshot ? suggestedTaskSnapshot.type : '',
        aiSuggestedTaskDueDate: suggestedTaskSnapshot ? suggestedTaskSnapshot.dueDate : '',
        aiSuggestedTaskDueTime: suggestedTaskSnapshot ? suggestedTaskSnapshot.dueTime : '',
        aiSuggestedTaskDescription: suggestedTaskSnapshot ? suggestedTaskSnapshot.description : '',
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
      markProjectRelatedCachesDirty({
        projectId: this.data.projectId,
        includeHome: true,
        includeProjects: true,
        includeSharedOut: true,
        includeProjectDetail: true
      })
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
