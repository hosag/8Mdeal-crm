const defaultShareModes = [
  {
    key: 'info',
    title: '分享信息',
    desc: '发给需要了解项目情况的人，只展示授权字段，不转移管理权。',
    badge: '仅查看'
  },
  {
    key: 'outbound',
    title: '项目外发',
    desc: '发给需要正式接手项目的人，展示推进所需信息，打开后转移管理权。',
    badge: '接手管理权'
  }
]

const defaultShareTags = [
  {
    id: 't1',
    name: '基础浏览',
    desc: '隐藏电话、微信，仅展示项目基础信息与联系人姓名。',
    fields: ['项目名称', '客户名称', '当前阶段', '预计金额', '联系人姓名', '项目描述']
  },
  {
    id: 't2',
    name: '完整外发',
    desc: '展示完整联系方式与下一步动作，适合项目接手。',
    fields: ['项目名称', '客户名称', '当前阶段', '预计金额', '项目描述', '联系人姓名', '联系人电话', '联系人微信', '下一步动作', '分享来源']
  },
  {
    id: 't3',
    name: '全量查看',
    desc: '展示全部可分享字段，并附带来源说明。',
    fields: ['全部字段']
  }
]

const visibleFields = [
  '项目名称',
  '客户名称',
  '当前阶段',
  '预计金额',
  '项目描述',
  '联系人姓名',
  '联系人电话',
  '联系人微信',
  '跟进摘要',
  '下一步动作',
  '分享来源',
  '全部字段'
]

const historyScopeOptions = [
  {
    key: 'full',
    label: '完整时间线',
    desc: '展示全部跟进、任务完成和阶段变化。'
  },
  {
    key: 'key',
    label: '仅看关键历史',
    desc: '只展示摘要、任务结果和阶段变化。'
  },
  {
    key: 'none',
    label: '不附带历史',
    desc: '不发送项目历史记录。'
  }
]

function clone(data) {
  return JSON.parse(JSON.stringify(data))
}

function getDefaultShareModes() {
  return clone(defaultShareModes)
}

function getDefaultShareTags() {
  return clone(defaultShareTags)
}

function getVisibleFields() {
  return clone(visibleFields)
}

function getDefaultHistoryScope(mode) {
  return mode === 'outbound' ? 'full' : 'key'
}

function normalizeHistoryScope(value, mode) {
  const text = String(value || '').trim()
  if (text === 'full' || text === 'key' || text === 'none') {
    return text
  }

  return getDefaultHistoryScope(mode)
}

function getHistoryScopeOptions(mode) {
  const activeScope = getDefaultHistoryScope(mode)
  return clone(historyScopeOptions).map((item) => ({
    ...item,
    isActive: item.key === activeScope
  }))
}

function buildHistoryScopeMeta(scope) {
  const normalized = normalizeHistoryScope(scope)
  const matched = historyScopeOptions.find((item) => item.key === normalized) || historyScopeOptions[1]
  return clone(matched)
}

function normalizeShareTag(item, index = 0) {
  return {
    id: String(item && item.id ? item.id : `tag-${Date.now()}-${index}`).trim(),
    name: String(item && item.name ? item.name : `标签${index + 1}`).trim(),
    desc: String(item && item.desc ? item.desc : '').trim(),
    fields: Array.isArray(item && item.fields)
      ? item.fields.map((field) => String(field || '').trim()).filter(Boolean)
      : []
  }
}

function resolveShareTags(tags) {
  if (!Array.isArray(tags) || !tags.length) {
    return getDefaultShareTags()
  }

  return tags.map((item, index) => normalizeShareTag(item, index))
}

function getActiveMode(activeMode) {
  const modes = getDefaultShareModes()
  return modes.find((item) => item.key === activeMode) || modes[0]
}

function getActiveTag(activeTag, shareTags) {
  const tags = resolveShareTags(shareTags)
  return tags.find((item) => item.id === activeTag) || tags[0]
}

function hasAnyField(tagFields, targets) {
  if (!Array.isArray(tagFields) || !tagFields.length) {
    return false
  }

  if (tagFields.indexOf('全部字段') > -1) {
    return true
  }

  return targets.some((item) => tagFields.indexOf(item) > -1)
}

function pickLatestSummary(followTimeline) {
  const timeline = Array.isArray(followTimeline) ? followTimeline : []
  if (!timeline.length || !Array.isArray(timeline[0].items) || !timeline[0].items.length) {
    return ''
  }

  const latest = timeline[0].items[0]
  return latest.summary || latest.desc || ''
}

function buildKeyHistorySummary(item) {
  const source = item || {}

  if (String(source.summary || '').trim()) {
    return String(source.summary).trim()
  }

  if (source.typeKey === 'task_done') {
    return String(source.title || '动作已完成').trim()
  }

  if (String(source.stageChange || '').trim()) {
    return `阶段已更新为 ${String(source.stageChange).trim()}`
  }

  if (String(source.nextFollowUpText || '').trim()) {
    return `已约定下次跟进 ${String(source.nextFollowUpText).trim()}`
  }

  return `${String(source.methodLabel || source.typeLabel || '跟进').trim() || '跟进'}已记录`
}

function filterTimelineForHistoryScope(followTimeline, historyScope) {
  const normalizedScope = normalizeHistoryScope(historyScope)
  const timeline = clone(Array.isArray(followTimeline) ? followTimeline : [])

  if (normalizedScope === 'none') {
    return []
  }

  if (normalizedScope === 'full') {
    return timeline
  }

  return timeline.map((group) => ({
    ...group,
    items: (Array.isArray(group.items) ? group.items : []).map((item) => ({
      ...item,
      summary: buildKeyHistorySummary(item),
      highlights: Array.isArray(item && item.highlights) ? item.highlights : [],
      risks: Array.isArray(item && item.risks) ? item.risks : [],
      missingInfo: Array.isArray(item && item.missingInfo) ? item.missingInfo : [],
      desc: '',
      rawLabel: ''
    }))
  }))
}

function buildSharePreview(shareProject, activeMode, activeTag, shareTags) {
  const mode = getActiveMode(activeMode)
  const tag = getActiveTag(activeTag, shareTags)
  const detail = shareProject && shareProject.projectDetail ? shareProject.projectDetail : {}
  const contacts = Array.isArray(shareProject && shareProject.contacts) ? shareProject.contacts : []
  const followTimeline = Array.isArray(shareProject && shareProject.followTimeline) ? shareProject.followTimeline : []
  const tagFields = Array.isArray(tag.fields) ? tag.fields : []
  const allowPhone = mode.key === 'outbound' || hasAnyField(tagFields, ['联系人电话'])
  const allowWechat = mode.key === 'outbound' || hasAnyField(tagFields, ['联系人微信'])
  const allowDescription = hasAnyField(tagFields, ['项目描述'])
  const allowClient = hasAnyField(tagFields, ['客户名称'])
  const allowStage = hasAnyField(tagFields, ['当前阶段'])
  const allowAmount = hasAnyField(tagFields, ['预计金额'])
  const allowContactName = allowPhone || allowWechat || hasAnyField(tagFields, ['联系人姓名'])
  const allowNextAction = hasAnyField(tagFields, ['下一步动作'])
  const allowSummary = hasAnyField(tagFields, ['跟进摘要'])
  const latestSummary = pickLatestSummary(followTimeline)

  return {
    mode,
    tag,
    project: {
      id: detail.id || '',
      name: hasAnyField(tagFields, ['项目名称']) ? (detail.name || '暂无可分享项目') : '项目信息已隐藏',
      client: allowClient ? (detail.client || '未填写客户') : '',
      stage: allowStage ? (detail.stage || '线索') : '',
      estimatedAmount: allowAmount ? (detail.estimatedAmount || '0') : '',
      description: allowDescription ? (detail.description || '暂无项目摘要') : '',
      nextFollowUp: allowNextAction ? (detail.nextFollowUp || '待设置') : '',
      summary: allowSummary ? latestSummary : ''
    },
    contacts: allowContactName
      ? contacts.map((contact) => ({
        id: contact.id,
        name: contact.name || '未填写姓名',
        role: contact.role || '未填写角色',
        company: contact.company || '',
        phone: allowPhone ? (contact.phone || '未填写电话') : '',
        wechat: allowWechat ? (contact.wechat || '未填写微信') : '',
        contactHint: allowPhone || allowWechat ? '联系方式可见' : '联系方式已隐藏'
      }))
      : [],
    contactPolicyText: allowPhone || allowWechat
      ? '当前视图展示完整联系人信息，对方可直接查看完整联系信息。'
      : '当前视图仅展示联系人姓名与角色，电话和微信已自动隐藏。',
    shareSourceText: mode.key === 'outbound'
      ? `分享来源：本人。当前为“${tag.name}”视图，对方接手后可直接进入自己的项目继续推进。`
      : `分享来源：本人。当前为“${tag.name}”视图。`,
    showClient: allowClient,
    showStage: allowStage,
    showEstimatedAmount: allowAmount,
    showDescription: allowDescription,
    showNextFollowUp: allowNextAction,
    showSummary: allowSummary && !!latestSummary
  }
}

module.exports = {
  getDefaultShareModes,
  getDefaultShareTags,
  getVisibleFields,
  getDefaultHistoryScope,
  normalizeHistoryScope,
  getHistoryScopeOptions,
  buildHistoryScopeMeta,
  filterTimelineForHistoryScope,
  resolveShareTags,
  getActiveMode,
  getActiveTag,
  buildSharePreview
}
