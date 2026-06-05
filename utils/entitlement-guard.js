const { getDefaultAccountSummary, getDefaultEntitlements } = require('../services/data')
const { formatAiQuotaRange } = require('./quota-format')
const { ensurePrivacyAuthorization } = require('./privacy-authorization')

function getAppInstance() {
  return typeof getApp === 'function' ? getApp() : null
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function getStateSnapshot() {
  const app = getAppInstance()
  const globalData = app && app.globalData ? app.globalData : {}
  return {
    app,
    account: {
      ...getDefaultAccountSummary(),
      ...clone(normalizeObject(globalData.account))
    },
    entitlements: {
      ...getDefaultEntitlements(),
      ...clone(normalizeObject(globalData.entitlements))
    }
  }
}

async function getEntitlementSnapshot(options = {}) {
  const snapshot = getStateSnapshot()
  const shouldRefresh = options && options.refresh === true

  if (!shouldRefresh || !snapshot.app || typeof snapshot.app.refreshEntitlements !== 'function') {
    return snapshot
  }

  try {
    const [nextAccount, nextEntitlements] = await Promise.all([
      typeof snapshot.app.refreshAccount === 'function'
        ? snapshot.app.refreshAccount()
        : Promise.resolve(snapshot.account),
      snapshot.app.refreshEntitlements()
    ])
    return {
      ...snapshot,
      account: {
        ...getDefaultAccountSummary(),
        ...clone(normalizeObject(nextAccount))
      },
      entitlements: {
        ...getDefaultEntitlements(),
        ...clone(normalizeObject(nextEntitlements))
      }
    }
  } catch (error) {
    return {
      ...snapshot,
      refreshError: error
    }
  }
}

function isAccountDisabled(snapshot) {
  const accountStatus = String(snapshot.account && snapshot.account.status || '').trim()
  const entitlementStatus = String(snapshot.entitlements && snapshot.entitlements.status || '').trim()
  const accessLevel = String(snapshot.entitlements && snapshot.entitlements.currentAccessLevel || '').trim()
  return accountStatus === 'disabled' || entitlementStatus === 'disabled' || accessLevel === 'disabled'
}

function isReadonlyAccount(snapshot) {
  const entitlements = snapshot.entitlements || {}
  return !entitlements.canCreateProject
    && !entitlements.canEditProject
    && !entitlements.canSaveFollowUp
    && !entitlements.canCreateTask
    && !entitlements.canUseQuickEntry
}

function isWriteAccessDisabled(snapshot) {
  const accountStatus = String(snapshot.account && snapshot.account.status || '').trim()
  const entitlementStatus = String(snapshot.entitlements && snapshot.entitlements.status || '').trim()
  const accountAccessLevel = String(snapshot.account && snapshot.account.currentAccessLevel || '').trim()
  const entitlementAccessLevel = String(snapshot.entitlements && snapshot.entitlements.currentAccessLevel || '').trim()
  const disabledStatuses = ['disabled', 'expired_readonly', 'free_limited']
  const disabledAccessLevels = ['disabled', 'free_readonly', 'paid_readonly']

  return disabledStatuses.includes(accountStatus)
    || disabledStatuses.includes(entitlementStatus)
    || disabledAccessLevels.includes(accountAccessLevel)
    || disabledAccessLevels.includes(entitlementAccessLevel)
    || isReadonlyAccount(snapshot)
}

function buildDecision(allowed, code = '', message = '') {
  return {
    allowed,
    code,
    message
  }
}

function buildHiddenPagePrompt() {
  return {
    visible: false,
    tone: 'neutral',
    title: '',
    desc: '',
    actionText: '',
    actionType: '',
    actionUrl: ''
  }
}

function appendReasonQuery(url = '', reason = '') {
  const targetUrl = String(url || '').trim()
  const targetReason = String(reason || '').trim()
  if (!targetUrl || !targetReason) {
    return targetUrl
  }

  const separator = targetUrl.includes('?') ? '&' : '?'
  return `${targetUrl}${separator}reason=${encodeURIComponent(targetReason)}`
}

function buildPagePrompt(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {}
  return {
    visible: source.visible !== false,
    tone: String(source.tone || 'neutral').trim() || 'neutral',
    title: String(source.title || '').trim(),
    desc: String(source.desc || '').trim(),
    actionText: String(source.actionText || '').trim(),
    actionType: String(source.actionType || '').trim(),
    actionUrl: String(source.actionUrl || '').trim()
  }
}

function getPromptAction(actionType = '', reason = '') {
  const current = String(actionType || '').trim()
  const actionMap = {
    bind_phone: {
      actionType: 'bind_phone',
      actionText: '去绑定手机号',
      actionUrl: '/pages/phone-bind/phone-bind'
    },
    open_subscription: {
      actionType: 'open_subscription',
      actionText: '订阅套餐',
      actionUrl: '/pages/plans/plans?focus=subscription'
    },
    open_addons: {
      actionType: 'open_addons',
      actionText: '看流量包',
      actionUrl: '/pages/plans/plans?focus=addons'
    },
    open_entitlements: {
      actionType: 'open_entitlements',
      actionText: '查看权益',
      actionUrl: '/pages/entitlements/entitlements'
    }
  }

  const action = actionMap[current] || {
    actionType: '',
    actionText: '',
    actionUrl: ''
  }

  return {
    ...action,
    actionUrl: appendReasonQuery(action.actionUrl, reason)
  }
}

function buildGuideTarget(decision, snapshot, options = {}) {
  const code = String(decision && decision.code || '').trim()
  const entitlements = snapshot && snapshot.entitlements ? snapshot.entitlements : {}
  const action = String(options && options.action || '').trim()
  const readonly = isReadonlyAccount(snapshot)

  if (code === 'ACCOUNT_PHONE_REQUIRED') {
    return {
      title: '先绑定手机号',
      content: '当前还可以继续体验，但保存正式数据和开通套餐前，需要先完成手机号绑定。',
      confirmText: '去绑定',
      url: '/pages/phone-bind/phone-bind'
    }
  }

  if (code === 'ENTITLEMENT_SPEECH_EXHAUSTED') {
    return {
      title: '语音用量不足',
      content: decision.message || '语音功能已暂停，补充时长后可恢复',
      confirmText: '看流量包',
      url: appendReasonQuery('/pages/plans/plans?focus=addons', 'speech_exhausted')
    }
  }

  if (code === 'ENTITLEMENT_AI_EXHAUSTED') {
    return {
      title: 'AI用量不足',
      content: decision.message || 'AI功能已暂停，补充额度后可恢复',
      confirmText: '看流量包',
      url: appendReasonQuery('/pages/plans/plans?focus=addons', 'ai_exhausted')
    }
  }

  if (code === 'ENTITLEMENT_PROJECT_LIMIT_REACHED') {
    return {
      title: '项目数量已达上限',
      content: decision.message || '当前项目数量已达上限，请开通正式套餐后继续新增。',
      confirmText: '订阅套餐',
      url: appendReasonQuery('/pages/plans/plans?focus=subscription', 'project_limit_reached')
    }
  }

  if (code === 'ENTITLEMENT_SHARE_OUT_DISABLED') {
    return {
      title: '当前套餐不支持外发',
      content: decision.message || '当前套餐暂不支持项目外发，开通正式套餐后可继续使用。',
      confirmText: '订阅套餐',
      url: appendReasonQuery('/pages/plans/plans?focus=subscription', 'share_out_disabled')
    }
  }

  if (code === 'ACCOUNT_DISABLED') {
    return {
      title: '当前账号不可用',
      content: decision.message || '账号状态异常，请稍后重试',
      confirmText: '查看权益',
      url: appendReasonQuery('/pages/entitlements/entitlements', 'account_disabled')
    }
  }

  if (code === 'ENTITLEMENT_WRITE_DISABLED') {
    if (readonly || action === 'quick_entry' || action === 'save_follow_up' || action === 'save_project' || action === 'create_task' || action === 'share_out') {
      if (action === 'quick_entry') {
        return {
          title: '闪录功能暂不可用',
          content: decision.message || entitlements.reasonSummary || '当前仅可查看，开通套餐后可恢复闪录',
          confirmText: '订阅套餐',
          url: appendReasonQuery('/pages/plans/plans?focus=subscription', 'write_disabled')
        }
      }

      return {
        title: '当前仅可查看',
        content: decision.message || entitlements.reasonSummary || '当前仅可查看，不可编辑',
        confirmText: '订阅套餐',
        url: appendReasonQuery('/pages/plans/plans?focus=subscription', 'write_disabled')
      }
    }

    return {
      title: '当前操作暂不可用',
      content: decision.message || entitlements.reasonSummary || '当前权益暂不支持这项操作。',
      confirmText: '查看权益',
      url: appendReasonQuery('/pages/entitlements/entitlements', 'write_disabled')
    }
  }

  if (code === 'ENTITLEMENT_REFRESH_FAILED') {
    return {
      title: '暂时无法确认权益',
      content: decision.message || '账号状态加载失败，请稍后重试',
      confirmText: '订阅套餐',
      url: appendReasonQuery('/pages/plans/plans?focus=subscription', 'entitlement_refresh_failed')
    }
  }

  return null
}

function openGuidePage(url = '') {
  const targetUrl = String(url || '').trim()
  if (!targetUrl || typeof wx === 'undefined' || typeof wx.navigateTo !== 'function') {
    return Promise.resolve(false)
  }

  return new Promise((resolve) => {
    wx.navigateTo({
      url: targetUrl,
      success: () => resolve(true),
      fail: () => resolve(false)
    })
  })
}

async function runDeniedActionGuide(decision, snapshot, options = {}) {
  const guideTarget = buildGuideTarget(decision, snapshot, options)
  if (!guideTarget || typeof wx === 'undefined' || typeof wx.showModal !== 'function') {
    return
  }

  await new Promise((resolve) => {
    wx.showModal({
      title: guideTarget.title,
      content: guideTarget.content,
      confirmText: guideTarget.confirmText || '我知道了',
      cancelText: '稍后再说',
      success: async (result) => {
        if (result && result.confirm && guideTarget.url) {
          await openGuidePage(guideTarget.url)
        }
        resolve()
      },
      fail: () => resolve()
    })
  })
}

function getReadonlyMessage(action) {
  if (action === 'quick_entry') {
    return '当前仅可查看，暂不可用闪录'
  }

  if (action === 'share_out') {
    return '当前仅可查看，暂不可转交项目'
  }

  return '当前仅可查看，不可编辑'
}

function buildProjectLimitMessage(entitlements) {
  const currentProjectCount = Math.max(0, Number(entitlements.currentProjectCount || 0))
  const projectLimit = Number(entitlements.projectLimit)
  if (Number.isFinite(projectLimit) && projectLimit > -1) {
    return `当前项目数已达上限（${currentProjectCount}/${projectLimit}），请开通套餐后继续新增`
  }

  return '当前项目数量已达上限，请开通套餐后继续新增'
}

function evaluateAction(action, snapshot, options = {}) {
  const entitlements = snapshot.entitlements || {}
  const aiQuotaPolicy = String(entitlements.aiQuotaPolicy || '').trim() === 'provider_plan'
    ? 'provider_plan'
    : 'local_quota'

  if (options.refresh === true && snapshot.refreshError) {
    return buildDecision(false, 'ENTITLEMENT_REFRESH_FAILED', '账号状态加载失败，请稍后重试')
  }

  if (isAccountDisabled(snapshot)) {
    return buildDecision(false, 'ACCOUNT_DISABLED', '账号状态异常，请稍后重试')
  }

  switch (action) {
    case 'quick_entry':
      if (isWriteAccessDisabled(snapshot) || !entitlements.canUseQuickEntry) {
        return buildDecision(false, 'ENTITLEMENT_WRITE_DISABLED', getReadonlyMessage(action))
      }
      return buildDecision(true)

    case 'speech':
      if (!entitlements.canUseSpeechToText) {
        if (Number(entitlements.voiceSecondsRemaining || 0) <= 0) {
          return buildDecision(false, 'ENTITLEMENT_SPEECH_EXHAUSTED', '语音额度已用完，补充后可继续录音转写')
        }
        return buildDecision(false, 'ENTITLEMENT_WRITE_DISABLED', getReadonlyMessage(action))
      }
      return buildDecision(true)

    case 'ai':
      if (!entitlements.canUseAi) {
        if (aiQuotaPolicy !== 'provider_plan' && Number(entitlements.aiTokensRemaining || 0) <= 0) {
          return buildDecision(false, 'ENTITLEMENT_AI_EXHAUSTED', 'AI 额度已用完，补充后可继续使用 AI 整理与下一步建议')
        }
        return buildDecision(false, 'ENTITLEMENT_WRITE_DISABLED', getReadonlyMessage(action))
      }
      return buildDecision(true)

    case 'create_project':
      if (entitlements.bindRequiredForWrite) {
        return buildDecision(false, 'ACCOUNT_PHONE_REQUIRED', '请先绑定手机号后再继续保存')
      }
      if (!entitlements.canCreateProject) {
        if (Number(entitlements.projectLimit) > -1 && Number(entitlements.currentProjectCount) >= Number(entitlements.projectLimit)) {
          return buildDecision(false, 'ENTITLEMENT_PROJECT_LIMIT_REACHED', buildProjectLimitMessage(entitlements))
        }
        return buildDecision(false, 'ENTITLEMENT_WRITE_DISABLED', getReadonlyMessage(action))
      }
      return buildDecision(true)

    case 'save_project':
      if (entitlements.bindRequiredForWrite) {
        return buildDecision(false, 'ACCOUNT_PHONE_REQUIRED', '请先绑定手机号后再继续保存')
      }
      if (options.isEdit) {
        if (!entitlements.canEditProject) {
          return buildDecision(false, 'ENTITLEMENT_WRITE_DISABLED', '当前仅可查看，不可编辑')
        }
        return buildDecision(true)
      }
      if (!entitlements.canCreateProject) {
        if (Number(entitlements.projectLimit) > -1 && Number(entitlements.currentProjectCount) >= Number(entitlements.projectLimit)) {
          return buildDecision(false, 'ENTITLEMENT_PROJECT_LIMIT_REACHED', buildProjectLimitMessage(entitlements))
        }
        return buildDecision(false, 'ENTITLEMENT_WRITE_DISABLED', getReadonlyMessage(action))
      }
      return buildDecision(true)

    case 'save_follow_up':
      if (entitlements.bindRequiredForWrite) {
        return buildDecision(false, 'ACCOUNT_PHONE_REQUIRED', '请先绑定手机号后再继续保存')
      }
      if (!entitlements.canSaveFollowUp) {
        return buildDecision(false, 'ENTITLEMENT_WRITE_DISABLED', '当前仅可查看，不可编辑')
      }
      return buildDecision(true)

    case 'create_task':
      if (entitlements.bindRequiredForWrite) {
        return buildDecision(false, 'ACCOUNT_PHONE_REQUIRED', '请先绑定手机号后再继续保存')
      }
      if (!entitlements.canSaveFollowUp || !entitlements.canCreateTask) {
        return buildDecision(false, 'ENTITLEMENT_WRITE_DISABLED', '当前仅可查看，不可编辑')
      }
      return buildDecision(true)

    case 'share_record':
      if (entitlements.bindRequiredForWrite) {
        return buildDecision(false, 'ACCOUNT_PHONE_REQUIRED', '请先绑定手机号后再继续保存')
      }
      if (isReadonlyAccount(snapshot)) {
        return buildDecision(false, 'ENTITLEMENT_WRITE_DISABLED', '当前仅可查看，不可编辑')
      }
      return buildDecision(true)

    case 'share_out':
      if (entitlements.bindRequiredForWrite) {
        return buildDecision(false, 'ACCOUNT_PHONE_REQUIRED', '请先绑定手机号后再继续外发项目')
      }
      if (isReadonlyAccount(snapshot)) {
        return buildDecision(false, 'ENTITLEMENT_WRITE_DISABLED', getReadonlyMessage(action))
      }
      if (!entitlements.canShareOut) {
        return buildDecision(false, 'ENTITLEMENT_SHARE_OUT_DISABLED', '当前套餐暂不支持项目外发')
      }
      return buildDecision(true)

    default:
      return buildDecision(true)
  }
}

async function ensureActionAllowed(action, options = {}) {
  if (action === 'speech') {
    const privacyAllowed = await ensurePrivacyAuthorization({
      page: options.page,
      showToast: options.toast !== false
    })
    if (!privacyAllowed) {
      return {
        allowed: false,
        reason: 'PRIVACY_NOT_AUTHORIZED',
        message: '需同意隐私保护指引后使用语音录入',
        snapshot: getStateSnapshot()
      }
    }
  }

  const snapshot = await getEntitlementSnapshot(options)
  const decision = evaluateAction(action, snapshot, options)
  if (!decision.allowed) {
    if (options.guide === true) {
      await runDeniedActionGuide(decision, snapshot, {
        ...options,
        action
      })
    } else if (options.toast !== false && typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
      wx.showToast({
        title: decision.message || '当前操作暂不可用',
        icon: 'none'
      })
    }
  }

  return {
    ...decision,
    snapshot
  }
}

function formatPhoneStatus(account, entitlements) {
  if (account.phoneVerified || entitlements.phoneVerified) {
    return account.phoneMasked || '已绑定'
  }

  return entitlements.bindRequiredForWrite ? '未绑定，保存前需先绑定' : '未绑定'
}

function formatProjectQuota(entitlements) {
  const current = Math.max(0, Number(entitlements.currentProjectCount || 0))
  const limit = Number(entitlements.projectLimit)
  if (!Number.isFinite(limit) || limit < 0) {
    return `${current} / 不限`
  }

  return `${current} / ${limit}`
}

function formatVoiceQuota(entitlements) {
  const remaining = Math.max(0, Number(entitlements.voiceSecondsRemaining || 0))
  const total = Math.max(0, Number(entitlements.voiceSecondsTotal || 0))
  return `${remaining} 秒 / ${total} 秒`
}

function formatAiQuota(entitlements) {
  const remaining = Math.max(0, Number(entitlements.aiTokensRemaining || 0))
  const total = Math.max(0, Number(entitlements.aiTokensTotal || 0))
  return formatAiQuotaRange(remaining, total)
}

function getAccessLevelLabel(accessLevel) {
  const current = String(accessLevel || '').trim()
  const labels = {
    trial_full: '试用可编辑',
    paid_active: '付费可编辑',
    free_readonly: '免费查看',
    paid_readonly: '到期后仅查看',
    disabled: '已禁用'
  }
  return labels[current] || '未识别'
}

function getStatusLabel(status) {
  const current = String(status || '').trim()
  const labels = {
    trialing: '试用中',
    active_paid: '付费中',
    free_limited: '免费版',
    expired_readonly: '仅可查看',
    disabled: '已禁用'
  }
  return labels[current] || '未识别'
}

function buildEntitlementOverview(snapshot) {
  const account = snapshot.account || getDefaultAccountSummary()
  const entitlements = snapshot.entitlements || getDefaultEntitlements()
  const isReadonly = isReadonlyAccount(snapshot)
  let statusHint = entitlements.reasonSummary || ''

  if (!statusHint) {
    if (isAccountDisabled(snapshot)) {
      statusHint = '账号状态异常，请稍后重试。'
    } else if (isReadonly) {
      statusHint = '当前仅可查看，不可编辑。'
    } else if (entitlements.bindRequiredForWrite) {
      statusHint = '当前可继续体验，保存数据前请先绑定手机号。'
    } else {
      statusHint = '当前账户可继续新增项目、跟进、任务和外发。'
    }
  }

  return {
    accountStatusLabel: getStatusLabel(account.status || entitlements.status),
    accessLevelLabel: getAccessLevelLabel(entitlements.currentAccessLevel || account.currentAccessLevel),
    phoneStatusLabel: formatPhoneStatus(account, entitlements),
    projectQuotaText: formatProjectQuota(entitlements),
    voiceQuotaText: formatVoiceQuota(entitlements),
    aiQuotaText: formatAiQuota(entitlements),
    reasonSummary: statusHint,
    writeStatusLabel: entitlements.bindRequiredForWrite
      ? '待绑定后保存'
      : (isReadonly ? '当前仅查看' : '当前可编辑')
  }
}

function buildEntitlementPagePrompt(snapshot, pageKey = '') {
  const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : getStateSnapshot()
  const entitlements = safeSnapshot.entitlements || getDefaultEntitlements()
  const overview = buildEntitlementOverview(safeSnapshot)
  const normalizedPageKey = String(pageKey || '').trim().replace(/-/g, '_')
  const projectLimit = Number(entitlements.projectLimit)
  const currentProjectCount = Math.max(0, Number(entitlements.currentProjectCount || 0))
  const promptPriorityMap = {
    index: ['account_disabled', 'bind_required', 'readonly', 'speech_exhausted', 'ai_exhausted', 'project_limit', 'share_out_disabled'],
    projects: ['account_disabled', 'bind_required', 'readonly', 'project_limit', 'share_out_disabled', 'speech_exhausted', 'ai_exhausted'],
    follow_up: ['account_disabled', 'bind_required', 'readonly', 'speech_exhausted', 'ai_exhausted'],
    default: ['account_disabled', 'bind_required', 'readonly', 'speech_exhausted', 'ai_exhausted', 'project_limit', 'share_out_disabled']
  }

  const promptFactories = {
    account_disabled: () => {
      if (!isAccountDisabled(safeSnapshot)) {
        return null
      }

      return buildPagePrompt({
        tone: 'danger',
        title: '当前账号不可用',
        desc: overview.reasonSummary || '账号状态异常，请稍后重试',
        ...getPromptAction('open_entitlements', 'account_disabled')
      })
    },
    bind_required: () => {
      if (!entitlements.bindRequiredForWrite) {
        return null
      }

      return buildPagePrompt({
        tone: 'soft',
        title: '保存数据前请先绑定手机号',
        desc: '绑定手机号后即可保存数据和购买套餐',
        ...getPromptAction('bind_phone', 'bind_required')
      })
    },
    readonly: () => {
      if (!isReadonlyAccount(safeSnapshot)) {
        return null
      }

      return buildPagePrompt({
        tone: 'brand',
        title: '当前仅可查看',
        desc: overview.reasonSummary || '当前仅可查看，编辑功能已暂停',
        ...getPromptAction('open_subscription', 'write_disabled')
      })
    },
    speech_exhausted: () => {
      if (entitlements.canUseSpeechToText || Number(entitlements.voiceSecondsRemaining || 0) > 0) {
        return null
      }

      return buildPagePrompt({
        tone: 'soft',
        title: '语音用量不足',
        desc: '语音录入和闪录转写已暂停。补充语音时长包后可立即恢复。',
        ...getPromptAction('open_addons', 'speech_exhausted')
      })
    },
    ai_exhausted: () => {
      const aiQuotaPolicy = String(entitlements.aiQuotaPolicy || '').trim() === 'provider_plan'
        ? 'provider_plan'
        : 'local_quota'
      if (aiQuotaPolicy === 'provider_plan') {
        return null
      }
      if (entitlements.canUseAi || Number(entitlements.aiTokensRemaining || 0) > 0) {
        return null
      }

      return buildPagePrompt({
        tone: 'brand',
        title: 'AI用量不足',
        desc: 'AI 整理和下一步建议已暂停。补充 AI 额度包后可立即恢复。',
        ...getPromptAction('open_addons', 'ai_exhausted')
      })
    },
    project_limit: () => {
      if (
        entitlements.canCreateProject
        || !Number.isFinite(projectLimit)
        || projectLimit < 0
        || currentProjectCount < projectLimit
      ) {
        return null
      }

      return buildPagePrompt({
        tone: 'soft',
        title: '项目数量已达当前上限',
        desc: `当前已使用 ${currentProjectCount}/${projectLimit} 个项目，可先整理现有项目，或开通正式套餐继续新增。`,
        ...getPromptAction('open_subscription', 'project_limit_reached')
      })
    },
    share_out_disabled: () => {
      if (entitlements.canShareOut) {
        return null
      }

      return buildPagePrompt({
        tone: 'neutral',
        title: '当前套餐暂不支持项目外发',
        desc: '开通套餐后可转交项目',
        ...getPromptAction('open_subscription', 'share_out_disabled')
      })
    }
  }

  const priority = promptPriorityMap[normalizedPageKey] || promptPriorityMap.default
  for (let index = 0; index < priority.length; index += 1) {
    const currentKey = priority[index]
    const factory = promptFactories[currentKey]
    if (typeof factory !== 'function') {
      continue
    }

    const prompt = factory()
    if (prompt && prompt.visible) {
      return prompt
    }
  }

  return buildHiddenPagePrompt()
}

module.exports = {
  getEntitlementSnapshot,
  ensureActionAllowed,
  buildEntitlementOverview,
  buildEntitlementPagePrompt
}
