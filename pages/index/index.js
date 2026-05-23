const {
  loadHomeData,
  loadProjectsData,
  saveProjectData,
  saveFollowUpData,
  requestFollowUpSummary,
  requestQuickEntryProjectResolution,
  requestQuickEntryProjectMemoryData,
  rememberQuickEntryProjectMemoryData,
  requestNextFollowUpSuggestion,
  requestSpeechToTextData,
  reportSystemFailureData,
  loadNotificationsData,
  updateTaskStatusData,
  markNotificationReadData,
  resolveNotificationData
} = require('../../services/data')
const { buildTaskCompletionFeedback, getTaskCompletionToastTitle } = require('../../services/task-feedback')
const { appendQueryParams } = require('../../utils/navigation-context')
const { getNotificationPrimaryActionLabel } = require('../../utils/notification-meta')
const { getNotificationSyncVersion, touchNotificationSync } = require('../../utils/notification-sync')
const { syncPageAppearance } = require('../../utils/appearance')
const { ensureActionAllowed, getEntitlementSnapshot, buildEntitlementPagePrompt, buildEntitlementOverview } = require('../../utils/entitlement-guard')
const {
  normalizeFollowUpMethod,
  isSpecificFollowUpMethod,
  detectFollowUpMethodFromContent,
  normalizeFollowUpOccurredMeta,
  buildDefaultFollowUpOccurredMeta,
  extractFollowUpOccurredMetaFromContent,
  resolvePreferredFollowUpMethod,
  resolvePreferredFollowUpOccurredMeta
} = require('../../utils/follow-up-meta')
const { formatAiQuotaValue } = require('../../utils/quota-format')
const { startVoiceRecordingTicker, stopVoiceRecordingTicker } = require('../../utils/voice-recording')
const { loadHomeSloganFontFace } = require('../../utils/home-slogan-font')

function getAppInstance() {
  return typeof getApp === 'function' ? getApp() : null
}

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

const QUICK_ENTRY_MODES = [
  {
    key: 'follow_up',
    label: '记跟进',
    desc: '先说一句，系统会自动识别项目和下一步动作。'
  },
  {
    key: 'task',
    label: '补任务',
    desc: '顺手补一条动作，首页会自动跟进。'
  },
  {
    key: 'project',
    label: '新建项目',
    desc: '先把项目放进系统，后续再补细节。'
  }
]

const QUICK_ENTRY_STAGES = ['线索', '洽谈', '方案', '商务', '成交', '流失']
const QUICK_ENTRY_METHODS = ['电话', '微信', '邮件', '面谈', '其他']
const QUICK_ENTRY_DRAFT_STORAGE_KEY = 'homeQuickEntryDraftsV1'
const QUICK_ENTRY_VOICE_HINT_STORAGE_KEY = 'homeQuickEntryVoiceHintSeenV1'
const QUICK_ENTRY_LEARNING_DEBUG_STORAGE_KEY = 'homeQuickEntryLearningDebugV1'
const QUICK_ENTRY_PROJECT_ALIAS_STORAGE_KEY = 'homeQuickEntryProjectAliasesV1'
const QUICK_ENTRY_PROJECT_ALIAS_HIT_HISTORY_STORAGE_KEY = 'homeQuickEntryProjectAliasHitHistoryV1'
const QUICK_ENTRY_DRAFT_TTL = 6 * 60 * 60 * 1000
const MAX_RECORD_DURATION = 60000
const QUICK_ENTRY_ALIAS_PER_PROJECT_LIMIT = 12
const QUICK_ENTRY_ALIAS_HIT_HISTORY_PER_PROJECT_LIMIT = 12
const QUICK_ENTRY_AUTO_ALIAS_PER_PROJECT_LIMIT = 18
const QUICK_ENTRY_MATCH_TOKEN_LIMIT = 24
const QUICK_ENTRY_CANDIDATE_LIMIT = 8
const QUICK_ENTRY_PROJECT_STOP_WORDS = [
  '有限责任公司',
  '股份有限公司',
  '有限公司',
  '公司',
  '集团',
  '科技',
  '技术',
  '信息',
  '项目',
  '计划',
  '系统',
  '平台',
  '升级',
  '改造',
  '建设',
  '方案',
  '客户',
  '联系',
  '联系人'
]
const QUICK_ENTRY_HOMOPHONE_GROUPS = [
  '智制致治志质值至置',
  '造燥灶噪皂躁澡',
  '讯信芯新欣馨辛',
  '联连莲链涟',
  '维唯惟伟纬',
  '图途涂徒',
  '科克客课刻',
  '城诚程成',
  '华花',
  '东冬'
]
const QUICK_ENTRY_ALIAS_BLOCK_WORDS = [
  '项目',
  '客户',
  '方案',
  '报价',
  '合同',
  '合作',
  '跟进',
  '进度',
  '需求',
  '老板',
  '领导',
  '对方',
  '这个项目',
  '那个项目',
  '这单',
  '那单',
  '语音',
  '录音',
  '微信',
  '电话',
  '邮件',
  '面谈',
  '任务',
  '动作',
  '情况',
  '内容',
  '记录',
  '客户那边',
  '对方那边',
  '他们那边',
  '这个客户',
  '那个客户',
  '这个单子',
  '那个单子'
]

const QUICK_ENTRY_HOMOPHONE_CHAR_MAP = QUICK_ENTRY_HOMOPHONE_GROUPS.reduce((result, group) => {
  const chars = String(group || '').split('').filter(Boolean)
  if (!chars.length) {
    return result
  }

  const canonical = chars[0]
  chars.forEach((char) => {
    result[char] = canonical
  })
  return result
}, {})

const QUICK_ENTRY_HOMOPHONE_ALTERNATIVES_MAP = QUICK_ENTRY_HOMOPHONE_GROUPS.reduce((result, group) => {
  const chars = String(group || '').split('').filter(Boolean)
  chars.forEach((char) => {
    result[char] = chars.filter((item) => item !== char)
  })
  return result
}, {})

let quickEntryProjectAliasMemoryCache = {}

function normalizeText(value) {
  return String(value || '').trim()
}

function formatDateLabel(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) {
    return ''
  }

  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function getHomeAccessActionText(text = '', url = '') {
  const currentText = normalizeText(text)
  const currentUrl = normalizeText(url)

  if (currentUrl.includes('/pages/phone-bind/phone-bind')) {
    return '绑定手机号'
  }

  if (currentUrl.includes('/pages/plans/plans?focus=subscription')) {
    return '订阅套餐'
  }

  if (currentUrl.includes('/pages/entitlements/entitlements')) {
    return '查看权益'
  }

  if (currentText === '查看套餐与权益' || currentText === '查看权益详情') {
    return '查看权益'
  }

  return currentText
}

function buildHomeAvatarText(account = {}) {
  const text = normalizeText(account.displayName || account.customDisplayName || account.wechatNickname || account.phoneMasked)
  if (!text) {
    return '我'
  }
  return text.slice(0, 1).toUpperCase()
}

function buildHomeAccessCard(snapshot = {}) {
  const account = snapshot.account || {}
  const entitlements = snapshot.entitlements || {}
  const prompt = buildEntitlementPagePrompt({
    account,
    entitlements
  }, 'index')
  const overview = buildEntitlementOverview({
    account,
    entitlements
  })
  const accessLevel = normalizeText(entitlements.currentAccessLevel || account.currentAccessLevel)
  const effectiveToText = formatDateLabel(entitlements.effectiveTo || account.trialEndsAt)
  const effectiveFromText = formatDateLabel(entitlements.effectiveFrom)
  const projectLimit = Number(entitlements.projectLimit)
  const currentProjectCount = Math.max(0, Number(entitlements.currentProjectCount || 0))
  const projectText = Number.isFinite(projectLimit) && projectLimit > -1
    ? `${currentProjectCount}/${projectLimit} 个项目位`
    : `${currentProjectCount} 个在用项目`

  let title = '当前账户状态'
  let desc = ''
  let badgeText = overview.accessLevelLabel
  let badgeClass = 'is-neutral'
  let actionText = '查看权益'
  let actionUrl = '/pages/entitlements/entitlements'

  if (accessLevel === 'paid_active') {
    title = '当前权益已生效'
    badgeText = '付费可写'
    badgeClass = 'is-success'
    actionText = '查看权益'
    actionUrl = '/pages/plans/plans'
  } else if (accessLevel === 'trial_full') {
    title = '当前处于试用期'
    badgeText = '试用可写'
    badgeClass = 'is-soft'
    actionText = account.phoneVerified ? '查看权益' : '绑定手机号'
    actionUrl = account.phoneVerified ? '/pages/plans/plans' : '/pages/phone-bind/phone-bind?returnTo=index'
  } else if (accessLevel === 'paid_readonly' || accessLevel === 'free_readonly') {
    title = '当前账号已只读'
    badgeText = overview.accessLevelLabel
    badgeClass = 'is-brand'
    actionText = '订阅套餐'
    actionUrl = '/pages/plans/plans?focus=subscription&reason=write_disabled'
  } else if (accessLevel === 'disabled') {
    title = '当前账号不可用'
    desc = overview.reasonSummary || '请查看权益状态。'
    badgeText = '已禁用'
    badgeClass = 'is-danger'
    actionText = '查看权益'
    actionUrl = '/pages/entitlements/entitlements?reason=account_disabled'
  }

  if (snapshot.refreshError) {
    title = '暂时无法确认权益'
    desc = '请稍后重试，或查看权益状态。'
    actionText = '查看权益'
    actionUrl = '/pages/entitlements/entitlements?reason=entitlement_refresh_failed'
  } else if (prompt && prompt.visible) {
    title = prompt.title || title
    desc = prompt.actionType === 'open_entitlements' || prompt.tone === 'danger'
      ? (prompt.desc || desc)
      : ''
    actionText = prompt.actionText || actionText
    actionUrl = prompt.actionUrl || actionUrl
  }

  return {
    visible: true,
    title,
    desc,
    badgeText,
    badgeClass,
    actionText: getHomeAccessActionText(actionText, actionUrl),
    actionUrl,
    rows: [
      {
        key: 'period',
        label: '当前周期',
        value: [effectiveFromText ? `起始 ${effectiveFromText}` : '', effectiveToText ? `至 ${effectiveToText}` : ''].filter(Boolean).join(' · ') || overview.accountStatusLabel
      },
      {
        key: 'projects',
        label: '项目位',
        value: projectText
      },
      {
        key: 'voice',
        label: '语音剩余',
        value: `${Math.max(0, Number(entitlements.voiceSecondsRemaining || 0))} 秒`
      },
      {
        key: 'ai',
        label: 'AI 剩余',
        value: formatAiQuotaValue(entitlements.aiTokensRemaining)
      }
    ]
  }
}

function normalizeRecognizedText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeHomophoneText(value) {
  return String(value || '')
    .split('')
    .map((char) => QUICK_ENTRY_HOMOPHONE_CHAR_MAP[char] || char)
    .join('')
}

function extractChineseSegments(value) {
  return String(value || '').match(/[\u4e00-\u9fa5]{2,}/g) || []
}

function buildChineseNgramTokens(value, minLength = 2, maxLength = 8, limit = QUICK_ENTRY_MATCH_TOKEN_LIMIT) {
  const segments = extractChineseSegments(value)
  const tokens = []
  const seen = new Set()

  segments.forEach((segment) => {
    const currentSegment = normalizeText(segment)
    if (!currentSegment) {
      return
    }

    const upperLength = Math.min(maxLength, currentSegment.length)
    for (let length = upperLength; length >= minLength; length -= 1) {
      for (let start = 0; start + length <= currentSegment.length; start += 1) {
        const token = currentSegment.slice(start, start + length)
        if (!token || seen.has(token)) {
          continue
        }
        seen.add(token)
        tokens.push(token)
        if (tokens.length >= limit) {
          return
        }
      }
      if (tokens.length >= limit) {
        return
      }
    }
  })

  return tokens
}

function levenshteinDistance(left = '', right = '') {
  const source = String(left || '')
  const target = String(right || '')
  if (!source) {
    return target.length
  }
  if (!target) {
    return source.length
  }

  const sourceLength = source.length
  const targetLength = target.length
  const previous = new Array(targetLength + 1).fill(0)
  const current = new Array(targetLength + 1).fill(0)

  for (let index = 0; index <= targetLength; index += 1) {
    previous[index] = index
  }

  for (let sourceIndex = 1; sourceIndex <= sourceLength; sourceIndex += 1) {
    current[0] = sourceIndex
    for (let targetIndex = 1; targetIndex <= targetLength; targetIndex += 1) {
      const replaceCost = source[sourceIndex - 1] === target[targetIndex - 1] ? 0 : 1
      current[targetIndex] = Math.min(
        current[targetIndex - 1] + 1,
        previous[targetIndex] + 1,
        previous[targetIndex - 1] + replaceCost
      )
    }
    for (let targetIndex = 0; targetIndex <= targetLength; targetIndex += 1) {
      previous[targetIndex] = current[targetIndex]
    }
  }

  return previous[targetLength]
}

function getQuickEntryFuzzyTokenScore(left, right) {
  const source = normalizeText(left)
  const target = normalizeText(right)
  if (!source || !target || source === target) {
    return 0
  }

  const maxLength = Math.max(source.length, target.length)
  const minLength = Math.min(source.length, target.length)
  if (minLength < 3 || maxLength > 12 || Math.abs(source.length - target.length) > 2) {
    return 0
  }

  const sourceHomophone = normalizeHomophoneText(source)
  const targetHomophone = normalizeHomophoneText(target)
  if (sourceHomophone === targetHomophone) {
    return 10 + Math.min(Math.max(maxLength - 3, 0), 3)
  }

  const distance = levenshteinDistance(source, target)
  const samePrefix = source.slice(0, 2) === target.slice(0, 2)
  const sameHomophonePrefix = normalizeHomophoneText(source.slice(0, 2)) === normalizeHomophoneText(target.slice(0, 2))

  if (distance === 1 && (samePrefix || sameHomophonePrefix)) {
    return 8 + Math.min(Math.max(maxLength - 4, 0), 2)
  }

  if (distance === 2 && maxLength >= 5 && (samePrefix || sameHomophonePrefix)) {
    return 4
  }

  return 0
}

function normalizeQuickEntryAliasToken(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeQuickEntryAliasCheckKey(value) {
  return normalizeQuickEntryAliasToken(value).replace(/[\s\-_/，,。；;:：、]+/g, '')
}

function isValidQuickEntryAliasText(value) {
  const text = normalizeText(value)
  const key = normalizeQuickEntryAliasCheckKey(text)
  if (!text || text.length < 2 || text.length > 16 || !key) {
    return false
  }

  return QUICK_ENTRY_ALIAS_BLOCK_WORDS.indexOf(key) < 0
}

function normalizeQuickEntryAliasTextList(value) {
  const list = Array.isArray(value)
    ? value
    : String(value || '').split(/[\n,，\/；;]+/)
  const seen = new Set()
  const result = []

  list.forEach((item) => {
    const current = normalizeText(item)
    const currentKey = normalizeQuickEntryAliasCheckKey(current)
    if (!isValidQuickEntryAliasText(current) || !currentKey || seen.has(currentKey)) {
      return
    }

    seen.add(currentKey)
    result.push(current)
  })

  return result.slice(0, QUICK_ENTRY_ALIAS_PER_PROJECT_LIMIT)
}

function getQuickEntryProjectConfiguredAliases(projectMeta = null) {
  const currentProject = projectMeta && typeof projectMeta === 'object' ? projectMeta : null
  if (!currentProject) {
    return []
  }

  const aliases = []
  ;[
    currentProject.voiceAliases,
    currentProject.aliases,
    currentProject.matchAliases,
    currentProject.projectAliases
  ].forEach((value) => {
    normalizeQuickEntryAliasTextList(value).forEach((item) => {
      if (aliases.indexOf(item) < 0) {
        aliases.push(item)
      }
    })
  })

  return aliases.slice(0, QUICK_ENTRY_ALIAS_PER_PROJECT_LIMIT)
}

function buildQuickEntryConfiguredAliasTokens(projectMeta = null) {
  const aliases = getQuickEntryProjectConfiguredAliases(projectMeta)
  if (!aliases.length) {
    return []
  }

  const seen = new Set()
  const result = []

  aliases.forEach((alias) => {
    buildQuickEntryMatchTokens(alias).forEach((token) => {
      const currentToken = normalizeQuickEntryAliasToken(token)
      if (!currentToken || seen.has(currentToken)) {
        return
      }

      seen.add(currentToken)
      result.push(currentToken)
    })
  })

  return result.slice(0, QUICK_ENTRY_MATCH_TOKEN_LIMIT)
}

function buildQuickEntryProjectComparableTokens(projectMeta = null) {
  const currentProject = projectMeta && typeof projectMeta === 'object' ? projectMeta : null
  if (!currentProject) {
    return []
  }

  const sourceTexts = [
    normalizeText(currentProject.name),
    normalizeText(currentProject.client),
    normalizeText(currentProject.contactText)
  ].filter(Boolean)

  getQuickEntryProjectConfiguredAliases(currentProject).forEach((alias) => {
    if (sourceTexts.indexOf(alias) < 0) {
      sourceTexts.push(alias)
    }
  })

  const seen = new Set()
  const result = []

  sourceTexts.forEach((text) => {
    buildQuickEntryMatchTokens(text).forEach((token) => {
      const currentToken = normalizeQuickEntryAliasToken(token)
      if (!currentToken || seen.has(currentToken)) {
        return
      }

      seen.add(currentToken)
      result.push(currentToken)
    })
  })

  return result.slice(0, QUICK_ENTRY_MATCH_TOKEN_LIMIT + QUICK_ENTRY_ALIAS_PER_PROJECT_LIMIT)
}

function getQuickEntryAliasProjectAffinityScore(token, projectMeta = null) {
  const currentToken = normalizeQuickEntryAliasToken(token)
  if (!currentToken) {
    return 0
  }

  const projectTokens = buildQuickEntryProjectComparableTokens(projectMeta)
  if (!projectTokens.length) {
    return 0
  }

  let bestScore = 0
  const currentHomophone = normalizeHomophoneText(currentToken)

  projectTokens.forEach((projectToken) => {
    const currentProjectToken = normalizeQuickEntryAliasToken(projectToken)
    if (!currentProjectToken) {
      return
    }

    if (currentToken === currentProjectToken) {
      bestScore = Math.max(bestScore, 132)
      return
    }

    if (currentHomophone && currentHomophone === normalizeHomophoneText(currentProjectToken)) {
      bestScore = Math.max(bestScore, 126 + Math.min(currentToken.length, 4))
      return
    }

    const fuzzyScore = getQuickEntryFuzzyTokenScore(currentToken, currentProjectToken)
    if (fuzzyScore >= 8) {
      bestScore = Math.max(bestScore, 102 + fuzzyScore)
      return
    }

    if (currentToken.length >= 3 && currentProjectToken.includes(currentToken)) {
      bestScore = Math.max(bestScore, 90 + Math.min(currentToken.length, 6))
      return
    }

    if (currentProjectToken.length >= 3 && currentToken.includes(currentProjectToken)) {
      bestScore = Math.max(bestScore, 94 + Math.min(currentProjectToken.length, 6))
    }
  })

  return bestScore
}

function reviewQuickEntryLearnableManualCorrectionAliases(tokens = [], projectMeta = null, allProjects = []) {
  const currentProject = projectMeta && typeof projectMeta === 'object' ? projectMeta : null
  if (!currentProject) {
    return {
      acceptedTokens: [],
      blockedTokens: [],
      blockedReason: ''
    }
  }

  const currentProjectId = normalizeText(currentProject.id)
  const projectList = Array.isArray(allProjects) ? allProjects : []
  const reviewedItems = (Array.isArray(tokens) ? tokens : [])
    .map((token) => {
      const currentToken = normalizeQuickEntryAliasToken(token)
      if (!currentToken) {
        return null
      }

      const currentScore = getQuickEntryAliasProjectAffinityScore(currentToken, currentProject)
      let bestOtherScore = 0
      let strongConflictCount = 0

      projectList.forEach((item) => {
        if (!item || normalizeText(item.id) === currentProjectId) {
          return
        }

        const otherScore = getQuickEntryAliasProjectAffinityScore(currentToken, item)
        if (otherScore > bestOtherScore) {
          bestOtherScore = otherScore
        }
        if (otherScore >= 102) {
          strongConflictCount += 1
        }
      })

      return {
        token: currentToken,
        currentScore,
        bestOtherScore,
        strongConflictCount,
        safetyGap: currentScore - bestOtherScore
      }
    })
    .filter(Boolean)

  const acceptedItems = reviewedItems
    .filter((item) => {
      if (item.currentScore < 92) {
        return false
      }

      if (item.token.length < 4 && item.currentScore < 126) {
        return false
      }

      if (item.strongConflictCount > 0 && item.currentScore < 126) {
        return false
      }

      if (item.bestOtherScore > 0 && item.safetyGap < 8) {
        return false
      }

      return true
    })
    .sort((left, right) => {
      if (right.safetyGap !== left.safetyGap) {
        return right.safetyGap - left.safetyGap
      }
      if (right.currentScore !== left.currentScore) {
        return right.currentScore - left.currentScore
      }
      return right.token.length - left.token.length
    })

  const acceptedTokens = acceptedItems.map((item) => item.token).slice(0, 4)
  const acceptedTokenSet = new Set(acceptedTokens)
  const blockedItems = reviewedItems.filter((item) => !acceptedTokenSet.has(item.token))
  const blockedByConflictCount = blockedItems.filter((item) => item.strongConflictCount > 0 || item.safetyGap < 8).length
  const blockedByWeakMatchCount = blockedItems.filter((item) => item.currentScore < 92).length
  const blockedByShortCount = blockedItems.filter((item) => item.token.length < 4 && item.currentScore < 126).length

  let blockedReason = ''
  if (!acceptedTokens.length && blockedItems.length) {
    if (blockedByConflictCount > 0) {
      blockedReason = 'ambiguous'
    } else if (blockedByShortCount > 0 || blockedByWeakMatchCount > 0) {
      blockedReason = 'weak'
    }
  }

  return {
    acceptedTokens,
    blockedTokens: blockedItems.map((item) => item.token),
    blockedReason
  }
}

function normalizeQuickEntryProjectAliasMemory(value) {
  const payload = value && typeof value === 'object' ? value : {}
  return Object.keys(payload).reduce((result, projectId) => {
    const currentId = normalizeText(projectId)
    if (!currentId) {
      return result
    }

    const aliases = Array.isArray(payload[projectId])
      ? payload[projectId]
          .map((item) => normalizeQuickEntryAliasToken(item))
          .filter((item) => isValidQuickEntryAliasText(item))
          .slice(0, QUICK_ENTRY_ALIAS_PER_PROJECT_LIMIT)
      : []

    if (aliases.length) {
      result[currentId] = aliases
    }

    return result
  }, {})
}

function mergeQuickEntryProjectAliasMemoryMaps(...maps) {
  const merged = {}
  maps.forEach((source) => {
    const currentMap = normalizeQuickEntryProjectAliasMemory(source)
    Object.keys(currentMap).forEach((projectId) => {
      const currentList = Array.isArray(merged[projectId]) ? merged[projectId] : []
      const nextList = currentList.slice()
      currentMap[projectId].forEach((alias) => {
        if (nextList.indexOf(alias) < 0 && nextList.length < QUICK_ENTRY_ALIAS_PER_PROJECT_LIMIT) {
          nextList.push(alias)
        }
      })
      if (nextList.length) {
        merged[projectId] = nextList
      }
    })
  })
  return merged
}

function setQuickEntryProjectAliasMemoryCache(value) {
  quickEntryProjectAliasMemoryCache = normalizeQuickEntryProjectAliasMemory(value)
  return quickEntryProjectAliasMemoryCache
}

function getQuickEntryProjectAliasTokens(projectId = '') {
  const currentId = normalizeText(projectId)
  if (!currentId) {
    return []
  }

  return Array.isArray(quickEntryProjectAliasMemoryCache[currentId])
    ? quickEntryProjectAliasMemoryCache[currentId]
    : []
}

function normalizeQuickEntryAliasHitType(value) {
  const current = normalizeText(value)
  const allowed = [
    'project_signal',
    'project_memory',
    'configured_alias',
    'memory_alias',
    'auto_homophone',
    'project_name',
    'client_name',
    'contact_name',
    'other'
  ]

  return allowed.indexOf(current) >= 0 ? current : 'other'
}

function buildQuickEntryAliasHitLabel(hitType = '') {
  const current = normalizeQuickEntryAliasHitType(hitType)
  if (current === 'project_signal' || current === 'configured_alias') {
    return '项目线索'
  }
  if (current === 'project_memory' || current === 'memory_alias') {
    return '项目记忆'
  }
  if (current === 'auto_homophone') {
    return '自动同音'
  }
  if (current === 'project_name') {
    return '项目名称'
  }
  if (current === 'client_name') {
    return '客户名称'
  }
  if (current === 'contact_name') {
    return '联系人'
  }
  return '其他命中'
}

function normalizeQuickEntryAliasHitHistory(value) {
  const payload = value && typeof value === 'object' ? value : {}
  return Object.keys(payload).reduce((result, projectId) => {
    const currentId = normalizeText(projectId)
    if (!currentId) {
      return result
    }

    const entries = Array.isArray(payload[projectId])
      ? payload[projectId]
          .map((item) => {
            const current = item && typeof item === 'object' ? item : {}
            const matchedAt = normalizeText(current.matchedAt)
            const reasonText = normalizeText(current.reasonText)
            const aliasText = normalizeText(current.aliasText)
            const contentPreview = normalizeText(current.contentPreview)
            const contentKey = normalizeText(current.contentKey).toLowerCase()
            if (!matchedAt || !reasonText) {
              return null
            }

            return {
              matchedAt,
              reasonText,
              aliasText,
              contentPreview,
              contentKey,
              hitType: normalizeQuickEntryAliasHitType(current.hitType),
              hitLabel: buildQuickEntryAliasHitLabel(current.hitType),
              selectionMode: normalizeText(current.selectionMode)
            }
          })
          .filter(Boolean)
          .sort((left, right) => new Date(right.matchedAt).getTime() - new Date(left.matchedAt).getTime())
          .slice(0, QUICK_ENTRY_ALIAS_HIT_HISTORY_PER_PROJECT_LIMIT)
      : []

    if (entries.length) {
      result[currentId] = entries
    }

    return result
  }, {})
}

function buildQuickEntryAliasHitRecord(projectMeta = null, content = '', selectionMode = '') {
  const currentProject = projectMeta && typeof projectMeta === 'object' ? projectMeta : null
  const currentContent = normalizeText(content)
  if (!currentProject || !currentContent) {
    return null
  }

  const insight = buildQuickEntryProjectMatchInsight(currentProject, currentContent)
  const reasonTexts = Array.isArray(insight.matchReasonTexts) ? insight.matchReasonTexts : []
  const memoryReason = reasonTexts.find((item) => /项目线索|项目记忆|自动同音|识别别名|历史记忆/.test(item)) || ''
  const primaryReason = memoryReason || reasonTexts[0] || ''
  if (!primaryReason) {
    return null
  }

  let hitType = 'other'
  let aliasText = ''
  let matched = primaryReason.match(/^(命中项目线索|项目线索同音|项目线索近似|命中识别别名|识别别名同音|识别别名近似)\s+(.+)$/)
  if (matched) {
    hitType = 'project_signal'
    aliasText = normalizeText(matched[2])
  } else {
    matched = primaryReason.match(/^(命中项目记忆|项目记忆近似|命中历史记忆|历史记忆近似)\s+(.+)$/)
    if (matched) {
      hitType = 'project_memory'
      aliasText = normalizeText(matched[2])
    } else {
      matched = primaryReason.match(/^(命中自动同音|自动同音接近)\s+(.+)$/)
      if (matched) {
        hitType = 'auto_homophone'
        aliasText = normalizeText(matched[2])
      } else if (primaryReason.indexOf('项目名') >= 0) {
        hitType = 'project_name'
      } else if (primaryReason.indexOf('客户名') >= 0) {
        hitType = 'client_name'
      } else if (primaryReason.indexOf('联系人') >= 0) {
        hitType = 'contact_name'
      }
    }
  }

  return {
    matchedAt: new Date().toISOString(),
    reasonText: primaryReason,
    aliasText,
    contentPreview: currentContent.length > 36 ? `${currentContent.slice(0, 36)}...` : currentContent,
    contentKey: currentContent.toLowerCase(),
    hitType,
    hitLabel: buildQuickEntryAliasHitLabel(hitType),
    selectionMode: normalizeText(selectionMode)
  }
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

function formatAiGeneratedTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return `${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())} ${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`
}

const QUICK_ENTRY_AI_MODEL_SOURCE_DEFAULTS = {
  sourceType: 'model',
  sourceLabel: '云端模型',
  providerLabel: 'CloudBase AI',
  modelName: 'hunyuan-exp / hunyuan-turbos-latest',
  canRegenerate: true
}

const QUICK_ENTRY_AI_FALLBACK_SOURCE_DEFAULTS = {
  sourceType: 'fallback',
  sourceLabel: '系统基础建议',
  providerLabel: '',
  modelName: '',
  canRegenerate: true
}

function normalizeQuickEntryAiSourceMeta(value) {
  const payload = value && typeof value === 'object' ? value : {}
  const sourceType = String(payload.sourceType || (payload.fallback ? 'fallback' : 'model')).trim() === 'fallback'
    ? 'fallback'
    : 'model'
  const defaults = sourceType === 'fallback'
    ? QUICK_ENTRY_AI_FALLBACK_SOURCE_DEFAULTS
    : QUICK_ENTRY_AI_MODEL_SOURCE_DEFAULTS
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
      : `来自：云端模型${modelName ? ` · ${modelName}` : ''}`
  }
}

function normalizeQuickEntryAiSummary(value) {
  const payload = value && typeof value === 'object' ? value : {}
  const normalizedOccurredMeta = normalizeFollowUpOccurredMeta(payload)
  return {
    ...payload,
    ...normalizeQuickEntryAiSourceMeta(payload),
    summary: normalizeText(payload.summary),
    highlights: Array.isArray(payload.highlights) ? payload.highlights.map((item) => normalizeText(item)).filter(Boolean) : [],
    risks: Array.isArray(payload.risks) ? payload.risks.map((item) => normalizeText(item)).filter(Boolean) : [],
    missingInfo: Array.isArray(payload.missingInfo) ? payload.missingInfo.map((item) => normalizeText(item)).filter(Boolean) : [],
    followUpMethod: normalizeFollowUpMethod(payload.followUpMethod, ''),
    followUpOccurredDate: normalizedOccurredMeta ? normalizedOccurredMeta.followUpOccurredDate : '',
    followUpOccurredTime: normalizedOccurredMeta ? normalizedOccurredMeta.followUpOccurredTime : '',
    followUpOccurredTimePrecision: normalizedOccurredMeta ? normalizedOccurredMeta.followUpOccurredTimePrecision : '',
    recommendedStage: normalizeText(payload.recommendedStage),
    stageChangeReason: normalizeText(payload.stageChangeReason),
    currentStage: normalizeText(payload.currentStage),
    showRecommendedStage: Boolean(
      normalizeText(payload.recommendedStage)
      && normalizeText(payload.recommendedStage) !== '不变更'
      && normalizeText(payload.recommendedStage) !== normalizeText(payload.currentStage)
    )
  }
}

function cloneQuickEntryAiSummary(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  return normalizeQuickEntryAiSummary({
    ...value,
    highlights: Array.isArray(value.highlights) ? value.highlights.slice() : [],
    risks: Array.isArray(value.risks) ? value.risks.slice() : [],
    missingInfo: Array.isArray(value.missingInfo) ? value.missingInfo.slice() : []
  })
}

function buildDetectedQuickEntryFollowUpMeta(content, now = new Date()) {
  return {
    detectedMethod: detectFollowUpMethodFromContent(content, { now }),
    detectedOccurredMeta: extractFollowUpOccurredMetaFromContent(content, { now }),
    referenceNowMeta: buildDefaultFollowUpOccurredMeta({ now })
  }
}

function buildQuickEntryFollowUpMetaPatch(options = {}) {
  const patch = {}
  const resolvedMethod = resolvePreferredFollowUpMethod({
    aiMethod: options.aiSummary && options.aiSummary.followUpMethod,
    detectedMethod: options.detectedMethod,
    fallbackMethod: options.fallbackMethod || '其他'
  })
  const resolvedOccurredMeta = resolvePreferredFollowUpOccurredMeta(
    options.aiSummary,
    options.detectedOccurredMeta,
    { now: options.now }
  )

  if (!options.methodTouched && (options.allowMethodDefault || isSpecificFollowUpMethod(resolvedMethod))) {
    patch['quickEntryForm.followUpMethod'] = resolvedMethod
  }

  const shouldApplyOccurredMeta = options.allowOccurredDefault || resolvedOccurredMeta.followUpOccurredTimePrecision !== 'default_now'
  if (shouldApplyOccurredMeta) {
    if (!options.dateTouched) {
      patch['quickEntryForm.followUpDate'] = resolvedOccurredMeta.followUpOccurredDate
    }
    if (!options.clockTouched) {
      patch['quickEntryForm.followUpClock'] = resolvedOccurredMeta.followUpOccurredTime
    }
  }

  return patch
}

function getTaskTypeLabel(type) {
  const currentType = normalizeText(type)
  const matched = NEXT_TASK_TEMPLATES.find((item) => item.type === currentType)
  return matched ? matched.label : '其他动作'
}

function normalizeQuickEntryAiNextSuggestion(value) {
  const payload = value && typeof value === 'object' ? value : {}
  const taskDrafts = Array.isArray(payload.taskDrafts)
    ? payload.taskDrafts.map((item) => ({
        ...item,
        title: normalizeText(item && item.title),
        type: normalizeText(item && item.type) || 'other',
        typeLabel: getTaskTypeLabel(item && item.type),
        dueDate: normalizeText(item && item.dueDate),
        dueTime: normalizeText(item && item.dueTime),
        description: normalizeText(item && item.description)
      })).filter((item) => item.title)
    : []

  return {
    ...payload,
    ...normalizeQuickEntryAiSourceMeta(payload),
    nextAction: normalizeText(payload.nextAction),
    recommendedTarget: normalizeText(payload.recommendedTarget),
    recommendedMethod: normalizeText(payload.recommendedMethod),
    recommendedTimeWindow: normalizeText(payload.recommendedTimeWindow),
    recommendedDate: normalizeText(payload.recommendedDate),
    recommendedTime: normalizeText(payload.recommendedTime),
    talkTrack: normalizeText(payload.talkTrack),
    reason: normalizeText(payload.reason),
    missingInfo: Array.isArray(payload.missingInfo) ? payload.missingInfo.map((item) => normalizeText(item)).filter(Boolean) : [],
    taskDrafts
  }
}

function cloneQuickEntryAiNextSuggestion(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  return normalizeQuickEntryAiNextSuggestion({
    ...value,
    missingInfo: Array.isArray(value.missingInfo) ? value.missingInfo.slice() : [],
    taskDrafts: Array.isArray(value.taskDrafts)
      ? value.taskDrafts.map((item) => ({ ...item }))
      : []
  })
}

function normalizeQuickEntryProjectMatch(value, projects = []) {
  const payload = value && typeof value === 'object' ? value : {}
  const confidenceText = normalizeText(payload.confidence).toLowerCase()
  const confidence = ['high', 'medium', 'low'].includes(confidenceText)
    ? confidenceText
    : 'low'
  const matchedProjectId = normalizeText(payload.matchedProjectId)
  const candidateIds = Array.isArray(payload.candidateIds)
    ? payload.candidateIds.map((item) => normalizeText(item)).filter(Boolean)
    : []

  let title = '请确认关联项目'
  let badgeText = '请确认项目'
  let badgeClass = ''
  let detail = normalizeText(payload.reason) || '当前内容还不足以稳定识别具体项目，请手动确认。'
  let status = 'needs_confirm'

  if (confidence === 'high' && matchedProjectId) {
    title = 'AI 已匹配项目'
    badgeText = 'AI 已匹配'
    badgeClass = 'is-brand'
    detail = normalizeText(payload.reason) || '当前内容里的客户和项目线索足够明确，已自动完成匹配。'
    status = 'matched'
  } else if (confidence === 'medium' && candidateIds.length) {
    title = 'AI 推荐候选'
    badgeText = 'AI 推荐候选'
    badgeClass = 'is-soft'
    detail = normalizeText(payload.reason) || '当前内容更接近这些候选项目，请点选确认后再保存。'
    status = 'candidates'
  }

  return {
    ...payload,
    ...normalizeQuickEntryAiSourceMeta(payload),
    confidence,
    matchedProjectId,
    candidateIds,
    candidateProjects: candidateIds.map((item) => findQuickEntryProject(projects, item)).filter(Boolean),
    title,
    badgeText,
    badgeClass,
    detail,
    status
  }
}

function buildQuickEntryRestoredVoiceStatusText(options = {}) {
  const hasContent = !!normalizeText(options.followUpContent)
  const hasError = !!normalizeText(options.aiError)
  const hasNextSuggestionError = !!normalizeText(options.aiNextSuggestionError)
  const hasSummary = !!(options.aiSummary && normalizeText(options.aiSummary.summary))
  const hasProjectMatch = !!options.aiProjectMatch
  const hasSelectedProject = !!normalizeText(options.selectedProjectId)

  if (hasError) {
    return '已恢复上次暂存内容，可手动修改、重试理解或重新确认项目'
  }

  if (hasNextSuggestionError && hasSummary && hasSelectedProject) {
    return '已恢复上次暂存内容，可直接保存或重试下一步建议'
  }

  if (hasSummary || hasProjectMatch) {
    return hasSelectedProject
      ? '已恢复上次暂存内容，可继续确认并直接保存'
      : '已恢复上次暂存内容，请先确认项目再保存'
  }

  if (hasContent) {
    return '已恢复上次暂存内容，可继续编辑、补录或确认项目'
  }

  return ''
}

function normalizeQuickEntryFollowUpStage(value = '') {
  const current = normalizeText(value)
  const allowed = ['capture', 'content', 'project', 'review']
  return allowed.includes(current) ? current : ''
}

function buildQuickEntryFollowUpDisplayState(options = {}) {
  const hasContent = !!normalizeText(options.followUpContent)
  const hasVoicePreview = !!normalizeText(options.voicePreviewText)
  const hasAiError = !!normalizeText(options.aiError)
  const hasAiResult = Boolean(options.aiSummary || options.aiProjectMatch || options.aiNextSuggestion)
  const isBusy = !!options.isVoiceRecording || !!options.isVoiceRecognizing || !!options.isAiLoading
  const manualInputEnabled = !!options.manualInputEnabled
  const showDetails = manualInputEnabled || hasContent || hasVoicePreview || hasAiError || hasAiResult
  const selectedProjectId = normalizeText(options.selectedProjectId)
  const requestedStage = normalizeQuickEntryFollowUpStage(options.flowStage || options.stage)
  let stage = 'capture'

  if (showDetails) {
    if (isBusy && !hasContent) {
      stage = 'capture'
    } else if (!hasContent) {
      stage = 'capture'
    } else if (!selectedProjectId) {
      stage = options.aiProjectMatch ? 'project' : 'content'
    } else {
      stage = options.aiSummary || options.aiNextSuggestion ? 'review' : 'project'
    }
  }

  if (requestedStage) {
    if (!hasContent) {
      stage = 'capture'
    } else if (requestedStage === 'review' && !selectedProjectId) {
      stage = 'project'
    } else {
      stage = requestedStage
    }
  }

  const stageMeta = {
    capture: {
      title: '闪录',
      hint: ''
    },
    content: {
      title: '确认内容',
      hint: '先把原话整理好，再交给 AI'
    },
    project: {
      title: '确认项目',
      hint: '确认关联项目后再保存'
    },
    review: {
      title: '保存前确认',
      hint: '项目已确认，可直接保存，也可补充 AI 摘要和下一步任务'
    }
  }[stage] || {
    title: '闪录',
    hint: ''
  }

  return {
    quickEntryManualInputEnabled: manualInputEnabled,
    quickEntryShowFollowUpDetails: showDetails,
    quickEntryFollowUpStage: stage,
    quickEntryFollowUpStageTitle: stageMeta.title,
    quickEntryFollowUpStageHint: stageMeta.hint
  }
}

function buildQuickEntryFollowUpSubmitState(options = {}) {
  const content = normalizeText(options.followUpContent)
  const selectedProjectId = normalizeText(options.selectedProjectId)
  const isVoiceRecording = !!options.isVoiceRecording
  const isVoiceRecognizing = !!options.isVoiceRecognizing
  const isAiLoading = !!options.isAiLoading
  const aiError = normalizeText(options.aiError)
  const actionId = normalizeText(options.actionId)
  const createNextTask = !!options.createNextTask
  const hasAiSummary = !!(options.aiSummary && normalizeText(options.aiSummary.summary))
  const hasAiNextSuggestion = !!options.aiNextSuggestion
  const stage = normalizeText(options.stage)
    || (
      !content
        ? 'capture'
        : (selectedProjectId
            ? ((hasAiSummary || hasAiNextSuggestion) ? 'review' : 'project')
            : (options.aiProjectMatch ? 'project' : 'content'))
    )

  if (actionId === 'follow_up') {
    return {
      quickEntryFollowUpCanSubmit: false,
      quickEntryFollowUpSubmitText: createNextTask ? '保存中...' : '提交中...',
      quickEntryFollowUpSubmitHint: createNextTask ? '正在保存跟进并创建下一步任务。' : '正在保存这条闪录，请稍候。',
      quickEntryFollowUpSubmitIsAiAction: false
    }
  }

  if (isVoiceRecording) {
    return {
      quickEntryFollowUpCanSubmit: false,
      quickEntryFollowUpSubmitText: '先结束录音',
      quickEntryFollowUpSubmitHint: '结束录音后会先转成文字。',
      quickEntryFollowUpSubmitIsAiAction: false
    }
  }

  if (isVoiceRecognizing || isAiLoading) {
    return {
      quickEntryFollowUpCanSubmit: false,
      quickEntryFollowUpSubmitText: stage === 'project' || stage === 'review' ? 'AI整理中...' : '智能处理中...',
      quickEntryFollowUpSubmitHint: '',
      quickEntryFollowUpSubmitIsAiAction: isAiLoading
    }
  }

  if (!content) {
    return {
      quickEntryFollowUpCanSubmit: false,
      quickEntryFollowUpSubmitText: '先录入内容',
      quickEntryFollowUpSubmitHint: '',
      quickEntryFollowUpSubmitIsAiAction: false
    }
  }

  if (stage === 'content') {
    return {
      quickEntryFollowUpCanSubmit: true,
      quickEntryFollowUpSubmitText: '下一步',
      quickEntryFollowUpSubmitHint: '',
      quickEntryFollowUpSubmitIsAiAction: false
    }
  }

  if (stage === 'project') {
    if (!selectedProjectId) {
      return {
        quickEntryFollowUpCanSubmit: false,
        quickEntryFollowUpSubmitText: '先确认项目',
        quickEntryFollowUpSubmitHint: '',
        quickEntryFollowUpSubmitIsAiAction: false
      }
    }

    return {
      quickEntryFollowUpCanSubmit: true,
      quickEntryFollowUpSubmitText: 'AI整理',
      quickEntryFollowUpSubmitHint: '',
      quickEntryFollowUpSubmitIsAiAction: true
    }
  }

  if (!selectedProjectId) {
    return {
      quickEntryFollowUpCanSubmit: false,
      quickEntryFollowUpSubmitText: '先确认项目',
      quickEntryFollowUpSubmitHint: '',
      quickEntryFollowUpSubmitIsAiAction: false
    }
  }

  if (aiError) {
    return {
      quickEntryFollowUpCanSubmit: true,
      quickEntryFollowUpSubmitText: '直接保存',
      quickEntryFollowUpSubmitHint: '',
      quickEntryFollowUpSubmitIsAiAction: false
    }
  }

  return {
    quickEntryFollowUpCanSubmit: true,
    quickEntryFollowUpSubmitText: createNextTask ? '保存并建任务' : '保存本次闪录',
    quickEntryFollowUpSubmitHint: '',
    quickEntryFollowUpSubmitIsAiAction: false
  }
}

function normalizeQuickEntryVoicePhase(value) {
  const current = normalizeText(value)
  const allowed = ['idle', 'recording', 'uploading', 'recognizing', 'understanding', 'done', 'error']
  return allowed.includes(current) ? current : 'idle'
}

function getQuickEntryAiLoadingHint(step = '') {
  const currentStep = normalizeText(step)

  if (currentStep === 'matching') {
    return '正在识别关联项目。'
  }

  if (currentStep === 'summarizing') {
    return '正在整理本次跟进内容。'
  }

  if (currentStep === 'planning') {
    return '正在生成下一步动作。'
  }

  if (currentStep === 'waiting_project') {
    return '请先确认项目，再继续补下一步动作。'
  }

  return 'AI 会整理摘要、匹配项目并生成下一步动作。'
}

function getQuickEntryAiHasExtendedDetails(summary = null, nextSuggestion = null) {
  const currentSummary = summary && typeof summary === 'object' ? summary : null
  const currentNext = nextSuggestion && typeof nextSuggestion === 'object' ? nextSuggestion : null

  const hasSummaryDetails = !!(
    currentSummary
    && (
      (Array.isArray(currentSummary.highlights) && currentSummary.highlights.length)
      || (Array.isArray(currentSummary.risks) && currentSummary.risks.length)
      || currentSummary.showRecommendedStage
    )
  )

  const hasNextDetails = !!(
    currentNext
    && Array.isArray(currentNext.taskDrafts)
    && currentNext.taskDrafts.length
  )

  return hasSummaryDetails || hasNextDetails
}

function getSpeechRecorderManager() {
  if (!wx || typeof wx.getRecorderManager !== 'function') {
    return null
  }

  return wx.getRecorderManager()
}

function getVoiceFileExtension(filePath = '') {
  const matched = /\.([^.\\/]+)$/.exec(String(filePath || '').trim().toLowerCase())
  const extension = matched ? matched[1] : 'mp3'
  if (['mp3', 'm4a', 'wav', 'aac', 'amr'].includes(extension)) {
    return extension
  }

  return 'mp3'
}

function buildDefaultNextTaskDraft() {
  const base = new Date()
  base.setDate(base.getDate() + 1)
  base.setHours(10, 0, 0, 0)

  return {
    dueDate: formatDateInput(base),
    dueTime: formatTimeInput(base)
  }
}

function parseQuickEntryDateTime(dateValue = '', timeValue = '') {
  const dueDate = normalizeText(dateValue)
  const dueTime = normalizeText(timeValue)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !/^\d{2}:\d{2}$/.test(dueTime)) {
    return null
  }

  const parsed = new Date(`${dueDate}T${dueTime}:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatQuickEntryTaskTimeLabel(dueDate = '', dueTime = '') {
  const parsed = parseQuickEntryDateTime(dueDate, dueTime)
  if (parsed) {
    return formatAiGeneratedTime(parsed)
  }

  return [normalizeText(dueDate), normalizeText(dueTime)].filter(Boolean).join(' ')
}

function buildQuickEntryTaskTimeOption(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null
  }

  const dueDate = formatDateInput(date)
  const dueTime = formatTimeInput(date)
  return {
    id: `${dueDate} ${dueTime}`,
    dueDate,
    dueTime,
    label: formatQuickEntryTaskTimeLabel(dueDate, dueTime)
  }
}

function buildQuickEntryNextTaskDraft(partial = {}) {
  const fallback = buildDefaultNextTaskDraft()
  const type = normalizeText(partial.type) || 'other'
  return {
    title: normalizeText(partial.title),
    type,
    typeLabel: getTaskTypeLabel(type),
    priority: normalizeText(partial.priority) || 'normal',
    dueDate: normalizeText(partial.dueDate) || fallback.dueDate,
    dueTime: normalizeText(partial.dueTime) || fallback.dueTime,
    description: normalizeText(partial.description)
  }
}

function buildQuickEntryTaskTimeOptions(suggestion = null) {
  const suggestionDraft = buildQuickEntrySuggestedTaskDraft(suggestion)
  const defaultDraft = buildDefaultNextTaskDraft()
  const baseDate = parseQuickEntryDateTime(suggestionDraft.dueDate, suggestionDraft.dueTime)
  const seed = baseDate || parseQuickEntryDateTime(defaultDraft.dueDate, defaultDraft.dueTime)
  const options = []
  const seen = new Set()

  const pushOption = (date) => {
    const option = buildQuickEntryTaskTimeOption(date)
    if (!option || seen.has(option.id)) {
      return
    }
    seen.add(option.id)
    options.push(option)
  }

  if (seed) {
    pushOption(seed)

    const sameDayMorning = new Date(seed)
    sameDayMorning.setHours(10, 0, 0, 0)
    pushOption(sameDayMorning)

    const sameDayAfternoon = new Date(seed)
    sameDayAfternoon.setHours(15, 30, 0, 0)
    pushOption(sameDayAfternoon)

    const nextDayMorning = new Date(seed)
    nextDayMorning.setDate(nextDayMorning.getDate() + 1)
    nextDayMorning.setHours(9, 30, 0, 0)
    pushOption(nextDayMorning)

    const nextDayAfternoon = new Date(seed)
    nextDayAfternoon.setDate(nextDayAfternoon.getDate() + 1)
    nextDayAfternoon.setHours(15, 30, 0, 0)
    pushOption(nextDayAfternoon)

    const thirdDayMorning = new Date(seed)
    thirdDayMorning.setDate(thirdDayMorning.getDate() + 2)
    thirdDayMorning.setHours(10, 0, 0, 0)
    pushOption(thirdDayMorning)
  }

  return options.slice(0, 3)
}

function buildQuickEntrySuggestedTaskDraft(suggestion = null) {
  const currentSuggestion = suggestion && typeof suggestion === 'object' ? suggestion : null
  const sourceTask = currentSuggestion && Array.isArray(currentSuggestion.taskDrafts) && currentSuggestion.taskDrafts.length
    ? currentSuggestion.taskDrafts[0]
    : null
  return buildQuickEntryNextTaskDraft({
    title: normalizeText(sourceTask && sourceTask.title) || normalizeText(currentSuggestion && currentSuggestion.nextAction),
    type: normalizeText(sourceTask && sourceTask.type) || 'other',
    priority: normalizeText(sourceTask && sourceTask.priority) || 'normal',
    dueDate: normalizeText(currentSuggestion && currentSuggestion.recommendedDate) || normalizeText(sourceTask && sourceTask.dueDate),
    dueTime: normalizeText(currentSuggestion && currentSuggestion.recommendedTime) || normalizeText(sourceTask && sourceTask.dueTime),
    description: ''
  })
}

function cloneQuickEntryNextTaskDraft(value) {
  if (!value || typeof value !== 'object') {
    return buildQuickEntryNextTaskDraft()
  }

  return buildQuickEntryNextTaskDraft({
    title: value.title,
    type: value.type,
    priority: value.priority,
    dueDate: value.dueDate,
    dueTime: value.dueTime,
    description: value.description
  })
}

function buildQuickEntryTaskDraftState(options = {}) {
  const nextSuggestion = options.nextSuggestion && typeof options.nextSuggestion === 'object'
    ? options.nextSuggestion
    : null
  const titleTouched = !!options.titleTouched
  const timeTouched = !!options.timeTouched
  const selectedTimeSelection = normalizeText(options.selectedTimeSelection)
  const suggestedTaskDraft = nextSuggestion
    ? buildQuickEntrySuggestedTaskDraft(nextSuggestion)
    : buildQuickEntryNextTaskDraft()
  const sourceTaskDraft = cloneQuickEntryNextTaskDraft(
    options.nextTaskDraft || (
      nextSuggestion
        ? suggestedTaskDraft
        : buildQuickEntryNextTaskDraft()
    )
  )
  const nextTaskDraft = buildQuickEntryNextTaskDraft({
    ...sourceTaskDraft,
    title: titleTouched ? sourceTaskDraft.title : suggestedTaskDraft.title,
    dueDate: timeTouched ? sourceTaskDraft.dueDate : suggestedTaskDraft.dueDate,
    dueTime: timeTouched ? sourceTaskDraft.dueTime : suggestedTaskDraft.dueTime,
    description: ''
  })
  const timeOptions = nextSuggestion ? buildQuickEntryTaskTimeOptions(nextSuggestion) : []
  const selectedOption = timeOptions.find((item) => item.dueDate === nextTaskDraft.dueDate && item.dueTime === nextTaskDraft.dueTime)
  const useCustomSelection = !!nextSuggestion && (
    selectedTimeSelection === 'custom'
    || !selectedOption
  )

  return {
    quickEntryNextTaskDraft: nextTaskDraft,
    quickEntryNextTaskTitleTouched: titleTouched,
    quickEntryNextTaskTimeTouched: timeTouched,
    quickEntryNextTaskTimeOptions: timeOptions,
    quickEntryNextTaskTimeSelection: nextSuggestion
      ? (useCustomSelection ? 'custom' : selectedOption.id)
      : '',
    quickEntryNextTaskUseCustomTime: useCustomSelection,
    quickEntryNextTaskSelectedTimeLabel: nextTaskDraft.dueDate && nextTaskDraft.dueTime
      ? formatQuickEntryTaskTimeLabel(nextTaskDraft.dueDate, nextTaskDraft.dueTime)
      : '',
    quickEntryTaskDraftCanCreate: !!(
      nextSuggestion
      && normalizeText(nextTaskDraft.title)
      && normalizeText(nextTaskDraft.dueDate)
      && normalizeText(nextTaskDraft.dueTime)
    )
  }
}

function buildQuickEntryForm() {
  const now = new Date()
  const next = new Date(now)
  next.setDate(next.getDate() + 1)
  next.setHours(10, 0, 0, 0)

  return {
    projectName: '',
    clientName: '',
    stage: '线索',
    followUpContent: '',
    followUpDate: formatDateInput(now),
    followUpClock: formatTimeInput(now),
    followUpMethod: '其他',
    taskContext: '',
    taskTitle: '',
    taskType: 'callback',
    taskDueDate: formatDateInput(next),
    taskDueTime: formatTimeInput(next),
    taskDescription: ''
  }
}

function cloneQuickEntryForm(form = {}) {
  return Object.assign(buildQuickEntryForm(), form || {})
}

function buildQuickEntryEmptyState(mode, projects = []) {
  const form = buildQuickEntryForm()
  const projectViews = buildQuickEntryProjectViews(
    projects,
    '',
    '',
    [],
    getQuickEntryRecommendationText(mode, form)
  )
  const followUpDisplayState = buildQuickEntryFollowUpDisplayState({
    followUpContent: form.followUpContent
  })
  const followUpSubmitState = buildQuickEntryFollowUpSubmitState({
    followUpContent: form.followUpContent,
    createNextTask: false
  })
  const taskDraftState = buildQuickEntryTaskDraftState()
  return {
    quickEntryMode: mode,
    quickEntryModeTitle: getQuickEntryModeMeta(mode).label,
    quickEntryModeDesc: getQuickEntryModeMeta(mode).desc,
    quickEntryShowProjectSearch: false,
    quickEntryProjectKeyword: '',
    quickEntrySuggestedProjects: projectViews.suggestedProjects,
    quickEntryVisibleProjects: projectViews.visibleProjects,
    quickEntryProjectSelectionMode: '',
    quickEntrySelectedProjectId: '',
    quickEntrySelectedProjectName: '未关联项目',
    quickEntrySelectedProjectMeta: null,
    quickEntryForm: form,
    isQuickEntryVoiceRecording: false,
    isQuickEntryVoiceRecognizing: false,
    quickEntryVoiceElapsedText: '',
    quickEntryVoicePhase: 'idle',
    quickEntryShowVoiceExampleHint: false,
    quickEntryVoiceStatusText: '',
    quickEntryAiLoadingHint: getQuickEntryAiLoadingHint(),
    quickEntryVoicePreviewText: '',
    isQuickEntryAiLoading: false,
    quickEntryAiError: '',
    quickEntryAiProjectMatch: null,
    quickEntryAiProjectCandidateIds: [],
    quickEntryAiSummary: null,
    quickEntryAiSummaryDraft: null,
    quickEntryAiNextSuggestion: null,
    quickEntryAiNextSuggestionDraft: null,
    quickEntryAiNextSuggestionError: '',
    quickEntryAiHasExtendedDetails: false,
    quickEntryAiShowFullResult: false,
    quickEntryEditingAiSummary: false,
    quickEntryEditingAiNextSuggestion: false,
    quickEntryShowReviewSettings: false,
    quickEntryFollowUpMethodTouched: false,
    quickEntryFollowUpDateTouched: false,
    quickEntryFollowUpClockTouched: false,
    quickEntryCreateNextTask: false,
    quickEntryFollowUpPendingAction: '',
    quickEntryFollowUpStage: 'capture',
    quickEntryFollowUpStageTitle: '闪录',
    quickEntryFollowUpStageHint: '先把这次情况记下来',
    ...taskDraftState,
    ...followUpDisplayState,
    ...followUpSubmitState
  }
}

function buildQuickEntrySuccessState(payload = {}) {
  const mode = normalizeText(payload.mode) || 'follow_up'
  const projectId = normalizeText(payload.projectId)
  const continueProjectId = normalizeText(payload.continueProjectId)
  let primaryActionText = normalizeText(payload.primaryActionText)
  let projectActionText = normalizeText(payload.projectActionText)
  let continueHint = normalizeText(payload.continueHint)

  if (!primaryActionText) {
    if (mode === 'project') {
      primaryActionText = '继续录跟进'
    } else if (mode === 'task' && continueProjectId) {
      primaryActionText = '继续补同项目'
    } else {
      primaryActionText = '继续录下一条'
    }
  }

  if (!projectActionText && projectId) {
    projectActionText = mode === 'project' ? '查看这个项目' : '查看关联项目'
  }

  if (!continueHint) {
    if (mode === 'task' && continueProjectId) {
      continueHint = '下一条仍可继续补到这个项目'
    }
  }

  return {
    visible: !!payload.visible,
    mode,
    title: normalizeText(payload.title) || '已保存',
    detail: normalizeText(payload.detail),
    projectId,
    projectName: normalizeText(payload.projectName),
    continueProjectId,
    primaryActionText,
    projectActionText,
    continueHint
  }
}

function normalizeProjectOption(item, index) {
  const name = normalizeText(item && item.name) || '未命名项目'
  const client = normalizeText(item && item.client) || '未填写客户'
  const voiceAliases = getQuickEntryProjectConfiguredAliases(item)
  const stage = normalizeText(item && item.stage) || '线索'
  const latestSummary = normalizeText(item && item.latestSummary)
  const focusText = normalizeText(item && item.focusText)
  const nextText = normalizeText(item && item.next)
  const contactNames = Array.isArray(item && item.contactNames) ? item.contactNames : []
  const contactText = contactNames.length ? contactNames.join(' / ') : ''
  const normalizedProject = {
    id: normalizeText(item && item.id) || `project-${index}`,
    name,
    client,
    voiceAliases,
    stage,
    latestSummary,
    focusText,
    nextText,
    contactText
  }
  const configuredAliasTokens = buildQuickEntryConfiguredAliasTokens(normalizedProject)
  const autoAliasTokens = buildQuickEntryProjectSeedAliasTokens(normalizedProject)

  return {
    ...normalizedProject,
    configuredAliasTokens,
    autoAliasTokens,
    searchText: [
      name,
      client,
      voiceAliases.join(' '),
      stage,
      latestSummary,
      focusText,
      nextText,
      contactText
    ].concat(configuredAliasTokens, autoAliasTokens).join(' ').toLowerCase()
  }
}

function filterQuickEntryProjects(projects, keyword) {
  const list = Array.isArray(projects) ? projects : []
  const currentKeyword = normalizeText(keyword).toLowerCase()

  if (!currentKeyword) {
    return list.slice(0, 8)
  }

  return list.filter((item) => item.searchText.includes(currentKeyword)).slice(0, 8)
}

function moveQuickEntryProjectToFront(projects, projectId) {
  const list = Array.isArray(projects) ? projects.slice() : []
  const currentId = normalizeText(projectId)
  if (!currentId) {
    return list
  }

  const targetIndex = list.findIndex((item) => item.id === currentId)
  if (targetIndex <= 0) {
    return list
  }

  const target = list[targetIndex]
  list.splice(targetIndex, 1)
  list.unshift(target)
  return list
}

function attachQuickEntryProjectUiMeta(projects, suggestedProjectIds = []) {
  const list = Array.isArray(projects) ? projects : []
  const candidateIds = Array.isArray(suggestedProjectIds) ? suggestedProjectIds : []
  const candidateRankMap = new Map()

  candidateIds.forEach((item, index) => {
    const currentId = normalizeText(item)
    if (currentId && !candidateRankMap.has(currentId)) {
      candidateRankMap.set(currentId, index + 1)
    }
  })

  return list.map((item) => {
    const candidateRank = candidateRankMap.get(item.id) || 0
    return {
      ...item,
      aiCandidateRank: candidateRank,
      isAiCandidate: candidateRank > 0,
      isAiTopCandidate: candidateRank === 1
    }
  })
}

function buildQuickEntryProjectMatchInsight(project, text) {
  const currentText = normalizeText(text).toLowerCase()
  if (!project || !currentText || currentText.length < 2) {
    return {
      matchReasonTexts: [],
      matchDebugText: ''
    }
  }

  const queryTokens = buildQuickEntryMatchTokens(currentText)
  const queryHomophoneText = normalizeHomophoneText(currentText)
  const seen = new Set()
  const reasons = []
  const pushReason = (priority, text) => {
    const current = normalizeText(text)
    if (!current || seen.has(current)) {
      return
    }

    seen.add(current)
    reasons.push({
      priority,
      text: current
    })
  }

  const fieldMetas = [
    { value: project.name, label: '项目名' },
    { value: project.client, label: '客户名' },
    { value: project.contactText, label: '联系人' }
  ]

  fieldMetas.forEach(({ value, label }) => {
    const fieldText = normalizeText(value).toLowerCase()
    if (!fieldText) {
      return
    }

    if (currentText.includes(fieldText)) {
      pushReason(120, `命中${label}`)
      return
    }

    const fieldHomophoneText = normalizeHomophoneText(fieldText)
    if (fieldHomophoneText && queryHomophoneText.includes(fieldHomophoneText)) {
      pushReason(96, `${label}同音接近`)
      return
    }

    const fieldTokens = buildQuickEntryMatchTokens(fieldText)
    let matchedFuzzyToken = ''

    fieldTokens.forEach((fieldToken) => {
      if (currentText.includes(fieldToken)) {
        pushReason(90, `${label}片段命中`)
        return
      }

      if (matchedFuzzyToken) {
        return
      }

      queryTokens.forEach((queryToken) => {
        if (matchedFuzzyToken) {
          return
        }

        if (getQuickEntryFuzzyTokenScore(queryToken, fieldToken) >= 8) {
          matchedFuzzyToken = fieldToken
        }
      })
    })

    if (matchedFuzzyToken) {
      pushReason(72, `${label}近似匹配`)
    }
  })

  const configuredAliases = getQuickEntryProjectConfiguredAliases(project)
  configuredAliases.forEach((alias) => {
    const currentAlias = normalizeQuickEntryAliasToken(alias)
    if (!currentAlias) {
      return
    }

    if (currentText.includes(currentAlias)) {
      pushReason(118, `命中项目线索 ${alias}`)
      return
    }

    if (queryHomophoneText.includes(normalizeHomophoneText(currentAlias))) {
      pushReason(94, `项目线索同音 ${alias}`)
      return
    }

    let matched = false
    queryTokens.forEach((queryToken) => {
      if (matched) {
        return
      }

      if (getQuickEntryFuzzyTokenScore(queryToken, currentAlias) >= 8) {
        matched = true
      }
    })

    if (matched) {
      pushReason(86, `项目线索近似 ${alias}`)
    }
  })

  const manualAliasTokens = getQuickEntryProjectAliasTokens(project.id)
  manualAliasTokens.forEach((aliasToken) => {
    const currentAlias = normalizeQuickEntryAliasToken(aliasToken)
    if (!currentAlias) {
      return
    }

    if (currentText.includes(currentAlias)) {
      pushReason(116, `命中项目记忆 ${aliasToken}`)
      return
    }

    let matched = false
    queryTokens.forEach((queryToken) => {
      if (matched) {
        return
      }

      if (getQuickEntryFuzzyTokenScore(queryToken, currentAlias) >= 8) {
        matched = true
      }
    })

    if (matched) {
      pushReason(82, `项目记忆近似 ${aliasToken}`)
    }
  })

  const autoAliasTokens = Array.isArray(project.autoAliasTokens) ? project.autoAliasTokens : []
  autoAliasTokens.forEach((aliasToken) => {
    const currentAlias = normalizeQuickEntryAliasToken(aliasToken)
    if (!currentAlias) {
      return
    }

    if (currentText.includes(currentAlias)) {
      pushReason(74, `命中自动同音 ${aliasToken}`)
      return
    }

    if (queryHomophoneText.includes(normalizeHomophoneText(currentAlias))) {
      pushReason(68, `自动同音接近 ${aliasToken}`)
    }
  })

  const reasonTexts = reasons
    .sort((left, right) => right.priority - left.priority)
    .map((item) => item.text)
    .slice(0, 3)

  return {
    matchReasonTexts: reasonTexts,
    matchDebugText: reasonTexts.length ? `命中说明：${reasonTexts.join(' · ')}` : ''
  }
}

function attachQuickEntryProjectMatchInsight(projects, recommendationText = '') {
  const currentText = normalizeText(recommendationText)
  if (!currentText) {
    return Array.isArray(projects) ? projects.slice() : []
  }

  return (Array.isArray(projects) ? projects : []).map((item) => ({
    ...item,
    ...buildQuickEntryProjectMatchInsight(item, currentText)
  }))
}

function buildQuickEntryVisibleProjects(projects, keyword, preferredProjectId = '', suggestedProjectIds = [], recommendationText = '') {
  const filteredProjects = filterQuickEntryProjects(projects, keyword)
  const projectsWithInsight = attachQuickEntryProjectMatchInsight(filteredProjects, recommendationText)
  const projectsWithUiMeta = attachQuickEntryProjectUiMeta(projectsWithInsight, suggestedProjectIds)
  const selectedProjectId = normalizeText(preferredProjectId)

  return projectsWithUiMeta
    .map((item, index) => ({
      ...item,
      _originalIndex: index
    }))
    .sort((left, right) => {
      const leftSelected = selectedProjectId && left.id === selectedProjectId ? 1 : 0
      const rightSelected = selectedProjectId && right.id === selectedProjectId ? 1 : 0
      if (leftSelected !== rightSelected) {
        return rightSelected - leftSelected
      }

      const leftRank = left.aiCandidateRank || 0
      const rightRank = right.aiCandidateRank || 0
      if (leftRank && rightRank && leftRank !== rightRank) {
        return leftRank - rightRank
      }
      if (leftRank && !rightRank) {
        return -1
      }
      if (!leftRank && rightRank) {
        return 1
      }

      return left._originalIndex - right._originalIndex
    })
    .map(({ _originalIndex, ...item }) => item)
}

function buildQuickEntrySuggestedProjects(projects, preferredProjectId = '', suggestedProjectIds = [], recommendationText = '') {
  const baseList = moveQuickEntryProjectToFront(projects, preferredProjectId)
  const candidateIds = Array.isArray(suggestedProjectIds) ? suggestedProjectIds : []
  const candidateProjects = candidateIds
    .map((item) => findQuickEntryProject(baseList, item))
    .filter(Boolean)

  if (candidateProjects.length) {
    return attachQuickEntryProjectUiMeta(
      attachQuickEntryProjectMatchInsight(
        moveQuickEntryProjectToFront(candidateProjects, preferredProjectId).slice(0, 4),
        recommendationText
      ),
      candidateIds
    )
  }

  return attachQuickEntryProjectUiMeta(
    attachQuickEntryProjectMatchInsight(baseList.slice(0, 4), recommendationText),
    []
  )
}

function buildQuickEntryProjectViews(projects, keyword, preferredProjectId = '', suggestedProjectIds = [], recommendationText = '') {
  const list = moveQuickEntryProjectToFront(projects, preferredProjectId)
  return {
    suggestedProjects: buildQuickEntrySuggestedProjects(list, preferredProjectId, suggestedProjectIds, recommendationText),
    visibleProjects: buildQuickEntryVisibleProjects(list, keyword, preferredProjectId, suggestedProjectIds, recommendationText)
  }
}

function findQuickEntryProject(projects, projectId) {
  const list = Array.isArray(projects) ? projects : []
  const currentId = normalizeText(projectId)
  if (!currentId) {
    return null
  }

  return list.find((item) => item.id === currentId) || null
}

function getQuickEntryProjectLabel(projectMeta) {
  return projectMeta && projectMeta.name ? projectMeta.name : '未关联项目'
}

function replaceAllText(source, searchValue, replaceValue) {
  return String(source || '').split(searchValue).join(replaceValue)
}

function buildQuickEntryCoreText(value) {
  let current = normalizeText(value).toLowerCase()
  if (!current) {
    return ''
  }

  QUICK_ENTRY_PROJECT_STOP_WORDS.forEach((word) => {
    current = replaceAllText(current, word, ' ')
  })

  return current.replace(/\s+/g, ' ').trim()
}

function buildQuickEntryCompactToken(value) {
  const compact = String(value || '')
    .toLowerCase()
    .replace(/[\s,，。；;、\/\-()（）【】\[\]|·:：]+/g, '')
    .trim()

  return compact.length >= 2 ? compact : ''
}

function buildQuickEntryLatinInitialToken(value) {
  const parts = String(value || '').toLowerCase().match(/[a-z0-9]+/g) || []
  if (parts.length < 2 || parts.length > 8) {
    return ''
  }

  const joined = parts.join('')
  if (joined.length < 4) {
    return ''
  }

  const initials = parts.map((item) => item.slice(0, 1)).join('')
  return initials.length >= 2 ? initials : ''
}

function buildQuickEntryMatchTokens(value) {
  const raw = normalizeText(value).toLowerCase()
  const core = buildQuickEntryCoreText(raw)
  const compact = buildQuickEntryCompactToken(raw)
  const latinInitials = buildQuickEntryLatinInitialToken(raw)
  const chineseNgrams = buildChineseNgramTokens(raw)
  const segments = `${raw} ${core}`
    .split(/[\s,，。；;、\/\-()（）【】\[\]|·:：]+/)
    .map((item) => item.trim())
    .filter((item) => item && item.length >= 2)

  const seen = new Set()
  const result = []

  ;[raw, core, compact, latinInitials].concat(chineseNgrams, segments).forEach((item) => {
    const current = normalizeText(item)
    if (!current || current.length < 2 || seen.has(current)) {
      return
    }
    seen.add(current)
    result.push(current)
  })

  return result.slice(0, QUICK_ENTRY_MATCH_TOKEN_LIMIT)
}

function getQuickEntryRecommendationText(mode, form = {}) {
  if (mode === 'task') {
    return [
      normalizeText(form.taskTitle),
      normalizeText(form.taskContext),
      normalizeText(form.taskDescription)
    ].filter(Boolean).join(' ')
  }

  if (mode === 'follow_up') {
    return normalizeText(form.followUpContent)
  }

  return ''
}

function buildQuickEntryAliasTokensFromContent(content, projectMeta = null) {
  const currentProject = projectMeta && typeof projectMeta === 'object' ? projectMeta : null
  const configuredAliasTokens = currentProject ? buildQuickEntryConfiguredAliasTokens(currentProject) : []
  const projectTokens = currentProject
    ? buildQuickEntryMatchTokens([
        normalizeText(currentProject.name),
        normalizeText(currentProject.client),
        normalizeText(currentProject.contactText)
      ].filter(Boolean).join(' ')).concat(configuredAliasTokens)
    : []

  if (!projectTokens.length) {
    return []
  }

  const seen = new Set(projectTokens.map((item) => normalizeQuickEntryAliasToken(item)))
  const result = []
  buildQuickEntryMatchTokens(content).forEach((token) => {
    const currentToken = normalizeQuickEntryAliasToken(token)
    if (!currentToken || currentToken.length < 2 || currentToken.length > 8 || seen.has(currentToken)) {
      return
    }

    const isSimilar = projectTokens.some((projectToken) => {
      return normalizeHomophoneText(currentToken) === normalizeHomophoneText(projectToken)
        || getQuickEntryFuzzyTokenScore(currentToken, projectToken) >= 8
    })

    if (!isSimilar) {
      return
    }

    seen.add(currentToken)
    result.push(currentToken)
  })

  return result.slice(0, 5)
}

function buildQuickEntryManualCorrectionAliasTokensFromContent(content, projectMeta = null) {
  const currentProject = projectMeta && typeof projectMeta === 'object' ? projectMeta : null
  const configuredAliasTokens = currentProject ? buildQuickEntryConfiguredAliasTokens(currentProject) : []
  const projectTokens = currentProject
    ? buildQuickEntryMatchTokens([
        normalizeText(currentProject.name),
        normalizeText(currentProject.client),
        normalizeText(currentProject.contactText)
      ].filter(Boolean).join(' ')).concat(configuredAliasTokens)
    : []

  if (!projectTokens.length) {
    return []
  }

  const projectTokenSet = new Set(projectTokens.map((item) => normalizeQuickEntryAliasToken(item)))
  const candidateSeen = new Set()
  const candidateTokens = []
  const pushCandidate = (value) => {
    const currentToken = normalizeQuickEntryAliasToken(value)
    if (
      !currentToken
      || currentToken.length < 3
      || currentToken.length > 16
      || !isValidQuickEntryAliasText(currentToken)
      || candidateSeen.has(currentToken)
    ) {
      return
    }

    candidateSeen.add(currentToken)
    candidateTokens.push(currentToken)
  }

  extractChineseSegments(content).forEach((segment) => {
    buildChineseNgramTokens(segment, 3, 10, 18).forEach((token) => {
      pushCandidate(token)
    })
  })

  buildQuickEntryMatchTokens(content).forEach((token) => {
    pushCandidate(token)
  })

  return candidateTokens.filter((token) => {
    if (projectTokenSet.has(token)) {
      return false
    }

    return projectTokens.some((projectToken) => {
      const currentProjectToken = normalizeQuickEntryAliasToken(projectToken)
      if (!currentProjectToken || currentProjectToken === token) {
        return false
      }

      return normalizeHomophoneText(token) === normalizeHomophoneText(currentProjectToken)
        || (token.length >= 3 && currentProjectToken.includes(token))
        || (currentProjectToken.length >= 3 && token.includes(currentProjectToken))
        || getQuickEntryFuzzyTokenScore(token, currentProjectToken) >= 8
    })
  }).slice(0, 6)
}

function buildQuickEntryHomophoneVariantTokens(value, limit = QUICK_ENTRY_AUTO_ALIAS_PER_PROJECT_LIMIT) {
  const baseTokens = buildQuickEntryMatchTokens(value)
    .filter((item) => /[\u4e00-\u9fa5]/.test(item) && item.length >= 3 && item.length <= 8)
  const seen = new Set(baseTokens.map((item) => normalizeQuickEntryAliasToken(item)))
  const result = []

  for (let tokenIndex = 0; tokenIndex < baseTokens.length; tokenIndex += 1) {
    const token = baseTokens[tokenIndex]
    const chars = token.split('')
    for (let charIndex = 0; charIndex < chars.length; charIndex += 1) {
      const alternatives = QUICK_ENTRY_HOMOPHONE_ALTERNATIVES_MAP[chars[charIndex]] || []
      for (let altIndex = 0; altIndex < alternatives.length; altIndex += 1) {
        const nextChars = chars.slice()
        nextChars[charIndex] = alternatives[altIndex]
        const variant = normalizeQuickEntryAliasToken(nextChars.join(''))
        if (!variant || seen.has(variant)) {
          continue
        }

        seen.add(variant)
        result.push(variant)
        if (result.length >= limit) {
          return result
        }
      }
    }
  }

  return result
}

function buildQuickEntryProjectSeedAliasTokens(projectMeta = null) {
  const currentProject = projectMeta && typeof projectMeta === 'object' ? projectMeta : null
  if (!currentProject) {
    return []
  }

  const sourceTexts = [
    normalizeText(currentProject.name),
    normalizeText(currentProject.client)
  ].filter(Boolean)
  getQuickEntryProjectConfiguredAliases(currentProject).forEach((alias) => {
    if (sourceTexts.indexOf(alias) < 0) {
      sourceTexts.push(alias)
    }
  })
  const directTokens = buildQuickEntryMatchTokens(sourceTexts.join(' '))
  const seen = new Set(directTokens.map((item) => normalizeQuickEntryAliasToken(item)))
  const result = []

  sourceTexts.forEach((text) => {
    buildQuickEntryHomophoneVariantTokens(text).forEach((token) => {
      const currentToken = normalizeQuickEntryAliasToken(token)
      if (!currentToken || currentToken.length < 3 || seen.has(currentToken)) {
        return
      }

      seen.add(currentToken)
      result.push(currentToken)
    })
  })

  return result.slice(0, QUICK_ENTRY_AUTO_ALIAS_PER_PROJECT_LIMIT)
}

function scoreQuickEntryProject(project, text) {
  const currentText = normalizeText(text).toLowerCase()
  if (!project || !currentText || currentText.length < 2) {
    return 0
  }

  const queryTokens = buildQuickEntryMatchTokens(currentText)
  const queryHomophoneText = normalizeHomophoneText(currentText)
  const aliasTokens = getQuickEntryProjectAliasTokens(project.id)
  const configuredAliasTokens = Array.isArray(project.configuredAliasTokens) ? project.configuredAliasTokens : []
  const autoAliasTokens = Array.isArray(project.autoAliasTokens) ? project.autoAliasTokens : []

  const matchFields = [
    { value: project.name, exact: 18, token: 8 },
    { value: project.client, exact: 14, token: 6 },
    { value: project.contactText, exact: 12, token: 5 }
  ]

  let score = 0

  matchFields.forEach(({ value, exact, token }) => {
    const fieldText = normalizeText(value).toLowerCase()
    if (!fieldText) {
      return
    }

    if (currentText.includes(fieldText)) {
      score += exact
    }

    const homophoneFieldText = normalizeHomophoneText(fieldText)
    if (queryHomophoneText && homophoneFieldText && queryHomophoneText.includes(homophoneFieldText)) {
      score += token + 5
    }

    const coreText = buildQuickEntryCoreText(fieldText)
    if (coreText && coreText !== fieldText && currentText.includes(coreText)) {
      score += token + 3
    }

    const fieldTokens = buildQuickEntryMatchTokens(fieldText)
    fieldTokens.forEach((matchToken) => {
      if (currentText.includes(matchToken)) {
        score += token + Math.min(Math.max(matchToken.length - 2, 0), 3)
      }

      const homophoneMatchToken = normalizeHomophoneText(matchToken)
      if (homophoneMatchToken && queryHomophoneText.includes(homophoneMatchToken)) {
        score += token + 4
      }
    })

    queryTokens.forEach((queryToken) => {
      fieldTokens.forEach((fieldToken) => {
        score += getQuickEntryFuzzyTokenScore(queryToken, fieldToken)
      })
    })
  })

  if (aliasTokens.length) {
    aliasTokens.forEach((aliasToken) => {
      const currentAlias = normalizeQuickEntryAliasToken(aliasToken)
      if (!currentAlias) {
        return
      }

      if (currentText.includes(currentAlias)) {
        score += 24
      } else {
        queryTokens.forEach((queryToken) => {
          const fuzzyAliasScore = getQuickEntryFuzzyTokenScore(queryToken, currentAlias)
          if (fuzzyAliasScore) {
            score += fuzzyAliasScore + 10
          }
        })
      }
    })
  }

  if (configuredAliasTokens.length) {
    configuredAliasTokens.forEach((aliasToken) => {
      const currentAlias = normalizeQuickEntryAliasToken(aliasToken)
      if (!currentAlias) {
        return
      }

      if (currentText.includes(currentAlias)) {
        score += 20
      } else {
        queryTokens.forEach((queryToken) => {
          const fuzzyAliasScore = getQuickEntryFuzzyTokenScore(queryToken, currentAlias)
          if (fuzzyAliasScore >= 8) {
            score += fuzzyAliasScore + 8
          }
        })
      }
    })
  }

  if (autoAliasTokens.length) {
    autoAliasTokens.forEach((aliasToken) => {
      const currentAlias = normalizeQuickEntryAliasToken(aliasToken)
      if (!currentAlias) {
        return
      }

      if (currentText.includes(currentAlias)) {
        score += 11
      } else {
        queryTokens.forEach((queryToken) => {
          const fuzzyAliasScore = getQuickEntryFuzzyTokenScore(queryToken, currentAlias)
          if (fuzzyAliasScore >= 8) {
            score += fuzzyAliasScore + 3
          }
        })
      }
    })
  }

  return score
}

function findQuickEntryRecommendedProject(projects, text) {
  const list = Array.isArray(projects) ? projects : []
  const recommendationText = normalizeText(text)
  if (!recommendationText || recommendationText.length < 2) {
    return null
  }

  const rankedProjects = list
    .map((item) => ({
      project: item,
      score: scoreQuickEntryProject(item, recommendationText)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)

  if (!rankedProjects.length) {
    return null
  }

  const bestMatch = rankedProjects[0]
  const secondMatch = rankedProjects[1]
  if (bestMatch.score < 12) {
    return null
  }

  if (secondMatch && bestMatch.score - secondMatch.score < 4) {
    return null
  }

  return bestMatch.project
}

function buildQuickEntryProjectResolutionCandidates(projects, text) {
  const list = Array.isArray(projects) ? projects : []
  const recommendationText = normalizeText(text)
  if (!recommendationText || recommendationText.length < 2) {
    return []
  }

  return list
    .map((item) => ({
      project: item,
      localScore: scoreQuickEntryProject(item, recommendationText),
      localInsight: buildQuickEntryProjectMatchInsight(item, recommendationText)
    }))
    .filter((item) => item.localScore > 0)
    .sort((left, right) => right.localScore - left.localScore)
    .slice(0, QUICK_ENTRY_CANDIDATE_LIMIT)
    .map((item) => ({
      id: item.project.id,
      name: item.project.name,
      client: item.project.client,
      voiceAliases: Array.isArray(item.project.voiceAliases) ? item.project.voiceAliases : [],
      stage: item.project.stage,
      latestSummary: item.project.latestSummary,
      focusText: item.project.focusText,
      nextText: item.project.nextText,
      contactText: item.project.contactText,
      localMatchText: item.localInsight && item.localInsight.matchDebugText ? item.localInsight.matchDebugText : '',
      localMatchReasons: item.localInsight && Array.isArray(item.localInsight.matchReasonTexts)
        ? item.localInsight.matchReasonTexts
        : [],
      localScore: item.localScore
    }))
}

function shouldPersistQuickEntryDraft(mode, form = {}, selectedProjectId = '') {
  const currentForm = form || {}
  const currentProjectId = normalizeText(selectedProjectId)

  if (mode === 'project') {
    return !!(normalizeText(currentForm.projectName) || normalizeText(currentForm.clientName))
  }

  if (mode === 'task') {
    return !!(
      normalizeText(currentForm.taskTitle) ||
      normalizeText(currentForm.taskContext) ||
      normalizeText(currentForm.taskDescription) ||
      currentProjectId
    )
  }

  return !!(normalizeText(currentForm.followUpContent) || currentProjectId)
}

function getQuickEntryModeMeta(modeKey) {
  return QUICK_ENTRY_MODES.find((item) => item.key === modeKey) || QUICK_ENTRY_MODES[0]
}

function buildProjectListUrl(options = {}) {
  const query = []
  if (options.quickFilter) {
    query.push(`quickFilter=${options.quickFilter}`)
  }
  if (options.sortMode) {
    query.push(`sortMode=${options.sortMode}`)
  }
  if (options.stageFilter) {
    query.push(`stageFilter=${encodeURIComponent(options.stageFilter)}`)
  }
  if (options.source) {
    query.push(`source=${options.source}`)
  }

  return `/pages/projects/projects${query.length ? `?${query.join('&')}` : ''}`
}

function normalizeTaskCard(item, index) {
  return {
    id: item.id || `task-${index}`,
    projectId: item.projectId || '',
    title: item.title || '未命名动作',
    projectName: item.projectName || '未命名项目',
    clientName: item.clientName || '未填写客户',
    taskTypeLabel: item.taskTypeLabel || '其他动作',
    priorityLabel: item.priorityLabel || '常规',
    urgencyText: item.urgencyText || '待处理',
    urgencyBadgeClass: item.urgencyBadgeClass || '',
    dueText: item.dueText || '待安排',
    ownerLabel: item.ownerLabel || '我负责推进',
    ownerBadgeClass: item.ownerBadgeClass || '',
    stage: item.stage || '线索',
    amount: item.amount || '0',
    nextFollowUpText: item.nextFollowUpText || item.dueText || '待安排',
    focusText: item.focusText || '先完成推进任务，再回填结果。',
    summaryText: item.summaryText || '',
    primaryLabel: '推进任务',
    secondaryLabel: '任务说明'
  }
}

function normalizeTimelineGroup(group, groupIndex) {
  const source = group && typeof group === 'object' && !Array.isArray(group) ? group : {}
  const date = source.date || `动态-${groupIndex + 1}`
  const items = Array.isArray(source.items) ? source.items : []
  return {
    ...source,
    date,
    items: items.map((item, itemIndex) => {
      const current = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
      return {
        ...current,
        key: current.id
          || current.key
          || [
            date,
            current.projectId || 'project',
            current.time || 'time',
            itemIndex
          ].join('-')
      }
    })
  }
}

function decorateDashboard(data) {
  const taskBoard = data && data.taskBoard ? data.taskBoard : {}
  const taskCards = (Array.isArray(taskBoard.cards) ? taskBoard.cards : []).map(normalizeTaskCard)
  const timeline = (Array.isArray(data.timeline) ? data.timeline : []).map(normalizeTimelineGroup)
  const metrics = Array.isArray(data.metrics) ? data.metrics : []

  return {
    metrics,
    taskBoard: {
      summary: {
        openCount: Number(taskBoard.summary && taskBoard.summary.openCount || 0),
        overdueCount: Number(taskBoard.summary && taskBoard.summary.overdueCount || 0),
        todayCount: Number(taskBoard.summary && taskBoard.summary.todayCount || 0)
      },
      cards: taskCards
    },
    todos: [],
    timeline,
    hasContent: metrics.length > 0 || taskCards.length > 0 || timeline.length > 0,
    overdueCount: Number(taskBoard.summary && taskBoard.summary.overdueCount || 0)
  }
}

function shouldAutoResolveNotification(type) {
  const currentType = String(type || '').trim()
  return currentType === 'shared_opened'
    || currentType === 'shared_imported'
    || currentType === 'shared_followed'
    || currentType === 'project_silent'
}

function shouldShowNotificationProjectName(type) {
  const currentType = String(type || '').trim()
  return currentType === 'task_overdue'
    || currentType === 'task_due'
    || currentType === 'task_upcoming'
    || currentType === 'todo_overdue'
    || currentType === 'todo_due'
    || currentType === 'todo_upcoming'
    || currentType === 'project_silent'
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function removeProjectNameFromHeadlineText(text, projectName) {
  const source = normalizeText(text)
  const name = normalizeText(projectName)
  if (!source || !name) {
    return source
  }

  return source
    .replace(new RegExp(`^${escapeRegExp(name)}\\s*[·:：\\-—｜|]\\s*`), '')
    .replace(new RegExp(`^${escapeRegExp(name)}\\s+`), '')
    .replace(new RegExp(`\\s*[·:：\\-—｜|]\\s*${escapeRegExp(name)}$`), '')
    .replace(new RegExp(`项目\\s*${escapeRegExp(name)}\\s*`, 'g'), '')
    .replace(new RegExp(`${escapeRegExp(name)}\\s*有新的提醒[。.]?$`), '有新的提醒')
    .replace(/，需要/g, '，需要')
    .replace(/，可以/g, '，可以')
    .trim()
}

function getNotificationHeadlineAppearance(type) {
  const currentType = String(type || '').trim()

  if (currentType === 'task_overdue' || currentType === 'todo_overdue' || currentType === 'save_failed') {
    return {
      toneClass: currentType === 'save_failed' ? 'is-system' : 'is-danger',
      badgeText: currentType === 'save_failed' ? '异常待处理' : '优先处理'
    }
  }

  if (currentType === 'task_due' || currentType === 'todo_due') {
    return {
      toneClass: 'is-brand',
      badgeText: '今天处理'
    }
  }

  if (currentType === 'task_upcoming' || currentType === 'todo_upcoming') {
    return {
      toneClass: 'is-soft',
      badgeText: '提前准备'
    }
  }

  if (currentType === 'project_silent') {
    return {
      toneClass: 'is-soft',
      badgeText: '回看项目'
    }
  }

  if (currentType === 'shared_opened' || currentType === 'shared_imported' || currentType === 'shared_followed' || currentType === 'project_taken_over') {
    return {
      toneClass: 'is-soft',
      badgeText: currentType === 'project_taken_over' ? '接手动态' : '外发动态'
    }
  }

  if (currentType === 'ai_failed') {
    return {
      toneClass: 'is-system',
      badgeText: '异常待处理'
    }
  }

  return {
    toneClass: 'is-neutral',
    badgeText: '提醒'
  }
}

function buildNotificationHeadline(notifications, stats) {
  const list = Array.isArray(notifications) ? notifications : []
  const current = list[0] || null

  if (current) {
    const appearance = getNotificationHeadlineAppearance(current.type)
    const projectName = shouldShowNotificationProjectName(current.type)
      ? normalizeText(current.projectName)
      : ''
    const title = projectName
      ? removeProjectNameFromHeadlineText(current.title || '优先提醒', projectName)
      : (current.title || '优先提醒')
    const desc = projectName
      ? removeProjectNameFromHeadlineText(current.summary || `${current.projectName || '当前项目'} 有新的提醒。`, projectName)
      : (current.summary || `${current.projectName || '当前项目'} 有新的提醒。`)
    return {
      id: current.id || '',
      type: current.type || '',
      title: title || '优先提醒',
      desc: desc || '有新的提醒。',
      projectName,
      actionText: getNotificationPrimaryActionLabel(current.type, current.actionLabel),
      actionUrl: current.actionUrl || '',
      autoResolve: shouldAutoResolveNotification(current.type),
      toneClass: appearance.toneClass,
      badgeText: appearance.badgeText
    }
  }

  const pendingCount = Number(stats && stats.pendingCount || 0)
  const unreadCount = Number(stats && stats.unreadCount || 0)

  if (pendingCount || unreadCount) {
    return {
      id: '',
      type: '',
      title: '站内提醒',
      desc: `当前有 ${pendingCount} 条待收口消息，待查看 ${unreadCount} 条。`,
      projectName: '',
      actionText: '打开消息',
      actionUrl: '',
      autoResolve: false,
      toneClass: 'is-neutral',
      badgeText: '待处理'
    }
  }

  return {
    id: '',
    type: '',
    title: '站内提醒',
    desc: '当前提醒都已收口，可以继续按首页任务和跟进节奏推进。',
    projectName: '',
    actionText: '打开消息',
    actionUrl: '',
    autoResolve: false,
    toneClass: 'is-success',
    badgeText: '已收口'
  }
}

function buildHomeEntitlementHeadline(snapshot = {}) {
  const account = snapshot.account || {}
  const entitlements = snapshot.entitlements || {}
  const overview = buildEntitlementOverview({
    account,
    entitlements
  })
  const accessLevel = normalizeText(entitlements.currentAccessLevel || account.currentAccessLevel)
  const effectiveToText = formatDateLabel(entitlements.effectiveTo || account.trialEndsAt)

  if (accessLevel === 'paid_active') {
    return {
      title: '当前权益已生效',
      desc: effectiveToText
        ? `正式订阅有效至 ${effectiveToText}，现在可以继续按首页动作和跟进节奏推进。`
        : '正式订阅已生效，现在可以继续按首页动作和跟进节奏推进。',
      actionText: '查看套餐与权益',
      actionUrl: '/pages/plans/plans',
      toneClass: 'is-success',
      badgeText: '已生效'
    }
  }

  if (accessLevel === 'trial_full') {
    return {
      title: '当前处于试用期',
      desc: effectiveToText
        ? `试用体验至 ${effectiveToText}，当前仍可继续新增、保存和使用闪录。`
        : '当前仍在试用体验期内，可继续新增、保存和使用闪录。',
      actionText: account.phoneVerified ? '查看套餐与权益' : '先绑定手机号',
      actionUrl: account.phoneVerified ? '/pages/plans/plans' : '/pages/phone-bind/phone-bind?returnTo=index',
      toneClass: 'is-soft',
      badgeText: '试用中'
    }
  }

  if (accessLevel === 'paid_readonly' || accessLevel === 'free_readonly') {
    return {
      title: '当前账号已只读',
      desc: overview.reasonSummary || '你仍可查看全部进展，但当前不能继续新增或修改数据。',
      actionText: '订阅套餐',
      actionUrl: '/pages/plans/plans?focus=subscription&reason=write_disabled',
      toneClass: 'is-brand',
      badgeText: '只读中'
    }
  }

  if (accessLevel === 'disabled') {
    return {
      title: '当前账号不可用',
      desc: overview.reasonSummary || '请先确认账号状态恢复正常。',
      actionText: '查看权益详情',
      actionUrl: '/pages/entitlements/entitlements?reason=account_disabled',
      toneClass: 'is-danger',
      badgeText: '不可用'
    }
  }

  return {
    title: '站内提醒',
    desc: '当前提醒都已收口，可以继续按首页任务和跟进节奏推进。',
    actionText: '打开消息',
    actionUrl: '',
    toneClass: 'is-success',
    badgeText: '已收口'
  }
}

Page({
  data: {
    appearancePageClass: '',
    homeSloganFontLoaded: false,
    dashboard: {
      metrics: [],
      taskBoard: {
        summary: {
          openCount: 0,
          overdueCount: 0,
          todayCount: 0
        },
        cards: []
      },
      todos: [],
      timeline: [],
      hasContent: false,
      overdueCount: 0
    },
    notificationUnreadCount: 0,
    notificationPendingCount: 0,
    notificationHeadlineId: '',
    notificationHeadlineType: '',
      notificationHeadlineTitle: '站内提醒',
      notificationHeadlineDesc: '当前提醒都已收口，可以继续按首页任务和跟进节奏推进。',
      notificationHeadlineProjectName: '',
      notificationHeadlineActionText: '查看',
    notificationHeadlineUrl: '',
    notificationHeadlineAutoResolve: false,
    notificationHeadlineToneClass: 'is-success',
    notificationHeadlineBadgeText: '已收口',
    notificationSyncVersion: 0,
    nextTaskTemplates: NEXT_TASK_TEMPLATES,
    quickEntryModes: QUICK_ENTRY_MODES,
    quickEntryStages: QUICK_ENTRY_STAGES,
    quickEntryMethods: QUICK_ENTRY_METHODS,
    showQuickEntrySheet: false,
    quickEntryMode: 'follow_up',
    quickEntryModeTitle: getQuickEntryModeMeta('follow_up').label,
    quickEntryModeDesc: getQuickEntryModeMeta('follow_up').desc,
    quickEntryProjects: [],
    quickEntrySuggestedProjects: [],
    quickEntryVisibleProjects: [],
    quickEntryShowProjectSearch: false,
    quickEntryProjectKeyword: '',
    quickEntryProjectSelectionMode: '',
    quickEntrySelectedProjectId: '',
    quickEntrySelectedProjectName: '未关联项目',
    quickEntrySelectedProjectMeta: null,
    quickEntrySheetSource: '',
    quickEntryForm: buildQuickEntryForm(),
    isQuickEntryVoiceSupported: true,
    isQuickEntryVoiceRecording: false,
    isQuickEntryVoiceRecognizing: false,
    quickEntryVoiceElapsedText: '',
    quickEntryVoicePhase: 'idle',
    quickEntryShowVoiceExampleHint: false,
    quickEntryVoiceStatusText: '',
    quickEntryAiLoadingHint: getQuickEntryAiLoadingHint(),
    quickEntryVoicePreviewText: '',
    isQuickEntryAiLoading: false,
    quickEntryAiError: '',
    quickEntryAiProjectMatch: null,
    quickEntryAiProjectCandidateIds: [],
    quickEntryAiSummary: null,
    quickEntryAiNextSuggestion: null,
    quickEntryAiNextSuggestionError: '',
    quickEntryAiHasExtendedDetails: false,
    quickEntryAiShowFullResult: false,
    quickEntryFollowUpMethodTouched: false,
    quickEntryFollowUpDateTouched: false,
    quickEntryFollowUpClockTouched: false,
    quickEntryCreateNextTask: false,
    quickEntryNextTaskDraft: buildQuickEntryNextTaskDraft(),
    quickEntryNextTaskTitleTouched: false,
    quickEntryNextTaskTimeTouched: false,
    quickEntryNextTaskTimeOptions: [],
    quickEntryNextTaskTimeSelection: '',
    quickEntryNextTaskUseCustomTime: false,
    quickEntryNextTaskSelectedTimeLabel: '',
    quickEntryTaskDraftCanCreate: false,
    quickEntryFollowUpCanSubmit: false,
    quickEntryFollowUpSubmitText: '先录入内容',
    quickEntryFollowUpSubmitIsAiAction: false,
    quickEntryFollowUpSubmitHint: '先说一句，或手动补一句关键跟进。',
    quickEntryManualInputEnabled: false,
    quickEntryShowFollowUpDetails: false,
    quickEntryActionId: '',
    quickEntryFollowUpPendingAction: '',
    quickEntryKeyboardHeight: 0,
    quickEntryCursorSpacing: 120,
    quickEntrySheetStyle: '',
    quickEntryBodyStyle: '',
    quickEntryActionsStyle: '',
    isQuickEntryEditing: false,
    showQuickEntrySuccessPanel: false,
    quickEntrySuccessState: buildQuickEntrySuccessState(),
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
    homeAccessCard: {
      visible: false,
      title: '',
      desc: '',
      badgeText: '',
      badgeClass: '',
      actionText: '',
      actionUrl: '',
      rows: []
    },
    homeAvatarText: '我',
    taskActionId: '',
    isLoading: true,
    isLoadFailed: false,
    loadError: '',
    dataSource: 'Mock Demo'
  },

  async onLoad(options) {
    this.isPageActive = true
    this.quickEntryStandalone = String(options && options.quickEntryStandalone || '').trim() === '1'
    this.quickEntryProjectCloudAliasMemory = {}
    this.loadQuickEntryProjectAliases()
    syncPageAppearance(this)
    this.applyHomeSloganFont()
    this.initTaskCompletionKeyboard()
    this.pendingQuickEntryOpen = String(options && options.openQuickEntry || '').trim() === '1'
    this.setData({
      notificationSyncVersion: getNotificationSyncVersion()
    })
    await this.consumePendingQuickEntryOpen()
    await this.fetchDashboard()
    this.refreshEntitlementPrompt({ refresh: true })
    await this.consumePendingQuickEntryOpen()
  },

  async onShow() {
    this.isPageActive = true
    this.loadQuickEntryProjectAliases()
    syncPageAppearance(this)
    this.applyHomeSloganFont()
    this.initTaskCompletionKeyboard()
    const currentSyncVersion = getNotificationSyncVersion()
    if (currentSyncVersion !== this.data.notificationSyncVersion) {
      this.setData({
        notificationSyncVersion: currentSyncVersion
      })
    }
    if (!this.data.isLoading) {
      await this.fetchDashboard()
    }
    this.refreshEntitlementPrompt({ refresh: true })
    await this.consumePendingQuickEntryOpen()
  },

  onHide() {
    this.isPageActive = false
    this.stopQuickEntryVoiceInput({ silent: true })
    this.stopTaskCompletionVoiceInput({ silent: true })
    stopVoiceRecordingTicker(this, 'quickEntryVoiceTimer', 'quickEntryVoiceElapsedText')
    stopVoiceRecordingTicker(this, 'taskCompletionVoiceTimer', 'taskCompletionVoiceElapsedText')
    this.persistCurrentQuickEntryDraft()
    this.clearQuickEntryAiDebounceTimer()
    this.clearTaskFeedbackTimer()
    this.clearQuickEntryDraftTimer()
    this.destroyTaskCompletionKeyboard()
  },

  onUnload() {
    this.isPageActive = false
    this.stopQuickEntryVoiceInput({ silent: true })
    this.stopTaskCompletionVoiceInput({ silent: true })
    stopVoiceRecordingTicker(this, 'quickEntryVoiceTimer', 'quickEntryVoiceElapsedText')
    stopVoiceRecordingTicker(this, 'taskCompletionVoiceTimer', 'taskCompletionVoiceElapsedText')
    this.persistCurrentQuickEntryDraft()
    this.clearQuickEntryAiDebounceTimer()
    this.clearTaskFeedbackTimer()
    this.clearQuickEntryDraftTimer()
    this.destroyTaskCompletionKeyboard()
  },

  async applyHomeSloganFont() {
    if (this.data.homeSloganFontLoaded) {
      return
    }

    const loaded = await loadHomeSloganFontFace()
    if (!this.isPageActive || !loaded) {
      return
    }

    this.setData({
      homeSloganFontLoaded: true
    })
  },

  clearTaskFeedbackTimer() {
    if (this.taskFeedbackTimer) {
      clearTimeout(this.taskFeedbackTimer)
      this.taskFeedbackTimer = null
    }
  },

  clearQuickEntryDraftTimer() {
    if (this.quickEntryDraftTimer) {
      clearTimeout(this.quickEntryDraftTimer)
      this.quickEntryDraftTimer = null
    }
  },

  clearQuickEntryAiDebounceTimer() {
    if (this.quickEntryAiDebounceTimer) {
      clearTimeout(this.quickEntryAiDebounceTimer)
      this.quickEntryAiDebounceTimer = null
    }
  },

  async consumePendingQuickEntryOpen() {
    const app = getAppInstance()
    const request = app && app.globalData ? app.globalData.quickEntryRequest : null
    const hasGlobalRequest = !!request

    if (!this.pendingQuickEntryOpen && !hasGlobalRequest) {
      return
    }

    if (this.data.showQuickEntrySheet) {
      if (hasGlobalRequest) {
        app.globalData.quickEntryRequest = null
      }
      this.pendingQuickEntryOpen = false
      return
    }

    if (hasGlobalRequest) {
      this.quickEntryStandalone = request.standalone !== false
      app.globalData.quickEntryRequest = null
    }
    this.pendingQuickEntryOpen = false
    await this.openQuickEntrySheet()
  },

  async refreshEntitlementPrompt(options = {}) {
    const snapshot = await getEntitlementSnapshot({
      refresh: options.refresh === true
    })
    if (!this.isPageActive) {
      return
    }

    this.latestEntitlementSnapshot = snapshot

    this.setData({
      homeAccessCard: buildHomeAccessCard(snapshot),
      homeAvatarText: buildHomeAvatarText(snapshot.account)
    })
    this.applyDefaultHeadlineFromEntitlements(snapshot)
  },

  applyDefaultHeadlineFromEntitlements(snapshot = null) {
    const currentSnapshot = snapshot || this.latestEntitlementSnapshot
    if (!currentSnapshot) {
      return
    }

    const hasNotificationHeadline = !!normalizeText(this.data.notificationHeadlineId)
    const pendingCount = Number(this.data.notificationPendingCount || 0)
    const unreadCount = Number(this.data.notificationUnreadCount || 0)
    if (hasNotificationHeadline || pendingCount > 0 || unreadCount > 0) {
      return
    }

    const headline = buildHomeEntitlementHeadline(currentSnapshot)
    this.setData({
      notificationHeadlineTitle: headline.title,
      notificationHeadlineDesc: headline.desc,
      notificationHeadlineProjectName: '',
      notificationHeadlineActionText: headline.actionText,
      notificationHeadlineUrl: headline.actionUrl,
      notificationHeadlineAutoResolve: false,
      notificationHeadlineToneClass: headline.toneClass,
      notificationHeadlineBadgeText: headline.badgeText
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

  handleHomeAccessAction() {
    const { actionUrl } = this.data.homeAccessCard || {}
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

  async fetchDashboard() {
    this.setData({
      isLoading: true,
      isLoadFailed: false,
      loadError: ''
    })

    try {
      const dashboardResult = await loadHomeData()

      this.setData({
        dashboard: decorateDashboard(dashboardResult.data),
        isLoading: false,
        dataSource: dashboardResult.source
      })
      this.applyDefaultHeadlineFromEntitlements()
      this.refreshNotificationHeadline()
    } catch (error) {
      const message = error && error.message ? error.message : '当前无法同步云端数据，请稍后重试'
      this.setData({
        dashboard: {
          metrics: [],
          taskBoard: {
            summary: {
              openCount: 0,
              overdueCount: 0,
              todayCount: 0
            },
            cards: []
          },
          todos: [],
          timeline: [],
          hasContent: false,
          overdueCount: 0
        },
        notificationUnreadCount: 0,
        notificationPendingCount: 0,
        notificationHeadlineId: '',
        notificationHeadlineType: '',
        notificationHeadlineTitle: '站内提醒',
        notificationHeadlineDesc: '当前无法同步提醒摘要，点击可进入消息中心查看。',
        notificationHeadlineProjectName: '',
        notificationHeadlineActionText: '打开消息',
        notificationHeadlineUrl: '',
        notificationHeadlineAutoResolve: false,
        notificationHeadlineToneClass: 'is-neutral',
        notificationHeadlineBadgeText: '待处理',
        isLoading: false,
        isLoadFailed: true,
        loadError: message
      })
      wx.showToast({
        title: '当前无法同步首页数据',
        icon: 'none'
      })
    }
  },

  async refreshNotificationHeadline() {
    try {
      const notificationResult = await loadNotificationsData({
        statusFilter: 'unread',
        limit: 6,
        skipGenerate: true
      })
      if (!this.isPageActive) {
        return
      }

      let notificationStats = {
        unreadCount: 0,
        pendingCount: 0
      }

      if (notificationResult && notificationResult.stats) {
        notificationStats = {
          unreadCount: Number(notificationResult.stats.unreadCount || 0),
          pendingCount: Number(notificationResult.stats.pendingCount || 0)
        }
      }

      const headline = buildNotificationHeadline(
        notificationResult && notificationResult.notifications,
        notificationResult && notificationResult.stats
      )

      this.setData({
        notificationUnreadCount: notificationStats.unreadCount,
        notificationPendingCount: notificationStats.pendingCount,
        notificationHeadlineId: headline.id || '',
        notificationHeadlineType: headline.type || '',
        notificationHeadlineTitle: headline.title || '站内提醒',
        notificationHeadlineDesc: headline.desc || '当前提醒都已收口，可以继续按首页任务和跟进节奏推进。',
        notificationHeadlineProjectName: headline.projectName || '',
        notificationHeadlineActionText: headline.actionText || '打开消息',
        notificationHeadlineUrl: headline.actionUrl || '',
        notificationHeadlineAutoResolve: !!headline.autoResolve,
        notificationHeadlineToneClass: headline.toneClass || 'is-success',
        notificationHeadlineBadgeText: headline.badgeText || '已收口'
      })
    } catch (error) {
      if (!this.isPageActive) {
        return
      }

      this.setData({
        notificationUnreadCount: 0,
        notificationPendingCount: 0,
        notificationHeadlineId: '',
        notificationHeadlineType: '',
        notificationHeadlineTitle: '站内提醒',
        notificationHeadlineDesc: '当前无法同步提醒摘要，点击可进入消息中心查看。',
        notificationHeadlineProjectName: '',
        notificationHeadlineActionText: '打开消息',
        notificationHeadlineUrl: '',
        notificationHeadlineAutoResolve: false,
        notificationHeadlineToneClass: 'is-neutral',
        notificationHeadlineBadgeText: '待处理'
      })
    }
  },

  retryFetch() {
    this.fetchDashboard()
  },

  openProjectDetail(event) {
    const { projectId } = event.currentTarget.dataset
    if (!projectId) {
      return
    }

    wx.navigateTo({
      url: `/pages/project-detail/project-detail?projectId=${projectId}&view=home-todo`
    })
  },

  openFollowUp(event) {
    const { projectId } = event.currentTarget.dataset
    if (!projectId) {
      return
    }

    wx.navigateTo({
      url: `/pages/follow-up/follow-up?projectId=${projectId}&entry=home-todo`
    })
  },

  openTaskProjectDetail(event) {
    const { projectId } = event.currentTarget.dataset
    if (!projectId) {
      return
    }

    wx.navigateTo({
      url: `/pages/project-detail/project-detail?projectId=${projectId}&view=home-task`
    })
  },

  openTaskCompleteSheet(event) {
    const { taskId } = event.currentTarget.dataset
    if (!taskId || this.data.taskActionId) {
      return
    }

    const currentTask = (this.data.dashboard.taskBoard && this.data.dashboard.taskBoard.cards || []).find((item) => item.id === taskId)
    if (!currentTask) {
      return
    }

    const defaultNextTaskDraft = buildDefaultNextTaskDraft()
    this.setData({
      showTaskCompleteSheet: true,
      taskCompletionTaskId: taskId,
      taskCompletionTaskTitle: currentTask.title || '当前任务',
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

  initTaskCompletionKeyboard() {
    if (typeof wx === 'undefined' || typeof wx.onKeyboardHeightChange !== 'function') {
      return
    }

    if (this.taskCompletionKeyboardHandler) {
      return
    }

    this.taskCompletionKeyboardHandler = (result) => {
      if (!this.data.showTaskCompleteSheet && !this.data.showQuickEntrySheet) {
        return
      }

      const height = Math.max(Number(result && result.height || 0), 0)
      if (this.data.showTaskCompleteSheet) {
        if (height > 0) {
          this.syncTaskCompletionLayout(height, true)
          return
        }

        this.syncTaskCompletionLayout(0, false)
      }

      if (this.data.showQuickEntrySheet) {
        if (height > 0) {
          this.syncQuickEntryLayout(height, true)
          return
        }

        this.syncQuickEntryLayout(0, false)
      }
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
      if (this.activeVoiceScene !== 'task_completion') {
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

      if (this.activeVoiceScene !== 'task_completion') {
        return
      }

      if (this.skipTaskCompletionVoiceCommit) {
        this.skipTaskCompletionVoiceCommit = false
        this.activeVoiceScene = ''
        this.setData({
          isTaskCompletionVoiceRecording: false,
          isTaskCompletionVoiceRecognizing: false
        })
        return
      }

      if (!this.isPageActive || !this.data.showTaskCompleteSheet) {
        this.activeVoiceScene = ''
        return
      }

      this.setData({
        isTaskCompletionVoiceRecording: false,
        isTaskCompletionVoiceRecognizing: true
      })

      await this.transcribeTaskCompletionVoiceFile(result)
    })

    manager.onError((error) => {
      if (this.activeVoiceScene !== 'task_completion') {
        return
      }

      this.activeVoiceScene = ''
      stopVoiceRecordingTicker(this, 'taskCompletionVoiceTimer', 'taskCompletionVoiceElapsedText')
      const errMsg = error && (error.retmsg || error.msg || error.errMsg)
        ? (error.retmsg || error.msg || error.errMsg)
        : ''
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
      this.activeVoiceScene = 'task_completion'
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
      this.activeVoiceScene = ''
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
      this.activeVoiceScene = ''
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
    const filePath = normalizeText(result.tempFilePath)
    if (!filePath) {
      this.activeVoiceScene = ''
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
        this.activeVoiceScene = ''
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
        this.activeVoiceScene = ''
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

      this.activeVoiceScene = ''
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
      this.activeVoiceScene = ''
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
      await this.fetchDashboard()
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

  openTimelineProject(event) {
    const { projectId } = event.currentTarget.dataset
    if (!projectId) {
      return
    }

    wx.navigateTo({
      url: `/pages/project-detail/project-detail?projectId=${projectId}&view=home-timeline`
    })
  },

  openProjectsPage() {
    wx.navigateTo({
      url: '/pages/projects/projects'
    })
  },

  openProjectsWithFilter(event) {
    const { quickFilter, sortMode, stageFilter, source } = event.currentTarget.dataset
    wx.navigateTo({
      url: buildProjectListUrl({
        quickFilter,
        sortMode,
        stageFilter,
        source
      })
    })
  },

  openTasksCenter(event) {
    const filter = event && event.currentTarget && event.currentTarget.dataset
      ? String(event.currentTarget.dataset.filter || 'open')
      : 'open'
    const sort = event && event.currentTarget && event.currentTarget.dataset
      ? String(event.currentTarget.dataset.sort || 'priority')
      : 'priority'
    wx.navigateTo({
      url: `/pages/tasks/tasks?filter=${filter}&sort=${sort}`
    })
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

  handleQuickEntryTap() {
    this.openQuickEntrySheet()
  },

  readQuickEntryDrafts() {
    if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') {
      return {}
    }

    try {
      const drafts = wx.getStorageSync(QUICK_ENTRY_DRAFT_STORAGE_KEY)
      return drafts && typeof drafts === 'object' ? drafts : {}
    } catch (error) {
      return {}
    }
  },

  writeQuickEntryDrafts(drafts) {
    if (typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') {
      return
    }

    try {
      wx.setStorageSync(QUICK_ENTRY_DRAFT_STORAGE_KEY, drafts && typeof drafts === 'object' ? drafts : {})
    } catch (error) {
      // ignore draft persistence failures in quick entry flow
    }
  },

  readQuickEntryProjectAliases() {
    if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') {
      return {}
    }

    try {
      const aliases = wx.getStorageSync(QUICK_ENTRY_PROJECT_ALIAS_STORAGE_KEY)
      return normalizeQuickEntryProjectAliasMemory(aliases)
    } catch (error) {
      return {}
    }
  },

  writeQuickEntryProjectAliases(aliases) {
    if (typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') {
      return
    }

    try {
      wx.setStorageSync(
        QUICK_ENTRY_PROJECT_ALIAS_STORAGE_KEY,
        normalizeQuickEntryProjectAliasMemory(aliases)
      )
    } catch (error) {
      // ignore alias persistence failures in quick entry flow
    }
  },

  readQuickEntryProjectAliasHitHistory() {
    if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') {
      return {}
    }

    try {
      const payload = wx.getStorageSync(QUICK_ENTRY_PROJECT_ALIAS_HIT_HISTORY_STORAGE_KEY)
      return normalizeQuickEntryAliasHitHistory(payload)
    } catch (error) {
      return {}
    }
  },

  writeQuickEntryProjectAliasHitHistory(history) {
    if (typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') {
      return
    }

    try {
      wx.setStorageSync(
        QUICK_ENTRY_PROJECT_ALIAS_HIT_HISTORY_STORAGE_KEY,
        normalizeQuickEntryAliasHitHistory(history)
      )
    } catch (error) {
      // ignore hit history persistence failures in quick entry flow
    }
  },

  loadQuickEntryProjectAliases() {
    return setQuickEntryProjectAliasMemoryCache(
      mergeQuickEntryProjectAliasMemoryMaps(
        this.readQuickEntryProjectAliases(),
        this.quickEntryProjectCloudAliasMemory
      )
    )
  },

  rememberQuickEntryProjectAliases(projectId = '', contentList = [], projectMeta = null, options = {}) {
    const currentProjectId = normalizeText(projectId)
    if (!currentProjectId) {
      return {
        addedAliases: [],
        learnedAliases: [],
        totalAliases: 0,
        attemptedManualAliases: [],
        acceptedManualAliases: [],
        blockedManualAliases: [],
        blockedManualReason: ''
      }
    }

    const currentProject = projectMeta || findQuickEntryProject(this.data.quickEntryProjects, currentProjectId)
    if (!currentProject) {
      return {
        addedAliases: [],
        learnedAliases: [],
        totalAliases: 0,
        attemptedManualAliases: [],
        acceptedManualAliases: [],
        blockedManualAliases: [],
        blockedManualReason: ''
      }
    }

    const nextTokens = []
    const manualCorrectionTokens = []
    const preferManualCorrection = !!(options && options.preferManualCorrection)
    ;(Array.isArray(contentList) ? contentList : []).forEach((content) => {
      if (preferManualCorrection) {
        buildQuickEntryManualCorrectionAliasTokensFromContent(content, currentProject).forEach((token) => {
          if (manualCorrectionTokens.indexOf(token) < 0) {
            manualCorrectionTokens.push(token)
          }
        })
      }
      buildQuickEntryAliasTokensFromContent(content, currentProject).forEach((token) => {
        if (nextTokens.indexOf(token) < 0) {
          nextTokens.push(token)
        }
      })
    })

    const manualCorrectionReview = reviewQuickEntryLearnableManualCorrectionAliases(
      manualCorrectionTokens,
      currentProject,
      this.data.quickEntryProjects
    )
    manualCorrectionReview.acceptedTokens.forEach((token) => {
      if (nextTokens.indexOf(token) < 0) {
        nextTokens.unshift(token)
      }
    })

    const aliasMemory = this.loadQuickEntryProjectAliases()
    const currentAliases = Array.isArray(aliasMemory[currentProjectId]) ? aliasMemory[currentProjectId] : []
    if (!nextTokens.length) {
      return {
        addedAliases: [],
        learnedAliases: currentAliases,
        totalAliases: currentAliases.length,
        attemptedManualAliases: manualCorrectionTokens,
        acceptedManualAliases: manualCorrectionReview.acceptedTokens,
        blockedManualAliases: manualCorrectionReview.blockedTokens,
        blockedManualReason: manualCorrectionReview.blockedReason
      }
    }

    const mergedAliases = nextTokens.concat(currentAliases.filter((item) => nextTokens.indexOf(item) < 0))
      .slice(0, QUICK_ENTRY_ALIAS_PER_PROJECT_LIMIT)
    const addedAliases = mergedAliases.filter((item) => currentAliases.indexOf(item) < 0)
    const nextAliasMemory = {
      ...aliasMemory,
      [currentProjectId]: mergedAliases
    }

    this.writeQuickEntryProjectAliases(nextAliasMemory)
    setQuickEntryProjectAliasMemoryCache(nextAliasMemory)
    return {
      addedAliases,
      learnedAliases: mergedAliases,
      totalAliases: mergedAliases.length,
      attemptedManualAliases: manualCorrectionTokens,
      acceptedManualAliases: manualCorrectionReview.acceptedTokens,
      blockedManualAliases: manualCorrectionReview.blockedTokens,
      blockedManualReason: manualCorrectionReview.blockedReason
    }
  },

  recordQuickEntryProjectAliasHit(projectId = '', content = '', projectMeta = null, selectionMode = '') {
    const currentProjectId = normalizeText(projectId)
    if (!currentProjectId) {
      return
    }

    const currentProject = projectMeta || findQuickEntryProject(this.data.quickEntryProjects, currentProjectId)
    if (!currentProject) {
      return
    }

    const nextRecord = buildQuickEntryAliasHitRecord(currentProject, content, selectionMode)
    if (!nextRecord) {
      return
    }

    const history = this.readQuickEntryProjectAliasHitHistory()
    const currentEntries = Array.isArray(history[currentProjectId]) ? history[currentProjectId] : []
    const dedupedEntries = currentEntries.filter((item) => {
      if (!item || item.contentKey !== nextRecord.contentKey) {
        return true
      }

      return new Date(nextRecord.matchedAt).getTime() - new Date(item.matchedAt).getTime() > 10 * 60 * 1000
    })
    const nextHistory = {
      ...history,
      [currentProjectId]: [nextRecord].concat(dedupedEntries).slice(0, QUICK_ENTRY_ALIAS_HIT_HISTORY_PER_PROJECT_LIMIT)
    }

    this.writeQuickEntryProjectAliasHitHistory(nextHistory)
  },

  async syncQuickEntryProjectImplicitMemory(projects = [], options = {}) {
    const projectIds = (Array.isArray(projects) ? projects : [])
      .map((item) => normalizeText(item && item.id))
      .filter(Boolean)
      .slice(0, 60)
    const syncKey = projectIds.join('|')
    const forceRefresh = options && options.force === true

    if (!projectIds.length) {
      this.quickEntryProjectCloudAliasMemory = {}
      this.loadQuickEntryProjectAliases()
      return {}
    }

    if (!forceRefresh && this.quickEntryProjectMemorySyncKey === syncKey && this.quickEntryProjectMemoryLoadedAt) {
      return this.quickEntryProjectCloudAliasMemory || {}
    }

    try {
      const result = await requestQuickEntryProjectMemoryData({ projectIds })
      if (!result || result.ok === false) {
        return this.quickEntryProjectCloudAliasMemory || {}
      }
      this.quickEntryProjectCloudAliasMemory = normalizeQuickEntryProjectAliasMemory(result.memoriesByProjectId)
      this.quickEntryProjectMemorySyncKey = syncKey
      this.quickEntryProjectMemoryLoadedAt = Date.now()
      this.loadQuickEntryProjectAliases()
      return this.quickEntryProjectCloudAliasMemory
    } catch (error) {
      return this.quickEntryProjectCloudAliasMemory || {}
    }
  },

  async rememberQuickEntryProjectImplicitMemory(projectId = '', aliasTexts = [], sourceType = 'manual_confirm') {
    const currentProjectId = normalizeText(projectId)
    const nextAliases = Array.isArray(aliasTexts)
      ? aliasTexts
          .map((item) => normalizeQuickEntryAliasToken(item))
          .filter((item) => isValidQuickEntryAliasText(item))
          .slice(0, 6)
      : []

    if (!currentProjectId || !nextAliases.length) {
      return
    }

    this.quickEntryProjectCloudAliasMemory = mergeQuickEntryProjectAliasMemoryMaps(
      this.quickEntryProjectCloudAliasMemory,
      {
        [currentProjectId]: nextAliases
      }
    )
    this.loadQuickEntryProjectAliases()

    try {
      await rememberQuickEntryProjectMemoryData({
        projectId: currentProjectId,
        aliasTexts: nextAliases,
        sourceType
      })
    } catch (error) {
      // keep local optimistic memory even if cloud sync fails
    }
  },

  hasSeenQuickEntryVoiceHint() {
    if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') {
      return false
    }

    try {
      return !!wx.getStorageSync(QUICK_ENTRY_VOICE_HINT_STORAGE_KEY)
    } catch (error) {
      return false
    }
  },

  isQuickEntryLearningDebugEnabled() {
    if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') {
      return false
    }

    try {
      return !!wx.getStorageSync(QUICK_ENTRY_LEARNING_DEBUG_STORAGE_KEY)
    } catch (error) {
      return false
    }
  },

  markQuickEntryVoiceHintSeen() {
    if (typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') {
      return
    }

    try {
      wx.setStorageSync(QUICK_ENTRY_VOICE_HINT_STORAGE_KEY, 1)
    } catch (error) {
      // ignore storage failures in onboarding hint flow
    }
  },

  hideQuickEntryVoiceExampleHint() {
    if (!this.data.quickEntryShowVoiceExampleHint) {
      return
    }

    this.markQuickEntryVoiceHintSeen()
    this.setData({
      quickEntryShowVoiceExampleHint: false
    })
  },

  getQuickEntryDraft(mode) {
    const currentMode = normalizeText(mode)
    if (!currentMode) {
      return null
    }

    const drafts = this.readQuickEntryDrafts()
    const draft = drafts[currentMode]
    const savedAt = Number(draft && draft.savedAt || 0)
    if (!draft || !savedAt || Date.now() - savedAt > QUICK_ENTRY_DRAFT_TTL) {
      if (draft) {
        delete drafts[currentMode]
        this.writeQuickEntryDrafts(drafts)
      }
      return null
    }

    return draft
  },

  saveQuickEntryDraft(mode, draft) {
    const currentMode = normalizeText(mode)
    if (!currentMode || !draft) {
      return
    }

    const drafts = this.readQuickEntryDrafts()
    drafts[currentMode] = Object.assign({}, draft, {
      savedAt: Date.now()
    })
    this.writeQuickEntryDrafts(drafts)
  },

  clearQuickEntryDraft(mode) {
    const currentMode = normalizeText(mode)
    if (!currentMode) {
      return
    }

    const drafts = this.readQuickEntryDrafts()
    if (!drafts[currentMode]) {
      return
    }

    delete drafts[currentMode]
    this.writeQuickEntryDrafts(drafts)
  },

  buildQuickEntryStateFromDraft(mode, draft = null, projects = []) {
    if (!draft) {
      return buildQuickEntryEmptyState(mode, projects)
    }

    const form = cloneQuickEntryForm(draft.form)
    const selectedProjectId = normalizeText(draft.selectedProjectId)
    const selectedProjectMeta = findQuickEntryProject(projects, selectedProjectId)
    const draftSelectionMode = normalizeText(draft.selectionMode)
    const currentSelectionMode = selectedProjectMeta
      ? (draftSelectionMode === 'manual'
          ? 'manual'
          : (draftSelectionMode === 'ai_auto' ? 'ai_auto' : 'auto'))
      : ''
    const keyword = normalizeText(draft.projectKeyword)
    const candidateIds = Array.isArray(draft.aiProjectCandidateIds)
      ? draft.aiProjectCandidateIds.map((item) => normalizeText(item)).filter(Boolean)
      : []
    const projectViews = buildQuickEntryProjectViews(
      projects,
      keyword,
      selectedProjectMeta ? selectedProjectMeta.id : '',
      candidateIds,
      getQuickEntryRecommendationText(mode, form)
    )
    const followUpDisplayState = buildQuickEntryFollowUpDisplayState({
      followUpContent: form.followUpContent,
      voicePreviewText: draft.voicePreviewText,
      aiError: draft.aiError,
      aiSummary: draft.aiSummary,
      aiProjectMatch: draft.aiProjectMatch,
      aiNextSuggestion: draft.aiNextSuggestion,
      manualInputEnabled: !!draft.manualInputEnabled,
      selectedProjectId: selectedProjectMeta ? selectedProjectMeta.id : '',
      flowStage: draft.followUpStage
    })
    const restoredNextSuggestionError = normalizeText(draft.aiNextSuggestionError)
    const normalizedProjectMatch = normalizeQuickEntryProjectMatch(draft.aiProjectMatch, projects)
    const normalizedSummary = draft.aiSummary ? normalizeQuickEntryAiSummary(draft.aiSummary) : null
    const normalizedSummaryDraft = draft.aiSummaryDraft ? normalizeQuickEntryAiSummary(draft.aiSummaryDraft) : null
    const normalizedNextSuggestion = draft.aiNextSuggestion
      ? normalizeQuickEntryAiNextSuggestion(draft.aiNextSuggestion)
      : null
    const normalizedNextSuggestionDraft = draft.aiNextSuggestionDraft
      ? normalizeQuickEntryAiNextSuggestion(draft.aiNextSuggestionDraft)
      : null
    const restoredVoicePreviewText = normalizeText(draft.voicePreviewText)
    const restoredAiError = normalizeText(draft.aiError)
    const restoredNextTaskDraft = cloneQuickEntryNextTaskDraft(
      draft.nextTaskDraft || buildQuickEntrySuggestedTaskDraft(normalizedNextSuggestion)
    )
    const taskDraftState = buildQuickEntryTaskDraftState({
      nextSuggestion: normalizedNextSuggestion,
      nextTaskDraft: restoredNextTaskDraft,
      selectedTimeSelection: draft.nextTaskTimeSelection,
      titleTouched: !!draft.nextTaskTitleTouched,
      timeTouched: !!draft.nextTaskTimeTouched
    })
    const followUpSubmitState = buildQuickEntryFollowUpSubmitState({
      followUpContent: form.followUpContent,
      selectedProjectId: selectedProjectMeta ? selectedProjectMeta.id : '',
      aiError: draft.aiError,
      aiSummary: normalizedSummary,
      aiNextSuggestion: normalizedNextSuggestion,
      stage: followUpDisplayState.quickEntryFollowUpStage,
      createNextTask: false
    })

    return {
      quickEntryMode: mode,
      quickEntryModeTitle: getQuickEntryModeMeta(mode).label,
      quickEntryModeDesc: getQuickEntryModeMeta(mode).desc,
      quickEntryShowProjectSearch: followUpDisplayState.quickEntryFollowUpStage === 'review' ? false : !!draft.showProjectSearch,
      quickEntryProjectKeyword: keyword,
      quickEntrySuggestedProjects: projectViews.suggestedProjects,
      quickEntryVisibleProjects: projectViews.visibleProjects,
      quickEntryProjectSelectionMode: currentSelectionMode,
      quickEntrySelectedProjectId: selectedProjectMeta ? selectedProjectMeta.id : '',
      quickEntrySelectedProjectName: getQuickEntryProjectLabel(selectedProjectMeta),
      quickEntrySelectedProjectMeta: selectedProjectMeta,
      quickEntryForm: form,
      isQuickEntryVoiceRecording: false,
      isQuickEntryVoiceRecognizing: false,
      quickEntryVoicePhase: 'idle',
      quickEntryVoiceStatusText: buildQuickEntryRestoredVoiceStatusText({
        followUpContent: form.followUpContent,
        aiError: restoredAiError,
        aiNextSuggestionError: restoredNextSuggestionError,
        aiSummary: normalizedSummary,
        aiProjectMatch: normalizedProjectMatch,
        selectedProjectId: selectedProjectMeta ? selectedProjectMeta.id : ''
      }),
      quickEntryAiLoadingHint: getQuickEntryAiLoadingHint(),
      quickEntryVoicePreviewText: restoredVoicePreviewText,
      isQuickEntryAiLoading: false,
      quickEntryAiError: restoredAiError,
      quickEntryAiProjectMatch: normalizedProjectMatch,
      quickEntryAiProjectCandidateIds: candidateIds,
      quickEntryAiSummary: normalizedSummary,
      quickEntryAiSummaryDraft: normalizedSummaryDraft || cloneQuickEntryAiSummary(normalizedSummary),
      quickEntryAiNextSuggestion: normalizedNextSuggestion,
      quickEntryAiNextSuggestionDraft: normalizedNextSuggestionDraft || cloneQuickEntryAiNextSuggestion(normalizedNextSuggestion),
      quickEntryAiNextSuggestionError: restoredNextSuggestionError,
      quickEntryAiHasExtendedDetails: getQuickEntryAiHasExtendedDetails(normalizedSummary, normalizedNextSuggestion),
      quickEntryAiShowFullResult: false,
      quickEntryEditingAiSummary: !!draft.editingAiSummary,
      quickEntryEditingAiNextSuggestion: !!draft.editingAiNextSuggestion,
      quickEntryShowReviewSettings: followUpDisplayState.quickEntryFollowUpStage === 'review' && !!draft.showReviewSettings,
      quickEntryFollowUpMethodTouched: !!draft.followUpMethodTouched,
      quickEntryFollowUpDateTouched: !!draft.followUpDateTouched,
      quickEntryFollowUpClockTouched: !!draft.followUpClockTouched,
      quickEntryCreateNextTask: false,
      quickEntryFollowUpPendingAction: '',
      ...taskDraftState,
      ...followUpDisplayState,
      ...followUpSubmitState
    }
  },

  startEditingQuickEntryAiSummary() {
    if (!this.data.quickEntryAiSummary) {
      return
    }

    this.setData({
      quickEntryEditingAiSummary: true,
      quickEntryAiSummaryDraft: cloneQuickEntryAiSummary(this.data.quickEntryAiSummary),
      quickEntryShowReviewSettings: false
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  cancelEditingQuickEntryAiSummary() {
    this.setData({
      quickEntryEditingAiSummary: false,
      quickEntryAiSummaryDraft: cloneQuickEntryAiSummary(this.data.quickEntryAiSummary)
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  startEditingQuickEntryAiNextSuggestion() {
    if (!this.data.quickEntryAiNextSuggestion) {
      return
    }

    this.setData({
      quickEntryEditingAiNextSuggestion: true,
      quickEntryAiNextSuggestionDraft: cloneQuickEntryAiNextSuggestion(this.data.quickEntryAiNextSuggestion),
      quickEntryShowReviewSettings: false
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  cancelEditingQuickEntryAiNextSuggestion() {
    this.setData({
      quickEntryEditingAiNextSuggestion: false,
      quickEntryAiNextSuggestionDraft: cloneQuickEntryAiNextSuggestion(this.data.quickEntryAiNextSuggestion)
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  onQuickEntryAiSummaryDraftInput(event) {
    const value = String(event.detail.value || '')
    this.setData({
      'quickEntryAiSummaryDraft.summary': value
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  onQuickEntryAiNextActionDraftInput(event) {
    const value = String(event.detail.value || '')
    this.setData({
      'quickEntryAiNextSuggestionDraft.nextAction': value
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  applyQuickEntryAiSummaryDraft() {
    const draft = cloneQuickEntryAiSummary(this.data.quickEntryAiSummaryDraft)
    if (!draft) {
      return
    }

    this.setData({
      quickEntryAiSummary: draft,
      quickEntryAiSummaryDraft: cloneQuickEntryAiSummary(draft),
      quickEntryEditingAiSummary: false
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  applyQuickEntryAiNextSuggestionDraft() {
    const draft = cloneQuickEntryAiNextSuggestion(this.data.quickEntryAiNextSuggestionDraft)
    if (!draft) {
      return
    }

    const nextPatch = {
      quickEntryAiNextSuggestion: draft,
      quickEntryAiNextSuggestionDraft: cloneQuickEntryAiNextSuggestion(draft),
      quickEntryEditingAiNextSuggestion: false
    }

    Object.assign(nextPatch, buildQuickEntryTaskDraftState({
      nextSuggestion: draft,
      nextTaskDraft: this.data.quickEntryNextTaskDraft,
      selectedTimeSelection: this.data.quickEntryNextTaskTimeSelection,
      titleTouched: this.data.quickEntryNextTaskTitleTouched,
      timeTouched: this.data.quickEntryNextTaskTimeTouched
    }))

    this.setData(nextPatch, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  onQuickEntryNextTaskInput(event) {
    const { field } = event.currentTarget.dataset
    if (!field) {
      return
    }

    const nextTaskDraft = cloneQuickEntryNextTaskDraft(this.data.quickEntryNextTaskDraft)
    nextTaskDraft[field] = String(event.detail.value || '')

    this.setData({
      ...buildQuickEntryTaskDraftState({
        nextSuggestion: this.data.quickEntryAiNextSuggestion,
        nextTaskDraft,
        selectedTimeSelection: this.data.quickEntryNextTaskTimeSelection,
        titleTouched: field === 'title' ? true : this.data.quickEntryNextTaskTitleTouched,
        timeTouched: this.data.quickEntryNextTaskTimeTouched
      })
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  onQuickEntryNextTaskPicker(event) {
    const { field } = event.currentTarget.dataset
    if (!field) {
      return
    }

    const nextTaskDraft = cloneQuickEntryNextTaskDraft(this.data.quickEntryNextTaskDraft)
    nextTaskDraft[field] = String(event.detail.value || '')

    this.setData({
      ...buildQuickEntryTaskDraftState({
        nextSuggestion: this.data.quickEntryAiNextSuggestion,
        nextTaskDraft,
        selectedTimeSelection: this.data.quickEntryNextTaskTimeSelection,
        titleTouched: this.data.quickEntryNextTaskTitleTouched,
        timeTouched: true
      })
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  selectQuickEntryNextTaskTimeOption(event) {
    const { optionId } = event.currentTarget.dataset
    if (!optionId || !this.data.quickEntryAiNextSuggestion) {
      return
    }

    const nextTaskDraft = cloneQuickEntryNextTaskDraft(this.data.quickEntryNextTaskDraft)
    if (optionId !== 'custom') {
      const matchedOption = (this.data.quickEntryNextTaskTimeOptions || []).find((item) => item.id === optionId)
      if (!matchedOption) {
        return
      }
      nextTaskDraft.dueDate = matchedOption.dueDate
      nextTaskDraft.dueTime = matchedOption.dueTime
    }

    this.setData({
      ...buildQuickEntryTaskDraftState({
        nextSuggestion: this.data.quickEntryAiNextSuggestion,
        nextTaskDraft,
        selectedTimeSelection: optionId,
        titleTouched: this.data.quickEntryNextTaskTitleTouched,
        timeTouched: true
      }),
      quickEntryNextTaskTimeSelection: optionId === 'custom' ? 'custom' : optionId,
      quickEntryNextTaskUseCustomTime: optionId === 'custom'
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  scheduleQuickEntryDraftPersist() {
    this.clearQuickEntryDraftTimer()
    this.quickEntryDraftTimer = setTimeout(() => {
      this.persistCurrentQuickEntryDraft()
    }, 240)
  },

  persistCurrentQuickEntryDraft() {
    const mode = normalizeText(this.data.quickEntryMode) || 'follow_up'
    if (this.data.showQuickEntrySuccessPanel) {
      this.clearQuickEntryDraft(mode)
      return
    }

    const form = cloneQuickEntryForm(this.data.quickEntryForm)
    const selectedProjectId = normalizeText(this.data.quickEntrySelectedProjectId)

    if (!shouldPersistQuickEntryDraft(mode, form, selectedProjectId)) {
      this.clearQuickEntryDraft(mode)
      return
    }

    this.saveQuickEntryDraft(mode, {
      form,
      selectedProjectId,
      selectionMode: this.data.quickEntryProjectSelectionMode || '',
      projectKeyword: this.data.quickEntryProjectKeyword || '',
      showProjectSearch: !!this.data.quickEntryShowProjectSearch,
      showReviewSettings: !!this.data.quickEntryShowReviewSettings,
      followUpStage: this.data.quickEntryFollowUpStage || '',
      followUpMethodTouched: !!this.data.quickEntryFollowUpMethodTouched,
      followUpDateTouched: !!this.data.quickEntryFollowUpDateTouched,
      followUpClockTouched: !!this.data.quickEntryFollowUpClockTouched,
      manualInputEnabled: !!this.data.quickEntryManualInputEnabled,
      voicePreviewText: this.data.quickEntryVoicePreviewText || '',
      aiError: this.data.quickEntryAiError || '',
      aiNextSuggestionError: this.data.quickEntryAiNextSuggestionError || '',
      aiProjectMatch: this.data.quickEntryAiProjectMatch || null,
      aiProjectCandidateIds: Array.isArray(this.data.quickEntryAiProjectCandidateIds)
        ? this.data.quickEntryAiProjectCandidateIds.slice(0, 5)
        : [],
      aiSummary: this.data.quickEntryAiSummary || null,
      aiSummaryDraft: this.data.quickEntryAiSummaryDraft || null,
      aiNextSuggestion: this.data.quickEntryAiNextSuggestion || null,
      aiNextSuggestionDraft: this.data.quickEntryAiNextSuggestionDraft || null,
      createNextTask: !!this.data.quickEntryCreateNextTask,
      nextTaskTimeSelection: this.data.quickEntryNextTaskTimeSelection || '',
      nextTaskTitleTouched: !!this.data.quickEntryNextTaskTitleTouched,
      nextTaskTimeTouched: !!this.data.quickEntryNextTaskTimeTouched,
      nextTaskDraft: cloneQuickEntryNextTaskDraft(this.data.quickEntryNextTaskDraft),
      editingAiSummary: !!this.data.quickEntryEditingAiSummary,
      editingAiNextSuggestion: !!this.data.quickEntryEditingAiNextSuggestion
    })
  },

  async openQuickEntrySheet() {
    if (this.data.quickEntryActionId) {
      return
    }

    const decision = await ensureActionAllowed('quick_entry', { refresh: true, guide: true })
    if (!decision.allowed) {
      return
    }

    this.clearQuickEntryAiDebounceTimer()
    const mode = normalizeText(this.data.quickEntryMode) || 'follow_up'
    const draft = this.getQuickEntryDraft(mode)
    const draftState = this.buildQuickEntryStateFromDraft(mode, draft, this.data.quickEntryProjects)
    this.setData({
      showQuickEntrySheet: true,
      showQuickEntrySuccessPanel: false,
      quickEntrySuccessState: buildQuickEntrySuccessState(),
      quickEntryShowVoiceExampleHint: mode === 'follow_up' && !draftState.quickEntryShowFollowUpDetails && !this.hasSeenQuickEntryVoiceHint(),
      ...draftState
    })
    this.syncQuickEntryLayout(0, false)

    try {
      await this.ensureQuickEntryProjects()
    } catch (error) {
      wx.showToast({
        title: error.message || '当前无法加载项目列表',
        icon: 'none'
      })
    }
  },

  openQuickEntryManualInput() {
    this.hideQuickEntryVoiceExampleHint()
    const displayState = buildQuickEntryFollowUpDisplayState({
      followUpContent: this.data.quickEntryForm.followUpContent,
      voicePreviewText: this.data.quickEntryVoicePreviewText,
      aiError: this.data.quickEntryAiError,
      aiSummary: this.data.quickEntryAiSummary,
      aiProjectMatch: this.data.quickEntryAiProjectMatch,
      aiNextSuggestion: this.data.quickEntryAiNextSuggestion,
      isVoiceRecording: this.data.isQuickEntryVoiceRecording,
      isVoiceRecognizing: this.data.isQuickEntryVoiceRecognizing,
      isAiLoading: this.data.isQuickEntryAiLoading,
      manualInputEnabled: true,
      selectedProjectId: this.data.quickEntrySelectedProjectId,
      flowStage: this.data.quickEntryFollowUpStage
    })
    const submitState = buildQuickEntryFollowUpSubmitState({
      followUpContent: this.data.quickEntryForm.followUpContent,
      selectedProjectId: this.data.quickEntrySelectedProjectId,
      isVoiceRecording: this.data.isQuickEntryVoiceRecording,
      isVoiceRecognizing: this.data.isQuickEntryVoiceRecognizing,
      isAiLoading: this.data.isQuickEntryAiLoading,
      aiError: this.data.quickEntryAiError,
      aiProjectMatch: this.data.quickEntryAiProjectMatch,
      stage: displayState.quickEntryFollowUpStage,
      actionId: this.data.quickEntryActionId,
      createNextTask: this.data.quickEntryCreateNextTask
    })

    this.setData({
      ...displayState,
      ...submitState
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  returnQuickEntryToVoiceInput() {
    if (this.data.isQuickEntryVoiceRecording || this.data.isQuickEntryVoiceRecognizing || this.data.isQuickEntryAiLoading) {
      return
    }

    const displayState = buildQuickEntryFollowUpDisplayState({
      followUpContent: this.data.quickEntryForm.followUpContent,
      voicePreviewText: this.data.quickEntryVoicePreviewText,
      aiError: this.data.quickEntryAiError,
      aiSummary: this.data.quickEntryAiSummary,
      aiProjectMatch: this.data.quickEntryAiProjectMatch,
      aiNextSuggestion: this.data.quickEntryAiNextSuggestion,
      manualInputEnabled: false,
      selectedProjectId: this.data.quickEntrySelectedProjectId,
      flowStage: this.data.quickEntryFollowUpStage
    })
    const submitState = buildQuickEntryFollowUpSubmitState({
      followUpContent: this.data.quickEntryForm.followUpContent,
      selectedProjectId: this.data.quickEntrySelectedProjectId,
      aiError: this.data.quickEntryAiError,
      aiProjectMatch: this.data.quickEntryAiProjectMatch,
      stage: displayState.quickEntryFollowUpStage,
      createNextTask: this.data.quickEntryCreateNextTask
    })

    this.setData({
      ...displayState,
      ...submitState
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  openQuickEntryProjectConfirm(options = {}) {
    if (this.data.isQuickEntryVoiceRecording || this.data.isQuickEntryVoiceRecognizing || this.data.isQuickEntryAiLoading) {
      return
    }

    const content = normalizeText(this.data.quickEntryForm.followUpContent)
    if (!content) {
      return
    }

    const selectedProjectId = normalizeText(this.data.quickEntrySelectedProjectId)
    const displayState = buildQuickEntryFollowUpDisplayState({
      followUpContent: this.data.quickEntryForm.followUpContent,
      voicePreviewText: this.data.quickEntryVoicePreviewText,
      aiError: this.data.quickEntryAiError,
      aiSummary: this.data.quickEntryAiSummary,
      aiProjectMatch: this.data.quickEntryAiProjectMatch,
      aiNextSuggestion: this.data.quickEntryAiNextSuggestion,
      manualInputEnabled: this.data.quickEntryManualInputEnabled,
      selectedProjectId,
      flowStage: 'project'
    })
    const submitState = buildQuickEntryFollowUpSubmitState({
      followUpContent: this.data.quickEntryForm.followUpContent,
      selectedProjectId,
      aiError: this.data.quickEntryAiError,
      aiProjectMatch: this.data.quickEntryAiProjectMatch,
      stage: 'project',
      createNextTask: false
    })

    if (typeof wx !== 'undefined' && typeof wx.hideKeyboard === 'function') {
      wx.hideKeyboard()
    }

    const forceShowSearch = !!(options && options.showSearch)

    this.setData({
      quickEntryShowProjectSearch: forceShowSearch || !selectedProjectId,
      quickEntryShowReviewSettings: false,
      ...displayState,
      ...submitState
    }, () => {
      this.syncQuickEntryLayout(0, false)
      this.scheduleQuickEntryDraftPersist()
    })
  },

  returnQuickEntryFollowUpToContent() {
    if (this.data.isQuickEntryVoiceRecording || this.data.isQuickEntryVoiceRecognizing || this.data.isQuickEntryAiLoading) {
      return
    }

    const displayState = buildQuickEntryFollowUpDisplayState({
      followUpContent: this.data.quickEntryForm.followUpContent,
      voicePreviewText: this.data.quickEntryVoicePreviewText,
      aiError: this.data.quickEntryAiError,
      aiSummary: null,
      aiProjectMatch: this.data.quickEntryAiProjectMatch,
      aiNextSuggestion: null,
      manualInputEnabled: this.data.quickEntryManualInputEnabled,
      selectedProjectId: this.data.quickEntrySelectedProjectId,
      flowStage: normalizeText(this.data.quickEntryForm.followUpContent) ? 'content' : 'capture'
    })
    const submitState = buildQuickEntryFollowUpSubmitState({
      followUpContent: this.data.quickEntryForm.followUpContent,
      selectedProjectId: this.data.quickEntrySelectedProjectId,
      aiError: '',
      aiProjectMatch: this.data.quickEntryAiProjectMatch,
      stage: displayState.quickEntryFollowUpStage,
      createNextTask: false
    })

    this.setData({
      quickEntryShowProjectSearch: false,
      ...displayState,
      ...submitState
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  toggleQuickEntryReviewSettings() {
    if (this.data.quickEntryFollowUpStage !== 'review') {
      return
    }

    this.setData({
      quickEntryShowReviewSettings: !this.data.quickEntryShowReviewSettings
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  hasQuickEntryPendingChanges() {
    if (this.canPersistCurrentQuickEntryDraft()) {
      return true
    }

    return !!(
      normalizeText(this.data.quickEntryVoicePreviewText)
      || this.data.isQuickEntryVoiceRecording
      || this.data.isQuickEntryVoiceRecognizing
      || this.data.isQuickEntryAiLoading
      || this.data.quickEntryAiProjectMatch
      || this.data.quickEntryAiSummary
      || this.data.quickEntryAiNextSuggestion
      || normalizeText(this.data.quickEntryAiError)
    )
  },

  canPersistCurrentQuickEntryDraft() {
    const mode = normalizeText(this.data.quickEntryMode) || 'follow_up'
    const form = cloneQuickEntryForm(this.data.quickEntryForm)
    const selectedProjectId = normalizeText(this.data.quickEntrySelectedProjectId)
    return shouldPersistQuickEntryDraft(mode, form, selectedProjectId)
  },

  buildQuickEntryDiscardConfirmMeta() {
    const mode = normalizeText(this.data.quickEntryMode) || 'follow_up'
    const selectedProjectId = normalizeText(this.data.quickEntrySelectedProjectId)
    const hasVoicePreview = !!normalizeText(this.data.quickEntryVoicePreviewText)
    const hasFollowUpContent = !!normalizeText(this.data.quickEntryForm && this.data.quickEntryForm.followUpContent)
    const hasProjectSelection = !!selectedProjectId
    const hasPendingCandidates = !!(this.data.quickEntryAiProjectMatch && this.data.quickEntryAiProjectMatch.status === 'candidates')
    const isBusy = !!(this.data.isQuickEntryVoiceRecording || this.data.isQuickEntryVoiceRecognizing || this.data.isQuickEntryAiLoading)

    if (mode === 'follow_up') {
      const parts = []
      if (isBusy) {
        parts.push('当前语音仍在录音、识别或理解中')
      } else if (hasVoicePreview) {
        parts.push('已生成语音识别结果')
      } else if (hasFollowUpContent) {
        parts.push('已填写跟进内容')
      }

      if (hasProjectSelection) {
        parts.push('已关联项目')
      } else if (hasPendingCandidates) {
        parts.push('项目还没确认')
      }

      const summary = parts.length ? `${parts.join('，')}。` : ''
      return {
        title: '放弃本次闪录？',
        content: `${summary}放弃后会停止当前处理，并清空这次录音、识别结果、项目关联和暂存草稿。`,
        confirmText: '确认放弃',
        successToast: '已放弃本次闪录'
      }
    }

    if (mode === 'project') {
      return {
        title: '放弃本次录入？',
        content: '放弃后会清空这次项目录入内容和暂存草稿。',
        confirmText: '确认放弃',
        successToast: '已放弃本次录入'
      }
    }

    return {
      title: '放弃本次录入？',
      content: '放弃后会清空这次任务录入内容、项目关联和暂存草稿。',
      confirmText: '确认放弃',
      successToast: '已放弃本次录入'
    }
  },

  closeQuickEntrySheet(optionsOrForce = {}) {
    const options = typeof optionsOrForce === 'boolean'
      ? { force: optionsOrForce }
      : (optionsOrForce && typeof optionsOrForce === 'object' && !optionsOrForce.currentTarget
          ? optionsOrForce
          : {})
    const force = !!options.force
    const discard = !!options.discard
    const draftBehavior = discard
      ? 'clear'
      : (options.persistDraft === true ? 'persist' : (options.preserveDraft ? 'preserve' : 'clear'))
    const toastTitle = normalizeText(options.toastTitle)
    const currentMode = normalizeText(this.data.quickEntryMode) || 'follow_up'

    if (!force && this.data.quickEntryActionId) {
      return
    }

    if (!force && this.data.showQuickEntrySuccessPanel) {
      return
    }

    this.clearQuickEntryDraftTimer()
    this.clearQuickEntryAiDebounceTimer()
    this.stopQuickEntryVoiceInput({ silent: true })
    if (!force && !this.data.showQuickEntrySuccessPanel) {
      if (draftBehavior === 'persist') {
        this.persistCurrentQuickEntryDraft()
      } else if (draftBehavior === 'clear') {
        this.clearQuickEntryDraft(currentMode)
      }
      this.setData({
        showQuickEntrySheet: false
      }, () => {
        if (toastTitle) {
          wx.showToast({
            title: toastTitle,
            icon: 'none'
          })
        }
        this.closeStandaloneQuickEntryEntry()
      })
      this.syncQuickEntryLayout(0, false)
      return
    }

    if (discard) {
      this.clearQuickEntryDraft(currentMode)
    }

    const resetState = buildQuickEntryEmptyState(currentMode, this.data.quickEntryProjects)
    this.setData({
      showQuickEntrySheet: false,
      showQuickEntrySuccessPanel: false,
      quickEntrySuccessState: buildQuickEntrySuccessState(),
      ...resetState
    }, () => {
      if (toastTitle) {
        wx.showToast({
          title: toastTitle,
          icon: 'none'
        })
      }
      this.closeStandaloneQuickEntryEntry()
    })
    this.syncQuickEntryLayout(0, false)
  },

  closeStandaloneQuickEntryEntry() {
    if (!this.quickEntryStandalone) {
      return
    }

    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    if (Array.isArray(pages) && pages.length > 1) {
      wx.navigateBack({
        delta: 1
      })
      return
    }

    wx.reLaunch({
      url: '/pages/index/index'
    })
  },

  onQuickEntryMaskTap() {
    if (this.data.showQuickEntrySuccessPanel) {
      return
    }

    if (!this.hasQuickEntryPendingChanges()) {
      this.closeQuickEntrySheet(false)
      return
    }

    const canPersistDraft = this.canPersistCurrentQuickEntryDraft()
    if (!canPersistDraft) {
      this.openQuickEntryCloseActionSheet()
      return
    }

    this.closeQuickEntrySheet({
      persistDraft: true,
      toastTitle: '已暂存，下次可继续'
    })
  },

  onQuickEntryHeaderClose() {
    if (this.data.showQuickEntrySuccessPanel) {
      this.closeQuickEntryAfterSuccess()
      return
    }

    this.openQuickEntryCloseActionSheet()
  },

  onQuickEntryHeaderBack() {
    this.onQuickEntryHeaderClose()
  },

  onQuickEntryCancelTap() {
    this.openQuickEntryCloseActionSheet()
  },

  onQuickEntryDiscardTap() {
    this.confirmDiscardQuickEntry()
  },

  openQuickEntryCloseActionSheet() {
    if (this.data.quickEntryActionId || this.data.showQuickEntrySuccessPanel) {
      return
    }

    if (!this.hasQuickEntryPendingChanges()) {
      this.closeQuickEntrySheet(false)
      return
    }

    const canPersistDraft = this.canPersistCurrentQuickEntryDraft()
    const discardText = this.data.quickEntryMode === 'follow_up' ? '放弃本次闪录' : '放弃本次录入'
    wx.showActionSheet({
      itemList: ['继续编辑', canPersistDraft ? '保存草稿，稍后继续' : '直接关闭', discardText],
      success: (result) => {
        if (result.tapIndex === 1) {
          this.closeQuickEntrySheet({
            persistDraft: canPersistDraft,
            preserveDraft: !canPersistDraft,
            toastTitle: canPersistDraft ? '已暂存，下次可继续' : ''
          })
          return
        }

        if (result.tapIndex === 2) {
          this.confirmDiscardQuickEntry()
        }
      }
    })
  },

  confirmDiscardQuickEntry() {
    if (this.data.quickEntryActionId || this.data.showQuickEntrySuccessPanel) {
      return
    }

    if (!this.hasQuickEntryPendingChanges()) {
      this.closeQuickEntrySheet(true)
      return
    }

    const confirmMeta = this.buildQuickEntryDiscardConfirmMeta()
    wx.showModal({
      title: confirmMeta.title,
      content: confirmMeta.content,
      confirmText: confirmMeta.confirmText,
      cancelText: '继续编辑',
      confirmColor: '#b14d2f',
      success: (result) => {
        if (!result.confirm) {
          return
        }

        this.closeQuickEntrySheet({
          force: true,
          discard: true,
          toastTitle: confirmMeta.successToast
        })
      }
    })
  },

  async ensureQuickEntryProjects() {
    if (Array.isArray(this.data.quickEntryProjects) && this.data.quickEntryProjects.length) {
      await this.syncQuickEntryProjectImplicitMemory(this.data.quickEntryProjects)
      const mode = normalizeText(this.data.quickEntryMode) || 'follow_up'
      const draft = this.getQuickEntryDraft(mode)
      if (draft) {
        this.setData(this.buildQuickEntryStateFromDraft(mode, draft, this.data.quickEntryProjects))
      } else {
        this.refreshQuickEntryProjectRecommendation()
      }
      return this.data.quickEntryProjects
    }

    const result = await loadProjectsData()
    const projects = (Array.isArray(result && result.data) ? result.data : []).map(normalizeProjectOption)
    await this.syncQuickEntryProjectImplicitMemory(projects, { force: true })
    this.setData({
      quickEntryProjects: projects,
      quickEntrySheetSource: result && result.source ? result.source : this.data.dataSource
    }, () => {
      const mode = normalizeText(this.data.quickEntryMode) || 'follow_up'
      const draft = this.getQuickEntryDraft(mode)
      if (draft) {
        this.setData(this.buildQuickEntryStateFromDraft(mode, draft, projects))
        return
      }
      this.refreshQuickEntryProjectRecommendation()
    })

    return projects
  },

  setQuickEntryMode(event) {
    const { mode } = event.currentTarget.dataset
    if (!mode || mode === this.data.quickEntryMode) {
      return
    }

    this.stopQuickEntryVoiceInput({ silent: true })
    this.clearQuickEntryAiDebounceTimer()
    this.persistCurrentQuickEntryDraft()
    const draft = this.getQuickEntryDraft(mode)
    this.setData({
      showQuickEntrySuccessPanel: false,
      quickEntrySuccessState: buildQuickEntrySuccessState(),
      ...this.buildQuickEntryStateFromDraft(mode, draft, this.data.quickEntryProjects)
    }, () => {
      if (!draft) {
        this.refreshQuickEntryProjectRecommendation()
      }
    })
  },

  showQuickEntrySuccess(payload = {}) {
    const mode = normalizeText(payload.mode)
    if (mode === 'follow_up') {
      this.clearQuickEntryDraft('follow_up')
      this.closeQuickEntrySheet({
        force: true,
        discard: true,
        toastTitle: normalizeText(payload.toastTitle) || normalizeText(payload.title) || '已保存跟进记录'
      })
      return
    }

    const successState = buildQuickEntrySuccessState({
      visible: true,
      ...payload
    })

    if (typeof wx !== 'undefined' && typeof wx.hideKeyboard === 'function') {
      wx.hideKeyboard()
    }

    this.clearQuickEntryDraftTimer()
    this.setData({
      showQuickEntrySheet: true,
      showQuickEntrySuccessPanel: true,
      quickEntrySuccessState: successState
    })
    this.syncQuickEntryLayout(0, false)
  },

  continueQuickEntryAfterSuccess() {
    const successState = this.data.quickEntrySuccessState || {}
    if (!this.data.showQuickEntrySuccessPanel || !successState.visible) {
      return
    }

    const mode = normalizeText(successState.mode) || 'follow_up'
    const resetState = buildQuickEntryEmptyState(mode, this.data.quickEntryProjects)
    const continueProjectMeta = findQuickEntryProject(this.data.quickEntryProjects, successState.continueProjectId)

    if (continueProjectMeta && mode === 'task') {
      const projectViews = buildQuickEntryProjectViews(
        this.data.quickEntryProjects,
        '',
        continueProjectMeta.id,
        [],
        getQuickEntryRecommendationText(mode, resetState.quickEntryForm)
      )
      resetState.quickEntrySuggestedProjects = projectViews.suggestedProjects
      resetState.quickEntryVisibleProjects = projectViews.visibleProjects
      resetState.quickEntryProjectSelectionMode = 'manual'
      resetState.quickEntrySelectedProjectId = continueProjectMeta.id
      resetState.quickEntrySelectedProjectName = getQuickEntryProjectLabel(continueProjectMeta)
      resetState.quickEntrySelectedProjectMeta = continueProjectMeta
    }

    this.setData({
      showQuickEntrySuccessPanel: false,
      quickEntrySuccessState: buildQuickEntrySuccessState(),
      ...resetState
    })
    this.syncQuickEntryLayout(0, false)
  },

  closeQuickEntryAfterSuccess() {
    this.closeQuickEntrySheet(true)
  },

  openQuickEntrySavedProject() {
    const successState = this.data.quickEntrySuccessState || {}
    const projectId = normalizeText(successState.projectId)
    if (!projectId) {
      this.closeQuickEntrySheet(true)
      return
    }

    const targetUrl = `/pages/project-detail/project-detail?projectId=${projectId}&view=home-quick-entry`
    if (this.quickEntryStandalone) {
      wx.redirectTo({
        url: targetUrl
      })
      return
    }

    this.closeQuickEntrySheet(true)
    wx.navigateTo({
      url: targetUrl
    })
  },

  openQuickEntryVoiceGuide() {
    wx.showModal({
      title: '语音服务未就绪',
      content: '当前设备暂不支持原生录音，或云端语音识别服务尚未完成配置。请先确认真机环境、云函数和腾讯云 ASR 配置。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  openQuickEntryRecordSettingGuide() {
    wx.showModal({
      title: '需要麦克风权限',
      content: '闪录语音需要使用麦克风。请允许录音权限后再试。',
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

  async ensureQuickEntryRecordScope() {
    try {
      const setting = await this.getSetting()
      if (setting && setting.authSetting && setting.authSetting['scope.record']) {
        return true
      }

      await this.authorizeRecordScope()
      return true
    } catch (error) {
      this.openQuickEntryRecordSettingGuide()
      return false
    }
  },

  initQuickEntryVoiceRecognition() {
    if (this.quickEntryVoiceManager) {
      return true
    }

    const manager = getSpeechRecorderManager()
    if (!manager || typeof manager.onStart !== 'function') {
      this.setData({
        isQuickEntryVoiceSupported: false,
        quickEntryVoiceStatusText: '当前微信版本暂不支持语音闪录，请升级后再试',
        quickEntryVoicePreviewText: ''
      })
      return false
    }

    manager.onStart(() => {
      if (this.activeVoiceScene && this.activeVoiceScene !== 'quick_entry') {
        return
      }

      if (!this.isPageActive) {
        return
      }

      this.skipQuickEntryVoiceCommit = false
      startVoiceRecordingTicker(this, 'quickEntryVoiceTimer', 'quickEntryVoiceElapsedText')
      this.hideQuickEntryVoiceExampleHint()
      const displayState = buildQuickEntryFollowUpDisplayState({
        followUpContent: this.data.quickEntryForm.followUpContent,
        voicePreviewText: '',
        aiError: '',
        aiSummary: null,
        aiProjectMatch: null,
        aiNextSuggestion: null,
        isVoiceRecording: true,
        isVoiceRecognizing: false,
        isAiLoading: false,
        manualInputEnabled: this.data.quickEntryManualInputEnabled,
        flowStage: 'capture'
      })
      this.setData({
        isQuickEntryVoiceSupported: true,
        isQuickEntryVoiceRecording: true,
        isQuickEntryVoiceRecognizing: false,
        quickEntryVoicePhase: 'recording',
        quickEntryVoiceStatusText: '录音中，再点一次结束并自动识别',
        quickEntryAiLoadingHint: getQuickEntryAiLoadingHint(),
        quickEntryVoicePreviewText: '',
        quickEntryAiError: '',
        ...displayState,
        ...buildQuickEntryFollowUpSubmitState({
          followUpContent: this.data.quickEntryForm.followUpContent,
          selectedProjectId: this.data.quickEntrySelectedProjectId,
          stage: 'capture',
          isVoiceRecording: true
        })
      })
    })

    manager.onStop(async (result) => {
      stopVoiceRecordingTicker(this, 'quickEntryVoiceTimer', 'quickEntryVoiceElapsedText')

      if (this.activeVoiceScene && this.activeVoiceScene !== 'quick_entry') {
        return
      }

      if (this.skipQuickEntryVoiceCommit) {
        this.skipQuickEntryVoiceCommit = false
        this.activeVoiceScene = ''
        this.setData({
          isQuickEntryVoiceRecording: false,
          isQuickEntryVoiceRecognizing: false,
          quickEntryVoicePhase: 'idle',
          quickEntryVoicePreviewText: '',
          quickEntryVoiceStatusText: '',
          quickEntryAiLoadingHint: getQuickEntryAiLoadingHint(),
          ...buildQuickEntryFollowUpSubmitState({
            followUpContent: this.data.quickEntryForm.followUpContent,
            selectedProjectId: this.data.quickEntrySelectedProjectId,
            stage: this.data.quickEntryFollowUpStage
          })
        })
        return
      }

      if (!this.isPageActive) {
        this.activeVoiceScene = ''
        return
      }

      this.setData({
        isQuickEntryVoiceRecording: false,
        isQuickEntryVoiceRecognizing: true,
        quickEntryVoicePhase: 'uploading',
        quickEntryVoicePreviewText: '',
        quickEntryVoiceStatusText: '录音上传中...',
        quickEntryAiLoadingHint: getQuickEntryAiLoadingHint(),
        ...buildQuickEntryFollowUpSubmitState({
          followUpContent: this.data.quickEntryForm.followUpContent,
          selectedProjectId: this.data.quickEntrySelectedProjectId,
          stage: 'capture',
          isVoiceRecognizing: true
        })
      })

      await this.transcribeQuickEntryVoiceFile(result)
    })

    manager.onError((error) => {
      if (this.activeVoiceScene && this.activeVoiceScene !== 'quick_entry') {
        return
      }

      if (!this.isPageActive) {
        this.activeVoiceScene = ''
        return
      }

      this.activeVoiceScene = ''
      stopVoiceRecordingTicker(this, 'quickEntryVoiceTimer', 'quickEntryVoiceElapsedText')
      const errMsg = error && (error.retmsg || error.msg || error.errMsg)
        ? (error.retmsg || error.msg || error.errMsg)
        : ''
      this.setData({
        isQuickEntryVoiceRecording: false,
        isQuickEntryVoiceRecognizing: false,
        quickEntryVoicePhase: 'error',
        quickEntryVoicePreviewText: '',
        quickEntryVoiceStatusText: errMsg ? `语音识别失败：${errMsg}` : '语音识别失败，请稍后再试',
        quickEntryAiLoadingHint: getQuickEntryAiLoadingHint(),
        ...buildQuickEntryFollowUpSubmitState({
          followUpContent: this.data.quickEntryForm.followUpContent,
          selectedProjectId: this.data.quickEntrySelectedProjectId,
          stage: this.data.quickEntryFollowUpStage
        })
      })

      if (errMsg && (errMsg.includes('auth deny') || errMsg.includes('auth denied') || errMsg.includes('permission'))) {
        this.openQuickEntryRecordSettingGuide()
        return
      }

      wx.showToast({
        title: '语音录入失败',
        icon: 'none'
      })
    })

    this.quickEntryVoiceManager = manager
    this.setData({
      isQuickEntryVoiceSupported: true
    })
    return true
  },

  async startQuickEntryVoiceInput() {
    if (this.data.isQuickEntryVoiceRecognizing || this.data.isQuickEntryAiLoading) {
      return
    }

    if (this.data.isQuickEntryVoiceRecording) {
      this.stopQuickEntryVoiceInput()
      return
    }

    if (!this.initQuickEntryVoiceRecognition()) {
      this.openQuickEntryVoiceGuide()
      return
    }

    const decision = await ensureActionAllowed('speech', { guide: true })
    if (!decision.allowed) {
      return
    }

    const hasPermission = await this.ensureQuickEntryRecordScope()
    if (!hasPermission) {
      return
    }

    try {
      this.activeVoiceScene = 'quick_entry'
      this.setData({
        isQuickEntryVoiceRecognizing: false,
        quickEntryVoicePhase: 'recording',
        quickEntryVoicePreviewText: '',
        quickEntryVoiceStatusText: '正在启动录音...',
        quickEntryAiLoadingHint: getQuickEntryAiLoadingHint(),
        ...buildQuickEntryFollowUpSubmitState({
          followUpContent: this.data.quickEntryForm.followUpContent,
          selectedProjectId: this.data.quickEntrySelectedProjectId,
          stage: 'capture',
          isVoiceRecording: true
        })
      })

      this.quickEntryVoiceManager.start({
        duration: MAX_RECORD_DURATION,
        format: 'mp3',
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 32000
      })
    } catch (error) {
      this.activeVoiceScene = ''
      this.setData({
        isQuickEntryVoiceRecording: false,
        isQuickEntryVoiceRecognizing: false,
        quickEntryVoicePhase: 'error',
        quickEntryVoicePreviewText: '',
        quickEntryVoiceStatusText: '录音启动失败，请重新试一次',
        quickEntryAiLoadingHint: getQuickEntryAiLoadingHint(),
        ...buildQuickEntryFollowUpSubmitState({
          followUpContent: this.data.quickEntryForm.followUpContent,
          selectedProjectId: this.data.quickEntrySelectedProjectId,
          stage: this.data.quickEntryFollowUpStage
        })
      })
      wx.showToast({
        title: '录音启动失败',
        icon: 'none'
      })
    }
  },

  stopQuickEntryVoiceInput(options = {}) {
    if (!this.quickEntryVoiceManager || !this.data.isQuickEntryVoiceRecording) {
      return
    }

    this.skipQuickEntryVoiceCommit = Boolean(options.silent)
    stopVoiceRecordingTicker(this, 'quickEntryVoiceTimer', 'quickEntryVoiceElapsedText')

    this.setData({
      isQuickEntryVoiceRecording: false,
      isQuickEntryVoiceRecognizing: true,
      quickEntryVoicePhase: options.silent ? 'idle' : 'uploading',
      quickEntryVoiceStatusText: options.silent ? '语音闪录已结束' : '语音识别中...',
      quickEntryAiLoadingHint: getQuickEntryAiLoadingHint(),
      quickEntryVoicePreviewText: options.silent ? '' : this.data.quickEntryVoicePreviewText,
      ...buildQuickEntryFollowUpSubmitState({
        followUpContent: this.data.quickEntryForm.followUpContent,
        selectedProjectId: this.data.quickEntrySelectedProjectId,
        stage: options.silent ? this.data.quickEntryFollowUpStage : 'capture',
        isVoiceRecognizing: !options.silent
      })
    })

    try {
      this.quickEntryVoiceManager.stop()
    } catch (error) {
      this.activeVoiceScene = ''
      this.setData({
        isQuickEntryVoiceRecognizing: false,
        quickEntryVoicePhase: 'error',
        quickEntryVoiceStatusText: '录音结束失败，请重新试一次',
        quickEntryAiLoadingHint: getQuickEntryAiLoadingHint(),
        ...buildQuickEntryFollowUpSubmitState({
          followUpContent: this.data.quickEntryForm.followUpContent,
          selectedProjectId: this.data.quickEntrySelectedProjectId,
          stage: this.data.quickEntryFollowUpStage
        })
      })
    }
  },

  async uploadQuickEntryVoiceFile(filePath) {
    if (!wx.cloud || typeof wx.cloud.uploadFile !== 'function') {
      throw new Error('当前环境未连接云存储')
    }

    const extension = getVoiceFileExtension(filePath)
    const cloudPath = `voiceInputs/quick-entry/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
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

  async transcribeQuickEntryVoiceFile(result = {}) {
    const filePath = normalizeText(result.tempFilePath)
    if (!filePath) {
      this.activeVoiceScene = ''
      this.setData({
        isQuickEntryVoiceRecording: false,
        isQuickEntryVoiceRecognizing: false,
        quickEntryVoicePhase: 'error',
        quickEntryVoicePreviewText: '',
        quickEntryVoiceStatusText: '本次录音未生成有效音频，请重新试一次',
        quickEntryAiLoadingHint: getQuickEntryAiLoadingHint(),
        ...buildQuickEntryFollowUpSubmitState({
          followUpContent: this.data.quickEntryForm.followUpContent,
          selectedProjectId: this.data.quickEntrySelectedProjectId,
          stage: this.data.quickEntryFollowUpStage
        })
      })
      return
    }

    try {
      const uploadResult = await this.uploadQuickEntryVoiceFile(filePath)
      if (!this.isPageActive) {
        this.activeVoiceScene = ''
        this.setData({
          isQuickEntryVoiceRecording: false,
          isQuickEntryVoiceRecognizing: false,
          quickEntryVoicePhase: 'idle',
          quickEntryVoicePreviewText: '',
          quickEntryVoiceStatusText: '',
          quickEntryAiLoadingHint: getQuickEntryAiLoadingHint(),
          ...buildQuickEntryFollowUpSubmitState({
            followUpContent: this.data.quickEntryForm.followUpContent,
            selectedProjectId: this.data.quickEntrySelectedProjectId,
            stage: this.data.quickEntryFollowUpStage
          })
        })
        return
      }

      this.setData({
        quickEntryVoicePhase: 'recognizing',
        quickEntryVoiceStatusText: '语音识别中...',
        quickEntryAiLoadingHint: getQuickEntryAiLoadingHint(),
        ...buildQuickEntryFollowUpSubmitState({
          followUpContent: this.data.quickEntryForm.followUpContent,
          selectedProjectId: this.data.quickEntrySelectedProjectId,
          isVoiceRecognizing: true
        })
      })

      const asrResult = await requestSpeechToTextData({
        fileID: uploadResult.fileID,
        voiceFormat: uploadResult.extension,
        projectId: this.data.quickEntrySelectedProjectId || '',
        scene: 'home_quick_entry_follow_up',
        duration: Number(result.duration || 0) || 0
      })

      const recognizedText = normalizeRecognizedText(asrResult && asrResult.text)
      if (!recognizedText) {
        this.activeVoiceScene = ''
        this.setData({
          isQuickEntryVoiceRecording: false,
          isQuickEntryVoiceRecognizing: false,
          quickEntryVoicePhase: 'error',
          quickEntryVoicePreviewText: '',
          quickEntryVoiceStatusText: '这次没有识别出有效内容，可以再试一次',
          quickEntryAiLoadingHint: getQuickEntryAiLoadingHint(),
          ...buildQuickEntryFollowUpSubmitState({
            followUpContent: this.data.quickEntryForm.followUpContent,
            selectedProjectId: this.data.quickEntrySelectedProjectId,
            stage: this.data.quickEntryFollowUpStage
          })
        })
        return
      }

      this.activeVoiceScene = ''
      this.setData({
        'quickEntryForm.followUpContent': recognizedText,
        isQuickEntryVoiceRecording: false,
        isQuickEntryVoiceRecognizing: false,
        quickEntryVoicePhase: 'understanding',
        quickEntryVoicePreviewText: recognizedText,
        quickEntryVoiceStatusText: `已识别 ${recognizedText.length} 个字，正在理解项目内容...`,
        quickEntryAiLoadingHint: getQuickEntryAiLoadingHint('matching'),
        quickEntryAiError: '',
        quickEntryAiNextSuggestionError: '',
        quickEntryAiProjectMatch: null,
        quickEntryAiProjectCandidateIds: [],
        quickEntryAiSummary: null,
        quickEntryAiSummaryDraft: null,
        quickEntryAiNextSuggestion: null,
        quickEntryAiNextSuggestionDraft: null,
        quickEntryAiHasExtendedDetails: false,
        quickEntryAiShowFullResult: false,
        quickEntryEditingAiSummary: false,
        quickEntryEditingAiNextSuggestion: false,
        quickEntryShowReviewSettings: false,
        quickEntryCreateNextTask: false,
        quickEntryFollowUpPendingAction: '',
        ...buildQuickEntryTaskDraftState(),
        ...buildQuickEntryFollowUpDisplayState({
          followUpContent: recognizedText,
          voicePreviewText: recognizedText,
          isVoiceRecording: false,
          isVoiceRecognizing: false,
          isAiLoading: false,
          manualInputEnabled: this.data.quickEntryManualInputEnabled,
          selectedProjectId: this.data.quickEntrySelectedProjectId,
          flowStage: 'content'
        }),
        ...buildQuickEntryFollowUpSubmitState({
          followUpContent: recognizedText,
          selectedProjectId: this.data.quickEntrySelectedProjectId,
          stage: 'content',
          createNextTask: false
        })
      })

      await this.ensureQuickEntryProjects()
      this.refreshQuickEntryProjectRecommendation({
        followUpContent: recognizedText
      })
      this.scheduleQuickEntryDraftPersist()
    } catch (error) {
      const errMsg = error && error.message ? error.message : ''
      this.activeVoiceScene = ''
      this.setData({
        isQuickEntryVoiceRecording: false,
        isQuickEntryVoiceRecognizing: false,
        quickEntryVoicePhase: 'error',
        quickEntryVoicePreviewText: '',
        quickEntryVoiceStatusText: errMsg ? `语音识别失败：${errMsg}` : '语音识别失败，请稍后再试',
        quickEntryAiLoadingHint: getQuickEntryAiLoadingHint(),
        ...buildQuickEntryFollowUpSubmitState({
          followUpContent: this.data.quickEntryForm.followUpContent,
          selectedProjectId: this.data.quickEntrySelectedProjectId,
          stage: this.data.quickEntryFollowUpStage
        })
      })

      if (/密钥|SECRET|语音识别服务/.test(errMsg)) {
        this.openQuickEntryVoiceGuide()
        return
      }

      wx.showToast({
        title: '语音识别失败',
        icon: 'none'
      })
    }
  },

  buildQuickEntryFollowUpProjectContext(projectMeta = null) {
    const currentProject = projectMeta || this.data.quickEntrySelectedProjectMeta || null
    return {
      projectName: normalizeText(currentProject && currentProject.name),
      clientName: normalizeText(currentProject && currentProject.client),
      stage: normalizeText(currentProject && currentProject.stage) || '线索',
      description: normalizeText(currentProject && currentProject.latestSummary)
    }
  },

  async runQuickEntryAiPipeline(options = {}) {
    const content = normalizeText(options.content || this.data.quickEntryForm.followUpContent)
    if (!content || this.data.isQuickEntryAiLoading) {
      return
    }

    const currentStage = normalizeQuickEntryFollowUpStage(this.data.quickEntryFollowUpStage) || 'project'
    const requestNow = new Date()
    const detectedFollowUpMeta = buildDetectedQuickEntryFollowUpMeta(content, requestNow)

    const decision = await ensureActionAllowed('ai', { guide: true })
    if (!decision.allowed) {
      this.setData({
        isQuickEntryAiLoading: false,
        quickEntryVoicePhase: 'error',
        quickEntryAiError: decision.message || '当前无法继续智能理解',
        quickEntryAiNextSuggestionError: '',
        quickEntryAiLoadingHint: getQuickEntryAiLoadingHint(),
        ...buildQuickEntryFollowUpDisplayState({
          followUpContent: content,
          voicePreviewText: this.data.quickEntryVoicePreviewText,
          aiError: decision.message || '当前无法继续智能理解',
          manualInputEnabled: this.data.quickEntryManualInputEnabled,
          selectedProjectId: this.data.quickEntrySelectedProjectId,
          flowStage: currentStage
        }),
        quickEntryVoiceStatusText: '内容已转成文字，可手动修改或稍后再试智能理解',
        ...buildQuickEntryFollowUpSubmitState({
          followUpContent: content,
          selectedProjectId: this.data.quickEntrySelectedProjectId,
          aiProjectMatch: this.data.quickEntryAiProjectMatch,
          aiSummary: this.data.quickEntryAiSummary,
          aiNextSuggestion: this.data.quickEntryAiNextSuggestion,
          stage: currentStage,
          aiError: decision.message || '当前无法继续智能理解',
          createNextTask: false
        })
      }, () => {
        this.scheduleQuickEntryDraftPersist()
      })
      return
    }

    this.clearQuickEntryAiDebounceTimer()

    const projects = Array.isArray(this.data.quickEntryProjects) ? this.data.quickEntryProjects : []
    let targetProjectId = normalizeText(this.data.quickEntrySelectedProjectId)
    let targetProjectMeta = this.data.quickEntrySelectedProjectMeta || null
    let targetSelectionMode = this.data.quickEntryProjectSelectionMode
    let projectMatch = this.data.quickEntryAiProjectMatch || null
    let candidateIds = Array.isArray(this.data.quickEntryAiProjectCandidateIds)
      ? this.data.quickEntryAiProjectCandidateIds.slice(0, 5)
      : []

    if (currentStage === 'project' || currentStage === 'review') {
      targetProjectId = normalizeText(this.data.quickEntrySelectedProjectId)
      targetProjectMeta = this.data.quickEntrySelectedProjectMeta || null
    } else if (!(targetSelectionMode === 'manual' && targetProjectId)) {
      targetProjectId = ''
      targetProjectMeta = null
    }

    this.setData({
        isQuickEntryAiLoading: true,
        quickEntryVoicePhase: 'understanding',
        quickEntryAiError: '',
        quickEntryAiNextSuggestionError: '',
        quickEntryAiSummary: null,
        quickEntryAiSummaryDraft: null,
        quickEntryAiNextSuggestion: null,
        quickEntryAiNextSuggestionDraft: null,
        quickEntryAiHasExtendedDetails: false,
        quickEntryAiShowFullResult: false,
        quickEntryEditingAiSummary: false,
        quickEntryEditingAiNextSuggestion: false,
        quickEntryShowReviewSettings: false,
        quickEntryCreateNextTask: false,
        quickEntryFollowUpPendingAction: '',
        ...buildQuickEntryTaskDraftState(),
        quickEntryAiLoadingHint: getQuickEntryAiLoadingHint('matching'),
        ...buildQuickEntryFollowUpDisplayState({
          followUpContent: content,
          voicePreviewText: this.data.quickEntryVoicePreviewText,
          isVoiceRecording: this.data.isQuickEntryVoiceRecording,
          isVoiceRecognizing: this.data.isQuickEntryVoiceRecognizing,
          isAiLoading: true,
          manualInputEnabled: this.data.quickEntryManualInputEnabled,
          selectedProjectId: targetProjectId,
          flowStage: 'project'
        }),
        quickEntryVoiceStatusText: options.triggerSource === 'voice'
          ? '已转成文字，正在生成整理结果...'
          : this.data.quickEntryVoiceStatusText,
        ...buildQuickEntryFollowUpSubmitState({
          followUpContent: content,
          selectedProjectId: targetProjectId,
          aiProjectMatch: projectMatch,
          stage: 'project',
          isAiLoading: true,
          createNextTask: false
        })
      })

    try {
      if (!targetProjectId) {
        const candidates = buildQuickEntryProjectResolutionCandidates(projects, content)
        const resolutionResult = await requestQuickEntryProjectResolution({
          content,
          candidates
        })

        if (!resolutionResult || !resolutionResult.ok) {
          throw new Error(resolutionResult && resolutionResult.message ? resolutionResult.message : '当前无法识别关联项目')
        }

        projectMatch = normalizeQuickEntryProjectMatch({
          ...resolutionResult,
          generatedAt: resolutionResult.generatedAt || new Date().toISOString()
        }, projects)
        candidateIds = projectMatch.candidateIds.length
          ? projectMatch.candidateIds
          : candidates.map((item) => item.id)

        if (projectMatch.confidence === 'high' && projectMatch.matchedProjectId) {
          targetProjectId = projectMatch.matchedProjectId
          targetProjectMeta = findQuickEntryProject(projects, targetProjectId)
          targetSelectionMode = 'ai_auto'
        } else {
          targetProjectId = ''
          targetProjectMeta = null
          targetSelectionMode = projectMatch.status === 'candidates' ? 'ai_pending' : ''
        }
      } else {
        candidateIds = candidateIds.length ? candidateIds : []
      }

      this.setData({
        quickEntryAiLoadingHint: getQuickEntryAiLoadingHint('summarizing')
      })

      const projectViews = buildQuickEntryProjectViews(
        projects,
        this.data.quickEntryProjectKeyword,
        targetProjectId,
        candidateIds,
        content
      )

      this.setData({
        quickEntryAiProjectMatch: projectMatch,
        quickEntryAiProjectCandidateIds: candidateIds,
        quickEntrySuggestedProjects: projectViews.suggestedProjects,
        quickEntryVisibleProjects: projectViews.visibleProjects,
        quickEntryProjectSelectionMode: targetSelectionMode,
        quickEntrySelectedProjectId: targetProjectId,
        quickEntrySelectedProjectName: targetProjectId ? getQuickEntryProjectLabel(targetProjectMeta) : '未关联项目',
        quickEntrySelectedProjectMeta: targetProjectMeta,
        quickEntryAiLoadingHint: targetProjectId
          ? getQuickEntryAiLoadingHint('summarizing')
          : projectMatch && projectMatch.status === 'candidates'
            ? getQuickEntryAiLoadingHint('waiting_project')
            : getQuickEntryAiLoadingHint('summarizing'),
        quickEntryVoiceStatusText: targetProjectId
          ? '项目已确认，正在生成整理结果...'
          : projectMatch && projectMatch.status === 'candidates'
            ? '已找到候选项目，正在整理内容'
            : '正在整理内容',
        ...buildQuickEntryFollowUpSubmitState({
          followUpContent: content,
          selectedProjectId: targetProjectId,
          aiProjectMatch: projectMatch,
          stage: 'project',
          isAiLoading: true
        })
      })

      if (targetProjectId && targetProjectMeta && targetSelectionMode === 'ai_auto') {
        const autoLearnAliases = buildQuickEntryAliasTokensFromContent(content, targetProjectMeta).slice(0, 3)
        if (autoLearnAliases.length) {
          this.rememberQuickEntryProjectImplicitMemory(
            targetProjectId,
            autoLearnAliases,
            'ai_high_confidence'
          )
        }
        this.recordQuickEntryProjectAliasHit(targetProjectId, content, targetProjectMeta, 'ai_auto')
      }

      const summaryPayload = {
        projectId: targetProjectId,
        method: this.data.quickEntryFollowUpMethodTouched ? this.data.quickEntryForm.followUpMethod : '',
        content,
        stageChange: ''
      }

      summaryPayload.referenceNowDate = detectedFollowUpMeta.referenceNowMeta.followUpOccurredDate
      summaryPayload.referenceNowTime = detectedFollowUpMeta.referenceNowMeta.followUpOccurredTime
      summaryPayload.detectedFollowUpMethod = detectedFollowUpMeta.detectedMethod
      summaryPayload.detectedFollowUpOccurredDate = detectedFollowUpMeta.detectedOccurredMeta.followUpOccurredDate
      summaryPayload.detectedFollowUpOccurredTime = detectedFollowUpMeta.detectedOccurredMeta.followUpOccurredTime
      summaryPayload.detectedFollowUpOccurredTimePrecision = detectedFollowUpMeta.detectedOccurredMeta.followUpOccurredTimePrecision

      if (targetProjectId && targetProjectMeta) {
        summaryPayload.projectContext = this.buildQuickEntryFollowUpProjectContext(targetProjectMeta)
      }

      const summaryResult = await requestFollowUpSummary(summaryPayload)

      if (!summaryResult || !summaryResult.ok) {
        throw new Error(summaryResult && summaryResult.message ? summaryResult.message : '当前无法生成闪录整理结果')
      }

      const normalizedSummary = normalizeQuickEntryAiSummary({
        ...summaryResult,
        generatedAt: summaryResult.generatedAt || new Date().toISOString(),
        currentStage: normalizeText(targetProjectMeta && targetProjectMeta.stage) || '线索'
      })

      let nextSuggestion = null
      let nextSuggestionError = ''
      if (targetProjectId) {
        this.setData({
          quickEntryAiLoadingHint: getQuickEntryAiLoadingHint('planning')
        })
        try {
          const nextResult = await requestNextFollowUpSuggestion({
            projectId: targetProjectId,
            currentSummary: normalizedSummary.summary
          })

          if (!nextResult || !nextResult.ok) {
            throw new Error(nextResult && nextResult.message ? nextResult.message : '当前无法生成下一步建议')
          }

          nextSuggestion = normalizeQuickEntryAiNextSuggestion({
            ...nextResult,
            generatedAt: nextResult.generatedAt || new Date().toISOString()
          })
        } catch (nextError) {
          nextSuggestionError = nextError && nextError.message
            ? nextError.message
            : '当前无法生成下一步建议，请稍后再试'
        }
      }

      this.setData({
        quickEntryAiSummary: normalizedSummary,
        quickEntryAiSummaryDraft: cloneQuickEntryAiSummary(normalizedSummary),
        quickEntryAiNextSuggestion: nextSuggestion,
        quickEntryAiNextSuggestionDraft: cloneQuickEntryAiNextSuggestion(nextSuggestion),
        quickEntryAiNextSuggestionError: nextSuggestionError,
        quickEntryAiHasExtendedDetails: getQuickEntryAiHasExtendedDetails(normalizedSummary, nextSuggestion),
        quickEntryAiShowFullResult: false,
        quickEntryEditingAiSummary: false,
        quickEntryEditingAiNextSuggestion: false,
        quickEntryShowProjectSearch: false,
        quickEntryShowReviewSettings: false,
        quickEntryCreateNextTask: false,
        quickEntryFollowUpPendingAction: '',
        ...buildQuickEntryTaskDraftState({
          nextSuggestion,
          nextTaskDraft: nextSuggestion
            ? buildQuickEntrySuggestedTaskDraft(nextSuggestion)
            : buildQuickEntryNextTaskDraft(),
          titleTouched: false,
          timeTouched: false
        }),
        ...buildQuickEntryFollowUpMetaPatch({
          aiSummary: normalizedSummary,
          detectedMethod: detectedFollowUpMeta.detectedMethod,
          detectedOccurredMeta: detectedFollowUpMeta.detectedOccurredMeta,
          fallbackMethod: this.data.quickEntryForm.followUpMethod || '其他',
          methodTouched: this.data.quickEntryFollowUpMethodTouched,
          dateTouched: this.data.quickEntryFollowUpDateTouched,
          clockTouched: this.data.quickEntryFollowUpClockTouched,
          allowMethodDefault: true,
          allowOccurredDefault: true,
          now: requestNow
        }),
        quickEntryVoicePhase: 'done',
        quickEntryAiLoadingHint: targetProjectId
          ? getQuickEntryAiLoadingHint('planning')
          : getQuickEntryAiLoadingHint('waiting_project'),
        ...buildQuickEntryFollowUpDisplayState({
          followUpContent: content,
          voicePreviewText: this.data.quickEntryVoicePreviewText,
          aiSummary: normalizedSummary,
          aiProjectMatch: projectMatch,
          aiNextSuggestion: nextSuggestion,
          isVoiceRecording: false,
          isVoiceRecognizing: false,
          isAiLoading: false,
          manualInputEnabled: this.data.quickEntryManualInputEnabled,
          selectedProjectId: targetProjectId,
          flowStage: 'review'
        }),
        quickEntryVoiceStatusText: nextSuggestionError ? '摘要已生成，可直接保存或重试下一步建议' : '',
        ...buildQuickEntryFollowUpSubmitState({
          followUpContent: content,
          selectedProjectId: targetProjectId,
          aiProjectMatch: projectMatch,
          aiSummary: normalizedSummary,
          aiNextSuggestion: nextSuggestion,
          stage: 'review',
          createNextTask: false
        })
      })
      this.scheduleQuickEntryDraftPersist()
      if (nextSuggestionError) {
        wx.showToast({
          title: '下一步建议暂未生成',
          icon: 'none'
        })
      }
    } catch (error) {
      this.setData({
        quickEntryVoicePhase: 'error',
        quickEntryAiError: error.message || '当前无法理解这条闪录内容，请稍后再试',
        quickEntryAiNextSuggestionError: '',
        quickEntryAiSummaryDraft: null,
        quickEntryAiNextSuggestionDraft: null,
        quickEntryShowReviewSettings: false,
        quickEntryCreateNextTask: false,
        quickEntryFollowUpPendingAction: '',
        ...buildQuickEntryTaskDraftState(),
        ...buildQuickEntryFollowUpMetaPatch({
          detectedMethod: detectedFollowUpMeta.detectedMethod,
          detectedOccurredMeta: detectedFollowUpMeta.detectedOccurredMeta,
          fallbackMethod: this.data.quickEntryForm.followUpMethod || '其他',
          methodTouched: this.data.quickEntryFollowUpMethodTouched,
          dateTouched: this.data.quickEntryFollowUpDateTouched,
          clockTouched: this.data.quickEntryFollowUpClockTouched,
          allowMethodDefault: false,
          allowOccurredDefault: false,
          now: requestNow
        }),
        quickEntryAiLoadingHint: getQuickEntryAiLoadingHint(),
        ...buildQuickEntryFollowUpDisplayState({
          followUpContent: content,
          voicePreviewText: this.data.quickEntryVoicePreviewText,
          aiError: error.message || '当前无法理解这条闪录内容，请稍后再试',
          isVoiceRecording: false,
          isVoiceRecognizing: false,
          isAiLoading: false,
          manualInputEnabled: this.data.quickEntryManualInputEnabled,
          selectedProjectId: targetProjectId,
          flowStage: targetProjectId ? 'project' : 'content'
        }),
        quickEntryVoiceStatusText: '内容已保留，可修改后重新发起 AI 整理',
        ...buildQuickEntryFollowUpSubmitState({
          followUpContent: content,
          selectedProjectId: targetProjectId,
          aiProjectMatch: projectMatch,
          stage: targetProjectId ? 'project' : 'content',
          aiError: error.message || '当前无法理解这条闪录内容，请稍后再试',
          createNextTask: false
        })
      })
      this.scheduleQuickEntryDraftPersist()
      wx.showToast({
        title: error.message || '当前无法理解这条闪录内容',
        icon: 'none'
      })
    } finally {
      this.setData({
        isQuickEntryAiLoading: false
      })
    }
  },

  retryQuickEntryAiPipeline() {
    if (this.data.isQuickEntryAiLoading || this.data.isQuickEntryVoiceRecognizing || this.data.isQuickEntryVoiceRecording) {
      return
    }

    if (!normalizeText(this.data.quickEntryForm.followUpContent)) {
      wx.showToast({
        title: '请先输入或录入跟进内容',
        icon: 'none'
      })
      return
    }

    if (this.data.quickEntryFollowUpStage === 'project' && !normalizeText(this.data.quickEntrySelectedProjectId)) {
      wx.showToast({
        title: '请先确认项目',
        icon: 'none'
      })
      return
    }

    this.refreshQuickEntryProjectRecommendation()
    this.runQuickEntryAiPipeline({
      content: this.data.quickEntryForm.followUpContent,
      triggerSource: 'manual'
    })
  },

  async retryQuickEntryNextSuggestion() {
    if (this.data.isQuickEntryAiLoading || this.data.isQuickEntryVoiceRecognizing || this.data.isQuickEntryVoiceRecording) {
      return
    }

    const projectId = normalizeText(this.data.quickEntrySelectedProjectId)
    const summary = this.data.quickEntryAiSummary
    const currentSummary = normalizeText(summary && summary.summary)

    if (!projectId || !currentSummary) {
      wx.showToast({
        title: '请先完成摘要和项目确认',
        icon: 'none'
      })
      return
    }

    const decision = await ensureActionAllowed('ai', { guide: true })
    if (!decision.allowed) {
      return
    }

    this.setData({
      isQuickEntryAiLoading: true,
      quickEntryAiNextSuggestionError: '',
      quickEntryCreateNextTask: false,
      quickEntryFollowUpPendingAction: '',
      quickEntryAiLoadingHint: getQuickEntryAiLoadingHint('planning'),
      quickEntryVoiceStatusText: '摘要已生成，正在补下一步建议...',
      ...buildQuickEntryFollowUpSubmitState({
        followUpContent: this.data.quickEntryForm.followUpContent,
        selectedProjectId: projectId,
        aiProjectMatch: this.data.quickEntryAiProjectMatch,
        stage: 'review',
        isAiLoading: true,
        createNextTask: false
      })
    })

    try {
      const nextResult = await requestNextFollowUpSuggestion({
        projectId,
        currentSummary
      })

      if (!nextResult || !nextResult.ok) {
        throw new Error(nextResult && nextResult.message ? nextResult.message : '当前无法生成下一步建议')
      }

      const nextSuggestion = normalizeQuickEntryAiNextSuggestion({
        ...nextResult,
        generatedAt: nextResult.generatedAt || new Date().toISOString()
      })

      this.setData({
        quickEntryAiNextSuggestion: nextSuggestion,
        quickEntryAiNextSuggestionDraft: cloneQuickEntryAiNextSuggestion(nextSuggestion),
        quickEntryAiNextSuggestionError: '',
        quickEntryAiHasExtendedDetails: getQuickEntryAiHasExtendedDetails(this.data.quickEntryAiSummary, nextSuggestion),
        quickEntryShowReviewSettings: false,
        quickEntryFollowUpPendingAction: '',
        ...buildQuickEntryTaskDraftState({
          nextSuggestion,
          nextTaskDraft: this.data.quickEntryNextTaskDraft,
          selectedTimeSelection: this.data.quickEntryNextTaskTimeSelection,
          titleTouched: this.data.quickEntryNextTaskTitleTouched,
          timeTouched: this.data.quickEntryNextTaskTimeTouched
        }),
        quickEntryAiLoadingHint: getQuickEntryAiLoadingHint('planning'),
        quickEntryVoiceStatusText: '',
        ...buildQuickEntryFollowUpDisplayState({
          followUpContent: this.data.quickEntryForm.followUpContent,
          voicePreviewText: this.data.quickEntryVoicePreviewText,
          aiSummary: this.data.quickEntryAiSummary,
          aiProjectMatch: this.data.quickEntryAiProjectMatch,
          aiNextSuggestion: nextSuggestion,
          manualInputEnabled: this.data.quickEntryManualInputEnabled,
          selectedProjectId: projectId
        }),
        ...buildQuickEntryFollowUpSubmitState({
          followUpContent: this.data.quickEntryForm.followUpContent,
          selectedProjectId: projectId,
          aiProjectMatch: this.data.quickEntryAiProjectMatch,
          stage: 'review',
          createNextTask: false
        })
      })
      this.scheduleQuickEntryDraftPersist()
    } catch (error) {
      const errorMessage = error && error.message ? error.message : '当前无法生成下一步建议，请稍后再试'
      this.setData({
        quickEntryAiNextSuggestion: null,
        quickEntryAiNextSuggestionDraft: null,
        quickEntryAiNextSuggestionError: errorMessage,
        quickEntryAiHasExtendedDetails: getQuickEntryAiHasExtendedDetails(this.data.quickEntryAiSummary, null),
        quickEntryFollowUpPendingAction: '',
        ...buildQuickEntryTaskDraftState(),
        quickEntryAiLoadingHint: getQuickEntryAiLoadingHint(),
        quickEntryVoiceStatusText: '摘要已生成，可直接保存或重试下一步建议',
        ...buildQuickEntryFollowUpDisplayState({
          followUpContent: this.data.quickEntryForm.followUpContent,
          voicePreviewText: this.data.quickEntryVoicePreviewText,
          aiSummary: this.data.quickEntryAiSummary,
          aiProjectMatch: this.data.quickEntryAiProjectMatch,
          manualInputEnabled: this.data.quickEntryManualInputEnabled,
          selectedProjectId: projectId
        }),
        ...buildQuickEntryFollowUpSubmitState({
          followUpContent: this.data.quickEntryForm.followUpContent,
          selectedProjectId: projectId,
          aiProjectMatch: this.data.quickEntryAiProjectMatch,
          stage: 'review',
          createNextTask: false
        })
      })
      this.scheduleQuickEntryDraftPersist()
      wx.showToast({
        title: '下一步建议暂未生成',
        icon: 'none'
      })
    } finally {
      this.setData({
        isQuickEntryAiLoading: false
      })
    }
  },

  onQuickEntryProjectSearch(event) {
    const keyword = String(event.detail.value || '')
    const projectViews = buildQuickEntryProjectViews(
      this.data.quickEntryProjects,
      keyword,
      this.data.quickEntrySelectedProjectId,
      this.data.quickEntryAiProjectCandidateIds,
      getQuickEntryRecommendationText(this.data.quickEntryMode, this.data.quickEntryForm)
    )
    this.setData({
      quickEntryProjectKeyword: keyword,
      quickEntryVisibleProjects: projectViews.visibleProjects
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  clearQuickEntryProjectSearch() {
    const projectViews = buildQuickEntryProjectViews(
      this.data.quickEntryProjects,
      '',
      this.data.quickEntrySelectedProjectId,
      this.data.quickEntryAiProjectCandidateIds,
      getQuickEntryRecommendationText(this.data.quickEntryMode, this.data.quickEntryForm)
    )
    this.setData({
      quickEntryProjectKeyword: '',
      quickEntryVisibleProjects: projectViews.visibleProjects
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  selectQuickEntryProject(event) {
    if (this.data.isQuickEntryAiLoading || this.data.isQuickEntryVoiceRecognizing || this.data.isQuickEntryVoiceRecording) {
      return
    }

    if (this.data.quickEntryMode === 'follow_up' && normalizeQuickEntryFollowUpStage(this.data.quickEntryFollowUpStage) === 'review') {
      return
    }

    const { projectId } = event.currentTarget.dataset
    if (!projectId) {
      return
    }

    const currentProject = (this.data.quickEntryProjects || []).find((item) => item.id === projectId)
    const shouldContinuePlanning = this.data.quickEntryMode === 'follow_up'
      && this.data.quickEntryAiSummary
      && !this.data.quickEntryAiNextSuggestion
      && !this.data.isQuickEntryAiLoading

    this.setData({
      quickEntryProjectSelectionMode: 'manual',
      quickEntrySelectedProjectId: projectId,
      quickEntrySelectedProjectName: getQuickEntryProjectLabel(currentProject),
      quickEntrySelectedProjectMeta: currentProject || null,
      quickEntryVoiceStatusText: shouldContinuePlanning
        ? '项目已确认，正在补下一步建议...'
        : (this.data.quickEntryMode === 'follow_up' && normalizeText(this.data.quickEntryForm.followUpContent)
            ? '项目已确认，可确认后直接保存'
            : this.data.quickEntryVoiceStatusText),
      ...buildQuickEntryFollowUpDisplayState({
        followUpContent: this.data.quickEntryForm.followUpContent,
        voicePreviewText: this.data.quickEntryVoicePreviewText,
        aiError: this.data.quickEntryAiError,
        aiSummary: this.data.quickEntryAiSummary,
        aiProjectMatch: this.data.quickEntryAiProjectMatch,
        aiNextSuggestion: this.data.quickEntryAiNextSuggestion,
        isVoiceRecording: this.data.isQuickEntryVoiceRecording,
        isVoiceRecognizing: this.data.isQuickEntryVoiceRecognizing,
        isAiLoading: this.data.isQuickEntryAiLoading,
        manualInputEnabled: this.data.quickEntryManualInputEnabled,
        selectedProjectId: projectId,
        flowStage: this.data.quickEntryFollowUpStage
      }),
      ...buildQuickEntryFollowUpSubmitState({
        followUpContent: this.data.quickEntryForm.followUpContent,
        selectedProjectId: projectId,
        aiProjectMatch: this.data.quickEntryAiProjectMatch,
        aiSummary: this.data.quickEntryAiSummary,
        aiNextSuggestion: this.data.quickEntryAiNextSuggestion,
        stage: this.data.quickEntryFollowUpStage === 'review' ? 'review' : 'project',
        aiError: this.data.quickEntryAiError,
        createNextTask: this.data.quickEntryCreateNextTask
      })
    }, () => {
      if (this.data.quickEntryMode === 'follow_up') {
        const learningResult = this.rememberQuickEntryProjectAliases(
          projectId,
          [
            this.data.quickEntryVoicePreviewText,
            this.data.quickEntryForm.followUpContent
          ],
          currentProject || null,
          {
            preferManualCorrection: true
          }
        )
        if (learningResult.acceptedManualAliases && learningResult.acceptedManualAliases.length) {
          this.rememberQuickEntryProjectImplicitMemory(
            projectId,
            learningResult.acceptedManualAliases,
            'manual_confirm'
          )
        }
        this.recordQuickEntryProjectAliasHit(
          projectId,
          this.data.quickEntryForm.followUpContent || this.data.quickEntryVoicePreviewText,
          currentProject || null,
          'manual'
        )
      }
      this.scheduleQuickEntryDraftPersist()
      if (shouldContinuePlanning) {
        this.runQuickEntryAiPipeline({
          content: this.data.quickEntryForm.followUpContent,
          triggerSource: 'manual'
        })
      }
    })
  },

  toggleQuickEntryProjectSearch() {
    if (this.data.quickEntryMode === 'follow_up' && normalizeQuickEntryFollowUpStage(this.data.quickEntryFollowUpStage) === 'review') {
      return
    }

    const nextVisible = !this.data.quickEntryShowProjectSearch
    const keyword = nextVisible ? this.data.quickEntryProjectKeyword : ''
    const projectViews = buildQuickEntryProjectViews(
      this.data.quickEntryProjects,
      keyword,
      this.data.quickEntrySelectedProjectId,
      this.data.quickEntryAiProjectCandidateIds,
      getQuickEntryRecommendationText(this.data.quickEntryMode, this.data.quickEntryForm)
    )
    this.setData({
      quickEntryShowProjectSearch: nextVisible,
      quickEntryProjectKeyword: keyword,
      quickEntryVisibleProjects: projectViews.visibleProjects
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  refreshQuickEntryProjectRecommendation(formPatch = null) {
    const projects = Array.isArray(this.data.quickEntryProjects) ? this.data.quickEntryProjects : []
    const nextForm = formPatch ? Object.assign({}, this.data.quickEntryForm, formPatch) : this.data.quickEntryForm
    const followUpContent = normalizeText(nextForm.followUpContent)
    const selectionMode = this.data.quickEntryProjectSelectionMode
    const currentSelectionId = normalizeText(this.data.quickEntrySelectedProjectId)
    const recommendationText = getQuickEntryRecommendationText(this.data.quickEntryMode, nextForm)

    let targetProject = null
    let targetProjectId = ''
    let nextSelectionMode = selectionMode

    if (selectionMode === 'manual' && currentSelectionId) {
      targetProject = findQuickEntryProject(projects, currentSelectionId)
      targetProjectId = targetProject ? targetProject.id : ''
      if (!targetProjectId) {
        nextSelectionMode = ''
      }
    }

    if (!targetProjectId) {
      targetProject = findQuickEntryRecommendedProject(projects, recommendationText)
      targetProjectId = targetProject ? targetProject.id : ''
      nextSelectionMode = targetProjectId ? 'auto' : ''
    }

    const projectViews = buildQuickEntryProjectViews(
      projects,
      this.data.quickEntryProjectKeyword,
      targetProjectId,
      this.data.quickEntryAiProjectCandidateIds,
      recommendationText
    )
    const patch = {
      quickEntrySuggestedProjects: projectViews.suggestedProjects,
      quickEntryVisibleProjects: projectViews.visibleProjects,
      quickEntryProjectSelectionMode: nextSelectionMode,
      quickEntrySelectedProjectId: targetProjectId,
      quickEntrySelectedProjectName: getQuickEntryProjectLabel(targetProject),
      quickEntrySelectedProjectMeta: targetProject || null
    }

    if (this.data.quickEntryMode === 'follow_up') {
      Object.assign(patch, buildQuickEntryFollowUpDisplayState({
        followUpContent,
        voicePreviewText: this.data.quickEntryVoicePreviewText,
        aiError: this.data.quickEntryAiError,
        aiSummary: this.data.quickEntryAiSummary,
        aiProjectMatch: this.data.quickEntryAiProjectMatch,
        aiNextSuggestion: this.data.quickEntryAiNextSuggestion,
        isVoiceRecording: this.data.isQuickEntryVoiceRecording,
        isVoiceRecognizing: this.data.isQuickEntryVoiceRecognizing,
        isAiLoading: this.data.isQuickEntryAiLoading,
        manualInputEnabled: this.data.quickEntryManualInputEnabled,
        selectedProjectId: targetProjectId,
        flowStage: this.data.quickEntryFollowUpStage
      }))
      Object.assign(patch, buildQuickEntryFollowUpSubmitState({
        followUpContent,
        selectedProjectId: targetProjectId,
        aiProjectMatch: this.data.quickEntryAiProjectMatch,
        aiSummary: this.data.quickEntryAiSummary,
        aiNextSuggestion: this.data.quickEntryAiNextSuggestion,
        stage: this.data.quickEntryFollowUpStage,
        aiError: this.data.quickEntryAiError,
        actionId: this.data.quickEntryActionId,
        createNextTask: this.data.quickEntryCreateNextTask
      }))
    }

    this.setData(patch)
  },

  setQuickEntryStage(event) {
    const { stage } = event.currentTarget.dataset
    if (!stage) {
      return
    }

    this.setData({
      'quickEntryForm.stage': stage
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  onQuickEntryFieldFocus() {
    this.syncQuickEntryLayout(this.data.quickEntryKeyboardHeight, true)
  },

  syncQuickEntryLayout(height = 0, isEditing = false) {
    const keyboardHeight = Math.max(Number(height || 0), 0)
    const cursorSpacing = keyboardHeight ? Math.min(Math.max(keyboardHeight - 24, 120), 320) : 120
    const sheetStyle = keyboardHeight
      ? `top: 16vh; padding-bottom: calc(${keyboardHeight}px + env(safe-area-inset-bottom));`
      : ''
    const bodyStyle = keyboardHeight
      ? `padding-bottom: ${keyboardHeight + 196}px;`
      : ''
    const actionsStyle = ''

    this.setData({
      quickEntryKeyboardHeight: keyboardHeight,
      quickEntryCursorSpacing: cursorSpacing,
      quickEntrySheetStyle: sheetStyle,
      quickEntryBodyStyle: bodyStyle,
      quickEntryActionsStyle: actionsStyle,
      isQuickEntryEditing: !!isEditing
    })
  },

  onQuickEntryInput(event) {
    const { field } = event.currentTarget.dataset
    if (!field) {
      return
    }

    const nextValue = String(event.detail.value || '')
    if (field === 'followUpContent') {
      this.hideQuickEntryVoiceExampleHint()
    }
    const patch = {
      [`quickEntryForm.${field}`]: nextValue
    }
    if (field === 'followUpContent') {
      patch.quickEntryVoicePhase = 'idle'
      patch.quickEntryAiError = ''
      patch.quickEntryAiNextSuggestionError = ''
      patch.quickEntryAiProjectMatch = null
      patch.quickEntryAiProjectCandidateIds = []
      patch.quickEntryAiSummary = null
      patch.quickEntryAiSummaryDraft = null
      patch.quickEntryAiNextSuggestion = null
      patch.quickEntryAiNextSuggestionDraft = null
      patch.quickEntryAiHasExtendedDetails = false
      patch.quickEntryAiShowFullResult = false
      patch.quickEntryEditingAiSummary = false
      patch.quickEntryEditingAiNextSuggestion = false
      patch.quickEntryShowProjectSearch = false
      patch.quickEntryShowReviewSettings = false
      patch.quickEntryCreateNextTask = false
      patch.quickEntryFollowUpPendingAction = ''
      Object.assign(patch, buildQuickEntryTaskDraftState())
      Object.assign(patch, buildQuickEntryFollowUpDisplayState({
        followUpContent: nextValue,
        voicePreviewText: this.data.quickEntryVoicePreviewText,
        manualInputEnabled: this.data.quickEntryManualInputEnabled || !!nextValue,
        selectedProjectId: this.data.quickEntrySelectedProjectId,
        flowStage: nextValue ? 'content' : 'capture'
      }))
      Object.assign(patch, buildQuickEntryFollowUpSubmitState({
        followUpContent: nextValue,
        selectedProjectId: this.data.quickEntrySelectedProjectId,
        stage: nextValue ? 'content' : 'capture',
        createNextTask: false
      }))
    }

    this.setData(patch, () => {
      if (field === 'followUpContent' || field === 'taskTitle' || field === 'taskContext' || field === 'taskDescription') {
        this.refreshQuickEntryProjectRecommendation({
          [field]: nextValue
        })
      }
      this.scheduleQuickEntryDraftPersist()
    })
  },

  onQuickEntryPicker(event) {
    const { field } = event.currentTarget.dataset
    if (!field) {
      return
    }

    const nextPatch = {
      [`quickEntryForm.${field}`]: String(event.detail.value || '')
    }
    if (field === 'followUpDate') {
      nextPatch.quickEntryFollowUpDateTouched = true
    } else if (field === 'followUpClock') {
      nextPatch.quickEntryFollowUpClockTouched = true
    }

    this.setData(nextPatch, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  setQuickEntryMethod(event) {
    const { method } = event.currentTarget.dataset
    if (!method) {
      return
    }

    this.setData({
      'quickEntryForm.followUpMethod': method,
      quickEntryFollowUpMethodTouched: true
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  setQuickEntryTaskType(event) {
    const { type } = event.currentTarget.dataset
    if (!type) {
      return
    }

    this.setData({
      'quickEntryForm.taskType': type
    }, () => {
      this.scheduleQuickEntryDraftPersist()
    })
  },

  buildQuickEntrySelectedTaskPayload(options = {}) {
    const shouldCreateTask = typeof options.createTask === 'boolean'
      ? options.createTask
      : !!this.data.quickEntryCreateNextTask

    if (!shouldCreateTask) {
      return {
        ok: true,
        tasks: [],
        taskTitle: ''
      }
    }

    const draft = cloneQuickEntryNextTaskDraft(this.data.quickEntryNextTaskDraft)
    const title = normalizeText(draft.title)
    const dueDate = normalizeText(draft.dueDate)
    const dueTime = normalizeText(draft.dueTime)

    if (!title) {
      return {
        ok: false,
        message: '请先确认下一步任务标题'
      }
    }

    if (!dueDate || !dueTime) {
      return {
        ok: false,
        message: '请先确认下一步任务时间'
      }
    }

    return {
      ok: true,
      taskTitle: title,
      tasks: [
        {
          title,
          type: normalizeText(draft.type) || 'other',
          priority: normalizeText(draft.priority) || 'normal',
          dueDate,
          dueTime,
          description: ''
        }
      ]
    }
  },

  async submitQuickFollowUpOnly() {
    if (this.data.quickEntryActionId || this.data.isQuickEntryVoiceRecognizing || this.data.isQuickEntryAiLoading) {
      return
    }

    await this.submitQuickFollowUp({
      createTask: false
    })
  },

  async submitQuickFollowUpWithTask() {
    if (this.data.quickEntryActionId || this.data.isQuickEntryVoiceRecognizing || this.data.isQuickEntryAiLoading) {
      return
    }

    if (!this.data.quickEntryTaskDraftCanCreate) {
      wx.showToast({
        title: '请先确认任务标题和时间',
        icon: 'none'
      })
      return
    }

    await this.submitQuickFollowUp({
      createTask: true
    })
  },

  async submitQuickEntry() {
    const mode = this.data.quickEntryMode
    const followUpStage = normalizeQuickEntryFollowUpStage(this.data.quickEntryFollowUpStage)
    if (this.data.quickEntryActionId || this.data.isQuickEntryVoiceRecognizing || this.data.isQuickEntryAiLoading) {
      return
    }

    if (mode === 'project') {
      await this.submitQuickProject()
      return
    }

    if (mode === 'task') {
      await this.submitQuickTask()
      return
    }

    if (!this.data.quickEntryFollowUpCanSubmit) {
      return
    }

    if (mode === 'follow_up' && followUpStage === 'content') {
      this.openQuickEntryProjectConfirm()
      return
    }

    if (mode === 'follow_up' && followUpStage === 'project') {
      this.runQuickEntryAiPipeline({
        content: this.data.quickEntryForm.followUpContent,
        triggerSource: 'manual'
      })
      return
    }

    await this.submitQuickFollowUp()
  },

  async submitQuickProject() {
    const projectName = normalizeText(this.data.quickEntryForm.projectName)
    const clientName = normalizeText(this.data.quickEntryForm.clientName)
    const stage = normalizeText(this.data.quickEntryForm.stage) || '线索'

    if (!projectName || !clientName) {
      wx.showToast({
        title: '请先填写项目名称和客户名称',
        icon: 'none'
      })
      return
    }

    const decision = await ensureActionAllowed('create_project', { refresh: true, guide: true })
    if (!decision.allowed) {
      return
    }

    this.setData({
      quickEntryActionId: 'project'
    })

    try {
      const result = await saveProjectData({
        projectName,
        clientName,
        stage,
        estimatedAmount: '',
        expectedCommission: '',
        tagsText: '',
        description: '',
        contacts: []
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '项目创建失败')
      }

      await resolveNotificationData({
        projectId: '',
        types: ['save_failed'],
        scenes: ['quick_project_create']
      })

      this.clearQuickEntryDraft('project')
      await this.fetchDashboard()
      this.showQuickEntrySuccess({
        mode: 'project',
        title: '项目已创建',
        detail: '已加入项目列表，可继续录跟进或直接查看详情。',
        projectId: result.projectId || '',
        projectName
      })
    } catch (error) {
      await reportSystemFailureData({
        type: 'save_failed',
        scene: 'quick_project_create',
        title: '快速新建项目失败',
        message: error.message || '当前无法新建项目，请稍后重试',
        projectName
      })

      wx.showToast({
        title: error.message || '当前无法新建项目，请稍后重试',
        icon: 'none'
      })
    } finally {
      this.setData({
        quickEntryActionId: ''
      })
    }
  },

  async submitQuickFollowUp(options = {}) {
    const shouldCreateTask = !!options.createTask
    const projectId = normalizeText(this.data.quickEntrySelectedProjectId)
    const content = normalizeText(this.data.quickEntryForm.followUpContent)
    const aiSummary = this.data.quickEntryAiSummary ? cloneQuickEntryAiSummary(this.data.quickEntryAiSummary) : null
    const aiNextSuggestion = this.data.quickEntryAiNextSuggestion ? cloneQuickEntryAiNextSuggestion(this.data.quickEntryAiNextSuggestion) : null
    const nextTaskPayload = this.buildQuickEntrySelectedTaskPayload({
      createTask: shouldCreateTask
    })

    if (!content) {
      wx.showToast({
        title: '请先填写跟进内容',
        icon: 'none'
      })
      return
    }

    if (!projectId) {
      wx.showToast({
        title: '请关联项目',
        icon: 'none'
      })
      return
    }

    if (!nextTaskPayload.ok) {
      wx.showToast({
        title: nextTaskPayload.message,
        icon: 'none'
      })
      return
    }

    const decision = await ensureActionAllowed('save_follow_up', { refresh: true, guide: true })
    if (!decision.allowed) {
      return
    }

    this.setData({
      quickEntryActionId: 'follow_up',
      quickEntryFollowUpPendingAction: shouldCreateTask ? 'save_with_task' : 'save_only',
      ...buildQuickEntryFollowUpSubmitState({
        followUpContent: content,
        selectedProjectId: projectId,
        actionId: 'follow_up',
        createNextTask: shouldCreateTask
      })
    })

    try {
      const nextTaskDraft = cloneQuickEntryNextTaskDraft(this.data.quickEntryNextTaskDraft)
      const result = await saveFollowUpData({
        projectId,
        method: this.data.quickEntryForm.followUpMethod,
        followUpTime: `${this.data.quickEntryForm.followUpDate} ${this.data.quickEntryForm.followUpClock}`,
        content,
        stageChange: '',
        nextFollowUpTime: '',
        images: [],
        aiSummary: aiSummary ? aiSummary.summary : '',
        aiHighlights: aiSummary ? aiSummary.highlights : [],
        aiRisks: aiSummary ? aiSummary.risks : [],
        aiRecommendedStage: aiSummary ? aiSummary.recommendedStage : '',
        aiStageChangeReason: aiSummary ? aiSummary.stageChangeReason : '',
        aiMissingInfo: aiSummary ? aiSummary.missingInfo : [],
        aiNextAction: aiNextSuggestion ? aiNextSuggestion.nextAction : '',
        aiNextRecommendedTarget: aiNextSuggestion ? aiNextSuggestion.recommendedTarget : '',
        aiNextRecommendedMethod: aiNextSuggestion ? aiNextSuggestion.recommendedMethod : '',
        aiNextRecommendedTimeWindow: aiNextSuggestion ? aiNextSuggestion.recommendedTimeWindow : '',
        aiNextRecommendedDate: aiNextSuggestion ? aiNextSuggestion.recommendedDate : '',
        aiNextRecommendedTime: aiNextSuggestion ? aiNextSuggestion.recommendedTime : '',
        aiNextTalkTrack: aiNextSuggestion ? aiNextSuggestion.talkTrack : '',
        aiNextReason: aiNextSuggestion ? aiNextSuggestion.reason : '',
        aiNextMissingInfo: aiNextSuggestion ? aiNextSuggestion.missingInfo : [],
        aiSuggestedTaskTitle: aiNextSuggestion ? normalizeText(nextTaskDraft.title) : '',
        aiSuggestedTaskType: aiNextSuggestion ? normalizeText(nextTaskDraft.type) : '',
        aiSuggestedTaskDueDate: aiNextSuggestion ? normalizeText(nextTaskDraft.dueDate) : '',
        aiSuggestedTaskDueTime: aiNextSuggestion ? normalizeText(nextTaskDraft.dueTime) : '',
        aiSuggestedTaskDescription: '',
        tasks: nextTaskPayload.tasks
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '跟进保存失败')
      }

      await resolveNotificationData({
        projectId,
        types: ['save_failed'],
        scenes: ['quick_follow_up_save']
      })

      touchNotificationSync('quick_follow_up_saved')
      this.clearQuickEntryDraft('follow_up')
      await this.fetchDashboard()
      this.closeQuickEntrySheet({
        force: true,
        discard: true,
        toastTitle: nextTaskPayload.tasks.length ? '已保存，并已创建任务' : '已保存跟进记录'
      })
    } catch (error) {
      await reportSystemFailureData({
        type: 'save_failed',
        scene: 'quick_follow_up_save',
        title: '快速跟进失败',
        message: error.message || '当前无法保存跟进，请稍后重试',
        projectId,
        projectName: this.data.quickEntrySelectedProjectName
      })

      wx.showToast({
        title: error.message || '当前无法保存跟进，请稍后重试',
        icon: 'none'
      })
    } finally {
      this.setData({
        quickEntryActionId: '',
        quickEntryFollowUpPendingAction: '',
        ...buildQuickEntryFollowUpSubmitState({
          followUpContent: this.data.quickEntryForm.followUpContent,
          selectedProjectId: this.data.quickEntrySelectedProjectId,
          aiError: this.data.quickEntryAiError,
          createNextTask: false
        })
      })
    }
  },

  async submitQuickTask() {
    const projectId = normalizeText(this.data.quickEntrySelectedProjectId)
    const taskContext = normalizeText(this.data.quickEntryForm.taskContext)
    const taskTitle = normalizeText(this.data.quickEntryForm.taskTitle)
    const taskDueDate = normalizeText(this.data.quickEntryForm.taskDueDate)
    const taskDueTime = normalizeText(this.data.quickEntryForm.taskDueTime)
    const taskDescription = normalizeText(this.data.quickEntryForm.taskDescription)

    if (!taskTitle) {
      wx.showToast({
        title: '请先填写任务标题',
        icon: 'none'
      })
      return
    }

    if (!taskDueDate || !taskDueTime) {
      wx.showToast({
        title: '请先填写截止时间',
        icon: 'none'
      })
      return
    }

    if (!projectId) {
      wx.showToast({
        title: '请关联项目',
        icon: 'none'
      })
      return
    }

    const decision = await ensureActionAllowed('create_task', { refresh: true, guide: true })
    if (!decision.allowed) {
      return
    }

    this.setData({
      quickEntryActionId: 'task'
    })

    try {
      const now = new Date()
      const taskContextText = taskContext || `补充动作：${taskTitle}`
      const result = await saveFollowUpData({
        projectId,
        method: '其他',
        followUpTime: `${formatDateInput(now)} ${formatTimeInput(now)}`,
        content: taskContextText,
        stageChange: '',
        nextFollowUpTime: '',
        images: [],
        aiSummary: '',
        aiHighlights: [],
        aiRisks: [],
        aiRecommendedStage: '',
        aiStageChangeReason: '',
        aiMissingInfo: [],
        tasks: [
          {
            title: taskTitle,
            type: this.data.quickEntryForm.taskType || 'other',
            priority: 'normal',
            dueDate: taskDueDate,
            dueTime: taskDueTime,
            description: taskDescription
          }
        ]
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '任务保存失败')
      }

      await resolveNotificationData({
        projectId,
        types: ['save_failed'],
        scenes: ['quick_task_save']
      })

      touchNotificationSync('quick_task_saved')
      this.clearQuickEntryDraft('task')
      await this.fetchDashboard()
      this.showTaskFeedback({
        title: '下一步动作已加入推进清单',
        detail: `${taskTitle} 已进入首页“推进动作优先”，后续可直接完成并回填结果。`
      })
      this.showQuickEntrySuccess({
        mode: 'task',
        title: '任务已补进清单',
        detail: '已加入推进清单，可继续补下一条。',
        projectId: result.projectId || projectId,
        projectName: this.data.quickEntrySelectedProjectName,
        continueProjectId: projectId
      })
    } catch (error) {
      await reportSystemFailureData({
        type: 'save_failed',
        scene: 'quick_task_save',
        title: '快速补任务失败',
        message: error.message || '当前无法补任务，请稍后重试',
        projectId,
        projectName: this.data.quickEntrySelectedProjectName
      })

      wx.showToast({
        title: error.message || '当前无法补任务，请稍后重试',
        icon: 'none'
      })
    } finally {
      this.setData({
        quickEntryActionId: ''
      })
    }
  },

  openNotificationsPage() {
    wx.navigateTo({
      url: '/pages/notifications/notifications'
    })
  },

  applyHeadlineNotificationFeedback(options = {}) {
    const shouldMarkRead = !!options.markRead
    const shouldResolve = !!options.resolve

    if (!shouldMarkRead && !shouldResolve) {
      return
    }

    const nextUnreadCount = Math.max(Number(this.data.notificationUnreadCount || 0) - (shouldMarkRead ? 1 : 0), 0)
    const nextPendingCount = Math.max(Number(this.data.notificationPendingCount || 0) - (shouldResolve ? 1 : 0), 0)
    const nextData = {
      notificationUnreadCount: nextUnreadCount,
      notificationPendingCount: nextPendingCount
    }

    if (shouldResolve) {
      nextData.notificationHeadlineId = ''
      nextData.notificationHeadlineType = ''
      nextData.notificationHeadlineTitle = nextPendingCount ? '提醒状态已更新' : '站内提醒'
      nextData.notificationHeadlineDesc = nextPendingCount
        ? '这条提醒已收口，返回首页后会自动同步下一条。'
        : '当前提醒都已收口，可以继续按首页动作和跟进节奏推进。'
      nextData.notificationHeadlineProjectName = ''
      nextData.notificationHeadlineActionText = '打开消息'
      nextData.notificationHeadlineUrl = ''
      nextData.notificationHeadlineAutoResolve = false
      nextData.notificationHeadlineToneClass = nextPendingCount ? 'is-neutral' : 'is-success'
      nextData.notificationHeadlineBadgeText = nextPendingCount ? '待处理' : '已收口'
    }

    this.setData(nextData)
  },

  async openHeadlineNotification() {
    const notificationId = String(this.data.notificationHeadlineId || '').trim()
    const actionUrl = String(this.data.notificationHeadlineUrl || '').trim()
    const notificationType = String(this.data.notificationHeadlineType || '').trim()
    const shouldAutoResolve = !!this.data.notificationHeadlineAutoResolve
    let targetUrl = actionUrl

    if (actionUrl.indexOf('/pages/follow-up/follow-up') === 0) {
      targetUrl = appendQueryParams(actionUrl, {
        entry: 'notification',
        source: 'home-headline',
        type: notificationType
      })
    } else if (actionUrl.indexOf('/pages/project-detail/project-detail') === 0) {
      targetUrl = appendQueryParams(actionUrl, {
        source: 'home-headline',
        notificationType
      })
    } else if (actionUrl.indexOf('/pages/projects/projects') === 0 || actionUrl.indexOf('/pages/shared-out/shared-out') === 0) {
      targetUrl = appendQueryParams(actionUrl, {
        source: 'home-headline'
      })
    }

    if (!targetUrl) {
      this.openNotificationsPage()
      return
    }

    if (notificationId) {
      try {
        await markNotificationReadData({
          notificationId
        })
        touchNotificationSync('headline_read')
        this.applyHeadlineNotificationFeedback({
          markRead: true
        })
      } catch (error) {
        // Keep quick access available even if read-state sync fails.
      }
    }

    if (notificationId && shouldAutoResolve) {
      try {
        await resolveNotificationData({
          notificationId
        })
        touchNotificationSync('headline_resolved')
        this.applyHeadlineNotificationFeedback({
          resolve: true
        })
      } catch (error) {
        // Keep quick access available even if resolve-state sync fails.
      }
    }

    wx.navigateTo({
      url: targetUrl
    })
  },

  openPage(event) {
    const { url } = event.currentTarget.dataset
    wx.navigateTo({ url })
  },

  openMinePage() {
    wx.navigateTo({
      url: '/pages/mine/mine'
    })
  }
})
