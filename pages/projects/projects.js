const {
  loadProjectsData,
  updateTaskStatusData,
  requestDormantProjectWakeData,
  requestProjectReviewData,
  requestSpeechToTextData,
  flowProjectData
} = require('../../services/data')
const { buildTaskCompletionFeedback, getTaskCompletionToastTitle } = require('../../services/task-feedback')
const { buildProjectsEntryContext } = require('../../utils/navigation-context')
const { touchNotificationSync } = require('../../utils/notification-sync')
const { syncPageAppearance } = require('../../utils/appearance')
const { ensureActionAllowed, getEntitlementSnapshot, buildEntitlementPagePrompt } = require('../../utils/entitlement-guard')
const { startVoiceRecordingTicker, stopVoiceRecordingTicker } = require('../../utils/voice-recording')

const STAGES = ['全部阶段', '线索', '洽谈', '方案', '商务', '成交', '流失']
const ACTIVE_STAGES = ['全部阶段', '线索', '洽谈', '方案', '商务']
const STATUS_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '待推进' },
  { key: 'deal', label: '已成交' },
  { key: 'lost', label: '已流失' }
]
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
const HIGH_VALUE_THRESHOLD = 500000
const MAX_RECORD_DURATION = 60000
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

function normalizeStatusFilter(value) {
  return STATUS_FILTERS.some((item) => item.key === value) ? value : 'active'
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

function padNumber(value) {
  return `${value}`.padStart(2, '0')
}

function getSpeechRecorderManager() {
  if (!wx || typeof wx.getRecorderManager !== 'function') {
    return null
  }

  return wx.getRecorderManager()
}

function normalizeText(value) {
  return String(value || '').trim()
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

function normalizeProjectWakeResult(value) {
  const payload = value && typeof value === 'object' ? value : {}
  return {
    ...payload,
    ...normalizeProjectAiSourceMeta(payload),
    dormantDays: Number(payload.dormantDays || 0),
    lastActiveText: String(payload.lastActiveText || '').trim(),
    wakeSummary: String(payload.wakeSummary || '').trim(),
    suggestedAction: String(payload.suggestedAction || '').trim(),
    suggestedContact: String(payload.suggestedContact || '').trim()
  }
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => String(item || '').trim()).filter(Boolean)
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

function buildResultSummaryText({ count, total, statusFilter, stageFilter, quickFilter, sortMode, keyword, showStageFilter }) {
  const activeStatusFilter = STATUS_FILTERS.find((item) => item.key === statusFilter)
  const statusLabel = activeStatusFilter ? activeStatusFilter.label : '待推进'
  const parts = [`${statusLabel} ${count} 个结果 / ${total} 个项目`]
  const activeQuickFilter = QUICK_FILTERS.find((item) => item.key === quickFilter)
  const currentSort = SORT_OPTIONS.find((item) => item.key === sortMode)

  if (keyword) {
    parts.push(`搜索“${keyword}”`)
  }

  if (showStageFilter && stageFilter !== '全部阶段') {
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

  if (ownerType === 'shared_out_readonly') {
    return '项目已转交，当前页仅保留只读追踪'
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
    return {
      text: project.dueStatus === 'closed'
        ? (project.stage === '成交' ? '已成交' : '已流失')
        : '待补动作',
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

function getReadonlyProjectToast(project = {}) {
  const handoverToName = String(project.handoverToName || '').trim()
  if (handoverToName) {
    return `该项目已转交给 ${handoverToName}，当前仅保留查看`
  }

  return '该项目已转交给接手方，当前仅保留查看'
}

function normalizeProject(project, index) {
  const nextTaskDate = parseDateTime(project.nextTaskDueAt)
  const updatedAt = parseDateTime(project.updatedAtRaw || project.updatedAt || project.latest)
  const lastActiveAt = parseDateTime(project.lastActiveAt || project.updatedAtRaw || project.updatedAt || project.latest)
  const contactNames = normalizeTextList(project.contactNames)
  const tagNames = normalizeTextList(project.tags)
  const openTaskTypes = normalizeTextList(project.openTaskTypes)
  const stage = project.stage || '线索'
  const isClosed = project.isClosedProject === true || project.isClosed === true || stage === '成交' || stage === '流失'
  const closedStageText = String(project.closedStageText || (stage === '成交' ? '已成交' : (stage === '流失' ? '已流失' : '已关闭'))).trim()
  const today = startOfDay()
  const now = new Date()
  const openTaskCount = isClosed ? 0 : Number(project.openTaskCount || 0)
  const overdueTaskCount = isClosed ? 0 : Number(project.overdueTaskCount || 0)

  let dueStatus = isClosed ? 'closed' : (project.nextStatus || '')
  let dueStatusText = project.nextStatusText || ''
  if (!dueStatus) {
    if (isClosed) {
      dueStatus = 'closed'
      dueStatusText = stage === '成交' ? '已成交' : '已流失'
    } else if (!openTaskCount) {
      dueStatus = 'unplanned'
      dueStatusText = '待补动作'
    } else if (overdueTaskCount > 0 || (nextTaskDate && nextTaskDate.getTime() < now.getTime())) {
      dueStatus = 'overdue'
      dueStatusText = '优先处理'
    } else if (nextTaskDate && startOfDay(nextTaskDate).getTime() === today.getTime()) {
      dueStatus = 'today'
      dueStatusText = '今天处理'
    } else {
      dueStatus = 'upcoming'
      dueStatusText = '待处理'
    }
  }

  const ownerType = project.ownerType || (project.tag === '外发给我' ? 'shared_in' : 'owned')
  const canAdvanceProject = !isClosed && project.canAdvanceProject !== false
  const canShareProject = project.canShareProject !== false
  const canMarkDealPermission = project.canMarkDeal !== false
  const isReadOnlySharedOut = project.isReadOnlySharedOut === true || ownerType === 'shared_out_readonly'
  const canReviewProject = !isReadOnlySharedOut && isClosed && project.canReviewProject !== false
  const primaryTaskStatus = getPrimaryTaskStatusMeta(project, nextTaskDate, today)
  const contactCount = Number(project.contactCount || contactNames.length || 0)
  const amountValue = Number(project.amountValue || parseAmountValue(project.amount))
  const aiReview = project.aiReview && typeof project.aiReview === 'object'
    ? normalizeProjectReviewResult(project.aiReview)
    : null
  const closedSummaryText = String(project.closedSummaryText || project.latestSummary || `${closedStageText}，${aiReview ? '已复盘' : '待复盘'}`).trim()
  const latestSummary = String(isClosed ? closedSummaryText : (project.latestSummary || '暂无跟进摘要')).trim()
  const description = String(project.description || '').trim()
  const nextTaskTitle = isClosed ? '' : String(project.nextTaskTitle || '').trim()
  const nextTaskDueText = isClosed ? '' : String(project.nextTaskDueText || '').trim()
  const hasQuoteTask = openTaskTypes.includes('send_quote')
    || openTaskTypes.includes('report_solution')
    || containsKeyword(nextTaskTitle, '报价')
    || containsKeyword(nextTaskTitle, '方案')
  const hasCallbackTask = openTaskTypes.includes('callback') || containsKeyword(nextTaskTitle, '回访')
  const isTodayFollowUp = dueStatus === 'today'
  const isOverdueFollowUp = dueStatus === 'overdue'
  let footerPrimaryText = ''

  if (isClosed) {
    footerPrimaryText = ''
  } else if (nextTaskTitle) {
    footerPrimaryText = `推进任务：${nextTaskTitle}${nextTaskDueText ? ` · 截止 ${nextTaskDueText}` : ''}`
  } else if (overdueTaskCount > 0) {
    footerPrimaryText = `优先处理：${overdueTaskCount} 条任务`
  } else if (openTaskCount > 0) {
    footerPrimaryText = `推进任务：${openTaskCount} 条`
  }

  const footerMetaParts = [`最近更新：${project.latest || '最近更新'}`]
  if (tagNames.length) {
    footerMetaParts.push(`标签：${tagNames.join(' / ')}`)
  }

  return {
    id: project.id || `project-${index}`,
    name: project.name || '未命名项目',
    client: project.client || '未填写客户',
    stage,
    isClosed,
    isClosedProject: isClosed,
    closedStageText,
    closedCardClass: isClosed ? (stage === '成交' ? 'is-closed is-closed-deal' : 'is-closed is-closed-lost') : '',
    reviewStatusText: String(project.reviewStatusText || (aiReview ? '已复盘' : '待复盘')).trim(),
    canAdvanceProject,
    canShareProject,
    canMarkDeal: canMarkDealPermission && !isClosed,
    canReviewProject,
    reviewActionText: String(project.reviewActionText || (aiReview ? '查看复盘' : 'AI复盘')).trim(),
    dealStatusText: !canMarkDealPermission
      ? '当前只读'
      : (stage === '成交' ? '已成交' : (stage === '流失' ? '已流失' : '登记成交')),
    nextDisplay: isClosed
      ? closedStageText
      : (nextTaskTitle
        ? `推进任务 ${nextTaskTitle}${nextTaskDueText ? ` · 截止 ${nextTaskDueText}` : ''}`
        : '暂无推进任务'),
    amount: project.amount || '0',
    amountValue,
    commission: project.commission || '0',
    commissionValue: Number(project.commissionValue || parseAmountValue(project.commission)),
    latest: project.latest || '最近更新',
    updatedAt,
    lastActiveAt,
    lastActiveText: String(project.lastActiveText || project.latest || '刚刚更新').trim(),
    dormantDays: Number(project.dormantDays || 0),
    showAiWakeAction: !!project.showAiWakeAction,
    progress: Number(project.progress || 0),
    tag: project.tag || (ownerType === 'shared_in' ? '外发给我' : '我创建'),
    ownerType,
    ownerLabel: project.ownerLabel || (ownerType === 'shared_in'
      ? `${project.sharedFromName || '分享方'} 外发给我`
      : '我负责推进'),
    aiReview,
    ownerBadgeClass: ownerType === 'shared_in'
      ? 'is-brand'
      : (ownerType === 'shared_out_readonly' ? 'is-soft' : ''),
    dueStatus,
    dueStatusText,
    dueBadgeClass: dueStatus === 'overdue'
      ? 'is-danger'
      : (dueStatus === 'today'
        ? 'is-brand'
        : (dueStatus === 'closed' && stage === '成交' ? 'is-success' : '')),
    nextDate: nextTaskDate,
    nextSortWeight: dueStatus === 'closed'
      ? Number.MAX_SAFE_INTEGER - 1
      : (nextTaskDate ? nextTaskDate.getTime() : Number.MAX_SAFE_INTEGER),
    contactNames,
    contactCount,
    contactText: contactCount
      ? `${contactCount} 位`
      : '暂无',
    contactSummary: contactNames.length ? contactNames.join(' / ') : '',
    tags: tagNames,
    tagsText: tagNames.join(' / '),
    focusText: isClosed ? `${closedStageText}，${aiReview ? '已复盘' : '待复盘'}` : (project.focusText || getStageFocus(stage, ownerType)),
    latestSummary,
    isReadOnlySharedOut,
    handoverToName: String(project.handoverToName || '').trim(),
    primarySummaryLabel: isClosed ? '项目状态' : (openTaskCount ? '推进任务' : '当前重点'),
    secondarySummaryLabel: isClosed ? (aiReview ? '复盘摘要' : '复盘状态') : (openTaskCount ? '任务说明' : '最新摘要'),
    description,
    openTaskTypes,
    openTaskCount,
    overdueTaskCount,
    hasOpenTask: openTaskCount > 0,
    hasOverdueTask: overdueTaskCount > 0,
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
    nextTaskDueText,
    taskSummaryText: nextTaskDueText
      ? `截止 ${nextTaskDueText}`
      : '暂无截止时间',
    footerPrimaryText,
    footerMetaText: footerMetaParts.join(' · '),
    primaryTaskSortWeight: openTaskCount
      ? ((nextTaskDate ? nextTaskDate.getTime() : Number.MAX_SAFE_INTEGER) - (overdueTaskCount ? 86400000 : 0))
      : Number.MAX_SAFE_INTEGER,
    showFollowUpAction: !isClosed && canAdvanceProject,
    showTaskAction: !isClosed && openTaskCount > 0,
    taskActionText: isClosed
      ? ''
      : (!canAdvanceProject
      ? '当前只读'
      : '推进任务'),
    taskActionBadgeText: canAdvanceProject && openTaskCount
      ? String(openTaskCount)
      : '',
    taskActionButtonClass: canAdvanceProject ? 'btn-secondary' : 'btn-ghost',
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
    statusFilter: 'active',
    stageFilter: '全部阶段',
    stages: STAGES,
    activeStages: ACTIVE_STAGES,
    statusFilterOptions: STATUS_FILTERS,
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
      { type: 'demo', label: '待演示' },
      { type: 'report_solution', label: '待汇报方案' },
      { type: 'business_negotiation', label: '待商务谈判' },
      { type: 'research', label: '待调研' },
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
    isTaskCompletionVoiceSupported: true,
    isTaskCompletionVoiceRecording: false,
    isTaskCompletionVoiceRecognizing: false,
    taskCompletionVoiceElapsedText: '',
    taskFeedback: {
      title: '',
      detail: ''
    },
    entitlementPrompt: {
      visible: false,
      tone: 'neutral',
      title: '',
      desc: '',
      actionText: '',
      actionType: '',
      actionUrl: ''
    },
    showShareSheet: false,
    shareActionOptions: SHARE_ACTION_OPTIONS,
    selectedShareProjectId: '',
    selectedShareProjectName: '',
    selectedShareProjectMeta: null,
    showTransferSheet: false,
    transferMode: 'transfer_original',
    transferProjectName: '',
    isTransferOpening: false,
    copyProjectId: '',
    showProjectWakeSheet: false,
    selectedWakeProjectId: '',
    selectedWakeProjectName: '',
    selectedWakeProjectStage: '',
    selectedWakeProjectDormantText: '',
    selectedWakeProjectLastActiveText: '',
    isProjectWakeLoading: false,
    projectWakeError: '',
    projectWakeResult: null,
    projectWakeResultBackup: null,
    showProjectReviewSheet: false,
    selectedReviewProjectId: '',
    selectedReviewProjectName: '',
    selectedReviewProjectStage: '',
    selectedReviewProjectAmount: '',
    isProjectReviewLoading: false,
    projectReviewError: '',
    projectReviewResult: null,
    projectReviewResultBackup: null,
    taskActionId: '',
    isLoading: true,
    isLoadFailed: false,
    loadError: '',
    dataSource: 'Mock Demo'
  },

  async onLoad(options) {
    this.isPageActive = true
    this.skipNextShowRefresh = true
    this.copyProjectPending = false
    syncPageAppearance(this)
    const quickFilter = normalizeQuickFilter(options && options.quickFilter)
    const sortMode = normalizeSortMode(options && options.sortMode)
    const rawStageFilter = options && options.stageFilter ? decodeURIComponent(options.stageFilter) : '全部阶段'
    const statusFilter = rawStageFilter === '成交'
      ? 'deal'
      : (rawStageFilter === '流失' ? 'lost' : normalizeStatusFilter(options && options.statusFilter))
    const stageFilter = normalizeStageFilter(rawStageFilter)
    this.setData({
      quickFilter,
      sortMode,
      statusFilter,
      stageFilter: statusFilter === 'deal' || statusFilter === 'lost' ? '全部阶段' : stageFilter,
      entryContextText: buildProjectsEntryContext(
        options && options.source,
        quickFilter,
        stageFilter
      )
    })

    this.initTaskCompletionKeyboard()
    await Promise.all([
      this.fetchProjects(),
      this.refreshEntitlementPrompt({ refresh: true })
    ])
  },

  async onShow() {
    this.isPageActive = true
    syncPageAppearance(this)
    this.initTaskCompletionKeyboard()
    if (this.skipNextShowRefresh) {
      this.skipNextShowRefresh = false
      return
    }
    await this.refreshEntitlementPrompt({ refresh: true })
    if (!this.data.isLoading) {
      await this.fetchProjects()
    }
  },

  onHide() {
    this.isPageActive = false
    this.releaseCopyProjectLock()
    this.stopTaskCompletionVoiceInput({ silent: true })
    stopVoiceRecordingTicker(this, 'taskCompletionVoiceTimer', 'taskCompletionVoiceElapsedText')
    this.clearTaskFeedbackTimer()
    this.destroyTaskCompletionKeyboard()
  },

  onUnload() {
    this.isPageActive = false
    this.releaseCopyProjectLock()
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

  async refreshEntitlementPrompt(options = {}) {
    const snapshot = await getEntitlementSnapshot({
      refresh: options.refresh === true
    })
    if (!this.isPageActive) {
      return
    }

    this.setData({
      entitlementPrompt: buildEntitlementPagePrompt(snapshot, 'projects')
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

  releaseCopyProjectLock() {
    this.copyProjectPending = false
    if (this.data.copyProjectId) {
      this.setData({
        copyProjectId: ''
      })
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

  setSortMode(event) {
    const sortMode = event.currentTarget.dataset.sort
    this.setData({
      sortMode
    }, () => this.applyFilters())
  },

  setStatusFilter(event) {
    const statusFilter = normalizeStatusFilter(event.currentTarget.dataset.status)
    const nextData = {
      statusFilter
    }

    if (statusFilter === 'deal' || statusFilter === 'lost') {
      nextData.stageFilter = '全部阶段'
    }

    this.setData(nextData, () => this.applyFilters())
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
    const statusFilter = this.data.statusFilter
    const stageFilter = this.data.stageFilter
    const quickFilter = this.data.quickFilter
    const sortMode = this.data.sortMode
    const showStageFilter = statusFilter === 'all' || statusFilter === 'active'
    const effectiveStageFilter = showStageFilter ? stageFilter : '全部阶段'
    const shouldApplyQuickFilter = statusFilter === 'all' || statusFilter === 'active'

    const allProjects = this.data.projectCards.slice()
    const statusMatchedProjects = allProjects.filter((project) => {
      if (statusFilter === 'active') {
        return !project.isClosed
      }

      if (statusFilter === 'deal') {
        return project.stage === '成交'
      }

      if (statusFilter === 'lost') {
        return project.stage === '流失'
      }

      return true
    })
    const filteredProjects = allProjects
      .filter((project) => {
        if (statusFilter === 'active') {
          return !project.isClosed
        }

        if (statusFilter === 'deal') {
          return project.stage === '成交'
        }

        if (statusFilter === 'lost') {
          return project.stage === '流失'
        }

        return true
      })
      .filter((project) => (effectiveStageFilter === '全部阶段' ? true : project.stage === effectiveStageFilter))
      .filter((project) => {
        if (!shouldApplyQuickFilter) {
          return true
        }

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
    const lostCount = allProjects.filter((project) => project.stage === '流失').length
    const statusFilterOptions = STATUS_FILTERS.map((item) => {
      const countMap = {
        all: totalCount,
        active: activeCount,
        deal: dealCount,
        lost: lostCount
      }

      return {
        ...item,
        count: countMap[item.key] || 0
      }
    })
    const summaryCards = [
      { label: '全部项目', value: String(totalCount), note: '当前项目池' },
      { label: '待推进', value: String(activeCount), note: '仍在持续跟进' },
      { label: '已成交', value: String(dealCount), note: `已流失 ${lostCount}` }
    ]

    const hasCustomFilter = Boolean(keyword) || statusFilter !== 'active' || quickFilter !== 'all' || effectiveStageFilter !== '全部阶段'
    let emptyTitle = '当前筛选下暂无项目'
    let emptyDesc = '你可以调整筛选条件，或直接新建项目。'
    if (keyword) {
      emptyTitle = '没有找到匹配项目'
      emptyDesc = '可以换项目名、客户名、联系人、摘要关键词或任务关键词再试一次。'
    } else if (statusFilter === 'deal') {
      emptyTitle = '暂无已成交项目'
      emptyDesc = '可以切回待推进或全部项目继续查看。'
    } else if (statusFilter === 'lost') {
      emptyTitle = '暂无已流失项目'
      emptyDesc = '可以切回待推进或全部项目继续查看。'
    } else if (quickFilter === 'overdue') {
      emptyTitle = '暂无优先处理项目'
      emptyDesc = '当前没有逾期推进动作，可切回全部项目继续查看。'
    }

    this.setData({
      filteredProjects,
      statusFilterOptions,
      summaryCards,
      resultSummaryText: buildResultSummaryText({
        count: filteredProjects.length,
        total: statusMatchedProjects.length,
        statusFilter,
        stageFilter: effectiveStageFilter,
        quickFilter,
        sortMode,
        keyword: rawKeyword,
        showStageFilter
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
      statusFilter: 'active',
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

  async openProjectForm() {
    const decision = await ensureActionAllowed('create_project', { guide: true })
    if (!decision.allowed) {
      return
    }

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

    const currentProject = (this.data.projectCards || []).find((item) => item.id === projectId)
    if (currentProject && !currentProject.canAdvanceProject) {
      wx.showToast({
        title: getReadonlyProjectToast(currentProject),
        icon: 'none'
      })
      return
    }

    wx.navigateTo({
      url: `/pages/follow-up/follow-up?projectId=${projectId}&entry=projects`
    })
  },

  openTaskPrimaryAction(event) {
    const { taskId, projectId, hasTask } = event.currentTarget.dataset
    const hasOpenTask = hasTask === true || hasTask === 'true'
    const currentProject = (this.data.projectCards || []).find((item) => item.id === projectId)

    if (currentProject && !currentProject.canAdvanceProject) {
      wx.showToast({
        title: getReadonlyProjectToast(currentProject),
        icon: 'none'
      })
      return
    }

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

  openProjectShareQuick(event) {
    const projectId = String(event.currentTarget.dataset.projectId || '').trim()
    if (!projectId) {
      return
    }
    const currentProject = (this.data.projectCards || []).find((item) => item.id === projectId)
    if (currentProject && !currentProject.canShareProject) {
      wx.showToast({
        title: getReadonlyProjectToast(currentProject),
        icon: 'none'
      })
      return
    }

    this.setData({
      showShareSheet: true,
      selectedShareProjectId: projectId,
      selectedShareProjectName: currentProject && currentProject.name ? currentProject.name : '',
      selectedShareProjectMeta: currentProject
        ? {
            client: currentProject.client || '',
            stage: currentProject.stage || '',
            amount: currentProject.amount || '',
            nextDisplay: currentProject.nextDisplay || ''
          }
        : null
    })
  },

  async openDormantWakeSheet(event) {
    const projectId = String(event.currentTarget.dataset.projectId || '').trim()
    if (!projectId || this.data.isProjectWakeLoading) {
      return
    }

    const currentProject = (this.data.projectCards || []).find((item) => item.id === projectId)
    if (!currentProject || !currentProject.canAdvanceProject) {
      if (currentProject && !currentProject.canAdvanceProject) {
        wx.showToast({
          title: getReadonlyProjectToast(currentProject),
          icon: 'none'
        })
      }
      return
    }

    const decision = await ensureActionAllowed('ai', { guide: true })
    if (!decision.allowed) {
      return
    }

    this.setData({
      showProjectWakeSheet: true,
      selectedWakeProjectId: projectId,
      selectedWakeProjectName: currentProject.name || '',
      selectedWakeProjectStage: currentProject.stage || '',
      selectedWakeProjectDormantText: currentProject.dormantDays ? `沉默 ${currentProject.dormantDays} 天` : '',
      selectedWakeProjectLastActiveText: currentProject.lastActiveText || '',
      projectWakeError: '',
      projectWakeResult: null,
      projectWakeResultBackup: null
    })

    this.generateDormantWake(projectId)
  },

  closeProjectWakeSheet() {
    if (this.data.isProjectWakeLoading) {
      return
    }

    this.setData({
      showProjectWakeSheet: false,
      selectedWakeProjectId: '',
      selectedWakeProjectName: '',
      selectedWakeProjectStage: '',
      selectedWakeProjectDormantText: '',
      selectedWakeProjectLastActiveText: '',
      isProjectWakeLoading: false,
      projectWakeError: '',
      projectWakeResult: null,
      projectWakeResultBackup: null
    })
  },

  async generateDormantWake(projectId, forceRefresh = false) {
    const currentProjectId = String(projectId || this.data.selectedWakeProjectId || '').trim()
    if (!currentProjectId || this.data.isProjectWakeLoading) {
      return
    }

    if (!forceRefresh && this.data.projectWakeResult) {
      return
    }

    this.setData({
      isProjectWakeLoading: true,
      projectWakeError: '',
      ...(forceRefresh && this.data.projectWakeResult
        ? { projectWakeResultBackup: cloneSnapshot(this.data.projectWakeResult) }
        : {})
    })

    try {
      const currentProject = (this.data.projectCards || []).find((item) => item.id === currentProjectId)
      const result = await requestDormantProjectWakeData({
        projectId: currentProjectId,
        dormantDays: currentProject ? currentProject.dormantDays : 0,
        lastActiveText: currentProject ? currentProject.lastActiveText : ''
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '当前无法生成项目唤醒')
      }

      const nextResult = normalizeProjectWakeResult({
        ...result,
        generatedAt: result.generatedAt || new Date().toISOString()
      })
      const hadPreviousVersion = !!this.data.projectWakeResult

      this.setData({
        projectWakeResult: nextResult
      })

      if (hadPreviousVersion) {
        wx.showToast({
          title: '新唤醒结果已生成，可恢复上一版',
          icon: 'none'
        })
      }
    } catch (error) {
      this.setData({
        projectWakeError: error.message || '当前无法生成项目唤醒，请稍后重试'
      })
    } finally {
      this.setData({
        isProjectWakeLoading: false
      })
    }
  },

  async regenerateDormantWake() {
    const decision = await ensureActionAllowed('ai', { guide: true })
    if (!decision.allowed) {
      return
    }

    this.generateDormantWake(this.data.selectedWakeProjectId, true)
  },

  restoreDormantWakeVersion() {
    if (!this.data.projectWakeResultBackup) {
      return
    }

    this.setData({
      projectWakeResult: cloneSnapshot(this.data.projectWakeResultBackup),
      projectWakeResultBackup: cloneSnapshot(this.data.projectWakeResult),
      projectWakeError: ''
    })

    wx.showToast({
      title: '已恢复上一版唤醒结果',
      icon: 'success'
    })
  },

  openWakeProjectDetail() {
    const projectId = String(this.data.selectedWakeProjectId || '').trim()
    if (!projectId) {
      return
    }

    this.closeProjectWakeSheet()
    wx.navigateTo({
      url: `/pages/project-detail/project-detail?projectId=${projectId}&view=projects-ai-wake`
    })
  },

  openWakeFollowUp() {
    const projectId = String(this.data.selectedWakeProjectId || '').trim()
    if (!projectId) {
      return
    }

    this.closeProjectWakeSheet()
    wx.navigateTo({
      url: `/pages/follow-up/follow-up?projectId=${projectId}&entry=projects-ai-wake`
    })
  },

  async openProjectReviewSheet(event) {
    const projectId = String(event.currentTarget.dataset.projectId || '').trim()
    if (!projectId || this.data.isProjectReviewLoading) {
      return
    }

    const currentProject = (this.data.projectCards || []).find((item) => item.id === projectId)
    if (!currentProject || !currentProject.canReviewProject) {
      return
    }

    const cachedReview = currentProject.aiReview
      ? normalizeProjectReviewResult(currentProject.aiReview)
      : null

    if (!cachedReview) {
      const decision = await ensureActionAllowed('ai', { guide: true })
      if (!decision.allowed) {
        return
      }
    }

    this.setData({
      showProjectReviewSheet: true,
      selectedReviewProjectId: projectId,
      selectedReviewProjectName: currentProject.name || '',
      selectedReviewProjectStage: currentProject.stage || '',
      selectedReviewProjectAmount: currentProject.amountValue > 0 ? currentProject.amount : '',
      projectReviewError: '',
      projectReviewResult: cachedReview,
      projectReviewResultBackup: null
    })

    if (!cachedReview) {
      this.generateProjectReview(projectId)
    }
  },

  closeProjectReviewSheet() {
    if (this.data.isProjectReviewLoading) {
      return
    }

    this.setData({
      showProjectReviewSheet: false,
      selectedReviewProjectId: '',
      selectedReviewProjectName: '',
      selectedReviewProjectStage: '',
      selectedReviewProjectAmount: '',
      isProjectReviewLoading: false,
      projectReviewError: '',
      projectReviewResult: null,
      projectReviewResultBackup: null
    })
  },

  async generateProjectReview(projectId, forceRefresh = false) {
    const currentProjectId = String(projectId || this.data.selectedReviewProjectId || '').trim()
    if (!currentProjectId || this.data.isProjectReviewLoading) {
      return
    }

    if (!forceRefresh && this.data.projectReviewResult) {
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
        projectId: currentProjectId
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '当前无法生成项目复盘')
      }

      const nextResult = normalizeProjectReviewResult({
        ...result,
        generatedAt: result.generatedAt || new Date().toISOString()
      })
      const hadPreviousVersion = !!this.data.projectReviewResult

      const projectCards = (this.data.projectCards || []).map((item) => item.id === currentProjectId
        ? { ...item, aiReview: nextResult }
        : item)
      const filteredProjects = (this.data.filteredProjects || []).map((item) => item.id === currentProjectId
        ? { ...item, aiReview: nextResult }
        : item)

      this.setData({
        projectCards,
        filteredProjects,
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
      this.setData({
        projectReviewError: error.message || '当前无法生成项目复盘，请稍后重试'
      })
    } finally {
      this.setData({
        isProjectReviewLoading: false
      })
    }
  },

  async regenerateProjectReview() {
    const decision = await ensureActionAllowed('ai', { guide: true })
    if (!decision.allowed) {
      return
    }

    this.generateProjectReview(this.data.selectedReviewProjectId, true)
  },

  restoreProjectReviewVersion() {
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

  closeShareSheet() {
    this.setData({
      showShareSheet: false,
      selectedShareProjectId: '',
      selectedShareProjectName: '',
      selectedShareProjectMeta: null,
      showTransferSheet: false,
      transferMode: 'transfer_original',
      transferProjectName: '',
      isTransferOpening: false
    })
  },

  async openShareFlow(event) {
    const projectId = String(this.data.selectedShareProjectId || '').trim()
    const mode = String(
      event && event.detail && event.detail.mode
        ? event.detail.mode
        : event.currentTarget && event.currentTarget.dataset
          ? event.currentTarget.dataset.mode
          : 'info'
    ).trim() || 'info'
    if (!projectId) {
      return
    }

    if (mode === 'outbound') {
      const currentProject = (this.data.projectCards || []).find((item) => item.id === projectId)
      const clientName = currentProject && currentProject.client && currentProject.client !== '未填写客户'
        ? currentProject.client
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
      showShareSheet: false,
      selectedShareProjectId: '',
      selectedShareProjectName: '',
      selectedShareProjectMeta: null
    })

    const decision = await ensureActionAllowed(mode === 'outbound' ? 'share_out' : 'share_record', {
      refresh: true,
      guide: true
    })
    if (!decision.allowed) {
      return
    }

    wx.navigateTo({
      url: `/pages/share-card/share-card?projectId=${projectId}&mode=${mode}&entry=sender`
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
      selectedShareProjectId: '',
      selectedShareProjectName: '',
      selectedShareProjectMeta: null,
      transferMode: 'transfer_original',
      transferProjectName: '',
      isTransferOpening: false
    })
  },

  async confirmTransferFlow() {
    const projectId = String(this.data.selectedShareProjectId || '').trim()
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
        selectedShareProjectId: '',
        selectedShareProjectName: '',
        selectedShareProjectMeta: null,
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

  async copyProject(event) {
    const projectId = String(event.currentTarget.dataset.projectId || '').trim()
    if (!projectId || this.copyProjectPending) {
      return
    }

    this.copyProjectPending = true
    this.setData({
      copyProjectId: projectId
    })

    let keepCopyProjectLock = false

    try {
      const decision = await ensureActionAllowed('create_project', {
        refresh: true,
        guide: true
      })
      if (!decision.allowed) {
        return
      }

      const result = await flowProjectData({
        projectId,
        flowMode: 'clone_static'
      })
      if (!result || !result.ok || !result.projectId) {
        throw new Error(result && result.message ? result.message : '复制项目失败')
      }

      wx.showToast({
        title: '已复制为新项目',
        icon: 'success'
      })
      keepCopyProjectLock = true
      await new Promise((resolve, reject) => {
        wx.navigateTo({
          url: `/pages/project-form/project-form?projectId=${result.projectId}&mode=edit&source=clone`,
          success: resolve,
          fail: reject
        })
      })
    } catch (error) {
      wx.showToast({
        title: error.message || '复制项目失败',
        icon: 'none'
      })
    } finally {
      if (!keepCopyProjectLock) {
        this.releaseCopyProjectLock()
      }
    }
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
      taskCompletionTaskTitle: currentProject.nextTaskTitle || '当前任务',
      taskCompletionText: '',
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
    if (!force && this.data.taskActionId) {
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

    const currentProject = (this.data.projectCards || []).find((item) => item.id === projectId)
    if (currentProject && !currentProject.canMarkDeal) {
      wx.showToast({
        title: currentProject.isReadOnlySharedOut ? getReadonlyProjectToast(currentProject) : '该项目已成交',
        icon: 'none'
      })
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

  async handleQuickEntryTap() {
    const decision = await ensureActionAllowed('quick_entry', { guide: true })
    if (!decision.allowed) {
      return
    }

    wx.navigateTo({
      url: '/pages/index/index?openQuickEntry=1&quickEntryStandalone=1'
    })
  },

  openPage(event) {
    const { url } = event.currentTarget.dataset
    wx.navigateTo({ url })
  }
})
