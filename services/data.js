const mock = require('../utils/mock')
const { callCloudFunction, clone, wait, getCloudStatus, canUseCloud } = require('./runtime')
const { getDefaultShareModes, getVisibleFields, resolveShareTags } = require('./share')

function getAppDataSource() {
  const app = getApp()
  if (app && app.globalData && app.globalData.dataSourceLabel) {
    return app.globalData.dataSourceLabel
  }

  return getCloudStatus().label
}

async function loadScope(scope) {
  try {
    const result = await callCloudFunction('getDemoData', { scope })
    if (result && result.data) {
      return {
        data: clone(result.data),
        source: 'CloudBase'
      }
    }
  } catch (error) {
    // Fallback to mock data when cloud functions or environment are not ready.
  }

  await wait(220)

  return {
    data: clone(mock[scope]),
    source: getAppDataSource()
  }
}

async function loadHomeData() {
  try {
    const result = await callCloudFunction('getDashboard')
    if (result && Array.isArray(result.metrics) && Array.isArray(result.todos) && Array.isArray(result.timeline)) {
      return {
        data: clone(result),
        source: 'CloudBase'
      }
    }
  } catch (error) {
    if (canUseCloud()) {
      throw error
    }
  }

  return loadScope('dashboard')
}

async function loadProjectsData() {
  try {
    const result = await callCloudFunction('listProjects')
    if (result && result.projects) {
      return {
        data: clone(result.projects),
        source: 'CloudBase'
      }
    }
  } catch (error) {
    if (canUseCloud()) {
      throw error
    }
  }

  await wait(180)

  return {
    data: clone(mock.projectCards),
    source: getAppDataSource()
  }
}

async function loadProjectDetailData(projectId) {
  if (projectId) {
    try {
      const result = await callCloudFunction('getProjectDetail', { projectId })
      if (result && result.projectDetail) {
        return {
          data: clone(result),
          source: 'CloudBase'
        }
      }
    } catch (error) {
      if (canUseCloud()) {
        throw error
      }
    }
  }

  await wait(180)

  return {
    data: {
      projectDetail: clone(mock.projectDetail),
      contacts: clone(mock.contacts),
      followTimeline: clone(mock.followTimeline)
    },
    source: getAppDataSource()
  }
}

async function loadProjectFormData(projectId) {
  if (!projectId) {
    return {
      data: {
        projectId: '',
        projectName: '',
        clientName: '',
        stage: '线索',
        estimatedAmount: '',
        expectedCommission: '',
        tagsText: '',
        description: '',
        contacts: [
          {
            name: '',
            role: '',
            phone: '',
            wechat: '',
            company: ''
          }
        ]
      },
      source: getAppDataSource()
    }
  }

  const detail = await loadProjectDetailData(projectId)

  return {
    data: {
      projectId: detail.data.projectDetail.id || '',
      projectName: detail.data.projectDetail.name || '',
      clientName: detail.data.projectDetail.client || '',
      stage: detail.data.projectDetail.stage || '线索',
      estimatedAmount: detail.data.projectDetail.estimatedAmountValue || '',
      expectedCommission: detail.data.projectDetail.expectedCommissionValue || '',
      tagsText: (detail.data.projectDetail.tags || []).join(' / '),
      description: detail.data.projectDetail.description || '',
      contacts: detail.data.contacts.length ? detail.data.contacts : [
        {
          name: '',
          role: '',
          phone: '',
          wechat: '',
          company: ''
        }
      ]
    },
    source: detail.source
  }
}

async function saveProjectData(payload) {
  return callCloudFunction('saveProject', payload)
}

async function createNotifyTaskData(payload) {
  return callCloudFunction('createNotifyTask', payload)
}

function normalizeText(value) {
  return String(value || '').trim()
}

const CLOUD_PROVIDER_LABEL = 'CloudBase AI'
const CLOUD_MODEL_NAME = 'hunyuan-exp / hunyuan-turbos-latest'

function buildAiSourceMeta(sourceType = 'model') {
  if (sourceType === 'fallback') {
    return {
      sourceType: 'fallback',
      sourceLabel: '基础建议',
      providerLabel: '本地规则引擎',
      modelName: '',
      canRegenerate: true
    }
  }

  return {
    sourceType: 'model',
    sourceLabel: '大模型建议',
    providerLabel: CLOUD_PROVIDER_LABEL,
    modelName: CLOUD_MODEL_NAME,
    canRegenerate: true
  }
}

function formatBizDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function reportSystemFailureData(payload = {}) {
  if (!canUseCloud()) {
    return {
      ok: false,
      skipped: true
    }
  }

  const type = normalizeText(payload.type) || 'save_failed'
  const scene = normalizeText(payload.scene) || 'general'
  const bizDate = formatBizDate()
  const projectId = normalizeText(payload.projectId)
  const projectName = normalizeText(payload.projectName)
  const title = normalizeText(payload.title) || '系统处理失败'
  const rawMessage = normalizeText(payload.message) || '请稍后重试'
  const summary = projectName
    ? `${projectName}：${rawMessage}`.slice(0, 120)
    : rawMessage.slice(0, 120)

  try {
    return await createNotifyTaskData({
      type,
      level: type === 'ai_failed' ? 'info' : 'high',
      title,
      summary,
      projectId,
      projectName,
      actionUrl: normalizeText(payload.actionUrl),
      actionLabel: normalizeText(payload.actionLabel) || '重新处理',
      bizDate,
      dedupeKey: normalizeText(payload.dedupeKey) || `${type}_${scene}_${projectId || 'global'}_${bizDate}`,
      extra: {
        scene,
        ...(payload.extra && typeof payload.extra === 'object' && !Array.isArray(payload.extra) ? payload.extra : {})
      }
    })
  } catch (error) {
    return {
      ok: false,
      skipped: true
    }
  }
}

async function requestFollowUpSummary(payload) {
  return callCloudFunction('summarizeFollowUp', payload)
}

function buildLocalNextSuggestion(payload = {}, detail = {}) {
  const stage = normalizeText(detail.projectDetail && detail.projectDetail.stage) || '线索'
  const projectName = normalizeText(detail.projectDetail && detail.projectDetail.name) || '当前项目'
  const summary = normalizeText(payload.currentSummary) || '刚完成一条跟进'
  const contacts = Array.isArray(detail.contacts) ? detail.contacts : []
  const preferredContact = contacts[0]
  const recommendedTarget = preferredContact
    ? `${preferredContact.name}${preferredContact.role ? `（${preferredContact.role}）` : ''}`
    : '当前主要对接人'
  const nextDate = new Date()
  nextDate.setDate(nextDate.getDate() + 1)
  nextDate.setHours(10, 0, 0, 0)
  const dueDate = formatBizDate(nextDate)
  const dueTime = `${`${nextDate.getHours()}`.padStart(2, '0')}:${`${nextDate.getMinutes()}`.padStart(2, '0')}`

  const stageActionMap = {
    线索: {
      nextAction: '先确认客户真实需求和关键决策链路',
      method: '电话',
      talkTrack: `想和您先对齐一下 ${projectName} 这次推进里最关键的需求优先级和决策参与人，确保下一步方案准备不跑偏。`,
      taskTitle: '确认需求优先级和决策链路',
      type: 'collect_info'
    },
    洽谈: {
      nextAction: '补齐关键需求边界，并约定下一次深聊时间',
      method: '微信',
      talkTrack: `这边先把本次沟通里还没完全确认的需求边界整理一下，也想和您约一个更完整的时间，把关键点一次对齐。`,
      taskTitle: '补齐需求边界并确认下次沟通',
      type: 'callback'
    },
    方案: {
      nextAction: '围绕方案反馈做一次重点回访，确认是否进入商务准备',
      method: '电话',
      talkTrack: `想基于您这边对方案的反馈做一次快速确认，重点看看还缺哪些材料，以及是否可以开始准备商务沟通。`,
      taskTitle: '回访方案反馈并判断是否进商务',
      type: 'callback'
    },
    商务: {
      nextAction: '优先确认预算拍板人与商务条款推进节奏',
      method: '电话',
      talkTrack: `这次想先和您把两个关键点对齐：预算最终拍板人是谁，以及商务条款确认后是否需要同步法务，这样我们能把后续版本提前准备好。`,
      taskTitle: '确认预算拍板人与商务条款节奏',
      type: 'callback'
    }
  }

  const stageAction = stageActionMap[stage] || {
    nextAction: '围绕当前进展安排下一步推进动作',
    method: '电话',
    talkTrack: `基于这次记录的最新进展，建议尽快做一次关键人确认，避免 ${projectName} 的推进节奏中断。`,
    taskTitle: '安排下一步推进动作',
    type: 'other'
  }

  return {
    ok: true,
    ...buildAiSourceMeta('fallback'),
    nextAction: stageAction.nextAction,
    recommendedTarget,
    recommendedMethod: stageAction.method,
    recommendedTimeWindow: '24-48 小时内',
    recommendedDate: dueDate,
    recommendedTime: dueTime,
    talkTrack: stageAction.talkTrack,
    reason: `当前项目处于${stage}阶段，本次摘要显示“${summary.slice(0, 36)}”，建议尽快把下一步动作收成明确任务。`,
    missingInfo: preferredContact ? [] : ['当前未录入主要联系人'],
    taskDrafts: [
      {
        title: stageAction.taskTitle,
        type: stageAction.type,
        dueDate,
        dueTime,
        description: `${stageAction.nextAction}，避免项目节奏中断。`
      }
    ]
  }
}

function canFallbackNextSuggestion(error) {
  const message = normalizeText(error && error.message)
  if (!message) {
    return false
  }

  return /超时|timeout|timed out|网络|network|fetch|socket|abort/i.test(message)
}

async function requestNextFollowUpSuggestion(payload) {
  try {
    return await callCloudFunction('suggestNextFollowUp', payload)
  } catch (error) {
    if (canUseCloud() && !canFallbackNextSuggestion(error)) {
      throw error
    }
  }

  const detail = payload && payload.projectId
    ? await loadProjectDetailData(payload.projectId)
    : { data: { projectDetail: clone(mock.projectDetail), contacts: clone(mock.contacts) } }
  const localResult = buildLocalNextSuggestion(payload, detail.data || detail)

  return {
    ...localResult,
    fallback: true,
    source: 'local_fallback'
  }
}

async function saveFollowUpData(payload) {
  return callCloudFunction('saveFollowUp', payload)
}

async function updateTaskStatusData(payload) {
  return callCloudFunction('updateTaskStatus', payload)
}

async function loadShareConfigData(projectId = '') {
  const settings = await loadShareSettingsData()
  let shareProject = {
    projectDetail: {
      id: '',
      name: '暂无可分享项目',
      client: '未填写客户',
      stage: '线索',
      estimatedAmount: '0',
      nextFollowUp: '未设置',
      description: '请先创建一个项目，再使用分享功能。'
    },
    contacts: [],
    followTimeline: []
  }
  let source = getAppDataSource()

  try {
    let targetProjectId = projectId

    if (!targetProjectId) {
      const projectsResult = await loadProjectsData()
      source = projectsResult.source
      targetProjectId = projectsResult.data.length ? projectsResult.data[0].id : ''
    }

    if (targetProjectId) {
      const detailResult = await loadProjectDetailData(targetProjectId)
      shareProject = detailResult.data
      source = detailResult.source
    }
  } catch (error) {
    if (canUseCloud()) {
      throw error
    }
  }

  return {
    data: {
      shareModes: getDefaultShareModes(),
      shareTags: settings.data.shareTags,
      shareProject
    },
    source: settings.source || source
  }
}

async function loadOutboundData() {
  try {
    const result = await callCloudFunction('listShareRecords')
    if (result && Array.isArray(result.records)) {
      return {
        data: clone(result.records),
        source: 'CloudBase'
      }
    }
  } catch (error) {
    if (canUseCloud()) {
      throw error
    }
  }

  await wait(180)

  return {
    data: clone(mock.outboundProjects),
    source: getAppDataSource()
  }
}

async function loadEarningsData() {
  try {
    const result = await callCloudFunction('getEarnings')
    if (result && Array.isArray(result.summary) && Array.isArray(result.deals)) {
      return {
        data: clone(result),
        source: 'CloudBase'
      }
    }
  } catch (error) {
    if (canUseCloud()) {
      throw error
    }
  }

  return loadScope('earnings')
}

async function loadDealFormData(projectId) {
  return callCloudFunction('getDealForm', { projectId })
}

async function loadPrivacyTagsData() {
  return loadShareSettingsData()
}

async function loadShareSettingsData() {
  try {
    const result = await callCloudFunction('getShareSettings')
    if (result && Array.isArray(result.shareTags)) {
      return {
        data: {
          shareTags: clone(result.shareTags),
          visibleFields: clone(result.visibleFields || getVisibleFields())
        },
        source: 'CloudBase'
      }
    }
  } catch (error) {
    if (canUseCloud()) {
      throw error
    }
  }

  await wait(180)

  return {
    data: {
      shareTags: resolveShareTags(mock.privacyTags),
      visibleFields: getVisibleFields()
    },
    source: getAppDataSource()
  }
}

async function loadTagEditorData(tagId = '') {
  const settings = await loadShareSettingsData()
  const tags = settings.data.shareTags
  const tag = tags.find((item) => item.id === tagId) || {
    id: '',
    name: '',
    desc: '',
    fields: []
  }

  return {
    data: {
      tag,
      visibleFields: settings.data.visibleFields
    },
    source: settings.source
  }
}

async function saveShareTagData(payload) {
  return callCloudFunction('saveShareTag', payload)
}

async function createShareRecordData(payload) {
  const result = await callCloudFunction('createShareRecord', payload)
  if (result && result.ok === false) {
    throw new Error(result.message || '暂时无法创建分享')
  }

  return result
}

function buildLocalShareBrief(payload = {}, config = {}) {
  const project = config.shareProject && config.shareProject.projectDetail ? config.shareProject.projectDetail : {}
  const mode = normalizeText(payload.shareMode) || 'info'
  const tag = Array.isArray(config.shareTags)
    ? config.shareTags.find((item) => item.id === payload.shareTagId) || config.shareTags[0] || {}
    : {}
  const stage = normalizeText(project.stage) || '线索'
  const description = normalizeText(project.description)
  const nextFollowUp = normalizeText(project.nextFollowUp)
  const latestSummary = normalizeText(project.summary)
  const titleSuffix = mode === 'outbound' ? '项目研判' : '项目摘要'
  const overviewLines = [
    `项目当前处于${stage}阶段。`,
    latestSummary || description || '当前资料以项目基础信息为主。',
    mode === 'outbound'
      ? '当前输出重点放在项目现状和交接前的推进脉络。'
      : (tag && tag.name ? `当前解读基于“${normalizeText(tag.name)}”范围内资料。` : '')
  ].filter(Boolean).slice(0, 4)
  const timelineInsight = nextFollowUp
    ? `最近推进已形成“${nextFollowUp}”这一时间节点，可据此理解当前项目节奏。`
    : (latestSummary || description || '当前缺少清晰的时间线锚点，项目判断主要基于已有资料。')
  const summaryText = [
    latestSummary || description || `项目当前处于${stage}阶段。`,
    timelineInsight,
    mode === 'outbound'
      ? '当前核心关注点是交接前的信息完整度、阶段判断是否一致以及接手后的推进起点。'
      : '当前核心关注点是项目阶段判断、最近推进脉络是否清晰以及后续判断依据是否充分。'
  ].filter(Boolean).join('')

  if (mode === 'outbound') {
    return {
      ok: true,
      ...buildAiSourceMeta('fallback'),
      title: `${normalizeText(project.name) || '当前项目'}${titleSuffix}`,
      summaryText,
      overviewLines,
      timelineInsight,
      briefLines: [summaryText],
      shareGoal: summaryText,
      cta: '',
      tone: 'outbound_handover'
    }
  }

  return {
    ok: true,
    ...buildAiSourceMeta('fallback'),
    title: `${normalizeText(project.name) || '当前项目'}${titleSuffix}`,
    summaryText,
    overviewLines,
    timelineInsight,
    briefLines: [summaryText],
    shareGoal: summaryText,
    cta: '',
    tone: 'info_brief'
  }
}

async function requestShareBrief(payload) {
  try {
    return await callCloudFunction('generateShareBrief', payload)
  } catch (error) {
    if (canUseCloud()) {
      throw error
    }
  }

  const config = await loadShareConfigData(payload && payload.projectId ? payload.projectId : '')
  return buildLocalShareBrief(payload, config.data || {})
}

async function openSharedProjectData(payload) {
  return callCloudFunction('openSharedProject', payload)
}

async function saveDealData(payload) {
  return callCloudFunction('saveDeal', payload)
}

async function loadNotificationsData(payload = {}) {
  return callCloudFunction('listNotifications', payload)
}

async function markNotificationReadData(payload) {
  return callCloudFunction('markNotificationRead', payload)
}

async function resolveNotificationData(payload) {
  return callCloudFunction('resolveNotification', payload)
}

async function loadUserPreferencesData() {
  return callCloudFunction('getUserPreferences')
}

async function saveUserPreferencesData(payload) {
  return callCloudFunction('saveUserPreferences', payload)
}

module.exports = {
  loadHomeData,
  loadProjectsData,
  loadProjectDetailData,
  loadProjectFormData,
  saveProjectData,
  createNotifyTaskData,
  reportSystemFailureData,
  requestFollowUpSummary,
  requestNextFollowUpSuggestion,
  saveFollowUpData,
  updateTaskStatusData,
  loadShareConfigData,
  loadOutboundData,
  loadEarningsData,
  loadDealFormData,
  loadPrivacyTagsData,
  loadTagEditorData,
  loadShareSettingsData,
  saveShareTagData,
  createShareRecordData,
  requestShareBrief,
  openSharedProjectData,
  saveDealData,
  loadNotificationsData,
  markNotificationReadData,
  resolveNotificationData,
  loadUserPreferencesData,
  saveUserPreferencesData
}
