const {
  loadProjectDetailData,
  updateTaskStatusData,
  markNotificationReadData,
  resolveNotificationData,
  requestProjectJudgementData,
  requestProjectReviewData,
  requestSpeechToTextData,
  reportSystemFailureData,
  flowProjectData
} = require('../../services/data')
const { touchNotificationSync } = require('../../utils/notification-sync')
const { syncPageAppearance } = require('../../utils/appearance')
const { ensureActionAllowed } = require('../../utils/entitlement-guard')
const { startVoiceRecordingTicker, stopVoiceRecordingTicker } = require('../../utils/voice-recording')
const {
  buildTaskCompletionFeedback,
  buildTaskStatusFeedback,
  getTaskCompletionToastTitle,
  getTaskStatusToastTitle
} = require('../../services/task-feedback')

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

const SHARE_ACTION_OPTIONS = [
  {
    key: 'info',
    title: '发送资料',
    desc: '对方查看资料，你继续维护。',
    badge: '资料卡',
    note: '项目仍留在我的项目'
  },
  {
    key: 'outbound',
    title: '转交项目',
    desc: '对方接手项目，你在外发项目查看进展。',
    badge: '交接卡',
    note: '后续在外发项目查看'
  }
]

const PROJECT_AI_MODEL_SOURCE_DEFAULTS = {
  sourceType: 'model',
  sourceLabel: '云端模型',
  providerLabel: 'CloudBase AI',
  modelName: 'hunyuan-exp / hunyuan-turbos-latest',
  canRegenerate: true
}

const PROJECT_AI_FALLBACK_SOURCE_DEFAULTS = {
  sourceType: 'fallback',
  sourceLabel: '系统基础建议',
  providerLabel: '',
  modelName: '',
  canRegenerate: true
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => String(item || '').trim()).filter(Boolean)
}

function formatAiGeneratedTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return `${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())} ${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`
}

function normalizeProjectAiSourceMeta(value) {
  const payload = value && typeof value === 'object' ? value : {}
  const sourceType = String(payload.sourceType || (payload.fallback ? 'fallback' : 'model')).trim() === 'fallback'
    ? 'fallback'
    : 'model'
  const defaults = sourceType === 'fallback'
    ? PROJECT_AI_FALLBACK_SOURCE_DEFAULTS
    : PROJECT_AI_MODEL_SOURCE_DEFAULTS
  const modelName = String(payload.modelName || defaults.modelName).trim()
  const sourceLabel = String(payload.sourceLabel || defaults.sourceLabel).trim()
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
    providerLabel: String(payload.providerLabel || defaults.providerLabel).trim(),
    modelName,
    canRegenerate: payload.canRegenerate !== false,
    generatedAt,
    generatedAtText,
    sourceMetaText: sourceMetaParts.join(' · '),
    sourceDisplayText: sourceType === 'fallback'
      ? '来自：系统基础建议'
      : `来自：云端模型${modelName ? ` · ${modelName}` : ''}`,
    regenerateLabel: sourceType === 'fallback' ? '获取云端复盘' : 'AI重新复盘'
  }
}

function normalizeProjectAiResult(value) {
  const payload = value && typeof value === 'object' ? value : {}
  return {
    ...payload,
    ...normalizeProjectAiSourceMeta(payload),
    summary: String(payload.summary || '').trim(),
    statusJudgement: String(payload.statusJudgement || '').trim(),
    keyBlockers: normalizeStringArray(payload.keyBlockers),
    positiveSignals: normalizeStringArray(payload.positiveSignals),
    priorityAction: String(payload.priorityAction || '').trim()
  }
}

function normalizeProjectReviewResult(value) {
  const payload = value && typeof value === 'object' ? value : {}
  return {
    ...payload,
    ...normalizeProjectAiSourceMeta(payload),
    stage: String(payload.stage || '').trim(),
    reviewOverview: String(payload.reviewOverview || '').trim(),
    turningPoints: normalizeStringArray(payload.turningPoints),
    effectiveActions: normalizeStringArray(payload.effectiveActions),
    reusableLessons: normalizeStringArray(payload.reusableLessons),
    slowdownPoints: normalizeStringArray(payload.slowdownPoints),
    lossReasons: normalizeStringArray(payload.lossReasons),
    reactivationAdvice: String(payload.reactivationAdvice || '').trim()
  }
}

function cloneSnapshot(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  return JSON.parse(JSON.stringify(value))
}

function shouldShowProjectAiAction(stage, isReadOnlySharedOut, projectAccess = {}) {
  const currentStage = String(stage || '').trim()
  if (isReadOnlySharedOut || projectAccess.canAdvanceProject === false) {
    return false
  }

  return Boolean(currentStage && currentStage !== '成交' && currentStage !== '流失')
}

function shouldShowProjectReviewAction(stage, isReadOnlySharedOut, projectAccess = {}) {
  return false
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
    title: '',
    type: 'callback',
    dueDate: formatDateInput(base),
    dueTime: formatTimeInput(base),
    description: ''
  }
}

const MAX_RECORD_DURATION = 60000

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
  }

  return badges
}

function buildHeroMetrics(projectDetail, contacts, shareHistory, isReadOnlySharedOut) {
  const detail = projectDetail || {}
  const contactCount = Array.isArray(contacts) ? contacts.length : 0
  const infoShareCount = Array.isArray(shareHistory) ? shareHistory.length : 0

  return [
    {
      label: '预计金额',
      value: detail.estimatedAmount || '0',
      note: '项目体量'
    },
    {
      label: '已签金额',
      value: detail.actualAmount || '0',
      note: '已成交'
    },
    {
      label: '联系人',
      value: `${contactCount} 位`,
      note: contactCount ? '已录入' : '待补录'
    },
    {
      label: isReadOnlySharedOut ? '外发状态' : '资料发送',
      value: isReadOnlySharedOut ? '外发中' : `${infoShareCount} 次`,
      note: isReadOnlySharedOut ? '只读追踪' : (infoShareCount ? '资料记录' : '未发送')
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
      : '暂无跟进摘要',
    primaryContactText: contactList.length
      ? `${contactList[0].name || '联系人'}${contactList[0].role ? ` / ${contactList[0].role}` : ''}`
      : '暂无联系人',
    recordCountText: totalRecords ? `${totalRecords} 条` : '暂无记录',
    latestFollowText: latestTimelineItem
      ? `${latestTimelineItem.time || '--:--'} · ${(latestTimelineItem.actorName || '当前用户')}`
      : '暂无记录',
    shareStatusText: isReadOnlySharedOut
      ? '外发追踪中'
      : (latestShare ? `最近发送 ${latestShare.status}` : '暂无资料发送')
  }
}

function buildShareSheetMeta(projectDetail = {}) {
  const detail = projectDetail && typeof projectDetail === 'object' ? projectDetail : {}
  return {
    client: detail.client || '',
    stage: detail.stage || '',
    amount: detail.estimatedAmount || '',
    nextDisplay: ''
  }
}

function buildProjectAccess(projectDetail = {}, accessMeta = {}) {
  const detail = projectDetail && typeof projectDetail === 'object' ? projectDetail : {}
  const source = accessMeta && typeof accessMeta === 'object' ? accessMeta : {}
  const fallbackReadonly = detail.handoverStatus === 'handed_over' && !detail.isSharedProject
  const canEditProject = typeof source.canEditProject === 'boolean' ? source.canEditProject : !fallbackReadonly
  const isClosedProject = detail.isClosedProject === true || detail.stage === '成交' || detail.stage === '流失'
  const canAdvanceProject = typeof source.canAdvanceProject === 'boolean' ? source.canAdvanceProject : (canEditProject && !isClosedProject)
  const canManageContacts = typeof source.canManageContacts === 'boolean' ? source.canManageContacts : canEditProject
  const canManageTasks = typeof source.canManageTasks === 'boolean' ? source.canManageTasks : (canEditProject && !isClosedProject)
  const canShareProject = typeof source.canShareProject === 'boolean' ? source.canShareProject : canEditProject
  const canMarkDeal = typeof source.canMarkDeal === 'boolean' ? source.canMarkDeal : (canEditProject && !isClosedProject)
  const isReadOnlySharedOut = fallbackReadonly && !canEditProject
  let readOnlyReasonText = ''

  if (isReadOnlySharedOut) {
    readOnlyReasonText = `该项目已转交给 ${detail.handoverToName || '接收方'}，当前页仅保留只读追踪。后续进展请在“外发项目”查看。`
  } else if (isClosedProject) {
    readOnlyReasonText = detail.stage === '流失'
      ? '项目已流失，当前不再新增跟进和推进任务。'
      : '项目已成交，当前不再新增跟进和推进任务。'
  }

  return {
    viewerAccountId: normalizeText(source.viewerAccountId),
    projectAccountId: normalizeText(source.projectAccountId || detail.accountId),
    ownerAccountId: normalizeText(source.ownerAccountId || detail.ownerAccountId),
    sharedFromAccountId: normalizeText(source.sharedFromAccountId || detail.sharedFromAccountId),
    canEditProject,
    canAdvanceProject,
    canManageContacts,
    canManageTasks,
    canShareProject,
    canMarkDeal,
    isReadOnlySharedOut,
    readOnlyReason: normalizeText(source.readonlyReason),
    readOnlyReasonText
  }
}

function getProjectReadonlyToast(projectAccess = {}, projectDetail = {}) {
  if (projectAccess && projectAccess.isReadOnlySharedOut) {
    return projectDetail && projectDetail.handoverToName
      ? `该项目已转交给 ${projectDetail.handoverToName}，当前仅保留查看`
      : '该项目已转交给接手方，当前仅保留查看'
  }

  return '当前项目为只读状态'
}

function buildContactMeta(contacts) {
  const list = Array.isArray(contacts) ? contacts : []
  if (!list.length) {
    return {
      countText: '',
      primaryText: ''
    }
  }

  const first = list[0]
  return {
    countText: `已录入 ${list.length} 位`,
    primaryText: `主要对接 ${first.name || '联系人'}${first.role ? ` / ${first.role}` : ''}`
  }
}

function buildEmptyContactDraft(projectDetail = {}) {
  return {
    name: '',
    role: '',
    phone: '',
    wechat: '',
    company: normalizeText(projectDetail.client)
  }
}

function buildTimelineMeta(followTimeline) {
  const total = countTimelineRecords(followTimeline)
  const latest = getLatestTimelineItem(followTimeline)
  let collaboratorCount = 0
  let taskDoneCount = 0

  ;(Array.isArray(followTimeline) ? followTimeline : []).forEach((group) => {
    const items = Array.isArray(group.items) ? group.items : []
    collaboratorCount += items.filter((item) => item && item.fromCollaborator).length
    taskDoneCount += items.filter((item) => item && item.typeKey === 'task_done').length
  })

  return {
    totalText: total ? `共 ${total} 条记录` : '暂无跟进记录',
    latestText: latest
      ? `最近 ${(latest.time || '--:--')} · ${(latest.actorName || '当前用户')}`
      : '等待首条记录',
    extraText: taskDoneCount
      ? `任务完成 ${taskDoneCount} 条`
      : (collaboratorCount ? `接手方推进 ${collaboratorCount} 条` : '')
  }
}

function buildShareHistoryMeta(shareHistory) {
  const list = Array.isArray(shareHistory) ? shareHistory : []
  if (!list.length) {
    return {
      totalText: '暂无资料发送',
      openedText: '等待首次发送',
      unopenedText: ''
    }
  }

  const openedCount = list.filter((item) => item.status === '已打开').length
  const unopenedCount = list.filter((item) => item.status === '未打开').length

  return {
    totalText: `共 ${list.length} 次发送`,
    openedText: `已打开 ${openedCount} 次`,
    unopenedText: `未打开 ${unopenedCount} 次`
  }
}

function normalizeShareModeLabel(mode) {
  return String(mode || '').trim() === '发送资料' ? '发送资料' : '转交项目'
}

function normalizeShareHistory(records) {
  return (Array.isArray(records) ? records : []).map((item) => {
    const viewerCount = Number(item.viewerCount || 0)
    let statusSummary = '已发出，等待对方查看'
    let collaborationSummary = '本次分享仍由你继续维护。'

    if (item.status === '已打开') {
      statusSummary = viewerCount > 1 ? `已有 ${viewerCount} 人查看资料` : '对方已查看资料'
      collaborationSummary = `${item.receiverName || item.receiverOpenidMasked || '对方'} 已查看资料卡，本次分享仍由你继续维护。`
    }

    return {
      ...item,
      mode: normalizeShareModeLabel(item.mode),
      displayStatus: item.statusText || item.status || '未打开',
      receiverLabel: item.receiverName || item.receiverOpenidMasked || '暂未识别',
      statusSummary,
      collaborationSummary,
      receiverSummary: `${item.receiverName || item.receiverOpenidMasked || '对方'}${item.status === '已打开' ? ' 已查看资料卡' : ' 尚未查看资料卡'}`,
      progressText: item.status === '已打开'
        ? (viewerCount > 1 ? `${viewerCount}人已查看` : '资料已查看')
        : '等待查看',
      collaborationCountText: '查看型分享',
      statusBadgeClass: item.status === '已打开' ? 'is-brand' : (item.status === '未打开' ? 'is-danger' : '')
    }
  })
}

function normalizeProjectAssets(value) {
  return (Array.isArray(value) ? value : []).map((item, index) => {
    const asset = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
    const type = String(asset.type || '').trim() === 'file' ? 'file' : 'image'
    const extension = String(asset.extension || (type === 'image' ? 'image' : 'file')).trim()

    return {
      id: String(asset.id || `asset-${index}`).trim(),
      type,
      fileId: String(asset.fileId || '').trim(),
      url: String(asset.url || asset.fileId || '').trim(),
      previewUrl: String(asset.previewUrl || asset.url || asset.fileId || '').trim(),
      name: String(asset.name || (type === 'image' ? `项目图片${index + 1}` : `项目附件${index + 1}`)).trim(),
      extension,
      extensionText: type === 'image' ? '图片' : extension.toUpperCase(),
      sizeText: String(asset.sizeText || '').trim(),
      sourceFollowUpId: String(asset.sourceFollowUpId || '').trim(),
      sourceTitle: String(asset.sourceTitle || '跟进记录').trim(),
      sourceSummary: String(asset.sourceSummary || '').trim(),
      sourceTime: String(asset.sourceTime || '').trim(),
      actorName: String(asset.actorName || '').trim()
    }
  })
}

function buildProjectAssetSummary(assets, sourceSummary = {}) {
  const list = Array.isArray(assets) ? assets : []
  const imageCount = Number(sourceSummary.imageCount || list.filter((asset) => asset.type === 'image').length || 0)
  const fileCount = Number(sourceSummary.fileCount || list.filter((asset) => asset.type === 'file').length || 0)
  const total = Number(sourceSummary.total || list.length || 0)
  const recentText = String(sourceSummary.recentText || (list[0] && list[0].sourceTime) || '').trim()

  return {
    total,
    imageCount,
    fileCount,
    totalText: total ? `共 ${total} 个资料` : '暂无项目资料',
    imageText: `图片 ${imageCount}`,
    fileText: `附件 ${fileCount}`,
    recentText: recentText ? `最近 ${recentText}` : '',
    previewAssets: list.slice(0, 6)
  }
}

Page({
  data: {
    appearancePageClass: '',
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
    projectAssets: [],
    projectAssetSummary: {
      total: 0,
      imageCount: 0,
      fileCount: 0,
      totalText: '暂无项目资料',
      imageText: '图片 0',
      fileText: '附件 0',
      recentText: '',
      previewAssets: []
    },
    showContacts: false,
    showAddContactSheet: false,
    isSavingContact: false,
    contactDraft: buildEmptyContactDraft(),
    showShareSheet: false,
    shareActionOptions: SHARE_ACTION_OPTIONS,
    showTransferSheet: false,
    transferMode: 'transfer_original',
    transferProjectName: '',
    isTransferOpening: false,
    isCopyingProject: false,
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
    isTaskCompletionVoiceSupported: true,
    isTaskCompletionVoiceRecording: false,
    isTaskCompletionVoiceRecognizing: false,
    taskCompletionVoiceElapsedText: '',
    taskFeedback: {
      title: '',
      detail: ''
    },
    showProjectAiAction: false,
    showProjectAiSheet: false,
    isProjectAiLoading: false,
    projectAiError: '',
    projectAiResult: null,
    projectAiResultBackup: null,
    showProjectReviewAction: false,
    showProjectReviewSheet: false,
    isProjectReviewLoading: false,
    projectReviewError: '',
    projectReviewResult: null,
    projectReviewResultBackup: null,
    nextTaskTemplates: NEXT_TASK_TEMPLATES,
    projectBadges: [],
    heroMetrics: [],
    projectOverview: {},
    contactMeta: {
      countText: '',
      primaryText: ''
    },
    timelineMeta: {
      totalText: '',
      latestText: '',
      extraText: ''
    },
    shareHistoryMeta: {
      totalText: '',
      openedText: '',
      unopenedText: ''
    },
    isShareLoading: false,
    isSharing: false,
    taskActionId: '',
    canMarkDeal: true,
    showActionFooter: false,
    projectAccess: {
      viewerAccountId: '',
      projectAccountId: '',
      ownerAccountId: '',
      sharedFromAccountId: '',
      canEditProject: true,
      canAdvanceProject: true,
      canManageContacts: true,
      canManageTasks: true,
      canShareProject: true,
      canMarkDeal: true,
      isReadOnlySharedOut: false,
      readOnlyReason: '',
      readOnlyReasonText: ''
    },
    isReadOnlySharedOut: false,
    isLoading: true,
    dataSource: 'Mock Demo'
  },

  onLoad(options) {
    syncPageAppearance(this)
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
    syncPageAppearance(this)
    this.initTaskCompletionKeyboard()
    if (this.data.projectId && !this.data.isLoading) {
      this.fetchProjectDetail()
    }
  },

  onHide() {
    this.stopTaskCompletionVoiceInput({ silent: true })
    stopVoiceRecordingTicker(this, 'taskCompletionVoiceTimer', 'taskCompletionVoiceElapsedText')
    this.clearTaskFeedbackTimer()
    this.destroyTaskCompletionKeyboard()
  },

  onUnload() {
    this.stopTaskCompletionVoiceInput({ silent: true })
    stopVoiceRecordingTicker(this, 'taskCompletionVoiceTimer', 'taskCompletionVoiceElapsedText')
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
      const { data, source } = await loadProjectDetailData(this.data.projectId, {
        viewMode: this.data.viewMode
      })
      const normalizedShareHistory = normalizeShareHistory(data.shareHistory || [])
      const normalizedProjectAssets = normalizeProjectAssets(data.projectAssets || [])
      const projectAccess = buildProjectAccess(data.projectDetail, data.access)
      const isReadOnlySharedOut = !!projectAccess.isReadOnlySharedOut

      if (isReadOnlySharedOut && this.data.viewMode !== 'shared-out') {
        this.setData({
          isLoading: false
        })
        wx.redirectTo({
          url: `/pages/project-detail/project-detail?projectId=${this.data.projectId}&view=shared-out`
        })
        return
      }

      const canMarkDeal = projectAccess.canMarkDeal
        && !(data.projectDetail.stage === '成交' || Number(data.projectDetail.actualAmountValue || 0) > 0)
      const showActionFooter = projectAccess.canAdvanceProject || projectAccess.canShareProject || projectAccess.canMarkDeal

      this.setData({
        projectDetail: {
          ...data.projectDetail,
          shareSheetMeta: buildShareSheetMeta(data.projectDetail)
        },
        contacts: data.contacts,
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        taskSummary: data.taskSummary || {},
        followTimeline: data.followTimeline,
        shareHistory: normalizedShareHistory,
        projectAssets: normalizedProjectAssets,
        projectAssetSummary: buildProjectAssetSummary(normalizedProjectAssets, data.projectAssetSummary || {}),
        showProjectAiAction: shouldShowProjectAiAction(data.projectDetail.stage, isReadOnlySharedOut, projectAccess),
        showProjectReviewAction: shouldShowProjectReviewAction(data.projectDetail.stage, isReadOnlySharedOut, projectAccess),
        showProjectAiSheet: false,
        projectAiError: '',
        projectAiResult: null,
        projectAiResultBackup: null,
        showProjectReviewSheet: false,
        projectReviewError: '',
        projectReviewResult: data.projectDetail.aiReview
          ? normalizeProjectReviewResult(data.projectDetail.aiReview)
          : null,
        projectReviewResultBackup: null,
        projectBadges: buildProjectBadges(data.projectDetail, isReadOnlySharedOut),
        heroMetrics: buildHeroMetrics(data.projectDetail, data.contacts, normalizedShareHistory, isReadOnlySharedOut),
        projectOverview: buildProjectOverview(
          data.projectDetail,
          data.contacts,
          data.followTimeline,
          normalizedShareHistory,
          isReadOnlySharedOut
        ),
        contactMeta: buildContactMeta(data.contacts),
        timelineMeta: buildTimelineMeta(data.followTimeline),
        shareHistoryMeta: buildShareHistoryMeta(normalizedShareHistory),
        projectAccess,
        canMarkDeal,
        showActionFooter,
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
        title: '当前无法加载项目详情',
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

  openAddContactSheet() {
    if (!this.data.projectId || !this.data.projectAccess.canManageContacts || this.data.isSavingContact) {
      if (this.data.projectId && !this.data.projectAccess.canManageContacts) {
        wx.showToast({
          title: getProjectReadonlyToast(this.data.projectAccess, this.data.projectDetail),
          icon: 'none'
        })
      }
      return
    }

    this.setData({
      showAddContactSheet: true,
      contactDraft: buildEmptyContactDraft(this.data.projectDetail)
    })
  },

  closeAddContactSheet() {
    if (this.data.isSavingContact) {
      return
    }

    this.setData({
      showAddContactSheet: false,
      contactDraft: buildEmptyContactDraft(this.data.projectDetail)
    })
  },

  onAddContactInput(event) {
    const field = event.currentTarget.dataset.field
    if (!field) {
      return
    }

    this.setData({
      [`contactDraft.${field}`]: String(event.detail.value || '')
    })
  },

  buildProjectContactsPayload() {
    return (Array.isArray(this.data.contacts) ? this.data.contacts : []).map((item) => ({
      contactId: item.id || '',
      name: normalizeText(item.name),
      role: normalizeText(item.role),
      phone: normalizeText(item.phone),
      wechat: normalizeText(item.wechat),
      company: normalizeText(item.company)
    }))
  },

  async saveContactDraft() {
    if (!this.data.projectId || this.data.isSavingContact || !this.data.projectAccess.canManageContacts) {
      return
    }

    const draft = this.data.contactDraft || {}
    const nextContact = {
      name: String(draft.name || '').trim(),
      role: String(draft.role || '').trim(),
      phone: String(draft.phone || '').trim(),
      wechat: String(draft.wechat || '').trim(),
      company: String(draft.company || '').trim()
    }

    if (!nextContact.name) {
      wx.showToast({
        title: '请先填写联系人姓名',
        icon: 'none'
      })
      return
    }

    const contactsPayload = this.buildProjectContactsPayload()
      .concat(nextContact)

    const detail = this.data.projectDetail || {}

    this.setData({
      isSavingContact: true
    })

    try {
      const result = await saveProjectData({
        projectId: this.data.projectId,
        projectName: String(detail.name || '').trim(),
        clientName: String(detail.client || '').trim(),
        stage: String(detail.stage || '线索').trim(),
        estimatedAmount: detail.estimatedAmountValue || 0,
        actualAmount: detail.actualAmountValue || 0,
        expectedCommission: detail.expectedCommissionValue || 0,
        tagsText: Array.isArray(detail.tags) ? detail.tags.join(' / ') : '',
        description: String(detail.description || '').trim(),
        voiceAliasesText: Array.isArray(detail.voiceAliases) ? detail.voiceAliases.join(' / ') : '',
        contacts: contactsPayload
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '联系人保存失败')
      }

      wx.showToast({
        title: '联系人已添加',
        icon: 'success'
      })

      this.setData({
        showAddContactSheet: false,
        contactDraft: buildEmptyContactDraft(this.data.projectDetail)
      })

      await this.fetchProjectDetail()
    } catch (error) {
      wx.showToast({
        title: error && error.message ? error.message : '联系人保存失败',
        icon: 'none'
      })
    } finally {
      this.setData({
        isSavingContact: false
      })
    }
  },

  goEditProject() {
    if (!this.data.projectId || !this.data.projectAccess.canEditProject) {
      if (this.data.projectId && !this.data.projectAccess.canEditProject) {
        wx.showToast({
          title: getProjectReadonlyToast(this.data.projectAccess, this.data.projectDetail),
          icon: 'none'
        })
      }
      return
    }

    wx.navigateTo({
      url: `/pages/project-form/project-form?projectId=${this.data.projectId}`
    })
  },

  openFollowUp() {
    if (!this.data.projectAccess.canAdvanceProject) {
      wx.showToast({
        title: getProjectReadonlyToast(this.data.projectAccess, this.data.projectDetail),
        icon: 'none'
      })
      return
    }

    const url = this.data.projectId
      ? `/pages/follow-up/follow-up?projectId=${this.data.projectId}`
      : '/pages/follow-up/follow-up'

    wx.navigateTo({ url })
  },

  closeProjectAiSheet() {
    this.setData({
      showProjectAiSheet: false
    })
  },

  closeProjectReviewSheet() {
    this.setData({
      showProjectReviewSheet: false
    })
  },

  async handleProjectAiJudge() {
    if (!this.data.projectId || !this.data.showProjectAiAction || !this.data.projectAccess.canAdvanceProject) {
      return
    }

    const decision = await ensureActionAllowed('ai', { guide: true })
    if (!decision.allowed) {
      return
    }

    this.setData({
      showProjectAiSheet: true
    })

    if (this.data.projectAiResult || this.data.isProjectAiLoading) {
      return
    }

    await this.fetchProjectAiJudge()
  },

  async regenerateProjectAiJudge() {
    if (!this.data.projectId || !this.data.showProjectAiAction || !this.data.projectAccess.canAdvanceProject) {
      return
    }

    const decision = await ensureActionAllowed('ai', { guide: true })
    if (!decision.allowed) {
      return
    }

    this.setData({
      showProjectAiSheet: true
    })

    await this.fetchProjectAiJudge(true)
  },

  async fetchProjectAiJudge(forceRefresh = false) {
    if (this.data.isProjectAiLoading || !this.data.projectId) {
      return
    }

    this.setData({
      isProjectAiLoading: true,
      projectAiError: '',
      ...(forceRefresh && this.data.projectAiResult
        ? { projectAiResultBackup: cloneSnapshot(this.data.projectAiResult) }
        : {})
    })

    try {
      const result = await requestProjectJudgementData({
        projectId: this.data.projectId
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '当前无法生成项目研判')
      }

      await resolveNotificationData({
        projectId: this.data.projectId,
        types: ['ai_failed'],
        scenes: ['project_ai_judgement']
      })

      const nextResult = normalizeProjectAiResult({
        ...result,
        generatedAt: result.generatedAt || new Date().toISOString()
      })
      const hadPreviousVersion = !!this.data.projectAiResult

      this.setData({
        projectAiResult: nextResult,
        projectAiError: ''
      })

      if (hadPreviousVersion) {
        wx.showToast({
          title: '新研判已生成，可恢复上一版',
          icon: 'none'
        })
      }
    } catch (error) {
      await reportSystemFailureData({
        type: 'ai_failed',
        scene: 'project_ai_judgement',
        title: '当前无法生成项目研判',
        message: error.message || '当前无法生成项目研判，请稍后重试',
        projectId: this.data.projectId,
        projectName: this.data.projectDetail && this.data.projectDetail.name ? this.data.projectDetail.name : '',
        actionUrl: `/pages/project-detail/project-detail?projectId=${this.data.projectId}`,
        actionLabel: '重新生成'
      })

      this.setData({
        projectAiError: error.message || '当前无法生成项目研判，请稍后重试'
      })
    } finally {
      this.setData({
        isProjectAiLoading: false
      })
    }
  },

  restoreProjectAiJudgeVersion() {
    if (!this.data.projectAiResultBackup) {
      return
    }

    this.setData({
      projectAiResult: cloneSnapshot(this.data.projectAiResultBackup),
      projectAiResultBackup: cloneSnapshot(this.data.projectAiResult),
      projectAiError: ''
    })

    wx.showToast({
      title: '已恢复上一版研判',
      icon: 'success'
    })
  },

  async handleProjectAiReview() {
    if (!this.data.projectId || !this.data.showProjectReviewAction || !this.data.projectAccess.canAdvanceProject) {
      return
    }

    this.setData({
      showProjectReviewSheet: true
    })

    if (this.data.projectReviewResult || this.data.isProjectReviewLoading) {
      return
    }

    const decision = await ensureActionAllowed('ai', { guide: true })
    if (!decision.allowed) {
      return
    }

    await this.fetchProjectAiReview()
  },

  async regenerateProjectAiReview() {
    if (!this.data.projectId || !this.data.showProjectReviewAction || !this.data.projectAccess.canAdvanceProject) {
      return
    }

    this.setData({
      showProjectReviewSheet: true
    })

    await this.fetchProjectAiReview(true)
  },

  async fetchProjectAiReview(forceRefresh = false) {
    if (this.data.isProjectReviewLoading || !this.data.projectId) {
      return
    }

    this.setData({
      isProjectReviewLoading: true,
      projectReviewError: '',
      ...(forceRefresh && this.data.projectReviewResult
        ? { projectReviewResultBackup: cloneSnapshot(this.data.projectReviewResult) }
        : {})
    })

    try {
      const result = await requestProjectReviewData({
        projectId: this.data.projectId
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '当前无法生成项目复盘')
      }

      await resolveNotificationData({
        projectId: this.data.projectId,
        types: ['ai_failed'],
        scenes: ['project_ai_review']
      })

      const nextResult = normalizeProjectReviewResult({
        ...result,
        generatedAt: result.generatedAt || new Date().toISOString()
      })
      const hadPreviousVersion = !!this.data.projectReviewResult

      this.setData({
        projectDetail: {
          ...this.data.projectDetail,
          aiReview: nextResult
        },
        projectReviewResult: nextResult,
        projectReviewError: ''
      })

      if (hadPreviousVersion) {
        wx.showToast({
          title: '新复盘已生成，可恢复上一版',
          icon: 'none'
        })
      }
    } catch (error) {
      await reportSystemFailureData({
        type: 'ai_failed',
        scene: 'project_ai_review',
        title: '当前无法生成项目复盘',
        message: error.message || '当前无法生成项目复盘，请稍后重试',
        projectId: this.data.projectId,
        projectName: this.data.projectDetail && this.data.projectDetail.name ? this.data.projectDetail.name : '',
        actionUrl: `/pages/project-detail/project-detail?projectId=${this.data.projectId}`,
        actionLabel: '重新生成'
      })

      this.setData({
        projectReviewError: error.message || '当前无法生成项目复盘，请稍后重试'
      })
    } finally {
      this.setData({
        isProjectReviewLoading: false
      })
    }
  },

  restoreProjectAiReviewVersion() {
    if (!this.data.projectReviewResultBackup) {
      return
    }

    this.setData({
      projectReviewResult: cloneSnapshot(this.data.projectReviewResultBackup),
      projectReviewResultBackup: cloneSnapshot(this.data.projectReviewResult),
      projectReviewError: ''
    })

    wx.showToast({
      title: '已恢复上一版复盘',
      icon: 'success'
    })
  },

  async updateTaskStatus(event) {
    const { taskId, status } = event.currentTarget.dataset
    if (!taskId || !status || this.data.taskActionId || !this.data.projectAccess.canManageTasks) {
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
    if (!taskId || this.data.taskActionId || !this.data.projectAccess.canManageTasks) {
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
      taskCompletionNextTaskDescription: '',
      isTaskCompletionVoiceRecognizing: false
    })
    this.syncTaskCompletionLayout(0, false)
    this.initTaskCompletionVoiceRecognition()
  },

  closeTaskCompleteSheet(force = false) {
    const shouldForce = force === true
    if (!shouldForce && this.data.taskActionId) {
      return
    }

    this.stopTaskCompletionVoiceInput({ silent: true })
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
      taskCompletionNextTaskDescription: '',
      isTaskCompletionVoiceRecording: false,
      isTaskCompletionVoiceRecognizing: false
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

      if (!this.data.showTaskCompleteSheet) {
        return
      }

      this.setData({
        isTaskCompletionVoiceRecording: false,
        isTaskCompletionVoiceRecognizing: true
      })

      await this.transcribeTaskCompletionVoiceFile(result)
    })

    manager.onError((error) => {
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
    const taskId = String(this.data.taskCompletionTaskId || 'task').trim() || 'task'
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
    const filePath = String(result.tempFilePath || '').trim()
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
      if (!this.data.showTaskCompleteSheet) {
        this.setData({
          isTaskCompletionVoiceRecording: false,
          isTaskCompletionVoiceRecognizing: false
        })
        return
      }

      const asrResult = await requestSpeechToTextData({
        fileID: uploadResult.fileID,
        voiceFormat: uploadResult.extension,
        projectId: this.data.projectId || '',
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

      const currentContent = String(this.data.taskCompletionText || '').trim()
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

  async submitTaskCompletion() {
    const taskId = String(this.data.taskCompletionTaskId || '').trim()
    const resultSummary = String(this.data.taskCompletionText || '').trim()
    const shouldCreateNextTask = !!this.data.taskCompletionCreateNextTask
    const nextTaskTitle = String(this.data.taskCompletionNextTaskTitle || '').trim()
    const nextTaskDate = String(this.data.taskCompletionNextTaskDate || '').trim()
    const nextTaskTime = String(this.data.taskCompletionNextTaskTime || '').trim()
    const nextTaskDescription = String(this.data.taskCompletionNextTaskDescription || '').trim()

    if (!taskId || this.data.taskActionId || !this.data.projectAccess.canManageTasks) {
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
    if (!this.data.projectAccess.canShareProject) {
      wx.showToast({
        title: getProjectReadonlyToast(this.data.projectAccess, this.data.projectDetail),
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
      showShareSheet: false,
      showTransferSheet: false,
      transferMode: 'transfer_original',
      transferProjectName: '',
      isTransferOpening: false
    })
  },

  async openShareFlow(event) {
    const mode = String(
      event && event.detail && event.detail.mode
        ? event.detail.mode
        : event.currentTarget && event.currentTarget.dataset
          ? event.currentTarget.dataset.mode
          : 'info'
    ).trim() || 'info'
    if (!this.data.projectId || !this.data.projectAccess.canShareProject) {
      return
    }

    if (mode === 'outbound') {
      const clientName = this.data.projectDetail && this.data.projectDetail.client && this.data.projectDetail.client !== '未填写客户'
        ? this.data.projectDetail.client
        : ''
      this.setData({
        showShareSheet: false,
        showTransferSheet: true,
        transferMode: 'transfer_original',
        transferProjectName: clientName ? `${clientName} · 新需求` : '新需求项目'
      })
      return
    }

    this.setData({
      showShareSheet: false
    })

    const decision = await ensureActionAllowed(mode === 'outbound' ? 'share_out' : 'share_record', {
      refresh: true,
      guide: true
    })
    if (!decision.allowed) {
      return
    }

    wx.navigateTo({
      url: `/pages/share-card/share-card?projectId=${this.data.projectId}&mode=${mode}&entry=sender`
    })
  },

  setTransferMode(event) {
    const mode = String(event.currentTarget.dataset.mode || 'transfer_original').trim()
    this.setData({
      transferMode: mode === 'clone_seed' ? 'clone_seed' : 'transfer_original'
    })
  },

  onTransferProjectNameInput(event) {
    this.setData({
      transferProjectName: String(event.detail.value || '')
    })
  },

  closeTransferSheet() {
    this.setData({
      showTransferSheet: false,
      transferMode: 'transfer_original',
      transferProjectName: '',
      isTransferOpening: false
    })
  },

  async confirmTransferFlow() {
    const projectId = String(this.data.projectId || '').trim()
    const transferMode = this.data.transferMode === 'clone_seed' ? 'clone_seed' : 'transfer_original'
    const seedProjectName = String(this.data.transferProjectName || '').trim()
    if (!projectId || this.data.isTransferOpening) {
      return
    }

    if (transferMode === 'clone_seed' && !seedProjectName) {
      wx.showToast({
        title: '请先填写新项目名称',
        icon: 'none'
      })
      return
    }

    this.setData({
      isTransferOpening: true
    })

    try {
      const decision = await ensureActionAllowed('share_out', {
        refresh: true,
        guide: true
      })
      if (!decision.allowed) {
        return
      }

      const params = [
        `projectId=${projectId}`,
        'mode=outbound',
        'entry=sender',
        `flowMode=${transferMode}`
      ]
      if (transferMode === 'clone_seed') {
        params.push(`seedProjectName=${encodeURIComponent(seedProjectName)}`)
        params.push('historyScope=none')
      }

      this.setData({
        showTransferSheet: false,
        transferMode: 'transfer_original',
        transferProjectName: ''
      })

      wx.navigateTo({
        url: `/pages/share-card/share-card?${params.join('&')}`
      })
    } finally {
      this.setData({
        isTransferOpening: false
      })
    }
  },

  async copyProject() {
    if (!this.data.projectId || this.data.isCopyingProject) {
      return
    }

    const decision = await ensureActionAllowed('create_project', {
      refresh: true,
      guide: true
    })
    if (!decision.allowed) {
      return
    }

    this.setData({
      isCopyingProject: true
    })

    try {
      const result = await flowProjectData({
        projectId: this.data.projectId,
        flowMode: 'clone_static'
      })
      if (!result || !result.ok || !result.projectId) {
        throw new Error(result && result.message ? result.message : '复制项目失败')
      }

      wx.showToast({
        title: '已复制为新项目',
        icon: 'success'
      })
      wx.navigateTo({
        url: `/pages/project-form/project-form?projectId=${result.projectId}&mode=edit&source=clone`
      })
    } catch (error) {
      wx.showToast({
        title: error.message || '复制项目失败',
        icon: 'none'
      })
    } finally {
      this.setData({
        isCopyingProject: false
      })
    }
  },

  openDealPage() {
    if (!this.data.projectId || !this.data.projectAccess.canMarkDeal) {
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

  openProjectAssetsPage() {
    if (!this.data.projectId) {
      return
    }

    const viewQuery = this.data.viewMode ? `&view=${encodeURIComponent(this.data.viewMode)}` : ''
    wx.navigateTo({
      url: `/pages/project-assets/project-assets?projectId=${this.data.projectId}${viewQuery}`
    })
  },

  previewProjectAsset(event) {
    const { id } = event.currentTarget.dataset
    const currentAsset = (this.data.projectAssets || []).find((item) => item.id === id)
    if (!currentAsset) {
      return
    }

    if (currentAsset.type === 'image') {
      const urls = (this.data.projectAssets || [])
        .filter((item) => item.type === 'image')
        .map((item) => item.previewUrl || item.url || item.fileId)
        .filter(Boolean)
      const current = currentAsset.previewUrl || currentAsset.url || currentAsset.fileId

      if (current && urls.length) {
        wx.previewImage({
          current,
          urls
        })
      }
      return
    }

    wx.showToast({
      title: '请到项目资料页查看附件',
      icon: 'none'
    })
  },

  openPage(event) {
    const { url } = event.currentTarget.dataset

    if (url === '/pages/share-config/share-config' && this.data.projectId) {
      if (!this.data.projectAccess.canShareProject) {
        wx.showToast({
          title: getProjectReadonlyToast(this.data.projectAccess, this.data.projectDetail),
          icon: 'none'
        })
        return
      }

      this.openShareFlow({
        currentTarget: {
          dataset: {
            mode: 'info'
          }
        }
      })
      return
    }

    wx.navigateTo({ url })
  }
})
