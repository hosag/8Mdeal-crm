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

function countTimelineRecords(followTimeline) {
  return (Array.isArray(followTimeline) ? followTimeline : []).reduce((total, group) => {
    return total + (Array.isArray(group.items) ? group.items.length : 0)
  }, 0)
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
  const providerLabel = String(brief.providerLabel || (sourceType === 'fallback' ? '本地规则引擎' : 'CloudBase AI')).trim()
  const modelName = String(brief.modelName || (sourceType === 'fallback' ? '' : 'hunyuan-exp / hunyuan-turbos-latest')).trim()
  const overviewLines = Array.isArray(brief.overviewLines)
    ? brief.overviewLines
    : brief.briefLines
  const timelineInsight = String(brief.timelineInsight || brief.shareGoal || '').trim()
  const summaryText = String(
    brief.summaryText
    || brief.aiSummaryText
    || [String(brief.title || '').trim(), (Array.isArray(overviewLines) ? overviewLines.join(' ') : ''), timelineInsight].filter(Boolean).join(' ')
  ).trim()
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
    sourceLabel: String(brief.sourceLabel || (sourceType === 'fallback' ? '基础建议' : '大模型建议')).trim(),
    providerLabel,
    modelName,
    sourceCaption: modelName ? `${providerLabel} · ${modelName}` : providerLabel,
    sourceOriginText: `来自 ${modelName ? `${providerLabel} · ${modelName}` : providerLabel}`,
    regenerateLabel: sourceType === 'fallback' ? 'AI整理' : '重新整理'
  }
}

function normalizeSummaryMode(value) {
  const current = String(value || '').trim()
  if (current === 'system' || current === 'replace' || current === 'append') {
    return current
  }

  return 'system'
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
      desc: '直接使用系统摘要基底',
      disabled: false
    },
    {
      key: 'replace',
      label: '替换为AI摘要',
      desc: '用 AI 摘要替换系统摘要',
      disabled: !hasAiSummary
    },
    {
      key: 'append',
      label: '追加并修改',
      desc: '在系统摘要后补充 AI 摘要',
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
    return ['AI 摘要', '任务结果', '阶段变更']
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

  return {
    heroEyebrow: '分享项目',
    heroTitle: mode === 'outbound' ? '转交项目' : '发送资料',
    heroSubtitle: '设置摘要与时间线后发送。',
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
    footerShareText: mode === 'outbound' ? '发送交接卡' : '发送资料卡'
  }
}

function buildImportedState(preview) {
  const contacts = Array.isArray(preview && preview.contacts) ? preview.contacts : []
  const canDirectContact = contacts.some((item) => item.phone || item.wechat)

  return {
    heroEyebrow: '接手成功',
    heroTitle: '项目已进入“我的项目”',
    heroSubtitle: '项目已写入你的项目列表，后续请直接在项目内继续推进。',
    stateTitle: '已完成接手',
    stateDesc: '当前项目已进入你的“我的项目”。',
    stateTag: '已接手',
    ownershipLabel: '已进入我的项目',
    contactPolicy: canDirectContact ? '可直接联系关键联系人' : '当前仅展示基础联系人',
    stateSteps: [
      '打开项目详情，确认阶段、联系人和历史跟进。',
      '后续新增记录会继续写入你的项目时间线。'
    ],
    showStateCard: true,
    showVisibleFields: true,
    showImportedActions: true,
    showSenderActions: false,
    showShareFooter: false,
    footerShareText: ''
  }
}

function buildViewerState(preview) {
  const contacts = Array.isArray(preview && preview.contacts) ? preview.contacts : []
  const canDirectContact = contacts.some((item) => item.phone || item.wechat)

  return {
    heroEyebrow: '查看资料',
    heroTitle: '资料卡',
    heroSubtitle: '当前仅可查看项目资料。',
    stateTitle: '仅查看',
    stateDesc: '这次分享不转移管理权。',
    stateTag: '仅查看',
    ownershipLabel: '仍由分享方维护',
    contactPolicy: canDirectContact ? '按当前范围可直接联系' : '联系方式按当前范围隐藏',
    stateSteps: [
      '当前页面仅展示分享方开放的信息。',
      '如需接手，请让分享方改用“转交项目”发送。'
    ],
    showStateCard: true,
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
    stateDesc: '转交项目仅允许一位接手方接管。',
    stateTag: '已锁定',
    ownershipLabel: `当前由 ${lockedReceiverName} 继续维护`,
    contactPolicy: canDirectContact ? '当前展示内容仅用于识别项目背景' : '当前仅保留基础项目信息',
    stateSteps: [
      '这条交接记录已经完成接手，不会再次进入你的“我的项目”。',
      '如需参与，请让分享方重新发起新的分享。'
    ],
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

Page({
  data: {
    appearancePageClass: '',
    projectId: '',
    shareRecordId: '',
    activeMode: 'info',
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
    footerShareText: '转发资料卡',
    shareBrief: null,
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
        const cardState = buildCardState({
          preview,
          imported: !!result.imported,
          entry,
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
          activeTag: result.shareTag && result.shareTag.id ? result.shareTag.id : activeTag,
          entry,
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
          showShareBriefCard: summaryState.showShareBriefCard,
          summaryMode: summaryState.summaryMode,
          summaryModeOptions: summaryState.summaryModeOptions,
          systemSummaryText: summaryState.systemSummaryText,
          summaryDraftText: summaryState.summaryDraftText,
          appliedSummaryText: summaryState.appliedSummaryText,
          isSenderEntry: entry === 'sender',
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

      const { data, source } = await loadShareConfigData(projectId)
      const nextActiveTag = String(activeTag || '').trim() || resolveDefaultTagId(data.shareTags, activeMode)
      const preview = buildSharePreview(data.shareProject, activeMode, nextActiveTag, data.shareTags)
      const cardState = buildSenderState(preview)
      const defaultHistoryScope = normalizeHistoryScope(options.historyScope, activeMode) || getDefaultHistoryScope(activeMode)
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
            shareTagId: nextActiveTag,
            shareTagName: preview && preview.tag ? preview.tag.name : '',
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
        showShareBriefCard: true,
        summaryMode: summaryState.summaryMode,
        summaryModeOptions: summaryState.summaryModeOptions,
        systemSummaryText: summaryState.systemSummaryText,
        summaryDraftText: summaryState.summaryDraftText,
        appliedSummaryText: summaryState.appliedSummaryText,
        isSenderEntry: true,
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

    this.setData({
      isBriefLoading: true
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

      const normalizedBrief = normalizeShareBrief(result)
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
        shareTagId: this.data.activeTag,
        shareTagName: this.data.preview && this.data.preview.tag ? this.data.preview.tag.name : '',
        shareTagFields: this.data.preview && this.data.preview.tag ? this.data.preview.tag.fields : [],
        historyScope: this.data.currentHistoryScope,
        aiBrief: normalizedBrief,
        summaryMode: summaryState.summaryMode,
        summaryText: summaryState.summaryDraftText
      })

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
        title: 'AI 摘要已生成',
        icon: 'success'
      })
    } catch (error) {
      wx.showToast({
        title: error.message || '当前无法生成 AI 摘要',
        icon: 'none'
      })
    } finally {
      this.setData({
        isBriefLoading: false
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
        shareTagId: this.data.activeTag,
        shareTagName: this.data.preview && this.data.preview.tag ? this.data.preview.tag.name : '',
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
        shareTagId: this.data.activeTag,
        shareTagName: this.data.preview && this.data.preview.tag ? this.data.preview.tag.name : '',
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
        shareTagId: this.data.activeTag,
        shareTagName: this.data.preview && this.data.preview.tag ? this.data.preview.tag.name : '',
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
