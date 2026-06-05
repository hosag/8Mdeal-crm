const { loadShareConfigData, openSharedProjectData } = require('../../services/data')
const {
  buildSharePreview,
  getDefaultHistoryScope,
  normalizeHistoryScope,
  buildHistoryScopeMeta,
  filterTimelineForHistoryScope
} = require('../../services/share')
const { syncPageAppearance } = require('../../utils/appearance')

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
    `共 ${total} 条`,
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

Page({
  data: {
    appearancePageClass: '',
    projectId: '',
    shareRecordId: '',
    activeMode: 'info',
    activeTag: 't1',
    entry: '',
    preview: null,
    followTimeline: [],
    timelineSummaryText: '',
    currentHistoryScope: 'key',
    historyScopeLabel: '',
    isLoading: true,
    dataSource: 'Mock Demo'
  },

  safeSetData(update, callback) {
    if (!this.isPageActive) {
      return
    }

    this.setData(update, callback)
  },

  async onLoad(options) {
    this.isPageActive = true
    syncPageAppearance(this)
    const projectId = options.projectId || ''
    const shareRecordId = options.shareRecordId || ''
    const activeMode = options.mode || 'info'
    const activeTag = options.tagId || 't1'
    const entry = options.entry || ''
    const requestedHistoryScope = options.historyScope || ''

    try {
      if (shareRecordId && entry !== 'sender') {
        const result = await openSharedProjectData({
          shareRecordId
        })
        const nextTagId = result.shareTag && result.shareTag.id ? result.shareTag.id : activeTag
        const preview = buildSharePreview(
          result.shareProject,
          result.shareMode || activeMode,
          nextTagId,
          [result.shareTag]
        )
        const followTimeline = result.shareProject && Array.isArray(result.shareProject.followTimeline)
          ? result.shareProject.followTimeline
          : []
        const historyScope = normalizeHistoryScope(result.historyScope, result.shareMode || activeMode)
        const historyMeta = buildHistoryScopeMeta(historyScope)

        this.safeSetData({
          projectId: result.importedProjectId || projectId || (preview.project && preview.project.id) || '',
          shareRecordId,
          activeMode: result.shareMode || activeMode,
          activeTag: nextTagId,
          entry,
          preview,
          followTimeline,
          timelineSummaryText: buildTimelineSummary(followTimeline),
          currentHistoryScope: historyScope,
          historyScopeLabel: historyMeta.label,
          isLoading: false,
          dataSource: 'CloudBase'
        })
        return
      }

      const { data, source } = await loadShareConfigData(projectId)
      const nextActiveTag = String(activeTag || '').trim() || resolveDefaultTagId(data.shareTags, activeMode)
      const preview = buildSharePreview(data.shareProject, activeMode, nextActiveTag, data.shareTags)
      const originalFollowTimeline = Array.isArray(data.shareProject && data.shareProject.followTimeline)
        ? data.shareProject.followTimeline
        : []
      const historyScope = normalizeHistoryScope(requestedHistoryScope, activeMode) || getDefaultHistoryScope(activeMode)
      const historyMeta = buildHistoryScopeMeta(historyScope)
      const followTimeline = filterTimelineForHistoryScope(originalFollowTimeline, historyScope)

      this.safeSetData({
        projectId,
        shareRecordId: '',
        activeMode,
        activeTag: nextActiveTag,
        entry,
        preview,
        followTimeline,
        timelineSummaryText: buildTimelineSummary(followTimeline),
        currentHistoryScope: historyScope,
        historyScopeLabel: historyMeta.label,
        isLoading: false,
        dataSource: source
      })
    } catch (error) {
      this.safeSetData({
        isLoading: false
      })
      wx.showToast({
        title: '时间线加载失败，请重试',
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
  }
})
