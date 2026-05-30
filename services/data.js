const mock = require('../utils/mock')
const { callCloudFunction, clone, wait, getCloudStatus, canUseCloud } = require('./runtime')
const { getDefaultShareModes, getVisibleFields, resolveShareTags } = require('./share')
const { getDefaultBillingCatalogData, normalizeBillingCatalogPayload } = require('../utils/billing')

function getDefaultAccountSummary() {
  return {
    accountId: '',
    status: 'trialing',
    phone: '',
    phoneVerified: false,
    phoneMasked: '',
    wechatNickname: '',
    customDisplayName: '',
    displayName: '',
    displayNameSource: '',
    trialEndsAt: '',
    currentAccessLevel: 'trial_full',
    source: getAppDataSource(),
    isMock: !canUseCloud()
  }
}

function getDefaultEntitlements() {
  return {
    accountId: '',
    status: 'trialing',
    currentAccessLevel: 'trial_full',
    aiQuotaPolicy: 'local_quota',
    bindRequiredForWrite: false,
    phoneVerified: false,
    canCreateProject: true,
    canEditProject: true,
    canSaveFollowUp: true,
    canCreateTask: true,
    canUseQuickEntry: true,
    canUseSpeechToText: true,
    canUseAi: true,
    canShareOut: true,
    projectLimit: 3,
    currentProjectCount: 0,
    voiceSecondsTotal: 600,
    voiceSecondsUsed: 0,
    voiceSecondsRemaining: 600,
    aiTokensTotal: 50000,
    aiTokensUsed: 0,
    aiTokensRemaining: 50000,
    effectiveFrom: '',
    effectiveTo: '',
    reasonSummary: '',
    source: getAppDataSource(),
    isMock: !canUseCloud()
  }
}

let cachedAccountSummary = getDefaultAccountSummary()
let cachedEntitlements = getDefaultEntitlements()
let cachedMockBillingOrders = []
let cachedMockBillingPaymentTransactions = []

function getAppDataSource() {
  const app = getApp()
  if (app && app.globalData && app.globalData.dataSourceLabel) {
    return app.globalData.dataSourceLabel
  }

  return getCloudStatus().label
}

function cacheAccountSummary(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  cachedAccountSummary = {
    ...getDefaultAccountSummary(),
    ...clone(source)
  }
  return clone(cachedAccountSummary)
}

function cacheEntitlementsSummary(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  cachedEntitlements = {
    ...getDefaultEntitlements(),
    ...clone(source)
  }
  return clone(cachedEntitlements)
}

function getCachedAccountSummary() {
  return clone(cachedAccountSummary)
}

function getCachedEntitlements() {
  return clone(cachedEntitlements)
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

async function loadProjectsData(options = {}) {
  try {
    const result = await callCloudFunction('listProjects', options)
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

async function loadTasksData(options = {}) {
  try {
    const result = await callCloudFunction('listTasks', options)
    if (result && Array.isArray(result.tasks) && result.summary) {
      return {
        data: clone(result),
        source: 'CloudBase'
      }
    }
  } catch (error) {
    if (canUseCloud()) {
      if (error && error.code === 'FUNCTION_NOT_FOUND') {
        error.message = '任务中心云函数 listTasks 未部署，请先上传并部署 listTasks 后重试'
      }
      throw error
    }
  }

  await wait(180)

  return {
    data: {
      ok: true,
      summary: {
        totalCount: 0,
        openCount: 0,
        overdueCount: 0,
        todayCount: 0,
        doneCount: 0,
        canceledCount: 0
      },
      tasks: []
    },
    source: getAppDataSource()
  }
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

  const shortMatch = text.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/)
  if (shortMatch) {
    const now = new Date()
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

function buildMockContactsList() {
  const detailContacts = Array.isArray(mock.contacts) ? mock.contacts : []
  const detailContactMap = detailContacts.reduce((result, item) => {
    const key = normalizeText(item && item.name)
    if (key) {
      result[key] = item
    }
    return result
  }, {})

  const contactMap = {}
  ;(Array.isArray(mock.projectCards) ? mock.projectCards : []).forEach((project) => {
    const latestTouch = parseDateTime(project.updatedAtRaw || project.nextFollowUpAt || '')
    const projectCard = {
      id: normalizeText(project.id),
      name: normalizeText(project.name) || '未命名项目',
      client: normalizeText(project.client) || '未填写客户',
      stage: normalizeText(project.stage) || '线索',
      latestSummary: normalizeText(project.latestSummary) || '当前还没有沟通摘要',
      latestTouchText: normalizeText(project.latest) || '最近',
      latestTouchRaw: latestTouch ? latestTouch.toISOString() : '',
      ownerLabel: normalizeText(project.ownerLabel) || '我负责推进',
      ownerType: normalizeText(project.ownerType) || 'owned'
    }

    ;(Array.isArray(project.contactNames) ? project.contactNames : []).forEach((name) => {
      const contactName = normalizeText(name)
      if (!contactName) {
        return
      }

      if (!contactMap[contactName]) {
        const detail = detailContactMap[contactName] || {}
        contactMap[contactName] = {
          id: `mock-contact-${contactName}`,
          name: contactName,
          company: normalizeText(detail.company || project.client),
          roleSummary: normalizeText(detail.role) || '未标注角色',
          phone: normalizeText(detail.phone),
          phoneMasked: normalizeText(detail.phone),
          wechat: normalizeText(detail.wechat),
          wechatMasked: normalizeText(detail.wechat),
          hasPhone: Boolean(normalizeText(detail.phone)),
          hasWechat: Boolean(normalizeText(detail.wechat)),
          relationTags: /决策|董事长|总经理|老板/i.test(normalizeText(detail.role)) ? ['关键人'] : [],
          isKeyContact: /决策|董事长|总经理|老板/i.test(normalizeText(detail.role)),
          stageTags: [],
          projectNames: [],
          projectCards: [],
          latestSummary: '',
          latestFollowUpText: '',
          latestFollowUpTimeRaw: '',
          latestProjectId: '',
          latestProjectName: '',
          latestOwnerLabel: ''
        }
      }

      const target = contactMap[contactName]
      if (projectCard.stage && target.stageTags.indexOf(projectCard.stage) === -1) {
        target.stageTags.push(projectCard.stage)
      }
      if (target.projectNames.indexOf(projectCard.name) === -1) {
        target.projectNames.push(projectCard.name)
      }
      if (!target.projectCards.some((item) => item.id === projectCard.id)) {
        target.projectCards.push(projectCard)
      }

      const currentLatest = parseDateTime(target.latestFollowUpTimeRaw)
      if (!currentLatest || (latestTouch && latestTouch.getTime() >= currentLatest.getTime())) {
        target.latestSummary = projectCard.latestSummary
        target.latestFollowUpText = projectCard.latestTouchText
        target.latestFollowUpTimeRaw = projectCard.latestTouchRaw
        target.latestProjectId = projectCard.id
        target.latestProjectName = projectCard.name
        target.latestOwnerLabel = projectCard.ownerLabel
      }
    })
  })

  return Object.keys(contactMap)
    .map((key) => ({
      ...contactMap[key],
      projectCount: contactMap[key].projectCards.length,
      stageTags: contactMap[key].stageTags.slice(0, 4),
      projectCards: contactMap[key].projectCards.slice().sort((left, right) => {
        return new Date(right.latestTouchRaw || 0).getTime() - new Date(left.latestTouchRaw || 0).getTime()
      })
    }))
    .sort((left, right) => {
      const leftTime = parseDateTime(left.latestFollowUpTimeRaw)
      const rightTime = parseDateTime(right.latestFollowUpTimeRaw)
      return (rightTime ? rightTime.getTime() : 0) - (leftTime ? leftTime.getTime() : 0)
    })
}

async function loadContactsData() {
  try {
    const result = await callCloudFunction('listContacts')
    if (result && Array.isArray(result.contacts)) {
      return {
        data: clone(result.contacts),
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
    data: buildMockContactsList(),
    source: getAppDataSource()
  }
}

async function loadContactDetailData(contactId) {
  const result = await loadContactsData()
  const contacts = Array.isArray(result.data) ? result.data : []
  const target = contacts.find((item) => String(item && item.id ? item.id : '') === String(contactId || ''))

  if (!target) {
    throw new Error('contact not found')
  }

  return {
    data: clone(target),
    source: result.source
  }
}

async function loadProjectDetailData(projectId, options = {}) {
  if (projectId) {
    try {
      const result = await callCloudFunction('getProjectDetail', {
        projectId,
        viewMode: options.viewMode || options.view || ''
      })
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
        voiceAliasesText: '',
        stage: '线索',
        estimatedAmount: '',
        expectedCommission: '',
        followUpSilenceDays: 0,
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
      voiceAliasesText: (detail.data.projectDetail.voiceAliases || []).join(' / '),
      stage: detail.data.projectDetail.stage || '线索',
      estimatedAmount: detail.data.projectDetail.estimatedAmountValue || '',
      expectedCommission: detail.data.projectDetail.expectedCommissionValue || '',
      followUpSilenceDays: Number(detail.data.projectDetail.followUpSilenceDays || 0),
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

async function flowProjectData(payload) {
  const result = await callCloudFunction('flowProject', payload)
  if (result && result.ok === false) {
    throw new Error(result.message || '项目流转失败')
  }

  return result
}

async function createNotifyTaskData(payload) {
  return callCloudFunction('createNotifyTask', payload)
}

function normalizeText(value) {
  return String(value || '').trim()
}

function createRequestId(prefix = 'req') {
  return `${normalizeText(prefix) || 'req'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const CLOUD_PROVIDER_LABEL = 'CloudBase AI'
const CLOUD_MODEL_NAME = 'hunyuan-exp / hunyuan-turbos-latest'

function buildAiSourceMeta(sourceType = 'model') {
  if (sourceType === 'fallback') {
    return {
      sourceType: 'fallback',
      sourceLabel: '系统基础建议',
      providerLabel: '',
      modelName: '',
      canRegenerate: true
    }
  }

  return {
    sourceType: 'model',
    sourceLabel: '云端模型',
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
  const nextPayload = payload && typeof payload === 'object' ? { ...payload } : {}
  if (!normalizeText(nextPayload.requestId)) {
    nextPayload.requestId = createRequestId('summary')
  }
  return callCloudFunction('summarizeFollowUp', nextPayload)
}

async function requestSpeechToTextData(payload) {
  const nextPayload = payload && typeof payload === 'object' ? { ...payload } : {}
  if (!normalizeText(nextPayload.requestId)) {
    nextPayload.requestId = createRequestId('speech')
  }
  return callCloudFunction('speechToText', nextPayload)
}

function buildLocalQuickEntryProjectResolution(payload = {}) {
  const candidates = Array.isArray(payload.candidates)
    ? payload.candidates
      .map((item) => ({
        id: normalizeText(item && item.id),
        localScore: Number(item && item.localScore) || 0
      }))
      .filter((item) => item.id)
      .sort((left, right) => right.localScore - left.localScore)
    : []
  const candidateIds = candidates.slice(0, 5).map((item) => item.id)
  const topCandidate = candidates[0] || null
  const secondCandidate = candidates[1] || null
  const topScore = Number(topCandidate && topCandidate.localScore || 0)
  const secondScore = Number(secondCandidate && secondCandidate.localScore || 0)

  let matchedProjectId = ''
  let confidence = 'low'
  let reason = '当前内容里的客户或项目线索还不够明确，请手动确认关联项目。'

  if (topCandidate && topScore >= 16 && (!secondCandidate || topScore - secondScore >= 6)) {
    matchedProjectId = topCandidate.id
    confidence = 'high'
    reason = '已匹配到更接近的项目，可直接确认。'
  } else if (topCandidate && topScore >= 10) {
    confidence = 'medium'
    reason = '已找到较接近的项目，请确认后保存。'
  }

  return {
    ok: true,
    fallback: true,
    source: 'local_fallback',
    sourceType: 'fallback',
    sourceLabel: '本地候选排序',
    providerLabel: '',
    modelName: '',
    canRegenerate: true,
    generatedAt: new Date().toISOString(),
    matchedProjectId,
    confidence,
    reason,
    candidateIds
  }
}

function getLatestTimelineEntry(groups) {
  const timelineGroups = Array.isArray(groups) ? groups : []
  for (let index = 0; index < timelineGroups.length; index += 1) {
    const items = Array.isArray(timelineGroups[index].items) ? timelineGroups[index].items : []
    if (items.length) {
      return items[0]
    }
  }

  return null
}

function flattenTimelineEntries(groups) {
  return (Array.isArray(groups) ? groups : []).reduce((result, group) => {
    const items = Array.isArray(group && group.items) ? group.items : []
    return result.concat(items)
  }, [])
}

function buildLocalProjectJudgement(payload = {}, detail = {}) {
  const projectDetail = detail.projectDetail || {}
  const stage = normalizeText(projectDetail.stage) || '线索'
  const projectName = normalizeText(projectDetail.name) || '当前项目'
  const description = normalizeText(projectDetail.description)
  const contacts = Array.isArray(detail.contacts) ? detail.contacts : []
  const tasks = Array.isArray(detail.tasks) ? detail.tasks : []
  const followTimeline = Array.isArray(detail.followTimeline) ? detail.followTimeline : []
  const latestTimeline = getLatestTimelineEntry(followTimeline)
  const latestSummary = normalizeText(latestTimeline && (latestTimeline.summary || latestTimeline.desc || latestTimeline.title))
  const openTasks = tasks.filter((item) => item && (item.status === 'pending' || item.status === 'in_progress'))
  const overdueTasks = openTasks.filter((item) => item && item.isOverdue)
  const keyBlockers = []
  const positiveSignals = []

  if (latestSummary) {
    positiveSignals.push('最近已有明确跟进记录')
  }
  if (contacts.length) {
    positiveSignals.push(`已建立 ${contacts.length} 位联系人`)
  }
  if (openTasks.length) {
    positiveSignals.push(`当前保留 ${openTasks.length} 条推进动作`)
  }
  if (stage === '方案' || stage === '商务') {
    positiveSignals.push(`项目已进入${stage}阶段`)
  }

  if (!contacts.length) {
    keyBlockers.push('当前还没有关键联系人信息')
  }
  if (!latestSummary) {
    keyBlockers.push('最近缺少可用于判断的有效跟进记录')
  }
  if (!openTasks.length) {
    keyBlockers.push('当前没有明确的下一步推进动作')
  }
  if (overdueTasks.length) {
    keyBlockers.push(`有 ${overdueTasks.length} 条推进动作已逾期`)
  }

  const summary = [
    `${projectName}当前处于${stage}阶段。`,
    latestSummary
      ? `最近推进显示：${latestSummary}`
      : (description ? `当前项目背景为：${description}` : '当前还缺少清晰的最近推进记录。'),
    openTasks.length
      ? `目前还有${openTasks.length}条未完成动作待推进。`
      : '目前还没有收成明确的下一步动作。'
  ].filter(Boolean).join('')

  let statusJudgement = '当前判断依据还不够扎实，建议先把关键推进信息补完整。'
  if (stage === '商务') {
    statusJudgement = overdueTasks.length
      ? '项目已进入商务推进，但关键商务动作存在延迟，当前节奏偏松。'
      : '项目已进入商务推进，当前重点是尽快压实拍板动作与商务节奏。'
  } else if (stage === '方案') {
    statusJudgement = openTasks.length
      ? '项目已有方案推进基础，关键在于尽快把方案反馈推进到商务判断。'
      : '项目已到方案阶段，但缺少明确动作承接，容易停留在讨论层。'
  } else if (latestSummary && openTasks.length) {
    statusJudgement = '项目已有连续推进迹象，当前关键是把下一步动作做实并按时回填。'
  }

  let priorityAction = '先把下一步动作收成一条明确任务，并补上截止时间。'
  if (overdueTasks.length) {
    priorityAction = `优先处理逾期动作“${normalizeText(overdueTasks[0].title) || '当前任务'}”，避免推进节奏继续失真。`
  } else if (!contacts.length) {
    priorityAction = '先补一个可直接推进的关键联系人，至少明确一位能持续沟通的人。'
  } else if (openTasks.length) {
    priorityAction = `最值得先推进的是“${normalizeText(openTasks[0].title) || '当前动作'}”，完成后立即补下一步动作。`
  } else if (latestSummary) {
    priorityAction = '围绕最近一次跟进内容，尽快确认下一次沟通对象、方式和截止时间。'
  }

  return {
    ok: true,
    sourceType: 'fallback',
    sourceLabel: '系统基础建议',
    providerLabel: '',
    modelName: '',
    canRegenerate: true,
    summary,
    statusJudgement,
    keyBlockers: keyBlockers.slice(0, 3),
    positiveSignals: positiveSignals.slice(0, 3),
    priorityAction
  }
}

function buildLocalProjectReview(payload = {}, detail = {}) {
  const projectDetail = detail.projectDetail || {}
  const stage = normalizeText(projectDetail.stage)
  const projectName = normalizeText(projectDetail.name) || '当前项目'
  const description = normalizeText(projectDetail.description)
  const contacts = Array.isArray(detail.contacts) ? detail.contacts : []
  const tasks = Array.isArray(detail.tasks) ? detail.tasks : []
  const followTimeline = Array.isArray(detail.followTimeline) ? detail.followTimeline : []
  const timelineEntries = flattenTimelineEntries(followTimeline)
  const latestTimeline = timelineEntries[0] || null
  const completedTasks = tasks.filter((item) => item && item.status === 'done')
  const overdueTasks = tasks.filter((item) => item && item.isOverdue)
  const turningPoints = []
  const effectiveActions = []
  const reusableLessons = []
  const slowdownPoints = []
  const lossReasons = []

  if (latestTimeline && latestTimeline.summary) {
    turningPoints.push(`最近阶段性结论是“${normalizeText(latestTimeline.summary)}”`)
  }
  if (completedTasks.length) {
    turningPoints.push(`项目过程中累计完成 ${completedTasks.length} 条推进动作`)
  }
  if (contacts.length) {
    turningPoints.push(`至少建立了 ${contacts.length} 位联系人支点`)
  }

  completedTasks.slice(0, 3).forEach((item) => {
    const title = normalizeText(item.title)
    if (title) {
      effectiveActions.push(title)
    }
  })

  if (!effectiveActions.length && latestTimeline && latestTimeline.highlights && latestTimeline.highlights.length) {
    latestTimeline.highlights.slice(0, 3).forEach((item) => {
      const text = normalizeText(item)
      if (text) {
        effectiveActions.push(text)
      }
    })
  }

  if (stage === '成交') {
    reusableLessons.push('当前记录不足以提炼稳定方法，成交更可能来自价格、品牌或客户窗口期等因素')
    if (contacts.length) {
      reusableLessons.push('后续同类项目应优先确认关键联系人是否真实推动决策')
    }
    if (completedTasks.length) {
      reusableLessons.push('已完成动作较多的项目，要重点复查哪一步真正改变了客户决策')
    }

    const reviewOverview = [
      `${projectName}当前已成交。`,
      description ? `项目背景为：${description}` : '',
      latestTimeline && latestTimeline.summary
        ? `从最近结果看，最终成交前的关键结论是：${normalizeText(latestTimeline.summary)}`
        : '',
      completedTasks.length
        ? `过程中共完成 ${completedTasks.length} 条推进动作，说明项目是被持续压着往前走的。`
        : '项目已成交，但当前沉淀的动作记录还不够完整。'
    ].filter(Boolean).join('')

    return {
      ok: true,
      sourceType: 'fallback',
      sourceLabel: '系统基础建议',
      providerLabel: '',
      modelName: '',
      canRegenerate: true,
      stage,
      reviewOverview,
      turningPoints: turningPoints.slice(0, 3),
      effectiveActions: effectiveActions.slice(0, 3),
      reusableLessons: reusableLessons.slice(0, 3),
      slowdownPoints: [],
      lossReasons: [],
      reactivationAdvice: ''
    }
  }

  if (overdueTasks.length) {
    slowdownPoints.push(`存在 ${overdueTasks.length} 条逾期动作，推进节奏曾明显放缓`)
  }
  if (latestTimeline && latestTimeline.risks && latestTimeline.risks.length) {
    latestTimeline.risks.slice(0, 3).forEach((item) => {
      const text = normalizeText(item)
      if (text) {
        slowdownPoints.push(text)
      }
    })
  }
  if (!contacts.length) {
    slowdownPoints.push('项目过程中缺少稳定可持续推进的关键联系人')
  }

  if (latestTimeline && latestTimeline.risks && latestTimeline.risks.length) {
    latestTimeline.risks.slice(0, 3).forEach((item) => {
      const text = normalizeText(item)
      if (text) {
        lossReasons.push(text)
      }
    })
  }
  if (!lossReasons.length && !completedTasks.length) {
    lossReasons.push('记录中缺少有效推进动作，无法看到客户决策被推动的证据')
  }
  if (!lossReasons.length && !contacts.length) {
    lossReasons.push('联系人基础薄弱，缺少能影响结果的明确推动人')
  }

  const reactivationAdvice = lossReasons.length || overdueTasks.length
    ? '后续同类项目要更早确认预算、关键人和时间窗口；二次激活只建议在出现新预算、新联系人或新窗口期后再做。'
    : '当前记录不足以提炼稳定经验。'

  const reviewOverview = [
    `${projectName}当前已流失。`,
    description ? `项目背景为：${description}` : '',
    latestTimeline && latestTimeline.summary
      ? `从最近记录看，流失前最后一个明确判断是：${normalizeText(latestTimeline.summary)}`
      : '',
    overdueTasks.length
      ? `项目后段出现动作延迟，说明推进节奏可能在关键窗口期已经松掉。`
      : '当前记录显示，流失原因还需要结合关键节点再补判断。'
  ].filter(Boolean).join('')

  return {
    ok: true,
    sourceType: 'fallback',
    sourceLabel: '系统基础建议',
    providerLabel: '',
    modelName: '',
    canRegenerate: true,
    stage,
    reviewOverview,
    turningPoints: turningPoints.slice(0, 3),
    effectiveActions: [],
    reusableLessons: [],
    slowdownPoints: slowdownPoints.slice(0, 3),
    lossReasons: lossReasons.slice(0, 3),
    reactivationAdvice
  }
}

function buildLocalDormantWake(payload = {}, detail = {}) {
  const projectDetail = detail.projectDetail || {}
  const stage = normalizeText(projectDetail.stage) || '线索'
  const projectName = normalizeText(projectDetail.name) || '当前项目'
  const description = normalizeText(projectDetail.description)
  const contacts = Array.isArray(detail.contacts) ? detail.contacts : []
  const tasks = Array.isArray(detail.tasks) ? detail.tasks : []
  const followTimeline = Array.isArray(detail.followTimeline) ? detail.followTimeline : []
  const latestTimeline = getLatestTimelineEntry(followTimeline)
  const latestSummary = normalizeText(latestTimeline && (latestTimeline.summary || latestTimeline.desc || latestTimeline.title))
  const openTasks = tasks.filter((item) => item && (item.status === 'pending' || item.status === 'in_progress'))
  const topTask = openTasks[0] || null
  const topContact = contacts[0] || null

  let wakeSummary = `${projectName}当前处于${stage}阶段，最近推进沉淀偏少，值得用一次低成本触达重新试探窗口。`
  if (latestSummary) {
    wakeSummary = `${projectName}当前处于${stage}阶段，最近明确推进停留在“${latestSummary}”，可以先做一次轻量唤醒判断是否还有窗口。`
  } else if (description) {
    wakeSummary = `${projectName}当前处于${stage}阶段，现有记录主要停留在项目背景层，适合先做一次轻量确认判断是否继续推进。`
  }

  let suggestedAction = '先发一条轻量消息确认项目当前是否仍在推进，再决定是否继续投入。'
  if (topTask && normalizeText(topTask.title)) {
    suggestedAction = `优先把当前动作“${normalizeText(topTask.title)}”重新拉起来，并顺手确认对方本周是否还有推进窗口。`
  } else if (stage === '方案') {
    suggestedAction = '先确认客户是否还在看方案或内部评审，再决定是否补充材料。'
  } else if (stage === '商务') {
    suggestedAction = '先确认预算和商务判断是否还有效，再决定是否继续往报价或合同推进。'
  }

  let suggestedContact = topContact && normalizeText(topContact.name)
    ? `建议先从${normalizeText(topContact.name)}${normalizeText(topContact.role) ? `（${normalizeText(topContact.role)}）` : ''}切入，确认当前真实状态。`
    : '建议先找当前主要对接人或能确认预算、决策进度的人，先拿到最新口径。'
  if (!topContact && stage === '方案') {
    suggestedContact = '建议优先联系正在看方案或负责内部评审的人，确认方案是否还在被继续推进。'
  } else if (!topContact && stage === '商务') {
    suggestedContact = '建议优先联系能确认预算、采购或商务条款的人，判断项目是否还值得继续压。'
  }

  return {
    ok: true,
    sourceType: 'fallback',
    sourceLabel: '系统基础建议',
    providerLabel: '',
    modelName: '',
    canRegenerate: true,
    wakeSummary,
    suggestedAction,
    suggestedContact,
    dormantDays: Number(payload.dormantDays || 0),
    lastActiveText: normalizeText(payload.lastActiveText)
  }
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

async function requestProjectJudgementData(payload = {}) {
  try {
    return await callCloudFunction('judgeProject', payload)
  } catch (error) {
    if (canUseCloud() && !canFallbackNextSuggestion(error)) {
      throw error
    }
  }

  const detail = payload && payload.projectId
    ? await loadProjectDetailData(payload.projectId)
    : {
        data: {
          projectDetail: clone(mock.projectDetail),
          contacts: clone(mock.contacts),
          tasks: [],
          followTimeline: clone(mock.followTimeline)
        }
      }

  return buildLocalProjectJudgement(payload, detail.data || detail)
}

async function requestProjectReviewData(payload = {}) {
  try {
    return await callCloudFunction('reviewClosedProject', payload)
  } catch (error) {
    if (canUseCloud() && !canFallbackNextSuggestion(error)) {
      throw error
    }
  }

  const detail = payload && payload.projectId
    ? await loadProjectDetailData(payload.projectId)
    : {
        data: {
          projectDetail: clone(mock.projectDetail),
          contacts: clone(mock.contacts),
          tasks: [],
          followTimeline: clone(mock.followTimeline)
        }
      }

  return buildLocalProjectReview(payload, detail.data || detail)
}

async function requestDormantProjectWakeData(payload = {}) {
  try {
    return await callCloudFunction('wakeDormantProject', payload)
  } catch (error) {
    if (canUseCloud() && !canFallbackNextSuggestion(error)) {
      throw error
    }
  }

  const detail = payload && payload.projectId
    ? await loadProjectDetailData(payload.projectId)
    : {
        data: {
          projectDetail: clone(mock.projectDetail),
          contacts: clone(mock.contacts),
          tasks: [],
          followTimeline: clone(mock.followTimeline)
        }
      }

  return buildLocalDormantWake(payload, detail.data || detail)
}

async function requestQuickEntryProjectResolution(payload = {}) {
  const nextPayload = payload && typeof payload === 'object' ? { ...payload } : {}
  if (!normalizeText(nextPayload.requestId)) {
    nextPayload.requestId = createRequestId('quick_entry_project')
  }
  try {
    return await callCloudFunction('resolveQuickEntryProject', nextPayload)
  } catch (error) {
    if (canUseCloud() && !canFallbackNextSuggestion(error)) {
      throw error
    }
  }

  return buildLocalQuickEntryProjectResolution(nextPayload)
}

async function requestQuickEntryProjectMemoryData(payload = {}) {
  try {
    return await callCloudFunction('getQuickEntryProjectMemory', payload)
  } catch (error) {
    if (canUseCloud()) {
      throw error
    }
  }

  return {
    ok: true,
    memoriesByProjectId: {},
    source: getAppDataSource()
  }
}

async function rememberQuickEntryProjectMemoryData(payload = {}) {
  try {
    return await callCloudFunction('rememberQuickEntryProjectMemory', payload)
  } catch (error) {
    if (canUseCloud()) {
      throw error
    }
  }

  return {
    ok: true,
    acceptedAliases: Array.isArray(payload.aliasTexts) ? clone(payload.aliasTexts) : [],
    source: getAppDataSource()
  }
}

async function requestNextFollowUpSuggestion(payload) {
  const nextPayload = payload && typeof payload === 'object' ? { ...payload } : {}
  if (!normalizeText(nextPayload.requestId)) {
    nextPayload.requestId = createRequestId('next_action')
  }
  try {
    return await callCloudFunction('suggestNextFollowUp', nextPayload)
  } catch (error) {
    if (canUseCloud() && !canFallbackNextSuggestion(error)) {
      throw error
    }
  }

  const detail = nextPayload && nextPayload.projectId
    ? await loadProjectDetailData(nextPayload.projectId)
    : { data: { projectDetail: clone(mock.projectDetail), contacts: clone(mock.contacts) } }
  const localResult = buildLocalNextSuggestion(nextPayload, detail.data || detail)

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
      shareTags: tags,
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
      : '当前解读基于发送资料范围内资料。'
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

async function submitFeedbackData(payload) {
  return callCloudFunction('submitFeedback', payload)
}

async function getReferralInfoData() {
  if (!canUseCloud()) {
    return {
      data: {
        ok: true,
        code: 'BMCDEMO100K',
        rewardAiTokens: 100000,
        sharePath: '/pages/referral/referral?referrerCode=BMCDEMO100K',
        stats: {
          invitedCount: 0,
          pendingCount: 0,
          rewardedCount: 0,
          rewardedAiTokens: 0
        },
        relations: [],
        source: getAppDataSource()
      },
      source: getAppDataSource()
    }
  }

  const result = await callCloudFunction('getReferralInfo')
  return {
    data: result || {},
    source: 'CloudBase'
  }
}

async function bindReferralData(payload = {}) {
  if (!canUseCloud()) {
    return {
      ok: true,
      alreadyBound: false,
      status: 'pending',
      message: '推荐关系已确认',
      rewardAiTokens: 100000
    }
  }

  return callCloudFunction('bindReferral', payload)
}

async function loadUserPreferencesData() {
  return callCloudFunction('getUserPreferences')
}

async function saveUserPreferencesData(payload) {
  return callCloudFunction('saveUserPreferences', payload)
}

async function bindPhoneData(payload = {}) {
  if (!canUseCloud()) {
    const code = String(payload.code || '').trim()
    if (!code) {
      throw new Error('请使用微信手机号授权完成绑定')
    }

    const phoneNumber = '13800000000'
    const phoneMasked = `${phoneNumber.slice(0, 3)}****${phoneNumber.slice(-4)}`
    cacheEntitlementsSummary({
      ...cachedEntitlements,
      phoneVerified: true,
      source: getAppDataSource()
    })

    return {
      data: cacheAccountSummary({
        ...cachedAccountSummary,
        phone: phoneNumber,
        phoneVerified: true,
        phoneMasked,
        phoneBindProvider: 'mock_wechat_get_phone_number',
        phoneVerifiedAt: new Date().toISOString(),
        displayName: cachedAccountSummary.customDisplayName || cachedAccountSummary.wechatNickname || phoneMasked || cachedAccountSummary.accountId,
        displayNameSource: cachedAccountSummary.customDisplayName
          ? 'custom'
          : (cachedAccountSummary.wechatNickname ? 'wechat' : (phoneMasked ? 'phone' : 'account')),
        source: getAppDataSource()
      }),
      source: getAppDataSource()
    }
  }

  const result = await callCloudFunction('bindPhone', payload)
  const accountResult = await resolveAccountData()
  const entitlementsResult = await getEntitlementsData()

  return {
    data: {
      ...(result || {}),
      account: accountResult.data,
      entitlements: entitlementsResult.data
    },
    source: 'CloudBase'
  }
}

async function resolveAccountData() {
  if (!canUseCloud()) {
    return {
      data: cacheAccountSummary({
        ...getDefaultAccountSummary(),
        source: getAppDataSource()
      }),
      source: getAppDataSource()
    }
  }

  const result = await callCloudFunction('resolveAccount')
  return {
    data: cacheAccountSummary({
      ...getDefaultAccountSummary(),
      ...(result || {}),
      source: 'CloudBase',
      isMock: false
    }),
    source: 'CloudBase'
  }
}

async function getEntitlementsData() {
  if (!canUseCloud()) {
    return {
      data: cacheEntitlementsSummary({
        ...getDefaultEntitlements(),
        ...cachedEntitlements,
        source: getAppDataSource()
      }),
      source: getAppDataSource()
    }
  }

  const result = await callCloudFunction('getEntitlements')
  return {
    data: cacheEntitlementsSummary({
      ...getDefaultEntitlements(),
      ...(result || {}),
      source: 'CloudBase',
      isMock: false
    }),
    source: 'CloudBase'
  }
}

async function getBillingCatalogData() {
  if (!canUseCloud()) {
    return {
      data: normalizeBillingCatalogPayload({
        ...getDefaultBillingCatalogData(),
        recentOrders: cachedMockBillingOrders,
        source: getAppDataSource()
      }),
      source: getAppDataSource()
    }
  }

  const result = await callCloudFunction('getBillingCatalog')
  return {
    data: normalizeBillingCatalogPayload({
      ...getDefaultBillingCatalogData(),
      ...(result || {}),
      source: 'CloudBase'
    }),
    source: 'CloudBase'
  }
}

async function createBillingOrderData(payload = {}) {
  if (!canUseCloud()) {
    const now = new Date().toISOString()
    const productCode = String(payload.productCode || '').trim() || 'unknown_product'
    const order = {
      orderId: `ord_mock_${Date.now()}`,
      title: String(payload.title || '内测订单').trim() || '内测订单',
      productCode,
      productType: String(payload.productType || 'subscription').trim() || 'subscription',
      amount: 0,
      currency: 'CNY',
      status: 'pending',
      source: 'mini_program',
      paymentEnabled: false,
      billingCycle: String(payload.billingCycle || '').trim(),
      createdAt: now,
      paidAt: '',
      updatedAt: now
    }

    cachedMockBillingOrders = [order].concat(cachedMockBillingOrders).slice(0, 5)
    return {
      data: {
        ok: true,
        reused: false,
        paymentEnabled: false,
        order
      },
      source: getAppDataSource()
    }
  }

  const result = await callCloudFunction('createBillingOrder', payload)
  return {
    data: result || {},
    source: 'CloudBase'
  }
}

async function getBillingOrderDetailData(payload = {}) {
  const orderId = String(payload.orderId || '').trim()
  if (!orderId) {
    throw new Error('BILLING_ORDER_NOT_FOUND: 当前订单不存在或已无权查看')
  }

  if (!canUseCloud()) {
    const order = cachedMockBillingOrders.find((item) => String(item && item.orderId ? item.orderId : '') === orderId)
    if (!order) {
      throw new Error('BILLING_ORDER_NOT_FOUND: 当前订单不存在或已无权查看')
    }

    const latestPaymentTransaction = cachedMockBillingPaymentTransactions
      .filter((item) => String(item && item.orderId ? item.orderId : '') === orderId)
      .sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime())[0] || null

    return {
      data: {
        ok: true,
        order,
        latestPaymentTransaction,
        paymentEnabled: false
      },
      source: getAppDataSource()
    }
  }

  const result = await callCloudFunction('getBillingOrderDetail', payload)
  return {
    data: result || {},
    source: 'CloudBase'
  }
}

async function prepareBillingPaymentData(payload = {}) {
  const orderId = String(payload.orderId || '').trim()
  if (!orderId) {
    throw new Error('BILLING_ORDER_NOT_FOUND: 当前订单不存在或已无权查看')
  }

  if (!canUseCloud()) {
    const orderIndex = cachedMockBillingOrders.findIndex((item) => String(item && item.orderId ? item.orderId : '') === orderId)
    if (orderIndex < 0) {
      throw new Error('BILLING_ORDER_NOT_FOUND: 当前订单不存在或已无权查看')
    }

    const order = {
      ...cachedMockBillingOrders[orderIndex],
      updatedAt: cachedMockBillingOrders[orderIndex].updatedAt || new Date().toISOString()
    }
    const now = new Date().toISOString()
    const recentPending = cachedMockBillingPaymentTransactions
      .filter((item) => String(item && item.orderId ? item.orderId : '') === orderId && String(item && item.status ? item.status : '') === 'pending')
      .sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime())[0] || null

    if (recentPending && now && (new Date(now).getTime() - new Date(recentPending.updatedAt || 0).getTime() <= 10 * 60 * 1000)) {
      const transactionId = String(recentPending.transactionId || recentPending.merchantTradeNo || `pay_mock_${Date.now()}`).trim()
      const expiresAt = recentPending.expiresAt || new Date(Date.now() + 10 * 60 * 1000).toISOString()
      const paymentSession = recentPending.paymentSession && typeof recentPending.paymentSession === 'object'
        ? {
            ...recentPending.paymentSession,
            sessionId: String(recentPending.paymentSession.sessionId || transactionId).trim(),
            provider: String(recentPending.paymentSession.provider || 'wechat_pay').trim(),
            mode: String(recentPending.paymentSession.mode || 'placeholder').trim(),
            paymentEnabled: recentPending.paymentSession.paymentEnabled === true,
            canInvokePayment: recentPending.paymentSession.canInvokePayment === true,
            preparedAt: String(recentPending.paymentSession.preparedAt || recentPending.createdAt || now).trim(),
            expiresAt: String(recentPending.paymentSession.expiresAt || expiresAt).trim(),
            pendingReason: String(recentPending.paymentSession.pendingReason || recentPending.failureReason || 'payment_not_enabled_yet').trim(),
            callbackFunctionName: String(recentPending.paymentSession.callbackFunctionName || 'handleBillingPaymentCallback').trim(),
            readinessCode: String(recentPending.paymentSession.readinessCode || 'placeholder_only').trim(),
            readinessLabel: String(recentPending.paymentSession.readinessLabel || '当前仅占位').trim(),
            profileCode: String(recentPending.paymentSession.profileCode || 'billing_payment_profile_v1').trim(),
            merchantConfigReady: recentPending.paymentSession.merchantConfigReady === true,
            missingConfigKeys: Array.isArray(recentPending.paymentSession.missingConfigKeys)
              ? recentPending.paymentSession.missingConfigKeys.slice(0, 10)
              : []
          }
        : {
            sessionId: transactionId,
            provider: 'wechat_pay',
            mode: 'placeholder',
            paymentEnabled: false,
            canInvokePayment: false,
            preparedAt: now,
            expiresAt,
            pendingReason: String(recentPending.failureReason || 'payment_not_enabled_yet').trim(),
            callbackFunctionName: 'handleBillingPaymentCallback',
            readinessCode: 'placeholder_only',
            readinessLabel: '当前仅占位',
            profileCode: 'billing_payment_profile_v1',
            merchantConfigReady: false,
            missingConfigKeys: []
          }

      return {
        data: {
          ok: true,
          reused: true,
          paymentEnabled: false,
          order,
          paymentTransaction: {
            ...recentPending,
            transactionId,
            merchantTradeNo: String(recentPending.merchantTradeNo || transactionId).trim(),
            channelTradeNo: String(recentPending.channelTradeNo || '').trim(),
            expiresAt,
            paymentSession
          },
          paymentSession,
          message: '当前还未接入微信支付，已复用最近一笔支付准备记录'
        },
        source: getAppDataSource()
      }
    }

    const mockTransactionId = `pay_mock_${Date.now()}`
    const mockExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const paymentSession = {
      sessionId: mockTransactionId,
      provider: 'wechat_pay',
      mode: 'placeholder',
      paymentEnabled: false,
      canInvokePayment: false,
      preparedAt: now,
      expiresAt: mockExpiresAt,
      pendingReason: 'payment_not_enabled_yet',
      callbackFunctionName: 'handleBillingPaymentCallback',
      readinessCode: 'placeholder_only',
      readinessLabel: '当前仅占位',
      profileCode: 'billing_payment_profile_v1',
      merchantConfigReady: false,
      missingConfigKeys: []
    }
    const paymentTransaction = {
      transactionId: mockTransactionId,
      merchantTradeNo: mockTransactionId,
      orderId,
      accountId: String(cachedAccountSummary.accountId || '').trim(),
      channel: 'wechat_pay',
      channelTradeNo: '',
      status: 'pending',
      failureReason: 'payment_not_enabled_yet',
      expiresAt: mockExpiresAt,
      paymentSession,
      createdAt: now,
      updatedAt: now
    }

    cachedMockBillingPaymentTransactions = [paymentTransaction].concat(cachedMockBillingPaymentTransactions).slice(0, 20)

    return {
      data: {
        ok: true,
        reused: false,
        paymentEnabled: false,
        order,
        paymentTransaction,
        paymentSession: paymentTransaction.paymentSession,
        message: '当前还未接入微信支付，已完成支付发起占位记录'
      },
      source: getAppDataSource()
    }
  }

  const result = await callCloudFunction('prepareBillingPayment', payload)
  return {
    data: result || {},
    source: 'CloudBase'
  }
}

module.exports = {
  getDefaultAccountSummary,
  getDefaultEntitlements,
  getCachedAccountSummary,
  getCachedEntitlements,
  loadHomeData,
  loadProjectsData,
  loadTasksData,
  loadContactsData,
  loadContactDetailData,
  loadProjectDetailData,
  loadProjectFormData,
  saveProjectData,
  flowProjectData,
  createNotifyTaskData,
  reportSystemFailureData,
  requestFollowUpSummary,
  requestSpeechToTextData,
  requestProjectJudgementData,
  requestProjectReviewData,
  requestDormantProjectWakeData,
  requestQuickEntryProjectResolution,
  requestQuickEntryProjectMemoryData,
  rememberQuickEntryProjectMemoryData,
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
  submitFeedbackData,
  getReferralInfoData,
  bindReferralData,
  bindPhoneData,
  resolveAccountData,
  getEntitlementsData,
  getBillingCatalogData,
  createBillingOrderData,
  getBillingOrderDetailData,
  prepareBillingPaymentData,
  loadUserPreferencesData,
  saveUserPreferencesData
}
