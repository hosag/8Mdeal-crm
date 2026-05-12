const {
  loadShareConfigData,
  openSharedProjectData,
  createShareRecordData,
  requestShareBrief,
  reportSystemFailureData,
  resolveNotificationData
} = require('../../services/data')
const {
  buildSharePreview,
  getDefaultHistoryScope,
  normalizeHistoryScope,
  getHistoryScopeOptions,
  buildHistoryScopeMeta,
  filterTimelineForHistoryScope
} = require('../../services/share')
const { syncPageAppearance } = require('../../utils/appearance')
const { ensureActionAllowed } = require('../../utils/entitlement-guard')

function countTimelineRecords(followTimeline) {
  return (Array.isArray(followTimeline) ? followTimeline : []).reduce((total, group) => {
    return total + (Array.isArray(group.items) ? group.items.length : 0)
  }, 0)
}

function getShareScopeName(mode) {
  return mode === 'outbound' ? '转交项目' : '发送资料'
}

function buildDeniedPreview(mode) {
  const scopeName = getShareScopeName(mode)
  return {
    mode: {
      key: mode === 'outbound' ? 'outbound' : 'info',
      title: scopeName
    },
    tag: {
      id: mode === 'outbound' ? 't2' : 't1',
      name: scopeName,
      fields: []
    },
    project: {
      id: '',
      name: '当前无法生成分享卡',
      client: '',
      stage: '',
      estimatedAmount: '',
      description: '',
      nextFollowUp: '',
      summary: '当前账号权益不足，请先确认套餐后再继续。'
    },
    contacts: [],
    contactPolicyText: '',
    shareSourceText: '',
    showClient: false,
    showStage: false,
    showEstimatedAmount: false,
    showDescription: false,
    showNextFollowUp: false,
    showSummary: true
  }
}

function getLatestTimelineItem(followTimeline) {
  const groups = Array.isArray(followTimeline) ? followTimeline : []
  for (let index = 0; index < groups.length; index += 1) {
    const items = Array.isArray(groups[index].items) ? groups[index].items : []
    if (items.length) {
      return items[0]
    }
  }

  return null
}

function padNumber(value) {
  return `${value}`.padStart(2, '0')
}

function formatAiGeneratedTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return `${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())} ${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`
}

function buildTimelineSummary(followTimeline) {
  const total = countTimelineRecords(followTimeline)
  if (!total) {
    return '暂无时间线记录。'
  }

  const latest = getLatestTimelineItem(followTimeline)
  let taskDoneCount = 0
  let stageChangeCount = 0

  ;(Array.isArray(followTimeline) ? followTimeline : []).forEach((group) => {
    const items = Array.isArray(group.items) ? group.items : []
    taskDoneCount += items.filter((item) => item && item.typeKey === 'task_done').length
    stageChangeCount += items.filter((item) => item && item.typeKey === 'stage_change').length
  })

  const parts = [
    `共 ${total} 条记录`,
    `最新 ${(latest && latest.time) || '--:--'}`
  ]

  if (taskDoneCount) {
    parts.push(`完成任务 ${taskDoneCount} 条`)
  }

  if (stageChangeCount) {
    parts.push(`阶段变化 ${stageChangeCount} 次`)
  }

  return parts.join(' · ')
}

function normalizeShareBrief(value) {
  const brief = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const tone = String(brief.tone || '').trim()
  const sourceType = String(brief.sourceType || '').trim() === 'fallback' ? 'fallback' : 'model'
  const providerLabel = String(brief.providerLabel || (sourceType === 'fallback' ? '' : 'CloudBase AI')).trim()
  const modelName = String(brief.modelName || (sourceType === 'fallback' ? '' : 'hunyuan-exp / hunyuan-turbos-latest')).trim()
  const sourceLabel = String(brief.sourceLabel || (sourceType === 'fallback' ? '系统基础建议' : '云端模型')).trim()
  const generatedAt = String(brief.generatedAt || '').trim()
  const generatedAtText = formatAiGeneratedTime(brief.generatedAt)
  const overviewLines = Array.isArray(brief.overviewLines)
    ? brief.overviewLines
    : brief.briefLines
  const timelineInsight = String(brief.timelineInsight || brief.shareGoal || '').trim()
  const summaryText = String(
    brief.summaryText
    || brief.aiSummaryText
    || [String(brief.title || '').trim(), (Array.isArray(overviewLines) ? overviewLines.join(' ') : ''), timelineInsight].filter(Boolean).join(' ')
  ).trim()
  const sourceMetaParts = [sourceLabel]
  if (sourceType !== 'fallback' && modelName) {
    sourceMetaParts.push(modelName)
  }
  if (generatedAtText) {
    sourceMetaParts.push(`生成于 ${generatedAtText}`)
  }
  return {
    title: String(brief.title || '').trim(),
    overviewLines: Array.isArray(overviewLines)
      ? overviewLines.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 4)
      : [],
    timelineInsight,
    summaryText,
    cta: String(brief.cta || '').trim(),
    tone,
    toneText: tone === 'outbound_handover' ? '接手导向' : '同步导向',
    sourceType,
    sourceLabel,
    providerLabel,
    modelName,
    generatedAt,
    generatedAtText,
    sourceMetaText: sourceMetaParts.join(' · '),
    sourceCaption: modelName ? `${providerLabel} · ${modelName}` : providerLabel,
    sourceOriginText: sourceType === 'fallback'
      ? '来自：系统基础建议'
      : `来自：云端模型${modelName ? ` · ${modelName}` : ''}`,
    regenerateLabel: sourceType === 'fallback' ? '获取云端结果' : '重新生成'
  }
}

function normalizeSummaryMode(value) {
  const current = String(value || '').trim()
  if (current === 'system' || current === 'replace' || current === 'append') {
    return current
  }

  return 'system'
}

function cloneSnapshot(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  return JSON.parse(JSON.stringify(value))
}

function buildShareBriefSummaryText(brief) {
  const current = normalizeShareBrief(brief)
  return current.summaryText
}

function buildAppliedSummaryText(summaryMode, systemSummary, briefSummaryText, manualSummaryText) {
  const mode = normalizeSummaryMode(summaryMode)
  const systemText = String(systemSummary || '').trim()
  const aiText = String(briefSummaryText || '').trim()
  const manualText = String(manualSummaryText || '').trim()

  if (manualText) {
    return manualText
  }

  if (mode === 'replace') {
    return aiText || systemText
  }

  if (mode === 'append') {
    return [systemText, aiText].filter(Boolean).join('\n')
  }

  return systemText
}

function buildMergedSummaryText(description, summary) {
  const descText = String(description || '').trim()
  const summaryText = String(summary || '').trim()

  if (!descText) {
    return summaryText
  }

  if (!summaryText) {
    return descText
  }

  if (descText === summaryText) {
    return descText
  }

  if (descText.indexOf(summaryText) > -1) {
    return descText
  }

  if (summaryText.indexOf(descText) > -1) {
    return summaryText
  }

  return `${descText}\n${summaryText}`
}

function buildSystemSummaryBase(preview) {
  const project = preview && preview.project ? preview.project : {}
  return buildMergedSummaryText(project.description, project.summary)
}

function getSummaryModeOptions(hasAiSummary) {
  return [
    {
      key: 'system',
      label: '系统摘要',
      desc: '直接使用当前系统摘要',
      disabled: false
    },
    {
      key: 'replace',
      label: '替换为整理摘要',
      desc: '用整理摘要替换系统摘要',
      disabled: !hasAiSummary
    },
    {
      key: 'append',
      label: '追加并修改',
      desc: '在系统摘要后补充整理摘要',
      disabled: !hasAiSummary
    }
  ]
}

function applySummaryToPreview(preview, summaryText) {
  const nextPreview = preview && typeof preview === 'object' ? JSON.parse(JSON.stringify(preview)) : null
  if (!nextPreview || !nextPreview.project) {
    return nextPreview
  }

  nextPreview.project.summary = String(summaryText || '').trim()
  nextPreview.showSummary = !!nextPreview.project.summary
  return nextPreview
}

function hasShareBriefContent(brief) {
  const current = normalizeShareBrief(brief)
  return Boolean(
    current.summaryText
    || current.title
    || current.overviewLines.length
    || current.timelineInsight
    || current.cta
  )
}

function buildTimelinePills(historyScope) {
  const scope = normalizeHistoryScope(historyScope)
  if (scope === 'key') {
    return ['整理摘要', '任务结果', '阶段变更']
  }

  if (scope === 'none') {
    return []
  }

  return ['跟进记录', '任务完成', '阶段变更']
}

function buildHistoryState(historyScope, followTimeline, mode) {
  const normalizedScope = normalizeHistoryScope(historyScope, mode)
  const filteredTimeline = filterTimelineForHistoryScope(followTimeline, normalizedScope)
  const scopeMeta = buildHistoryScopeMeta(normalizedScope)

  return {
    currentHistoryScope: normalizedScope,
    historyScopeOptions: getHistoryScopeOptions(mode).map((item) => ({
      ...item,
      isActive: item.key === normalizedScope
    })),
    historyScopeLabel: scopeMeta.label,
    historyScopeDesc: scopeMeta.desc,
    followTimeline: filteredTimeline,
    timelineSummaryText: buildTimelineSummary(filteredTimeline),
    showTimelineEntry: normalizedScope !== 'none',
    timelinePills: buildTimelinePills(normalizedScope)
  }
}

function buildVisibleFields(preview) {
  const fields = ['项目名称']
  const contacts = Array.isArray(preview && preview.contacts) ? preview.contacts : []

  if (preview && preview.showClient) {
    fields.push('客户名称')
  }
  if (preview && preview.showStage) {
    fields.push('当前阶段')
  }
  if (preview && preview.showEstimatedAmount) {
    fields.push('预计金额')
  }
  if (preview && preview.showDescription) {
    fields.push('项目描述')
  }
  if (preview && preview.showSummary) {
    fields.push('跟进摘要')
  }
  if (preview && preview.showNextFollowUp) {
    fields.push('下一步动作')
  }
  if (contacts.length) {
    fields.push('联系人姓名')
  }
  if (contacts.some((item) => item.phone)) {
    fields.push('联系人电话')
  }
  if (contacts.some((item) => item.wechat)) {
    fields.push('联系人微信')
  }

  return fields
}

function buildVisibleFieldsSummary(visibleFields) {
  const list = Array.isArray(visibleFields) ? visibleFields : []
  if (!list.length) {
    return '项目名称'
  }

  return list.join('、')
}

function hasField(tag, fieldName) {
  const fields = Array.isArray(tag && tag.fields) ? tag.fields : []
  return fields.indexOf('全部字段') > -1 || fields.indexOf(fieldName) > -1
}

function resolveDefaultTagId(tags, mode) {
  const list = Array.isArray(tags) ? tags : []
  if (!list.length) {
    return mode === 'outbound' ? 't2' : 't1'
  }

  if (mode === 'outbound') {
    const matched = list.find((item) => hasField(item, '联系人电话') || hasField(item, '联系人微信') || String(item.name || '').includes('外发'))
    return matched ? matched.id : list[0].id
  }

  const matched = list.find((item) => !hasField(item, '联系人电话') && !hasField(item, '联系人微信'))
  return matched ? matched.id : list[0].id
}

function buildSenderState(preview) {
  const mode = preview && preview.mode ? preview.mode.key : 'info'
  const flowMode = preview && preview.flowMode ? preview.flowMode : ''
  const isCloneSeed = mode === 'outbound' && flowMode === 'clone_seed'

  return {
    heroEyebrow: '分享项目',
    heroTitle: isCloneSeed ? '新建转交' : (mode === 'outbound' ? '转交项目' : '发送资料'),
    heroSubtitle: '确认当前内容后发送。',
    stateTitle: '',
    stateDesc: '',
    stateTag: '',
    ownershipLabel: '',
    contactPolicy: '',
    stateSteps: [],
    showStateCard: false,
    showVisibleFields: false,
    showImportedActions: false,
    showSenderActions: true,
    showShareFooter: true,
    footerShareText: isCloneSeed ? '发送新建转交卡' : (mode === 'outbound' ? '发送交接卡' : '发送资料卡')
  }
}

function buildImportedState(preview) {
  const contacts = Array.isArray(preview && preview.contacts) ? preview.contacts : []
  const canDirectContact = contacts.some((item) => item.phone || item.wechat)

  return {
    heroEyebrow: '接手成功',
    heroTitle: '项目已进入“我的项目”',
    heroSubtitle: '后续直接在项目内推进。',
    stateTitle: '已完成接手',
    stateDesc: '当前项目已进入“我的项目”。',
    stateTag: '已接手',
    ownershipLabel: '已进入我的项目',
    contactPolicy: canDirectContact ? '可直接联系关键联系人' : '当前仅展示基础联系人',
    stateSteps: [],
    showStateCard: true,
    showVisibleFields: true,
    showImportedActions: true,
    showSenderActions: false,
    showShareFooter: false,
    footerShareText: ''
  }
}

function buildViewerState(preview) {
  return {
    heroEyebrow: '查看资料',
    heroTitle: '项目资料',
    heroSubtitle: '',
    stateTitle: '',
    stateDesc: '',
    stateTag: '',
    ownershipLabel: '',
    contactPolicy: '',
    stateSteps: [],
    showStateCard: false,
    showVisibleFields: true,
    showImportedActions: false,
    showSenderActions: false,
    showShareFooter: false,
    footerShareText: ''
  }
}

function buildLockedState(preview, receiverName) {
  const contacts = Array.isArray(preview && preview.contacts) ? preview.contacts : []
  const canDirectContact = contacts.some((item) => item.phone || item.wechat)
  const lockedReceiverName = String(receiverName || '').trim() || '其他接手方'

  return {
    heroEyebrow: '项目已转交',
    heroTitle: '这张交接卡已失效',
    heroSubtitle: `${lockedReceiverName} 已先完成接手。`,
    stateTitle: '当前已锁定接手人',
    stateDesc: '该项目已由其他接手方继续维护。',
    stateTag: '已锁定',
    ownershipLabel: `当前由 ${lockedReceiverName} 继续维护`,
    contactPolicy: canDirectContact ? '当前展示内容仅用于识别项目背景' : '当前仅保留基础项目信息',
    stateSteps: [],
    showStateCard: true,
    showVisibleFields: true,
    showImportedActions: false,
    showSenderActions: false,
    showShareFooter: false,
    footerShareText: ''
  }
}

function buildCardState(options = {}) {
  if (options.entry === 'sender') {
    return buildSenderState(options.preview)
  }

  if (options.blocked) {
    return buildLockedState(options.preview, options.blockedReceiverName)
  }

  if (options.imported) {
    return buildImportedState(options.preview)
  }

  return buildViewerState(options.preview)
}

function resolveShareRecordSenderEntry(options = {}, result = {}) {
  const entry = String(options.entry || '').trim()
  const projectId = String(options.projectId || '').trim()
  const hasSenderProjectContext = entry === 'sender' && !!projectId

  if (typeof result.isShareOwner === 'boolean') {
    return result.isShareOwner && hasSenderProjectContext
  }

  return hasSenderProjectContext
}

Page({
  data: {
    appearancePageClass: '',
    projectId: '',
    shareRecordId: '',
    activeMode: 'info',
    activeFlowMode: '',
    seedProjectName: '',
    activeTag: 't1',
    entry: '',
    preview: null,
    heroEyebrow: '项目卡片',
    heroTitle: '项目卡片',
    heroSubtitle: '',
    stateTitle: '',
    stateDesc: '',
    stateTag: '',
    stateSteps: [],
    visibleFields: [],
    visibleFieldsSummary: '',
    originalFollowTimeline: [],
    followTimeline: [],
    timelineSummaryText: '',
    currentHistoryScope: 'key',
    historyScopeOptions: [],
    historyScopeLabel: '',
    historyScopeDesc: '',
    showTimelineEntry: false,
    timelinePills: [],
    ownershipLabel: '',
    contactPolicy: '',
    showStateCard: false,
    showVisibleFields: false,
    showImportedActions: false,
    showSenderActions: false,
    showShareFooter: false,
    showReceiverConversion: false,
    footerShareText: '转发资料卡',
    shareBrief: null,
    shareBriefBackup: null,
    hasShareBrief: false,
    showShareBriefCard: false,
    summaryMode: 'system',
    summaryModeOptions: [],
    systemSummaryText: '',
    summaryDraftText: '',
    appliedSummaryText: '',
    showPreviewSheet: false,
    isBriefLoading: false,
    importedProjectId: '',
    isImported: false,
    isSenderEntry: false,
    isUpdatingHistoryScope: false,
    isLoading: true,
    dataSource: 'Mock Demo'
  },

  safeSetData(update, callback) {
    if (!this.isPageActive) {
      return
    }

    this.setData(update, callback)
  },

  syncSummaryState(options = {}) {
    const currentPreview = options.preview || this.data.preview
    const currentBrief = options.shareBrief !== undefined ? options.shareBrief : this.data.shareBrief
    const systemSummaryText = String(
      options.systemSummaryText !== undefined
        ? options.systemSummaryText
        : (this.data.systemSummaryText || buildSystemSummaryBase(currentPreview))
    ).trim()
    const hasAiSummary = hasShareBriefContent(currentBrief)
    const briefSummaryText = buildShareBriefSummaryText(currentBrief)
    const preferredMode = hasAiSummary
      ? normalizeSummaryMode(options.summaryMode !== undefined ? options.summaryMode : this.data.summaryMode)
      : 'system'
    const appliedSummaryText = buildAppliedSummaryText(
      preferredMode,
      systemSummaryText,
      briefSummaryText,
      options.summaryDraftText !== undefined ? options.summaryDraftText : this.data.summaryDraftText
    )
    const nextPreview = applySummaryToPreview(currentPreview, appliedSummaryText)

    return {
      preview: nextPreview,
      shareBrief: normalizeShareBrief(currentBrief),
      hasShareBrief: hasAiSummary,
      showShareBriefCard: !!this.data.isSenderEntry,
      systemSummaryText,
      summaryMode: preferredMode,
      summaryModeOptions: getSummaryModeOptions(hasAiSummary).map((item) => ({
        ...item,
        isActive: item.key === preferredMode
      })),
      summaryDraftText: appliedSummaryText,
      appliedSummaryText
    }
  },

  openPreviewSheet() {
    if (!this.data.isSenderEntry) {
      return
    }

    this.setData({
      showPreviewSheet: true
    })
  },

  closePreviewSheet() {
    this.setData({
      showPreviewSheet: false
    })
  },

  async persistShareRecord(payload) {
    const result = await createShareRecordData({
      shareRecordId: payload && payload.shareRecordId ? payload.shareRecordId : this.data.shareRecordId,
      flowMode: payload && payload.flowMode !== undefined ? payload.flowMode : this.data.activeFlowMode,
      seedProjectName: payload && payload.seedProjectName !== undefined ? payload.seedProjectName : this.data.seedProjectName,
      ...payload
    })

    await resolveNotificationData({
      projectId: payload.projectId,
      types: ['save_failed'],
      scenes: ['share_record_create']
    })

    return result || {}
  },

  async onLoad(options) {
    this.isPageActive = true
    syncPageAppearance(this)
    const projectId = options.projectId || ''
    const shareRecordId = options.shareRecordId || ''
    const activeMode = options.mode || 'info'
    const activeFlowMode = activeMode === 'outbound'
      ? (options.flowMode === 'clone_seed' ? 'clone_seed' : 'transfer_original')
      : ''
    const seedProjectName = decodeURIComponent(options.seedProjectName || '').trim()
    const activeTag = options.tagId || 't1'
    const entry = options.entry || ''

    try {
      if (shareRecordId) {
        const result = await openSharedProjectData({
          shareRecordId
        })
        const preview = buildSharePreview(
          result.shareProject,
          result.shareMode || activeMode,
          result.shareTag && result.shareTag.id ? result.shareTag.id : activeTag,
          [result.shareTag]
        )
        preview.flowMode = result.flowMode || ''
        if (preview.flowMode === 'clone_seed' && preview.project) {
          preview.project.name = result.seedProjectName || preview.project.name
          preview.project.stage = '线索'
          preview.project.estimatedAmount = ''
          preview.project.description = ''
          preview.project.summary = ''
          preview.showStage = true
          preview.showEstimatedAmount = false
          preview.showDescription = false
          preview.showNextFollowUp = false
          preview.showSummary = false
        }
        const isSenderEntry = resolveShareRecordSenderEntry(options, result)
        const effectiveEntry = isSenderEntry ? 'sender' : ''
        console.info('[share-card] entry decision', {
          options,
          isShareOwner: result.isShareOwner,
          isSenderEntry,
          showReceiverConversion: !isSenderEntry
        })
        const cardState = buildCardState({
          preview,
          imported: !!result.imported,
          entry: effectiveEntry,
          blocked: !!result.blocked,
          blockedReceiverName: result.blockedReceiverName || ''
        })
        const originalFollowTimeline = result.shareProject && Array.isArray(result.shareProject.followTimeline)
          ? result.shareProject.followTimeline
          : []
        const historyState = buildHistoryState(
          result.historyScope || getDefaultHistoryScope(result.shareMode || activeMode),
          originalFollowTimeline,
          result.shareMode || activeMode
        )
        const shareBrief = normalizeShareBrief(result.aiBrief)
        const summaryMode = normalizeSummaryMode(result.summaryMode)
        const systemSummaryText = buildSystemSummaryBase(preview)
        const summaryDraftText = String(result.summaryText || '').trim()
        const summaryState = this.syncSummaryState({
          preview,
          shareBrief,
          systemSummaryText,
          summaryMode,
          summaryDraftText
        })
        this.safeSetData({
          projectId: result.importedProjectId || projectId || (preview.project && preview.project.id) || '',
          shareRecordId,
          activeMode: result.shareMode || activeMode,
          activeFlowMode: result.flowMode || '',
          seedProjectName: result.seedProjectName || '',
          activeTag: result.shareTag && result.shareTag.id ? result.shareTag.id : activeTag,
          entry: effectiveEntry,
          importedProjectId: result.importedProjectId || '',
          isImported: !!result.imported,
          preview: summaryState.preview,
          heroEyebrow: cardState.heroEyebrow,
          heroTitle: cardState.heroTitle,
          heroSubtitle: cardState.heroSubtitle,
          stateTitle: cardState.stateTitle,
          stateDesc: cardState.stateDesc,
          stateTag: cardState.stateTag,
          stateSteps: cardState.stateSteps,
          visibleFields: buildVisibleFields(preview),
          visibleFieldsSummary: buildVisibleFieldsSummary(buildVisibleFields(preview)),
          originalFollowTimeline,
          followTimeline: historyState.followTimeline,
          timelineSummaryText: historyState.timelineSummaryText,
          currentHistoryScope: historyState.currentHistoryScope,
          historyScopeOptions: historyState.historyScopeOptions,
          historyScopeLabel: historyState.historyScopeLabel,
          historyScopeDesc: historyState.historyScopeDesc,
          showTimelineEntry: historyState.showTimelineEntry,
          timelinePills: historyState.timelinePills,
          ownershipLabel: cardState.ownershipLabel,
          contactPolicy: cardState.contactPolicy,
          showStateCard: cardState.showStateCard,
          showVisibleFields: cardState.showVisibleFields,
          showImportedActions: cardState.showImportedActions,
          showSenderActions: cardState.showSenderActions,
          showShareFooter: cardState.showShareFooter,
          footerShareText: cardState.footerShareText,
          shareBrief: summaryState.shareBrief,
          hasShareBrief: summaryState.hasShareBrief,
          showShareBriefCard: preview.flowMode === 'clone_seed' ? false : summaryState.showShareBriefCard,
          summaryMode: summaryState.summaryMode,
          summaryModeOptions: summaryState.summaryModeOptions,
          systemSummaryText: summaryState.systemSummaryText,
          summaryDraftText: summaryState.summaryDraftText,
          appliedSummaryText: summaryState.appliedSummaryText,
          isSenderEntry,
          showReceiverConversion: !isSenderEntry,
          isLoading: false,
          dataSource: 'CloudBase'
        })

        if (result.blocked && result.blockedMessage) {
          wx.showToast({
            title: result.blockedMessage,
            icon: 'none'
          })
        }
        return
      }

      const decision = await ensureActionAllowed(activeMode === 'outbound' ? 'share_out' : 'share_record', {
        refresh: true,
        guide: true
      })
      if (!decision.allowed) {
        const preview = buildDeniedPreview(activeMode)
        this.safeSetData({
          projectId,
          activeMode,
          activeFlowMode,
          seedProjectName,
          activeTag,
          entry: 'sender',
          preview,
          heroEyebrow: '分享项目',
          heroTitle: activeMode === 'outbound' ? '转交项目暂不可用' : '发送资料暂不可用',
          heroSubtitle: decision.message || '当前账号权益不足，请先确认套餐后再继续。',
          stateTitle: '当前权益不足',
          stateDesc: decision.message || '请先订阅套餐或恢复账号可写权限，再生成分享卡。',
          stateTag: '受限',
          visibleFields: [],
          visibleFieldsSummary: '',
          ownershipLabel: '',
          contactPolicy: '',
          showStateCard: true,
          showVisibleFields: false,
          showImportedActions: false,
          showSenderActions: false,
          showShareFooter: false,
          showShareBriefCard: false,
          isSenderEntry: true,
          showReceiverConversion: false,
          isLoading: false,
          dataSource: ''
        })
        return
      }

      const { data, source } = await loadShareConfigData(projectId)
      const nextActiveTag = String(activeTag || '').trim() || resolveDefaultTagId(data.shareTags, activeMode)
      const preview = buildSharePreview(data.shareProject, activeMode, nextActiveTag, data.shareTags)
      preview.flowMode = activeFlowMode
      if (activeFlowMode === 'clone_seed' && preview.project) {
        preview.project.name = seedProjectName || preview.project.name
        preview.project.stage = '线索'
        preview.project.estimatedAmount = ''
        preview.project.description = ''
        preview.project.summary = ''
        preview.showStage = true
        preview.showEstimatedAmount = false
        preview.showDescription = false
        preview.showNextFollowUp = false
        preview.showSummary = false
      }
      const cardState = buildSenderState(preview)
      const defaultHistoryScope = activeFlowMode === 'clone_seed'
        ? 'none'
        : (normalizeHistoryScope(options.historyScope, activeMode) || getDefaultHistoryScope(activeMode))
      const originalFollowTimeline = Array.isArray(data.shareProject && data.shareProject.followTimeline)
        ? data.shareProject.followTimeline
        : []
      const historyState = buildHistoryState(defaultHistoryScope, originalFollowTimeline, activeMode)
      const systemSummaryText = buildSystemSummaryBase(preview)

      let createdRecord = {}
      if (projectId) {
        try {
          createdRecord = await this.persistShareRecord({
            projectId,
            shareMode: activeMode,
            flowMode: activeFlowMode,
            seedProjectName,
            shareTagId: nextActiveTag,
            shareTagName: getShareScopeName(activeMode),
            shareTagFields: preview && preview.tag ? preview.tag.fields : [],
            historyScope: defaultHistoryScope,
            summaryMode: 'system',
            summaryText: systemSummaryText
          })
        } catch (error) {
          await reportSystemFailureData({
            type: 'save_failed',
            scene: 'share_record_create',
            title: '创建分享失败',
            message: error.message || '当前无法生成分享卡，请稍后重试',
            projectId,
            projectName: preview && preview.project ? preview.project.name : '',
            actionUrl: `/pages/project-detail/project-detail?projectId=${projectId}`,
            actionLabel: '返回项目'
          })
          throw error
        }
      }

      const shareBrief = normalizeShareBrief(createdRecord && createdRecord.aiBrief)
      const summaryState = this.syncSummaryState({
        preview,
        shareBrief,
        systemSummaryText,
        summaryMode: createdRecord && createdRecord.summaryMode ? createdRecord.summaryMode : 'system',
        summaryDraftText: createdRecord && createdRecord.summaryText ? createdRecord.summaryText : systemSummaryText
      })

      this.safeSetData({
        projectId,
        shareRecordId: createdRecord && createdRecord.shareRecordId ? createdRecord.shareRecordId : '',
        activeMode,
        activeFlowMode,
        seedProjectName: createdRecord && createdRecord.seedProjectName ? createdRecord.seedProjectName : seedProjectName,
        activeTag: nextActiveTag,
        entry: 'sender',
        preview: summaryState.preview,
        heroEyebrow: cardState.heroEyebrow,
        heroTitle: cardState.heroTitle,
        heroSubtitle: cardState.heroSubtitle,
        stateTitle: cardState.stateTitle,
        stateDesc: cardState.stateDesc,
        stateTag: cardState.stateTag,
        stateSteps: cardState.stateSteps,
        visibleFields: buildVisibleFields(preview),
        visibleFieldsSummary: buildVisibleFieldsSummary(buildVisibleFields(preview)),
        originalFollowTimeline,
        followTimeline: historyState.followTimeline,
        timelineSummaryText: historyState.timelineSummaryText,
        currentHistoryScope: historyState.currentHistoryScope,
        historyScopeOptions: historyState.historyScopeOptions,
        historyScopeLabel: historyState.historyScopeLabel,
        historyScopeDesc: historyState.historyScopeDesc,
        showTimelineEntry: historyState.showTimelineEntry,
        timelinePills: historyState.timelinePills,
        ownershipLabel: cardState.ownershipLabel,
        contactPolicy: cardState.contactPolicy,
        showStateCard: cardState.showStateCard,
        showVisibleFields: cardState.showVisibleFields,
        showImportedActions: cardState.showImportedActions,
        showSenderActions: cardState.showSenderActions,
        showShareFooter: cardState.showShareFooter && !!(createdRecord && createdRecord.shareRecordId),
        footerShareText: cardState.footerShareText,
        shareBrief: summaryState.shareBrief,
        hasShareBrief: summaryState.hasShareBrief,
        showShareBriefCard: activeFlowMode === 'clone_seed' ? false : true,
        summaryMode: summaryState.summaryMode,
        summaryModeOptions: summaryState.summaryModeOptions,
        systemSummaryText: summaryState.systemSummaryText,
        summaryDraftText: summaryState.summaryDraftText,
        appliedSummaryText: summaryState.appliedSummaryText,
        isSenderEntry: true,
        showReceiverConversion: false,
        isLoading: false,
        dataSource: source
      })

      if (createdRecord && createdRecord.reusedExistingOutbound) {
        wx.showToast({
          title: '已沿用当前项目的转交记录',
          icon: 'none'
        })
      }
    } catch (error) {
      this.safeSetData({
        isLoading: false
      })
      wx.showToast({
        title: '当前无法打开项目卡片',
        icon: 'none'
      })
    }
  },

  onShow() {
    this.isPageActive = true
    syncPageAppearance(this)
  },

  onHide() {
    this.isPageActive = false
  },

  onUnload() {
    this.isPageActive = false
  },

  onShareAppMessage() {
    const path = this.data.shareRecordId
      ? `/pages/share-card/share-card?shareRecordId=${this.data.shareRecordId}`
      : `/pages/share-card/share-card?projectId=${this.data.projectId}&mode=${this.data.activeMode}&tagId=${this.data.activeTag}`

    return {
      title: this.data.preview && this.data.preview.project ? this.data.preview.project.name : '项目分享',
      path
    }
  },

  openImportedProject() {
    if (!this.data.importedProjectId) {
      return
    }

    wx.navigateTo({
      url: `/pages/project-detail/project-detail?projectId=${this.data.importedProjectId}`
    })
  },

  openProjectsPage() {
    wx.reLaunch({
      url: '/pages/projects/projects'
    })
  },

  openHomePage() {
    wx.reLaunch({
      url: '/pages/index/index'
    })
  },

  openTimelinePage() {
    const baseUrl = '/pages/share-timeline/share-timeline'

    if (this.data.entry === 'sender' || this.data.isSenderEntry) {
      wx.navigateTo({
        url: `${baseUrl}?projectId=${this.data.projectId}&mode=${this.data.activeMode}&tagId=${this.data.activeTag}&entry=sender&historyScope=${this.data.currentHistoryScope}`
      })
      return
    }

    if (this.data.shareRecordId) {
      wx.navigateTo({
        url: `${baseUrl}?shareRecordId=${this.data.shareRecordId}&entry=${this.data.entry || ''}`
      })
      return
    }

    wx.navigateTo({
      url: `${baseUrl}?projectId=${this.data.projectId}&mode=${this.data.activeMode}&tagId=${this.data.activeTag}&entry=${this.data.entry || 'sender'}`
    })
  },

  async handleGenerateShareBrief() {
    if (!this.data.isSenderEntry || this.data.isBriefLoading) {
      return
    }

    const decision = await ensureActionAllowed('ai', { guide: true })
    if (!decision.allowed) {
      return
    }

    const previousBrief = hasShareBriefContent(this.data.shareBrief) ? cloneSnapshot(this.data.shareBrief) : null
    this.setData({
      isBriefLoading: true,
      shareBriefBackup: previousBrief || this.data.shareBriefBackup
    })

    try {
      const result = await requestShareBrief({
        projectId: this.data.projectId,
        shareMode: this.data.activeMode,
        shareTagId: this.data.activeTag
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : 'AI 分享摘要生成失败')
      }

      const normalizedBrief = normalizeShareBrief({
        ...result,
        generatedAt: result.generatedAt || new Date().toISOString()
      })
      const summaryState = this.syncSummaryState({
        preview: this.data.preview,
        shareBrief: normalizedBrief,
        systemSummaryText: this.data.systemSummaryText,
        summaryMode: this.data.summaryMode,
        summaryDraftText: this.data.summaryDraftText
      })
      const recordResult = await this.persistShareRecord({
        projectId: this.data.projectId,
        shareMode: this.data.activeMode,
        flowMode: this.data.activeFlowMode,
        seedProjectName: this.data.seedProjectName,
        shareTagId: this.data.activeTag,
        shareTagName: getShareScopeName(this.data.activeMode),
        shareTagFields: this.data.preview && this.data.preview.tag ? this.data.preview.tag.fields : [],
        historyScope: this.data.currentHistoryScope,
        aiBrief: normalizedBrief,
        summaryMode: summaryState.summaryMode,
        summaryText: summaryState.summaryDraftText
      })

      const hadPreviousVersion = !!previousBrief

      this.setData({
        shareRecordId: recordResult && recordResult.shareRecordId ? recordResult.shareRecordId : this.data.shareRecordId,
        preview: summaryState.preview,
        shareBrief: summaryState.shareBrief,
        hasShareBrief: summaryState.hasShareBrief,
        showShareBriefCard: true,
        summaryMode: summaryState.summaryMode,
        summaryModeOptions: summaryState.summaryModeOptions,
        systemSummaryText: summaryState.systemSummaryText,
        summaryDraftText: summaryState.summaryDraftText,
        appliedSummaryText: summaryState.appliedSummaryText
      })

      wx.showToast({
        title: hadPreviousVersion ? '新摘要已生成，可恢复上一版' : '项目摘要已生成',
        icon: 'none'
      })
    } catch (error) {
      wx.showToast({
        title: error.message || '当前无法生成项目摘要',
        icon: 'none'
      })
    } finally {
      this.setData({
        isBriefLoading: false
      })
    }
  },

  async restoreShareBriefVersion() {
    if (!this.data.shareBriefBackup) {
      return
    }

    const currentBrief = cloneSnapshot(this.data.shareBrief)
    const restoredBrief = cloneSnapshot(this.data.shareBriefBackup)
    const summaryState = this.syncSummaryState({
      preview: this.data.preview,
      shareBrief: restoredBrief,
      systemSummaryText: this.data.systemSummaryText,
      summaryMode: this.data.summaryMode,
      summaryDraftText: this.data.summaryDraftText
    })

    try {
      const recordResult = await this.persistShareRecord({
        projectId: this.data.projectId,
        shareMode: this.data.activeMode,
        flowMode: this.data.activeFlowMode,
        seedProjectName: this.data.seedProjectName,
        shareTagId: this.data.activeTag,
        shareTagName: getShareScopeName(this.data.activeMode),
        shareTagFields: this.data.preview && this.data.preview.tag ? this.data.preview.tag.fields : [],
        historyScope: this.data.currentHistoryScope,
        aiBrief: restoredBrief,
        summaryMode: summaryState.summaryMode,
        summaryText: summaryState.summaryDraftText
      })

      this.safeSetData({
        shareRecordId: recordResult && recordResult.shareRecordId ? recordResult.shareRecordId : this.data.shareRecordId,
        shareBrief: summaryState.shareBrief,
        shareBriefBackup: currentBrief,
        hasShareBrief: summaryState.hasShareBrief,
        preview: summaryState.preview,
        summaryMode: summaryState.summaryMode,
        summaryModeOptions: summaryState.summaryModeOptions,
        systemSummaryText: summaryState.systemSummaryText,
        summaryDraftText: summaryState.summaryDraftText,
        appliedSummaryText: summaryState.appliedSummaryText
      })

      wx.showToast({
        title: '已恢复上一版摘要',
        icon: 'success'
      })
    } catch (error) {
      wx.showToast({
        title: error.message || '当前无法恢复上一版摘要',
        icon: 'none'
      })
    }
  },

  async setHistoryScope(event) {
    if (!this.data.isSenderEntry || this.data.isUpdatingHistoryScope) {
      return
    }

    const nextScope = normalizeHistoryScope(event.currentTarget.dataset.scope, this.data.activeMode)
    if (!nextScope || nextScope === this.data.currentHistoryScope) {
      return
    }

    this.setData({
      isUpdatingHistoryScope: true
    })

    try {
      const recordResult = await this.persistShareRecord({
        projectId: this.data.projectId,
        shareMode: this.data.activeMode,
        flowMode: this.data.activeFlowMode,
        seedProjectName: this.data.seedProjectName,
        shareTagId: this.data.activeTag,
        shareTagName: getShareScopeName(this.data.activeMode),
        shareTagFields: this.data.preview && this.data.preview.tag ? this.data.preview.tag.fields : [],
        historyScope: nextScope,
        aiBrief: this.data.shareBrief,
        summaryMode: this.data.summaryMode,
        summaryText: this.data.summaryDraftText
      })

      const historyState = buildHistoryState(nextScope, this.data.originalFollowTimeline, this.data.activeMode)

      this.setData({
        shareRecordId: recordResult && recordResult.shareRecordId ? recordResult.shareRecordId : this.data.shareRecordId,
        currentHistoryScope: historyState.currentHistoryScope,
        historyScopeOptions: historyState.historyScopeOptions,
        historyScopeLabel: historyState.historyScopeLabel,
        historyScopeDesc: historyState.historyScopeDesc,
        followTimeline: historyState.followTimeline,
        timelineSummaryText: historyState.timelineSummaryText,
        showTimelineEntry: historyState.showTimelineEntry,
        timelinePills: historyState.timelinePills
      })
    } catch (error) {
      wx.showToast({
        title: error.message || '当前无法更新历史范围',
        icon: 'none'
      })
    } finally {
      this.setData({
        isUpdatingHistoryScope: false
      })
    }
  },

  async setSummaryMode(event) {
    if (!this.data.isSenderEntry) {
      return
    }

    const nextMode = normalizeSummaryMode(event.currentTarget.dataset.mode)
    const option = (this.data.summaryModeOptions || []).find((item) => item.key === nextMode)
    if (!option || option.disabled || nextMode === this.data.summaryMode) {
      return
    }

    const summaryState = this.syncSummaryState({
      preview: this.data.preview,
      shareBrief: this.data.shareBrief,
      systemSummaryText: this.data.systemSummaryText,
      summaryMode: nextMode,
      summaryDraftText: ''
    })

    this.setData({
      preview: summaryState.preview,
      summaryMode: summaryState.summaryMode,
      summaryModeOptions: summaryState.summaryModeOptions,
      summaryDraftText: summaryState.summaryDraftText,
      appliedSummaryText: summaryState.appliedSummaryText
    })

    try {
      const recordResult = await this.persistShareRecord({
        projectId: this.data.projectId,
        shareMode: this.data.activeMode,
        flowMode: this.data.activeFlowMode,
        seedProjectName: this.data.seedProjectName,
        shareTagId: this.data.activeTag,
        shareTagName: getShareScopeName(this.data.activeMode),
        shareTagFields: this.data.preview && this.data.preview.tag ? this.data.preview.tag.fields : [],
        historyScope: this.data.currentHistoryScope,
        aiBrief: this.data.shareBrief,
        summaryMode: summaryState.summaryMode,
        summaryText: summaryState.summaryDraftText
      })

      this.setData({
        shareRecordId: recordResult && recordResult.shareRecordId ? recordResult.shareRecordId : this.data.shareRecordId
      })
    } catch (error) {
      wx.showToast({
        title: error.message || '当前无法更新摘要方式',
        icon: 'none'
      })
    }
  },

  async onSummaryDraftInput(event) {
    if (!this.data.isSenderEntry) {
      return
    }

    const nextText = String(event.detail.value || '')
    const summaryState = this.syncSummaryState({
      preview: this.data.preview,
      shareBrief: this.data.shareBrief,
      systemSummaryText: this.data.systemSummaryText,
      summaryMode: this.data.summaryMode,
      summaryDraftText: nextText
    })

    this.setData({
      preview: summaryState.preview,
      summaryDraftText: nextText,
      appliedSummaryText: summaryState.appliedSummaryText
    })
  },

  async persistSummaryDraft() {
    if (!this.data.isSenderEntry) {
      return
    }

    try {
      const recordResult = await this.persistShareRecord({
        projectId: this.data.projectId,
        shareMode: this.data.activeMode,
        flowMode: this.data.activeFlowMode,
        seedProjectName: this.data.seedProjectName,
        shareTagId: this.data.activeTag,
        shareTagName: getShareScopeName(this.data.activeMode),
        shareTagFields: this.data.preview && this.data.preview.tag ? this.data.preview.tag.fields : [],
        historyScope: this.data.currentHistoryScope,
        aiBrief: this.data.shareBrief,
        summaryMode: this.data.summaryMode,
        summaryText: this.data.summaryDraftText
      })

      this.setData({
        shareRecordId: recordResult && recordResult.shareRecordId ? recordResult.shareRecordId : this.data.shareRecordId
      })
    } catch (error) {
      wx.showToast({
        title: error.message || '当前无法保存摘要',
        icon: 'none'
      })
    }
  }
})
