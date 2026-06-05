const VIEW_META = {
  overview: {
    title: '运营总览',
    desc: '先把账户、订单、权益调整和审计日志这条管理主线立起来。'
  },
  accounts: {
    title: '用户与账户',
    desc: '第一版先解决“查得到、看得懂、能人工处理”的最小运营需求。'
  },
  orders: {
    title: '订单与支付',
    desc: '这里先看订单留痕、支付准备状态和当前为什么还不能真付。'
  },
  feedback: {
    title: '反馈与建议',
    desc: '集中处理用户提交的问题、需求和想法，采纳后直接发放 AI 额度奖励。'
  },
  referrals: {
    title: '推荐与奖励',
    desc: '查看谁推荐了谁、首个项目是否触发、双方 AI 额度奖励是否真实到账。'
  },
  billingOverview: {
    title: '额度与订阅总览',
    desc: '先看低余额、消耗分布和异常成本，再决定是否需要深入到账户与流水。'
  },
  billingGlobalUsage: {
    title: '全局流水',
    desc: '按 AI token 和语音两条链路查看全站消耗、回补和技术追踪，不再和逐户查账混在一起。'
  },
  billingAccounts: {
    title: '账户与流水',
    desc: '按账户逐户核对剩余额度、订阅状态和最近流水，解决“谁不能用、为什么不能用”。'
  },
  billingPlans: {
    title: '商品目录',
    desc: '独立维护套餐价格、启停、排序和额度，不再和查账信息混在同一页。'
  },
  legalDocuments: {
    title: '协议中心',
    desc: '集中维护隐私政策和用户服务协议的草稿、发布和版本留痕，给小程序前台提供稳定口径。'
  },
  aiConfig: {
    title: 'AI模型配置',
    desc: '独立维护 AI 供应商连接、额度策略和三段业务路由，避免和额度运营信息混杂。'
  },
  audit: {
    title: '审计日志',
    desc: '后台所有人工操作都应该留下审计记录，方便后续排障和复核。'
  }
}

const APP_BUILD_ID = '2026-06-03 20:05'
const BILLING_VIEW_KEYS = ['billingOverview', 'billingGlobalUsage', 'billingAccounts', 'billingPlans']
const LOW_VOICE_ALERT_THRESHOLD = 120
const LOW_AI_ALERT_THRESHOLD = 10000
const CLOUD_CONFIG_STORAGE_KEY = 'deal_crm_admin_cloud_config_v2'
const LEGAL_DOCUMENT_TYPE_OPTIONS = [
  { value: 'privacy_policy', label: '隐私政策' },
  { value: 'user_agreement', label: '用户服务协议' },
  { value: 'ai_notice', label: 'AI 使用说明' },
  { value: 'audio_notice', label: '录音与语音识别说明' },
  { value: 'phone_bind_notice', label: '手机号绑定说明' },
  { value: 'data_storage_notice', label: '云端存储说明' },
  { value: 'account_cancellation_notice', label: '账号注销说明' }
]
const LEGAL_DOCUMENT_TITLE_MAP = LEGAL_DOCUMENT_TYPE_OPTIONS.reduce((map, item) => {
  map[item.value] = item.label
  return map
}, {})
const LEGAL_DOCUMENT_TEMPLATE_LIBRARY = {
  privacy_policy: [
    '# 隐私政策',
    '',
    '更新日期：2026-06-03',
    '生效日期：2026-06-03',
    '',
    '欢迎使用八面成交CRM。为便于你理解我们如何收集、使用、存储和保护个人信息，请重点阅读本政策。',
    '',
    '## 1. 我们收集的信息',
    '- 账号信息：微信 OpenID、UnionID、手机号、昵称、头像等用于识别账户与登录态的信息。',
    '- 业务信息：项目、联系人、跟进、任务、分享记录、反馈信息等你主动填写或上传的内容。',
    '- 设备与日志信息：设备标识、操作日志、错误日志、访问时间、IP 等用于安全保障和排障的信息。',
    '- 音视频与图片：你主动上传的录音、图片及其转写、识别结果。',
    '- 交易信息：订单、支付状态、套餐、权益到账和额度流水。',
    '',
    '## 2. 我们如何使用信息',
    '- 提供项目管理、联系人维护、跟进记录、AI 整理、语音识别、支付与订阅等核心功能。',
    '- 识别账号状态、同步套餐权益、进行安全校验、异常排查和服务优化。',
    '- 在你授权的前提下，用于手机号绑定、客服回访和问题处理。',
    '',
    '## 3. 第三方服务说明',
    '- 语音识别、AI 生成、云存储、支付等能力可能由第三方服务商提供，我们会根据业务需要调用其接口。',
    '- 我们会仅在实现对应功能所必需的范围内共享信息，并要求第三方承担相应的保密与安全义务。',
    '',
    '## 4. 信息存储与保护',
    '- 我们会将信息存储在腾讯云等合法合规的云服务环境，并采取访问控制、加密、日志审计等措施保护数据安全。',
    '- 联系人手机号、微信号等敏感字段会采用加密或脱敏处理。',
    '',
    '## 5. 你的权利',
    '- 你可以查看、修改、删除部分业务信息，并可通过意见反馈或客服渠道申请更正、导出或注销账户。',
    '- 当你撤回授权或注销账户后，我们将依据法律法规和业务留痕要求处理相关数据。',
    '',
    '## 6. 未成年人保护',
    '- 若你是未成年人，应在监护人同意和指导下使用本服务。',
    '',
    '## 7. 政策更新',
    '- 当本政策发生重大变化时，我们会通过小程序页面、弹窗或其他合理方式提示你。',
    '',
    '## 8. 联系我们',
    '- 如你对本政策有疑问、意见或投诉，请通过小程序内“问题反馈”入口或官方客服联系方式与我们联系。',
    ''
  ].join('\n'),
  user_agreement: [
    '# 用户服务协议',
    '',
    '更新日期：2026-06-03',
    '生效日期：2026-06-03',
    '',
    '欢迎使用八面成交CRM。你在注册、登录、使用本服务前，应仔细阅读并理解本协议。',
    '',
    '## 1. 服务内容',
    '- 八面成交CRM为用户提供项目管理、联系人与跟进管理、语音录入、AI 整理、分享协作、套餐订阅与增值服务。',
    '- 具体功能以小程序前台、后台配置及实际开放能力为准。',
    '',
    '## 2. 账户使用规则',
    '- 你应保证注册、绑定和提交的信息真实、合法、有效。',
    '- 你应妥善保管账号、设备和登录凭证，不得转让、出借或以其他方式允许他人冒用。',
    '',
    '## 3. 用户行为规范',
    '- 不得上传、发布、传播违法违规、侵权、骚扰、虚假或损害他人合法权益的内容。',
    '- 不得利用本服务从事破解、攻击、干扰、爬取、批量刷量等影响平台安全或稳定的行为。',
    '',
    '## 4. AI 与语音能力说明',
    '- AI 生成和语音识别结果仅作为效率辅助，不构成任何承诺、保证或专业意见。',
    '- 你应结合实际业务自行判断并承担因使用相关结果产生的责任。',
    '',
    '## 5. 付费与权益',
    '- 套餐、流量包、订阅价格、权益内容、有效期和使用限制以购买页、支付页和实际到账结果为准。',
    '- 因支付失败、退款、违规使用、系统异常纠正等原因，平台有权对相关权益进行回收、冻结或调整，并保留审计记录。',
    '',
    '## 6. 知识产权',
    '- 本服务的软件、页面、设计、文案、商标及相关技术资料的知识产权归平台或合法权利人所有。',
    '- 未经书面许可，不得擅自复制、修改、传播、反向工程或用于其他商业用途。',
    '',
    '## 7. 服务中断与责任限制',
    '- 对于因系统维护、网络故障、第三方能力异常、不可抗力等导致的服务中断或结果偏差，平台将在合理范围内处理，但不承担超出法律规定的责任。',
    '',
    '## 8. 协议变更与终止',
    '- 我们有权根据业务发展、法律法规要求更新本协议；重大变更会通过合理方式通知你。',
    '- 若你违反本协议，平台有权限制、暂停或终止向你提供部分或全部服务。',
    '',
    '## 9. 联系方式',
    '- 如需咨询、投诉或申请协助，请通过小程序内“问题反馈”入口或官方客服联系方式与我们联系。',
    ''
  ].join('\n')
}

function reportFatalUiError(message) {
  try {
    const notice = document.getElementById('runtimeNotice')
    if (!notice) {
      return
    }
    notice.hidden = false
    notice.className = 'runtime-note is-danger'
    notice.textContent = `页面异常：${toText(message) || '未知错误'}`
  } catch (error) {
    // Ignore secondary error to avoid recursion.
  }
}

const DEFAULT_CLOUD_CONFIG = buildDefaultCloudConfig()

function buildDefaultCloudConfig() {
  const savedConfig = readSavedCloudConfig()
  const queryProvider = toText(readQueryParam('provider'))
  const queryBridgeBase = toText(readQueryParam('bridgeBase'))
  const providerMode = queryProvider === 'mock'
    ? 'mock'
    : 'cloud'
  const baseConfig = {
    providerMode,
    bridgeBase: normalizeBridgeBase(queryBridgeBase || savedConfig.bridgeBase || ''),
    usersPath: '/adminListUsers',
    ordersPath: '/adminListOrders',
    usagePath: '/adminListUsage',
    auditPath: '/adminListAuditLogs',
    manualAdjustmentsPath: '/adminListManualAdjustments',
    feedbackPath: '/adminListFeedback',
    referralsPath: '/adminListReferrals',
    updateFeedbackPath: '/adminUpdateFeedback',
    updatePath: '/adminUpdateEntitlements',
    updatePlanPath: '/adminUpsertPlan',
    updateOrderPath: '/updateBillingOrderStatus',
    getAiModelConfigPath: '/adminGetAiModelConfig',
    listLegalDocumentsPath: '/adminListLegalDocuments',
    getLegalDocumentDetailPath: '/adminGetLegalDocumentDetail',
    upsertLegalDocumentDraftPath: '/adminUpsertLegalDocumentDraft',
    previewLegalDocumentPath: '/adminPreviewLegalDocument',
    publishLegalDocumentPath: '/adminPublishLegalDocument',
    cloneLegalDocumentDraftPath: '/adminCloneLegalDocumentDraft',
    updateAiModelConfigPath: '/adminUpdateAiModelConfig',
    testAiModelConfigPath: '/adminTestAiModelConfig'
  }

  if (queryProvider === 'mock') {
    clearSavedCloudConfig()
  } else if (queryBridgeBase) {
    saveCloudConfig(baseConfig)
  }

  return baseConfig
}

function readSavedCloudConfig() {
  try {
    const raw = window.localStorage && window.localStorage.getItem(CLOUD_CONFIG_STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (error) {
    return {}
  }
}

function saveCloudConfig(config = {}) {
  try {
    if (!window.localStorage) {
      return
    }
    window.localStorage.setItem(CLOUD_CONFIG_STORAGE_KEY, JSON.stringify({
      providerMode: toText(config.providerMode),
      bridgeBase: normalizeBridgeBase(config.bridgeBase)
    }))
  } catch (error) {
    // localStorage may be blocked in some embedded browsers.
  }
}

function clearSavedCloudConfig() {
  try {
    if (window.localStorage) {
      window.localStorage.removeItem(CLOUD_CONFIG_STORAGE_KEY)
    }
  } catch (error) {
    // localStorage may be blocked in some embedded browsers.
  }
}

const AI_PROVIDER_LIBRARY = {
  cloudbase_default: {
    providerKey: 'cloudbase_default',
    providerType: 'cloudbase',
    protocolMode: 'auto',
    providerClass: 'fallback',
    commercialTier: 'default',
    visibleLabel: '腾讯云默认',
    displayName: 'CloudBase 默认',
    cloudbaseProvider: 'hunyuan-exp',
    baseURL: '',
    defaultModel: 'hunyuan-turbos-latest',
    recommendedAt: '2026-05-06',
    baseURLRequired: false,
    baseURLEditable: false,
    apiKeyRequired: false,
    modelOptions: [
      { value: 'hunyuan-turbos-latest', label: 'hunyuan-turbos-latest' }
    ]
  },
  deepseek_primary: {
    providerKey: 'deepseek_primary',
    providerType: 'openai_compatible',
    protocolMode: 'chat_completions',
    providerClass: 'domestic',
    commercialTier: 'balanced',
    visibleLabel: 'DeepSeek',
    displayName: 'DeepSeek 主通道',
    cloudbaseProvider: '',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-flash',
    recommendedAt: '2026-05-06',
    baseURLRequired: true,
    baseURLEditable: true,
    apiKeyRequired: true,
    modelOptions: [
      { value: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
      { value: 'deepseek-v4-pro', label: 'deepseek-v4-pro' },
      { value: 'deepseek-chat', label: 'deepseek-chat（兼容名，2026-07-24 废弃）' },
      { value: 'deepseek-reasoner', label: 'deepseek-reasoner（兼容名，2026-07-24 废弃）' }
    ]
  },
  qwen_primary: {
    providerKey: 'qwen_primary',
    providerType: 'openai_compatible',
    protocolMode: 'chat_completions',
    providerClass: 'domestic',
    commercialTier: 'balanced',
    visibleLabel: '通义千问',
    displayName: 'Qwen 主通道',
    cloudbaseProvider: '',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-max',
    recommendedAt: '2026-05-06',
    baseURLRequired: true,
    baseURLEditable: true,
    apiKeyRequired: true,
    modelOptions: [
      { value: 'qwen-max', label: 'qwen-max' },
      { value: 'qwen-plus', label: 'qwen-plus' },
      { value: 'qwen-turbo', label: 'qwen-turbo' },
      { value: 'qwen-max-latest', label: 'qwen-max-latest' }
    ]
  },
  zhipu_primary: {
    providerKey: 'zhipu_primary',
    providerType: 'openai_compatible',
    protocolMode: 'chat_completions',
    providerClass: 'domestic',
    commercialTier: 'balanced',
    visibleLabel: '智谱 GLM',
    displayName: 'Zhipu 主通道',
    cloudbaseProvider: '',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4.5',
    recommendedAt: '2026-05-06',
    baseURLRequired: true,
    baseURLEditable: true,
    apiKeyRequired: true,
    modelOptions: [
      { value: 'glm-4.5', label: 'glm-4.5' },
      { value: 'glm-4.5-air', label: 'glm-4.5-air' },
      { value: 'glm-4.5-flash', label: 'glm-4.5-flash' }
    ]
  },
  kimi_primary: {
    providerKey: 'kimi_primary',
    providerType: 'openai_compatible',
    protocolMode: 'chat_completions',
    providerClass: 'domestic',
    commercialTier: 'premium',
    visibleLabel: 'Kimi',
    displayName: 'Kimi 主通道',
    cloudbaseProvider: '',
    baseURL: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2',
    recommendedAt: '2026-05-06',
    baseURLRequired: true,
    baseURLEditable: true,
    apiKeyRequired: true,
    modelOptions: [
      { value: 'kimi-k2', label: 'kimi-k2' },
      { value: 'kimi-k2-turbo-preview', label: 'kimi-k2-turbo-preview' },
      { value: 'kimi-latest', label: 'kimi-latest' },
      { value: 'moonshot-v1-8k', label: 'moonshot-v1-8k' },
      { value: 'moonshot-v1-32k', label: 'moonshot-v1-32k' }
    ]
  },
  openai_primary: {
    providerKey: 'openai_primary',
    providerType: 'openai_compatible',
    protocolMode: 'chat_completions',
    providerClass: 'international',
    commercialTier: 'premium',
    visibleLabel: '国际模型',
    displayName: 'OpenAI 兼容主通道',
    cloudbaseProvider: '',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.4-mini',
    recommendedAt: '2026-05-06',
    baseURLRequired: true,
    baseURLEditable: true,
    apiKeyRequired: true,
    modelOptions: [
      { value: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
      { value: 'gpt-5.4', label: 'gpt-5.4' },
      { value: 'gpt-4.1', label: 'gpt-4.1' }
    ]
  }
}

const AI_ROUTE_DEFINITIONS = [
  { key: 'quick_entry_project', label: '闪录项目匹配' },
  { key: 'followup_summary', label: '跟进摘要生成' },
  { key: 'followup_next_action', label: '下一步任务建议' },
  { key: 'project_judgement', label: '项目 AI 研判' },
  { key: 'project_review', label: '项目 AI 复盘' },
  { key: 'project_wake', label: '项目 AI 唤醒' },
  { key: 'share_brief', label: '外发摘要生成' }
]

const DEFAULT_AI_MODEL_CONFIG = {
  quotaPolicy: 'local_quota',
  providers: {
    cloudbase_default: {
      providerKey: 'cloudbase_default',
      providerType: 'cloudbase',
      protocolMode: 'auto',
      providerClass: 'fallback',
      commercialTier: 'default',
      visibleLabel: '腾讯云默认',
      displayName: 'CloudBase 默认',
      cloudbaseProvider: 'hunyuan-exp',
      baseURL: '',
      defaultModel: 'hunyuan-turbos-latest',
      hasApiKey: false,
      apiKeyMasked: '',
      apiKeyInput: '',
      enabled: true
    },
    qwen_primary: {
      providerKey: 'qwen_primary',
      providerType: 'openai_compatible',
      protocolMode: 'chat_completions',
      providerClass: 'domestic',
      commercialTier: 'balanced',
      visibleLabel: '通义千问',
      displayName: 'Qwen 主通道',
      cloudbaseProvider: '',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      defaultModel: 'qwen-max',
      hasApiKey: false,
      apiKeyMasked: '',
      apiKeyInput: '',
      enabled: false
    },
    zhipu_primary: {
      providerKey: 'zhipu_primary',
      providerType: 'openai_compatible',
      protocolMode: 'chat_completions',
      providerClass: 'domestic',
      commercialTier: 'balanced',
      visibleLabel: '智谱 GLM',
      displayName: 'Zhipu 主通道',
      cloudbaseProvider: '',
      baseURL: 'https://open.bigmodel.cn/api/paas/v4',
      defaultModel: 'glm-4.5',
      hasApiKey: false,
      apiKeyMasked: '',
      apiKeyInput: '',
      enabled: false
    },
    kimi_primary: {
      providerKey: 'kimi_primary',
      providerType: 'openai_compatible',
      protocolMode: 'chat_completions',
      providerClass: 'domestic',
      commercialTier: 'premium',
      visibleLabel: 'Kimi',
      displayName: 'Kimi 主通道',
      cloudbaseProvider: '',
      baseURL: 'https://api.moonshot.cn/v1',
      defaultModel: 'kimi-k2',
      hasApiKey: false,
      apiKeyMasked: '',
      apiKeyInput: '',
      enabled: false
    },
    openai_primary: {
      providerKey: 'openai_primary',
      providerType: 'openai_compatible',
      protocolMode: 'chat_completions',
      providerClass: 'international',
      commercialTier: 'premium',
      visibleLabel: '国际模型',
      displayName: 'OpenAI 兼容主通道',
      cloudbaseProvider: '',
      baseURL: 'https://api.openai.com/v1',
      defaultModel: 'gpt-5.4-mini',
      hasApiKey: false,
      apiKeyMasked: '',
      apiKeyInput: '',
      enabled: false
    },
    deepseek_primary: {
      providerKey: 'deepseek_primary',
      providerType: 'openai_compatible',
      protocolMode: 'chat_completions',
      providerClass: 'domestic',
      commercialTier: 'balanced',
      visibleLabel: 'DeepSeek',
      displayName: 'DeepSeek 主通道',
      cloudbaseProvider: '',
      baseURL: 'https://api.deepseek.com/v1',
      defaultModel: 'deepseek-v4-flash',
      hasApiKey: false,
      apiKeyMasked: '',
      apiKeyInput: '',
      enabled: false
    }
  },
  modelRouting: {
    quick_entry_project: {
      providerKey: 'cloudbase_default',
      provider: 'hunyuan-exp',
      model: 'hunyuan-turbos-latest',
      fallbackProviderKey: '',
      fallbackModel: '',
      enabled: true
    },
    followup_summary: {
      providerKey: 'cloudbase_default',
      provider: 'hunyuan-exp',
      model: 'hunyuan-turbos-latest',
      fallbackProviderKey: '',
      fallbackModel: '',
      enabled: true
    },
    followup_next_action: {
      providerKey: 'cloudbase_default',
      provider: 'hunyuan-exp',
      model: 'hunyuan-turbos-latest',
      fallbackProviderKey: '',
      fallbackModel: '',
      enabled: true
    },
    project_judgement: {
      providerKey: 'cloudbase_default',
      provider: 'hunyuan-exp',
      model: 'hunyuan-turbos-latest',
      fallbackProviderKey: '',
      fallbackModel: '',
      enabled: true
    },
    project_review: {
      providerKey: 'cloudbase_default',
      provider: 'hunyuan-exp',
      model: 'hunyuan-turbos-latest',
      fallbackProviderKey: '',
      fallbackModel: '',
      enabled: true
    },
    project_wake: {
      providerKey: 'cloudbase_default',
      provider: 'hunyuan-exp',
      model: 'hunyuan-turbos-latest',
      fallbackProviderKey: '',
      fallbackModel: '',
      enabled: true
    },
    share_brief: {
      providerKey: 'cloudbase_default',
      provider: 'hunyuan-exp',
      model: 'hunyuan-turbos-latest',
      fallbackProviderKey: '',
      fallbackModel: '',
      enabled: true
    }
  }
}

const INITIAL_MOCK_DATA = createMockData()

let state = createUiState()
let provider = createProvider(state.runtime.providerMode)

function toText(value) {
  return String(value || '').trim()
}

function toNumber(value, fallback = 0) {
  const current = Number(value)
  return Number.isFinite(current) ? current : fallback
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function readQueryParam(key) {
  try {
    return new URLSearchParams(window.location.search).get(key) || ''
  } catch (error) {
    return ''
  }
}

function normalizeBridgeBase(value) {
  return toText(value).replace(/\/+$/, '')
}

function maskSecretForUi(value) {
  const text = toText(value)
  if (!text) {
    return ''
  }
  if (text.length <= 8) {
    return `${text.slice(0, 2)}***`
  }
  return `${text.slice(0, 4)}***${text.slice(-4)}`
}

function escapeHtml(value) {
  return toText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getLegalDocumentTypeLabel(docType = '') {
  return LEGAL_DOCUMENT_TITLE_MAP[toText(docType)] || toText(docType) || '未命名协议'
}

function buildDefaultLegalDocumentMarkdown(docType = '') {
  const currentDocType = toText(docType)
  return LEGAL_DOCUMENT_TEMPLATE_LIBRARY[currentDocType] || [
    `# ${getLegalDocumentTypeLabel(currentDocType)}`,
    '',
    '更新日期：2026-06-03',
    '生效日期：2026-06-03',
    '',
    '请在此填写协议正文。',
    ''
  ].join('\n')
}

function buildEmptyLegalDocumentDraft(docType = 'privacy_policy') {
  const currentDocType = toText(docType) || 'privacy_policy'
  return {
    docId: '',
    docType: currentDocType,
    title: getLegalDocumentTypeLabel(currentDocType),
    version: '',
    status: 'draft',
    summary: '',
    changeNotesText: '',
    requiresReconsent: currentDocType === 'privacy_policy' || currentDocType === 'user_agreement',
    effectiveAt: '',
    markdownSource: buildDefaultLegalDocumentMarkdown(currentDocType),
    htmlSnapshot: '',
    plainTextSnapshot: '',
    hash: '',
    previousVersion: '',
    sourceDraftId: '',
    currentRevision: 1,
    publishedAt: '',
    updatedAt: '',
    isCurrent: false,
    readOnly: false
  }
}

function formatDateTimeLocalValue(value) {
  if (!value) {
    return ''
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function normalizeLegalChangeNotesText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean).join('\n')
  }
  return toText(value)
}

function splitLegalChangeNotes(value) {
  return toText(value)
    .split('\n')
    .map((item) => toText(item))
    .filter(Boolean)
}

function normalizeLegalDocumentSummaryForUi(record = {}) {
  return {
    docId: toText(record.docId || record._id),
    docType: toText(record.docType),
    title: toText(record.title || getLegalDocumentTypeLabel(record.docType)),
    version: toText(record.version),
    status: toText(record.status || 'draft'),
    isCurrent: Boolean(record.isCurrent),
    requiresReconsent: Boolean(record.requiresReconsent),
    contentFormat: toText(record.contentFormat || 'markdown'),
    summary: toText(record.summary),
    changeNotes: Array.isArray(record.changeNotes) ? record.changeNotes.map((item) => toText(item)).filter(Boolean) : [],
    effectiveAt: toText(record.effectiveAt),
    publishedAt: toText(record.publishedAt),
    archivedAt: toText(record.archivedAt),
    hash: toText(record.hash),
    previousVersion: toText(record.previousVersion),
    currentRevision: Math.max(1, Math.floor(toNumber(record.currentRevision, 1))),
    updatedBy: toText(record.updatedBy || record.operatorId),
    updatedAt: toText(record.updatedAt),
    createdAt: toText(record.createdAt)
  }
}

function normalizeLegalDocumentDetailForUi(record = {}) {
  const summary = normalizeLegalDocumentSummaryForUi(record)
  return {
    ...summary,
    markdownSource: String(record.markdownSource || ''),
    htmlSnapshot: toText(record.htmlSnapshot),
    plainTextSnapshot: toText(record.plainTextSnapshot),
    sourceDraftId: toText(record.sourceDraftId),
    operatorId: toText(record.operatorId),
    readOnly: summary.status === 'published'
  }
}

function createLegalDraftFromDetail(record = {}) {
  const detail = normalizeLegalDocumentDetailForUi(record)
  return {
    ...detail,
    changeNotesText: normalizeLegalChangeNotesText(detail.changeNotes),
    effectiveAt: formatDateTimeLocalValue(detail.effectiveAt)
  }
}

function createEmptyLegalPreviewState() {
  return {
    html: '',
    plainText: '',
    generatedAt: '',
    source: 'empty'
  }
}

function getLegalDocumentStatusLabel(status = '') {
  return {
    draft: '草稿',
    published: '已发布',
    archived: '已归档'
  }[toText(status)] || '未知状态'
}

function getLegalDocumentStatusBadgeClass(status = '') {
  const current = toText(status)
  if (current === 'published') {
    return 'is-success'
  }
  if (current === 'archived') {
    return 'is-neutral'
  }
  return 'is-brand'
}

function renderLegalMarkdownPreview(markdownSource = '') {
  const lines = String(markdownSource || '').replace(/\r\n/g, '\n').trim().split('\n')
  const html = []
  let listBuffer = []
  let paragraphBuffer = []

  function flushList() {
    if (!listBuffer.length) {
      return
    }
    html.push('<ul>')
    listBuffer.forEach((item) => {
      html.push(`<li>${escapeHtml(item)}</li>`)
    })
    html.push('</ul>')
    listBuffer = []
  }

  function flushParagraph() {
    if (!paragraphBuffer.length) {
      return
    }
    html.push(`<p>${paragraphBuffer.map((item) => escapeHtml(item)).join('<br />')}</p>`)
    paragraphBuffer = []
  }

  lines.forEach((line) => {
    const trimmed = toText(line)
    if (!trimmed) {
      flushList()
      flushParagraph()
      return
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      flushList()
      flushParagraph()
      const level = Math.min(6, headingMatch[1].length)
      html.push(`<h${level}>${escapeHtml(headingMatch[2])}</h${level}>`)
      return
    }

    const listMatch = trimmed.match(/^[-*]\s+(.+)$/)
    if (listMatch) {
      flushParagraph()
      listBuffer.push(listMatch[1])
      return
    }

    flushList()
    paragraphBuffer.push(trimmed)
  })

  flushList()
  flushParagraph()
  return html.join('')
}

function buildLegalPlainText(markdownSource = '') {
  return String(markdownSource || '')
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function legalDocumentMatches(item, keyword = '') {
  const currentKeyword = toText(keyword).toLowerCase()
  if (!currentKeyword) {
    return true
  }
  return [
    item.docId,
    item.docType,
    getLegalDocumentTypeLabel(item.docType),
    item.title,
    item.version,
    item.summary
  ].some((field) => toText(field).toLowerCase().includes(currentKeyword))
}

function suggestNextLegalVersion(version = '') {
  const current = toText(version)
  const semverMatch = current.match(/^v?(\d+)\.(\d+)\.(\d+)$/i)
  if (semverMatch) {
    return `v${semverMatch[1]}.${semverMatch[2]}.${Number(semverMatch[3]) + 1}`
  }
  const dateMatch = current.match(/^(\d{4}-\d{2}-\d{2})(?:\.(\d+))?$/)
  if (dateMatch) {
    return `${dateMatch[1]}.${Number(dateMatch[2] || 0) + 1}`
  }
  if (current) {
    return `${current}.1`
  }
  return 'v1.0.0'
}

function buildAuditLog(payload) {
  return {
    logId: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    operatorId: payload.operatorId,
    actionType: payload.actionType,
    targetType: payload.targetType,
    targetId: payload.targetId,
    reason: payload.reason,
    beforeSnapshot: payload.beforeSnapshot || {},
    afterSnapshot: payload.afterSnapshot || {},
    createdAt: payload.createdAt
  }
}

function formatDateTimeText(value) {
  if (!value) {
    return ''
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return toText(value)
  }
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatCompactDateText(value) {
  if (!value) {
    return ''
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return toText(value)
  }
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

function formatAmountText(amount, currency = 'CNY') {
  const current = Number(amount)
  if (!Number.isFinite(current) || current <= 0) {
    return '价格待定'
  }
  if (currency && currency !== 'CNY') {
    return `${currency} ${current}`
  }
  return `¥${(current / 100).toFixed(2)}`
}

function formatPlanPriceText(record = {}) {
  const price = toNumber(record.price, 0)
  if (price > 0) {
    return formatAmountText(price, 'CNY')
  }

  return toText(record.displayPriceText || record.priceLabel) || '价格待定'
}

function addDays(source, days) {
  const base = source instanceof Date ? new Date(source.getTime()) : new Date(source)
  if (Number.isNaN(base.getTime())) {
    return null
  }
  base.setDate(base.getDate() + Math.max(0, Math.floor(toNumber(days, 0))))
  return base
}

function addCycle(source, billingCycle) {
  const base = source instanceof Date ? new Date(source.getTime()) : new Date(source)
  if (Number.isNaN(base.getTime())) {
    return null
  }
  if (billingCycle === 'yearly') {
    base.setFullYear(base.getFullYear() + 1)
    return base
  }
  base.setMonth(base.getMonth() + 1)
  return base
}

function parseDate(value) {
  if (!value) {
    return null
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function isFutureDate(value, now = new Date()) {
  const date = parseDate(value)
  return Boolean(date && date.getTime() > now.getTime())
}

function getStatusLabel(status) {
  return {
    trialing: '试用中',
    free_limited: '免费受限',
    active_paid: '付费有效',
    expired_readonly: '到期只读',
    disabled: '已禁用'
  }[status] || status || '未定义'
}

function getAccessLabel(accessLevel) {
  return {
    trial_full: '试用可写',
    paid_active: '付费可写',
    paid_readonly: '到期只读',
    free_readonly: '免费只读',
    disabled: '已禁用'
  }[accessLevel] || accessLevel || '未定义'
}

function getStatusBadgeClass(status) {
  if (status === 'active_paid') {
    return 'is-success'
  }
  if (status === 'expired_readonly' || status === 'disabled') {
    return 'is-danger'
  }
  if (status === 'trialing') {
    return 'is-brand'
  }
  return 'is-soft'
}

function getOrderStatusLabel(status) {
  return {
    pending: '待支付',
    paid: '已支付',
    failed: '支付失败',
    closed: '已关闭'
  }[status] || status || '未定义'
}

function getReadinessLabel(readiness) {
  return {
    placeholder_only: '仅留痕未接通',
    config_incomplete: '配置待补齐',
    ready: '可发起支付'
  }[readiness] || readiness || '未定义'
}

function getReadinessBadgeClass(readiness) {
  if (readiness === 'ready') {
    return 'is-success'
  }
  if (readiness === 'config_incomplete') {
    return 'is-soft'
  }
  return 'is-neutral'
}

function getReasonLabel(reason) {
  return {
    speech_exhausted: '语音额度不足',
    ai_exhausted: 'AI 额度不足',
    project_limit_reached: '项目数达上限',
    write_disabled: '账号只读',
    share_out_disabled: '外发受限',
    bind_required: '待绑定手机号'
  }[reason] || reason || '常规进入'
}

function getActionLabel(actionType) {
  return {
    grant_subscription: '补开订阅',
    extend_trial: '延长试用',
    add_voice: '补语音',
    add_ai: '补 AI',
    upsert_plan: '维护商品目录',
    feedback_accept: '采纳反馈',
    feedback_reject: '不采纳反馈',
    feedback_close: '关闭反馈',
    feedback_reward: '发放反馈奖励',
    disable_account: '禁用账户',
    enable_account: '恢复账户',
    expire_subscription: '设为到期只读'
  }[actionType] || actionType
}

function getActionBadgeClass(actionType) {
  if (actionType === 'disable_account') {
    return 'is-danger'
  }
  if (actionType === 'grant_subscription' || actionType === 'enable_account' || actionType === 'feedback_reward') {
    return 'is-success'
  }
  if (actionType === 'extend_trial' || actionType === 'add_voice' || actionType === 'add_ai' || actionType === 'feedback_accept') {
    return 'is-brand'
  }
  if (actionType === 'feedback_reject' || actionType === 'feedback_close') {
    return 'is-neutral'
  }
  return 'is-soft'
}

function isManualAdjustmentAction(actionType) {
  return [
    'add_voice',
    'add_ai',
    'extend_trial',
    'grant_subscription',
    'enable_account',
    'expire_subscription',
    'disable_account'
  ].includes(toText(actionType))
}

function getUsageTypeLabel(usageType) {
  return {
    voice_seconds: '语音额度',
    ai_tokens: 'AI 额度'
  }[usageType] || usageType || '未定义'
}

function getSourceTypeLabel(sourceType) {
  return {
    speech_to_text: '语音转写',
    quick_entry_match: '闪录匹配',
    quick_entry_project_match: 'AI 匹配项目',
    summarize_followup: 'AI 整理',
    followup_summary: 'AI 生成摘要',
    followup_next_action: 'AI 下一步建议',
    billing_subscription: '订阅到账',
    billing_voice_pack: '语音包到账',
    billing_ai_pack: 'AI 包到账',
    feedback_reward: '反馈奖励',
    referral_reward: '推荐奖励',
    admin_console: '后台补量',
    compensate: '补偿发放',
    refund_revert: '退款回滚'
  }[sourceType] || sourceType || '未定义'
}

function getUsageEventStatusLabel(status) {
  return {
    success: '成功',
    failed: '失败'
  }[toText(status)] || toText(status) || '未定义'
}

function getUsageEventStatusBadgeClass(status) {
  if (status === 'success') {
    return 'is-success'
  }
  if (status === 'failed') {
    return 'is-danger'
  }
  return 'is-neutral'
}

function getUsageRouteLabel(routeKey) {
  const current = toText(routeKey)
  if (!current) {
    return '未识别路由'
  }
  const matched = AI_ROUTE_DEFINITIONS.find((item) => item.key === current)
  return matched ? matched.label : current
}

function getUsageSourceFilterLabel(sourceType = 'all') {
  const current = toText(sourceType || 'all')
  if (!current || current === 'all') {
    return '全部场景'
  }
  return getSourceTypeLabel(current)
}

function getUsageTimeWindowLabel(value = 'all') {
  return {
    all: '全部时间',
    today: '今天',
    last_7d: '近 7 天',
    last_30d: '近 30 天'
  }[toText(value || 'all')] || '全部时间'
}

function getPlanTypeLabel(planType) {
  return {
    subscription: '订阅套餐',
    voice_pack: '语音包',
    ai_pack: 'AI 包'
  }[planType] || planType || '未定义'
}

function formatInteger(value) {
  const current = Math.max(0, Math.round(toNumber(value, 0)))
  return `${current}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function formatVoiceQuotaText(value) {
  const seconds = Math.max(0, toNumber(value, 0))
  if (seconds <= 0) {
    return '无'
  }
  if (seconds % 3600 === 0) {
    return `${seconds / 3600} 小时`
  }
  if (seconds % 60 === 0) {
    return `${seconds / 60} 分钟`
  }
  return `${seconds} 秒`
}

function formatAiQuotaText(value) {
  const tokens = Math.max(0, toNumber(value, 0))
  return tokens > 0 ? `${formatInteger(tokens)} token` : '无'
}

function formatRatioText(value) {
  const current = Number(value)
  if (!Number.isFinite(current) || current <= 0) {
    return '0%'
  }
  return `${(Math.min(1, current) * 100).toFixed(current >= 0.995 ? 0 : 1)}%`
}

function formatPercentText(value) {
  const current = Number(value)
  if (!Number.isFinite(current) || current <= 0) {
    return '0%'
  }
  return `${(current * 100).toFixed(current >= 0.995 ? 0 : 1)}%`
}

function formatDurationMsText(value) {
  const current = Math.max(0, Math.round(toNumber(value, 0)))
  if (current <= 0) {
    return '0 ms'
  }
  if (current >= 1000) {
    return `${(current / 1000).toFixed(current >= 10000 ? 0 : 1)} s`
  }
  return `${current} ms`
}

function formatCharsText(value) {
  const current = Math.max(0, Math.round(toNumber(value, 0)))
  return current > 0 ? `${formatInteger(current)} 字` : '0 字'
}

function formatProjectLimitText(value) {
  const projectLimit = toNumber(value, -1)
  return projectLimit < 0 ? '项目数量不限' : `${projectLimit} 个项目`
}

function formatUsageAmountText(usageType, value) {
  if (usageType === 'voice_seconds') {
    return formatVoiceQuotaText(value)
  }
  if (usageType === 'ai_tokens') {
    return formatAiQuotaText(value)
  }
  return formatInteger(value)
}

function formatUsageDeltaText(usageType, value) {
  const current = toNumber(value, 0)
  if (current === 0) {
    return '0'
  }
  const amountText = formatUsageAmountText(usageType, Math.abs(current))
  return current > 0 ? `+${amountText}` : `-${amountText}`
}

function formatUsageBalanceRangeText(usageType, beforeValue, afterValue) {
  return `${formatUsageAmountText(usageType, beforeValue)} -> ${formatUsageAmountText(usageType, afterValue)}`
}

function buildUsageSourceStats(ledger = [], usageTypeFilter = 'all') {
  const map = {}
  ;(Array.isArray(ledger) ? ledger : []).forEach((item) => {
    const sourceType = toText(item && item.sourceType) || 'unknown'
    if (!map[sourceType]) {
      map[sourceType] = {
        sourceType,
        sourceLabel: getSourceTypeLabel(sourceType),
        consumeCount: 0,
        grantCount: 0,
        consumeVoiceSeconds: 0,
        grantVoiceSeconds: 0,
        consumeAiTokens: 0,
        grantAiTokens: 0,
        records: 0
      }
    }
    const current = map[sourceType]
    current.records += 1
    const usageType = toText(item && item.usageType)
    const delta = toNumber(item && item.delta, 0)

    if (delta < 0) {
      current.consumeCount += 1
      if (usageType === 'voice_seconds') {
        current.consumeVoiceSeconds += Math.abs(delta)
      } else if (usageType === 'ai_tokens') {
        current.consumeAiTokens += Math.abs(delta)
      }
      return
    }

    if (delta > 0) {
      current.grantCount += 1
      if (usageType === 'voice_seconds') {
        current.grantVoiceSeconds += delta
      } else if (usageType === 'ai_tokens') {
        current.grantAiTokens += delta
      }
    }
  })

  return Object.values(map)
    .sort((left, right) => {
      if (usageTypeFilter === 'voice_seconds') {
        return right.consumeVoiceSeconds - left.consumeVoiceSeconds
      }
      if (usageTypeFilter === 'ai_tokens') {
        return right.consumeAiTokens - left.consumeAiTokens
      }
      if (right.consumeCount !== left.consumeCount) {
        return right.consumeCount - left.consumeCount
      }
      const leftMixed = left.consumeAiTokens + Math.round(left.consumeVoiceSeconds / 10)
      const rightMixed = right.consumeAiTokens + Math.round(right.consumeVoiceSeconds / 10)
      return rightMixed - leftMixed
    })
}

function isUsageWithinTimeWindow(item = {}, windowType = 'all') {
  const currentWindow = toText(windowType || 'all')
  if (currentWindow === 'all') {
    return true
  }

  const occurredAtText = toText(item && item.occurredAt)
  const occurredAt = occurredAtText ? new Date(occurredAtText) : null
  if (!occurredAt || Number.isNaN(occurredAt.getTime())) {
    return false
  }

  const now = new Date()
  if (currentWindow === 'today') {
    return occurredAt.toDateString() === now.toDateString()
  }

  const days = currentWindow === 'last_7d'
    ? 7
    : (currentWindow === 'last_30d' ? 30 : 0)
  if (!days) {
    return true
  }

  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  return occurredAt.getTime() >= cutoff.getTime()
}

function buildUsageSourceSummaryItem(stat = {}, usageTypeFilter = 'all') {
  const consumeCount = Math.max(0, toNumber(stat.consumeCount, 0))
  const grantCount = Math.max(0, toNumber(stat.grantCount, 0))
  const records = Math.max(0, toNumber(stat.records, consumeCount + grantCount))
  const consumeVoiceSeconds = Math.max(0, toNumber(stat.consumeVoiceSeconds, 0))
  const grantVoiceSeconds = Math.max(0, toNumber(stat.grantVoiceSeconds, 0))
  const consumeAiTokens = Math.max(0, toNumber(stat.consumeAiTokens, 0))
  const grantAiTokens = Math.max(0, toNumber(stat.grantAiTokens, 0))

  if (usageTypeFilter === 'voice_seconds') {
    return {
      label: stat.sourceLabel,
      value: `-${formatVoiceQuotaText(consumeVoiceSeconds)}`,
      note: `流水 ${records} 条 · 消耗 ${consumeCount} 条 · 发放 ${grantCount} 条 · 回补 ${formatVoiceQuotaText(grantVoiceSeconds)}`
    }
  }

  if (usageTypeFilter === 'ai_tokens') {
    return {
      label: stat.sourceLabel,
      value: `-${formatAiQuotaText(consumeAiTokens)}`,
      note: `流水 ${records} 条 · 消耗 ${consumeCount} 条 · 发放 ${grantCount} 条 · 回补 ${formatAiQuotaText(grantAiTokens)}`
    }
  }

  return {
    label: stat.sourceLabel,
    value: `${consumeCount} 条消耗`,
    note: `流水 ${records} 条 · 语音 -${formatVoiceQuotaText(consumeVoiceSeconds)} / +${formatVoiceQuotaText(grantVoiceSeconds)} · AI -${formatAiQuotaText(consumeAiTokens)} / +${formatAiQuotaText(grantAiTokens)}`
  }
}

function buildUsageFilterPills() {
  const pills = []
  if (state.usageTypeFilter !== 'all') {
    pills.push(`额度类型：${getUsageTypeLabel(state.usageTypeFilter)}`)
  }
  if (state.usageTimeWindow !== 'all') {
    pills.push(`时间：${getUsageTimeWindowLabel(state.usageTimeWindow)}`)
  }
  if (state.usageSourceFilter !== 'all') {
    pills.push(`场景：${getUsageSourceFilterLabel(state.usageSourceFilter)}`)
  }
  if (toText(state.usageSearch)) {
    pills.push(`关键词：${toText(state.usageSearch)}`)
  }
  if (toText(state.usageProviderFilter)) {
    pills.push(`供应商：${toText(state.usageProviderFilter)}`)
  }
  if (toText(state.usageModelFilter)) {
    pills.push(`模型：${toText(state.usageModelFilter)}`)
  }
  if (state.usageBalanceAlertFilter !== 'all') {
    const alertLabel = {
      voice_low: '语音低余额',
      ai_low: 'AI 低余额',
      both_low: '双低余额',
      bind_required: '待绑定账户',
      expiring_soon: '7 天内到期',
      high_risk: '高风险账户',
      readonly: '只读账户',
      project_blocked: '项目受限'
    }[state.usageBalanceAlertFilter] || '运营预警'
    pills.push(`预警：${alertLabel}`)
  }
  return pills
}

function getGlobalUsageActiveType() {
  return state.globalUsageTab === 'voice_seconds' ? 'voice_seconds' : 'ai_tokens'
}

function buildGlobalUsageFilterPills() {
  const pills = []
  const activeType = getGlobalUsageActiveType()
  pills.push(`流水类型：${activeType === 'ai_tokens' ? 'AI Token' : '语音'}`)
  if (state.globalUsageTimeWindow !== 'all') {
    pills.push(`时间：${getUsageTimeWindowLabel(state.globalUsageTimeWindow)}`)
  }
  if (state.globalUsageSourceFilter !== 'all') {
    pills.push(`场景：${getUsageSourceFilterLabel(state.globalUsageSourceFilter)}`)
  }
  if (toText(state.globalUsageSearch)) {
    pills.push(`关键词：${toText(state.globalUsageSearch)}`)
  }
  if (activeType === 'ai_tokens' && toText(state.globalUsageProviderFilter)) {
    pills.push(`供应商：${toText(state.globalUsageProviderFilter)}`)
  }
  if (activeType === 'ai_tokens' && toText(state.globalUsageModelFilter)) {
    pills.push(`模型：${toText(state.globalUsageModelFilter)}`)
  }
  return pills
}

function resetUsageFilters(options = {}) {
  const keepSearch = options && options.keepSearch === true
  if (!keepSearch) {
    state.usageSearch = ''
    const searchInput = document.getElementById('usageSearchInput')
    if (searchInput) {
      searchInput.value = ''
    }
  }
  state.usageTypeFilter = 'all'
  state.usageTimeWindow = 'all'
  state.usageSourceFilter = 'all'
  state.usageProviderFilter = ''
  state.usageModelFilter = ''
  state.usageBalanceAlertFilter = 'all'

  const typeSelect = document.getElementById('usageTypeFilter')
  if (typeSelect) {
    typeSelect.value = 'all'
  }
  const windowSelect = document.getElementById('usageTimeWindowFilter')
  if (windowSelect) {
    windowSelect.value = 'all'
  }
  const sourceSelect = document.getElementById('usageSourceFilterSelect')
  if (sourceSelect) {
    sourceSelect.value = 'all'
  }
  const providerInput = document.getElementById('usageProviderFilterInput')
  if (providerInput) {
    providerInput.value = ''
  }
  const modelInput = document.getElementById('usageModelFilterInput')
  if (modelInput) {
    modelInput.value = ''
  }
}

function resetGlobalUsageFilters(options = {}) {
  const keepSearch = options && options.keepSearch === true
  if (!keepSearch) {
    state.globalUsageSearch = ''
    const searchInput = document.getElementById('globalUsageSearchInput')
    if (searchInput) {
      searchInput.value = ''
    }
  }
  state.globalUsagePage = 1
  state.globalUsageTimeWindow = 'all'
  state.globalUsageSourceFilter = 'all'
  state.globalUsageProviderFilter = ''
  state.globalUsageModelFilter = ''

  const windowSelect = document.getElementById('globalUsageTimeWindowFilter')
  if (windowSelect) {
    windowSelect.value = 'all'
  }
  const sourceSelect = document.getElementById('globalUsageSourceFilterSelect')
  if (sourceSelect) {
    sourceSelect.value = 'all'
  }
  const providerInput = document.getElementById('globalUsageProviderFilterInput')
  if (providerInput) {
    providerInput.value = ''
  }
  const modelInput = document.getElementById('globalUsageModelFilterInput')
  if (modelInput) {
    modelInput.value = ''
  }
}

function getUsageDirectionBadgeClass(delta) {
  const current = toNumber(delta, 0)
  if (current > 0) {
    return 'is-success'
  }
  if (current < 0) {
    return 'is-danger'
  }
  return 'is-soft'
}

function getUsageDirectionLabel(delta) {
  const current = toNumber(delta, 0)
  if (current > 0) {
    return '发放'
  }
  if (current < 0) {
    return '消耗'
  }
  return '平账'
}

function formatUsageRawAmount(item = {}) {
  const usageType = toText(item.usageType)
  const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
  if (usageType === 'voice_seconds') {
    const seconds = toNumber(meta.billedSeconds, NaN)
    if (Number.isFinite(seconds) && seconds > 0) {
      return `${seconds} 秒`
    }
    return ''
  }
  if (usageType === 'ai_tokens') {
    const rawTotal = toNumber(meta.rawTotalTokens, NaN)
    if (Number.isFinite(rawTotal) && rawTotal > 0) {
      return `${formatInteger(rawTotal)}`
    }
    return ''
  }
  return ''
}

function getUsageProviderKey(item = {}) {
  const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
  return toText(meta.providerKey)
}

function getUsageModelName(item = {}) {
  const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
  return toText(meta.model)
}

function getUsageProviderLabel(item = {}) {
  const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
  return toText(meta.providerLabel || meta.providerKey || '')
}

function parseDateMs(value) {
  const text = toText(value)
  if (!text) {
    return 0
  }
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) {
    return 0
  }
  return date.getTime()
}

function formatUsageDateKey(ms) {
  const current = toNumber(ms, 0)
  if (!current) {
    return ''
  }
  const date = new Date(current)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatUsageMultiplier(meta = {}) {
  const multiplier = toNumber(meta.multiplier, NaN)
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    return ''
  }
  return `x${multiplier}`
}

function formatUsageBillingMethod(meta = {}) {
  const method = toText(meta.billingMethod)
  return {
    provider_usage: '按模型返回用量计费',
    estimated_chars: '按字符估算计费'
  }[method] || ''
}

function formatUsageModelLabel(meta = {}) {
  const providerLabel = toText(meta.providerLabel)
  const model = toText(meta.model)
  if (providerLabel && model) {
    return `${providerLabel} / ${model}`
  }
  return providerLabel || model
}

function formatUsageProjectLabel(meta = {}) {
  const projectName = toText(meta.projectName)
  const projectId = toText(meta.projectId)
  if (projectName && projectId) {
    return `${projectName} (${projectId})`
  }
  return projectName || projectId
}

function buildUsageMetaInfo(item = {}) {
  const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
  const primaryLines = []
  const technicalLines = []

  const projectLabel = formatUsageProjectLabel(meta)
  if (projectLabel) {
    primaryLines.push(`项目：${projectLabel}`)
  }

  const modelLabel = formatUsageModelLabel(meta)
  if (modelLabel) {
    primaryLines.push(`模型：${modelLabel}`)
  }

  const billingMethod = formatUsageBillingMethod(meta)
  const rawAmount = formatUsageRawAmount(item)
  const multiplierText = formatUsageMultiplier(meta)
  if (billingMethod || rawAmount || multiplierText) {
    const parts = [billingMethod, rawAmount ? `原始用量 ${rawAmount}` : '', multiplierText ? `倍率 ${multiplierText}` : '']
      .filter(Boolean)
    if (parts.length) {
      primaryLines.push(parts.join(' · '))
    }
  }

  const pageKey = toText(meta.pageKey)
  if (pageKey) {
    primaryLines.push(`入口：${pageKey}`)
  }

  const reason = toText(meta.reason)
  if (reason) {
    primaryLines.push(`说明：${reason}`)
  }

  if (meta.fallbackUsed === true) {
    primaryLines.push('本次请求走了 fallback')
  }

  const primaryError = toText(meta.primaryError)
  if (primaryError) {
    technicalLines.push(`主路由错误：${primaryError}`)
  }

  const routeKey = toText(meta.routeKey)
  if (routeKey) {
    technicalLines.push(`routeKey：${routeKey}`)
  }

  const providerKey = toText(meta.providerKey)
  if (providerKey) {
    technicalLines.push(`providerKey：${providerKey}`)
  }

  const sourceId = toText(item.sourceId)
  if (sourceId) {
    technicalLines.push(`sourceId：${sourceId}`)
  }

  const requestId = toText(meta.requestId)
  if (requestId) {
    technicalLines.push(`请求ID：${requestId}`)
  }

  const traceId = toText(item.traceId)
  if (traceId) {
    technicalLines.push(`Trace：${traceId}`)
  }

  return {
    primaryLines,
    technicalLines
  }
}

function formatUsageMetaLines(item = {}) {
  const metaInfo = buildUsageMetaInfo(item)
  return (metaInfo.primaryLines || []).concat(metaInfo.technicalLines || [])
}

function getUsageTypeBadgeClass(usageType) {
  const current = toText(usageType)
  if (current === 'voice_seconds') {
    return 'is-soft'
  }
  if (current === 'ai_tokens') {
    return 'is-brand'
  }
  return 'is-neutral'
}

function buildUsageLedgerStats(ledger = []) {
  return (Array.isArray(ledger) ? ledger : []).reduce((stats, item) => {
    stats.records += 1

    const usageType = toText(item && item.usageType)
    const delta = toNumber(item && item.delta, 0)
    const meta = item && item.meta && typeof item.meta === 'object' ? item.meta : {}

    if (delta < 0) {
      stats.consumeCount += 1
      if (usageType === 'voice_seconds') {
        stats.consumeVoiceSeconds += Math.abs(delta)
      } else if (usageType === 'ai_tokens') {
        stats.consumeAiTokens += Math.abs(delta)
      }
    } else if (delta > 0) {
      stats.grantCount += 1
      if (usageType === 'voice_seconds') {
        stats.grantVoiceSeconds += delta
      } else if (usageType === 'ai_tokens') {
        stats.grantAiTokens += delta
      }
    }

    if (meta.fallbackUsed === true) {
      stats.fallbackCount += 1
    }

    return stats
  }, {
    records: 0,
    consumeCount: 0,
    grantCount: 0,
    consumeVoiceSeconds: 0,
    consumeAiTokens: 0,
    grantVoiceSeconds: 0,
    grantAiTokens: 0,
    fallbackCount: 0
  })
}

function buildEmptyUsageEventBucket(usageType = '') {
  return {
    usageType,
    totalEvents: 0,
    successCount: 0,
    failedCount: 0,
    fallbackCount: 0,
    usageRecordedCount: 0,
    usageReusedCount: 0,
    coverAccountCount: 0,
    successRate: 0,
    avgDurationMs: 0,
    avgSuccessDurationMs: 0,
    billedTokensTotal: 0,
    billedSecondsTotal: 0,
    rawTotalTokens: 0,
    outputCharsTotal: 0,
    inputCharsTotal: 0,
    avgBilledTokens: 0,
    avgBilledSeconds: 0,
    avgRawTokens: 0
  }
}

function normalizeUsageRecentEvent(item = {}) {
  const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
  return {
    eventId: toText(item.eventId || item._id),
    eventKey: toText(item.eventKey),
    accountId: toText(item.accountId),
    usageType: toText(item.usageType),
    usageTypeLabel: toText(item.usageTypeLabel) || getUsageTypeLabel(item.usageType),
    sourceType: toText(item.sourceType),
    sourceLabel: toText(item.sourceLabel) || getSourceTypeLabel(item.sourceType),
    sourceId: toText(item.sourceId),
    traceId: toText(item.traceId),
    eventStatus: toText(item.eventStatus),
    eventStatusLabel: toText(item.eventStatusLabel) || getUsageEventStatusLabel(item.eventStatus),
    occurredAt: formatCompactDateText(item.occurredAt),
    routeKey: toText(item.routeKey),
    routeLabel: toText(item.routeLabel) || getUsageRouteLabel(item.routeKey),
    meta: {
      projectId: toText(meta.projectId),
      pageKey: toText(meta.pageKey),
      providerKey: toText(meta.providerKey),
      providerLabel: toText(meta.providerLabel),
      providerType: toText(meta.providerType),
      model: toText(meta.model),
      plannedProviderKey: toText(meta.plannedProviderKey),
      plannedProviderLabel: toText(meta.plannedProviderLabel),
      plannedProviderType: toText(meta.plannedProviderType),
      plannedModel: toText(meta.plannedModel),
      fallbackUsed: Boolean(meta.fallbackUsed),
      primaryError: toText(meta.primaryError),
      errorMessage: toText(meta.errorMessage),
      billingMethod: toText(meta.billingMethod),
      rawTotalTokens: Math.max(0, toNumber(meta.rawTotalTokens, 0)),
      rawPromptTokens: Math.max(0, toNumber(meta.rawPromptTokens, 0)),
      rawCompletionTokens: Math.max(0, toNumber(meta.rawCompletionTokens, 0)),
      billedTokens: Math.max(0, toNumber(meta.billedTokens, 0)),
      billedSeconds: Math.max(0, toNumber(meta.billedSeconds, 0)),
      multiplier: toNumber(meta.multiplier, 1),
      inputChars: Math.max(0, toNumber(meta.inputChars, 0)),
      outputChars: Math.max(0, toNumber(meta.outputChars, 0)),
      durationMs: Math.max(0, toNumber(meta.durationMs, 0)),
      usageRecorded: meta.usageRecorded !== false,
      usageReused: Boolean(meta.usageReused),
      clientRequestId: toText(meta.clientRequestId),
      providerRequestId: toText(meta.providerRequestId)
    }
  }
}

function buildUsageProviderStats(ledger = []) {
  const map = {}
  ;(Array.isArray(ledger) ? ledger : []).forEach((item) => {
    const providerKey = getUsageProviderKey(item)
    if (!providerKey) {
      return
    }
    if (!map[providerKey]) {
      map[providerKey] = {
        providerKey,
        providerLabel: getUsageProviderLabel(item) || providerKey,
        records: 0,
        consumeVoiceSeconds: 0,
        consumeAiTokens: 0,
        consumeCount: 0
      }
    }
    const current = map[providerKey]
    current.records += 1
    const delta = toNumber(item.delta, 0)
    if (delta >= 0) {
      return
    }
    current.consumeCount += 1
    if (toText(item.usageType) === 'voice_seconds') {
      current.consumeVoiceSeconds += Math.abs(delta)
    } else if (toText(item.usageType) === 'ai_tokens') {
      current.consumeAiTokens += Math.abs(delta)
    }
  })
  return Object.values(map).sort((left, right) => {
    if (right.consumeAiTokens !== left.consumeAiTokens) {
      return right.consumeAiTokens - left.consumeAiTokens
    }
    if (right.consumeVoiceSeconds !== left.consumeVoiceSeconds) {
      return right.consumeVoiceSeconds - left.consumeVoiceSeconds
    }
    return right.records - left.records
  })
}

function buildUsageModelStats(ledger = []) {
  const map = {}
  ;(Array.isArray(ledger) ? ledger : []).forEach((item) => {
    const model = getUsageModelName(item)
    if (!model) {
      return
    }
    const providerKey = getUsageProviderKey(item) || 'unknown_provider'
    const providerLabel = getUsageProviderLabel(item) || providerKey
    const compositeKey = `${providerKey}::${model}`
    if (!map[compositeKey]) {
      map[compositeKey] = {
        compositeKey,
        model,
        providerKey,
        providerLabel,
        records: 0,
        consumeVoiceSeconds: 0,
        consumeAiTokens: 0,
        consumeCount: 0
      }
    }
    const current = map[compositeKey]
    current.records += 1
    const delta = toNumber(item.delta, 0)
    if (delta >= 0) {
      return
    }
    current.consumeCount += 1
    if (toText(item.usageType) === 'voice_seconds') {
      current.consumeVoiceSeconds += Math.abs(delta)
    } else if (toText(item.usageType) === 'ai_tokens') {
      current.consumeAiTokens += Math.abs(delta)
    }
  })
  return Object.values(map).sort((left, right) => {
    if (right.consumeAiTokens !== left.consumeAiTokens) {
      return right.consumeAiTokens - left.consumeAiTokens
    }
    if (right.consumeVoiceSeconds !== left.consumeVoiceSeconds) {
      return right.consumeVoiceSeconds - left.consumeVoiceSeconds
    }
    return right.records - left.records
  })
}

function buildUsageAccountAnomalyStats(summaries = [], ledger = []) {
  const map = {}
  ;(Array.isArray(summaries) ? summaries : []).forEach((item) => {
    const accountId = toText(item.accountId)
    if (!accountId) {
      return
    }
    map[accountId] = {
      accountId,
      phone: getAccountPrimaryPhone(item),
      displayName: getAccountDisplayLabel(item),
      consumeVoiceSeconds: 0,
      consumeAiTokens: 0,
      consumeCount: 0,
      records: 0
    }
  })

  ;(Array.isArray(ledger) ? ledger : []).forEach((item) => {
    const accountId = toText(item.accountId)
    if (!accountId || !map[accountId]) {
      return
    }
    const current = map[accountId]
    current.records += 1
    const delta = toNumber(item.delta, 0)
    if (delta >= 0) {
      return
    }
    current.consumeCount += 1
    if (toText(item.usageType) === 'voice_seconds') {
      current.consumeVoiceSeconds += Math.abs(delta)
    } else if (toText(item.usageType) === 'ai_tokens') {
      current.consumeAiTokens += Math.abs(delta)
    }
  })

  return Object.values(map).sort((left, right) => {
    if (right.consumeAiTokens !== left.consumeAiTokens) {
      return right.consumeAiTokens - left.consumeAiTokens
    }
    if (right.consumeVoiceSeconds !== left.consumeVoiceSeconds) {
      return right.consumeVoiceSeconds - left.consumeVoiceSeconds
    }
    return right.consumeCount - left.consumeCount
  })
}

function buildUsageDimensionStats(ledger = [], keyGetter, labelGetter) {
  const map = {}
  ;(Array.isArray(ledger) ? ledger : []).forEach((item) => {
    const key = toText(typeof keyGetter === 'function' ? keyGetter(item) : '')
    if (!key) {
      return
    }
    if (!map[key]) {
      map[key] = {
        key,
        label: toText(typeof labelGetter === 'function' ? labelGetter(item) : key) || key,
        records: 0,
        consumeCount: 0,
        consumeAmount: 0
      }
    }
    const current = map[key]
    current.records += 1
    const delta = toNumber(item.delta, 0)
    if (delta < 0) {
      current.consumeCount += 1
      current.consumeAmount += Math.abs(delta)
    }
  })

  return Object.values(map).sort((left, right) => {
    if (right.consumeAmount !== left.consumeAmount) {
      return right.consumeAmount - left.consumeAmount
    }
    if (right.consumeCount !== left.consumeCount) {
      return right.consumeCount - left.consumeCount
    }
    return right.records - left.records
  })
}

function normalizeUsagePageInfo(pageInfo = {}, fallbackTotal = 0, fallbackPageSize = 40) {
  const pageSize = Math.max(1, Math.floor(toNumber(pageInfo.pageSize, fallbackPageSize)))
  const total = Math.max(0, Math.floor(toNumber(pageInfo.total, fallbackTotal)))
  const totalPages = Math.max(1, Math.floor(toNumber(pageInfo.totalPages, total > 0 ? Math.ceil(total / pageSize) : 1)))
  const page = Math.min(Math.max(1, Math.floor(toNumber(pageInfo.page, 1))), totalPages)
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasPrev: Boolean(pageInfo.hasPrev || page > 1),
    hasNext: typeof pageInfo.hasNext === 'boolean' ? pageInfo.hasNext : (page < totalPages),
    returned: Math.max(0, Math.floor(toNumber(pageInfo.returned, 0)))
  }
}

function buildUsageReportFromLocalData(options = {}) {
  const summaries = Array.isArray(options.summaries) ? options.summaries : []
  const ledger = Array.isArray(options.ledger) ? options.ledger : []
  const pageInfo = normalizeUsagePageInfo(options.pageInfo || {}, ledger.length, 40)
  const riskAccounts = buildUsageRiskAccounts(summaries, ledger, [])
  return {
    generatedAt: formatDateTimeText(new Date()),
    scope: options.scope && typeof options.scope === 'object' ? options.scope : {},
    pageInfo,
    stats: buildUsageLedgerStats(ledger),
    sourceStats: buildUsageSourceStats(ledger, toText(options.usageType || 'all')).slice(0, 12),
    providerStats: buildUsageProviderStats(ledger).slice(0, 12),
    modelStats: buildUsageModelStats(ledger).slice(0, 12),
    accountStats: buildUsageAccountAnomalyStats(summaries, ledger).slice(0, 12),
    pageStats: buildUsageDimensionStats(
      ledger,
      (item) => toText(item.meta && item.meta.pageKey),
      (item) => toText(item.meta && item.meta.pageKey)
    ).slice(0, 12),
    projectStats: buildUsageDimensionStats(
      ledger,
      (item) => formatUsageProjectLabel(item.meta && typeof item.meta === 'object' ? item.meta : {}),
      (item) => formatUsageProjectLabel(item.meta && typeof item.meta === 'object' ? item.meta : {})
    ).slice(0, 12),
    dailyStats: buildUsageDailyStats(ledger).slice(0, 30),
    lowBalanceAccounts: buildUsageLowBalanceAccounts(summaries).slice(0, 12),
    warningSummary: buildUsageWarningSummary(summaries, riskAccounts),
    planHealthStats: buildUsagePlanHealthStats(summaries, ledger).slice(0, 12),
    riskAccounts: riskAccounts.slice(0, 12),
    coverAccountCount: Array.from(new Set(ledger.map((item) => toText(item.accountId)).filter(Boolean))).length,
    eventStats: {
      ...buildEmptyUsageEventBucket('all'),
      byUsageType: {
        ai_tokens: buildEmptyUsageEventBucket('ai_tokens'),
        voice_seconds: buildEmptyUsageEventBucket('voice_seconds')
      }
    },
    routeStats: [],
    modelEfficiencyStats: [],
    sourceEfficiencyStats: [],
    recentEvents: []
  }
}

function buildUsageDailyStats(ledger = []) {
  const map = {}
  ;(Array.isArray(ledger) ? ledger : []).forEach((item) => {
    const occurredAtMs = parseDateMs(item.occurredAt)
    if (!occurredAtMs) {
      return
    }
    const date = new Date(occurredAtMs)
    const dateKey = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`
    if (!map[dateKey]) {
      map[dateKey] = {
        date: dateKey,
        records: 0,
        consumeCount: 0,
        grantCount: 0,
        consumeVoiceSeconds: 0,
        consumeAiTokens: 0,
        grantVoiceSeconds: 0,
        grantAiTokens: 0,
        fallbackCount: 0,
        accountIds: {}
      }
    }
    const current = map[dateKey]
    current.records += 1
    current.accountIds[toText(item.accountId)] = true
    const delta = toNumber(item.delta, 0)
    const usageType = toText(item.usageType)
    const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
    if (delta < 0) {
      current.consumeCount += 1
      if (usageType === 'voice_seconds') {
        current.consumeVoiceSeconds += Math.abs(delta)
      } else if (usageType === 'ai_tokens') {
        current.consumeAiTokens += Math.abs(delta)
      }
    } else if (delta > 0) {
      current.grantCount += 1
      if (usageType === 'voice_seconds') {
        current.grantVoiceSeconds += delta
      } else if (usageType === 'ai_tokens') {
        current.grantAiTokens += delta
      }
    }
    if (meta.fallbackUsed === true) {
      current.fallbackCount += 1
    }
  })
  return Object.values(map)
    .map((item) => ({
      date: item.date,
      records: item.records,
      consumeCount: item.consumeCount,
      grantCount: item.grantCount,
      consumeVoiceSeconds: item.consumeVoiceSeconds,
      consumeAiTokens: item.consumeAiTokens,
      grantVoiceSeconds: item.grantVoiceSeconds,
      grantAiTokens: item.grantAiTokens,
      fallbackCount: item.fallbackCount,
      accountCount: Object.keys(item.accountIds).filter(Boolean).length
    }))
    .sort((left, right) => right.date.localeCompare(left.date))
}

function buildUsageLowBalanceAccounts(summaries = []) {
  return (Array.isArray(summaries) ? summaries : [])
    .filter((item) => {
      return Boolean(item.bindRequiredForWrite)
        || toNumber(item.voiceSecondsRemaining, 0) <= LOW_VOICE_ALERT_THRESHOLD
        || toNumber(item.aiTokensRemaining, 0) <= LOW_AI_ALERT_THRESHOLD
    })
    .map((item) => ({
      accountId: toText(item.accountId),
      phone: getAccountPrimaryPhone(item),
      displayName: getAccountDisplayLabel(item),
      status: toText(item.status),
      currentAccessLevel: toText(item.currentAccessLevel),
      bindRequiredForWrite: Boolean(item.bindRequiredForWrite),
      voiceSecondsRemaining: toNumber(item.voiceSecondsRemaining, 0),
      aiTokensRemaining: toNumber(item.aiTokensRemaining, 0)
    }))
    .sort((left, right) => {
      if (left.bindRequiredForWrite !== right.bindRequiredForWrite) {
        return left.bindRequiredForWrite ? -1 : 1
      }
      if (left.aiTokensRemaining !== right.aiTokensRemaining) {
        return left.aiTokensRemaining - right.aiTokensRemaining
      }
      return left.voiceSecondsRemaining - right.voiceSecondsRemaining
    })
}

function normalizeUsageReportForUi(report = {}, fallback = {}) {
  const normalized = report && typeof report === 'object' ? clone(report) : {}
  if (!Object.keys(normalized).length) {
    return buildUsageReportFromLocalData(fallback)
  }
  normalized.pageInfo = normalizeUsagePageInfo(
    normalized.pageInfo || {},
    fallback.fallbackTotal || 0,
    fallback.fallbackPageSize || 40
  )
  normalized.stats = normalized.stats && typeof normalized.stats === 'object'
    ? normalized.stats
    : buildUsageLedgerStats(Array.isArray(fallback.ledger) ? fallback.ledger : [])
  normalized.sourceStats = Array.isArray(normalized.sourceStats) ? normalized.sourceStats : []
  normalized.providerStats = Array.isArray(normalized.providerStats) ? normalized.providerStats : []
  normalized.modelStats = Array.isArray(normalized.modelStats) ? normalized.modelStats : []
  normalized.accountStats = Array.isArray(normalized.accountStats) ? normalized.accountStats : []
  normalized.pageStats = Array.isArray(normalized.pageStats) ? normalized.pageStats : []
  normalized.projectStats = Array.isArray(normalized.projectStats) ? normalized.projectStats : []
  normalized.dailyStats = Array.isArray(normalized.dailyStats) ? normalized.dailyStats : []
  normalized.lowBalanceAccounts = Array.isArray(normalized.lowBalanceAccounts) ? normalized.lowBalanceAccounts : []
  normalized.warningSummary = normalized.warningSummary && typeof normalized.warningSummary === 'object'
    ? normalized.warningSummary
    : buildUsageWarningSummary(
      Array.isArray(fallback.summaries) ? fallback.summaries : [],
      buildUsageRiskAccounts(
        Array.isArray(fallback.summaries) ? fallback.summaries : [],
        Array.isArray(fallback.ledger) ? fallback.ledger : [],
        []
      )
    )
  normalized.planHealthStats = Array.isArray(normalized.planHealthStats)
    ? normalized.planHealthStats
    : buildUsagePlanHealthStats(
      Array.isArray(fallback.summaries) ? fallback.summaries : [],
      Array.isArray(fallback.ledger) ? fallback.ledger : []
    )
  normalized.riskAccounts = Array.isArray(normalized.riskAccounts)
    ? normalized.riskAccounts
    : buildUsageRiskAccounts(
      Array.isArray(fallback.summaries) ? fallback.summaries : [],
      Array.isArray(fallback.ledger) ? fallback.ledger : [],
      []
    )
  normalized.coverAccountCount = Math.max(0, Math.floor(toNumber(normalized.coverAccountCount, 0)))
  normalized.eventStats = normalized.eventStats && typeof normalized.eventStats === 'object'
    ? normalized.eventStats
    : buildEmptyUsageEventBucket('all')
  normalized.eventStats.byUsageType = normalized.eventStats.byUsageType && typeof normalized.eventStats.byUsageType === 'object'
    ? normalized.eventStats.byUsageType
    : {}
  normalized.eventStats.byUsageType.ai_tokens = normalized.eventStats.byUsageType.ai_tokens && typeof normalized.eventStats.byUsageType.ai_tokens === 'object'
    ? normalized.eventStats.byUsageType.ai_tokens
    : buildEmptyUsageEventBucket('ai_tokens')
  normalized.eventStats.byUsageType.voice_seconds = normalized.eventStats.byUsageType.voice_seconds && typeof normalized.eventStats.byUsageType.voice_seconds === 'object'
    ? normalized.eventStats.byUsageType.voice_seconds
    : buildEmptyUsageEventBucket('voice_seconds')
  normalized.routeStats = Array.isArray(normalized.routeStats) ? normalized.routeStats : []
  normalized.modelEfficiencyStats = Array.isArray(normalized.modelEfficiencyStats) ? normalized.modelEfficiencyStats : []
  normalized.sourceEfficiencyStats = Array.isArray(normalized.sourceEfficiencyStats) ? normalized.sourceEfficiencyStats : []
  normalized.recentEvents = Array.isArray(normalized.recentEvents)
    ? normalized.recentEvents.map((item) => normalizeUsageRecentEvent(item))
    : []
  return normalized
}

function getUsageEventStatsByType(report = {}, usageType = 'all') {
  if (!report || typeof report !== 'object') {
    return buildEmptyUsageEventBucket(usageType)
  }
  if (usageType === 'all') {
    return report.eventStats && typeof report.eventStats === 'object'
      ? report.eventStats
      : buildEmptyUsageEventBucket('all')
  }
  const byUsageType = report.eventStats && report.eventStats.byUsageType && typeof report.eventStats.byUsageType === 'object'
    ? report.eventStats.byUsageType
    : {}
  return byUsageType[usageType] && typeof byUsageType[usageType] === 'object'
    ? byUsageType[usageType]
    : buildEmptyUsageEventBucket(usageType)
}

function buildUsageWarningSummary(summaries = [], riskAccounts = []) {
  const totalAccounts = Array.isArray(summaries) ? summaries.length : 0
  return (Array.isArray(summaries) ? summaries : []).reduce((result, item) => {
    const voiceRemaining = Math.max(0, toNumber(item.voiceSecondsRemaining, 0))
    const aiRemaining = Math.max(0, toNumber(item.aiTokensRemaining, 0))
    const latestSubscription = item.latestSubscription && typeof item.latestSubscription === 'object'
      ? item.latestSubscription
      : {}
    if (Boolean(item.bindRequiredForWrite)) {
      result.bindRequiredCount += 1
    }
    if (voiceRemaining <= LOW_VOICE_ALERT_THRESHOLD) {
      result.lowVoiceCount += 1
    }
    if (aiRemaining <= LOW_AI_ALERT_THRESHOLD) {
      result.lowAiCount += 1
    }
    if (voiceRemaining <= LOW_VOICE_ALERT_THRESHOLD && aiRemaining <= LOW_AI_ALERT_THRESHOLD) {
      result.bothLowCount += 1
    }
    if (voiceRemaining <= 0) {
      result.voiceExhaustedCount += 1
    }
    if (aiRemaining <= 0) {
      result.aiExhaustedCount += 1
    }
    if (Boolean(item.canCreateProject) === false || (toNumber(item.projectLimit, -1) >= 0 && toNumber(item.currentProjectCount, 0) >= toNumber(item.projectLimit, -1))) {
      result.blockedProjectCount += 1
    }
    if (toText(latestSubscription.status) === 'active' && isDateExpiringSoon(latestSubscription.expiresAt)) {
      result.expiringSoonCount += 1
    }
    if (toText(item.status) === 'active_paid') {
      result.paidAccountCount += 1
    }
    if (toText(item.status) === 'trialing') {
      result.trialAccountCount += 1
    }
    if (toText(item.currentAccessLevel).includes('readonly') || ['expired_readonly', 'free_limited'].includes(toText(item.status))) {
      result.readonlyCount += 1
    }
    return result
  }, {
    totalAccounts,
    bindRequiredCount: 0,
    lowVoiceCount: 0,
    lowAiCount: 0,
    bothLowCount: 0,
    voiceExhaustedCount: 0,
    aiExhaustedCount: 0,
    blockedProjectCount: 0,
    expiringSoonCount: 0,
    paidAccountCount: 0,
    trialAccountCount: 0,
    readonlyCount: 0,
    highRiskCount: Array.isArray(riskAccounts)
      ? riskAccounts.filter((item) => toText(item.riskLevel) === 'high').length
      : 0
  })
}

function isDateExpiringSoon(value, days = 7) {
  const expiresAtMs = parseDateMs(value)
  if (!expiresAtMs) {
    return false
  }
  const nowMs = Date.now()
  const windowMs = Math.max(1, Math.floor(toNumber(days, 7))) * 24 * 60 * 60 * 1000
  return expiresAtMs >= nowMs && expiresAtMs <= nowMs + windowMs
}

function buildUsageAccountUsageMap(ledger = []) {
  return (Array.isArray(ledger) ? ledger : []).reduce((result, item) => {
    const accountId = toText(item.accountId)
    if (!accountId) {
      return result
    }
    if (!result[accountId]) {
      result[accountId] = {
        accountId,
        consumeVoiceSeconds: 0,
        consumeAiTokens: 0,
        consumeCount: 0
      }
    }
    const current = result[accountId]
    const delta = toNumber(item.delta, 0)
    if (delta >= 0) {
      return result
    }
    current.consumeCount += 1
    if (toText(item.usageType) === 'voice_seconds') {
      current.consumeVoiceSeconds += Math.abs(delta)
    } else if (toText(item.usageType) === 'ai_tokens') {
      current.consumeAiTokens += Math.abs(delta)
    }
    return result
  }, {})
}

function buildUsageAccountEventMap(usageEvents = []) {
  return (Array.isArray(usageEvents) ? usageEvents : []).reduce((result, item) => {
    const accountId = toText(item.accountId)
    if (!accountId) {
      return result
    }
    if (!result[accountId]) {
      result[accountId] = {
        accountId,
        failedCount: 0,
        fallbackCount: 0
      }
    }
    const current = result[accountId]
    if (toText(item.eventStatus) === 'failed') {
      current.failedCount += 1
    }
    const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
    if (meta.fallbackUsed === true) {
      current.fallbackCount += 1
    }
    return result
  }, {})
}

function resolveUsagePlanBucket(summary = {}) {
  const latestSubscription = summary.latestSubscription && typeof summary.latestSubscription === 'object'
    ? summary.latestSubscription
    : {}
  const planCode = toText(latestSubscription.planCode)
  const planName = toText(latestSubscription.planName)
  if (planCode || planName) {
    return {
      planKey: planCode || planName,
      planCode,
      planName: planName || planCode || '已开订阅',
      planType: 'subscription',
      billingCycle: toText(latestSubscription.billingCycle),
      subscriptionStatus: toText(latestSubscription.status)
    }
  }
  if (toText(summary.status) === 'trialing' || toText(summary.currentAccessLevel) === 'trial_full') {
    return {
      planKey: 'trial_preview_v1',
      planCode: 'trial_preview_v1',
      planName: '试用体验',
      planType: 'trial',
      billingCycle: 'trial',
      subscriptionStatus: ''
    }
  }
  if (Boolean(summary.bindRequiredForWrite)) {
    return {
      planKey: 'unbound_preview',
      planCode: 'unbound_preview',
      planName: '未绑定体验',
      planType: 'preview',
      billingCycle: 'preview',
      subscriptionStatus: ''
    }
  }
  return {
    planKey: 'no_active_plan',
    planCode: 'no_active_plan',
    planName: '未开订阅/只读',
    planType: 'readonly',
    billingCycle: '',
    subscriptionStatus: ''
  }
}

function buildUsagePlanHealthStats(summaries = [], ledger = []) {
  const usageMap = buildUsageAccountUsageMap(ledger)
  const map = {}
  ;(Array.isArray(summaries) ? summaries : []).forEach((item) => {
    const bucket = resolveUsagePlanBucket(item)
    if (!map[bucket.planKey]) {
      map[bucket.planKey] = {
        planKey: bucket.planKey,
        planCode: bucket.planCode,
        planName: bucket.planName,
        planType: bucket.planType,
        billingCycle: bucket.billingCycle,
        subscriptionStatus: bucket.subscriptionStatus,
        accountCount: 0,
        lowVoiceCount: 0,
        lowAiCount: 0,
        bothLowCount: 0,
        blockedProjectCount: 0,
        bindRequiredCount: 0,
        expiresSoonCount: 0,
        consumeVoiceSeconds: 0,
        consumeAiTokens: 0,
        totalVoiceUsedRatio: 0,
        totalAiUsedRatio: 0
      }
    }
    const current = map[bucket.planKey]
    const latestSubscription = item.latestSubscription && typeof item.latestSubscription === 'object'
      ? item.latestSubscription
      : {}
    const usage = usageMap[toText(item.accountId)] || {}
    const voiceTotal = Math.max(0, toNumber(item.voiceSecondsTotal, 0))
    const voiceUsed = Math.max(0, toNumber(item.voiceSecondsUsed, 0))
    const voiceRemaining = Math.max(0, toNumber(item.voiceSecondsRemaining, 0))
    const aiTotal = Math.max(0, toNumber(item.aiTokensTotal, 0))
    const aiUsed = Math.max(0, toNumber(item.aiTokensUsed, 0))
    const aiRemaining = Math.max(0, toNumber(item.aiTokensRemaining, 0))
    current.accountCount += 1
    current.consumeVoiceSeconds += Math.max(0, toNumber(usage.consumeVoiceSeconds, 0))
    current.consumeAiTokens += Math.max(0, toNumber(usage.consumeAiTokens, 0))
    current.totalVoiceUsedRatio += voiceTotal > 0 ? Math.min(1, voiceUsed / voiceTotal) : 0
    current.totalAiUsedRatio += aiTotal > 0 ? Math.min(1, aiUsed / aiTotal) : 0
    if (voiceRemaining <= LOW_VOICE_ALERT_THRESHOLD) {
      current.lowVoiceCount += 1
    }
    if (aiRemaining <= LOW_AI_ALERT_THRESHOLD) {
      current.lowAiCount += 1
    }
    if (voiceRemaining <= LOW_VOICE_ALERT_THRESHOLD && aiRemaining <= LOW_AI_ALERT_THRESHOLD) {
      current.bothLowCount += 1
    }
    if (Boolean(item.bindRequiredForWrite)) {
      current.bindRequiredCount += 1
    }
    if (Boolean(item.canCreateProject) === false || (toNumber(item.projectLimit, -1) >= 0 && toNumber(item.currentProjectCount, 0) >= toNumber(item.projectLimit, -1))) {
      current.blockedProjectCount += 1
    }
    if (toText(latestSubscription.status) === 'active' && isDateExpiringSoon(latestSubscription.expiresAt)) {
      current.expiresSoonCount += 1
    }
  })

  return Object.values(map).map((item) => {
    const accountCount = Math.max(1, toNumber(item.accountCount, 0))
    const healthScore = Math.max(0, Math.min(100, Math.round(
      100
      - (item.bindRequiredCount / accountCount) * 28
      - (item.blockedProjectCount / accountCount) * 22
      - (item.bothLowCount / accountCount) * 20
      - (item.lowVoiceCount / accountCount) * 10
      - (item.lowAiCount / accountCount) * 10
      - (item.expiresSoonCount / accountCount) * 12
      - Math.max(item.totalVoiceUsedRatio / accountCount, item.totalAiUsedRatio / accountCount) * 18
    )))
    return {
      ...item,
      avgVoiceUsedRatio: item.totalVoiceUsedRatio / accountCount,
      avgAiUsedRatio: item.totalAiUsedRatio / accountCount,
      healthScore,
      healthLevel: healthScore >= 80 ? 'healthy' : (healthScore >= 60 ? 'watch' : 'risk')
    }
  }).sort((left, right) => {
    if (right.accountCount !== left.accountCount) {
      return right.accountCount - left.accountCount
    }
    return right.consumeAiTokens - left.consumeAiTokens
  })
}

function buildUsageRiskAccounts(summaries = [], ledger = [], usageEvents = []) {
  const usageMap = buildUsageAccountUsageMap(ledger)
  const eventMap = buildUsageAccountEventMap(usageEvents)
  return (Array.isArray(summaries) ? summaries : []).map((item) => {
    const accountId = toText(item.accountId)
    const latestSubscription = item.latestSubscription && typeof item.latestSubscription === 'object'
      ? item.latestSubscription
      : {}
    const usage = usageMap[accountId] || {}
    const events = eventMap[accountId] || {}
    const voiceRemaining = Math.max(0, toNumber(item.voiceSecondsRemaining, 0))
    const aiRemaining = Math.max(0, toNumber(item.aiTokensRemaining, 0))
    const reasons = []
    let riskScore = 0

    if (Boolean(item.bindRequiredForWrite)) {
      riskScore += 36
      reasons.push('待绑定手机号')
    }
    if (toText(item.currentAccessLevel).includes('readonly') || ['expired_readonly', 'free_limited'].includes(toText(item.status))) {
      riskScore += 30
      reasons.push('当前为只读状态')
    }
    if (Boolean(item.canCreateProject) === false) {
      riskScore += 22
      reasons.push('当前不可新建项目')
    }
    if (voiceRemaining <= 0) {
      riskScore += 32
      reasons.push('语音额度已耗尽')
    } else if (voiceRemaining <= LOW_VOICE_ALERT_THRESHOLD) {
      riskScore += 14
      reasons.push('语音额度偏低')
    }
    if (aiRemaining <= 0) {
      riskScore += 32
      reasons.push('AI 额度已耗尽')
    } else if (aiRemaining <= LOW_AI_ALERT_THRESHOLD) {
      riskScore += 14
      reasons.push('AI 额度偏低')
    }
    if (toNumber(item.projectLimit, -1) >= 0 && toNumber(item.currentProjectCount, 0) >= toNumber(item.projectLimit, -1)) {
      riskScore += 16
      reasons.push('项目数达到上限')
    }
    if (toText(latestSubscription.status) === 'active' && isDateExpiringSoon(latestSubscription.expiresAt)) {
      riskScore += 16
      reasons.push('订阅 7 天内到期')
    }
    if (toNumber(events.failedCount, 0) >= 3) {
      riskScore += 14
      reasons.push(`失败调用 ${toNumber(events.failedCount, 0)} 次`)
    }
    if (toNumber(events.fallbackCount, 0) >= 5) {
      riskScore += 8
      reasons.push(`fallback ${toNumber(events.fallbackCount, 0)} 次`)
    }
    if (toNumber(usage.consumeAiTokens, 0) >= 100000) {
      riskScore += 10
      reasons.push('AI 消耗偏高')
    }
    if (toNumber(usage.consumeVoiceSeconds, 0) >= 1800) {
      riskScore += 8
      reasons.push('语音消耗偏高')
    }

    return {
      accountId,
      phone: getAccountPrimaryPhone(item),
      displayName: getAccountDisplayLabel(item),
      status: toText(item.status),
      currentAccessLevel: toText(item.currentAccessLevel),
      planName: toText(latestSubscription.planName),
      voiceSecondsRemaining: voiceRemaining,
      aiTokensRemaining: aiRemaining,
      consumeVoiceSeconds: Math.max(0, toNumber(usage.consumeVoiceSeconds, 0)),
      consumeAiTokens: Math.max(0, toNumber(usage.consumeAiTokens, 0)),
      failedCount: Math.max(0, toNumber(events.failedCount, 0)),
      fallbackCount: Math.max(0, toNumber(events.fallbackCount, 0)),
      riskScore,
      riskLevel: riskScore >= 80 ? 'high' : (riskScore >= 45 ? 'medium' : (riskScore > 0 ? 'attention' : 'stable')),
      riskReasons: reasons.slice(0, 4)
    }
  }).filter((item) => item.riskScore > 0)
    .sort((left, right) => {
      if (right.riskScore !== left.riskScore) {
        return right.riskScore - left.riskScore
      }
      if (right.failedCount !== left.failedCount) {
        return right.failedCount - left.failedCount
      }
      return right.consumeAiTokens - left.consumeAiTokens
    })
}

function getHealthLevelLabel(level = '') {
  return {
    healthy: '健康',
    watch: '观察',
    risk: '风险'
  }[toText(level)] || '待评估'
}

function getRiskLevelLabel(level = '') {
  return {
    high: '高风险',
    medium: '中风险',
    attention: '需关注',
    stable: '稳定'
  }[toText(level)] || '待评估'
}

function getHealthBadgeClass(level = '') {
  return {
    healthy: 'is-success',
    watch: 'is-warning',
    risk: 'is-danger'
  }[toText(level)] || 'is-neutral'
}

function getRiskBadgeClass(level = '') {
  return {
    high: 'is-danger',
    medium: 'is-warning',
    attention: 'is-soft',
    stable: 'is-success'
  }[toText(level)] || 'is-neutral'
}

function jumpToUsageAccount(accountId = '') {
  const targetAccountId = toText(accountId)
  if (!targetAccountId) {
    return
  }
  state.currentView = 'billingAccounts'
  state.sidebarGroups.billing = true
  state.selectedUsageAccountId = targetAccountId
  if (supportsRemoteUsageFetch()) {
    refreshUsageViewData({
      preserveSelection: true,
      preferredAccountId: targetAccountId
    })
    return
  }
  render()
}

function applyUsageOperationalFilter(filterKey = '') {
  const nextFilter = toText(filterKey) || 'all'
  state.currentView = 'billingAccounts'
  state.sidebarGroups.billing = true
  state.usageBalanceAlertFilter = state.usageBalanceAlertFilter === nextFilter ? 'all' : nextFilter
  state.usageSearch = ''
  state.usageTypeFilter = 'all'
  state.usageTimeWindow = 'all'
  state.usageSourceFilter = 'all'
  state.usageProviderFilter = ''
  state.usageModelFilter = ''
  if (supportsRemoteUsageFetch()) {
    refreshUsageViewData({
      preserveSelection: false
    })
    return
  }
  render()
}

function renderUsageRecentEvents(events = [], summaryMap = {}, emptyText = '当前还没有可展示的调用事件。') {
  const eventList = Array.isArray(events) ? events : []
  if (!eventList.length) {
    return `<div class="empty-card">${escapeHtml(emptyText)}</div>`
  }

  return `
    <div class="usage-event-list">
      ${eventList.map((item) => {
        const account = summaryMap[toText(item.accountId)] || null
        const accountTitle = account ? getAccountPrimaryPhone(account) : (item.accountId || '未关联账户')
        const accountMeta = account ? (getAccountDisplayLabel(account) || item.accountId || '-') : (item.accountId || '-')
        const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
        const amountText = item.usageType === 'voice_seconds'
          ? formatVoiceQuotaText(meta.billedSeconds)
          : formatAiQuotaText(meta.billedTokens)
        const detailLines = [
          item.routeKey ? (item.routeLabel || getUsageRouteLabel(item.routeKey)) : '',
          item.sourceLabel || getSourceTypeLabel(item.sourceType),
          meta.providerLabel || meta.providerKey,
          meta.model,
          meta.pageKey
        ].map((text) => toText(text)).filter(Boolean)
        const noteLines = [
          `${item.eventStatusLabel || getUsageEventStatusLabel(item.eventStatus)} · ${amountText}`,
          `耗时 ${formatDurationMsText(meta.durationMs)}${meta.fallbackUsed ? ' · 已走 fallback' : ''}`,
          meta.errorMessage || meta.primaryError ? `错误：${meta.errorMessage || meta.primaryError}` : '',
          meta.projectId ? `项目：${meta.projectId}` : ''
        ].map((text) => toText(text)).filter(Boolean)
        return `
          <article class="usage-event-item">
            <div class="usage-event-head">
              <div>
                <div class="usage-event-title">${escapeHtml(accountTitle)} · ${escapeHtml(item.sourceLabel || getSourceTypeLabel(item.sourceType))}</div>
                <div class="usage-event-meta">${escapeHtml(item.occurredAt || '-')} · ${escapeHtml(accountMeta)}</div>
              </div>
              <div class="table-badge-row">
                <span class="badge ${getUsageTypeBadgeClass(item.usageType)}">${escapeHtml(item.usageTypeLabel || getUsageTypeLabel(item.usageType))}</span>
                <span class="badge ${getUsageEventStatusBadgeClass(item.eventStatus)}">${escapeHtml(item.eventStatusLabel || getUsageEventStatusLabel(item.eventStatus))}</span>
              </div>
            </div>
            ${detailLines.length ? `<div class="usage-event-detail">${escapeHtml(detailLines.join(' · '))}</div>` : ''}
            <div class="usage-event-notes">
              ${noteLines.map((line) => `<div class="usage-event-note">${escapeHtml(line)}</div>`).join('')}
            </div>
          </article>
        `
      }).join('')}
    </div>
  `
}

function getLedgerByTimeWindow(ledger = [], timeWindow = 'all') {
  return (Array.isArray(ledger) ? ledger : []).filter((item) => isUsageWithinTimeWindow(item, timeWindow))
}

function matchesUsageProviderModel(item = {}, providerKeyword = '', modelKeyword = '') {
  const providerFilter = toText(providerKeyword).toLowerCase()
  const modelFilter = toText(modelKeyword).toLowerCase()
  if (!providerFilter && !modelFilter) {
    return true
  }
  const providerKey = getUsageProviderKey(item).toLowerCase()
  const providerLabel = getUsageProviderLabel(item).toLowerCase()
  const model = getUsageModelName(item).toLowerCase()
  if (providerFilter && ![providerKey, providerLabel].some((text) => text.includes(providerFilter))) {
    return false
  }
  if (modelFilter && !model.includes(modelFilter)) {
    return false
  }
  return true
}

function matchesGlobalUsageKeyword(item = {}, keyword = '', account = null) {
  const currentKeyword = toText(keyword).toLowerCase()
  if (!currentKeyword) {
    return true
  }
  const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
  return [
    item.accountId,
    item.recordId,
    item.sourceType,
    item.sourceTypeLabel,
    item.sourceId,
    item.traceId,
    item.occurredAt,
    getUsageProviderKey(item),
    getUsageProviderLabel(item),
    getUsageModelName(item),
    toText(meta.projectName),
    toText(meta.projectId),
    toText(meta.pageKey),
    toText(meta.routeKey),
    toText(meta.requestId),
    toText(meta.reason),
    account ? getAccountPrimaryPhone(account) : '',
    account ? getAccountDisplayLabel(account) : '',
    account ? getAccountSecondaryMeta(account) : ''
  ].some((field) => toText(field).toLowerCase().includes(currentKeyword))
}

function normalizeRouteConfig(route = {}, fallback = {}) {
  const source = route && typeof route === 'object' ? route : {}
  const fallbackRoute = fallback && typeof fallback === 'object' ? fallback : {}
  return {
    providerKey: toText(source.providerKey || fallbackRoute.providerKey || 'cloudbase_default'),
    provider: toText(source.provider || fallbackRoute.provider || 'hunyuan-exp'),
    model: toText(source.model || fallbackRoute.model || 'hunyuan-turbos-latest'),
    fallbackProviderKey: toText(source.fallbackProviderKey || fallbackRoute.fallbackProviderKey || ''),
    fallbackModel: toText(source.fallbackModel || fallbackRoute.fallbackModel || ''),
    enabled: source.enabled !== false
  }
}

function normalizeProviderConfig(providerKey, value = {}, fallback = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const fallbackProvider = fallback && typeof fallback === 'object' ? fallback : {}
  const providerPreset = AI_PROVIDER_LIBRARY[providerKey] || {}
  const providerType = toText(source.providerType || fallbackProvider.providerType) === 'openai_compatible'
    ? 'openai_compatible'
    : 'cloudbase'
  const sourceApiKey = toText(source.apiKey)
  const sourceHasApiKey = Boolean(source.hasApiKey || sourceApiKey)
  const sourceApiKeyMasked = toText(source.apiKeyMasked || maskSecretForUi(sourceApiKey))
  return {
    providerKey: toText(providerKey || source.providerKey || fallbackProvider.providerKey),
    providerType,
    protocolMode: normalizeProtocolMode(source.protocolMode || fallbackProvider.protocolMode || providerPreset.protocolMode || 'auto'),
    providerClass: toText(source.providerClass || fallbackProvider.providerClass || providerPreset.providerClass || 'fallback'),
    commercialTier: toText(source.commercialTier || fallbackProvider.commercialTier || providerPreset.commercialTier || 'default'),
    visibleLabel: toText(source.visibleLabel || fallbackProvider.visibleLabel || providerPreset.visibleLabel || fallbackProvider.displayName || providerKey),
    displayName: toText(source.displayName || fallbackProvider.displayName || providerPreset.displayName || providerKey),
    cloudbaseProvider: toText(source.cloudbaseProvider || fallbackProvider.cloudbaseProvider || providerPreset.cloudbaseProvider || 'hunyuan-exp'),
    baseURL: normalizeBridgeBase(source.baseURL || fallbackProvider.baseURL || providerPreset.baseURL || ''),
    defaultModel: toText(source.defaultModel || fallbackProvider.defaultModel || providerPreset.defaultModel || 'hunyuan-turbos-latest'),
    recommendedAt: toText(source.recommendedAt || fallbackProvider.recommendedAt || providerPreset.recommendedAt || ''),
    baseURLRequired: providerPreset.baseURLRequired === true,
    baseURLEditable: providerPreset.baseURLEditable !== false,
    apiKeyRequired: providerPreset.apiKeyRequired !== false,
    modelOptions: Array.isArray(providerPreset.modelOptions) ? providerPreset.modelOptions.slice(0, 12) : [],
    modelPricing: source.modelPricing && typeof source.modelPricing === 'object'
      ? source.modelPricing
      : (fallbackProvider.modelPricing && typeof fallbackProvider.modelPricing === 'object' ? fallbackProvider.modelPricing : {}),
    hasApiKey: sourceHasApiKey,
    apiKeyMasked: sourceApiKeyMasked,
    apiKeyInput: toText(source.apiKeyInput),
    enabled: source.enabled !== false
  }
}

function normalizeProviderConfigs(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const merged = {
    ...DEFAULT_AI_MODEL_CONFIG.providers,
    ...source
  }
  const result = {}
  Object.keys(merged).forEach((providerKey) => {
    result[providerKey] = normalizeProviderConfig(
      providerKey,
      merged[providerKey],
      DEFAULT_AI_MODEL_CONFIG.providers[providerKey]
    )
  })
  return result
}

function normalizeAiModelConfig(record = {}) {
  const source = record && typeof record === 'object' ? record : {}
  const routing = source.modelRouting && typeof source.modelRouting === 'object' ? source.modelRouting : {}
  const normalizedRouting = {}
  AI_ROUTE_DEFINITIONS.forEach(({ key }) => {
    normalizedRouting[key] = normalizeRouteConfig(
      routing[key],
      DEFAULT_AI_MODEL_CONFIG.modelRouting[key]
    )
  })
  return {
    quotaPolicy: toText(source.quotaPolicy) === 'provider_plan' ? 'provider_plan' : 'local_quota',
    providers: normalizeProviderConfigs(source.providers),
    modelRouting: normalizedRouting
  }
}

function normalizeProtocolMode(value) {
  const current = toText(value)
  return ['auto', 'chat_completions', 'responses'].includes(current) ? current : 'auto'
}

function getProtocolModeLabel(mode = '') {
  return {
    auto: '自动识别',
    chat_completions: 'Chat Completions',
    responses: 'Responses'
  }[mode] || mode || '自动识别'
}

function getAiProviderPreset(providerKey = '') {
  return AI_PROVIDER_LIBRARY[providerKey] || null
}

function getProviderModelOptions(providerKey = '') {
  const preset = getAiProviderPreset(providerKey)
  return preset && Array.isArray(preset.modelOptions) ? preset.modelOptions : []
}

function buildProviderModelHint(providerKey = '', fallbackText = '填写实际模型名') {
  const providerModelOptions = getProviderModelOptions(providerKey)
  return providerModelOptions.length
    ? providerModelOptions.map((item) => toText(item.label || item.value)).join(' / ')
    : fallbackText
}

function buildProviderModelOptionMarkup(providerKey = '') {
  return getProviderModelOptions(providerKey).map((item) => {
    const value = toText(item.value || item.label)
    const label = toText(item.label || item.value)
    if (!value) {
      return ''
    }
    return `<option value="${escapeHtml(value)}" label="${escapeHtml(label)}"></option>`
  }).join('')
}

function getProviderDefaultModelForRoute(providerKey = '', providers = {}) {
  const currentProviderKey = toText(providerKey)
  const providerConfig = providers && providers[currentProviderKey] ? providers[currentProviderKey] : null
  const providerPreset = getAiProviderPreset(currentProviderKey)
  return toText(
    (providerConfig && providerConfig.defaultModel) ||
    (providerPreset && providerPreset.defaultModel)
  )
}

function getValidModelPricingEntries(modelPricing = {}) {
  if (!modelPricing || typeof modelPricing !== 'object') {
    return []
  }
  return Object.keys(modelPricing)
    .map((modelName) => {
      const model = toText(modelName)
      const node = modelPricing[modelName] && typeof modelPricing[modelName] === 'object'
        ? modelPricing[modelName]
        : {}
      const multiplier = toNumber(node.multiplier, NaN)
      if (!model || !Number.isFinite(multiplier) || multiplier <= 0) {
        return null
      }
      return {
        model,
        multiplier
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.model.localeCompare(right.model))
}

function resolveModelPricingEditorRows(provider = {}) {
  const rows = []
  const seen = new Set()
  const configuredEntries = getValidModelPricingEntries(provider.modelPricing)
  const configuredMap = new Map(configuredEntries.map((item) => [item.model, item.multiplier]))
  const appendRow = (modelName, options = {}) => {
    const model = toText(modelName)
    if (!model || seen.has(model)) {
      return
    }
    seen.add(model)
    rows.push({
      model,
      multiplier: configuredMap.has(model) ? configuredMap.get(model) : '',
      isCustom: options.isCustom === true
    })
  }

  appendRow(provider.defaultModel)
  ;(Array.isArray(provider.modelOptions) ? provider.modelOptions : []).forEach((item) => {
    const optionValue = item && typeof item === 'object' ? item.value : item
    appendRow(optionValue)
  })
  configuredEntries.forEach((item) => {
    appendRow(item.model, { isCustom: true })
  })
  rows.push({
    model: '',
    multiplier: '',
    isCustom: true
  })
  return rows
}

function buildModelPricingEditorMarkup(provider = {}) {
  const rows = resolveModelPricingEditorRows(provider)
  const configuredCount = getValidModelPricingEntries(provider.modelPricing).length
  return `
    <div class="model-pricing-editor">
      <div class="model-pricing-editor-head">
        <span class="field-label">模型倍率</span>
        <span class="panel-meta">已配置 ${configuredCount} 个</span>
      </div>
      <div class="model-pricing-grid">
        ${rows.map((row) => row.isCustom && !row.model
          ? `
            <div class="model-pricing-row is-custom" data-ai-provider-model-pricing-row>
              <input class="form-input model-pricing-model-input" data-ai-provider-model-pricing-model-input value="" placeholder="自定义模型名" />
              <input type="number" min="0" step="0.1" inputmode="decimal" class="form-input model-pricing-multiplier-input" data-ai-provider-model-pricing-multiplier value="" placeholder="倍率" />
            </div>
          `
          : `
            <div class="model-pricing-row" data-ai-provider-model-pricing-row>
              <input type="hidden" data-ai-provider-model-pricing-model value="${escapeHtml(row.model)}" />
              <div class="model-pricing-model-name">${escapeHtml(row.model)}</div>
              <input type="number" min="0" step="0.1" inputmode="decimal" class="form-input model-pricing-multiplier-input" data-ai-provider-model-pricing-multiplier value="${row.multiplier === '' ? '' : escapeHtml(String(row.multiplier))}" placeholder="倍率" />
            </div>
          `).join('')}
      </div>
    </div>
  `
}

function buildSelectOptionsMarkup(options = [], selectedValue = '') {
  return options.map((option) => `
    <option value="${escapeHtml(toText(option.value))}" ${toText(option.value) === toText(selectedValue) ? 'selected' : ''}>${escapeHtml(toText(option.label || option.value))}</option>
  `).join('')
}

function getRouteLabel(routeKey = '') {
  const matched = AI_ROUTE_DEFINITIONS.find((item) => item.key === routeKey)
  return matched ? matched.label : routeKey
}

function getWriteStatusLabel(account = {}) {
  if (account.status === 'disabled') {
    return '已禁用'
  }
  if (account.bindRequiredForWrite) {
    return '体验中，正式保存前需绑定'
  }
  if (account.canCreateProject) {
    return '正式可写'
  }
  if (account.status === 'expired_readonly') {
    return '到期只读'
  }
  return '当前不可新增'
}

function getShareAbilityLabel(account = {}) {
  return account.canShareOut ? '可外发项目' : '当前不可外发'
}

function getAccountPrimaryPhone(account = {}) {
  return toText(account.phone) || '未绑定手机号'
}

function getAccountDisplayLabel(account = {}) {
  const displayName = toText(account.displayName)
  const phone = toText(account.phone)
  if (displayName && displayName !== phone) {
    return displayName
  }
  if (displayName) {
    return displayName
  }
  return toText(account.wechatNickname || account.customDisplayName || '')
}

function getAccountSecondaryMeta(account = {}) {
  const parts = []
  const displayLabel = getAccountDisplayLabel(account)
  if (displayLabel) {
    parts.push(displayLabel)
  }
  if (toText(account.accountId)) {
    parts.push(toText(account.accountId))
  }
  return parts.join(' · ')
}

function buildCapabilityLines(record = {}) {
  const result = []
  if (record.supportsQuickEntry) {
    result.push('支持闪录')
  }
  if (record.supportsSpeechToText) {
    result.push('支持语音')
  }
  if (record.supportsAi) {
    result.push('支持 AI')
  }
  if (record.supportsShareOut) {
    result.push('支持外发')
  }
  return result
}

function getProviderTypeLabel(providerType = '') {
  return providerType === 'openai_compatible' ? 'OpenAI 兼容' : 'CloudBase'
}

function isBillingView(view = '') {
  return BILLING_VIEW_KEYS.includes(toText(view))
}

let usageViewRefreshTimer = null
let globalUsageRefreshTimer = null

function createUiState() {
  return {
    currentView: 'overview',
    aiConfigTab: 'providers',
    globalUsageTab: 'ai_tokens',
    selectedAccountId: 'acct_003',
    selectedOrderId: 'ord_20260428001',
    selectedUsageAccountId: 'acct_003',
    accountSearch: '',
    accountStatusFilter: 'all',
    orderSearch: '',
    orderStatusFilter: 'all',
    orderReadinessFilter: 'all',
    usageSearch: '',
    usageTypeFilter: 'all',
    usageTimeWindow: 'all',
    usageSourceFilter: 'all',
    usageProviderFilter: '',
    usageModelFilter: '',
    usageBalanceAlertFilter: 'all',
    globalUsagePage: 1,
    globalUsagePageSize: 40,
    globalUsageSearch: '',
    globalUsageTimeWindow: 'all',
    globalUsageSourceFilter: 'all',
    globalUsageProviderFilter: '',
    globalUsageModelFilter: '',
    auditSearch: '',
    adjustmentRecordSearch: '',
    adjustmentRecordScope: 'all',
    feedbackSearch: '',
    feedbackStatusFilter: 'all',
    selectedFeedbackId: '',
    referralSearch: '',
    referralStatusFilter: 'all',
    referralTimeWindow: 'all',
    selectedReferralId: '',
    legalDocumentSearch: '',
    legalDocumentDocTypeFilter: 'all',
    legalDocumentStatusFilter: 'all',
    selectedLegalDocumentId: '',
    accounts: [],
    orders: [],
    feedbackItems: [],
    referralItems: [],
    legalDocuments: [],
    legalDocumentDetail: null,
    legalDocumentDraft: buildEmptyLegalDocumentDraft(),
    legalDocumentPreview: createEmptyLegalPreviewState(),
    referralStats: {
      totalCount: 0,
      pendingCount: 0,
      rewardedCount: 0,
      blockedCount: 0,
      ledgerGrantedAiTokens: 0,
      missingLedgerCount: 0
    },
    usageSummaries: [],
    usageLedger: [],
    usageViewSummaries: [],
    usageViewLedger: [],
    globalUsageSummaries: [],
    globalUsageLedger: [],
    overviewUsageReport: null,
    globalUsageReport: null,
    globalUsagePageInfo: {
      page: 1,
      pageSize: 40,
      total: 0,
      totalPages: 1,
      hasPrev: false,
      hasNext: false,
      returned: 0
    },
    plans: [],
    aiModelConfig: normalizeAiModelConfig(DEFAULT_AI_MODEL_CONFIG),
    aiModelConfigTest: null,
    auditLogs: [],
    manualAdjustmentLogs: [],
    sidebarGroups: {
      billing: false
    },
    runtime: {
      providerMode: DEFAULT_CLOUD_CONFIG.providerMode,
      cloudConfig: clone(DEFAULT_CLOUD_CONFIG),
      loading: false,
      feedbackLoading: false,
      referralLoading: false,
      legalDocumentsLoading: false,
      legalDocumentDetailLoading: false,
      legalDocumentPreviewLoading: false,
      usageLoading: false,
      overviewUsageLoading: false,
      globalUsageLoading: false,
      usageRequestSeq: 0,
      overviewUsageRequestSeq: 0,
      globalUsageRequestSeq: 0,
      sourceLabel: DEFAULT_CLOUD_CONFIG.providerMode === 'cloud' ? 'Cloud Bridge' : 'Mock Data',
      lastSyncAt: '',
      noticeText: '',
      noticeTone: 'info',
      toastText: '',
      toastTone: 'info',
      toastTimer: null,
      supportsReset: DEFAULT_CLOUD_CONFIG.providerMode !== 'cloud',
      authChecking: true,
      authenticated: false,
      authUser: '',
      authConfigured: true,
      cloudInvokeReady: false,
      operatorConfigured: false
    }
  }
}

function createMockData() {
  const accounts = [
    {
      accountId: 'acct_001',
      phone: '138****1201',
      wechatNickname: '张工',
      customDisplayName: '华东智造张工',
      displayName: '华东智造张工',
      phoneVerified: true,
      status: 'trialing',
      currentAccessLevel: 'trial_full',
      trialEndsAt: '2026-05-03 23:59',
      subscriptionEndsAt: '',
      canCreateProject: true,
      canShareOut: true,
      canUseSpeechToText: true,
      canUseAi: true,
      voiceSecondsRemaining: 428,
      aiTokensRemaining: 30120,
      currentProjectCount: 2,
      projectLimit: 3,
      lastActiveAt: '2026-04-28 17:12',
      notes: '新近内测用户，闪录使用频率较高。'
    },
    {
      accountId: 'acct_002',
      phone: '137****8820',
      wechatNickname: '陈总',
      customDisplayName: '',
      displayName: '陈总',
      phoneVerified: true,
      status: 'active_paid',
      currentAccessLevel: 'paid_active',
      trialEndsAt: '2026-04-05 23:59',
      subscriptionEndsAt: '2027-04-05 23:59',
      canCreateProject: true,
      canShareOut: true,
      canUseSpeechToText: true,
      canUseAi: true,
      voiceSecondsRemaining: 1620,
      aiTokensRemaining: 183000,
      currentProjectCount: 19,
      projectLimit: -1,
      lastActiveAt: '2026-04-28 09:45',
      notes: '稳定使用中的付费用户。'
    },
    {
      accountId: 'acct_003',
      phone: '',
      wechatNickname: '微信用户',
      customDisplayName: '苏州方案顾问',
      displayName: '苏州方案顾问',
      phoneVerified: false,
      status: 'free_limited',
      currentAccessLevel: 'free_readonly',
      trialEndsAt: '2026-05-01 23:59',
      subscriptionEndsAt: '',
      canCreateProject: false,
      canShareOut: false,
      canUseSpeechToText: false,
      canUseAi: false,
      voiceSecondsRemaining: 95,
      aiTokensRemaining: 8200,
      currentProjectCount: 3,
      projectLimit: 3,
      lastActiveAt: '2026-04-28 14:26',
      notes: '刚触达试用边界，适合验证绑定和套餐承接。'
    },
    {
      accountId: 'acct_004',
      phone: '139****7711',
      wechatNickname: '王经理',
      customDisplayName: '',
      displayName: '王经理',
      phoneVerified: true,
      status: 'expired_readonly',
      currentAccessLevel: 'paid_readonly',
      trialEndsAt: '2026-03-20 23:59',
      subscriptionEndsAt: '2026-04-26 23:59',
      canCreateProject: false,
      canShareOut: false,
      canUseSpeechToText: false,
      canUseAi: false,
      voiceSecondsRemaining: 0,
      aiTokensRemaining: 0,
      currentProjectCount: 11,
      projectLimit: -1,
      lastActiveAt: '2026-04-27 22:08',
      notes: '已到期只读，适合验证恢复正式可写链路。'
    },
    {
      accountId: 'acct_005',
      phone: '136****9033',
      wechatNickname: '李工',
      customDisplayName: '',
      displayName: '李工',
      phoneVerified: true,
      status: 'disabled',
      currentAccessLevel: 'disabled',
      trialEndsAt: '2026-03-12 23:59',
      subscriptionEndsAt: '',
      canCreateProject: false,
      canShareOut: false,
      canUseSpeechToText: false,
      canUseAi: false,
      voiceSecondsRemaining: 0,
      aiTokensRemaining: 0,
      currentProjectCount: 4,
      projectLimit: 3,
      lastActiveAt: '2026-04-21 11:02',
      notes: '风险冻结账户，用于验证禁用态说明。'
    }
  ]

  const orders = [
    {
      orderId: 'ord_20260428001',
      accountId: 'acct_003',
      title: '语音转写包',
      productType: 'voice_pack',
      amountText: '价格待定',
      status: 'pending',
      readiness: 'placeholder_only',
      sourceReason: 'speech_exhausted',
      createdAt: '2026-04-28 14:32',
      updatedAt: '2026-04-28 14:36',
      channelOrderStatus: '未发起',
      pendingReason: '订单已创建，当前暂不支持支付。',
      canInvokePayment: false
    },
    {
      orderId: 'ord_20260428002',
      accountId: 'acct_004',
      title: '基础版月付',
      productType: 'subscription',
      amountText: '价格待定',
      status: 'pending',
      readiness: 'config_incomplete',
      sourceReason: 'write_disabled',
      createdAt: '2026-04-28 10:14',
      updatedAt: '2026-04-28 10:20',
      channelOrderStatus: '待补配置项',
      pendingReason: '支付暂未开通，订单已保留。',
      canInvokePayment: false
    },
    {
      orderId: 'ord_20260427007',
      accountId: 'acct_002',
      title: '基础版年付',
      productType: 'subscription',
      amountText: '价格待定',
      status: 'paid',
      readiness: 'ready',
      sourceReason: 'project_limit_reached',
      createdAt: '2026-04-27 09:12',
      updatedAt: '2026-04-27 09:26',
      channelOrderStatus: '已完成',
      pendingReason: '前端支付拉起已成功，仍以支付回调结果为最终到账依据。',
      canInvokePayment: true
    },
    {
      orderId: 'ord_20260426009',
      accountId: 'acct_001',
      title: 'AI 额度包',
      productType: 'ai_pack',
      amountText: '价格待定',
      status: 'failed',
      readiness: 'config_incomplete',
      sourceReason: 'ai_exhausted',
      createdAt: '2026-04-26 18:02',
      updatedAt: '2026-04-26 18:20',
      channelOrderStatus: '签名缺失',
      pendingReason: '当前环境仍在补齐商户配置，建议先完成配置再继续验证。',
      canInvokePayment: false
    }
  ]

  const usageLedger = [
    {
      recordId: 'uld_001',
      accountId: 'acct_001',
      usageType: 'voice_seconds',
      sourceType: 'speech_to_text',
      sourceId: 'quick_20260428_001',
      delta: -52,
      unit: 'second',
      beforeBalance: 480,
      afterBalance: 428,
      traceId: 'trc_voice_001',
      occurredAt: '2026-04-28 17:08',
      meta: {
        pageKey: 'pages/index/index'
      }
    },
    {
      recordId: 'uld_002',
      accountId: 'acct_002',
      usageType: 'ai_tokens',
      sourceType: 'quick_entry_match',
      sourceId: 'qe_20260428_007',
      delta: -12000,
      unit: 'token',
      beforeBalance: 195000,
      afterBalance: 183000,
      traceId: 'trc_ai_002',
      occurredAt: '2026-04-28 09:40',
      meta: {
        projectId: 'proj_002'
      }
    },
    {
      recordId: 'uld_003',
      accountId: 'acct_004',
      usageType: 'voice_seconds',
      sourceType: 'admin_console',
      sourceId: 'manual_grant_004',
      delta: 1800,
      unit: 'second',
      beforeBalance: 0,
      afterBalance: 1800,
      traceId: 'trc_voice_003',
      occurredAt: '2026-04-28 10:30',
      meta: {
        reason: '后台补量验证'
      }
    },
    {
      recordId: 'uld_ref_001',
      accountId: 'acct_001',
      usageType: 'ai_tokens',
      sourceType: 'referral_reward',
      sourceId: 'ref_rel_001',
      delta: 100000,
      unit: 'token',
      beforeBalance: 30120,
      afterBalance: 130120,
      traceId: 'referral:ref_rel_001:referrer:ai_tokens:reward',
      occurredAt: '2026-05-12 10:30',
      meta: {
        relationId: 'ref_rel_001',
        role: 'referrer',
        rewardAiTokens: 100000
      }
    },
    {
      recordId: 'uld_ref_002',
      accountId: 'acct_002',
      usageType: 'ai_tokens',
      sourceType: 'referral_reward',
      sourceId: 'ref_rel_001',
      delta: 100000,
      unit: 'token',
      beforeBalance: 183000,
      afterBalance: 283000,
      traceId: 'referral:ref_rel_001:invitee:ai_tokens:reward',
      occurredAt: '2026-05-12 10:30',
      meta: {
        relationId: 'ref_rel_001',
        role: 'invitee',
        rewardAiTokens: 100000
      }
    }
  ]

  const plans = [
    {
      planCode: 'trial_preview_v1',
      planName: '试用体验',
      planType: 'trial',
      billingCycle: 'trial',
      price: 0,
      originalPrice: 0,
      isPricePending: false,
      displayPriceText: '首周全功能体验',
      displayBillingText: '新用户试用',
      projectLimit: 3,
      monthlyVoiceSeconds: 600,
      monthlyAiTokens: 50000,
      summary: '体验核心功能，包括语音记录与AI整理',
      featureLines: [
        '体验核心功能。',
        '绑定手机号后可保存数据和购买套餐。'
      ],
      supportsShareOut: true,
      supportsQuickEntry: true,
      supportsAi: true,
      supportsSpeechToText: true,
      trialEligible: true,
      enabled: true,
      sortOrder: 10
    },
    {
      planCode: 'starter_monthly_v1',
      planName: '基础版月付',
      planType: 'subscription',
      billingCycle: 'monthly',
      price: 29900,
      originalPrice: 0,
      isPricePending: false,
      displayPriceText: '',
      displayBillingText: '按月订阅',
      projectLimit: -1,
      monthlyVoiceSeconds: 1800,
      monthlyAiTokens: 200000,
      summary: '适合长期使用的个人用户',
      featureLines: [
        '继续新增 / 编辑项目、跟进、任务和成交记录。',
        '支持闪录、AI 自动理解、外发项目与只读追踪。'
      ],
      supportsShareOut: true,
      supportsQuickEntry: true,
      supportsAi: true,
      supportsSpeechToText: true,
      trialEligible: false,
      enabled: true,
      sortOrder: 100
    },
    {
      planCode: 'starter_yearly_v1',
      planName: '基础版年付',
      planType: 'subscription',
      billingCycle: 'yearly',
      price: 299000,
      originalPrice: 0,
      isPricePending: false,
      displayPriceText: '',
      displayBillingText: '按年订阅',
      projectLimit: -1,
      monthlyVoiceSeconds: 24000,
      monthlyAiTokens: 2400000,
      summary: '适合长期使用的个人用户',
      featureLines: [
        '长期可继续使用，减少到期中断。',
        '支持转交项目、闪录、AI 和联系人管理。'
      ],
      supportsShareOut: true,
      supportsQuickEntry: true,
      supportsAi: true,
      supportsSpeechToText: true,
      trialEligible: false,
      enabled: true,
      sortOrder: 110
    },
    {
      planCode: 'voice_pack_growth_v1',
      planName: '语音转写包',
      planType: 'voice_pack',
      billingCycle: 'one_time',
      price: 9900,
      originalPrice: 0,
      isPricePending: false,
      displayPriceText: '',
      displayBillingText: '流量包',
      projectLimit: -1,
      monthlyVoiceSeconds: 1800,
      monthlyAiTokens: 0,
      summary: '适合语音闪录频率高、希望单独扩容转写时长的用户。',
      featureLines: [
        '按秒数或时长包补充，不影响订阅有效期。',
        '额度消耗只发生在实际成功转写时。'
      ],
      supportsShareOut: false,
      supportsQuickEntry: false,
      supportsAi: false,
      supportsSpeechToText: true,
      trialEligible: false,
      enabled: true,
      sortOrder: 200
    },
    {
      planCode: 'ai_pack_growth_v1',
      planName: 'AI 额度包',
      planType: 'ai_pack',
      billingCycle: 'one_time',
      price: 19900,
      originalPrice: 0,
      isPricePending: false,
      displayPriceText: '',
      displayBillingText: '流量包',
      projectLimit: -1,
      monthlyVoiceSeconds: 0,
      monthlyAiTokens: 200000,
      summary: '适合高频使用闪录整理、项目 AI 研判、复盘和下一步建议的用户。',
      featureLines: [
        '按 token 或额度包补充，不影响订阅有效期。',
        '适合把 AI 作为日常推进辅助的重度用户。'
      ],
      supportsShareOut: false,
      supportsQuickEntry: false,
      supportsAi: true,
      supportsSpeechToText: false,
      trialEligible: false,
      enabled: true,
      sortOrder: 210
    }
  ]

  const auditLogs = [
    buildAuditLog({
      operatorId: 'admin_demo',
      actionType: 'add_voice',
      targetType: 'account',
      targetId: 'acct_003',
      reason: '补 30 分钟语音时长，验证闪录恢复链路',
      beforeSnapshot: { voiceSecondsRemaining: 95 },
      afterSnapshot: { voiceSecondsRemaining: 1895 },
      createdAt: '2026-04-28 14:40'
    }),
    buildAuditLog({
      operatorId: 'admin_demo',
      actionType: 'grant_subscription',
      targetType: 'account',
      targetId: 'acct_004',
      reason: '为只读用户补开月付订阅，验证恢复可写',
      beforeSnapshot: { status: 'expired_readonly', currentAccessLevel: 'paid_readonly' },
      afterSnapshot: { status: 'active_paid', currentAccessLevel: 'paid_active' },
      createdAt: '2026-04-28 10:30'
    })
  ]

  const feedbackItems = [
    normalizeFeedbackForUi({
      feedbackId: 'fb_20260510001',
      accountId: 'acct_003',
      phoneMasked: '',
      displayName: '苏州方案顾问',
      type: 'feature',
      typeLabel: '需求建议',
      scene: 'share',
      sceneLabel: '资料分享',
      content: '希望资料分享给客户后，接收页面能有明显入口回到小程序主界面，方便转化潜在用户。',
      contact: '微信同号',
      allowContact: true,
      status: 'pending',
      statusLabel: '待处理',
      rewardAiTokens: 0,
      adminNote: '',
      clientInfo: {
        platform: 'ios',
        SDKVersion: '3.14.3'
      },
      createdAt: '2026-05-10 09:30',
      updatedAt: '2026-05-10 09:30'
    }),
    normalizeFeedbackForUi({
      feedbackId: 'fb_20260509002',
      accountId: 'acct_001',
      phoneMasked: '138****1201',
      displayName: '华东智造张工',
      type: 'bug',
      typeLabel: '问题反馈',
      scene: 'quick_entry',
      sceneLabel: '闪录',
      content: '只读状态点击闪录没有弹说明窗口，用户不知道为什么不能继续操作。',
      contact: '',
      allowContact: false,
      status: 'rewarded',
      statusLabel: '已发奖',
      rewardAiTokens: 1000000,
      adminNote: '已采纳并修复只读提示链路。',
      createdAt: '2026-05-09 18:12',
      updatedAt: '2026-05-10 08:40',
      handledAt: '2026-05-10 08:40',
      rewardedAt: '2026-05-10 08:40'
    })
  ]

  const referralItems = [
    normalizeReferralForUi({
      relationId: 'ref_rel_001',
      referrerCode: 'BMC8MCK100K',
      status: 'rewarded',
      statusLabel: '已奖励',
      rewardAiTokens: 100000,
      referrerAccountId: 'acct_001',
      inviteeAccountId: 'acct_002',
      referrerAccount: accounts[0],
      inviteeAccount: accounts[1],
      triggerScene: 'first_project_created',
      qualifiedProjectId: 'proj_mock_001',
      qualifiedProjectName: '华南能源客户新需求',
      boundAt: '2026-05-11 20:16',
      qualifiedAt: '2026-05-12 10:30',
      rewardedAt: '2026-05-12 10:30',
      createdAt: '2026-05-11 20:16',
      updatedAt: '2026-05-12 10:30',
      ledgerStatus: 'complete',
      referrerLedger: {
        traceId: 'referral:ref_rel_001:referrer:ai_tokens:reward',
        delta: 100000,
        occurredAt: '2026-05-12 10:30',
        beforeBalance: 30120,
        afterBalance: 130120
      },
      inviteeLedger: {
        traceId: 'referral:ref_rel_001:invitee:ai_tokens:reward',
        delta: 100000,
        occurredAt: '2026-05-12 10:30',
        beforeBalance: 183000,
        afterBalance: 283000
      },
      anomalyLabels: []
    }),
    normalizeReferralForUi({
      relationId: 'ref_rel_002',
      referrerCode: 'BMCWAIT100K',
      status: 'pending',
      statusLabel: '待首个项目',
      rewardAiTokens: 100000,
      referrerAccountId: 'acct_002',
      inviteeAccountId: 'acct_003',
      referrerAccount: accounts[1],
      inviteeAccount: accounts[2],
      triggerScene: 'first_project_created',
      boundAt: '2026-05-12 09:02',
      createdAt: '2026-05-12 09:02',
      updatedAt: '2026-05-12 09:02',
      ledgerStatus: 'not_required',
      anomalyLabels: ['可重检']
    })
  ]

  const privacyPublishedMarkdown = buildDefaultLegalDocumentMarkdown('privacy_policy')
  const agreementPublishedMarkdown = buildDefaultLegalDocumentMarkdown('user_agreement')
  const privacyDraftMarkdown = [
    '# 隐私政策',
    '',
    '更新日期：2026-06-10',
    '生效日期：2026-06-10',
    '',
    '本版本准备补充客服联系方式、注销说明和第三方服务清单。',
    '',
    '## 本次更新重点',
    '- 补充隐私说明入口文案',
    '- 细化录音、图片上传、手机号绑定相关说明',
    '- 预留客服联系方式位置',
    ''
  ].join('\n')
  const legalDocuments = [
    {
      docId: 'legal_privacy_policy_v1_0_0',
      docType: 'privacy_policy',
      title: '隐私政策',
      version: 'v1.0.0',
      status: 'published',
      isCurrent: true,
      contentFormat: 'markdown',
      markdownSource: privacyPublishedMarkdown,
      htmlSnapshot: renderLegalMarkdownPreview(privacyPublishedMarkdown),
      plainTextSnapshot: buildLegalPlainText(privacyPublishedMarkdown),
      summary: '首个正式发布版本，覆盖账号、项目、语音、支付与第三方说明。',
      changeNotes: ['建立正式隐私政策版本'],
      requiresReconsent: true,
      effectiveAt: '2026-06-03T00:00:00.000Z',
      publishedAt: '2026-06-03T00:00:00.000Z',
      archivedAt: '',
      hash: 'sha256:mock_privacy_v1_0_0',
      previousVersion: '',
      currentRevision: 1,
      updatedBy: 'admin_demo',
      updatedAt: '2026-06-03T00:00:00.000Z',
      createdAt: '2026-06-03T00:00:00.000Z',
      sourceDraftId: '',
      operatorId: 'admin_demo'
    },
    {
      docId: 'legal_privacy_policy_v1_1_0',
      docType: 'privacy_policy',
      title: '隐私政策',
      version: 'v1.1.0',
      status: 'draft',
      isCurrent: false,
      contentFormat: 'markdown',
      markdownSource: privacyDraftMarkdown,
      htmlSnapshot: '',
      plainTextSnapshot: '',
      summary: '补齐提审阶段缺失的隐私说明、客服联系方式和测试说明。',
      changeNotes: ['补充提审要求文案', '准备加入客服联系方式'],
      requiresReconsent: true,
      effectiveAt: '2026-06-10T00:00:00.000Z',
      publishedAt: '',
      archivedAt: '',
      hash: '',
      previousVersion: 'v1.0.0',
      currentRevision: 2,
      updatedBy: 'admin_demo',
      updatedAt: '2026-06-03T12:30:00.000Z',
      createdAt: '2026-06-03T12:00:00.000Z',
      sourceDraftId: 'legal_privacy_policy_v1_0_0',
      operatorId: 'admin_demo'
    },
    {
      docId: 'legal_user_agreement_v1_0_0',
      docType: 'user_agreement',
      title: '用户服务协议',
      version: 'v1.0.0',
      status: 'published',
      isCurrent: true,
      contentFormat: 'markdown',
      markdownSource: agreementPublishedMarkdown,
      htmlSnapshot: renderLegalMarkdownPreview(agreementPublishedMarkdown),
      plainTextSnapshot: buildLegalPlainText(agreementPublishedMarkdown),
      summary: '首个正式版本，覆盖账户使用、AI/语音说明和付费权益。',
      changeNotes: ['建立正式用户服务协议版本'],
      requiresReconsent: true,
      effectiveAt: '2026-06-03T00:00:00.000Z',
      publishedAt: '2026-06-03T00:00:00.000Z',
      archivedAt: '',
      hash: 'sha256:mock_user_agreement_v1_0_0',
      previousVersion: '',
      currentRevision: 1,
      updatedBy: 'admin_demo',
      updatedAt: '2026-06-03T00:00:00.000Z',
      createdAt: '2026-06-03T00:00:00.000Z',
      sourceDraftId: '',
      operatorId: 'admin_demo'
    }
  ]

  return {
    accounts,
    orders,
    feedbackItems,
    referralItems,
    legalDocuments,
    usageLedger,
    plans,
    aiModelConfig: normalizeAiModelConfig(DEFAULT_AI_MODEL_CONFIG),
    auditLogs
  }
}

function normalizeAccountForUi(record = {}) {
  const entitlements = record.entitlements && typeof record.entitlements === 'object' ? record.entitlements : {}
  const latestSubscription = record.latestSubscription && typeof record.latestSubscription === 'object' ? record.latestSubscription : {}
  const phone = toText(record.phone)
  const wechatNickname = toText(record.wechatNickname)
  const customDisplayName = toText(record.customDisplayName)
  const displayName = toText(record.displayName) || customDisplayName || wechatNickname || phone || toText(record.accountId)
  const voiceSecondsRemaining = toNumber(
    entitlements.voiceSecondsRemaining,
    record.voiceSecondsRemaining
  )
  const aiTokensRemaining = toNumber(
    entitlements.aiTokensRemaining,
    record.aiTokensRemaining
  )
  const projectLimit = toNumber(entitlements.projectLimit, toNumber(record.projectLimit, -1))
  const currentProjectCount = toNumber(entitlements.currentProjectCount, toNumber(record.currentProjectCount, 0))
  const canCreateProject = typeof entitlements.canCreateProject === 'boolean'
    ? entitlements.canCreateProject
    : Boolean(record.canCreateProject)
  const canShareOut = typeof entitlements.canShareOut === 'boolean'
    ? entitlements.canShareOut
    : Boolean(record.canShareOut)
  const canUseSpeechToText = typeof entitlements.canUseSpeechToText === 'boolean'
    ? entitlements.canUseSpeechToText
    : Boolean(record.canUseSpeechToText)
  const canUseAi = typeof entitlements.canUseAi === 'boolean'
    ? entitlements.canUseAi
    : Boolean(record.canUseAi)

  return {
    accountId: toText(record.accountId),
    phone,
    phoneVerified: Boolean(record.phoneVerified),
    wechatNickname,
    customDisplayName,
    displayName,
    displayNameSource: toText(record.displayNameSource),
    status: toText(record.status || 'trialing'),
    currentAccessLevel: toText(record.currentAccessLevel || 'trial_full'),
    bindRequiredForWrite: typeof entitlements.bindRequiredForWrite === 'boolean'
      ? entitlements.bindRequiredForWrite
      : Boolean(record.bindRequiredForWrite),
    trialEndsAt: formatCompactDateText(record.trialEndsAt),
    subscriptionEndsAt: formatCompactDateText(record.subscriptionEndsAt || latestSubscription.expiresAt),
    canCreateProject,
    canShareOut,
    canUseSpeechToText,
    canUseAi,
    voiceSecondsRemaining,
    aiTokensRemaining,
    currentProjectCount,
    projectLimit,
    lastActiveAt: formatCompactDateText(record.lastActiveAt || record.updatedAt || record.createdAt),
    reasonSummary: toText(entitlements.reasonSummary || record.reasonSummary),
    notes: toText(record.notes || entitlements.reasonSummary || '')
  }
}

function normalizeOrderForUi(record = {}) {
  const latestPayment = record.latestPaymentTransaction && typeof record.latestPaymentTransaction === 'object'
    ? record.latestPaymentTransaction
    : {}

  return {
    orderId: toText(record.orderId),
    accountId: toText(record.accountId),
    phone: toText(record.phone),
    title: toText(record.title),
    productCode: toText(record.productCode),
    productType: toText(record.productType),
    billingCycle: toText(record.billingCycle),
    amountText: toText(record.amountText || formatAmountText(record.amount, record.currency)),
    originalPriceText: toText(record.originalPriceText),
    status: toText(record.status || 'pending'),
    readiness: toText(record.readiness || record.paymentReadinessCode || 'placeholder_only'),
    sourceReason: toText(record.sourceReason),
    createdAt: formatCompactDateText(record.createdAt),
    updatedAt: formatCompactDateText(record.updatedAt),
    channelOrderStatus: toText(record.channelOrderStatus || latestPayment.status || '未发起'),
    pendingReason: toText(record.pendingReason || record.paymentPendingReason),
    canInvokePayment: typeof record.canInvokePayment === 'boolean'
      ? record.canInvokePayment
      : Boolean(record.paymentCanInvoke)
  }
}

function normalizeAuditForUi(record = {}) {
  return {
    logId: toText(record.logId),
    operatorId: toText(record.operatorId),
    actionType: toText(record.actionType),
    targetType: toText(record.targetType),
    targetId: toText(record.targetId),
    reason: toText(record.reason),
    beforeSnapshot: record.beforeSnapshot && typeof record.beforeSnapshot === 'object' ? record.beforeSnapshot : {},
    afterSnapshot: record.afterSnapshot && typeof record.afterSnapshot === 'object' ? record.afterSnapshot : {},
    createdAt: formatCompactDateText(record.createdAt)
  }
}

function normalizeFeedbackForUi(record = {}) {
  return {
    feedbackId: toText(record.feedbackId || record._id),
    openid: toText(record.openid || record._openid),
    accountId: toText(record.accountId),
    phoneMasked: toText(record.phoneMasked),
    displayName: toText(record.displayName),
    type: toText(record.type),
    typeLabel: toText(record.typeLabel || record.type || '反馈'),
    scene: toText(record.scene),
    sceneLabel: toText(record.sceneLabel || record.scene || '使用中'),
    content: toText(record.content),
    contact: toText(record.contact),
    allowContact: record.allowContact !== false,
    status: toText(record.status || 'pending'),
    statusLabel: toText(record.statusLabel || getFeedbackStatusLabel(record.status || 'pending')),
    rewardAiTokens: Math.max(0, Math.floor(toNumber(record.rewardAiTokens, 0))),
    adminNote: toText(record.adminNote),
    clientInfo: record.clientInfo && typeof record.clientInfo === 'object' ? record.clientInfo : {},
    createdAt: formatCompactDateText(record.createdAt),
    updatedAt: formatCompactDateText(record.updatedAt),
    handledAt: formatCompactDateText(record.handledAt),
    rewardedAt: formatCompactDateText(record.rewardedAt)
  }
}

function normalizeReferralAccountForUi(record = {}) {
  const phone = toText(record.phone)
  const wechatNickname = toText(record.wechatNickname)
  const customDisplayName = toText(record.customDisplayName)
  const displayName = toText(record.displayName) || customDisplayName || wechatNickname || phone || toText(record.accountId)
  return {
    accountId: toText(record.accountId),
    phone,
    phoneVerified: Boolean(record.phoneVerified),
    wechatNickname,
    customDisplayName,
    displayName,
    displayNameSource: toText(record.displayNameSource),
    status: toText(record.status),
    currentAccessLevel: toText(record.currentAccessLevel),
    aiTokensRemaining: Math.max(0, Math.floor(toNumber(record.aiTokensRemaining, 0))),
    aiTokensTotal: Math.max(0, Math.floor(toNumber(record.aiTokensTotal, 0))),
    currentProjectCount: Math.max(0, Math.floor(toNumber(record.currentProjectCount, 0)))
  }
}

function normalizeReferralLedgerForUi(record = {}) {
  if (!record || typeof record !== 'object') {
    return null
  }
  return {
    recordId: toText(record.recordId || record._id),
    accountId: toText(record.accountId),
    traceId: toText(record.traceId),
    delta: Math.floor(toNumber(record.delta, 0)),
    beforeBalance: Math.max(0, Math.floor(toNumber(record.beforeBalance, 0))),
    afterBalance: Math.max(0, Math.floor(toNumber(record.afterBalance, 0))),
    occurredAt: formatCompactDateText(record.occurredAt)
  }
}

function normalizeReferralForUi(record = {}) {
  const referrerAccount = normalizeReferralAccountForUi(record.referrerAccount || {
    accountId: record.referrerAccountId,
    displayName: record.referrerDisplayName,
    phone: record.referrerPhone
  })
  const inviteeAccount = normalizeReferralAccountForUi(record.inviteeAccount || {
    accountId: record.inviteeAccountId,
    displayName: record.inviteeDisplayName,
    phone: record.inviteePhone
  })
  const status = toText(record.status || 'pending')
  const anomalyLabels = Array.isArray(record.anomalyLabels)
    ? record.anomalyLabels.map((item) => toText(item)).filter(Boolean)
    : []
  const sourceType = toText(record.sourceType || 'referral_code')
  const sourceTypeLabel = toText(record.sourceTypeLabel || getReferralSourceTypeLabel(sourceType))

  return {
    relationId: toText(record.relationId || record._id),
    referrerCode: toText(record.referrerCode),
    sourceType,
    sourceTypeLabel,
    sourceId: toText(record.sourceId),
    sourceProjectId: toText(record.sourceProjectId),
    sourceShareMode: toText(record.sourceShareMode),
    sourceFlowMode: toText(record.sourceFlowMode),
    status,
    statusLabel: toText(record.statusLabel || getReferralStatusLabel(status)),
    rewardAiTokens: Math.max(0, Math.floor(toNumber(record.rewardAiTokens, 100000))),
    referrerRewardAiTokens: Math.max(0, Math.floor(toNumber(record.referrerRewardAiTokens, record.rewardAiTokens || 100000))),
    inviteeRewardAiTokens: Math.max(0, Math.floor(toNumber(record.inviteeRewardAiTokens, record.rewardAiTokens || 100000))),
    referrerAccountId: toText(record.referrerAccountId || referrerAccount.accountId),
    inviteeAccountId: toText(record.inviteeAccountId || inviteeAccount.accountId),
    referrerAccount,
    inviteeAccount,
    triggerScene: toText(record.triggerScene || 'first_project_created'),
    qualifiedProjectId: toText(record.qualifiedProjectId),
    qualifiedProjectName: toText(record.qualifiedProjectName),
    boundAt: formatCompactDateText(record.boundAt),
    qualifiedAt: formatCompactDateText(record.qualifiedAt),
    rewardedAt: formatCompactDateText(record.rewardedAt),
    createdAt: formatCompactDateText(record.createdAt),
    updatedAt: formatCompactDateText(record.updatedAt),
    blockReason: toText(record.blockReason),
    ledgerStatus: toText(record.ledgerStatus || 'not_required'),
    referrerLedger: normalizeReferralLedgerForUi(record.referrerLedger),
    inviteeLedger: normalizeReferralLedgerForUi(record.inviteeLedger),
    anomalyLabels
  }
}

function normalizeUsageSummaryForUi(record = {}) {
  const latestSubscription = record.latestSubscription && typeof record.latestSubscription === 'object'
    ? record.latestSubscription
    : {}
  const phone = toText(record.phone)
  const wechatNickname = toText(record.wechatNickname)
  const customDisplayName = toText(record.customDisplayName)
  const displayName = toText(record.displayName) || customDisplayName || wechatNickname || phone || toText(record.accountId)

  return {
    accountId: toText(record.accountId),
    phone,
    phoneVerified: Boolean(record.phoneVerified),
    wechatNickname,
    customDisplayName,
    displayName,
    displayNameSource: toText(record.displayNameSource),
    status: toText(record.status || 'trialing'),
    currentAccessLevel: toText(record.currentAccessLevel || 'trial_full'),
    bindRequiredForWrite: Boolean(record.bindRequiredForWrite),
    canCreateProject: typeof record.canCreateProject === 'boolean' ? record.canCreateProject : true,
    canUseSpeechToText: typeof record.canUseSpeechToText === 'boolean' ? record.canUseSpeechToText : true,
    canUseAi: typeof record.canUseAi === 'boolean' ? record.canUseAi : true,
    canShareOut: typeof record.canShareOut === 'boolean' ? record.canShareOut : true,
    projectLimit: toNumber(record.projectLimit, -1),
    currentProjectCount: toNumber(record.currentProjectCount, 0),
    voiceSecondsTotal: toNumber(record.voiceSecondsTotal, 0),
    voiceSecondsUsed: toNumber(record.voiceSecondsUsed, 0),
    voiceSecondsRemaining: toNumber(record.voiceSecondsRemaining, 0),
    aiTokensTotal: toNumber(record.aiTokensTotal, 0),
    aiTokensUsed: toNumber(record.aiTokensUsed, 0),
    aiTokensRemaining: toNumber(record.aiTokensRemaining, 0),
    reasonSummary: toText(record.reasonSummary),
    latestUsageAt: formatCompactDateText(record.latestUsageAt),
    latestSubscription: {
      planCode: toText(latestSubscription.planCode),
      planName: toText(latestSubscription.planName),
      status: toText(latestSubscription.status),
      billingCycle: toText(latestSubscription.billingCycle),
      expiresAt: formatCompactDateText(latestSubscription.expiresAt),
      grantedVoiceSeconds: toNumber(latestSubscription.grantedVoiceSeconds, 0),
      grantedAiTokens: toNumber(latestSubscription.grantedAiTokens, 0),
      sourceOrderId: toText(latestSubscription.sourceOrderId)
    }
  }
}

function normalizeUsageLedgerForUi(record = {}) {
  const normalized = {
    recordId: toText(record.recordId || record._id),
    accountId: toText(record.accountId),
    usageType: toText(record.usageType),
    sourceType: toText(record.sourceType),
    sourceId: toText(record.sourceId),
    delta: toNumber(record.delta, 0),
    unit: toText(record.unit),
    beforeBalance: toNumber(record.beforeBalance, 0),
    afterBalance: toNumber(record.afterBalance, 0),
    traceId: toText(record.traceId),
    occurredAt: formatCompactDateText(record.occurredAt),
    meta: record.meta && typeof record.meta === 'object' ? record.meta : {}
  }

  return {
    ...normalized,
    sourceTypeLabel: getSourceTypeLabel(normalized.sourceType),
    usageTypeLabel: getUsageTypeLabel(normalized.usageType),
    directionLabel: getUsageDirectionLabel(normalized.delta),
    directionBadgeClass: getUsageDirectionBadgeClass(normalized.delta),
    deltaText: formatUsageDeltaText(normalized.usageType, normalized.delta),
    balanceText: formatUsageBalanceRangeText(normalized.usageType, normalized.beforeBalance, normalized.afterBalance),
    metaLines: formatUsageMetaLines(normalized)
  }
}

function normalizePlanForUi(record = {}) {
  const normalized = {
    planCode: toText(record.planCode || record.productCode),
    planName: toText(record.planName || record.productName),
    planType: toText(record.planType || record.productType),
    billingCycle: toText(record.billingCycle),
    price: toNumber(record.price, 0),
    originalPrice: toNumber(record.originalPrice, 0),
    originalPriceText: toText(record.originalPriceText),
    isPricePending: typeof record.isPricePending === 'boolean' ? record.isPricePending : false,
    displayPriceText: toText(record.displayPriceText || record.priceLabel),
    displayBillingText: toText(record.displayBillingText),
    projectLimit: toNumber(record.projectLimit, -1),
    monthlyVoiceSeconds: toNumber(record.monthlyVoiceSeconds || record.includedVoiceSeconds, 0),
    monthlyAiTokens: toNumber(record.monthlyAiTokens || record.includedAiTokens, 0),
    summary: toText(record.summary),
    featureLines: Array.isArray(record.featureLines) ? record.featureLines.map((item) => toText(item)).filter(Boolean) : [],
    supportsShareOut: typeof record.supportsShareOut === 'boolean' ? record.supportsShareOut : false,
    supportsQuickEntry: typeof record.supportsQuickEntry === 'boolean' ? record.supportsQuickEntry : false,
    supportsAi: typeof record.supportsAi === 'boolean' ? record.supportsAi : false,
    supportsSpeechToText: typeof record.supportsSpeechToText === 'boolean' ? record.supportsSpeechToText : false,
    trialEligible: typeof record.trialEligible === 'boolean' ? record.trialEligible : false,
    enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
    sortOrder: toNumber(record.sortOrder, 0),
    amountText: formatPlanPriceText(record)
  }

  normalized.capabilityLines = buildCapabilityLines(normalized)
  return normalized
}

function buildAccountAlerts(account) {
  const alerts = []

  if (account.status === 'disabled') {
    alerts.push({
      tone: 'danger',
      title: '当前账户已禁用',
      desc: account.reasonSummary || '该账户当前不允许继续创建、编辑、AI 或语音操作。'
    })
    return alerts
  }

  if (account.bindRequiredForWrite) {
    alerts.push({
      tone: 'brand',
      title: '当前仍需绑定手机号',
      desc: account.reasonSummary || '用户可以先体验，但保存正式数据或继续付费承接前仍需绑定手机号。'
    })
  }

  if (!account.canCreateProject) {
    let desc = account.reasonSummary || '当前不能继续新增项目。'
    if (account.projectLimit > -1 && account.currentProjectCount >= account.projectLimit) {
      desc = `项目数已达上限：${account.currentProjectCount} / ${account.projectLimit}。适合补开订阅或引导升级。`
    } else if (account.status === 'expired_readonly') {
      desc = '当前为到期只读，适合优先恢复订阅。'
    }
    alerts.push({
      tone: 'gold',
      title: '当前不能继续新增项目',
      desc
    })
  }

  if (!account.canUseSpeechToText || account.voiceSecondsRemaining <= 0) {
    alerts.push({
      tone: 'soft',
      title: '语音额度已临界',
      desc: account.voiceSecondsRemaining <= 0
        ? '当前语音额度已耗尽，适合直接补量或引导购买语音包。'
        : `当前语音额度仅剩 ${formatVoiceQuotaText(account.voiceSecondsRemaining)}，建议提前关注。`
    })
  }

  if (!account.canUseAi || account.aiTokensRemaining <= 0) {
    alerts.push({
      tone: 'soft',
      title: 'AI 额度已临界',
      desc: account.aiTokensRemaining <= 0
        ? '当前 AI 额度已耗尽，适合补量或引导开通订阅。'
        : `当前 AI 额度仅剩 ${formatAiQuotaText(account.aiTokensRemaining)}，建议提前关注。`
    })
  }

  return alerts.slice(0, 3)
}

function buildEmptyAccountsCopy() {
  if (state.runtime.providerMode === 'cloud') {
    return '当前云端已接通，但还没有匹配到账户数据。请先在真机或开发者工具里进入一次小程序主流程，触发 resolveAccount 创建账号。'
  }

  return '当前筛选下没有账户。'
}

function buildEmptyOrdersCopy() {
  if (state.runtime.providerMode === 'cloud') {
    return '当前还没有真实订单数据。通常说明前台还没有走到创建订单或付费承接这一步。'
  }

  return '当前筛选下没有订单。'
}

function buildEmptyAuditCopy() {
  if (state.runtime.providerMode === 'cloud') {
    return '当前还没有审计记录。完成一次后台补量、改状态或补开订阅后，这里就会开始出现留痕。'
  }

  return '当前没有符合条件的审计记录。'
}

function buildEmptyUsageCopy() {
  if (state.runtime.providerMode === 'cloud') {
    if (toText(state.usageProviderFilter) || toText(state.usageModelFilter)) {
      return '当前筛选下没有匹配的额度视图。可尝试清空供应商/模型筛选后重试。'
    }
    return '当前还没有额度与订阅视图。请先让账户完成一次登录、试用初始化、额度变更或订阅到账。'
  }

  return '当前筛选下没有额度与订阅数据。'
}

function buildOverviewActionItems() {
  const unboundCount = state.accounts.filter((item) => item.bindRequiredForWrite || !item.phoneVerified).length
  const blockedProjectCount = state.accounts.filter((item) => !item.canCreateProject).length
  const pendingOrderCount = state.orders.filter((item) => item.status === 'pending').length
  const auditCount = state.auditLogs.length
  const sourceLabel = state.runtime.sourceLabel || '未识别'

  return [
    `当前数据源：${sourceLabel}`,
    `待绑定手机号账户：${unboundCount} 个`,
    `当前不能新增项目的账户：${blockedProjectCount} 个`,
    pendingOrderCount > 0
      ? `待支付订单：${pendingOrderCount} 笔，适合继续验证付费承接`
      : '当前还没有订单数据，说明付费承接链路尚未开始产生订单',
    auditCount > 0
      ? `审计日志已有 ${auditCount} 条，可继续用后台动作验证留痕`
      : '当前还没有审计记录，建议做一次小额后台动作验证'
  ]
}

function buildOverviewQueueItems() {
  const pendingOrders = state.orders.filter((item) => item.status === 'pending').length
  const readyOrders = state.orders.filter((item) => item.readiness === 'ready').length
  const bindRequired = state.accounts.filter((item) => item.bindRequiredForWrite || !item.phoneVerified).length
  const blockedAccounts = state.accounts.filter((item) => !item.canCreateProject).length
  const auditCount = state.auditLogs.length

  return [
    {
      title: '待绑定手机号',
      value: `${bindRequired} 个账户`,
      desc: '会影响正式写入、付费承接和后续权益归属。'
    },
    {
      title: '待跟进订单',
      value: `${pendingOrders} 笔`,
      desc: readyOrders > 0 ? `其中 ${readyOrders} 笔已经具备继续支付条件。` : '当前订单已留痕，但还没有订单进入可继续支付阶段。'
    },
    {
      title: '受限账户',
      value: `${blockedAccounts} 个`,
      desc: '包括项目上限、只读或禁用状态，适合优先人工介入。'
    },
    {
      title: '审计留痕',
      value: `${auditCount} 条`,
      desc: auditCount > 0 ? '后台操作已经开始形成留痕，可继续做人工复核。' : '建议执行一次后台动作验证日志链路。'
    }
  ]
}

function buildOverviewRiskAccounts() {
  return state.accounts
    .filter((item) => {
      if (item.status === 'disabled' || !item.canCreateProject) {
        return true
      }
      return item.bindRequiredForWrite || item.voiceSecondsRemaining <= 0 || item.aiTokensRemaining <= 0
    })
    .sort((left, right) => {
      const leftScore = (left.status === 'disabled' ? 10 : 0) + (!left.canCreateProject ? 5 : 0) + (left.bindRequiredForWrite ? 3 : 0)
      const rightScore = (right.status === 'disabled' ? 10 : 0) + (!right.canCreateProject ? 5 : 0) + (right.bindRequiredForWrite ? 3 : 0)
      return rightScore - leftScore
    })
    .slice(0, 5)
}

function buildOverviewPendingOrders() {
  return state.orders
    .filter((item) => item.status === 'pending')
    .sort((left, right) => `${right.updatedAt || ''}`.localeCompare(`${left.updatedAt || ''}`))
    .slice(0, 5)
}

function buildAccountCapabilityLines(account = {}) {
  const result = []
  if (account.canCreateProject) {
    result.push('正式可写')
  }
  if (account.canShareOut) {
    result.push('外发能力已开')
  }
  if (account.canUseSpeechToText) {
    result.push('语音录入可用')
  }
  if (account.canUseAi) {
    result.push('AI 整理可用')
  }
  return result
}

function renderOverviewCardList(items = [], options = {}) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="empty-card">${escapeHtml(options.emptyText || '当前暂无数据。')}</div>`
  }

  return `
    <div class="overview-card-list">
      ${items.map((item) => `
        <article class="overview-row-card">
          <div class="overview-row-head">
            <div>
              <div class="overview-row-title">${escapeHtml(item.title || '-')}</div>
              ${item.meta ? `<div class="overview-row-meta">${escapeHtml(item.meta)}</div>` : ''}
            </div>
            ${item.badgeMarkup || ''}
          </div>
          ${item.value ? `<div class="overview-row-value">${escapeHtml(item.value)}</div>` : ''}
          ${item.desc ? `<div class="overview-row-desc">${escapeHtml(item.desc)}</div>` : ''}
        </article>
      `).join('')}
    </div>
  `
}

function renderUsagePagerMarkup(pageInfo = {}, options = {}) {
  const safePageInfo = normalizeUsagePageInfo(pageInfo || {}, 0, 40)
  const totalText = safePageInfo.total > 0
    ? `第 ${safePageInfo.page} / ${safePageInfo.totalPages} 页 · 共 ${safePageInfo.total} 条`
    : '当前无更多流水'
  return `
    <div class="usage-pager">
      <div class="usage-pager-meta">${escapeHtml(totalText)}</div>
      <div class="inline-actions">
        <button
          id="${escapeHtml(options.prevId || 'usagePagerPrevBtn')}"
          class="ghost-btn"
          type="button"
          ${safePageInfo.hasPrev ? '' : 'disabled'}
        >上一页</button>
        <button
          id="${escapeHtml(options.nextId || 'usagePagerNextBtn')}"
          class="ghost-btn"
          type="button"
          ${safePageInfo.hasNext ? '' : 'disabled'}
        >下一页</button>
      </div>
    </div>
  `
}

function resolveMockRestoredState(account) {
  const now = new Date()
  if (isFutureDate(account.subscriptionEndsAt, now)) {
    return {
      status: 'active_paid',
      currentAccessLevel: 'paid_active'
    }
  }
  if (isFutureDate(account.trialEndsAt, now)) {
    return {
      status: 'trialing',
      currentAccessLevel: 'trial_full'
    }
  }
  if (account.subscriptionEndsAt) {
    return {
      status: 'expired_readonly',
      currentAccessLevel: 'paid_readonly'
    }
  }
  return {
    status: 'free_limited',
    currentAccessLevel: 'free_readonly'
  }
}

function applyMockStatusProfile(account, nextState) {
  account.status = nextState.status
  account.currentAccessLevel = nextState.currentAccessLevel

  const writable = nextState.status === 'trialing' || nextState.status === 'active_paid'
  account.canCreateProject = writable
  account.canShareOut = writable
  account.canUseSpeechToText = writable && toNumber(account.voiceSecondsRemaining, 0) > 0
  account.canUseAi = writable && toNumber(account.aiTokensRemaining, 0) > 0
}

function appendMockAuditLog(store, actionType, account, beforeSnapshot, reason) {
  store.auditLogs.unshift(buildAuditLog({
    operatorId: 'admin_demo',
    actionType,
    targetType: 'account',
    targetId: account.accountId,
    reason,
    beforeSnapshot,
    afterSnapshot: {
      status: account.status,
      currentAccessLevel: account.currentAccessLevel,
      trialEndsAt: account.trialEndsAt,
      subscriptionEndsAt: account.subscriptionEndsAt,
      voiceSecondsRemaining: account.voiceSecondsRemaining,
      aiTokensRemaining: account.aiTokensRemaining
    },
    createdAt: new Date().toLocaleString('zh-CN', { hour12: false })
  }))
}

function createMockProvider() {
  let store = clone(INITIAL_MOCK_DATA)

  function findAccount(accountId) {
    const account = store.accounts.find((item) => item.accountId === accountId)
    if (!account) {
      throw new Error('当前账户不存在，无法继续处理。')
    }
    return account
  }

  function findLegalDocument(docId) {
    const document = store.legalDocuments.find((item) => toText(item.docId) === toText(docId))
    if (!document) {
      throw new Error('当前协议不存在，无法继续处理。')
    }
    return document
  }

  function buildLegalDocumentList(payload = {}) {
    const keyword = toText(payload.keyword)
    const docType = toText(payload.docType)
    const status = toText(payload.status || 'all')
    return store.legalDocuments
      .map((item) => normalizeLegalDocumentSummaryForUi(item))
      .filter((item) => !docType || docType === 'all' || item.docType === docType)
      .filter((item) => status === 'all' || item.status === status)
      .filter((item) => legalDocumentMatches(item, keyword))
      .sort((left, right) => `${right.updatedAt || ''}`.localeCompare(`${left.updatedAt || ''}`))
  }

  function snapshot() {
    return {
      accounts: store.accounts.map((item) => normalizeAccountForUi(item)),
      orders: store.orders.map((item) => normalizeOrderForUi(item)),
      usageSummaries: store.accounts.map((item) => normalizeUsageSummaryForUi({
        accountId: item.accountId,
        phone: item.phone,
        phoneVerified: item.phoneVerified,
        status: item.status,
        currentAccessLevel: item.currentAccessLevel,
        bindRequiredForWrite: !item.phoneVerified,
        projectLimit: item.projectLimit,
        currentProjectCount: item.currentProjectCount,
        voiceSecondsTotal: item.voiceSecondsRemaining,
        voiceSecondsUsed: 0,
        voiceSecondsRemaining: item.voiceSecondsRemaining,
        aiTokensTotal: item.aiTokensRemaining,
        aiTokensUsed: 0,
        aiTokensRemaining: item.aiTokensRemaining,
        reasonSummary: item.notes,
        latestSubscription: {
          planCode: item.subscriptionEndsAt ? 'starter_monthly_v1' : '',
          planName: item.subscriptionEndsAt ? '基础版月付' : '',
          status: item.subscriptionEndsAt ? 'active' : '',
          billingCycle: item.subscriptionEndsAt ? 'monthly' : '',
          expiresAt: item.subscriptionEndsAt
        }
      })),
      usageLedger: store.usageLedger.map((item) => normalizeUsageLedgerForUi(item)),
      plans: store.plans.map((item) => normalizePlanForUi(item)),
      aiModelConfig: normalizeAiModelConfig(store.aiModelConfig),
      feedbackItems: store.feedbackItems.map((item) => normalizeFeedbackForUi(item)),
      referralItems: store.referralItems.map((item) => normalizeReferralForUi(item)),
      legalDocuments: store.legalDocuments
        .map((item) => normalizeLegalDocumentSummaryForUi(item))
        .sort((left, right) => `${right.updatedAt || ''}`.localeCompare(`${left.updatedAt || ''}`)),
      referralStats: buildLocalReferralStats(store.referralItems),
      auditLogs: store.auditLogs.map((item) => normalizeAuditForUi(item)),
      manualAdjustmentLogs: store.auditLogs
        .filter((item) => item.targetType === 'account' && isManualAdjustmentAction(item.actionType))
        .map((item) => normalizeAuditForUi(item)),
      sourceLabel: 'Mock 数据',
      supportsReset: true
    }
  }

  function buildMockUsageResult(payload = {}) {
    const result = snapshot()
    const summaries = Array.isArray(result.usageSummaries) ? result.usageSummaries : []
    const ledger = Array.isArray(result.usageLedger) ? result.usageLedger : []
    const usageType = toText(payload.usageType || 'all')
    const sourceType = toText(payload.sourceType || 'all')
    const providerKeyword = toText(payload.providerKey || payload.provider || payload.providerKeyword)
    const modelKeyword = toText(payload.model || payload.modelKeyword)
    const keyword = toText(payload.keyword)
    const ledgerKeyword = toText(payload.ledgerKeyword || keyword)
    const page = Math.max(1, Math.floor(toNumber(payload.page, 1)))
    const pageSize = Math.max(1, Math.floor(toNumber(payload.pageSize || payload.ledgerLimit, 40)))
    const includeLedger = payload.includeLedger !== false

    const summaryMap = summaries.reduce((map, item) => {
      const accountId = toText(item.accountId)
      if (accountId) {
        map[accountId] = item
      }
      return map
    }, {})

    const scopedLedgerBase = ledger
      .filter((item) => usageType === 'all' || toText(item.usageType) === usageType)
      .filter((item) => sourceType === 'all' || toText(item.sourceType) === sourceType)
      .filter((item) => isUsageWithinTimeWindow(item, toText(payload.timeWindow || payload.usageTimeWindow || 'all')))
      .filter((item) => matchesUsageProviderModel(item, providerKeyword, modelKeyword))

    const baseAccountIds = new Set(scopedLedgerBase.map((item) => toText(item.accountId)).filter(Boolean))
    const keywordMatchedSummaryIds = keyword
      ? summaries
        .filter((item) => usageMatches(item, keyword, usageType))
        .map((item) => toText(item.accountId))
        .filter(Boolean)
      : []
    const ledgerMatchedIds = ledgerKeyword
      ? scopedLedgerBase
        .filter((item) => {
          const account = summaryMap[toText(item.accountId)] || null
          return matchesGlobalUsageKeyword(item, ledgerKeyword, account)
        })
        .map((item) => toText(item.accountId))
        .filter(Boolean)
      : []
    const visibleAccountIds = (keyword || ledgerKeyword)
      ? Array.from(new Set(keywordMatchedSummaryIds.concat(ledgerMatchedIds))).filter((accountId) => {
        return baseAccountIds.size ? baseAccountIds.has(accountId) : true
      })
      : summaries.map((item) => toText(item.accountId)).filter(Boolean)
    const visibleAccountIdSet = new Set(visibleAccountIds)
    const filteredSummaries = summaries.filter((item) => visibleAccountIdSet.has(toText(item.accountId)))
    const filteredLedgerPool = scopedLedgerBase.filter((item) => {
      if (!visibleAccountIdSet.size) {
        return false
      }
      return visibleAccountIdSet.has(toText(item.accountId))
    })
    const pageInfo = normalizeUsagePageInfo({
      page,
      pageSize,
      total: filteredLedgerPool.length,
      totalPages: filteredLedgerPool.length > 0 ? Math.ceil(filteredLedgerPool.length / pageSize) : 1,
      hasPrev: page > 1,
      hasNext: page * pageSize < filteredLedgerPool.length,
      returned: includeLedger ? Math.max(0, filteredLedgerPool.slice((page - 1) * pageSize, page * pageSize).length) : 0
    }, filteredLedgerPool.length, pageSize)
    const pagedLedger = includeLedger
      ? filteredLedgerPool.slice((pageInfo.page - 1) * pageInfo.pageSize, pageInfo.page * pageInfo.pageSize)
      : []

    return {
      usageSummaries: filteredSummaries,
      usageLedger: pagedLedger,
      plans: result.plans || [],
      pageInfo,
      report: buildUsageReportFromLocalData({
        summaries: filteredSummaries,
        ledger: filteredLedgerPool,
        usageType,
        pageInfo,
        scope: {
          keyword,
          ledgerKeyword,
          usageType,
          sourceType,
          providerKeyword,
          modelKeyword,
          timeWindow: toText(payload.timeWindow || payload.usageTimeWindow || 'all')
        }
      })
    }
  }

  return {
    async refreshAll() {
      return snapshot()
    },
    async listLegalDocuments(payload = {}) {
      const documents = buildLegalDocumentList(payload)
      return {
        ok: true,
        documents,
        total: documents.length
      }
    },
    async getLegalDocumentDetail(payload = {}) {
      const docId = toText(payload.docId)
      const document = docId
        ? findLegalDocument(docId)
        : store.legalDocuments
          .slice()
          .sort((left, right) => `${right.updatedAt || ''}`.localeCompare(`${left.updatedAt || ''}`))[0]
      if (!document) {
        throw new Error('当前还没有协议文档。')
      }
      return {
        ok: true,
        document: normalizeLegalDocumentDetailForUi(document)
      }
    },
    async upsertLegalDocumentDraft(payload = {}) {
      const now = new Date().toISOString()
      const docId = toText(payload.docId)
      const docType = toText(payload.docType)
      const version = toText(payload.version)
      const title = toText(payload.title || getLegalDocumentTypeLabel(docType))
      const markdownSource = String(payload.markdownSource || '')
      if (!docType) {
        throw new Error('缺少协议类型。')
      }
      if (!version) {
        throw new Error('缺少版本号。')
      }
      if (!title) {
        throw new Error('缺少标题。')
      }
      if (!markdownSource.trim()) {
        throw new Error('缺少协议正文。')
      }

      const duplicate = store.legalDocuments.find((item) => {
        return item.docType === docType
          && item.version === version
          && toText(item.docId) !== docId
      })
      if (duplicate) {
        throw new Error('同类型协议版本号已存在。')
      }

      const existingIndex = store.legalDocuments.findIndex((item) => toText(item.docId) === docId)
      const existing = existingIndex >= 0 ? store.legalDocuments[existingIndex] : null
      if (existing && existing.status === 'published') {
        throw new Error('已发布版本不可直接编辑，请先复制为新草稿。')
      }

      const nextDocId = docId || `legal_${docType}_${version.replace(/[^a-zA-Z0-9]+/g, '_')}`
      const nextDocument = {
        docId: nextDocId,
        docType,
        title,
        version,
        status: 'draft',
        isCurrent: false,
        contentFormat: 'markdown',
        markdownSource,
        htmlSnapshot: existing ? toText(existing.htmlSnapshot) : '',
        plainTextSnapshot: existing ? toText(existing.plainTextSnapshot) : '',
        summary: toText(payload.summary),
        changeNotes: Array.isArray(payload.changeNotes)
          ? payload.changeNotes.map((item) => toText(item)).filter(Boolean)
          : splitLegalChangeNotes(payload.changeNotes),
        requiresReconsent: Boolean(payload.requiresReconsent),
        effectiveAt: toText(payload.effectiveAt) || now,
        publishedAt: existing ? toText(existing.publishedAt) : '',
        archivedAt: existing ? toText(existing.archivedAt) : '',
        hash: existing ? toText(existing.hash) : '',
        sourceDraftId: toText(payload.sourceDraftId || (existing && existing.sourceDraftId)),
        previousVersion: toText(payload.previousVersion || (existing && existing.previousVersion)),
        currentRevision: Math.max(1, Math.floor(toNumber((existing && existing.currentRevision) || 0, 0)) + 1),
        updatedBy: 'admin_demo',
        updatedAt: now,
        createdAt: existing ? toText(existing.createdAt) : now,
        operatorId: 'admin_demo'
      }

      if (existingIndex >= 0) {
        store.legalDocuments.splice(existingIndex, 1, nextDocument)
      } else {
        store.legalDocuments.unshift(nextDocument)
      }

      store.auditLogs.unshift(buildAuditLog({
        operatorId: 'admin_demo',
        actionType: 'upsert_legal_document_draft',
        targetType: 'legal_document',
        targetId: nextDocId,
        reason: toText(payload.reason || `维护协议草稿 ${title}`),
        beforeSnapshot: existing ? normalizeLegalDocumentDetailForUi(existing) : {},
        afterSnapshot: normalizeLegalDocumentDetailForUi(nextDocument),
        createdAt: now
      }))

      return {
        ok: true,
        action: existing ? 'updated' : 'created',
        document: normalizeLegalDocumentSummaryForUi(nextDocument)
      }
    },
    async previewLegalDocument(payload = {}) {
      const markdownSource = String(payload.markdownSource || '')
      return {
        ok: true,
        contentFormat: 'markdown',
        markdownSource,
        html: renderLegalMarkdownPreview(markdownSource),
        plainText: buildLegalPlainText(markdownSource)
      }
    },
    async publishLegalDocument(payload = {}) {
      const docId = toText(payload.docId)
      const target = findLegalDocument(docId)
      if (target.status !== 'draft') {
        throw new Error('当前协议不是草稿，不能直接发布。')
      }
      const now = new Date().toISOString()
      store.legalDocuments = store.legalDocuments.map((item) => {
        if (item.docType === target.docType && item.status === 'published') {
          return {
            ...item,
            isCurrent: false,
            updatedAt: now,
            updatedBy: 'admin_demo'
          }
        }
        return item
      })

      const htmlSnapshot = renderLegalMarkdownPreview(target.markdownSource)
      const plainTextSnapshot = buildLegalPlainText(target.markdownSource)
      const publishedDocument = {
        ...target,
        status: 'published',
        isCurrent: true,
        htmlSnapshot,
        plainTextSnapshot,
        hash: `sha256:mock_${target.docType}_${target.version}`,
        publishedAt: now,
        updatedAt: now,
        updatedBy: 'admin_demo',
        operatorId: 'admin_demo'
      }
      const targetIndex = store.legalDocuments.findIndex((item) => toText(item.docId) === docId)
      store.legalDocuments.splice(targetIndex, 1, publishedDocument)
      store.auditLogs.unshift(buildAuditLog({
        operatorId: 'admin_demo',
        actionType: 'publish_legal_document',
        targetType: 'legal_document',
        targetId: docId,
        reason: toText(payload.reason || `发布协议 ${target.title}`),
        beforeSnapshot: normalizeLegalDocumentDetailForUi(target),
        afterSnapshot: normalizeLegalDocumentDetailForUi(publishedDocument),
        createdAt: now
      }))
      return {
        ok: true,
        action: 'published',
        document: normalizeLegalDocumentSummaryForUi(publishedDocument)
      }
    },
    async cloneLegalDocumentDraft(payload = {}) {
      const sourceDocId = toText(payload.sourceDocId)
      const nextVersion = toText(payload.nextVersion)
      if (!sourceDocId) {
        throw new Error('缺少来源协议。')
      }
      if (!nextVersion) {
        throw new Error('缺少新版本号。')
      }
      const source = findLegalDocument(sourceDocId)
      const duplicate = store.legalDocuments.find((item) => item.docType === source.docType && item.version === nextVersion)
      if (duplicate) {
        throw new Error('同类型协议版本号已存在。')
      }
      const now = new Date().toISOString()
      const nextDocument = {
        ...source,
        docId: `legal_${source.docType}_${nextVersion.replace(/[^a-zA-Z0-9]+/g, '_')}`,
        version: nextVersion,
        status: 'draft',
        isCurrent: false,
        htmlSnapshot: '',
        plainTextSnapshot: '',
        hash: '',
        summary: '',
        changeNotes: [],
        sourceDraftId: source.docId,
        previousVersion: source.version,
        currentRevision: 1,
        publishedAt: '',
        updatedAt: now,
        createdAt: now,
        updatedBy: 'admin_demo',
        operatorId: 'admin_demo'
      }
      store.legalDocuments.unshift(nextDocument)
      store.auditLogs.unshift(buildAuditLog({
        operatorId: 'admin_demo',
        actionType: 'clone_legal_document_draft',
        targetType: 'legal_document',
        targetId: nextDocument.docId,
        reason: toText(payload.reason || `复制协议 ${source.title}`),
        beforeSnapshot: normalizeLegalDocumentDetailForUi(source),
        afterSnapshot: normalizeLegalDocumentDetailForUi(nextDocument),
        createdAt: now
      }))
      return {
        ok: true,
        action: 'cloned',
        document: normalizeLegalDocumentSummaryForUi(nextDocument)
      }
    },
    async fetchFeedback(payload = {}) {
      const keyword = toText(payload.keyword).toLowerCase()
      const status = toText(payload.status || 'all')
      const limit = Math.max(1, Math.floor(toNumber(payload.limit, 100)))
      const feedback = store.feedbackItems
        .filter((item) => status === 'all' || item.status === status)
        .filter((item) => {
          if (!keyword) {
            return true
          }
          return [
            item.feedbackId,
            item.accountId,
            item.phoneMasked,
            item.displayName,
            item.typeLabel,
            item.sceneLabel,
            item.content,
            item.contact,
            item.adminNote
          ].some((field) => toText(field).toLowerCase().includes(keyword))
        })
        .slice(0, limit)
        .map((item) => normalizeFeedbackForUi(item))
      return {
        feedback,
        total: feedback.length
      }
    },
    async fetchReferrals(payload = {}) {
      const keyword = toText(payload.keyword).toLowerCase()
      const status = toText(payload.status || 'all')
      const timeWindow = toText(payload.timeWindow || 'all')
      const limit = Math.max(1, Math.floor(toNumber(payload.limit, 100)))
      const referrals = store.referralItems
        .filter((item) => status === 'all' || item.status === status)
        .filter((item) => referralMatches(item, keyword, status, timeWindow))
        .slice(0, limit)
        .map((item) => normalizeReferralForUi(item))
      return {
        referrals,
        stats: buildLocalReferralStats(store.referralItems),
        total: referrals.length
      }
    },
    async fetchUsage(payload = {}) {
      return buildMockUsageResult(payload)
    },
    async fetchManualAdjustments(payload = {}) {
      const keyword = toText(payload.keyword).toLowerCase()
      const accountId = toText(payload.accountId)
      const limit = Math.max(1, Math.floor(toNumber(payload.limit, 200)))
      const logs = store.auditLogs
        .filter((item) => item.targetType === 'account' && isManualAdjustmentAction(item.actionType))
        .filter((item) => !accountId || item.targetId === accountId)
        .filter((item) => {
          if (!keyword) {
            return true
          }
          return [
            item.createdAt,
            item.operatorId,
            item.actionType,
            item.targetId,
            item.reason
          ].some((field) => toText(field).toLowerCase().includes(keyword))
        })
        .slice(0, limit)
        .map((item) => normalizeAuditForUi(item))
      return {
        logs,
        total: logs.length
      }
    },
    async updateEntitlement(payload) {
      const account = findAccount(toText(payload.accountId))
      const reason = toText(payload.reason) || '后台人工操作'
      const beforeSnapshot = {
        status: account.status,
        currentAccessLevel: account.currentAccessLevel,
        trialEndsAt: account.trialEndsAt,
        subscriptionEndsAt: account.subscriptionEndsAt,
        voiceSecondsRemaining: account.voiceSecondsRemaining,
        aiTokensRemaining: account.aiTokensRemaining
      }

      if (payload.action === 'add_voice') {
        account.voiceSecondsRemaining += Math.max(1, Math.floor(toNumber(payload.amount, 0)))
        account.canUseSpeechToText = account.status === 'trialing' || account.status === 'active_paid'
      } else if (payload.action === 'add_ai') {
        account.aiTokensRemaining += Math.max(1, Math.floor(toNumber(payload.amount, 0)))
        account.canUseAi = account.status === 'trialing' || account.status === 'active_paid'
      } else if (payload.action === 'extend_trial') {
        const days = Math.max(1, Math.floor(toNumber(payload.days, 0)))
        const baseDate = isFutureDate(account.trialEndsAt) ? new Date(account.trialEndsAt) : new Date()
        const nextTrialEndsAt = addDays(baseDate, days)
        account.trialEndsAt = formatCompactDateText(nextTrialEndsAt)
        if (account.status !== 'disabled') {
          applyMockStatusProfile(account, {
            status: 'trialing',
            currentAccessLevel: 'trial_full'
          })
        }
      } else if (payload.action === 'grant_subscription') {
        const billingCycle = toText(payload.billingCycle) === 'yearly' ? 'yearly' : 'monthly'
        const grantedVoiceSeconds = Math.max(0, Math.floor(toNumber(payload.grantedVoiceSeconds, 1800)))
        const grantedAiTokens = Math.max(0, Math.floor(toNumber(payload.grantedAiTokens, 200000)))
        const projectLimit = Number.isFinite(Number(payload.projectLimit))
          ? Math.floor(toNumber(payload.projectLimit, -1))
          : -1
        const baseDate = isFutureDate(account.subscriptionEndsAt) ? new Date(account.subscriptionEndsAt) : new Date()
        const nextExpiresAt = payload.days
          ? addDays(baseDate, Math.max(1, Math.floor(toNumber(payload.days, 0))))
          : addCycle(baseDate, billingCycle)
        account.subscriptionEndsAt = formatCompactDateText(nextExpiresAt)
        account.projectLimit = projectLimit
        account.voiceSecondsRemaining = Math.max(account.voiceSecondsRemaining, grantedVoiceSeconds)
        account.aiTokensRemaining = Math.max(account.aiTokensRemaining, grantedAiTokens)
        applyMockStatusProfile(account, {
          status: 'active_paid',
          currentAccessLevel: 'paid_active'
        })
      } else if (payload.action === 'expire_subscription') {
        if (account.subscriptionEndsAt) {
          account.subscriptionEndsAt = formatCompactDateText(new Date())
        }
        applyMockStatusProfile(account, {
          status: 'expired_readonly',
          currentAccessLevel: 'paid_readonly'
        })
      } else if (payload.action === 'disable_account') {
        applyMockStatusProfile(account, {
          status: 'disabled',
          currentAccessLevel: 'disabled'
        })
      } else if (payload.action === 'enable_account') {
        applyMockStatusProfile(account, resolveMockRestoredState(account))
      } else {
        throw new Error('当前 mock provider 不支持该操作。')
      }

      account.lastActiveAt = formatCompactDateText(new Date())
      appendMockAuditLog(store, payload.action, account, beforeSnapshot, reason)
      return {
        ok: true
      }
    },
    async updateOrderStatus(payload) {
      const order = store.orders.find((item) => item.orderId === toText(payload.orderId))
      if (!order) {
        throw new Error('当前订单不存在或已无权查看')
      }

      if (toText(payload.action) !== 'close') {
        throw new Error('当前 mock provider 不支持该订单操作。')
      }

      if (order.status !== 'pending') {
        throw new Error('当前订单状态不支持继续发起支付')
      }

      const reason = toText(payload.reason) || 'duplicate_manual_test_order'
      const beforeSnapshot = clone(order)
      const nowText = formatCompactDateText(new Date())

      order.status = 'closed'
      order.updatedAt = nowText
      order.channelOrderStatus = '已关闭'
      order.pendingReason = `已由后台关闭。原因：${reason}`
      order.canInvokePayment = false

      store.auditLogs.unshift(buildAuditLog({
        operatorId: 'admin_demo',
        actionType: 'close_order',
        targetType: 'order',
        targetId: order.orderId,
        reason,
        beforeSnapshot,
        afterSnapshot: clone(order),
        createdAt: nowText
      }))

      return {
        ok: true
      }
    },
    async updateFeedback(payload = {}) {
      const feedbackId = toText(payload.feedbackId)
      const action = toText(payload.action)
      const target = store.feedbackItems.find((item) => item.feedbackId === feedbackId)
      if (!target) {
        throw new Error('当前反馈不存在或已被删除。')
      }

      const beforeSnapshot = clone(target)
      const nowText = formatCompactDateText(new Date())
      const statusMap = {
        accept: ['accepted', '已采纳'],
        reject: ['rejected', '不采纳'],
        close: ['closed', '已关闭'],
        reward: ['rewarded', '已发奖']
      }
      const nextStatus = statusMap[action]
      if (!nextStatus) {
        throw new Error('当前 mock provider 不支持该反馈操作。')
      }

      target.status = nextStatus[0]
      target.statusLabel = nextStatus[1]
      target.adminNote = toText(payload.adminNote)
      target.handledAt = nowText
      target.updatedAt = nowText
      if (action === 'reward') {
        target.rewardAiTokens = Math.max(1, Math.floor(toNumber(payload.rewardAiTokens, 1000000)))
        target.rewardedAt = nowText
      }

      store.auditLogs.unshift(buildAuditLog({
        operatorId: 'admin_demo',
        actionType: `feedback_${action}`,
        targetType: 'feedback',
        targetId: target.feedbackId,
        reason: target.adminNote || target.statusLabel,
        beforeSnapshot,
        afterSnapshot: clone(target),
        createdAt: nowText
      }))

      return {
        ok: true,
        feedback: normalizeFeedbackForUi(target)
      }
    },
    async updatePlan(payload) {
      const planCode = toText(payload.planCode)
      if (!planCode) {
        throw new Error('缺少商品编码，无法保存。')
      }

      const target = store.plans.find((item) => item.planCode === planCode)
      if (!target) {
        throw new Error('当前商品不存在，无法保存。')
      }

      target.planName = toText(payload.planName || target.planName)
      target.planType = toText(payload.planType || target.planType)
      target.billingCycle = toText(payload.billingCycle || target.billingCycle)
      target.price = Math.max(0, Math.floor(toNumber(payload.price, target.price)))
      target.originalPrice = Math.max(0, Math.floor(toNumber(payload.originalPrice, target.originalPrice)))
      target.isPricePending = Boolean(payload.isPricePending)
      target.displayPriceText = toText(payload.displayPriceText)
      target.displayBillingText = toText(payload.displayBillingText || target.displayBillingText)
      target.projectLimit = Math.floor(toNumber(payload.projectLimit, target.projectLimit))
      target.monthlyVoiceSeconds = Math.max(0, Math.floor(toNumber(payload.monthlyVoiceSeconds, target.monthlyVoiceSeconds)))
      target.monthlyAiTokens = Math.max(0, Math.floor(toNumber(payload.monthlyAiTokens, target.monthlyAiTokens)))
      target.summary = toText(payload.summary || target.summary)
      target.featureLines = toText(payload.featureLines)
        ? toText(payload.featureLines).split('\n').map((item) => toText(item)).filter(Boolean)
        : []
      target.enabled = Boolean(payload.enabled)
      target.sortOrder = Math.floor(toNumber(payload.sortOrder, target.sortOrder))
      target.supportsShareOut = Boolean(payload.supportsShareOut)
      target.supportsQuickEntry = Boolean(payload.supportsQuickEntry)
      target.supportsAi = Boolean(payload.supportsAi)
      target.supportsSpeechToText = Boolean(payload.supportsSpeechToText)
      target.trialEligible = Boolean(payload.trialEligible)

      store.auditLogs.unshift(buildAuditLog({
        operatorId: 'admin_demo',
        actionType: 'upsert_plan',
        targetType: 'plan',
        targetId: target.planCode,
        reason: toText(payload.reason) || '后台维护商品目录',
        beforeSnapshot: {},
        afterSnapshot: clone(target),
        createdAt: formatCompactDateText(new Date())
      }))

      return {
        ok: true
      }
    },
    async getAiModelConfig() {
      return {
        ok: true,
        config: normalizeAiModelConfig(store.aiModelConfig),
        source: 'mock'
      }
    },
    async testAiModelConfig(payload = {}) {
      const routeKey = toText(payload.routeKey || 'followup_summary')
      return {
        ok: true,
        source: 'mock',
        elapsedMs: Math.floor(40 + Math.random() * 70),
        runtime: {
          routeKey,
          providerKey: 'cloudbase_default',
          providerType: 'cloudbase',
          providerLabel: 'CloudBase 默认',
          engine: 'cloudbase',
          model: 'hunyuan-turbos-latest',
          provider: 'hunyuan-exp',
          baseURL: '',
          apiKeyMasked: ''
        },
        probe: {
          status: 'success',
          snippet: 'pong(mock)'
        }
      }
    },
    async updateAiModelConfig(payload = {}) {
      const nextConfig = normalizeAiModelConfig(payload.config || payload)
      store.aiModelConfig = nextConfig
      store.auditLogs.unshift(buildAuditLog({
        operatorId: 'admin_demo',
        actionType: 'update_ai_model_config',
        targetType: 'feature_flag',
        targetId: 'ai_model_routing_v1',
        reason: toText(payload.reason) || '后台维护 AI 模型路由与策略',
        beforeSnapshot: {},
        afterSnapshot: clone(nextConfig),
        createdAt: formatCompactDateText(new Date())
      }))
      return {
        ok: true,
        config: normalizeAiModelConfig(store.aiModelConfig)
      }
    },
    async reset() {
      store = clone(INITIAL_MOCK_DATA)
      return snapshot()
    }
  }
}

function createCloudProvider(config) {
  async function callBridge(path, payload = {}) {
    const bridgeBase = normalizeBridgeBase(config.bridgeBase)
    const apiPath = path.startsWith('/api/') ? path : `/api${path}`
    const requestUrl = bridgeBase ? `${bridgeBase}${apiPath}` : apiPath

    const response = await fetch(requestUrl, {
      method: 'POST',
      credentials: bridgeBase ? 'include' : 'same-origin',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    const rawText = await response.text()
    let json = {}

    try {
      json = rawText ? JSON.parse(rawText) : {}
    } catch (error) {
      throw new Error(`桥接服务返回了非 JSON 响应: ${rawText.slice(0, 120)}`)
    }

    if (!response.ok || json.ok === false) {
      const error = new Error(toText(json.message || json.error || rawText || '桥接服务调用失败'))
      error.statusCode = response.status
      error.code = toText(json.code)
      throw error
    }

    return json
  }

  return {
    async refreshAll() {
      const [usersResult, ordersResult, usageResult, auditResult, referralResult] = await Promise.all([
        callBridge(config.usersPath),
        callBridge(config.ordersPath),
        callBridge(config.usagePath, {
          limit: 100,
          ledgerLimit: 100
        }),
        callBridge(config.auditPath, {
          limit: 100,
          scanLimit: 500
        }),
        callBridge(config.referralsPath, {
          limit: 200,
          scanLimit: 500
        })
      ])

      return {
        accounts: (usersResult.users || []).map((item) => normalizeAccountForUi(item)),
        orders: (ordersResult.orders || []).map((item) => normalizeOrderForUi(item)),
        usageSummaries: (usageResult.summaries || []).map((item) => normalizeUsageSummaryForUi(item)),
        usageLedger: (usageResult.ledger || []).map((item) => normalizeUsageLedgerForUi(item)),
        plans: (usageResult.plans || []).map((item) => normalizePlanForUi(item)),
        auditLogs: (auditResult.logs || []).map((item) => normalizeAuditForUi(item)),
        manualAdjustmentLogs: (auditResult.logs || [])
          .map((item) => normalizeAuditForUi(item))
          .filter((item) => item.targetType === 'account' && isManualAdjustmentAction(item.actionType)),
        referralItems: (referralResult.referrals || []).map((item) => normalizeReferralForUi(item)),
        referralStats: referralResult.stats || buildLocalReferralStats([]),
        sourceLabel: normalizeBridgeBase(config.bridgeBase)
          ? `CloudBridge ${normalizeBridgeBase(config.bridgeBase)}`
          : 'Admin API 同源服务',
        supportsReset: false
      }
    },
    async fetchUsage(payload = {}) {
      const usageResult = await callBridge(config.usagePath, payload)
      return {
        usageSummaries: (usageResult.summaries || []).map((item) => normalizeUsageSummaryForUi(item)),
        usageLedger: (usageResult.ledger || []).map((item) => normalizeUsageLedgerForUi(item)),
        plans: (usageResult.plans || []).map((item) => normalizePlanForUi(item)),
        report: usageResult.report || {},
        pageInfo: usageResult.pageInfo || {}
      }
    },
    async listLegalDocuments(payload = {}) {
      const result = await callBridge(config.listLegalDocumentsPath, payload)
      return {
        documents: (result.documents || []).map((item) => normalizeLegalDocumentSummaryForUi(item)),
        total: result.total || 0
      }
    },
    async getLegalDocumentDetail(payload = {}) {
      const result = await callBridge(config.getLegalDocumentDetailPath, payload)
      return {
        document: result.document ? normalizeLegalDocumentDetailForUi(result.document) : null
      }
    },
    async upsertLegalDocumentDraft(payload = {}) {
      const result = await callBridge(config.upsertLegalDocumentDraftPath, payload)
      return {
        ...result,
        document: result.document ? normalizeLegalDocumentSummaryForUi(result.document) : null
      }
    },
    async previewLegalDocument(payload = {}) {
      return callBridge(config.previewLegalDocumentPath, payload)
    },
    async publishLegalDocument(payload = {}) {
      const result = await callBridge(config.publishLegalDocumentPath, payload)
      return {
        ...result,
        document: result.document ? normalizeLegalDocumentSummaryForUi(result.document) : null
      }
    },
    async cloneLegalDocumentDraft(payload = {}) {
      const result = await callBridge(config.cloneLegalDocumentDraftPath, payload)
      return {
        ...result,
        document: result.document ? normalizeLegalDocumentSummaryForUi(result.document) : null
      }
    },
    async updateEntitlement(payload) {
      return callBridge(config.updatePath, payload)
    },
    async fetchFeedback(payload = {}) {
      const feedbackResult = await callBridge(config.feedbackPath, {
        limit: 200,
        scanLimit: 500,
        ...payload
      })
      return {
        feedback: (feedbackResult.feedback || []).map((item) => normalizeFeedbackForUi(item)),
        total: feedbackResult.total || 0
      }
    },
    async updateFeedback(payload = {}) {
      const result = await callBridge(config.updateFeedbackPath, payload)
      return {
        ...result,
        feedback: result.feedback ? normalizeFeedbackForUi(result.feedback) : null
      }
    },
    async fetchReferrals(payload = {}) {
      const referralResult = await callBridge(config.referralsPath, {
        limit: 200,
        scanLimit: 500,
        ...payload
      })
      return {
        referrals: (referralResult.referrals || []).map((item) => normalizeReferralForUi(item)),
        stats: referralResult.stats || buildLocalReferralStats([]),
        total: referralResult.total || 0
      }
    },
    async fetchManualAdjustments(payload = {}) {
      const auditResult = await callBridge(config.manualAdjustmentsPath || config.auditPath, {
        targetType: 'account',
        actionTypes: [
          'add_voice',
          'add_ai',
          'extend_trial',
          'grant_subscription',
          'enable_account',
          'expire_subscription',
          'disable_account'
        ],
        limit: 200,
        scanLimit: 500,
        ...payload
      })
      return {
        logs: (auditResult.logs || []).map((item) => normalizeAuditForUi(item)),
        total: auditResult.total || 0
      }
    },
    async updatePlan(payload) {
      return callBridge(config.updatePlanPath, payload)
    },
    async updateOrderStatus(payload) {
      return callBridge(config.updateOrderPath, payload)
    },
    async getAiModelConfig() {
      return callBridge(config.getAiModelConfigPath)
    },
    async testAiModelConfig(payload = {}) {
      return callBridge(config.testAiModelConfigPath, payload)
    },
    async updateAiModelConfig(payload) {
      return callBridge(config.updateAiModelConfigPath, payload)
    },
    async reset() {
      throw new Error('Cloud 模式不支持重置演示数据。')
    }
  }
}

function createProvider(mode) {
  return mode === 'cloud'
    ? createCloudProvider(state.runtime.cloudConfig)
    : createMockProvider()
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  })
  const rawText = await response.text()
  let json = {}

  try {
    json = rawText ? JSON.parse(rawText) : {}
  } catch (error) {
    throw new Error(`服务返回了非 JSON 响应: ${rawText.slice(0, 120)}`)
  }

  if (!response.ok || json.ok === false) {
    const error = new Error(toText(json.error || json.message || rawText || '请求失败'))
    error.statusCode = response.status
    error.code = toText(json.code)
    throw error
  }

  return json
}

function applySessionState(session = {}) {
  state.runtime.authChecking = false
  state.runtime.authenticated = Boolean(session.authenticated)
  state.runtime.authUser = toText(session.username)
  state.runtime.authConfigured = session.authConfigured !== false
  if (Object.prototype.hasOwnProperty.call(session, 'canInvoke')) {
    state.runtime.cloudInvokeReady = Boolean(session.canInvoke)
  }
  if (Object.prototype.hasOwnProperty.call(session, 'operatorConfigured')) {
    state.runtime.operatorConfigured = Boolean(session.operatorConfigured)
  }
}

async function refreshAuthSession() {
  if (state.runtime.providerMode !== 'cloud') {
    state.runtime.authChecking = false
    state.runtime.authenticated = true
    state.runtime.authUser = 'mock'
    state.runtime.authConfigured = true
    state.runtime.cloudInvokeReady = true
    state.runtime.operatorConfigured = true
    return
  }

  state.runtime.authChecking = true
  renderAuthGate()

  try {
    const session = await fetchJson('/api/session', {
      method: 'GET',
      headers: {}
    })
    applySessionState(session)
  } catch (error) {
    state.runtime.authChecking = false
    state.runtime.authenticated = false
    state.runtime.authUser = ''
    setNotice(error.message || '读取登录状态失败。', 'danger')
  }
}

function renderAuthGate() {
  const shell = document.querySelector('.admin-shell')
  const overlay = document.getElementById('adminLoginOverlay')
  const form = document.getElementById('adminLoginForm')
  const usernameInput = document.getElementById('adminLoginUsername')
  const passwordInput = document.getElementById('adminLoginPassword')
  const errorBox = document.getElementById('adminLoginError')
  const logoutBtn = document.getElementById('adminLogoutBtn')
  const isCloudMode = state.runtime.providerMode === 'cloud'
  const shouldShowLogin = isCloudMode && !state.runtime.authenticated

  if (shell) {
    shell.hidden = shouldShowLogin
  }
  if (overlay) {
    overlay.hidden = !shouldShowLogin
  }
  if (logoutBtn) {
    logoutBtn.hidden = !isCloudMode || !state.runtime.authenticated
  }
  if (usernameInput && !usernameInput.value) {
    usernameInput.value = 'admin'
  }
  if (form) {
    form.classList.toggle('is-loading', Boolean(state.runtime.authChecking))
  }
  if (errorBox) {
    let message = ''
    if (state.runtime.authChecking) {
      message = '正在检查登录状态...'
    } else if (!state.runtime.authConfigured) {
      message = '本地管理台尚未配置 ADMIN_USERNAME / ADMIN_PASSWORD_HASH，请先补齐 admin-web-bridge/.env.local。'
    } else if (state.runtime.noticeTone === 'danger' && state.runtime.noticeText) {
      message = state.runtime.noticeText
    }
    errorBox.hidden = !message
    errorBox.textContent = message
  }
}

async function handleAdminLogin(event) {
  event.preventDefault()
  const usernameInput = document.getElementById('adminLoginUsername')
  const passwordInput = document.getElementById('adminLoginPassword')
  const username = usernameInput ? usernameInput.value : ''
  const password = passwordInput ? passwordInput.value : ''

  state.runtime.authChecking = true
  setNotice('', 'info')
  renderAuthGate()

  try {
    const session = await fetchJson('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        username,
        password
      })
    })
    applySessionState(session)
    if (passwordInput) {
      passwordInput.value = ''
    }
    await refreshData({ preserveSelection: false })
  } catch (error) {
    state.runtime.authChecking = false
    state.runtime.authenticated = false
    setNotice(error.message || '登录失败。', 'danger')
    render()
  }
}

async function handleAdminLogout() {
  try {
    await fetchJson('/api/logout', {
      method: 'POST',
      body: JSON.stringify({})
    })
  } catch (error) {
    // Local logout still clears the client-side state even if the request fails.
  }

  state.runtime.authenticated = false
  state.runtime.authUser = ''
  state.accounts = []
  state.orders = []
  state.feedbackItems = []
  state.referralItems = []
  state.usageSummaries = []
  state.usageLedger = []
  state.usageViewSummaries = []
  state.usageViewLedger = []
  state.globalUsageSummaries = []
  state.globalUsageLedger = []
  state.legalDocuments = []
  state.selectedLegalDocumentId = ''
  applyLegalDocumentDetail(null)
  setNotice('', 'info')
  render()
}

function setNotice(text = '', tone = 'info') {
  state.runtime.noticeText = toText(text)
  state.runtime.noticeTone = tone
}

function showToast(text = '', tone = 'info') {
  const message = toText(text)
  if (!message) {
    return
  }

  if (state.runtime.toastTimer) {
    clearTimeout(state.runtime.toastTimer)
  }

  state.runtime.toastText = message
  state.runtime.toastTone = tone
  renderToast()
  state.runtime.toastTimer = setTimeout(() => {
    state.runtime.toastText = ''
    state.runtime.toastTone = 'info'
    state.runtime.toastTimer = null
    renderToast()
  }, 3200)
}

function renderToast() {
  const toastHost = document.getElementById('toastHost')
  if (!toastHost) {
    return
  }

  if (!state.runtime.toastText) {
    toastHost.innerHTML = ''
    return
  }

  toastHost.innerHTML = `
    <div class="toast-card is-${escapeHtml(state.runtime.toastTone)}" role="status">
      <div class="toast-title">${escapeHtml(state.runtime.toastTone === 'success' ? '操作成功' : '系统提醒')}</div>
      <div class="toast-message">${escapeHtml(state.runtime.toastText)}</div>
    </div>
  `
}

function supportsRemoteUsageFetch() {
  return Boolean(provider && typeof provider.fetchUsage === 'function')
}

function supportsManualAdjustmentFetch() {
  return Boolean(provider && typeof provider.fetchManualAdjustments === 'function')
}

function supportsReferralFetch() {
  return Boolean(provider && typeof provider.fetchReferrals === 'function')
}

function supportsLegalDocumentAdmin() {
  return Boolean(
    provider
    && typeof provider.listLegalDocuments === 'function'
    && typeof provider.getLegalDocumentDetail === 'function'
  )
}

function hasUsageServerFilter() {
  return Boolean(
    toText(state.usageSearch)
    || state.usageTypeFilter !== 'all'
    || state.usageTimeWindow !== 'all'
    || state.usageSourceFilter !== 'all'
    || toText(state.usageProviderFilter)
    || toText(state.usageModelFilter)
  )
}

function buildUsageFetchPayload() {
  const payload = {
    limit: 300,
    ledgerLimit: 100,
    maxLedgerScan: 1200
  }

  if (toText(state.usageSearch)) {
    payload.keyword = toText(state.usageSearch)
  }
  if (state.usageTypeFilter !== 'all') {
    payload.usageType = state.usageTypeFilter
  }
  if (state.usageTimeWindow !== 'all') {
    payload.timeWindow = state.usageTimeWindow
  }
  if (state.usageSourceFilter !== 'all') {
    payload.sourceType = state.usageSourceFilter
  }
  if (toText(state.usageProviderFilter)) {
    payload.providerKey = toText(state.usageProviderFilter)
  }
  if (toText(state.usageModelFilter)) {
    payload.model = toText(state.usageModelFilter)
  }

  return payload
}

function buildGlobalUsageFetchPayload() {
  const activeType = getGlobalUsageActiveType()
  const payload = {
    limit: 100,
    page: state.globalUsagePage,
    pageSize: state.globalUsagePageSize,
    maxLedgerScan: 2000,
    usageType: activeType
  }

  if (toText(state.globalUsageSearch)) {
    payload.keyword = toText(state.globalUsageSearch)
    payload.ledgerKeyword = toText(state.globalUsageSearch)
  }
  if (state.globalUsageTimeWindow !== 'all') {
    payload.timeWindow = state.globalUsageTimeWindow
  }
  if (state.globalUsageSourceFilter !== 'all') {
    payload.sourceType = state.globalUsageSourceFilter
  }
  if (activeType === 'ai_tokens' && toText(state.globalUsageProviderFilter)) {
    payload.providerKey = toText(state.globalUsageProviderFilter)
  }
  if (activeType === 'ai_tokens' && toText(state.globalUsageModelFilter)) {
    payload.model = toText(state.globalUsageModelFilter)
  }

  return payload
}

function buildReferralFetchPayload() {
  return {
    limit: 200,
    scanLimit: 500,
    keyword: toText(state.referralSearch),
    status: state.referralStatusFilter,
    timeWindow: state.referralTimeWindow
  }
}

function buildOverviewUsageFetchPayload() {
  return {
    limit: 300,
    page: 1,
    pageSize: 1,
    maxLedgerScan: 2000,
    timeWindow: 'last_30d',
    includeLedger: false
  }
}

function buildLegalDocumentFetchPayload() {
  const payload = {
    limit: 100,
    docType: state.legalDocumentDocTypeFilter,
    status: state.legalDocumentStatusFilter
  }
  if (toText(state.legalDocumentSearch)) {
    payload.keyword = toText(state.legalDocumentSearch)
  }
  return payload
}

function applyUsageViewResult(result = {}, preserveSelection = true, preferredAccountId = '') {
  state.usageViewSummaries = Array.isArray(result.usageSummaries) ? result.usageSummaries : []
  state.usageViewLedger = Array.isArray(result.usageLedger) ? result.usageLedger : []
  if (Array.isArray(result.plans) && result.plans.length) {
    state.plans = result.plans
  }

  const targetAccountId = preserveSelection
    ? toText(preferredAccountId || state.selectedUsageAccountId)
    : ''

  if (!targetAccountId || !state.usageViewSummaries.some((item) => item.accountId === targetAccountId)) {
    state.selectedUsageAccountId = state.usageViewSummaries[0] ? state.usageViewSummaries[0].accountId : ''
    return
  }
  state.selectedUsageAccountId = targetAccountId
}

function applyGlobalUsageResult(result = {}) {
  state.globalUsageSummaries = Array.isArray(result.usageSummaries) ? result.usageSummaries : []
  state.globalUsageLedger = Array.isArray(result.usageLedger) ? result.usageLedger : []
  if (Array.isArray(result.plans) && result.plans.length) {
    state.plans = result.plans
  }
  state.globalUsageReport = normalizeUsageReportForUi(result.report || {}, {
    summaries: state.globalUsageSummaries,
    ledger: state.globalUsageLedger,
    usageType: getGlobalUsageActiveType(),
    fallbackTotal: Array.isArray(state.globalUsageLedger) ? state.globalUsageLedger.length : 0,
    fallbackPageSize: state.globalUsagePageSize
  })
  state.globalUsagePageInfo = normalizeUsagePageInfo(
    result.pageInfo || (state.globalUsageReport && state.globalUsageReport.pageInfo) || {},
    state.globalUsageReport && state.globalUsageReport.pageInfo
      ? state.globalUsageReport.pageInfo.total
      : (Array.isArray(state.globalUsageLedger) ? state.globalUsageLedger.length : 0),
    state.globalUsagePageSize
  )
  state.globalUsagePage = state.globalUsagePageInfo.page
}

function applyOverviewUsageReportResult(result = {}) {
  state.overviewUsageReport = normalizeUsageReportForUi(result.report || {}, {
    summaries: Array.isArray(result.usageSummaries) ? result.usageSummaries : [],
    ledger: Array.isArray(result.usageLedger) ? result.usageLedger : [],
    usageType: 'all',
    fallbackTotal: Array.isArray(result.usageLedger) ? result.usageLedger.length : 0,
    fallbackPageSize: 1
  })
}

function applyReferralResult(result = {}) {
  state.referralItems = Array.isArray(result.referrals) ? result.referrals : []
  state.referralStats = result.stats && typeof result.stats === 'object'
    ? result.stats
    : buildLocalReferralStats(state.referralItems)
  if (!state.referralItems.some((item) => item.relationId === state.selectedReferralId)) {
    state.selectedReferralId = state.referralItems[0] ? state.referralItems[0].relationId : ''
  }
}

function applyLegalDocumentDetail(document) {
  const detail = document ? normalizeLegalDocumentDetailForUi(document) : null
  state.legalDocumentDetail = detail
  state.legalDocumentDraft = detail ? createLegalDraftFromDetail(detail) : buildEmptyLegalDocumentDraft()
  if (detail && detail.htmlSnapshot) {
    state.legalDocumentPreview = {
      html: detail.htmlSnapshot,
      plainText: toText(detail.plainTextSnapshot),
      generatedAt: toText(detail.publishedAt || detail.updatedAt),
      source: detail.status === 'published' ? 'published' : 'snapshot'
    }
  } else {
    state.legalDocumentPreview = createEmptyLegalPreviewState()
  }
}

async function refreshLegalDocumentDetail(options = {}) {
  const docId = toText(options.docId || state.selectedLegalDocumentId)
  const renderOnFinish = options.renderOnFinish !== false
  if (!supportsLegalDocumentAdmin()) {
    return
  }
  if (!docId) {
    state.selectedLegalDocumentId = ''
    applyLegalDocumentDetail(null)
    if (renderOnFinish) {
      render()
    }
    return
  }

  state.runtime.legalDocumentDetailLoading = true
  if (renderOnFinish) {
    render()
  }

  try {
    const result = await provider.getLegalDocumentDetail({ docId })
    state.selectedLegalDocumentId = docId
    applyLegalDocumentDetail(result.document || null)
  } catch (error) {
    setNotice(error.message || '读取协议详情失败，请稍后重试。', 'danger')
  } finally {
    state.runtime.legalDocumentDetailLoading = false
    if (renderOnFinish) {
      render()
    }
  }
}

async function refreshLegalDocumentsData(options = {}) {
  const preserveSelection = options.preserveSelection !== false
  const preferredDocId = toText(options.preferredDocId || state.selectedLegalDocumentId)
  const renderOnFinish = options.renderOnFinish !== false
  if (!supportsLegalDocumentAdmin()) {
    return
  }

  state.runtime.legalDocumentsLoading = true
  if (renderOnFinish) {
    render()
  }

  try {
    const result = await provider.listLegalDocuments(buildLegalDocumentFetchPayload())
    state.legalDocuments = Array.isArray(result.documents) ? result.documents : []
    const nextSelectedDocId = preserveSelection && preferredDocId && state.legalDocuments.some((item) => item.docId === preferredDocId)
      ? preferredDocId
      : (state.legalDocuments[0] ? state.legalDocuments[0].docId : '')
    state.selectedLegalDocumentId = nextSelectedDocId

    if (!nextSelectedDocId) {
      applyLegalDocumentDetail(null)
      return
    }

    const shouldReloadDetail = options.forceDetailReload === true
      || !state.legalDocumentDetail
      || toText(state.legalDocumentDetail.docId) !== nextSelectedDocId
    if (shouldReloadDetail) {
      await refreshLegalDocumentDetail({
        docId: nextSelectedDocId,
        renderOnFinish: false
      })
    }
  } catch (error) {
    setNotice(error.message || '刷新协议中心失败，请稍后重试。', 'danger')
  } finally {
    state.runtime.legalDocumentsLoading = false
    if (renderOnFinish) {
      render()
    }
  }
}

async function refreshUsageViewData(options = {}) {
  const preserveSelection = options.preserveSelection !== false
  const preferredAccountId = toText(options.preferredAccountId || state.selectedUsageAccountId)
  const renderOnFinish = options.renderOnFinish !== false
  if (!supportsRemoteUsageFetch()) {
    return
  }

  const requestSeq = Number(state.runtime.usageRequestSeq || 0) + 1
  state.runtime.usageRequestSeq = requestSeq
  state.runtime.usageLoading = true

  try {
    const result = await provider.fetchUsage(buildUsageFetchPayload())
    if (state.runtime.usageRequestSeq !== requestSeq) {
      return
    }
    applyUsageViewResult(result, preserveSelection, preferredAccountId)
    state.runtime.lastSyncAt = formatDateTimeText(new Date())
  } catch (error) {
    if (state.runtime.usageRequestSeq === requestSeq) {
      setNotice(error.message || '刷新账户与流水数据失败，请稍后重试。', 'danger')
    }
  } finally {
    if (state.runtime.usageRequestSeq === requestSeq) {
      state.runtime.usageLoading = false
      if (renderOnFinish) {
        render()
      }
    }
  }
}

async function refreshGlobalUsageData(options = {}) {
  const renderOnFinish = options.renderOnFinish !== false
  if (!supportsRemoteUsageFetch()) {
    return
  }

  const requestSeq = Number(state.runtime.globalUsageRequestSeq || 0) + 1
  state.runtime.globalUsageRequestSeq = requestSeq
  state.runtime.globalUsageLoading = true

  try {
    const result = await provider.fetchUsage(buildGlobalUsageFetchPayload())
    if (state.runtime.globalUsageRequestSeq !== requestSeq) {
      return
    }
    applyGlobalUsageResult(result)
    state.runtime.lastSyncAt = formatDateTimeText(new Date())
  } catch (error) {
    if (state.runtime.globalUsageRequestSeq === requestSeq) {
      setNotice(error.message || '刷新全局流水失败，请稍后重试。', 'danger')
    }
  } finally {
    if (state.runtime.globalUsageRequestSeq === requestSeq) {
      state.runtime.globalUsageLoading = false
      if (renderOnFinish) {
        render()
      }
    }
  }
}

async function refreshManualAdjustmentRecords(options = {}) {
  const renderOnFinish = options.renderOnFinish !== false
  if (!supportsManualAdjustmentFetch()) {
    return
  }

  try {
    const payload = {
      limit: 200
    }
    if (state.adjustmentRecordScope === 'selected' && toText(state.selectedAccountId)) {
      payload.accountId = toText(state.selectedAccountId)
    }
    if (toText(state.adjustmentRecordSearch)) {
      payload.keyword = toText(state.adjustmentRecordSearch)
    }
    const result = await provider.fetchManualAdjustments(payload)
    state.manualAdjustmentLogs = Array.isArray(result.logs) ? result.logs : []
  } catch (error) {
    setNotice(error.message || '刷新人工调整记录失败，请稍后重试。', 'danger')
  } finally {
    if (renderOnFinish) {
      render()
    }
  }
}

async function refreshOverviewUsageReport(options = {}) {
  const renderOnFinish = options.renderOnFinish !== false
  if (!supportsRemoteUsageFetch()) {
    const recentLedger = getLedgerByTimeWindow(state.usageLedger, 'last_30d')
    state.overviewUsageReport = buildUsageReportFromLocalData({
      summaries: state.usageSummaries,
      ledger: recentLedger,
      usageType: 'all',
      pageInfo: {
        page: 1,
        pageSize: 1,
        total: recentLedger.length,
        totalPages: 1,
        hasPrev: false,
        hasNext: false,
        returned: 0
      },
      scope: {
        timeWindow: 'last_30d'
      }
    })
    if (renderOnFinish) {
      render()
    }
    return
  }

  const requestSeq = Number(state.runtime.overviewUsageRequestSeq || 0) + 1
  state.runtime.overviewUsageRequestSeq = requestSeq
  state.runtime.overviewUsageLoading = true

  try {
    const result = await provider.fetchUsage(buildOverviewUsageFetchPayload())
    if (state.runtime.overviewUsageRequestSeq !== requestSeq) {
      return
    }
    applyOverviewUsageReportResult(result)
    state.runtime.lastSyncAt = formatDateTimeText(new Date())
  } catch (error) {
    if (state.runtime.overviewUsageRequestSeq === requestSeq) {
      setNotice(error.message || '刷新运营报表失败，请稍后重试。', 'danger')
    }
  } finally {
    if (state.runtime.overviewUsageRequestSeq === requestSeq) {
      state.runtime.overviewUsageLoading = false
      if (renderOnFinish) {
        render()
      }
    }
  }
}

function scheduleUsageViewRefresh(options = {}) {
  if (!supportsRemoteUsageFetch()) {
    renderUsage()
    return
  }

  const debounceMs = Math.max(0, Math.floor(toNumber(options.debounceMs, 0)))
  if (usageViewRefreshTimer) {
    clearTimeout(usageViewRefreshTimer)
    usageViewRefreshTimer = null
  }

  const run = () => {
    usageViewRefreshTimer = null
    refreshUsageViewData({
      preserveSelection: options.preserveSelection !== false,
      preferredAccountId: toText(options.preferredAccountId || state.selectedUsageAccountId)
    })
  }

  if (debounceMs > 0) {
    usageViewRefreshTimer = setTimeout(run, debounceMs)
    return
  }
  run()
}

function scheduleGlobalUsageRefresh(options = {}) {
  if (!supportsRemoteUsageFetch()) {
    renderGlobalUsage()
    return
  }

  const debounceMs = Math.max(0, Math.floor(toNumber(options.debounceMs, 0)))
  if (globalUsageRefreshTimer) {
    clearTimeout(globalUsageRefreshTimer)
    globalUsageRefreshTimer = null
  }

  const run = () => {
    globalUsageRefreshTimer = null
    refreshGlobalUsageData()
  }

  if (debounceMs > 0) {
    globalUsageRefreshTimer = setTimeout(run, debounceMs)
    return
  }
  run()
}

async function refreshData(options = {}) {
  const preserveSelection = options.preserveSelection !== false
  const previousSelectedUsageAccountId = toText(state.selectedUsageAccountId)

  if (state.runtime.providerMode === 'cloud' && !state.runtime.authenticated) {
    state.runtime.loading = false
    render()
    return
  }

  state.runtime.loading = true
  render()

  try {
    const result = await provider.refreshAll()
    let aiModelConfigResult = null
    try {
      aiModelConfigResult = await provider.getAiModelConfig()
    } catch (error) {
      setNotice(`AI 模型配置中心未就绪：${error.message || '请先部署 adminGetAiModelConfig / adminUpdateAiModelConfig'}`, 'danger')
    }
    state.accounts = Array.isArray(result.accounts) ? result.accounts : []
    state.orders = Array.isArray(result.orders) ? result.orders : []
    state.feedbackItems = Array.isArray(result.feedbackItems) ? result.feedbackItems : []
    state.referralItems = Array.isArray(result.referralItems) ? result.referralItems : []
    state.referralStats = result.referralStats && typeof result.referralStats === 'object'
      ? result.referralStats
      : buildLocalReferralStats(state.referralItems)
    state.usageSummaries = Array.isArray(result.usageSummaries) ? result.usageSummaries : []
    state.usageLedger = Array.isArray(result.usageLedger) ? result.usageLedger : []
    state.usageViewSummaries = Array.isArray(result.usageSummaries) ? result.usageSummaries : []
    state.usageViewLedger = Array.isArray(result.usageLedger) ? result.usageLedger : []
    state.globalUsageSummaries = Array.isArray(result.usageSummaries) ? result.usageSummaries : []
    state.globalUsageLedger = Array.isArray(result.usageLedger) ? result.usageLedger : []
    state.overviewUsageReport = buildUsageReportFromLocalData({
      summaries: state.usageSummaries,
      ledger: getLedgerByTimeWindow(state.usageLedger, 'last_30d'),
      usageType: 'all',
      pageInfo: {
        page: 1,
        pageSize: 1,
        total: getLedgerByTimeWindow(state.usageLedger, 'last_30d').length,
        totalPages: 1,
        hasPrev: false,
        hasNext: false,
        returned: 0
      },
      scope: {
        timeWindow: 'last_30d'
      }
    })
    state.globalUsageReport = normalizeUsageReportForUi({}, {
      summaries: state.globalUsageSummaries,
      ledger: state.globalUsageLedger,
      usageType: getGlobalUsageActiveType(),
      fallbackTotal: state.globalUsageLedger.length,
      fallbackPageSize: state.globalUsagePageSize
    })
    state.globalUsagePageInfo = normalizeUsagePageInfo({}, state.globalUsageLedger.length, state.globalUsagePageSize)
  state.plans = Array.isArray(result.plans) ? result.plans : []
  state.aiModelConfig = normalizeAiModelConfig(aiModelConfigResult && aiModelConfigResult.config)
  state.auditLogs = Array.isArray(result.auditLogs) ? result.auditLogs : []
  state.manualAdjustmentLogs = Array.isArray(result.manualAdjustmentLogs)
    ? result.manualAdjustmentLogs
    : state.auditLogs.filter((item) => item.targetType === 'account' && isManualAdjustmentAction(item.actionType))
  state.runtime.sourceLabel = toText(result.sourceLabel) || state.runtime.sourceLabel
    state.runtime.supportsReset = Boolean(result.supportsReset)
    state.runtime.lastSyncAt = formatDateTimeText(new Date())

    if (!preserveSelection || !state.accounts.some((item) => item.accountId === state.selectedAccountId)) {
      state.selectedAccountId = state.accounts[0] ? state.accounts[0].accountId : ''
    }
    if (!preserveSelection || !state.orders.some((item) => item.orderId === state.selectedOrderId)) {
      state.selectedOrderId = state.orders[0] ? state.orders[0].orderId : ''
    }
    if (!preserveSelection || !state.feedbackItems.some((item) => item.feedbackId === state.selectedFeedbackId)) {
      state.selectedFeedbackId = state.feedbackItems[0] ? state.feedbackItems[0].feedbackId : ''
    }
    if (!preserveSelection || !state.referralItems.some((item) => item.relationId === state.selectedReferralId)) {
      state.selectedReferralId = state.referralItems[0] ? state.referralItems[0].relationId : ''
    }
    if (!preserveSelection || !state.usageSummaries.some((item) => item.accountId === state.selectedUsageAccountId)) {
      state.selectedUsageAccountId = state.usageSummaries[0] ? state.usageSummaries[0].accountId : ''
    }

    if (supportsRemoteUsageFetch()) {
      const followUpTasks = []
      if (hasUsageServerFilter()) {
        followUpTasks.push(refreshUsageViewData({
          preserveSelection,
          preferredAccountId: previousSelectedUsageAccountId,
          renderOnFinish: false
        }))
      }
      followUpTasks.push(refreshGlobalUsageData({
        renderOnFinish: false
      }))
      followUpTasks.push(refreshOverviewUsageReport({
        renderOnFinish: false
      }))
      followUpTasks.push(refreshManualAdjustmentRecords({
        renderOnFinish: false
      }))
      if (followUpTasks.length) {
        await Promise.all(followUpTasks)
      }
    }
    if (provider.fetchFeedback) {
      await refreshFeedbackData({
        preserveSelection,
        renderOnFinish: false
      })
    }
    if (provider.fetchReferrals) {
      await refreshReferralData({
        renderOnFinish: false
      })
    }
    if (supportsLegalDocumentAdmin()) {
      await refreshLegalDocumentsData({
        preserveSelection,
        preferredDocId: state.selectedLegalDocumentId,
        renderOnFinish: false
      })
    }
  } catch (error) {
    if (error.statusCode === 401 || error.code === 'ADMIN_AUTH_REQUIRED') {
      state.runtime.authenticated = false
      state.runtime.authUser = ''
      setNotice('登录状态已失效，请重新登录。', 'danger')
    } else {
      setNotice(error.message || '刷新数据失败，请检查桥接配置。', 'danger')
    }
  } finally {
    state.runtime.loading = false
    render()
  }
}

function getSelectedAccount() {
  return state.accounts.find((item) => item.accountId === state.selectedAccountId) || null
}

function getSelectedOrder() {
  return state.orders.find((item) => item.orderId === state.selectedOrderId) || null
}

function getPlanByCode(planCode = '') {
  const current = toText(planCode)
  if (!current) {
    return null
  }
  return state.plans.find((item) => item.planCode === current) || null
}

function getSelectedUsageSummary() {
  return state.usageViewSummaries.find((item) => item.accountId === state.selectedUsageAccountId) || null
}

function accountMatches(account, keyword, statusFilter) {
  const currentKeyword = toText(keyword).toLowerCase()
  if (statusFilter !== 'all' && account.status !== statusFilter) {
    return false
  }
  if (!currentKeyword) {
    return true
  }
  return [
    account.accountId,
    account.phone,
    account.wechatNickname,
    account.customDisplayName,
    account.displayName,
    account.status,
    account.currentAccessLevel
  ].some((field) => toText(field).toLowerCase().includes(currentKeyword))
}

function orderMatches(order, keyword, statusFilter, readinessFilter) {
  const currentKeyword = toText(keyword).toLowerCase()
  if (statusFilter !== 'all' && order.status !== statusFilter) {
    return false
  }
  if (readinessFilter !== 'all' && order.readiness !== readinessFilter) {
    return false
  }
  if (!currentKeyword) {
    return true
  }
  return [
    order.orderId,
    order.accountId,
    order.phone,
    order.title,
    order.sourceReason
  ].some((field) => toText(field).toLowerCase().includes(currentKeyword))
}

function auditMatches(log, keyword) {
  const currentKeyword = toText(keyword).toLowerCase()
  if (!currentKeyword) {
    return true
  }
  return [
    log.operatorId,
    log.actionType,
    log.targetId,
    log.reason
  ].some((field) => toText(field).toLowerCase().includes(currentKeyword))
}

function getFeedbackStatusLabel(status = '') {
  return {
    pending: '待处理',
    accepted: '已采纳',
    rewarded: '已发奖',
    rejected: '不采纳',
    closed: '已关闭'
  }[toText(status)] || toText(status) || '待处理'
}

function getFeedbackStatusBadgeClass(status = '') {
  const current = toText(status)
  if (current === 'rewarded') {
    return 'is-success'
  }
  if (current === 'accepted') {
    return 'is-brand'
  }
  if (current === 'rejected' || current === 'closed') {
    return 'is-neutral'
  }
  return 'is-soft'
}

function getReferralStatusLabel(status = '') {
  return {
    pending: '待首个项目',
    rewarded: '已奖励',
    blocked: '已阻止'
  }[toText(status)] || toText(status || 'pending')
}

function getReferralSourceTypeLabel(sourceType = '') {
  return {
    referral_code: '推荐码',
    share_material: '分享资料',
    project_handover: '外发项目'
  }[toText(sourceType)] || '推荐码'
}

function getReferralStatusBadgeClass(status = '') {
  const current = toText(status)
  if (current === 'rewarded') {
    return 'is-success'
  }
  if (current === 'blocked') {
    return 'is-danger'
  }
  return 'is-soft'
}

function getReferralBlockReasonLabel(reason = '', item = {}) {
  const current = toText(reason)
  const label = {
    invitee_already_used_project_feature: '被推荐人已使用过项目功能，不符合新用户推荐条件',
    self_referral_or_missing_referrer: '推荐关系无效：推荐人与被推荐人相同或推荐人缺失',
    invalid_relation: '推荐关系无效，已跳过奖励',
    not_first_project: '被推荐人不是首次创建项目，未触发奖励',
    reward_failed: '奖励发放失败，需检查额度流水'
  }[current]

  if (label) {
    return label
  }

  if (current) {
    return current
  }

  if (item && item.status === 'blocked') {
    if (item.referrerAccountId && item.inviteeAccountId && item.referrerAccountId === item.inviteeAccountId) {
      return '推荐人与被推荐人为同一账户'
    }
    if (Array.isArray(item.anomalyLabels) && item.anomalyLabels.length) {
      return item.anomalyLabels.join(' · ')
    }
    return '未记录阻止原因，请检查 referralRelations.blockReason'
  }

  return ''
}

function getReferralLedgerStatusLabel(status = '') {
  return {
    complete: '流水完整',
    missing: '流水缺失',
    not_required: '未触发奖励'
  }[toText(status)] || '未触发奖励'
}

function feedbackMatches(item, keyword, statusFilter) {
  const currentKeyword = toText(keyword).toLowerCase()
  const currentStatus = toText(statusFilter || 'all')
  if (currentStatus !== 'all' && item.status !== currentStatus) {
    return false
  }
  if (!currentKeyword) {
    return true
  }
  return [
    item.feedbackId,
    item.accountId,
    item.phoneMasked,
    item.displayName,
    item.typeLabel,
    item.sceneLabel,
    item.content,
    item.contact,
    item.adminNote
  ].some((field) => toText(field).toLowerCase().includes(currentKeyword))
}

function referralMatches(item, keyword, statusFilter, timeWindow) {
  const currentKeyword = toText(keyword).toLowerCase()
  const currentStatus = toText(statusFilter || 'all')
  if (currentStatus !== 'all' && item.status !== currentStatus) {
    return false
  }
  if (!isUsageWithinTimeWindow({
    occurredAt: item.rewardedAt || item.boundAt || item.createdAt
  }, timeWindow || 'all')) {
    return false
  }
  if (!currentKeyword) {
    return true
  }
  return [
    item.relationId,
    item.referrerCode,
    item.sourceType,
    item.sourceTypeLabel,
    item.sourceId,
    item.sourceProjectId,
    item.referrerAccountId,
    item.inviteeAccountId,
    item.referrerAccount && item.referrerAccount.displayName,
    item.referrerAccount && item.referrerAccount.phone,
    item.inviteeAccount && item.inviteeAccount.displayName,
    item.inviteeAccount && item.inviteeAccount.phone,
    item.statusLabel,
    item.blockReason,
    getReferralBlockReasonLabel(item.blockReason, item),
    item.qualifiedProjectName,
    item.qualifiedProjectId,
    item.anomalyLabels.join(' ')
  ].some((field) => toText(field).toLowerCase().includes(currentKeyword))
}

function buildLocalReferralStats(referrals = []) {
  const items = Array.isArray(referrals) ? referrals : []
  const rewarded = items.filter((item) => item.status === 'rewarded')
  return {
    totalCount: items.length,
    pendingCount: items.filter((item) => item.status === 'pending').length,
    rewardedCount: rewarded.length,
    blockedCount: items.filter((item) => item.status === 'blocked').length,
    ledgerGrantedAiTokens: rewarded.reduce((total, item) => total + Math.max(0, toNumber(item.rewardAiTokens, 0)) * 2, 0),
    missingLedgerCount: rewarded.filter((item) => item.ledgerStatus === 'missing').length
  }
}

function getSelectedFeedback() {
  return state.feedbackItems.find((item) => item.feedbackId === state.selectedFeedbackId) || null
}

function getSelectedReferral() {
  return state.referralItems.find((item) => item.relationId === state.selectedReferralId) || null
}

function getAccountById(accountId = '') {
  const currentAccountId = toText(accountId)
  if (!currentAccountId) {
    return null
  }
  return state.accounts.find((item) => item.accountId === currentAccountId) || null
}

function getAccountLabelById(accountId = '') {
  const account = getAccountById(accountId)
  return account ? getAccountPrimaryPhone(account) : toText(accountId)
}

function getManualAdjustmentLogs() {
  const selectedAccountId = toText(state.selectedAccountId)
  const keyword = toText(state.adjustmentRecordSearch).toLowerCase()
  const sourceLogs = state.manualAdjustmentLogs.length
    ? state.manualAdjustmentLogs
    : state.auditLogs.filter((item) => item.targetType === 'account' && isManualAdjustmentAction(item.actionType))

  return sourceLogs
    .filter((item) => {
      if (state.adjustmentRecordScope !== 'selected') {
        return true
      }
      return Boolean(selectedAccountId) && item.targetId === selectedAccountId
    })
    .filter((item) => {
      if (!keyword) {
        return true
      }
      const account = getAccountById(item.targetId) || {}
      return [
        item.createdAt,
        item.operatorId,
        item.actionType,
        getActionLabel(item.actionType),
        item.targetId,
        account.phone,
        account.wechatNickname,
        account.customDisplayName,
        account.displayName,
        item.reason
      ].some((field) => toText(field).toLowerCase().includes(keyword))
    })
}

function usageMatches(summary, keyword, usageTypeFilter) {
  const currentKeyword = toText(keyword).toLowerCase()
  if (usageTypeFilter === 'voice_seconds' && summary.voiceSecondsTotal <= 0 && summary.voiceSecondsRemaining <= 0) {
    return false
  }
  if (usageTypeFilter === 'ai_tokens' && summary.aiTokensTotal <= 0 && summary.aiTokensRemaining <= 0) {
    return false
  }
  if (!currentKeyword) {
    return true
  }

  return [
    summary.accountId,
    summary.phone,
    summary.wechatNickname,
    summary.customDisplayName,
    summary.displayName,
    summary.status,
    summary.currentAccessLevel,
    summary.latestSubscription.planCode,
    summary.latestSubscription.planName
  ].some((field) => toText(field).toLowerCase().includes(currentKeyword))
}

function render() {
  renderAuthGate()
  renderHeader()
  renderOverview()
  renderAccounts()
  renderOrders()
  renderFeedback()
  renderReferrals()
  renderUsage()
  renderGlobalUsage()
  renderLegalDocuments()
  renderAiConfig()
  renderAudit()
  renderToast()
}

function renderHeader() {
  const meta = VIEW_META[state.currentView] || VIEW_META.overview
  if (!VIEW_META[state.currentView]) {
    state.currentView = 'overview'
  }
  const billingActive = isBillingView(state.currentView)
  const billingExpanded = billingActive || Boolean(state.sidebarGroups && state.sidebarGroups.billing)
  document.getElementById('pageTitle').textContent = meta.title
  document.getElementById('pageDesc').textContent = meta.desc

  document.querySelectorAll('.nav-item').forEach((item) => {
    const view = toText(item.dataset.view)
    const isBillingParent = item.id === 'billingNavParent'
    item.classList.toggle('is-active', isBillingParent ? billingActive : view === state.currentView)
  })

  document.querySelectorAll('.nav-subitem').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.view === state.currentView)
  })

  document.querySelectorAll('.view').forEach((item) => {
    item.classList.toggle('is-active', item.id === `${state.currentView}View`)
  })

  const modeBadge = document.getElementById('modeBadge')
  const syncMeta = document.getElementById('syncMeta')
  const resetBtn = document.getElementById('resetStateBtn')
  const refreshBtn = document.getElementById('refreshDataBtn')
  const sidebarStatusCopy = document.getElementById('sidebarStatusCopy')
  const runtimeNotice = document.getElementById('runtimeNotice')
  const buildStamp = document.getElementById('buildStamp')
  const billingNavGroup = document.getElementById('billingNavGroup')
  const billingNavToggle = document.getElementById('billingNavToggle')
  const billingOverviewCount = document.getElementById('billingOverviewCount')
  const billingGlobalUsageCount = document.getElementById('billingGlobalUsageCount')
  const billingAccountsCount = document.getElementById('billingAccountsCount')
  const billingPlansCount = document.getElementById('billingPlansCount')

  if (buildStamp) {
    buildStamp.textContent = `Build ${APP_BUILD_ID}`
  }

  if (billingNavGroup) {
    billingNavGroup.classList.toggle('is-active', billingActive)
    billingNavGroup.classList.toggle('is-expanded', billingExpanded)
  }
  if (billingNavToggle) {
    billingNavToggle.setAttribute('aria-expanded', billingExpanded ? 'true' : 'false')
  }
  if (billingOverviewCount) {
    const lowBalanceCount = state.usageSummaries.filter((item) => {
      return toNumber(item.voiceSecondsRemaining, 0) <= LOW_VOICE_ALERT_THRESHOLD
        || toNumber(item.aiTokensRemaining, 0) <= LOW_AI_ALERT_THRESHOLD
    }).length
    billingOverviewCount.textContent = `${lowBalanceCount}`
  }
  if (billingGlobalUsageCount) {
    const globalTotal = state.globalUsagePageInfo && Number.isFinite(Number(state.globalUsagePageInfo.total))
      ? state.globalUsagePageInfo.total
      : state.usageLedger.length
    billingGlobalUsageCount.textContent = `${globalTotal}`
  }
  if (billingAccountsCount) {
    billingAccountsCount.textContent = `${state.usageSummaries.length}`
  }
  if (billingPlansCount) {
    billingPlansCount.textContent = `${state.plans.filter((item) => item.enabled).length}`
  }

  modeBadge.textContent = state.runtime.providerMode === 'cloud' ? '云端后台' : '本地 Mock'
  syncMeta.textContent = state.runtime.loading
    ? '正在同步数据...'
    : (state.runtime.lastSyncAt ? `最近同步：${state.runtime.lastSyncAt}` : '尚未同步')

  resetBtn.hidden = !state.runtime.supportsReset
  refreshBtn.disabled = state.runtime.loading
  resetBtn.disabled = state.runtime.loading

  sidebarStatusCopy.textContent = state.runtime.providerMode === 'cloud'
    ? `当前通过同源后台服务读取管理云函数。管理员：${state.runtime.authUser || '未登录'}；云密钥与 operatorKey 仅保存在服务端。`
    : '当前使用本地演示数据。切到 Cloud 模式后，页面交互层会直接复用到真实后台链路。'

  if (state.runtime.noticeText) {
    runtimeNotice.hidden = false
    runtimeNotice.className = `runtime-note is-${state.runtime.noticeTone}`
    runtimeNotice.textContent = state.runtime.noticeText
  } else if (state.runtime.providerMode === 'cloud' && state.runtime.authenticated && (!state.runtime.cloudInvokeReady || !state.runtime.operatorConfigured)) {
    runtimeNotice.hidden = false
    runtimeNotice.className = 'runtime-note is-danger'
    runtimeNotice.textContent = '服务端配置未完整：请在 admin-web-bridge/.env.local 中配置 CLOUDBASE_SECRET_ID / CLOUDBASE_SECRET_KEY / ADMIN_OPERATOR_KEY。'
  } else if (state.runtime.providerMode === 'cloud' && !state.runtime.loading && !state.accounts.length) {
    runtimeNotice.hidden = false
    runtimeNotice.className = 'runtime-note'
    runtimeNotice.textContent = '当前云端链路已接通，但账户数据仍为空。请先进入一次小程序主流程，触发 resolveAccount 和 getEntitlements 写入真实账号数据。'
  } else {
    runtimeNotice.hidden = true
    runtimeNotice.className = 'runtime-note'
    runtimeNotice.textContent = ''
  }
}

function renderOverview() {
  const unboundCount = state.accounts.filter((item) => item.bindRequiredForWrite || !item.phoneVerified).length
  const blockedProjectCount = state.accounts.filter((item) => !item.canCreateProject).length
  const pendingOrderCount = state.orders.filter((item) => item.status === 'pending').length
  const auditCount = state.auditLogs.length
  const paidAccountCount = state.accounts.filter((item) => item.status === 'active_paid').length
  const readyOrderCount = state.orders.filter((item) => item.readiness === 'ready').length
  const riskAccounts = buildOverviewRiskAccounts()
  const pendingOrders = buildOverviewPendingOrders()
  const usageReport = state.overviewUsageReport && typeof state.overviewUsageReport === 'object'
    ? state.overviewUsageReport
    : buildUsageReportFromLocalData({
      summaries: state.usageSummaries,
      ledger: state.usageLedger,
      usageType: 'all',
      pageInfo: state.globalUsagePageInfo
    })
  const usageStats = usageReport.stats && typeof usageReport.stats === 'object'
    ? usageReport.stats
    : buildUsageLedgerStats(state.usageLedger)
  const aiEventStats = getUsageEventStatsByType(usageReport, 'ai_tokens')
  const voiceEventStats = getUsageEventStatsByType(usageReport, 'voice_seconds')
  const trendItems = Array.isArray(usageReport.dailyStats) ? usageReport.dailyStats.slice(0, 7) : []
  const hotspotItems = []
  ;(Array.isArray(usageReport.routeStats) ? usageReport.routeStats.slice(0, 2) : []).forEach((item) => {
    hotspotItems.push({
      title: item.routeLabel || getUsageRouteLabel(item.routeKey),
      meta: item.providerLabel && item.model ? `${item.providerLabel} · ${item.model}` : 'AI 路由效果',
      value: `${formatPercentText(item.successRate)} 成功`,
      desc: `共 ${item.totalEvents || 0} 次 · fallback ${item.fallbackCount || 0} 次 · 均耗时 ${formatDurationMsText(item.avgDurationMs)}`
    })
  })
  ;(Array.isArray(usageReport.sourceStats) ? usageReport.sourceStats.slice(0, 3) : []).forEach((item) => {
    hotspotItems.push({
      title: item.sourceLabel || item.sourceType || '未知场景',
      meta: '业务场景',
      value: `AI ${formatAiQuotaText(item.consumeAiTokens)} · 语音 ${formatVoiceQuotaText(item.consumeVoiceSeconds)}`,
      desc: `消耗 ${item.consumeCount || 0} 条 · 回补 ${item.grantCount || 0} 条`
    })
  })
  ;(Array.isArray(usageReport.modelStats) ? usageReport.modelStats.slice(0, 2) : []).forEach((item) => {
    hotspotItems.push({
      title: item.model || '未识别模型',
      meta: item.providerLabel || item.providerKey || '模型热点',
      value: formatAiQuotaText(item.consumeAiTokens),
      desc: `模型消耗 ${item.consumeCount || 0} 条`
    })
  })
  ;(Array.isArray(usageReport.accountStats) ? usageReport.accountStats.slice(0, 2) : []).forEach((item) => {
    hotspotItems.push({
      title: item.phone || item.accountId || '未识别账户',
      meta: item.displayName || item.accountId || '',
      value: `AI ${formatAiQuotaText(item.consumeAiTokens)} · 语音 ${formatVoiceQuotaText(item.consumeVoiceSeconds)}`,
      desc: `账户消耗 ${item.consumeCount || 0} 条`
    })
  })

  document.getElementById('overviewStats').innerHTML = [
    {
      label: '账户总数',
      value: state.accounts.length,
      note: '当前可查看到的账户总量'
    },
    {
      label: '待绑定手机号',
      value: unboundCount,
      note: '会影响正式写入和后续付费承接'
    },
    {
      label: '付费有效账户',
      value: paidAccountCount,
      note: pendingOrderCount > 0 ? `当前还有 ${pendingOrderCount} 笔待支付订单可继续推进` : '当前已到账用户会优先体现在这里'
    },
    {
      label: '受限账户',
      value: blockedProjectCount,
      note: '项目数上限、只读、禁用或绑定缺失都会进入运营关注范围'
    },
    {
      label: '支付可继续',
      value: readyOrderCount,
      note: auditCount > 0 ? `审计日志已有 ${auditCount} 条，可继续复核后台动作` : '当前还没有审计记录，建议做一次人工动作验证'
    }
  ].map((item) => `
    <article class="stat-card">
      <div class="stat-label">${escapeHtml(item.label)}</div>
      <div class="stat-value">${escapeHtml(item.value)}</div>
      <div class="stat-note">${escapeHtml(item.note)}</div>
    </article>
  `).join('')

  document.getElementById('overviewQueueWrap').innerHTML = renderOverviewCardList(
    buildOverviewQueueItems().map((item) => ({
      title: item.title,
      value: item.value,
      desc: item.desc
    })),
    {
      emptyText: '当前还没有可展示的处理队列。'
    }
  )

  document.getElementById('overviewActionsWrap').innerHTML = renderOverviewCardList(
    buildOverviewActionItems().map((item) => ({
      title: item,
      desc: '首页建议会随账户、订单和审计状态实时变化。'
    })),
    {
      emptyText: '当前还没有生成动作建议。'
    }
  )

  document.getElementById('overviewRiskAccountsWrap').innerHTML = renderOverviewCardList(
    riskAccounts.map((item) => ({
      title: item.accountId,
      meta: `${getStatusLabel(item.status)} · ${getAccessLabel(item.currentAccessLevel)}`,
      value: item.phone || '未绑定手机号',
      desc: item.notes || item.reasonSummary || '当前无额外备注。',
      badgeMarkup: `<span class="badge ${getStatusBadgeClass(item.status)}">${escapeHtml(getStatusLabel(item.status))}</span>`
    })),
    {
      emptyText: '当前没有高风险账户，说明账户状态整体较稳定。'
    }
  )

  document.getElementById('overviewPendingOrdersWrap').innerHTML = renderOverviewCardList(
    pendingOrders.map((item) => ({
      title: item.orderId,
      meta: `${item.title} · ${item.amountText}`,
      value: getReasonLabel(item.sourceReason),
      desc: item.pendingReason || '当前无更多支付准备说明。',
      badgeMarkup: `<span class="badge ${getReadinessBadgeClass(item.readiness)}">${escapeHtml(getReadinessLabel(item.readiness))}</span>`
    })),
    {
      emptyText: '当前没有待支付订单，首页支付队列已清空。'
    }
  )

  document.getElementById('overviewUsageSummaryWrap').innerHTML = [
    {
      label: '近 30 天 AI 消耗',
      value: formatAiQuotaText(usageStats.consumeAiTokens),
      note: `涉及 ${usageStats.consumeCount} 条成功消耗流水`
    },
    {
      label: '近 30 天语音消耗',
      value: formatVoiceQuotaText(usageStats.consumeVoiceSeconds),
      note: `回补 ${formatVoiceQuotaText(usageStats.grantVoiceSeconds)}`
    },
    {
      label: 'AI 调用成功率',
      value: formatPercentText(aiEventStats.successRate),
      note: `成功 ${aiEventStats.successCount || 0} 次 · 失败 ${aiEventStats.failedCount || 0} 次`
    },
    {
      label: '语音调用成功率',
      value: formatPercentText(voiceEventStats.successRate),
      note: `成功 ${voiceEventStats.successCount || 0} 次 · 失败 ${voiceEventStats.failedCount || 0} 次`
    },
    {
      label: '平均响应时长',
      value: formatDurationMsText(aiEventStats.avgDurationMs || voiceEventStats.avgDurationMs),
      note: usageStats.fallbackCount > 0
        ? `当前累计 fallback ${usageStats.fallbackCount} 次`
        : (usageReport.coverAccountCount > 0 ? `覆盖 ${usageReport.coverAccountCount} 个有真实使用的账户` : '当前还没有真实使用账户')
    }
  ].map((item) => `
    <article class="section-summary-card">
      <div class="section-summary-label">${escapeHtml(item.label)}</div>
      <div class="section-summary-value">${escapeHtml(item.value)}</div>
      <div class="section-summary-note">${escapeHtml(item.note)}</div>
    </article>
  `).join('')

  document.getElementById('overviewUsageTrendWrap').innerHTML = renderOverviewCardList(
    trendItems.map((item) => ({
      title: item.date,
      meta: `${item.accountCount || 0} 个账户 · ${item.records || 0} 条流水`,
      value: `AI ${formatAiQuotaText(item.consumeAiTokens)} · 语音 ${formatVoiceQuotaText(item.consumeVoiceSeconds)}`,
      desc: `回补 AI ${formatAiQuotaText(item.grantAiTokens)} · 语音 ${formatVoiceQuotaText(item.grantVoiceSeconds)} · fallback ${item.fallbackCount || 0} 次`
    })),
    {
      emptyText: state.runtime.overviewUsageLoading ? '正在生成运营报表...' : '近 30 天还没有可展示的真实额度消耗。'
    }
  )

  document.getElementById('overviewUsageHotspotsWrap').innerHTML = renderOverviewCardList(
    hotspotItems,
    {
      emptyText: '当前还没有足够的真实消耗热点数据。'
    }
  )
}

function renderAccounts() {
  const filteredAccounts = state.accounts.filter((item) => accountMatches(item, state.accountSearch, state.accountStatusFilter))
  const selectedAccount = getSelectedAccount()
  const bindRequiredCount = state.accounts.filter((item) => item.bindRequiredForWrite || !item.phoneVerified).length
  const blockedCount = state.accounts.filter((item) => !item.canCreateProject).length
  const paidCount = state.accounts.filter((item) => item.status === 'active_paid').length
  const topTrialButton = document.getElementById('createTrialBtn')

  document.getElementById('accountCountMeta').textContent = `共 ${filteredAccounts.length} 个账户`
  document.getElementById('selectedAccountMeta').textContent = selectedAccount
    ? `${getAccountPrimaryPhone(selectedAccount)} · ${getStatusLabel(selectedAccount.status)} · ${getAccessLabel(selectedAccount.currentAccessLevel)}`
    : '未选择账户'
  document.getElementById('accountsSummaryWrap').innerHTML = [
    {
      label: '待绑定账户',
      value: `${bindRequiredCount} 个`,
      note: bindRequiredCount > 0 ? '会影响正式写入、订阅承接和后续多端识别。' : '当前没有待绑定账户，身份承接较干净。'
    },
    {
      label: '正式付费账户',
      value: `${paidCount} 个`,
      note: paidCount > 0 ? '适合重点看活跃度、额度消耗和续费风险。' : '当前还没有已正式到账的稳定付费账户。'
    },
    {
      label: '当前受限账户',
      value: `${blockedCount} 个`,
      note: blockedCount > 0 ? '包括只读、项目上限和禁用状态，适合优先人工介入。' : '当前没有明显受限账户。'
    }
  ].map((item) => `
    <article class="section-summary-card">
      <div class="section-summary-label">${escapeHtml(item.label)}</div>
      <div class="section-summary-value">${escapeHtml(item.value)}</div>
      <div class="section-summary-note">${escapeHtml(item.note)}</div>
    </article>
  `).join('')
  if (topTrialButton) {
    topTrialButton.disabled = !selectedAccount || selectedAccount.status === 'disabled'
  }

  if (!filteredAccounts.length) {
    document.getElementById('accountsTableWrap').innerHTML = `<div class="empty-card">${escapeHtml(buildEmptyAccountsCopy())}</div>`
  } else {
    document.getElementById('accountsTableWrap').innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>账户</th>
            <th>状态</th>
            <th>当前权益</th>
            <th>语音额度</th>
            <th>AI 额度</th>
            <th>最近活跃</th>
          </tr>
        </thead>
        <tbody>
          ${filteredAccounts.map((item) => `
            <tr class="${selectedAccount && selectedAccount.accountId === item.accountId ? 'is-selected' : ''}">
              <td>
                <button class="data-row-button" data-account-id="${escapeHtml(item.accountId)}">
                  ${buildTableMainCell(getAccountPrimaryPhone(item), getAccountSecondaryMeta(item) || (item.phoneVerified ? '已绑定手机号' : '未绑定手机号'))}
                </button>
              </td>
              <td>
                ${buildBadgeListMarkup([
                  `<span class="badge ${getStatusBadgeClass(item.status)}">${escapeHtml(getStatusLabel(item.status))}</span>`,
                  item.bindRequiredForWrite ? '<span class="badge is-soft">待绑定</span>' : '<span class="badge is-success">已绑定</span>'
                ])}
              </td>
              <td>${buildTableMainCell(getAccessLabel(item.currentAccessLevel), item.projectLimit > -1 ? `项目 ${item.currentProjectCount} / ${item.projectLimit}` : `项目 ${item.currentProjectCount} / 不限`)}</td>
              <td>${buildTableMainCell(formatVoiceQuotaText(item.voiceSecondsRemaining), item.canUseSpeechToText ? '语音能力正常' : '语音能力受限')}</td>
              <td>${buildTableMainCell(formatAiQuotaText(item.aiTokensRemaining), item.canUseAi ? 'AI 能力正常' : 'AI 能力受限')}</td>
              <td>${buildTableMainCell(item.lastActiveAt || '-', item.notes || item.reasonSummary || '当前无额外说明')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
  }

  document.querySelectorAll('[data-account-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedAccountId = button.dataset.accountId
      if (state.adjustmentRecordScope === 'selected') {
        refreshManualAdjustmentRecords({
          renderOnFinish: true
        })
      }
      renderAccounts()
    })
  })

  document.getElementById('accountDetailWrap').innerHTML = selectedAccount
    ? buildAccountDetailMarkup(selectedAccount)
    : '<div class="empty-card">请选择一个账户后查看详情。</div>'

  bindAccountDetailActions(selectedAccount)
  renderAdjustmentRecords()
}

function renderAdjustmentRecords() {
  const tableWrap = document.getElementById('adjustmentRecordTableWrap')
  const countMeta = document.getElementById('adjustmentRecordCountMeta')
  const scopeSelect = document.getElementById('adjustmentRecordScopeSelect')
  const searchInput = document.getElementById('adjustmentRecordSearchInput')

  if (!tableWrap || !countMeta) {
    return
  }

  if (scopeSelect && scopeSelect.value !== state.adjustmentRecordScope) {
    scopeSelect.value = state.adjustmentRecordScope
  }
  if (searchInput && searchInput.value !== state.adjustmentRecordSearch) {
    searchInput.value = state.adjustmentRecordSearch
  }

  const records = getManualAdjustmentLogs()
  const selectedAccount = getSelectedAccount()
  const scopeText = state.adjustmentRecordScope === 'selected'
    ? (selectedAccount ? `当前账户：${getAccountPrimaryPhone(selectedAccount)}` : '当前账户：未选择')
    : '全部账户'

  countMeta.textContent = `${scopeText} · 共 ${records.length} 条人工调整`

  if (!records.length) {
    tableWrap.innerHTML = '<div class="empty-card">当前没有匹配到人工调整记录。</div>'
    return
  }

  tableWrap.innerHTML = `
    <table class="data-table adjustment-record-table">
      <thead>
        <tr>
          <th>时间</th>
          <th>账户</th>
          <th>动作</th>
          <th>操作人</th>
          <th>原因</th>
          <th>结果快照</th>
        </tr>
      </thead>
      <tbody>
        ${records.map((item) => {
          const beforeSnapshot = item.beforeSnapshot && typeof item.beforeSnapshot === 'object' ? item.beforeSnapshot : {}
          const afterSnapshot = item.afterSnapshot && typeof item.afterSnapshot === 'object' ? item.afterSnapshot : {}
          const afterStatus = toText(afterSnapshot.status || afterSnapshot.entitlementsStatus)
          const quotaLines = [
            Number.isFinite(Number(afterSnapshot.voiceSecondsRemaining)) ? `语音 ${formatVoiceQuotaText(afterSnapshot.voiceSecondsRemaining)}` : '',
            Number.isFinite(Number(afterSnapshot.aiTokensRemaining)) ? `AI ${formatAiQuotaText(afterSnapshot.aiTokensRemaining)}` : '',
            afterStatus ? `状态 ${getStatusLabel(afterStatus)}` : ''
          ].filter(Boolean)
          const changeText = [
            beforeSnapshot.status || afterStatus
              ? `状态：${getStatusLabel(beforeSnapshot.status)} → ${getStatusLabel(afterStatus || beforeSnapshot.status)}`
              : '',
            Number.isFinite(Number(beforeSnapshot.voiceSecondsRemaining)) || Number.isFinite(Number(afterSnapshot.voiceSecondsRemaining))
              ? `语音：${formatVoiceQuotaText(beforeSnapshot.voiceSecondsRemaining)} → ${formatVoiceQuotaText(afterSnapshot.voiceSecondsRemaining)}`
              : '',
            Number.isFinite(Number(beforeSnapshot.aiTokensRemaining)) || Number.isFinite(Number(afterSnapshot.aiTokensRemaining))
              ? `AI：${formatAiQuotaText(beforeSnapshot.aiTokensRemaining)} → ${formatAiQuotaText(afterSnapshot.aiTokensRemaining)}`
              : ''
          ].filter(Boolean).join('；')

          return `
            <tr>
              <td>${buildTableMainCell(item.createdAt || '-', item.logId)}</td>
              <td>${buildTableMainCell(getAccountLabelById(item.targetId), item.targetId)}</td>
              <td>
                ${buildBadgeListMarkup([
                  `<span class="badge ${getActionBadgeClass(item.actionType)}">${escapeHtml(getActionLabel(item.actionType))}</span>`
                ])}
                <div class="table-main-meta">${escapeHtml(item.actionType)}</div>
              </td>
              <td>${buildTableMainCell(item.operatorId || '-', '管理操作')}</td>
              <td><div class="audit-note">${escapeHtml(item.reason || '未填写原因')}</div></td>
              <td>${buildTableMainCell(quotaLines.join(' · ') || '-', changeText || '已记录变更前后快照')}</td>
            </tr>
          `
        }).join('')}
      </tbody>
    </table>
  `
}

function buildAccountDetailMarkup(account) {
  const alerts = buildAccountAlerts(account)
  const capabilityLines = buildAccountCapabilityLines(account)
  const accountBadgeClass = getStatusBadgeClass(account.status)
  const projectSummaryText = account.projectLimit > -1
    ? `${account.currentProjectCount} / ${account.projectLimit}`
    : `${account.currentProjectCount} / 不限`
  const bindStatusText = account.phoneVerified ? (account.phone || '已绑定手机号') : '未绑定手机号'
  const writeStatusText = getWriteStatusLabel(account)
  const shareAbilityText = getShareAbilityLabel(account)
  const displayLabel = getAccountDisplayLabel(account) || '当前未设置显示名'
  const secondaryMeta = getAccountSecondaryMeta(account)

  return `
    <div class="detail-stack">
      <section class="detail-card detail-card-hero">
        <div class="purchase-hero">
          <div class="purchase-hero-main">
            <div class="mini-kicker">账户经营卡</div>
            <h4 class="purchase-title">${escapeHtml(getAccountPrimaryPhone(account))}</h4>
            <div class="purchase-subtitle">${escapeHtml(secondaryMeta || account.accountId || '-')}</div>
            <div class="purchase-price-row">
              <div class="purchase-price">${escapeHtml(displayLabel)}</div>
            </div>
          </div>
          <div class="badge ${accountBadgeClass}">${escapeHtml(getStatusLabel(account.status))}</div>
        </div>
        <div class="detail-grid purchase-summary-grid">
          <div>
            <div class="detail-item-label">项目位</div>
            <div class="detail-item-value">${escapeHtml(projectSummaryText)}</div>
          </div>
          <div>
            <div class="detail-item-label">语音额度</div>
            <div class="detail-item-value">${escapeHtml(formatVoiceQuotaText(account.voiceSecondsRemaining))}</div>
          </div>
          <div>
            <div class="detail-item-label">AI 额度</div>
            <div class="detail-item-value">${escapeHtml(formatAiQuotaText(account.aiTokensRemaining))}</div>
          </div>
          <div>
            <div class="detail-item-label">当前权益</div>
            <div class="detail-item-value">${escapeHtml(getAccessLabel(account.currentAccessLevel))}</div>
          </div>
          <div>
            <div class="detail-item-label">最近活跃</div>
            <div class="detail-item-value">${escapeHtml(account.lastActiveAt || '-')}</div>
          </div>
        </div>
        ${buildCapabilityPillsMarkup(capabilityLines)}
        ${account.notes || account.reasonSummary ? `<div class="order-note order-note-strong">${escapeHtml(account.notes || account.reasonSummary)}</div>` : ''}
      </section>

      ${alerts.length ? `
        <section class="detail-card">
          <h4 class="detail-card-title">当前限制与提示</h4>
          <div class="alert-stack">
            ${alerts.map((item) => `
              <article class="state-callout is-${escapeHtml(item.tone)}">
                <div class="state-callout-title">${escapeHtml(item.title)}</div>
                <div class="state-callout-desc">${escapeHtml(item.desc)}</div>
              </article>
            `).join('')}
          </div>
        </section>
      ` : ''}

      <section class="detail-card">
        <h4 class="detail-card-title">权益与阶段</h4>
        <div class="detail-card-subtitle">这组状态决定当前是否还能继续保存、外发以及承接后续付费。</div>
        <div class="detail-grid">
          <div>
            <div class="detail-item-label">当前显示名</div>
            <div class="detail-item-value">${escapeHtml(displayLabel)}</div>
          </div>
          <div>
            <div class="detail-item-label">账户内码</div>
            <div class="detail-item-value">${escapeHtml(account.accountId || '-')}</div>
          </div>
          <div>
            <div class="detail-item-label">手机号状态</div>
            <div class="detail-item-value">${escapeHtml(bindStatusText)}</div>
          </div>
          <div>
            <div class="detail-item-label">写入状态</div>
            <div class="detail-item-value">${escapeHtml(writeStatusText)}</div>
          </div>
          <div>
            <div class="detail-item-label">外发能力</div>
            <div class="detail-item-value">${escapeHtml(shareAbilityText)}</div>
          </div>
          <div>
            <div class="detail-item-label">项目占用</div>
            <div class="detail-item-value">${escapeHtml(projectSummaryText)}</div>
          </div>
          <div>
            <div class="detail-item-label">试用截止</div>
            <div class="detail-item-value">${escapeHtml(account.trialEndsAt || '-')}</div>
          </div>
          <div>
            <div class="detail-item-label">订阅截止</div>
            <div class="detail-item-value">${escapeHtml(account.subscriptionEndsAt || '-')}</div>
          </div>
        </div>
      </section>

      <section class="detail-card">
        <h4 class="detail-card-title">人工调整</h4>
        <div class="detail-card-subtitle">按“补量、补权益、改状态”三类动作处理，避免重复操作和语义歧义。</div>

        <div class="action-group-stack">
          <section class="action-section">
            <div class="action-section-head">
              <div class="action-section-title">补量动作</div>
              <div class="action-section-desc">直接处理语音额度和 AI 额度不足，适合先恢复功能可用性。</div>
            </div>
            <div class="action-grid action-grid-two">
              <article class="action-card">
                <div class="action-card-title">补语音额度</div>
                <div class="action-card-desc">适合闪录、跟进录音或语音转写额度不足时快速补量。</div>
                <div class="action-form">
                  <div class="split-fields">
                    <input id="voiceAmountInput" class="form-input" type="number" min="1" value="1800" placeholder="秒数">
                    <button id="addVoiceBtn" class="secondary-btn" type="button">补语音额度</button>
                  </div>
                  <textarea id="voiceReasonInput" class="form-textarea" placeholder="操作原因">补 30 分钟语音时长，便于继续验证闪录链路。</textarea>
                </div>
              </article>

              <article class="action-card">
                <div class="action-card-title">补 AI 额度</div>
                <div class="action-card-desc">适合 AI 整理、客户识别和任务建议受限时补量恢复。</div>
                <div class="action-form">
                  <div class="split-fields">
                    <input id="aiAmountInput" class="form-input" type="number" min="1" value="50000" placeholder="token">
                    <button id="addAiBtn" class="secondary-btn" type="button">补 AI 额度</button>
                  </div>
                  <textarea id="aiReasonInput" class="form-textarea" placeholder="操作原因">补 AI 额度（token），继续验证 AI 整理与自动建议。</textarea>
                </div>
              </article>
            </div>
          </section>

          <section class="action-section">
            <div class="action-section-head">
              <div class="action-section-title">补权益动作</div>
              <div class="action-section-desc">适合继续观察试用转化，或人工恢复正式可写的订阅权益。</div>
            </div>
            <div class="action-grid action-grid-two">
              <article class="action-card">
                <div class="action-card-title">延长试用观察期</div>
                <div class="action-card-desc">适合试用即将结束，但还需要继续观察绑定、付费和使用行为的账户。</div>
                <div class="action-form">
                  <div class="split-fields">
                    <input id="trialDaysInput" class="form-input" type="number" min="1" value="7" placeholder="天数">
                    <button id="extendTrialBtn" class="secondary-btn" type="button">延长试用</button>
                  </div>
                  <textarea id="trialReasonInput" class="form-textarea" placeholder="操作原因">延长试用，继续观察绑定、付费和闪录使用情况。</textarea>
                </div>
              </article>

              <article class="action-card">
                <div class="action-card-title">手动补开订阅</div>
                <div class="action-card-desc">用于人工恢复正式可写，或直接验证付费到账后的完整权益效果。</div>
                <div class="action-form">
                  <div class="split-fields">
                    <select id="subscriptionCycleSelect" class="form-select">
                      <option value="monthly">月付</option>
                      <option value="yearly">年付</option>
                    </select>
                    <input id="subscriptionDaysInput" class="form-input" type="number" min="0" value="0" placeholder="自定义天数，0 表示按周期">
                  </div>
                  <div class="split-fields">
                    <input id="subscriptionVoiceInput" class="form-input" type="number" min="0" value="1800" placeholder="语音额度（秒）">
                    <input id="subscriptionAiInput" class="form-input" type="number" min="0" value="200000" placeholder="AI 额度（token）">
                  </div>
                  <div class="split-fields">
                    <input id="subscriptionProjectLimitInput" class="form-input" type="number" value="-1" placeholder="项目上限，-1 不限">
                    <button id="grantSubscriptionBtn" class="primary-btn" type="button">补开订阅</button>
                  </div>
                  <textarea id="subscriptionReasonInput" class="form-textarea" placeholder="操作原因">人工补开订阅，用于恢复正式可写并验证完整付费权益。</textarea>
                </div>
              </article>
            </div>
          </section>

          <section class="action-section">
            <div class="action-section-head">
              <div class="action-section-title">状态动作</div>
              <div class="action-section-desc">这些动作直接改账户阶段，适合处理只读、到期或异常账户。</div>
            </div>
            <div class="action-grid">
              <article class="action-card">
                <div class="action-card-title">账户状态动作</div>
                <div class="action-card-desc">这些动作直接对应管理云函数的显式操作，避免“选状态”带来的语义歧义。</div>
                <div class="action-form">
                  <textarea id="statusReasonInput" class="form-textarea" placeholder="操作原因">人工修正账户状态或验证受限承接链路。</textarea>
                  <div class="inline-actions">
                    <button id="enableAccountBtn" class="secondary-btn" type="button">恢复正式可写</button>
                    <button id="expireSubscriptionBtn" class="ghost-btn" type="button">设为到期只读</button>
                    <button id="disableAccountBtn" class="danger-btn" type="button">禁用账户</button>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </div>
      </section>

      <section class="detail-card">
        <h4 class="detail-card-title">运营说明</h4>
        <div class="detail-card-subtitle">用于记录当前账户为什么受限、为什么补量，或下一步准备怎么承接。</div>
        <div class="order-note">${escapeHtml(account.notes || account.reasonSummary || '当前无额外运营说明。')}</div>
      </section>
    </div>
  `
}

function bindAccountDetailActions(account) {
  if (!account) {
    return
  }

  const bindClick = (id, handler) => {
    const element = document.getElementById(id)
    if (element) {
      element.addEventListener('click', handler)
    }
  }

  bindClick('addVoiceBtn', () => {
    const amount = Math.max(1, Math.floor(toNumber(document.getElementById('voiceAmountInput').value, 0)))
    const reason = document.getElementById('voiceReasonInput').value.trim() || '补语音额度'
    performAccountAction({
      accountId: account.accountId,
      action: 'add_voice',
      amount,
      reason
    }, '已完成补语音并刷新数据。')
  })

  bindClick('addAiBtn', () => {
    const amount = Math.max(1, Math.floor(toNumber(document.getElementById('aiAmountInput').value, 0)))
    const reason = document.getElementById('aiReasonInput').value.trim() || '补 AI 额度'
    performAccountAction({
      accountId: account.accountId,
      action: 'add_ai',
      amount,
      reason
    }, '已完成补 AI 并刷新数据。')
  })

  bindClick('extendTrialBtn', () => {
    const days = Math.max(1, Math.floor(toNumber(document.getElementById('trialDaysInput').value, 0)))
    const reason = document.getElementById('trialReasonInput').value.trim() || `延长 ${days} 天试用`
    performAccountAction({
      accountId: account.accountId,
      action: 'extend_trial',
      days,
      reason
    }, '已延长试用并刷新数据。')
  })

  bindClick('grantSubscriptionBtn', () => {
    const billingCycle = toText(document.getElementById('subscriptionCycleSelect').value) === 'yearly' ? 'yearly' : 'monthly'
    const days = Math.max(0, Math.floor(toNumber(document.getElementById('subscriptionDaysInput').value, 0)))
    const grantedVoiceSeconds = Math.max(0, Math.floor(toNumber(document.getElementById('subscriptionVoiceInput').value, 1800)))
    const grantedAiTokens = Math.max(0, Math.floor(toNumber(document.getElementById('subscriptionAiInput').value, 200000)))
    const projectLimit = Math.floor(toNumber(document.getElementById('subscriptionProjectLimitInput').value, -1))
    const reason = document.getElementById('subscriptionReasonInput').value.trim() || '人工补开订阅'

    performAccountAction({
      accountId: account.accountId,
      action: 'grant_subscription',
      billingCycle,
      grantedVoiceSeconds,
      grantedAiTokens,
      projectLimit,
      days: days > 0 ? days : undefined,
      reason
    }, '已补开订阅并刷新数据。')
  })

  bindClick('enableAccountBtn', () => {
    const reason = document.getElementById('statusReasonInput').value.trim() || '恢复账户'
    performAccountAction({
      accountId: account.accountId,
      action: 'enable_account',
      reason
    }, '已恢复账户并刷新数据。')
  })

  bindClick('expireSubscriptionBtn', () => {
    const reason = document.getElementById('statusReasonInput').value.trim() || '设为到期只读'
    performAccountAction({
      accountId: account.accountId,
      action: 'expire_subscription',
      reason
    }, '已设为到期只读并刷新数据。')
  })

  bindClick('disableAccountBtn', () => {
    const reason = document.getElementById('statusReasonInput').value.trim() || '禁用账户'
    performAccountAction({
      accountId: account.accountId,
      action: 'disable_account',
      reason
    }, '已禁用账户并刷新数据。')
  })
}

function renderFeedback() {
  const tableWrap = document.getElementById('feedbackTableWrap')
  const countMeta = document.getElementById('feedbackCountMeta')
  const selectedMeta = document.getElementById('selectedFeedbackMeta')
  const detailWrap = document.getElementById('feedbackDetailWrap')
  const summaryWrap = document.getElementById('feedbackSummaryWrap')
  const refreshBtn = document.getElementById('refreshFeedbackBtn')

  if (!tableWrap || !countMeta || !selectedMeta || !detailWrap || !summaryWrap) {
    return
  }

  const filteredItems = state.feedbackItems.filter((item) => feedbackMatches(item, state.feedbackSearch, state.feedbackStatusFilter))
  const selectedFeedback = getSelectedFeedback()
  const pendingCount = state.feedbackItems.filter((item) => item.status === 'pending').length
  const acceptedCount = state.feedbackItems.filter((item) => item.status === 'accepted' || item.status === 'rewarded').length
  const rewardedTokens = state.feedbackItems.reduce((total, item) => total + toNumber(item.rewardAiTokens, 0), 0)

  if (refreshBtn) {
    refreshBtn.disabled = state.runtime.feedbackLoading || state.runtime.loading
  }
  countMeta.textContent = state.runtime.feedbackLoading
    ? '正在刷新反馈...'
    : `共 ${filteredItems.length} 条反馈`
  selectedMeta.textContent = selectedFeedback
    ? `${selectedFeedback.displayName || selectedFeedback.phoneMasked || selectedFeedback.accountId || '匿名用户'} · ${getFeedbackStatusLabel(selectedFeedback.status)}`
    : '未选择反馈'

  summaryWrap.innerHTML = [
    {
      label: '待处理',
      value: `${pendingCount} 条`,
      note: pendingCount > 0 ? '优先看问题反馈和高频需求。' : '当前没有待处理反馈。'
    },
    {
      label: '已采纳',
      value: `${acceptedCount} 条`,
      note: '包含已采纳和已发放奖励的反馈。'
    },
    {
      label: '已发奖励',
      value: formatAiQuotaText(rewardedTokens),
      note: '采纳需求后发放 AI 额度，形成正反馈。'
    }
  ].map((item) => `
    <article class="section-summary-card">
      <div class="section-summary-label">${escapeHtml(item.label)}</div>
      <div class="section-summary-value">${escapeHtml(item.value)}</div>
      <div class="section-summary-note">${escapeHtml(item.note)}</div>
    </article>
  `).join('')

  if (!filteredItems.length) {
    tableWrap.innerHTML = '<div class="empty-card">当前没有匹配到反馈。</div>'
  } else {
    tableWrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>提交人</th>
            <th>类型</th>
            <th>内容</th>
            <th>状态</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          ${filteredItems.map((item) => {
            const submitter = item.displayName || item.phoneMasked || item.accountId || '匿名用户'
            const contactMeta = item.allowContact && item.contact ? `可联系：${item.contact}` : (item.allowContact ? '允许联系' : '不方便联系')
            return `
              <tr class="${selectedFeedback && selectedFeedback.feedbackId === item.feedbackId ? 'is-selected' : ''}">
                <td>
                  <button class="data-row-button" data-feedback-id="${escapeHtml(item.feedbackId)}">
                    ${buildTableMainCell(submitter, item.accountId || contactMeta)}
                  </button>
                </td>
                <td>
                  ${buildBadgeListMarkup([
                    `<span class="badge is-brand">${escapeHtml(item.typeLabel || '反馈')}</span>`,
                    `<span class="badge is-neutral">${escapeHtml(item.sceneLabel || '使用中')}</span>`
                  ])}
                </td>
                <td>${buildTableMainCell(item.content.slice(0, 52) || '-', item.adminNote || contactMeta)}</td>
                <td>
                  ${buildBadgeListMarkup([
                    `<span class="badge ${getFeedbackStatusBadgeClass(item.status)}">${escapeHtml(getFeedbackStatusLabel(item.status))}</span>`
                  ])}
                  ${item.rewardAiTokens > 0 ? `<div class="table-main-meta">奖励 ${escapeHtml(formatAiQuotaText(item.rewardAiTokens))}</div>` : ''}
                </td>
                <td>${buildTableMainCell(item.createdAt || '-', item.feedbackId)}</td>
              </tr>
            `
          }).join('')}
        </tbody>
      </table>
    `
  }

  document.querySelectorAll('[data-feedback-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedFeedbackId = button.dataset.feedbackId
      renderFeedback()
    })
  })

  detailWrap.innerHTML = selectedFeedback
    ? buildFeedbackDetailMarkup(selectedFeedback)
    : '<div class="empty-card">请选择一条反馈后处理。</div>'

  bindFeedbackDetailActions(selectedFeedback)
}

function renderReferrals() {
  const tableWrap = document.getElementById('referralTableWrap')
  const countMeta = document.getElementById('referralCountMeta')
  const selectedMeta = document.getElementById('selectedReferralMeta')
  const detailWrap = document.getElementById('referralDetailWrap')
  const summaryWrap = document.getElementById('referralSummaryWrap')
  const refreshBtn = document.getElementById('refreshReferralsBtn')

  if (!tableWrap || !countMeta || !selectedMeta || !detailWrap || !summaryWrap) {
    return
  }

  const filteredItems = state.referralItems.filter((item) => referralMatches(item, state.referralSearch, state.referralStatusFilter, state.referralTimeWindow))
  const selectedReferral = getSelectedReferral()
  const stats = state.referralStats && typeof state.referralStats === 'object'
    ? state.referralStats
    : buildLocalReferralStats(state.referralItems)

  if (refreshBtn) {
    refreshBtn.disabled = state.runtime.referralLoading || state.runtime.loading
  }
  countMeta.textContent = state.runtime.referralLoading
    ? '正在刷新传播关系...'
    : `共 ${filteredItems.length} 条传播关系`
  selectedMeta.textContent = selectedReferral
    ? `${selectedReferral.referrerAccount.displayName || selectedReferral.referrerAccount.phone || selectedReferral.referrerAccountId} → ${selectedReferral.inviteeAccount.displayName || selectedReferral.inviteeAccount.phone || selectedReferral.inviteeAccountId}`
    : '未选择传播关系'

  summaryWrap.innerHTML = [
    {
      label: '传播关系',
      value: `${stats.totalCount || 0} 条`,
      note: `已奖励 ${stats.rewardedCount || 0} 条，待首个项目 ${stats.pendingCount || 0} 条。`
    },
    {
      label: '已发放 AI',
      value: formatAiQuotaText(stats.ledgerGrantedAiTokens || 0),
      note: '按传播奖励真实写入的额度流水汇总。'
    },
    {
      label: '异常提示',
      value: `${stats.missingLedgerCount || 0} 条`,
      note: '重点看已奖励但缺少流水的关系。'
    }
  ].map((item) => `
    <article class="section-summary-card">
      <div class="section-summary-label">${escapeHtml(item.label)}</div>
      <div class="section-summary-value">${escapeHtml(item.value)}</div>
      <div class="section-summary-note">${escapeHtml(item.note)}</div>
    </article>
  `).join('')

  if (!filteredItems.length) {
    tableWrap.innerHTML = '<div class="empty-card">当前没有匹配到传播关系。</div>'
  } else {
    tableWrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>传播关系</th>
            <th>状态</th>
            <th>双方权益</th>
            <th>奖励</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          ${filteredItems.map((item) => {
            const blockReasonLabel = getReferralBlockReasonLabel(item.blockReason, item)
            const statusMeta = item.status === 'blocked'
              ? `阻止原因：${blockReasonLabel}`
              : getReferralLedgerStatusLabel(item.ledgerStatus)
            const sourceLabel = item.sourceTypeLabel || getReferralSourceTypeLabel(item.sourceType)
            const sourceIdentity = item.referrerCode || item.sourceId || '-'
            return `
              <tr class="${selectedReferral && selectedReferral.relationId === item.relationId ? 'is-selected' : ''}">
                <td>
                  <button class="data-row-button" data-referral-id="${escapeHtml(item.relationId)}">
                    ${buildTableMainCell(item.referrerAccount.displayName || item.referrerAccount.phone || item.referrerAccountId, `${sourceLabel} · ${sourceIdentity}`)}
                  </button>
                </td>
                <td>
                  ${buildBadgeListMarkup([
                    `<span class="badge ${getReferralStatusBadgeClass(item.status)}">${escapeHtml(item.statusLabel)}</span>`,
                    item.ledgerStatus === 'complete'
                      ? '<span class="badge is-success">流水完整</span>'
                      : (item.ledgerStatus === 'missing' ? '<span class="badge is-danger">流水缺失</span>' : '<span class="badge is-neutral">未触发</span>')
                  ])}
                  <div class="table-main-meta">${escapeHtml(statusMeta)}</div>
                </td>
                <td>${buildTableMainCell(item.referrerAccount.displayName || item.referrerAccount.phone || item.referrerAccount.accountId, item.inviteeAccount.displayName || item.inviteeAccount.phone || item.inviteeAccount.accountId)}</td>
                <td>${buildTableMainCell(formatAiQuotaText(item.rewardAiTokens), item.qualifiedProjectName || '双方各奖励')}</td>
                <td>${buildTableMainCell(item.rewardedAt || item.boundAt || '-', item.qualifiedProjectName || item.qualifiedProjectId || '等待触发')}</td>
              </tr>
            `
          }).join('')}
        </tbody>
      </table>
    `
  }

  document.querySelectorAll('[data-referral-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedReferralId = button.dataset.referralId
      renderReferrals()
    })
  })

  detailWrap.innerHTML = selectedReferral
    ? buildReferralDetailMarkup(selectedReferral)
    : '<div class="empty-card">请选择一条传播关系后查看详情。</div>'

  document.querySelectorAll('[data-copy-referral-code]').forEach((button) => {
    button.addEventListener('click', () => {
      const code = toText(button.dataset.copyReferralCode)
      if (!code) {
        return
      }
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(code).catch(() => {
          const tempInput = document.createElement('input')
          tempInput.value = code
          document.body.appendChild(tempInput)
          tempInput.select()
          document.execCommand('copy')
          document.body.removeChild(tempInput)
        })
      } else {
        const tempInput = document.createElement('input')
        tempInput.value = code
        document.body.appendChild(tempInput)
        tempInput.select()
        document.execCommand('copy')
        document.body.removeChild(tempInput)
      }
      showToast('来源标识已复制', 'success')
    })
  })
}

function buildReferralDetailMarkup(item) {
  const referrer = item.referrerAccount || {}
  const invitee = item.inviteeAccount || {}
  const ledgerStatusLabel = getReferralLedgerStatusLabel(item.ledgerStatus)
  const blockReasonLabel = getReferralBlockReasonLabel(item.blockReason, item)
  const anomalyText = Array.isArray(item.anomalyLabels) && item.anomalyLabels.length
    ? item.anomalyLabels.join(' · ')
    : '当前没有明显异常'
  const sourceLabel = item.sourceTypeLabel || getReferralSourceTypeLabel(item.sourceType)
  const sourceIdentity = item.referrerCode || item.sourceId || '-'
  const primaryNotice = item.status === 'blocked'
    ? `阻止原因：${blockReasonLabel}`
    : (item.qualifiedProjectName ? `首个项目：${item.qualifiedProjectName}` : '等待被推荐人创建首个项目后触发奖励。')

  return `
    <div class="detail-stack">
      <section class="detail-card detail-card-hero">
        <div class="purchase-hero">
          <div class="purchase-hero-main">
            <div class="mini-kicker">${escapeHtml(sourceLabel)} ${escapeHtml(sourceIdentity)}</div>
            <h4 class="purchase-title">${escapeHtml(referrer.displayName || referrer.phone || referrer.accountId || '推荐人')}</h4>
            <div class="purchase-subtitle">${escapeHtml(invitee.displayName || invitee.phone || invitee.accountId || '被推荐人')}</div>
          </div>
          <span class="badge ${getReferralStatusBadgeClass(item.status)}">${escapeHtml(item.statusLabel)}</span>
        </div>
        <div class="feedback-content-block">${escapeHtml(primaryNotice)}</div>
        <div class="detail-grid">
          <div>
            <div class="detail-item-label">传播来源</div>
            <div class="detail-item-value">${escapeHtml(sourceLabel)}</div>
          </div>
          <div>
            <div class="detail-item-label">来源标识</div>
            <div class="detail-item-value">${escapeHtml(sourceIdentity)}</div>
          </div>
          <div>
            <div class="detail-item-label">推荐人</div>
            <div class="detail-item-value">${escapeHtml(referrer.displayName || referrer.phone || referrer.accountId || '-')}</div>
          </div>
          <div>
            <div class="detail-item-label">被推荐人</div>
            <div class="detail-item-value">${escapeHtml(invitee.displayName || invitee.phone || invitee.accountId || '-')}</div>
          </div>
          <div>
            <div class="detail-item-label">绑定时间</div>
            <div class="detail-item-value">${escapeHtml(item.boundAt || '-')}</div>
          </div>
          <div>
            <div class="detail-item-label">奖励时间</div>
            <div class="detail-item-value">${escapeHtml(item.rewardedAt || '未奖励')}</div>
          </div>
        </div>
      </section>

      <section class="detail-card">
        <h4 class="detail-card-title">奖励与流水</h4>
        <div class="detail-grid purchase-summary-grid">
          <div>
            <div class="detail-item-label">双方奖励</div>
            <div class="detail-item-value">${escapeHtml(formatAiQuotaText(item.rewardAiTokens))} / 人</div>
          </div>
          <div>
            <div class="detail-item-label">流水状态</div>
            <div class="detail-item-value">${escapeHtml(ledgerStatusLabel)}</div>
          </div>
          <div>
            <div class="detail-item-label">推荐人流水</div>
            <div class="detail-item-value">${escapeHtml(item.referrerLedger ? item.referrerLedger.traceId : '未生成')}</div>
          </div>
          <div>
            <div class="detail-item-label">被推荐人流水</div>
            <div class="detail-item-value">${escapeHtml(item.inviteeLedger ? item.inviteeLedger.traceId : '未生成')}</div>
          </div>
        </div>
        <div class="inline-actions">
          <button class="ghost-btn" type="button" data-copy-referral-code="${escapeHtml(sourceIdentity === '-' ? '' : sourceIdentity)}">复制来源标识</button>
        </div>
      </section>

      <section class="detail-card">
        <h4 class="detail-card-title">账户信息</h4>
        <div class="detail-grid">
          <div>
            <div class="detail-item-label">推荐人权益</div>
            <div class="detail-item-value">${escapeHtml(formatAiQuotaText(referrer.aiTokensRemaining || 0))} 剩余</div>
          </div>
          <div>
            <div class="detail-item-label">被推荐人权益</div>
            <div class="detail-item-value">${escapeHtml(formatAiQuotaText(invitee.aiTokensRemaining || 0))} 剩余</div>
          </div>
          <div>
            <div class="detail-item-label">首个项目</div>
            <div class="detail-item-value">${escapeHtml(item.qualifiedProjectName || item.qualifiedProjectId || '-')}</div>
          </div>
          <div>
            <div class="detail-item-label">来源项目</div>
            <div class="detail-item-value">${escapeHtml(item.sourceProjectId || '-')}</div>
          </div>
          <div>
            <div class="detail-item-label">异常提示</div>
            <div class="detail-item-value">${escapeHtml(anomalyText)}</div>
          </div>
          <div>
            <div class="detail-item-label">阻止原因</div>
            <div class="detail-item-value">${escapeHtml(item.status === 'blocked' ? blockReasonLabel : '-')}</div>
          </div>
        </div>
      </section>
    </div>
  `
}

function buildFeedbackDetailMarkup(item) {
  const submitter = item.displayName || item.phoneMasked || item.accountId || '匿名用户'
  const deviceText = [
    item.clientInfo && item.clientInfo.brand,
    item.clientInfo && item.clientInfo.model,
    item.clientInfo && item.clientInfo.platform,
    item.clientInfo && item.clientInfo.SDKVersion ? `SDK ${item.clientInfo.SDKVersion}` : ''
  ].map((field) => toText(field)).filter(Boolean).join(' · ')

  return `
    <div class="detail-stack">
      <section class="detail-card detail-card-hero">
        <div class="purchase-hero">
          <div class="purchase-hero-main">
            <div class="mini-kicker">${escapeHtml(item.typeLabel || '用户反馈')}</div>
            <h4 class="purchase-title">${escapeHtml(submitter)}</h4>
            <div class="purchase-subtitle">${escapeHtml(item.sceneLabel || '使用中')}</div>
          </div>
          <span class="badge ${getFeedbackStatusBadgeClass(item.status)}">${escapeHtml(getFeedbackStatusLabel(item.status))}</span>
        </div>
        <div class="feedback-content-block">${escapeHtml(item.content || '未填写反馈内容')}</div>
        <div class="detail-grid">
          <div>
            <div class="detail-item-label">账户</div>
            <div class="detail-item-value">${escapeHtml(item.accountId || '-')}</div>
          </div>
          <div>
            <div class="detail-item-label">联系方式</div>
            <div class="detail-item-value">${escapeHtml(item.allowContact ? (item.contact || '允许联系') : '不方便联系')}</div>
          </div>
          <div>
            <div class="detail-item-label">提交时间</div>
            <div class="detail-item-value">${escapeHtml(item.createdAt || '-')}</div>
          </div>
          <div>
            <div class="detail-item-label">奖励额度</div>
            <div class="detail-item-value">${escapeHtml(item.rewardAiTokens > 0 ? formatAiQuotaText(item.rewardAiTokens) : '未发放')}</div>
          </div>
        </div>
      </section>

      <section class="detail-card">
        <h4 class="detail-card-title">处理动作</h4>
        <div class="feedback-action-form">
          <textarea id="feedbackAdminNoteInput" class="form-textarea feedback-admin-note" placeholder="处理备注">${escapeHtml(item.adminNote || '')}</textarea>
          <div class="split-fields">
            <input id="feedbackRewardAmountInput" class="form-input" type="number" min="1" value="${escapeHtml(item.rewardAiTokens || 1000000)}" placeholder="奖励 AI 额度">
            <button id="rewardFeedbackBtn" class="primary-btn" type="button">发放百万 AI 额度</button>
          </div>
          <div class="inline-actions">
            <button id="acceptFeedbackBtn" class="secondary-btn" type="button">标记采纳</button>
            <button id="rejectFeedbackBtn" class="ghost-btn" type="button">不采纳</button>
            <button id="closeFeedbackBtn" class="ghost-btn" type="button">关闭</button>
          </div>
        </div>
      </section>

      <section class="detail-card">
        <h4 class="detail-card-title">补充信息</h4>
        <div class="detail-grid">
          <div>
            <div class="detail-item-label">反馈 ID</div>
            <div class="detail-item-value">${escapeHtml(item.feedbackId || '-')}</div>
          </div>
          <div>
            <div class="detail-item-label">客户端</div>
            <div class="detail-item-value">${escapeHtml(deviceText || '-')}</div>
          </div>
          <div>
            <div class="detail-item-label">处理时间</div>
            <div class="detail-item-value">${escapeHtml(item.handledAt || '-')}</div>
          </div>
          <div>
            <div class="detail-item-label">发奖时间</div>
            <div class="detail-item-value">${escapeHtml(item.rewardedAt || '-')}</div>
          </div>
        </div>
      </section>
    </div>
  `
}

function bindFeedbackDetailActions(item) {
  if (!item) {
    return
  }

  const getNote = () => toText(document.getElementById('feedbackAdminNoteInput') && document.getElementById('feedbackAdminNoteInput').value)
  const bindClick = (id, handler) => {
    const element = document.getElementById(id)
    if (element) {
      element.addEventListener('click', handler)
    }
  }

  bindClick('acceptFeedbackBtn', () => {
    performFeedbackAction({
      feedbackId: item.feedbackId,
      action: 'accept',
      adminNote: getNote() || '反馈已采纳，进入产品优化队列。'
    }, '已标记采纳。')
  })
  bindClick('rejectFeedbackBtn', () => {
    performFeedbackAction({
      feedbackId: item.feedbackId,
      action: 'reject',
      adminNote: getNote() || '暂不采纳，已记录原因。'
    }, '已标记不采纳。')
  })
  bindClick('closeFeedbackBtn', () => {
    performFeedbackAction({
      feedbackId: item.feedbackId,
      action: 'close',
      adminNote: getNote() || '反馈已关闭。'
    }, '已关闭反馈。')
  })
  bindClick('rewardFeedbackBtn', () => {
    const rewardAiTokens = Math.max(1, Math.floor(toNumber(document.getElementById('feedbackRewardAmountInput').value, 1000000)))
    performFeedbackAction({
      feedbackId: item.feedbackId,
      action: 'reward',
      rewardAiTokens,
      adminNote: getNote() || '反馈已采纳，发放 AI 额度奖励。'
    }, '已发放反馈奖励。')
  })
}

async function performAccountAction(payload, successText) {
  try {
    state.runtime.loading = true
    setNotice('', 'info')
    render()
    await provider.updateEntitlement(payload)
    setNotice(successText, 'success')
    showToast(successText, 'success')
    await refreshData({ preserveSelection: true })
  } catch (error) {
    state.runtime.loading = false
    setNotice(error.message || '后台操作失败，请稍后重试。', 'danger')
    showToast(error.message || '后台操作失败，请稍后重试。', 'danger')
    render()
  }
}

async function refreshFeedbackData(options = {}) {
  if (!provider.fetchFeedback) {
    return
  }

  const preserveSelection = options.preserveSelection !== false
  const previousFeedbackId = toText(state.selectedFeedbackId)
  const shouldRender = options.renderOnFinish !== false

  try {
    state.runtime.feedbackLoading = true
    if (shouldRender) {
      renderFeedback()
    }
    const result = await provider.fetchFeedback({
      keyword: state.feedbackSearch,
      status: state.feedbackStatusFilter,
      limit: 200,
      scanLimit: 500
    })
    state.feedbackItems = Array.isArray(result.feedback) ? result.feedback : []
    if (!preserveSelection || !state.feedbackItems.some((item) => item.feedbackId === previousFeedbackId)) {
      state.selectedFeedbackId = state.feedbackItems[0] ? state.feedbackItems[0].feedbackId : ''
    }
  } catch (error) {
    setNotice(error.message || '刷新反馈失败，请检查反馈管理云函数。', 'danger')
  } finally {
    state.runtime.feedbackLoading = false
    if (shouldRender) {
      renderFeedback()
    }
  }
}

async function refreshReferralData(options = {}) {
  if (!supportsReferralFetch()) {
    return
  }

  const shouldRender = options.renderOnFinish !== false

  try {
    state.runtime.referralLoading = true
    if (shouldRender) {
      renderReferrals()
    }
    const result = await provider.fetchReferrals(buildReferralFetchPayload())
    applyReferralResult(result)
  } catch (error) {
    setNotice(error.message || '刷新推荐与奖励失败，请检查推荐管理云函数。', 'danger')
  } finally {
    state.runtime.referralLoading = false
    if (shouldRender) {
      renderReferrals()
    }
  }
}

async function performFeedbackAction(payload, successText) {
  try {
    state.runtime.feedbackLoading = true
    setNotice('', 'info')
    renderFeedback()
    const result = await provider.updateFeedback(payload)
    if (result && result.feedback) {
      const index = state.feedbackItems.findIndex((item) => item.feedbackId === result.feedback.feedbackId)
      if (index >= 0) {
        state.feedbackItems[index] = normalizeFeedbackForUi(result.feedback)
      }
    }
    setNotice(successText, 'success')
    showToast(successText, 'success')
    await refreshData({ preserveSelection: true })
  } catch (error) {
    setNotice(error.message || '反馈处理失败，请稍后重试。', 'danger')
    showToast(error.message || '反馈处理失败，请稍后重试。', 'danger')
  } finally {
    state.runtime.feedbackLoading = false
    renderFeedback()
    renderAudit()
  }
}

async function performPlanAction(payload, successText) {
  try {
    state.runtime.loading = true
    setNotice('', 'info')
    render()
    await provider.updatePlan(payload)
    setNotice(successText, 'success')
    await refreshData({ preserveSelection: true })
  } catch (error) {
    state.runtime.loading = false
    setNotice(error.message || '商品保存失败，请稍后重试。', 'danger')
    render()
  }
}

async function performOrderAction(payload, successText) {
  try {
    state.runtime.loading = true
    setNotice('', 'info')
    render()
    await provider.updateOrderStatus(payload)
    setNotice(successText, 'success')
    await refreshData({ preserveSelection: true })
  } catch (error) {
    state.runtime.loading = false
    setNotice(error.message || '订单操作失败，请稍后重试。', 'danger')
    render()
  }
}

async function performAiModelConfigAction(payload, successText) {
  try {
    state.runtime.loading = true
    setNotice('', 'info')
    render()
    const result = await provider.updateAiModelConfig(payload)
    let nextConfig = result && result.config
    try {
      const freshConfigResult = await provider.getAiModelConfig()
      if (freshConfigResult && freshConfigResult.config) {
        nextConfig = freshConfigResult.config
      }
    } catch (error) {
      // Keep update success even if follow-up read fails.
    }
    state.aiModelConfig = normalizeAiModelConfig(nextConfig)
    state.runtime.lastSyncAt = formatDateTimeText(new Date())
    setNotice(successText, 'success')
  } catch (error) {
    setNotice(error.message || 'AI 模型配置保存失败，请稍后重试。', 'danger')
  } finally {
    state.runtime.loading = false
    render()
  }
}

async function performAiModelConfigTestAction(payload = {}) {
  try {
    state.runtime.loading = true
    setNotice('', 'info')
    render()
    const result = await provider.testAiModelConfig(payload)
    state.aiModelConfigTest = {
      testedAt: formatDateTimeText(new Date()),
      routeKey: toText(payload.routeKey || 'followup_summary'),
      ok: result && result.ok === true,
      source: toText(result && result.source),
      elapsedMs: toNumber(result && result.elapsedMs, 0),
      runtime: result && result.runtime ? result.runtime : {},
      probe: result && result.probe ? result.probe : {},
      error: toText(result && result.error),
      code: toText(result && result.code)
    }
    if (result && result.ok) {
      setNotice('AI 配置测试通过。', 'success')
    } else {
      setNotice(`AI 配置测试失败：${toText(result && result.error) || '请检查 provider 配置'}`, 'danger')
    }
  } catch (error) {
    state.aiModelConfigTest = {
      testedAt: formatDateTimeText(new Date()),
      routeKey: toText(payload.routeKey || 'followup_summary'),
      ok: false,
      source: '',
      elapsedMs: 0,
      runtime: {},
      probe: {},
      error: error && error.message ? error.message : '测试接口调用失败',
      code: ''
    }
    setNotice(error.message || 'AI 配置测试失败，请稍后重试。', 'danger')
  } finally {
    state.runtime.loading = false
    render()
  }
}

function readAiRouteCardPayload(card, routeKey, fallbackConfig) {
  const readField = (fieldName) => {
    const element = card.querySelector(`[data-ai-route-field="${fieldName}"]`)
    return element ? toText(element.value) : ''
  }
  const readChecked = (fieldName) => {
    const element = card.querySelector(`[data-ai-route-field="${fieldName}"]`)
    return Boolean(element && element.checked)
  }

  const fallbackRoute = fallbackConfig.modelRouting[routeKey] || DEFAULT_AI_MODEL_CONFIG.modelRouting[routeKey]
  return {
    providerKey: readField('providerKey') || fallbackRoute.providerKey || 'cloudbase_default',
    provider: readField('provider') || fallbackRoute.provider,
    model: readField('model') || fallbackRoute.model,
    fallbackProviderKey: readField('fallbackProviderKey') || fallbackRoute.fallbackProviderKey || '',
    fallbackModel: readField('fallbackModel') || fallbackRoute.fallbackModel || '',
    enabled: readChecked('enabled')
  }
}

function readAiProviderCardPayload(card, providerKey, fallbackConfig) {
  const readField = (fieldName) => {
    const element = card.querySelector(`[data-ai-provider-field="${fieldName}"]`)
    return element ? toText(element.value) : ''
  }
  const readChecked = (fieldName) => {
    const element = card.querySelector(`[data-ai-provider-field="${fieldName}"]`)
    return Boolean(element && element.checked)
  }

  const fallbackProvider = (fallbackConfig.providers && fallbackConfig.providers[providerKey]) || DEFAULT_AI_MODEL_CONFIG.providers[providerKey]
  const providerType = readField('providerType') === 'openai_compatible' ? 'openai_compatible' : 'cloudbase'
  const providerPreset = getAiProviderPreset(providerKey) || {}
  const hasModelPricingEditor = Boolean(card.querySelector('[data-ai-provider-model-pricing-row]'))
  const modelPricing = readModelPricingRows(card)
  const payload = {
    providerKey,
    providerType,
    protocolMode: normalizeProtocolMode(readField('protocolMode') || fallbackProvider.protocolMode || providerPreset.protocolMode || 'auto'),
    providerClass: readField('providerClass') || fallbackProvider.providerClass || providerPreset.providerClass || 'fallback',
    commercialTier: readField('commercialTier') || fallbackProvider.commercialTier || providerPreset.commercialTier || 'default',
    visibleLabel: readField('visibleLabel') || fallbackProvider.visibleLabel || providerPreset.visibleLabel || fallbackProvider.displayName || providerKey,
    displayName: readField('displayName') || fallbackProvider.displayName || providerPreset.displayName || providerKey,
    cloudbaseProvider: readField('cloudbaseProvider') || fallbackProvider.cloudbaseProvider || providerPreset.cloudbaseProvider || 'hunyuan-exp',
    baseURL: normalizeBridgeBase(readField('baseURL') || fallbackProvider.baseURL || providerPreset.baseURL || ''),
    defaultModel: readField('defaultModel') || fallbackProvider.defaultModel || providerPreset.defaultModel || 'hunyuan-turbos-latest',
    modelPricing: hasModelPricingEditor ? modelPricing : (fallbackProvider.modelPricing || {}),
    enabled: readChecked('enabled')
  }
  const apiKeyInput = readField('apiKeyInput')
  if (apiKeyInput) {
    payload.apiKey = apiKeyInput
  }
  return payload
}

function readModelPricingRows(card) {
  const result = {}
  const rows = card.querySelectorAll('[data-ai-provider-model-pricing-row]')
  rows.forEach((row) => {
    const staticModelField = row.querySelector('[data-ai-provider-model-pricing-model]')
    const customModelField = row.querySelector('[data-ai-provider-model-pricing-model-input]')
    const multiplierField = row.querySelector('[data-ai-provider-model-pricing-multiplier]')
    const model = staticModelField
      ? toText(staticModelField.value)
      : (customModelField ? toText(customModelField.value) : '')
    const multiplier = toNumber(multiplierField ? multiplierField.value : '', NaN)
    if (!model || !Number.isFinite(multiplier) || multiplier <= 0) {
      return
    }
    result[model] = {
      multiplier
    }
  })
  return result
}

function renderOrders() {
  const filteredOrders = state.orders.filter((item) => orderMatches(item, state.orderSearch, state.orderStatusFilter, state.orderReadinessFilter))
  const selectedOrder = getSelectedOrder()
  const pendingCount = state.orders.filter((item) => item.status === 'pending').length
  const paidCount = state.orders.filter((item) => item.status === 'paid').length
  const readyCount = state.orders.filter((item) => item.readiness === 'ready').length
  document.getElementById('orderCountMeta').textContent = `共 ${filteredOrders.length} 笔订单`
  document.getElementById('selectedOrderMeta').textContent = selectedOrder
    ? `${selectedOrder.orderId} · ${getOrderStatusLabel(selectedOrder.status)}`
    : '未选择订单'
  document.getElementById('ordersSummaryWrap').innerHTML = [
    {
      label: '待支付订单',
      value: `${pendingCount} 笔`,
      note: pendingCount > 0 ? '适合清理重复测试单，并继续验证支付承接。' : '当前没有待支付订单积压。'
    },
    {
      label: '可继续发起支付',
      value: `${readyCount} 笔`,
      note: readyCount > 0 ? '这批订单已具备继续支付条件。' : '当前还没有进入可发起支付阶段的订单。'
    },
    {
      label: '已支付订单',
      value: `${paidCount} 笔`,
      note: paidCount > 0 ? '适合继续核对到账、订阅生效和权益落地。' : '当前还没有正式支付完成的订单。'
    }
  ].map((item) => `
    <article class="section-summary-card">
      <div class="section-summary-label">${escapeHtml(item.label)}</div>
      <div class="section-summary-value">${escapeHtml(item.value)}</div>
      <div class="section-summary-note">${escapeHtml(item.note)}</div>
    </article>
  `).join('')

  if (!filteredOrders.length) {
    document.getElementById('ordersTableWrap').innerHTML = `<div class="empty-card">${escapeHtml(buildEmptyOrdersCopy())}</div>`
  } else {
    document.getElementById('ordersTableWrap').innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>订单号</th>
            <th>用户</th>
            <th>商品</th>
            <th>状态</th>
            <th>来源原因</th>
            <th>更新时间</th>
          </tr>
        </thead>
        <tbody>
          ${filteredOrders.map((item) => `
            <tr class="${selectedOrder && selectedOrder.orderId === item.orderId ? 'is-selected' : ''}">
              <td>
                <button class="data-row-button" data-order-id="${escapeHtml(item.orderId)}">
                  ${buildTableMainCell(item.orderId, item.accountId)}
                </button>
              </td>
              <td>${buildTableMainCell(item.phone || '未绑定手机号', item.phone ? '已绑定手机号' : '未绑定手机号')}</td>
              <td>${buildTableMainCell(item.title, `${getPlanTypeLabel(item.productType)} · ${item.amountText}`)}</td>
              <td>
                ${buildBadgeListMarkup([
                  `<span class="badge ${item.status === 'paid' ? 'is-success' : (item.status === 'pending' ? 'is-brand' : 'is-danger')}">${escapeHtml(getOrderStatusLabel(item.status))}</span>`,
                  `<span class="badge ${getReadinessBadgeClass(item.readiness)}">${escapeHtml(getReadinessLabel(item.readiness))}</span>`
                ])}
              </td>
              <td>${buildTableMainCell(getReasonLabel(item.sourceReason), item.pendingReason || '常规购买进入')}</td>
              <td>${buildTableMainCell(item.updatedAt || '-', item.channelOrderStatus || '未发起')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
  }

  document.querySelectorAll('[data-order-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedOrderId = button.dataset.orderId
      renderOrders()
    })
  })

  document.getElementById('orderDetailWrap').innerHTML = selectedOrder
    ? buildOrderDetailMarkup(selectedOrder)
    : '<div class="empty-card">请选择一笔订单后查看详情。</div>'

  bindOrderDetailActions(selectedOrder)
}

function buildCapabilityPillsMarkup(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return ''
  }

  return `
    <div class="capability-pill-row">
      ${items.map((item) => `<span class="capability-pill">${escapeHtml(item)}</span>`).join('')}
    </div>
  `
}

function buildFeatureListMarkup(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return ''
  }

  return `
    <div class="feature-list">
      ${items.map((item) => `
        <div class="feature-row">
          <span class="feature-dot"></span>
          <span class="feature-text">${escapeHtml(item)}</span>
        </div>
      `).join('')}
    </div>
  `
}

function buildTableMainCell(title = '', meta = '') {
  return `
    <div class="table-main-cell">
      <div class="table-main-title">${escapeHtml(title || '-')}</div>
      ${meta ? `<div class="table-main-meta">${escapeHtml(meta)}</div>` : ''}
    </div>
  `
}

function buildBadgeListMarkup(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return ''
  }

  return `
    <div class="table-badge-row">
      ${items.join('')}
    </div>
  `
}

function buildMiniPlanCardMarkup(plan, options = {}) {
  if (!plan) {
    return ''
  }

  const isCurrent = options.current === true
  const capabilityMarkup = buildCapabilityPillsMarkup(plan.capabilityLines || [])

  return `
    <article class="mini-plan-card ${isCurrent ? 'is-current' : ''}">
      <div class="mini-plan-head">
        <div>
          <div class="mini-kicker">${escapeHtml(getPlanTypeLabel(plan.planType))}</div>
          <div class="mini-plan-title">${escapeHtml(plan.planName)}</div>
          <div class="mini-plan-meta">${escapeHtml(plan.displayBillingText || plan.billingCycle || 'one_time')}</div>
        </div>
        <div class="mini-plan-side">
          ${isCurrent ? '<span class="badge is-success">当前套餐</span>' : ''}
          <div class="mini-plan-price">${escapeHtml(plan.amountText || '价格待定')}</div>
          ${plan.originalPriceText ? `<div class="mini-plan-original">原价 ${escapeHtml(plan.originalPriceText)}</div>` : ''}
        </div>
      </div>
      <div class="detail-grid purchase-summary-grid mini-plan-grid">
        <div>
          <div class="detail-item-label">项目数量</div>
          <div class="detail-item-value">${escapeHtml(formatProjectLimitText(plan.projectLimit))}</div>
        </div>
        <div>
          <div class="detail-item-label">语音额度</div>
          <div class="detail-item-value">${escapeHtml(formatVoiceQuotaText(plan.monthlyVoiceSeconds))}</div>
        </div>
        <div>
          <div class="detail-item-label">AI 额度</div>
          <div class="detail-item-value">${escapeHtml(formatAiQuotaText(plan.monthlyAiTokens))}</div>
        </div>
        <div>
          <div class="detail-item-label">价格模式</div>
          <div class="detail-item-value">${escapeHtml(plan.displayPriceText || '按真实价格展示')}</div>
        </div>
      </div>
      ${capabilityMarkup}
      ${plan.summary ? `<div class="order-note order-note-strong">${escapeHtml(plan.summary)}</div>` : ''}
    </article>
  `
}

function buildOrderPurchaseSummaryMarkup(order, plan) {
  const capabilityLines = plan && Array.isArray(plan.capabilityLines) ? plan.capabilityLines : []
  const featureLines = plan && Array.isArray(plan.featureLines) ? plan.featureLines : []
  const planName = order.title || (plan && plan.planName) || '当前商品'
  const billingText = (plan && plan.displayBillingText) || order.billingCycle || '-'
  const amountText = order.amountText || (plan && plan.amountText) || '价格待定'
  const originalPriceText = order.originalPriceText || (plan && plan.originalPriceText) || ''
  const projectText = plan ? formatProjectLimitText(plan.projectLimit) : '待同步'
  const voiceText = plan ? formatVoiceQuotaText(plan.monthlyVoiceSeconds) : '待同步'
  const aiText = plan ? formatAiQuotaText(plan.monthlyAiTokens) : '待同步'

  return `
    <section class="detail-card detail-card-hero">
      <div class="purchase-hero">
        <div class="purchase-hero-main">
          <div class="mini-kicker">${escapeHtml(getPlanTypeLabel((plan && plan.planType) || order.productType))}</div>
          <h4 class="purchase-title">${escapeHtml(planName)}</h4>
          <div class="purchase-subtitle">${escapeHtml(billingText)}</div>
          <div class="purchase-price-row">
            <div class="purchase-price">${escapeHtml(amountText)}</div>
            ${originalPriceText ? `<div class="purchase-original-price">原价 ${escapeHtml(originalPriceText)}</div>` : ''}
          </div>
        </div>
        <div class="badge ${order.status === 'paid' ? 'is-success' : (order.status === 'pending' ? 'is-brand' : 'is-danger')}">${escapeHtml(getOrderStatusLabel(order.status))}</div>
      </div>

      <div class="detail-grid purchase-summary-grid">
        <div>
          <div class="detail-item-label">计费周期</div>
          <div class="detail-item-value">${escapeHtml(billingText)}</div>
        </div>
        <div>
          <div class="detail-item-label">项目位</div>
          <div class="detail-item-value">${escapeHtml(projectText)}</div>
        </div>
        <div>
          <div class="detail-item-label">包含语音</div>
          <div class="detail-item-value">${escapeHtml(voiceText)}</div>
        </div>
        <div>
          <div class="detail-item-label">包含 AI</div>
          <div class="detail-item-value">${escapeHtml(aiText)}</div>
        </div>
      </div>
      ${buildCapabilityPillsMarkup(capabilityLines)}
      ${plan && plan.summary ? `<div class="order-note order-note-strong">${escapeHtml(plan.summary)}</div>` : ''}
      ${buildFeatureListMarkup(featureLines)}
    </section>
  `
}

function buildOrderDetailMarkup(order) {
  const plan = getPlanByCode(order.productCode)
  return `
    <div class="detail-stack">
      ${buildOrderPurchaseSummaryMarkup(order, plan)}

      <section class="detail-card">
        <h4 class="detail-card-title">订单概览</h4>
        <div class="detail-grid">
          <div>
            <div class="detail-item-label">订单状态</div>
            <div class="detail-item-value">${escapeHtml(getOrderStatusLabel(order.status))}</div>
          </div>
          <div>
            <div class="detail-item-label">订单号</div>
            <div class="detail-item-value">${escapeHtml(order.orderId)}</div>
          </div>
          <div>
            <div class="detail-item-label">支付准备</div>
            <div class="detail-item-value">${escapeHtml(getReadinessLabel(order.readiness))}</div>
          </div>
          <div>
            <div class="detail-item-label">来源原因</div>
            <div class="detail-item-value">${escapeHtml(getReasonLabel(order.sourceReason))}</div>
          </div>
          <div>
            <div class="detail-item-label">商品编码</div>
            <div class="detail-item-value">${escapeHtml(order.productCode || '-')}</div>
          </div>
          <div>
            <div class="detail-item-label">账户 ID</div>
            <div class="detail-item-value">${escapeHtml(order.accountId || '-')}</div>
          </div>
          <div>
            <div class="detail-item-label">手机号</div>
            <div class="detail-item-value">${escapeHtml(order.phone || '-')}</div>
          </div>
          <div>
            <div class="detail-item-label">创建时间</div>
            <div class="detail-item-value">${escapeHtml(order.createdAt || '-')}</div>
          </div>
          <div>
            <div class="detail-item-label">最近更新时间</div>
            <div class="detail-item-value">${escapeHtml(order.updatedAt || '-')}</div>
          </div>
        </div>
      </section>

      <section class="detail-card">
        <h4 class="detail-card-title">支付状态</h4>
        <div class="order-note">${escapeHtml(order.pendingReason || '当前无更多支付准备说明。')}</div>
        <div class="detail-grid">
          <div>
            <div class="detail-item-label">渠道下单状态</div>
            <div class="detail-item-value">${escapeHtml(order.channelOrderStatus || '-')}</div>
          </div>
          <div>
            <div class="detail-item-label">支付发起状态</div>
            <div class="detail-item-value">${order.canInvokePayment ? '可立即发起' : '暂不可发起'}</div>
          </div>
        </div>
      </section>

      ${order.status === 'pending' ? `
        <section class="detail-card">
          <h4 class="detail-card-title">订单动作</h4>
          <div class="detail-card-subtitle">用于清理重复测试单，或终止一笔已经不再继续推进的支付会话。</div>
          <div class="action-grid">
            <article class="action-card">
              <div class="action-card-title">关闭订单</div>
              <div class="action-card-desc">适合清理重复测试单、用户已放弃支付或当前订单不再继续使用的场景。</div>
              <div class="action-form">
                <textarea id="orderCloseReasonInput" class="form-textarea" placeholder="关闭原因">duplicate_manual_test_order</textarea>
                <div class="inline-actions">
                  <button id="closeOrderBtn" class="danger-btn" type="button">关闭当前订单</button>
                </div>
              </div>
            </article>
          </div>
        </section>
      ` : ''}
    </div>
  `
}

function bindOrderDetailActions(order) {
  if (!order || order.status !== 'pending') {
    return
  }

  const closeBtn = document.getElementById('closeOrderBtn')
  if (!closeBtn) {
    return
  }

  closeBtn.addEventListener('click', () => {
    const reasonInput = document.getElementById('orderCloseReasonInput')
    const reason = reasonInput && reasonInput.value
      ? reasonInput.value.trim()
      : 'duplicate_manual_test_order'

    performOrderAction({
      orderId: order.orderId,
      action: 'close',
      reason: reason || 'duplicate_manual_test_order'
    }, '已关闭订单并刷新数据。')
  })
}

function renderUsage() {
  const usageSummaries = Array.isArray(state.usageViewSummaries) ? state.usageViewSummaries : []
  const usageLedger = Array.isArray(state.usageViewLedger) ? state.usageViewLedger : []
  const filteredSummariesBase = usageSummaries.filter((item) => usageMatches(item, state.usageSearch, state.usageTypeFilter))
  const overviewUsageReport = state.overviewUsageReport && typeof state.overviewUsageReport === 'object'
    ? state.overviewUsageReport
    : buildUsageReportFromLocalData({
      summaries: usageSummaries,
      ledger: usageLedger,
      usageType: 'all',
      scope: {
        timeWindow: 'last_30d'
      }
    })
  const highRiskAccountIds = new Set((Array.isArray(overviewUsageReport.riskAccounts) ? overviewUsageReport.riskAccounts : [])
    .filter((item) => toText(item.riskLevel) === 'high')
    .map((item) => toText(item.accountId))
    .filter(Boolean))
  const filteredSummaries = filteredSummariesBase.filter((item) => {
    if (state.usageBalanceAlertFilter === 'voice_low') {
      return toNumber(item.voiceSecondsRemaining, 0) <= LOW_VOICE_ALERT_THRESHOLD
    }
    if (state.usageBalanceAlertFilter === 'ai_low') {
      return toNumber(item.aiTokensRemaining, 0) <= LOW_AI_ALERT_THRESHOLD
    }
    if (state.usageBalanceAlertFilter === 'both_low') {
      return toNumber(item.voiceSecondsRemaining, 0) <= LOW_VOICE_ALERT_THRESHOLD
        && toNumber(item.aiTokensRemaining, 0) <= LOW_AI_ALERT_THRESHOLD
    }
    if (state.usageBalanceAlertFilter === 'bind_required') {
      return Boolean(item.bindRequiredForWrite)
    }
    if (state.usageBalanceAlertFilter === 'expiring_soon') {
      const latestSubscription = item.latestSubscription && typeof item.latestSubscription === 'object'
        ? item.latestSubscription
        : {}
      return toText(latestSubscription.status) === 'active' && isDateExpiringSoon(latestSubscription.expiresAt)
    }
    if (state.usageBalanceAlertFilter === 'high_risk') {
      return highRiskAccountIds.has(toText(item.accountId))
    }
    if (state.usageBalanceAlertFilter === 'readonly') {
      return toText(item.currentAccessLevel).includes('readonly')
        || ['expired_readonly', 'free_limited'].includes(toText(item.status))
    }
    if (state.usageBalanceAlertFilter === 'project_blocked') {
      const projectLimit = toNumber(item.projectLimit, -1)
      return Boolean(item.canCreateProject) === false
        || (projectLimit >= 0 && toNumber(item.currentProjectCount, 0) >= projectLimit)
    }
    return true
  })
  const selectedSummaryFromState = getSelectedUsageSummary()
  const lowVoiceCount = usageSummaries.filter((item) => toNumber(item.voiceSecondsRemaining, 0) <= 0).length
  const lowAiCount = usageSummaries.filter((item) => toNumber(item.aiTokensRemaining, 0) <= 0).length
  const activeSubscriptionCount = usageSummaries.filter((item) => toText(item.latestSubscription && item.latestSubscription.status) === 'active').length
  const overviewAiEventStats = getUsageEventStatsByType(overviewUsageReport, 'ai_tokens')
  const overviewVoiceEventStats = getUsageEventStatsByType(overviewUsageReport, 'voice_seconds')
  const warningSummary = overviewUsageReport.warningSummary && typeof overviewUsageReport.warningSummary === 'object'
    ? overviewUsageReport.warningSummary
    : buildUsageWarningSummary(usageSummaries, [])
  const riskAccounts = Array.isArray(overviewUsageReport.riskAccounts) ? overviewUsageReport.riskAccounts.slice(0, 6) : []
  const planHealthStats = Array.isArray(overviewUsageReport.planHealthStats) ? overviewUsageReport.planHealthStats.slice(0, 6) : []
  document.getElementById('usageCountMeta').textContent = `共 ${filteredSummaries.length} 个账户视图`
  const filteredAccountIds = new Set(filteredSummaries.map((item) => toText(item.accountId)).filter(Boolean))
  if (!selectedSummaryFromState || !filteredAccountIds.has(toText(selectedSummaryFromState.accountId))) {
    state.selectedUsageAccountId = filteredSummaries[0] ? toText(filteredSummaries[0].accountId) : ''
  }
  const selectedSummary = filteredSummaries.find((item) => toText(item.accountId) === toText(state.selectedUsageAccountId)) || null
  const baseScopedLedger = usageLedger.filter((item) => {
    if (!filteredAccountIds.has(toText(item.accountId))) {
      return false
    }
    if (state.usageTypeFilter !== 'all' && toText(item.usageType) !== state.usageTypeFilter) {
      return false
    }
    if (!isUsageWithinTimeWindow(item, state.usageTimeWindow)) {
      return false
    }
    return true
  })
  const baseSourceTypes = new Set(baseScopedLedger.map((item) => toText(item.sourceType)).filter(Boolean))
  if (state.usageSourceFilter !== 'all' && !baseSourceTypes.has(state.usageSourceFilter)) {
    state.usageSourceFilter = 'all'
  }
  const scopedLedger = baseScopedLedger.filter((item) => matchesUsageProviderModel(item, state.usageProviderFilter, state.usageModelFilter))
  const sourceFilterSelect = document.getElementById('usageSourceFilterSelect')
  if (sourceFilterSelect) {
    const optionsMarkup = ['<option value="all">全部来源场景</option>']
      .concat(Array.from(baseSourceTypes).sort().map((sourceType) => `
        <option value="${escapeHtml(sourceType)}" ${state.usageSourceFilter === sourceType ? 'selected' : ''}>${escapeHtml(getSourceTypeLabel(sourceType))}</option>
      `))
      .join('')
    sourceFilterSelect.innerHTML = optionsMarkup
    sourceFilterSelect.value = state.usageSourceFilter
  }
  const scopedLedgerBySource = scopedLedger.filter((item) => {
    return state.usageSourceFilter === 'all' || toText(item.sourceType) === state.usageSourceFilter
  })

  document.getElementById('selectedUsageMeta').textContent = selectedSummary
    ? `${getAccountPrimaryPhone(selectedSummary)} · ${selectedSummary.latestSubscription.planName || '未开订阅'} · ${getAccessLabel(selectedSummary.currentAccessLevel)} · 场景：${getUsageSourceFilterLabel(state.usageSourceFilter)} · 流水：${scopedLedgerBySource.length} 条`
    : `未选择账户 · 场景：${getUsageSourceFilterLabel(state.usageSourceFilter)} · 流水：${scopedLedgerBySource.length} 条`
  const usageFilterStateWrap = document.getElementById('usageFilterStateWrap')
  const activeFilterPills = buildUsageFilterPills()
  if (usageFilterStateWrap) {
    usageFilterStateWrap.innerHTML = activeFilterPills.length
      ? `
        <div class="usage-filter-state">
          <div class="table-badge-row">
            ${activeFilterPills.map((item) => `<span class="badge is-neutral">${escapeHtml(item)}</span>`).join('')}
          </div>
          <button id="resetUsageFiltersBtn" class="link-btn" type="button">重置筛选</button>
        </div>
      `
      : '<div class="panel-meta">当前未启用额外筛选。</div>'
  }
  document.getElementById('usageSummaryWrap').innerHTML = [
    {
      label: '有效订阅账户',
      value: `${activeSubscriptionCount} 个`,
      note: activeSubscriptionCount > 0 ? '适合重点核对套餐、到期日和商品映射是否一致。' : '当前还没有处于有效订阅状态的账户。'
    },
    {
      label: '语音额度耗尽',
      value: `${lowVoiceCount} 个`,
      note: lowVoiceCount > 0 ? '这些账户会直接影响闪录和语音转写可用性。' : '当前没有语音额度耗尽账户。'
    },
    {
      label: 'AI 额度耗尽',
      value: `${lowAiCount} 个`,
      note: lowAiCount > 0 ? '这些账户会直接影响 AI 整理、识别和建议能力。' : '当前没有 AI 额度耗尽账户。'
    },
    {
      label: 'AI 调用成功率',
      value: formatPercentText(overviewAiEventStats.successRate),
      note: `成功 ${overviewAiEventStats.successCount || 0} 次 · 失败 ${overviewAiEventStats.failedCount || 0} 次`
    },
    {
      label: '语音调用成功率',
      value: formatPercentText(overviewVoiceEventStats.successRate),
      note: `成功 ${overviewVoiceEventStats.successCount || 0} 次 · 失败 ${overviewVoiceEventStats.failedCount || 0} 次`
    },
    {
      label: 'AI 平均响应',
      value: formatDurationMsText(overviewAiEventStats.avgDurationMs),
      note: `fallback ${overviewAiEventStats.fallbackCount || 0} 次 · 覆盖 ${overviewAiEventStats.coverAccountCount || 0} 个账户`
    }
  ].map((item) => `
    <article class="section-summary-card">
      <div class="section-summary-label">${escapeHtml(item.label)}</div>
      <div class="section-summary-value">${escapeHtml(item.value)}</div>
      <div class="section-summary-note">${escapeHtml(item.note)}</div>
    </article>
  `).join('')

  const lowVoiceThreshold = LOW_VOICE_ALERT_THRESHOLD
  const lowAiThreshold = LOW_AI_ALERT_THRESHOLD
  const lowVoiceAccounts = filteredSummariesBase.filter((item) => toNumber(item.voiceSecondsRemaining, 0) <= lowVoiceThreshold)
  const lowAiAccounts = filteredSummariesBase.filter((item) => toNumber(item.aiTokensRemaining, 0) <= lowAiThreshold)
  const bothLowAccounts = filteredSummariesBase.filter((item) => toNumber(item.voiceSecondsRemaining, 0) <= lowVoiceThreshold && toNumber(item.aiTokensRemaining, 0) <= lowAiThreshold)
  const usageAlertsWrap = document.getElementById('usageAlertsWrap')
  if (usageAlertsWrap) {
    const cards = [
      {
        key: 'voice_low',
        title: '语音低余额',
        value: `${lowVoiceAccounts.length} 个`,
        note: `阈值 ${formatVoiceQuotaText(lowVoiceThreshold)}`
      },
      {
        key: 'ai_low',
        title: 'AI 低余额',
        value: `${lowAiAccounts.length} 个`,
        note: `阈值 ${formatAiQuotaText(lowAiThreshold)}`
      },
      {
        key: 'both_low',
        title: '双低余额',
        value: `${bothLowAccounts.length} 个`,
        note: '语音和 AI 同时接近耗尽'
      }
    ]
    usageAlertsWrap.innerHTML = cards.map((card) => `
      <article class="usage-alert-card ${state.usageBalanceAlertFilter === card.key ? 'is-active' : ''}" data-usage-alert="${escapeHtml(card.key)}">
        <div class="usage-alert-title">${escapeHtml(card.title)}</div>
        <div class="usage-alert-value">${escapeHtml(card.value)}</div>
        <div class="usage-alert-note">${escapeHtml(card.note)}</div>
      </article>
    `).join('')
    usageAlertsWrap.querySelectorAll('[data-usage-alert]').forEach((card) => {
      card.addEventListener('click', () => {
        const next = toText(card.getAttribute('data-usage-alert'))
        state.usageBalanceAlertFilter = state.usageBalanceAlertFilter === next ? 'all' : next
        renderUsage()
      })
    })
  }

  const usageWarningSummaryWrap = document.getElementById('usageWarningSummaryWrap')
  if (usageWarningSummaryWrap) {
    usageWarningSummaryWrap.innerHTML = [
      {
        key: 'bind_required',
        label: '待绑定账户',
        value: `${warningSummary.bindRequiredCount || 0} 个`,
        note: '这批账户会影响正式写入、付费承接和后续权益归属。'
      },
      {
        key: 'expiring_soon',
        label: '7 天内到期',
        value: `${warningSummary.expiringSoonCount || 0} 个`,
        note: '建议提前触达，避免从已付费直接掉到只读。'
      },
      {
        key: 'high_risk',
        label: '高风险账户',
        value: `${warningSummary.highRiskCount || 0} 个`,
        note: '综合只读、额度告急、失败调用和项目受限情况得出。'
      },
      {
        key: 'readonly',
        label: '只读账户',
        value: `${warningSummary.readonlyCount || 0} 个`,
        note: '适合重点核对是否到期、未绑定或权益状态未恢复。'
      },
      {
        key: 'project_blocked',
        label: '项目受限',
        value: `${warningSummary.blockedProjectCount || 0} 个`,
        note: '包括项目上限、只读或不可新建状态。'
      },
      {
        key: 'both_low',
        label: '双低余额',
        value: `${warningSummary.bothLowCount || 0} 个`,
        note: '语音和 AI 同时接近耗尽，优先安排续费或补量。'
      }
    ].map((item) => `
      <button class="section-summary-card usage-warning-card ${state.usageBalanceAlertFilter === item.key ? 'is-active' : ''}" type="button" data-usage-warning-filter="${escapeHtml(item.key)}">
        <div class="section-summary-label">${escapeHtml(item.label)}</div>
        <div class="section-summary-value">${escapeHtml(item.value)}</div>
        <div class="section-summary-note">${escapeHtml(item.note)}</div>
      </button>
    `).join('')

    usageWarningSummaryWrap.querySelectorAll('[data-usage-warning-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        applyUsageOperationalFilter(button.getAttribute('data-usage-warning-filter'))
      })
    })
  }

  const usageSourceSummaryWrap = document.getElementById('usageSourceSummaryWrap')
  if (usageSourceSummaryWrap) {
    const sourceStatsRaw = buildUsageSourceStats(scopedLedger, state.usageTypeFilter)
      .filter((item) => (item.consumeCount > 0 || item.grantCount > 0))
    const selectedSourceType = toText(state.usageSourceFilter || 'all')
    const visibleSourceStats = sourceStatsRaw.slice(0, 8)
    if (selectedSourceType !== 'all') {
      const hasSelectedInVisible = visibleSourceStats.some((item) => toText(item.sourceType) === selectedSourceType)
      if (!hasSelectedInVisible) {
        const selectedStat = sourceStatsRaw.find((item) => toText(item.sourceType) === selectedSourceType)
        if (selectedStat) {
          visibleSourceStats.push(selectedStat)
        }
      }
    }

    const allCard = {
      label: '全部场景',
      sourceType: 'all',
      value: state.usageTypeFilter === 'voice_seconds'
        ? `-${formatVoiceQuotaText(sourceStatsRaw.reduce((sum, item) => sum + toNumber(item.consumeVoiceSeconds, 0), 0))}`
        : (state.usageTypeFilter === 'ai_tokens'
          ? `-${formatAiQuotaText(sourceStatsRaw.reduce((sum, item) => sum + toNumber(item.consumeAiTokens, 0), 0))}`
          : `${sourceStatsRaw.reduce((sum, item) => sum + toNumber(item.consumeCount, 0), 0)} 条消耗`),
      note: state.usageTypeFilter === 'voice_seconds'
        ? `流水 ${scopedLedger.length} 条 · 发放 ${formatVoiceQuotaText(sourceStatsRaw.reduce((sum, item) => sum + toNumber(item.grantVoiceSeconds, 0), 0))}`
        : (state.usageTypeFilter === 'ai_tokens'
          ? `流水 ${scopedLedger.length} 条 · 发放 ${formatAiQuotaText(sourceStatsRaw.reduce((sum, item) => sum + toNumber(item.grantAiTokens, 0), 0))}`
          : `流水 ${scopedLedger.length} 条 · 点击具体场景可聚焦详情流水`)
    }

    const cards = [allCard].concat(visibleSourceStats.map((item) => ({
      ...buildUsageSourceSummaryItem(item, state.usageTypeFilter),
      sourceType: item.sourceType
    })))

    usageSourceSummaryWrap.innerHTML = sourceStatsRaw.length
      ? `
        <div class="usage-source-meta">
          <span>当前口径流水：${escapeHtml(`${scopedLedgerBySource.length} / ${scopedLedger.length}`)} 条（按场景筛选后 / 当前筛选总量） · 场景展示 ${escapeHtml(`${visibleSourceStats.length} / ${sourceStatsRaw.length}`)}</span>
          ${state.usageSourceFilter !== 'all' ? '<button id="clearUsageSourceFilterBtn" class="link-btn" type="button">清除场景聚焦</button>' : ''}
        </div>
        <div class="usage-source-card-grid">
          ${cards.map((card) => {
            const sourceType = toText(card.sourceType || 'all')
            const isActive = sourceType === toText(state.usageSourceFilter || 'all')
            return `
              <article class="section-summary-card usage-source-card ${isActive ? 'is-active' : ''}" data-usage-source="${escapeHtml(sourceType)}" role="button" tabindex="0" aria-pressed="${isActive ? 'true' : 'false'}">
                <div class="section-summary-label">${escapeHtml(card.label)}</div>
                <div class="section-summary-value">${escapeHtml(card.value)}</div>
                <div class="section-summary-note">${escapeHtml(card.note)}</div>
              </article>
            `
          }).join('')}
        </div>
      `
      : '<article class="section-summary-card"><div class="section-summary-label">来源场景统计</div><div class="section-summary-value">暂无</div><div class="section-summary-note">当前筛选条件下还没有可统计的额度流水。</div></article>'

    usageSourceSummaryWrap.querySelectorAll('[data-usage-source]').forEach((card) => {
      const applySourceFilter = () => {
        const nextSource = toText(card.getAttribute('data-usage-source') || 'all') || 'all'
        state.usageSourceFilter = nextSource
        scheduleUsageViewRefresh()
      }
      card.addEventListener('click', () => {
        applySourceFilter()
      })
      card.addEventListener('keydown', (event) => {
        const key = event && event.key ? event.key : ''
        if (key !== 'Enter' && key !== ' ') {
          return
        }
        event.preventDefault()
        applySourceFilter()
      })
    })
    const clearUsageSourceFilterBtn = document.getElementById('clearUsageSourceFilterBtn')
    if (clearUsageSourceFilterBtn) {
      clearUsageSourceFilterBtn.addEventListener('click', () => {
        state.usageSourceFilter = 'all'
        if (sourceFilterSelect) {
          sourceFilterSelect.value = 'all'
        }
        scheduleUsageViewRefresh()
      })
    }
  }

  const providerStats = buildUsageProviderStats(scopedLedgerBySource).slice(0, 8)
  const usageProviderSummaryWrap = document.getElementById('usageProviderSummaryWrap')
  if (usageProviderSummaryWrap) {
    usageProviderSummaryWrap.innerHTML = providerStats.length
      ? providerStats.map((item) => {
        const active = toText(state.usageProviderFilter).toLowerCase() === toText(item.providerKey).toLowerCase()
        return `
          <article class="section-summary-card usage-provider-card ${active ? 'is-active' : ''}" data-usage-provider="${escapeHtml(item.providerKey)}">
            <div class="section-summary-label">${escapeHtml(item.providerLabel || item.providerKey)}</div>
            <div class="section-summary-value">${escapeHtml(formatAiQuotaText(item.consumeAiTokens))}</div>
            <div class="section-summary-note">AI 消耗 · ${escapeHtml(`${item.consumeCount} 条`)} · 语音 ${escapeHtml(formatVoiceQuotaText(item.consumeVoiceSeconds))}</div>
          </article>
        `
      }).join('')
      : '<article class="section-summary-card"><div class="section-summary-label">供应商维度</div><div class="section-summary-value">暂无</div><div class="section-summary-note">当前口径没有可识别的 providerKey。</div></article>'
    usageProviderSummaryWrap.querySelectorAll('[data-usage-provider]').forEach((card) => {
      card.addEventListener('click', () => {
        const next = toText(card.getAttribute('data-usage-provider'))
        state.usageProviderFilter = toText(state.usageProviderFilter).toLowerCase() === next.toLowerCase() ? '' : next
        const providerInput = document.getElementById('usageProviderFilterInput')
        if (providerInput) {
          providerInput.value = state.usageProviderFilter
        }
        scheduleUsageViewRefresh()
      })
    })
  }

  const modelStats = buildUsageModelStats(scopedLedgerBySource).slice(0, 8)
  const usageModelSummaryWrap = document.getElementById('usageModelSummaryWrap')
  if (usageModelSummaryWrap) {
    usageModelSummaryWrap.innerHTML = modelStats.length
      ? modelStats.map((item) => {
        const activeModel = toText(state.usageModelFilter).toLowerCase() === toText(item.model).toLowerCase()
        const activeProvider = toText(state.usageProviderFilter).toLowerCase() === toText(item.providerKey).toLowerCase()
        const active = activeModel && activeProvider
        return `
          <article class="section-summary-card usage-model-card ${active ? 'is-active' : ''}" data-usage-model="${escapeHtml(item.model)}" data-usage-provider="${escapeHtml(item.providerKey || '')}">
            <div class="section-summary-label">${escapeHtml(item.providerLabel || item.providerKey || 'unknown provider')}</div>
            <div class="section-summary-value">${escapeHtml(item.model)}</div>
            <div class="section-summary-note">AI 消耗 ${escapeHtml(formatAiQuotaText(item.consumeAiTokens))} · 消耗 ${escapeHtml(`${item.consumeCount} 条`)}</div>
          </article>
        `
      }).join('')
      : '<article class="section-summary-card"><div class="section-summary-label">模型维度</div><div class="section-summary-value">暂无</div><div class="section-summary-note">当前口径没有可识别的模型信息。</div></article>'
    usageModelSummaryWrap.querySelectorAll('[data-usage-model]').forEach((card) => {
      card.addEventListener('click', () => {
        const nextModel = toText(card.getAttribute('data-usage-model'))
        const nextProvider = toText(card.getAttribute('data-usage-provider'))
        const sameModel = toText(state.usageModelFilter).toLowerCase() === nextModel.toLowerCase()
        const sameProvider = toText(state.usageProviderFilter).toLowerCase() === nextProvider.toLowerCase()
        if (sameModel && sameProvider) {
          state.usageModelFilter = ''
          state.usageProviderFilter = ''
        } else {
          state.usageModelFilter = nextModel
          state.usageProviderFilter = nextProvider
        }
        const modelInput = document.getElementById('usageModelFilterInput')
        if (modelInput) {
          modelInput.value = state.usageModelFilter
        }
        const providerInput = document.getElementById('usageProviderFilterInput')
        if (providerInput) {
          providerInput.value = state.usageProviderFilter
        }
        scheduleUsageViewRefresh()
      })
    })
  }

  const usageAnomalyWrap = document.getElementById('usageAnomalyWrap')
  if (usageAnomalyWrap) {
    const topAccounts = buildUsageAccountAnomalyStats(filteredSummaries, scopedLedgerBySource)
      .filter((item) => item.consumeCount > 0)
      .slice(0, 6)
    const topSources = buildUsageSourceStats(scopedLedgerBySource, state.usageTypeFilter)
      .filter((item) => item.consumeCount > 0)
      .slice(0, 6)
    usageAnomalyWrap.innerHTML = `
      <div class="usage-anomaly-grid">
        <article class="usage-anomaly-card">
          <div class="usage-anomaly-title">高消耗账户 TOP</div>
          <div class="usage-anomaly-list">
            ${topAccounts.length
              ? topAccounts.map((item) => `
                <div class="usage-anomaly-item">
                  <div class="usage-anomaly-item-main">
                    <div class="usage-anomaly-item-title">${escapeHtml(item.phone)}</div>
                    <div class="usage-anomaly-item-meta">${escapeHtml(item.displayName || item.accountId)} · ${escapeHtml(item.accountId)}</div>
                  </div>
                  <div class="usage-anomaly-item-value">AI ${escapeHtml(formatAiQuotaText(item.consumeAiTokens))} · 语音 ${escapeHtml(formatVoiceQuotaText(item.consumeVoiceSeconds))}</div>
                </div>
              `).join('')
              : '<div class="empty-card">当前口径下未发现可判定的高消耗账户。</div>'}
          </div>
        </article>
        <article class="usage-anomaly-card">
          <div class="usage-anomaly-title">高消耗场景 TOP</div>
          <div class="usage-anomaly-list">
            ${topSources.length
              ? topSources.map((item) => `
                <div class="usage-anomaly-item">
                  <div class="usage-anomaly-item-main">
                    <div class="usage-anomaly-item-title">${escapeHtml(item.sourceLabel || item.sourceType)}</div>
                    <div class="usage-anomaly-item-meta">消耗 ${escapeHtml(`${item.consumeCount}`)} 条 · 发放 ${escapeHtml(`${item.grantCount}`)} 条</div>
                  </div>
                  <div class="usage-anomaly-item-value">AI ${escapeHtml(formatAiQuotaText(item.consumeAiTokens))} · 语音 ${escapeHtml(formatVoiceQuotaText(item.consumeVoiceSeconds))}</div>
                </div>
              `).join('')
              : '<div class="empty-card">当前口径下未发现可判定的高消耗场景。</div>'}
          </div>
        </article>
      </div>
    `
  }

  const usageRiskAccountsWrap = document.getElementById('usageRiskAccountsWrap')
  if (usageRiskAccountsWrap) {
    usageRiskAccountsWrap.innerHTML = riskAccounts.length
      ? `
        <div class="usage-anomaly-list">
          ${riskAccounts.map((item) => `
            <button class="usage-anomaly-item usage-anomaly-item-button" type="button" data-usage-risk-account="${escapeHtml(item.accountId)}">
              <div class="usage-anomaly-item-main">
                <div class="usage-anomaly-item-title">${escapeHtml(item.phone || item.accountId)}</div>
                <div class="usage-anomaly-item-meta">${escapeHtml(item.displayName || item.accountId)} · ${escapeHtml(item.planName || '未开订阅')}</div>
                <div class="usage-anomaly-item-meta">${escapeHtml((item.riskReasons || []).join(' · ') || '当前无额外风险说明')}</div>
              </div>
              <div class="usage-anomaly-item-side">
                <span class="badge ${getRiskBadgeClass(item.riskLevel)}">${escapeHtml(getRiskLevelLabel(item.riskLevel))}</span>
                <div class="usage-anomaly-item-value">风险分 ${escapeHtml(`${Math.round(toNumber(item.riskScore, 0))}`)}</div>
              </div>
            </button>
          `).join('')}
        </div>
      `
      : '<div class="empty-card">当前口径下未识别到需要优先排查的高风险账户。</div>'

    usageRiskAccountsWrap.querySelectorAll('[data-usage-risk-account]').forEach((button) => {
      button.addEventListener('click', () => {
        jumpToUsageAccount(button.getAttribute('data-usage-risk-account'))
      })
    })
  }

  const usagePlanHealthWrap = document.getElementById('usagePlanHealthWrap')
  if (usagePlanHealthWrap) {
    usagePlanHealthWrap.innerHTML = planHealthStats.length
      ? `
        <div class="usage-plan-health-grid">
          ${planHealthStats.map((item) => `
            <article class="usage-plan-health-card">
              <div class="usage-plan-health-head">
                <div>
                  <div class="usage-plan-health-title">${escapeHtml(item.planName || item.planCode || '未定义套餐')}</div>
                  <div class="usage-plan-health-meta">${escapeHtml(getPlanTypeLabel(item.planType))}${item.billingCycle ? ` · ${escapeHtml(item.billingCycle)}` : ''} · ${escapeHtml(`${item.accountCount} 个账户`)}</div>
                </div>
                <div class="usage-plan-health-score">
                  <span class="badge ${getHealthBadgeClass(item.healthLevel)}">${escapeHtml(getHealthLevelLabel(item.healthLevel))}</span>
                  <div class="usage-plan-health-score-value">${escapeHtml(`${Math.round(toNumber(item.healthScore, 0))}`)}</div>
                </div>
              </div>
              <div class="usage-plan-health-stats">
                <div class="usage-plan-health-stat">
                  <div class="usage-plan-health-stat-label">平均语音消耗率</div>
                  <div class="usage-plan-health-stat-value">${escapeHtml(formatRatioText(item.avgVoiceUsedRatio))}</div>
                </div>
                <div class="usage-plan-health-stat">
                  <div class="usage-plan-health-stat-label">平均 AI 消耗率</div>
                  <div class="usage-plan-health-stat-value">${escapeHtml(formatRatioText(item.avgAiUsedRatio))}</div>
                </div>
                <div class="usage-plan-health-stat">
                  <div class="usage-plan-health-stat-label">近 30 天语音消耗</div>
                  <div class="usage-plan-health-stat-value">${escapeHtml(formatVoiceQuotaText(item.consumeVoiceSeconds))}</div>
                </div>
                <div class="usage-plan-health-stat">
                  <div class="usage-plan-health-stat-label">近 30 天 AI 消耗</div>
                  <div class="usage-plan-health-stat-value">${escapeHtml(formatAiQuotaText(item.consumeAiTokens))}</div>
                </div>
              </div>
              <div class="table-badge-row usage-plan-health-badges">
                <span class="badge is-soft">低语音 ${escapeHtml(`${item.lowVoiceCount}`)}</span>
                <span class="badge is-soft">低 AI ${escapeHtml(`${item.lowAiCount}`)}</span>
                <span class="badge is-soft">双低 ${escapeHtml(`${item.bothLowCount}`)}</span>
                <span class="badge is-soft">项目受限 ${escapeHtml(`${item.blockedProjectCount}`)}</span>
                <span class="badge is-soft">待绑定 ${escapeHtml(`${item.bindRequiredCount}`)}</span>
                <span class="badge is-soft">即将到期 ${escapeHtml(`${item.expiresSoonCount}`)}</span>
              </div>
            </article>
          `).join('')}
        </div>
      `
      : '<div class="empty-card">当前还没有可分析的套餐健康数据。</div>'
  }

  const usageCallQualityWrap = document.getElementById('usageCallQualityWrap')
  if (usageCallQualityWrap) {
    usageCallQualityWrap.innerHTML = [
      {
        label: 'AI 成功率',
        value: formatPercentText(overviewAiEventStats.successRate),
        note: `成功 ${overviewAiEventStats.successCount || 0} 次 · 失败 ${overviewAiEventStats.failedCount || 0} 次`
      },
      {
        label: '语音成功率',
        value: formatPercentText(overviewVoiceEventStats.successRate),
        note: `成功 ${overviewVoiceEventStats.successCount || 0} 次 · 失败 ${overviewVoiceEventStats.failedCount || 0} 次`
      },
      {
        label: 'AI 平均时长',
        value: formatDurationMsText(overviewAiEventStats.avgDurationMs),
        note: `平均单次 ${formatAiQuotaText(overviewAiEventStats.avgBilledTokens)}`
      },
      {
        label: '语音平均时长',
        value: formatDurationMsText(overviewVoiceEventStats.avgDurationMs),
        note: `平均单次 ${formatVoiceQuotaText(overviewVoiceEventStats.avgBilledSeconds)}`
      }
    ].map((item) => `
      <article class="section-summary-card">
        <div class="section-summary-label">${escapeHtml(item.label)}</div>
        <div class="section-summary-value">${escapeHtml(item.value)}</div>
        <div class="section-summary-note">${escapeHtml(item.note)}</div>
      </article>
    `).join('')
  }

  const usageRouteInsightsWrap = document.getElementById('usageRouteInsightsWrap')
  if (usageRouteInsightsWrap) {
    const routeStats = Array.isArray(overviewUsageReport.routeStats) ? overviewUsageReport.routeStats.slice(0, 6) : []
    usageRouteInsightsWrap.innerHTML = routeStats.length
      ? `
        <div class="usage-anomaly-list">
          ${routeStats.map((item) => `
            <div class="usage-anomaly-item">
              <div class="usage-anomaly-item-main">
                <div class="usage-anomaly-item-title">${escapeHtml(item.routeLabel || getUsageRouteLabel(item.routeKey))}</div>
                <div class="usage-anomaly-item-meta">
                  ${escapeHtml(`${item.providerLabel || item.providerKey || '未识别供应商'}${item.model ? ` · ${item.model}` : ''}`)} · 成功 ${escapeHtml(formatPercentText(item.successRate))} · fallback ${escapeHtml(`${item.fallbackCount || 0}`)} 次
                </div>
              </div>
              <div class="usage-anomaly-item-value">${escapeHtml(formatAiQuotaText(item.avgBilledTokens))}</div>
            </div>
          `).join('')}
        </div>
      `
      : '<div class="empty-card">当前还没有可分析的 AI 路由事件。</div>'
  }

  const usageModelEfficiencyWrap = document.getElementById('usageModelEfficiencyWrap')
  if (usageModelEfficiencyWrap) {
    const modelEfficiencyStats = Array.isArray(overviewUsageReport.modelEfficiencyStats) ? overviewUsageReport.modelEfficiencyStats.slice(0, 6) : []
    const sourceEfficiencyStats = Array.isArray(overviewUsageReport.sourceEfficiencyStats)
      ? overviewUsageReport.sourceEfficiencyStats.filter((item) => item.usageType === 'voice_seconds').slice(0, 4)
      : []
    usageModelEfficiencyWrap.innerHTML = `
      <div class="usage-anomaly-grid">
        <article class="usage-anomaly-card">
          <div class="usage-anomaly-title">模型效率</div>
          <div class="usage-anomaly-list">
            ${modelEfficiencyStats.length
              ? modelEfficiencyStats.map((item) => `
                <div class="usage-anomaly-item">
                  <div class="usage-anomaly-item-main">
                    <div class="usage-anomaly-item-title">${escapeHtml(item.model || '未识别模型')}</div>
                    <div class="usage-anomaly-item-meta">${escapeHtml(item.providerLabel || item.providerKey || '未知供应商')} · 均耗时 ${escapeHtml(formatDurationMsText(item.avgDurationMs))} · 成功 ${escapeHtml(formatPercentText(item.successRate))}</div>
                  </div>
                  <div class="usage-anomaly-item-value">${escapeHtml(formatAiQuotaText(item.avgBilledTokens))}</div>
                </div>
              `).join('')
              : '<div class="empty-card">当前还没有可分析的模型效率数据。</div>'}
          </div>
        </article>
        <article class="usage-anomaly-card">
          <div class="usage-anomaly-title">语音场景均值</div>
          <div class="usage-anomaly-list">
            ${sourceEfficiencyStats.length
              ? sourceEfficiencyStats.map((item) => `
                <div class="usage-anomaly-item">
                  <div class="usage-anomaly-item-main">
                    <div class="usage-anomaly-item-title">${escapeHtml(item.sourceLabel || getSourceTypeLabel(item.sourceType))}</div>
                    <div class="usage-anomaly-item-meta">成功 ${escapeHtml(formatPercentText(item.successRate))} · 均耗时 ${escapeHtml(formatDurationMsText(item.avgDurationMs))}</div>
                  </div>
                  <div class="usage-anomaly-item-value">${escapeHtml(formatVoiceQuotaText(item.avgBilledSeconds))}</div>
                </div>
              `).join('')
              : '<div class="empty-card">当前还没有可分析的语音场景均值。</div>'}
          </div>
        </article>
      </div>
    `
  }

  const resetUsageFiltersBtn = document.getElementById('resetUsageFiltersBtn')
  if (resetUsageFiltersBtn) {
    resetUsageFiltersBtn.addEventListener('click', () => {
      resetUsageFilters()
      scheduleUsageViewRefresh()
    })
  }

  if (!filteredSummaries.length) {
    document.getElementById('usageTableWrap').innerHTML = `<div class="empty-card">${escapeHtml(buildEmptyUsageCopy())}</div>`
  } else {
    document.getElementById('usageTableWrap').innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>账户</th>
            <th>当前套餐</th>
            <th>语音额度</th>
            <th>AI 额度</th>
            <th>最近流水</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          ${filteredSummaries.map((item) => `
            <tr class="${selectedSummary && selectedSummary.accountId === item.accountId ? 'is-selected' : ''}">
              <td>
                <button class="data-row-button" data-usage-account-id="${escapeHtml(item.accountId)}">
                  ${buildTableMainCell(getAccountPrimaryPhone(item), getAccountSecondaryMeta(item) || (item.phoneVerified ? '已绑定手机号' : '未绑定手机号'))}
                </button>
              </td>
              <td>${buildTableMainCell(item.latestSubscription.planName || '未开订阅', getAccessLabel(item.currentAccessLevel))}</td>
              <td>${buildTableMainCell(formatVoiceQuotaText(item.voiceSecondsRemaining), `总量 ${formatVoiceQuotaText(item.voiceSecondsTotal)}`)}</td>
              <td>${buildTableMainCell(formatAiQuotaText(item.aiTokensRemaining), `总量 ${formatAiQuotaText(item.aiTokensTotal)}`)}</td>
              <td>${buildTableMainCell(item.latestUsageAt || '暂无流水', item.reasonSummary || '当前无额外说明')}</td>
              <td>
                ${buildBadgeListMarkup([
                  `<span class="badge ${getStatusBadgeClass(item.status)}">${escapeHtml(getStatusLabel(item.status))}</span>`,
                  item.bindRequiredForWrite
                    ? '<span class="badge is-soft">待绑定</span>'
                    : '<span class="badge is-success">正式可写</span>'
                ])}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
  }

  document.querySelectorAll('[data-usage-account-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedUsageAccountId = button.dataset.usageAccountId
      renderUsage()
    })
  })

  document.getElementById('usageDetailWrap').innerHTML = selectedSummary
    ? buildUsageDetailMarkup(selectedSummary)
    : '<div class="empty-card">请选择一个账户后查看额度与订阅详情。当前来源场景筛选仍会影响右侧流水展示。</div>'

  renderPlanCatalogSummary()
  renderPlanCatalog()
}

function renderGlobalUsage() {
  const usageSummaries = Array.isArray(state.globalUsageSummaries) ? state.globalUsageSummaries : []
  const usageLedger = Array.isArray(state.globalUsageLedger) ? state.globalUsageLedger : []
  const usageReport = state.globalUsageReport && typeof state.globalUsageReport === 'object'
    ? state.globalUsageReport
    : buildUsageReportFromLocalData({
      summaries: usageSummaries,
      ledger: usageLedger,
      usageType: getGlobalUsageActiveType(),
      pageInfo: state.globalUsagePageInfo
    })
  const pageInfo = normalizeUsagePageInfo(
    state.globalUsagePageInfo || (usageReport && usageReport.pageInfo) || {},
    Array.isArray(usageLedger) ? usageLedger.length : 0,
    state.globalUsagePageSize
  )
  const summaryMap = usageSummaries.reduce((map, item) => {
    const accountId = toText(item.accountId)
    if (accountId) {
      map[accountId] = item
    }
    return map
  }, {})
  const activeType = getGlobalUsageActiveType()
  const isAiView = activeType === 'ai_tokens'
  const activeEventStats = getUsageEventStatsByType(usageReport, activeType)
  const searchInput = document.getElementById('globalUsageSearchInput')
  const timeWindowFilter = document.getElementById('globalUsageTimeWindowFilter')
  const sourceFilterSelect = document.getElementById('globalUsageSourceFilterSelect')
  const providerInput = document.getElementById('globalUsageProviderFilterInput')
  const modelInput = document.getElementById('globalUsageModelFilterInput')
  const aiOnlyFilters = document.getElementById('globalUsageAiOnlyFilters')
  const sourceSummaryWrap = document.getElementById('globalUsageSourceSummaryWrap')
  const distributionWrap = document.getElementById('globalUsageDistributionWrap')
  const distributionTitle = document.getElementById('globalUsageDistributionTitle')
  const distributionMeta = document.getElementById('globalUsageDistributionMeta')
  const anomalyWrap = document.getElementById('globalUsageAnomalyWrap')
  const summaryWrap = document.getElementById('globalUsageSummaryWrap')
  const ledgerWrap = document.getElementById('globalUsageLedgerWrap')
  const countMeta = document.getElementById('globalUsageCountMeta')
  const filterStateWrap = document.getElementById('globalUsageFilterStateWrap')

  if (!searchInput || !timeWindowFilter || !sourceFilterSelect || !sourceSummaryWrap || !distributionWrap || !anomalyWrap || !summaryWrap || !ledgerWrap || !countMeta || !filterStateWrap) {
    return
  }

  document.querySelectorAll('[data-global-usage-tab]').forEach((button) => {
    const isActive = toText(button.getAttribute('data-global-usage-tab')) === activeType
    button.classList.toggle('is-active', isActive)
    button.setAttribute('aria-selected', isActive ? 'true' : 'false')
  })

  searchInput.placeholder = isAiView
    ? '搜索手机号 / 账户 ID / Trace / 模型 / 项目'
    : '搜索手机号 / 账户 ID / Trace / 页面 / 项目'
  searchInput.value = state.globalUsageSearch
  timeWindowFilter.value = state.globalUsageTimeWindow
  if (providerInput) {
    providerInput.value = state.globalUsageProviderFilter
  }
  if (modelInput) {
    modelInput.value = state.globalUsageModelFilter
  }
  if (aiOnlyFilters) {
    aiOnlyFilters.classList.toggle('is-hidden', !isAiView)
  }
  const baseSourceTypes = Array.from(
    new Set((Array.isArray(usageReport.sourceStats) ? usageReport.sourceStats : []).map((item) => toText(item.sourceType)).filter(Boolean))
  ).sort()
  if (state.globalUsageSourceFilter !== 'all' && !baseSourceTypes.includes(state.globalUsageSourceFilter)) {
    baseSourceTypes.push(state.globalUsageSourceFilter)
  }
  sourceFilterSelect.innerHTML = ['<option value="all">全部来源场景</option>']
    .concat(baseSourceTypes.map((sourceType) => `
      <option value="${escapeHtml(sourceType)}" ${state.globalUsageSourceFilter === sourceType ? 'selected' : ''}>${escapeHtml(getSourceTypeLabel(sourceType))}</option>
    `))
    .join('')
  sourceFilterSelect.value = state.globalUsageSourceFilter
  const scopedLedger = usageLedger.slice().sort((left, right) => parseDateMs(right.occurredAt) - parseDateMs(left.occurredAt))
  const ledgerStats = usageReport.stats && typeof usageReport.stats === 'object'
    ? usageReport.stats
    : buildUsageLedgerStats(scopedLedger)
  const activeFilterPills = buildGlobalUsageFilterPills()

  filterStateWrap.innerHTML = activeFilterPills.length
    ? `
      <div class="usage-filter-state">
        <div class="table-badge-row">
          ${activeFilterPills.map((item) => `<span class="badge is-neutral">${escapeHtml(item)}</span>`).join('')}
        </div>
        <button id="resetGlobalUsageFiltersBtn" class="link-btn" type="button">重置筛选</button>
      </div>
    `
    : '<div class="panel-meta">当前未启用额外筛选。</div>'

  summaryWrap.innerHTML = [
    {
      label: '当前口径流水',
      value: `${pageInfo.total} 条`,
      note: `${state.globalUsageSourceFilter === 'all' ? '全部场景' : getUsageSourceFilterLabel(state.globalUsageSourceFilter)} · ${getUsageTimeWindowLabel(state.globalUsageTimeWindow)}`
    },
    {
      label: isAiView ? 'AI token 消耗' : '语音消耗时长',
      value: isAiView ? formatAiQuotaText(ledgerStats.consumeAiTokens) : formatVoiceQuotaText(ledgerStats.consumeVoiceSeconds),
      note: `消耗 ${ledgerStats.consumeCount} 条`
    },
    {
      label: isAiView ? 'AI token 回补' : '语音回补时长',
      value: isAiView ? formatAiQuotaText(ledgerStats.grantAiTokens) : formatVoiceQuotaText(ledgerStats.grantVoiceSeconds),
      note: `发放 ${ledgerStats.grantCount} 条`
    },
    {
      label: '覆盖账户',
      value: `${toNumber(usageReport.coverAccountCount, 0)} 个`,
      note: isAiView ? `fallback ${ledgerStats.fallbackCount} 次` : '去重后按 accountId 统计'
    },
    {
      label: '调用成功率',
      value: formatPercentText(activeEventStats.successRate),
      note: `成功 ${activeEventStats.successCount || 0} 次 · 失败 ${activeEventStats.failedCount || 0} 次`
    },
    {
      label: '平均响应时长',
      value: formatDurationMsText(activeEventStats.avgDurationMs),
      note: isAiView
        ? `平均单次 ${formatAiQuotaText(activeEventStats.avgBilledTokens)}`
        : `平均单次 ${formatVoiceQuotaText(activeEventStats.avgBilledSeconds)}`
    }
  ].map((item) => `
    <article class="section-summary-card">
      <div class="section-summary-label">${escapeHtml(item.label)}</div>
      <div class="section-summary-value">${escapeHtml(item.value)}</div>
      <div class="section-summary-note">${escapeHtml(item.note)}</div>
    </article>
  `).join('')

  const sourceStatsRaw = (Array.isArray(usageReport.sourceStats) ? usageReport.sourceStats : [])
    .filter((item) => item.consumeCount > 0 || item.grantCount > 0)
  const visibleSourceStats = sourceStatsRaw.slice(0, 8)
  const selectedSourceType = toText(state.globalUsageSourceFilter || 'all')
  if (selectedSourceType !== 'all' && !visibleSourceStats.some((item) => toText(item.sourceType) === selectedSourceType)) {
    const selectedStat = sourceStatsRaw.find((item) => toText(item.sourceType) === selectedSourceType)
    if (selectedStat) {
      visibleSourceStats.push(selectedStat)
    }
  }
  const allSourceCard = {
    label: '全部场景',
    sourceType: 'all',
    value: isAiView
      ? `-${formatAiQuotaText(ledgerStats.consumeAiTokens)}`
      : `-${formatVoiceQuotaText(ledgerStats.consumeVoiceSeconds)}`,
    note: isAiView
      ? `流水 ${pageInfo.total} 条 · 回补 ${formatAiQuotaText(ledgerStats.grantAiTokens)}`
      : `流水 ${pageInfo.total} 条 · 回补 ${formatVoiceQuotaText(ledgerStats.grantVoiceSeconds)}`
  }
  const sourceCards = [allSourceCard].concat(visibleSourceStats.map((item) => ({
    ...buildUsageSourceSummaryItem(item, activeType),
    sourceType: item.sourceType
  })))
  sourceSummaryWrap.innerHTML = sourceStatsRaw.length
    ? `
      <div class="usage-source-meta">
        <span>当前展示第 ${escapeHtml(`${pageInfo.page}`)} 页 / 共 ${escapeHtml(`${pageInfo.totalPages}`)} 页 · 总量 ${escapeHtml(`${pageInfo.total}`)} 条</span>
        ${state.globalUsageSourceFilter !== 'all' ? '<button id="clearGlobalUsageSourceFilterBtn" class="link-btn" type="button">清除场景聚焦</button>' : ''}
      </div>
      <div class="usage-source-card-grid">
        ${sourceCards.map((card) => {
          const sourceType = toText(card.sourceType || 'all')
          const isActive = sourceType === selectedSourceType
          return `
            <article class="section-summary-card usage-source-card ${isActive ? 'is-active' : ''}" data-global-usage-source="${escapeHtml(sourceType)}" role="button" tabindex="0" aria-pressed="${isActive ? 'true' : 'false'}">
              <div class="section-summary-label">${escapeHtml(card.label)}</div>
              <div class="section-summary-value">${escapeHtml(card.value)}</div>
              <div class="section-summary-note">${escapeHtml(card.note)}</div>
            </article>
          `
        }).join('')}
      </div>
    `
    : '<article class="section-summary-card"><div class="section-summary-label">来源场景统计</div><div class="section-summary-value">暂无</div><div class="section-summary-note">当前筛选口径下还没有可统计的流水。</div></article>'

  if (isAiView) {
    const providerStats = (Array.isArray(usageReport.providerStats) ? usageReport.providerStats : []).slice(0, 8)
    const modelStats = (Array.isArray(usageReport.modelStats) ? usageReport.modelStats : []).slice(0, 8)
    if (distributionTitle) {
      distributionTitle.textContent = '供应商与模型分布'
    }
    if (distributionMeta) {
      distributionMeta.textContent = '点击卡片可直接聚焦到指定供应商或模型。'
    }
    distributionWrap.innerHTML = `
      <div class="usage-provider-model-grid">
        <div>
          <div class="usage-subtitle">供应商维度</div>
          <div class="usage-source-summary-wrap">
            ${providerStats.length
              ? providerStats.map((item) => {
                const active = toText(state.globalUsageProviderFilter).toLowerCase() === toText(item.providerKey).toLowerCase()
                return `
                  <article class="section-summary-card usage-provider-card ${active ? 'is-active' : ''}" data-global-usage-provider="${escapeHtml(item.providerKey)}">
                    <div class="section-summary-label">${escapeHtml(item.providerLabel || item.providerKey)}</div>
                    <div class="section-summary-value">${escapeHtml(formatAiQuotaText(item.consumeAiTokens))}</div>
                    <div class="section-summary-note">消耗 ${escapeHtml(`${item.consumeCount}`)} 条 · 语音 ${escapeHtml(formatVoiceQuotaText(item.consumeVoiceSeconds))}</div>
                  </article>
                `
              }).join('')
              : '<article class="section-summary-card"><div class="section-summary-label">供应商维度</div><div class="section-summary-value">暂无</div><div class="section-summary-note">当前口径没有可识别的 providerKey。</div></article>'}
          </div>
        </div>
        <div>
          <div class="usage-subtitle">模型维度</div>
          <div class="usage-source-summary-wrap">
            ${modelStats.length
              ? modelStats.map((item) => {
                const activeModel = toText(state.globalUsageModelFilter).toLowerCase() === toText(item.model).toLowerCase()
                const activeProvider = toText(state.globalUsageProviderFilter).toLowerCase() === toText(item.providerKey).toLowerCase()
                const active = activeModel && activeProvider
                return `
                  <article class="section-summary-card usage-model-card ${active ? 'is-active' : ''}" data-global-usage-model="${escapeHtml(item.model)}" data-global-usage-provider="${escapeHtml(item.providerKey || '')}">
                    <div class="section-summary-label">${escapeHtml(item.providerLabel || item.providerKey || 'unknown provider')}</div>
                    <div class="section-summary-value">${escapeHtml(item.model)}</div>
                    <div class="section-summary-note">消耗 ${escapeHtml(formatAiQuotaText(item.consumeAiTokens))} · ${escapeHtml(`${item.consumeCount}`)} 条</div>
                  </article>
                `
              }).join('')
              : '<article class="section-summary-card"><div class="section-summary-label">模型维度</div><div class="section-summary-value">暂无</div><div class="section-summary-note">当前口径没有可识别的模型信息。</div></article>'}
          </div>
        </div>
      </div>
    `
  } else {
    const pageStats = (Array.isArray(usageReport.pageStats) ? usageReport.pageStats : []).slice(0, 6)
    const projectStats = (Array.isArray(usageReport.projectStats) ? usageReport.projectStats : []).slice(0, 6)
    if (distributionTitle) {
      distributionTitle.textContent = '入口与项目分布'
    }
    if (distributionMeta) {
      distributionMeta.textContent = '聚焦语音主要消耗在哪些入口页、哪些项目上。'
    }
    distributionWrap.innerHTML = `
      <div class="usage-provider-model-grid">
        <article class="usage-anomaly-card">
          <div class="usage-anomaly-title">入口页 TOP</div>
          <div class="usage-anomaly-list">
            ${pageStats.length
              ? pageStats.map((item) => `
                <div class="usage-anomaly-item">
                  <div class="usage-anomaly-item-main">
                    <div class="usage-anomaly-item-title">${escapeHtml(item.label)}</div>
                    <div class="usage-anomaly-item-meta">消耗 ${escapeHtml(`${item.consumeCount}`)} 条 · 总流水 ${escapeHtml(`${item.records}`)} 条</div>
                  </div>
                  <div class="usage-anomaly-item-value">${escapeHtml(formatVoiceQuotaText(item.consumeAmount))}</div>
                </div>
              `).join('')
              : '<div class="empty-card">当前口径下还没有可识别的入口页信息。</div>'}
          </div>
        </article>
        <article class="usage-anomaly-card">
          <div class="usage-anomaly-title">项目维度 TOP</div>
          <div class="usage-anomaly-list">
            ${projectStats.length
              ? projectStats.map((item) => `
                <div class="usage-anomaly-item">
                  <div class="usage-anomaly-item-main">
                    <div class="usage-anomaly-item-title">${escapeHtml(item.label)}</div>
                    <div class="usage-anomaly-item-meta">消耗 ${escapeHtml(`${item.consumeCount}`)} 条 · 总流水 ${escapeHtml(`${item.records}`)} 条</div>
                  </div>
                  <div class="usage-anomaly-item-value">${escapeHtml(formatVoiceQuotaText(item.consumeAmount))}</div>
                </div>
              `).join('')
              : '<div class="empty-card">当前口径下还没有可识别的项目归属。</div>'}
          </div>
        </article>
      </div>
    `
  }

  const topAccounts = (Array.isArray(usageReport.accountStats) ? usageReport.accountStats : [])
    .filter((item) => item.consumeCount > 0)
    .slice(0, 6)
  const topSources = sourceStatsRaw
    .filter((item) => item.consumeCount > 0)
    .slice(0, 6)
  anomalyWrap.innerHTML = `
    <div class="usage-anomaly-grid">
      <article class="usage-anomaly-card">
        <div class="usage-anomaly-title">高消耗账户 TOP</div>
        <div class="usage-anomaly-list">
          ${topAccounts.length
            ? topAccounts.map((item) => `
              <div class="usage-anomaly-item">
                <div class="usage-anomaly-item-main">
                  <div class="usage-anomaly-item-title">${escapeHtml(item.phone)}</div>
                  <div class="usage-anomaly-item-meta">${escapeHtml(item.displayName || item.accountId)} · ${escapeHtml(item.accountId)}</div>
                </div>
                <div class="usage-anomaly-item-value">${escapeHtml(isAiView ? formatAiQuotaText(item.consumeAiTokens) : formatVoiceQuotaText(item.consumeVoiceSeconds))}</div>
              </div>
            `).join('')
            : '<div class="empty-card">当前口径下未发现可判定的高消耗账户。</div>'}
        </div>
      </article>
      <article class="usage-anomaly-card">
        <div class="usage-anomaly-title">高消耗场景 TOP</div>
        <div class="usage-anomaly-list">
          ${topSources.length
            ? topSources.map((item) => `
              <div class="usage-anomaly-item">
                <div class="usage-anomaly-item-main">
                  <div class="usage-anomaly-item-title">${escapeHtml(item.sourceLabel || item.sourceType)}</div>
                  <div class="usage-anomaly-item-meta">消耗 ${escapeHtml(`${item.consumeCount}`)} 条 · 发放 ${escapeHtml(`${item.grantCount}`)} 条</div>
                </div>
                <div class="usage-anomaly-item-value">${escapeHtml(isAiView ? formatAiQuotaText(item.consumeAiTokens) : formatVoiceQuotaText(item.consumeVoiceSeconds))}</div>
              </div>
            `).join('')
            : '<div class="empty-card">当前口径下未发现可判定的高消耗场景。</div>'}
        </div>
      </article>
    </div>
  `

  const globalUsageQualityWrap = document.getElementById('globalUsageQualityWrap')
  if (globalUsageQualityWrap) {
    if (isAiView) {
      const routeStats = (Array.isArray(usageReport.routeStats) ? usageReport.routeStats : []).slice(0, 6)
      globalUsageQualityWrap.innerHTML = `
        <div class="usage-anomaly-list">
          ${routeStats.length
            ? routeStats.map((item) => `
              <div class="usage-anomaly-item">
                <div class="usage-anomaly-item-main">
                  <div class="usage-anomaly-item-title">${escapeHtml(item.routeLabel || getUsageRouteLabel(item.routeKey))}</div>
                  <div class="usage-anomaly-item-meta">${escapeHtml(`${item.providerLabel || item.providerKey || '未识别供应商'}${item.model ? ` · ${item.model}` : ''}`)} · 成功 ${escapeHtml(formatPercentText(item.successRate))} · fallback ${escapeHtml(`${item.fallbackCount || 0}`)} 次</div>
                </div>
                <div class="usage-anomaly-item-value">${escapeHtml(formatAiQuotaText(item.avgBilledTokens))}</div>
              </div>
            `).join('')
            : '<div class="empty-card">当前筛选口径下还没有可分析的 AI 路由质量。</div>'}
        </div>
      `
    } else {
      const voiceQualityStats = (Array.isArray(usageReport.sourceEfficiencyStats) ? usageReport.sourceEfficiencyStats : [])
        .filter((item) => item.usageType === 'voice_seconds')
        .slice(0, 6)
      globalUsageQualityWrap.innerHTML = `
        <div class="usage-anomaly-list">
          ${voiceQualityStats.length
            ? voiceQualityStats.map((item) => `
              <div class="usage-anomaly-item">
                <div class="usage-anomaly-item-main">
                  <div class="usage-anomaly-item-title">${escapeHtml(item.sourceLabel || getSourceTypeLabel(item.sourceType))}</div>
                  <div class="usage-anomaly-item-meta">成功 ${escapeHtml(formatPercentText(item.successRate))} · 平均耗时 ${escapeHtml(formatDurationMsText(item.avgDurationMs))} · 失败 ${escapeHtml(`${item.failedCount || 0}`)} 次</div>
                </div>
                <div class="usage-anomaly-item-value">${escapeHtml(formatVoiceQuotaText(item.avgBilledSeconds))}</div>
              </div>
            `).join('')
            : '<div class="empty-card">当前筛选口径下还没有可分析的语音调用质量。</div>'}
        </div>
      `
    }
  }

  const globalUsageEfficiencyWrap = document.getElementById('globalUsageEfficiencyWrap')
  if (globalUsageEfficiencyWrap) {
    if (isAiView) {
      const modelEfficiencyStats = (Array.isArray(usageReport.modelEfficiencyStats) ? usageReport.modelEfficiencyStats : []).slice(0, 6)
      const sourceEfficiencyStats = (Array.isArray(usageReport.sourceEfficiencyStats) ? usageReport.sourceEfficiencyStats : [])
        .filter((item) => item.usageType === 'ai_tokens')
        .slice(0, 6)
      globalUsageEfficiencyWrap.innerHTML = `
        <div class="usage-anomaly-grid">
          <article class="usage-anomaly-card">
            <div class="usage-anomaly-title">模型效率</div>
            <div class="usage-anomaly-list">
              ${modelEfficiencyStats.length
                ? modelEfficiencyStats.map((item) => `
                  <div class="usage-anomaly-item">
                    <div class="usage-anomaly-item-main">
                      <div class="usage-anomaly-item-title">${escapeHtml(item.model || '未识别模型')}</div>
                      <div class="usage-anomaly-item-meta">${escapeHtml(item.providerLabel || item.providerKey || '未知供应商')} · 成功 ${escapeHtml(formatPercentText(item.successRate))} · 均耗时 ${escapeHtml(formatDurationMsText(item.avgDurationMs))}</div>
                    </div>
                    <div class="usage-anomaly-item-value">${escapeHtml(formatAiQuotaText(item.avgBilledTokens))}</div>
                  </div>
                `).join('')
                : '<div class="empty-card">当前筛选口径下还没有可分析的模型效率。</div>'}
            </div>
          </article>
          <article class="usage-anomaly-card">
            <div class="usage-anomaly-title">场景均值</div>
            <div class="usage-anomaly-list">
              ${sourceEfficiencyStats.length
                ? sourceEfficiencyStats.map((item) => `
                  <div class="usage-anomaly-item">
                    <div class="usage-anomaly-item-main">
                      <div class="usage-anomaly-item-title">${escapeHtml(item.sourceLabel || getSourceTypeLabel(item.sourceType))}</div>
                      <div class="usage-anomaly-item-meta">平均原始 ${escapeHtml(formatAiQuotaText(item.avgRawTokens))} · 均耗时 ${escapeHtml(formatDurationMsText(item.avgDurationMs))}</div>
                    </div>
                    <div class="usage-anomaly-item-value">${escapeHtml(formatAiQuotaText(item.avgBilledTokens))}</div>
                  </div>
                `).join('')
                : '<div class="empty-card">当前筛选口径下还没有可分析的 AI 场景均值。</div>'}
            </div>
          </article>
        </div>
      `
    } else {
      const voiceEfficiencyStats = (Array.isArray(usageReport.sourceEfficiencyStats) ? usageReport.sourceEfficiencyStats : [])
        .filter((item) => item.usageType === 'voice_seconds')
        .slice(0, 6)
      globalUsageEfficiencyWrap.innerHTML = `
        <div class="usage-anomaly-list">
          ${voiceEfficiencyStats.length
            ? voiceEfficiencyStats.map((item) => `
              <div class="usage-anomaly-item">
                <div class="usage-anomaly-item-main">
                  <div class="usage-anomaly-item-title">${escapeHtml(item.sourceLabel || getSourceTypeLabel(item.sourceType))}</div>
                  <div class="usage-anomaly-item-meta">平均输出 ${escapeHtml(formatCharsText(item.avgOutputChars))} · 平均耗时 ${escapeHtml(formatDurationMsText(item.avgDurationMs))}</div>
                </div>
                <div class="usage-anomaly-item-value">${escapeHtml(formatVoiceQuotaText(item.avgBilledSeconds))}</div>
              </div>
            `).join('')
            : '<div class="empty-card">当前筛选口径下还没有可分析的语音效率数据。</div>'}
        </div>
      `
    }
  }

  const globalUsageRecentEventsWrap = document.getElementById('globalUsageRecentEventsWrap')
  if (globalUsageRecentEventsWrap) {
    const scopedRecentEvents = (Array.isArray(usageReport.recentEvents) ? usageReport.recentEvents : [])
      .filter((item) => toText(item.usageType) === activeType)
      .slice(0, 8)
    globalUsageRecentEventsWrap.innerHTML = renderUsageRecentEvents(
      scopedRecentEvents,
      summaryMap,
      state.runtime.globalUsageLoading
        ? '正在加载最近事件...'
        : '当前筛选口径下还没有最近事件。'
    )
  }

  const ledger = scopedLedger
  const ledgerGroupsMap = {}
  ledger.forEach((item) => {
    const key = formatUsageDateKey(parseDateMs(item.occurredAt)) || '未知日期'
    if (!ledgerGroupsMap[key]) {
      ledgerGroupsMap[key] = []
    }
    ledgerGroupsMap[key].push(item)
  })
  const ledgerGroups = Object.keys(ledgerGroupsMap)
    .sort((left, right) => right.localeCompare(left))
    .map((dateKey) => ({
      dateKey,
      items: ledgerGroupsMap[dateKey]
    }))

  countMeta.textContent = `${isAiView ? 'AI Token 流水' : '语音流水'} · ${getUsageTimeWindowLabel(state.globalUsageTimeWindow)} · ${getUsageSourceFilterLabel(state.globalUsageSourceFilter)} · 第 ${pageInfo.page}/${pageInfo.totalPages} 页 · 总 ${pageInfo.total} 条`
  ledgerWrap.innerHTML = ledger.length
    ? `
      <div class="usage-ledger-list">
        ${ledgerGroups.map((group) => `
          <section class="usage-ledger-day-group">
            <div class="usage-ledger-day-head">
              <span class="usage-ledger-day-title">${escapeHtml(group.dateKey)}</span>
              <span class="badge is-neutral">${escapeHtml(`${group.items.length} 条`)}</span>
            </div>
            <div class="usage-ledger-day-list">
              ${group.items.map((item) => {
                const metaInfo = buildUsageMetaInfo(item)
                const account = summaryMap[toText(item.accountId)] || null
                const accountTitle = account ? getAccountPrimaryPhone(account) : (item.accountId || '未关联账户')
                const accountMeta = account ? (getAccountSecondaryMeta(account) || item.accountId || '-') : (item.accountId || '-')
                return `
                  <article class="usage-ledger-item">
                    <div class="usage-ledger-head">
                      <div class="usage-ledger-title-wrap">
                        <div class="usage-ledger-title">${escapeHtml(accountTitle)} · ${escapeHtml(item.sourceTypeLabel || '-')}</div>
                        <div class="usage-ledger-meta">${escapeHtml(item.occurredAt || '-')}</div>
                      </div>
                      <div class="table-badge-row">
                        <span class="badge ${getUsageTypeBadgeClass(item.usageType)}">${escapeHtml(item.usageTypeLabel || '-')}</span>
                        <span class="badge ${item.directionBadgeClass}">${escapeHtml(item.directionLabel)}</span>
                        <span class="badge is-neutral">${escapeHtml(item.deltaText)}</span>
                      </div>
                    </div>
                    <div class="usage-ledger-balance">账户：${escapeHtml(accountMeta)} · 余额变化：${escapeHtml(item.balanceText)}</div>
                    <div class="usage-ledger-notes">
                      ${metaInfo.primaryLines && metaInfo.primaryLines.length
                        ? metaInfo.primaryLines.map((line) => `<div class="usage-ledger-note">${escapeHtml(line)}</div>`).join('')
                        : '<div class="usage-ledger-note">当前无额外业务说明。</div>'}
                    </div>
                    ${metaInfo.technicalLines && metaInfo.technicalLines.length ? `
                      <details class="usage-ledger-tech">
                        <summary>技术追踪</summary>
                        <div class="usage-ledger-tech-list">
                          ${metaInfo.technicalLines.map((line) => `<div class="usage-ledger-note">${escapeHtml(line)}</div>`).join('')}
                        </div>
                      </details>
                    ` : ''}
                  </article>
                `
              }).join('')}
            </div>
          </section>
        `).join('')}
      </div>
      ${renderUsagePagerMarkup(pageInfo, {
        prevId: 'globalUsagePagerPrevBtn',
        nextId: 'globalUsagePagerNextBtn'
      })}
    `
    : `<div class="empty-card">${escapeHtml(state.runtime.globalUsageLoading ? '正在加载全局报表与流水...' : '当前筛选口径下还没有全局流水。等真实 AI / 语音调用、到账、补量或补偿发生后，这里会开始出现记录。')}</div>`

  const resetGlobalUsageFiltersBtn = document.getElementById('resetGlobalUsageFiltersBtn')
  if (resetGlobalUsageFiltersBtn) {
    resetGlobalUsageFiltersBtn.addEventListener('click', () => {
      resetGlobalUsageFilters()
      scheduleGlobalUsageRefresh()
    })
  }
  sourceSummaryWrap.querySelectorAll('[data-global-usage-source]').forEach((card) => {
    const applySourceFilter = () => {
      state.globalUsageSourceFilter = toText(card.getAttribute('data-global-usage-source') || 'all') || 'all'
      state.globalUsagePage = 1
      scheduleGlobalUsageRefresh()
    }
    card.addEventListener('click', applySourceFilter)
    card.addEventListener('keydown', (event) => {
      const key = event && event.key ? event.key : ''
      if (key !== 'Enter' && key !== ' ') {
        return
      }
      event.preventDefault()
      applySourceFilter()
    })
  })
  const clearGlobalUsageSourceFilterBtn = document.getElementById('clearGlobalUsageSourceFilterBtn')
  if (clearGlobalUsageSourceFilterBtn) {
    clearGlobalUsageSourceFilterBtn.addEventListener('click', () => {
      state.globalUsageSourceFilter = 'all'
      state.globalUsagePage = 1
      if (sourceFilterSelect) {
        sourceFilterSelect.value = 'all'
      }
      scheduleGlobalUsageRefresh()
    })
  }
  distributionWrap.querySelectorAll('[data-global-usage-provider]').forEach((card) => {
    card.addEventListener('click', () => {
      const nextProvider = toText(card.getAttribute('data-global-usage-provider'))
      state.globalUsageProviderFilter = toText(state.globalUsageProviderFilter).toLowerCase() === nextProvider.toLowerCase() ? '' : nextProvider
      state.globalUsagePage = 1
      if (providerInput) {
        providerInput.value = state.globalUsageProviderFilter
      }
      scheduleGlobalUsageRefresh()
    })
  })
  distributionWrap.querySelectorAll('[data-global-usage-model]').forEach((card) => {
    card.addEventListener('click', () => {
      const nextModel = toText(card.getAttribute('data-global-usage-model'))
      const nextProvider = toText(card.getAttribute('data-global-usage-provider'))
      const sameModel = toText(state.globalUsageModelFilter).toLowerCase() === nextModel.toLowerCase()
      const sameProvider = toText(state.globalUsageProviderFilter).toLowerCase() === nextProvider.toLowerCase()
      if (sameModel && sameProvider) {
        state.globalUsageModelFilter = ''
        state.globalUsageProviderFilter = ''
      } else {
        state.globalUsageModelFilter = nextModel
        state.globalUsageProviderFilter = nextProvider
      }
      state.globalUsagePage = 1
      if (modelInput) {
        modelInput.value = state.globalUsageModelFilter
      }
      if (providerInput) {
        providerInput.value = state.globalUsageProviderFilter
      }
      scheduleGlobalUsageRefresh()
    })
  })
  const globalUsagePagerPrevBtn = document.getElementById('globalUsagePagerPrevBtn')
  if (globalUsagePagerPrevBtn) {
    globalUsagePagerPrevBtn.addEventListener('click', () => {
      if (state.globalUsagePage <= 1) {
        return
      }
      state.globalUsagePage -= 1
      scheduleGlobalUsageRefresh()
    })
  }
  const globalUsagePagerNextBtn = document.getElementById('globalUsagePagerNextBtn')
  if (globalUsagePagerNextBtn) {
    globalUsagePagerNextBtn.addEventListener('click', () => {
      if (!pageInfo.hasNext) {
        return
      }
      state.globalUsagePage += 1
      scheduleGlobalUsageRefresh()
    })
  }
}

function getSelectedLegalDocumentSummary() {
  return state.legalDocuments.find((item) => item.docId === state.selectedLegalDocumentId) || null
}

function buildLegalDocumentDraftPayload() {
  const draft = state.legalDocumentDraft && typeof state.legalDocumentDraft === 'object'
    ? state.legalDocumentDraft
    : buildEmptyLegalDocumentDraft()
  return {
    docId: toText(draft.docId || state.selectedLegalDocumentId),
    docType: toText(draft.docType),
    title: toText(draft.title),
    version: toText(draft.version),
    summary: toText(draft.summary),
    changeNotes: splitLegalChangeNotes(draft.changeNotesText),
    requiresReconsent: Boolean(draft.requiresReconsent),
    effectiveAt: toText(draft.effectiveAt),
    markdownSource: String(draft.markdownSource || ''),
    sourceDraftId: toText(draft.sourceDraftId),
    previousVersion: toText(draft.previousVersion)
  }
}

function createFreshLegalDraft(docType = 'privacy_policy') {
  state.selectedLegalDocumentId = ''
  state.legalDocumentDetail = null
  state.legalDocumentDraft = buildEmptyLegalDocumentDraft(docType)
  state.legalDocumentPreview = createEmptyLegalPreviewState()
}

async function performLegalDocumentPreviewAction() {
  const payload = buildLegalDocumentDraftPayload()
  if (!toText(payload.markdownSource)) {
    setNotice('请先填写协议正文后再预览。', 'danger')
    render()
    return
  }

  try {
    state.runtime.legalDocumentPreviewLoading = true
    render()
    const result = await provider.previewLegalDocument({
      markdownSource: payload.markdownSource
    })
    state.legalDocumentPreview = {
      html: toText(result.html),
      plainText: toText(result.plainText),
      generatedAt: formatDateTimeText(new Date()),
      source: 'preview'
    }
  } catch (error) {
    setNotice(error.message || '生成协议预览失败，请稍后重试。', 'danger')
  } finally {
    state.runtime.legalDocumentPreviewLoading = false
    render()
  }
}

async function performLegalDocumentSaveAction() {
  const payload = buildLegalDocumentDraftPayload()
  try {
    state.runtime.loading = true
    setNotice('', 'info')
    render()
    const result = await provider.upsertLegalDocumentDraft({
      ...payload,
      reason: `后台维护协议草稿：${payload.title || getLegalDocumentTypeLabel(payload.docType)}`
    })
    const savedDocId = result && result.document ? toText(result.document.docId) : ''
    setNotice(`已保存协议草稿${savedDocId ? `：${savedDocId}` : ''}。`, 'success')
    await refreshLegalDocumentsData({
      preserveSelection: false,
      preferredDocId: savedDocId,
      forceDetailReload: true,
      renderOnFinish: false
    })
  } catch (error) {
    setNotice(error.message || '保存协议草稿失败，请稍后重试。', 'danger')
  } finally {
    state.runtime.loading = false
    render()
  }
}

async function performLegalDocumentPublishAction() {
  const detail = state.legalDocumentDetail
  if (!detail || !toText(detail.docId)) {
    setNotice('请先选择一份草稿后再发布。', 'danger')
    render()
    return
  }
  if (detail.status !== 'draft') {
    setNotice('当前版本不是草稿，不能直接发布。', 'danger')
    render()
    return
  }
  if (!window.confirm(`确认发布 ${detail.title} ${detail.version} 吗？发布后该版本会成为当前生效版本。`)) {
    return
  }
  const reason = window.prompt('请输入发布原因（会写入审计日志）', `发布协议：${detail.title} ${detail.version}`)
  if (reason === null) {
    return
  }

  try {
    state.runtime.loading = true
    setNotice('', 'info')
    render()
    await provider.publishLegalDocument({
      docId: detail.docId,
      reason: toText(reason) || `发布协议：${detail.title} ${detail.version}`
    })
    setNotice(`已发布 ${detail.title} ${detail.version}。`, 'success')
    await refreshLegalDocumentsData({
      preserveSelection: false,
      preferredDocId: detail.docId,
      forceDetailReload: true,
      renderOnFinish: false
    })
  } catch (error) {
    setNotice(error.message || '发布协议失败，请稍后重试。', 'danger')
  } finally {
    state.runtime.loading = false
    render()
  }
}

async function performLegalDocumentCloneAction() {
  const detail = state.legalDocumentDetail
  if (!detail || !toText(detail.docId)) {
    setNotice('请先选择一份已有协议后再复制。', 'danger')
    render()
    return
  }
  const nextVersion = window.prompt('请输入新版本号', suggestNextLegalVersion(detail.version))
  if (nextVersion === null) {
    return
  }
  const reason = window.prompt('请输入复制原因（会写入审计日志）', `复制协议为新草稿：${detail.title} ${nextVersion}`)
  if (reason === null) {
    return
  }

  try {
    state.runtime.loading = true
    setNotice('', 'info')
    render()
    const result = await provider.cloneLegalDocumentDraft({
      sourceDocId: detail.docId,
      nextVersion: toText(nextVersion),
      reason: toText(reason) || `复制协议为新草稿：${detail.title}`
    })
    const clonedDocId = result && result.document ? toText(result.document.docId) : ''
    setNotice(`已复制为新草稿 ${toText(nextVersion)}。`, 'success')
    await refreshLegalDocumentsData({
      preserveSelection: false,
      preferredDocId: clonedDocId,
      forceDetailReload: true,
      renderOnFinish: false
    })
  } catch (error) {
    setNotice(error.message || '复制协议草稿失败，请稍后重试。', 'danger')
  } finally {
    state.runtime.loading = false
    render()
  }
}

function bindLegalDocumentActions() {
  document.querySelectorAll('[data-legal-doc-id]').forEach((button) => {
    button.addEventListener('click', () => {
      refreshLegalDocumentDetail({
        docId: toText(button.getAttribute('data-legal-doc-id')),
        renderOnFinish: true
      })
    })
  })

  const refreshBtn = document.getElementById('refreshLegalDocumentsBtn')
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshLegalDocumentsData({
        preserveSelection: true,
        renderOnFinish: true
      })
    })
  }

  const createBtn = document.getElementById('createLegalDocumentBtn')
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      const docType = state.legalDocumentDocTypeFilter !== 'all'
        ? state.legalDocumentDocTypeFilter
        : 'privacy_policy'
      createFreshLegalDraft(docType)
      render()
    })
  }

  const fillTemplateBtn = document.getElementById('fillLegalTemplateBtn')
  if (fillTemplateBtn) {
    fillTemplateBtn.addEventListener('click', () => {
      const docType = toText(state.legalDocumentDraft.docType || 'privacy_policy')
      const hasExistingContent = toText(state.legalDocumentDraft.markdownSource)
      if (hasExistingContent && !window.confirm('当前正文将被默认模板覆盖，是否继续？')) {
        return
      }
      state.legalDocumentDraft.markdownSource = buildDefaultLegalDocumentMarkdown(docType)
      if (!toText(state.legalDocumentDraft.title)) {
        state.legalDocumentDraft.title = getLegalDocumentTypeLabel(docType)
      }
      state.legalDocumentPreview = createEmptyLegalPreviewState()
      render()
    })
  }

  const docTypeSelect = document.getElementById('legalDocTypeInput')
  if (docTypeSelect) {
    docTypeSelect.addEventListener('change', (event) => {
      const nextDocType = toText(event.target.value) || 'privacy_policy'
      const previousDocType = toText(state.legalDocumentDraft.docType)
      const previousDefaultTitle = getLegalDocumentTypeLabel(previousDocType)
      const nextDefaultTitle = getLegalDocumentTypeLabel(nextDocType)
      const nextTemplate = buildDefaultLegalDocumentMarkdown(nextDocType)
      const currentTemplate = buildDefaultLegalDocumentMarkdown(previousDocType)
      state.legalDocumentDraft.docType = nextDocType
      if (!toText(state.legalDocumentDraft.title) || state.legalDocumentDraft.title === previousDefaultTitle) {
        state.legalDocumentDraft.title = nextDefaultTitle
      }
      if (!toText(state.legalDocumentDraft.markdownSource) || state.legalDocumentDraft.markdownSource === currentTemplate) {
        state.legalDocumentDraft.markdownSource = nextTemplate
      }
      render()
    })
  }

  const fieldBindings = [
    ['legalDocTitleInput', 'title'],
    ['legalDocVersionInput', 'version'],
    ['legalDocEffectiveAtInput', 'effectiveAt'],
    ['legalDocSummaryInput', 'summary'],
    ['legalDocChangeNotesInput', 'changeNotesText'],
    ['legalDocMarkdownInput', 'markdownSource']
  ]
  fieldBindings.forEach(([elementId, fieldName]) => {
    const element = document.getElementById(elementId)
    if (!element) {
      return
    }
    element.addEventListener('input', (event) => {
      state.legalDocumentDraft[fieldName] = event.target.value
      if (fieldName === 'markdownSource') {
        state.legalDocumentPreview = createEmptyLegalPreviewState()
      }
    })
  })

  const reconsentCheckbox = document.getElementById('legalDocRequiresReconsentInput')
  if (reconsentCheckbox) {
    reconsentCheckbox.addEventListener('change', (event) => {
      state.legalDocumentDraft.requiresReconsent = Boolean(event.target.checked)
    })
  }

  const saveBtn = document.getElementById('saveLegalDocumentDraftBtn')
  if (saveBtn) {
    saveBtn.addEventListener('click', performLegalDocumentSaveAction)
  }

  const previewBtn = document.getElementById('previewLegalDocumentBtn')
  if (previewBtn) {
    previewBtn.addEventListener('click', performLegalDocumentPreviewAction)
  }

  const publishBtn = document.getElementById('publishLegalDocumentBtn')
  if (publishBtn) {
    publishBtn.addEventListener('click', performLegalDocumentPublishAction)
  }

  const cloneBtn = document.getElementById('cloneLegalDocumentBtn')
  if (cloneBtn) {
    cloneBtn.addEventListener('click', performLegalDocumentCloneAction)
  }
}

function renderLegalDocuments() {
  const listWrap = document.getElementById('legalDocumentsListWrap')
  const editorWrap = document.getElementById('legalDocumentEditorWrap')
  const countMeta = document.getElementById('legalDocumentsCountMeta')
  const selectedMeta = document.getElementById('selectedLegalDocumentMeta')
  const searchInput = document.getElementById('legalDocumentSearchInput')
  const docTypeFilter = document.getElementById('legalDocumentDocTypeFilter')
  const statusFilter = document.getElementById('legalDocumentStatusFilter')
  if (!listWrap || !editorWrap || !countMeta || !selectedMeta || !searchInput || !docTypeFilter || !statusFilter) {
    return
  }

  searchInput.value = state.legalDocumentSearch
  docTypeFilter.value = state.legalDocumentDocTypeFilter
  statusFilter.value = state.legalDocumentStatusFilter

  if (!supportsLegalDocumentAdmin()) {
    countMeta.textContent = '协议中心未就绪'
    selectedMeta.textContent = '请先部署协议中心云函数'
    listWrap.innerHTML = '<div class="empty-card">当前 provider 尚未接入协议中心接口。</div>'
    editorWrap.innerHTML = '<div class="empty-card">请先部署并配置 `adminListLegalDocuments`、`adminGetLegalDocumentDetail` 等管理云函数。</div>'
    return
  }

  const documents = Array.isArray(state.legalDocuments) ? state.legalDocuments : []
  const selectedSummary = getSelectedLegalDocumentSummary()
  const detail = state.legalDocumentDetail
  const draft = state.legalDocumentDraft && typeof state.legalDocumentDraft === 'object'
    ? state.legalDocumentDraft
    : buildEmptyLegalDocumentDraft()
  const preview = state.legalDocumentPreview && typeof state.legalDocumentPreview === 'object'
    ? state.legalDocumentPreview
    : createEmptyLegalPreviewState()
  const isReadOnly = Boolean(draft.readOnly)
  const isExistingDocument = Boolean(toText(detail && detail.docId))
  const previewTitle = preview.source === 'preview'
    ? '服务器预览'
    : (preview.source === 'published' ? '已发布快照' : '当前暂无预览')

  countMeta.textContent = state.runtime.legalDocumentsLoading
    ? '正在刷新协议列表...'
    : `共 ${documents.length} 个版本`
  selectedMeta.textContent = isExistingDocument
    ? `${getLegalDocumentTypeLabel(detail.docType)} · ${detail.version} · ${getLegalDocumentStatusLabel(detail.status)}`
    : '新建草稿'

  listWrap.innerHTML = documents.length
    ? `
      <table class="data-table">
        <thead>
          <tr>
            <th>协议</th>
            <th>版本</th>
            <th>状态</th>
            <th>更新时间</th>
          </tr>
        </thead>
        <tbody>
          ${documents.map((item) => `
            <tr class="${state.selectedLegalDocumentId === item.docId ? 'is-selected' : ''}">
              <td>
                <button class="data-row-button" type="button" data-legal-doc-id="${escapeHtml(item.docId)}">
                  ${buildTableMainCell(item.title || getLegalDocumentTypeLabel(item.docType), `${getLegalDocumentTypeLabel(item.docType)} · ${item.docId}`)}
                </button>
              </td>
              <td>${buildTableMainCell(item.version || '-', item.previousVersion ? `上一版 ${item.previousVersion}` : '首版')}</td>
              <td>
                ${buildBadgeListMarkup([
                  `<span class="badge ${getLegalDocumentStatusBadgeClass(item.status)}">${escapeHtml(getLegalDocumentStatusLabel(item.status))}</span>`,
                  item.isCurrent ? '<span class="badge is-success">当前生效</span>' : '<span class="badge is-neutral">历史版本</span>',
                  item.requiresReconsent ? '<span class="badge is-gold">需重确认</span>' : ''
                ].filter(Boolean))}
              </td>
              <td>${buildTableMainCell(formatCompactDateText(item.updatedAt) || '-', item.updatedBy || '-')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    : `<div class="empty-card">${escapeHtml(state.runtime.legalDocumentsLoading ? '正在加载协议列表...' : '当前还没有协议版本。可先新建隐私政策和用户服务协议草稿。')}</div>`

  editorWrap.innerHTML = `
    <div class="detail-stack">
      <section class="detail-card detail-card-hero">
        <div class="purchase-hero">
          <div class="purchase-hero-main">
            <div class="mini-kicker">协议中心</div>
            <h4 class="purchase-title">${escapeHtml(draft.title || getLegalDocumentTypeLabel(draft.docType))}</h4>
            <div class="purchase-subtitle">${escapeHtml(getLegalDocumentTypeLabel(draft.docType))}${draft.version ? ` · ${escapeHtml(draft.version)}` : ''}</div>
          </div>
          <div class="table-badge-row">
            <span class="badge ${getLegalDocumentStatusBadgeClass(draft.status)}">${escapeHtml(getLegalDocumentStatusLabel(draft.status || 'draft'))}</span>
            ${draft.isCurrent ? '<span class="badge is-success">当前生效</span>' : ''}
            ${draft.requiresReconsent ? '<span class="badge is-gold">需重确认</span>' : ''}
          </div>
        </div>
        <div class="order-note">${escapeHtml(isReadOnly ? '已发布版本为只读。若需要改文案，请先复制为新草稿。' : '草稿支持直接编辑、服务端预览和发布。')}</div>
      </section>

      <section class="detail-card">
        <h4 class="detail-card-title">基础信息</h4>
        <div class="plan-editor-grid">
          <label class="field-group">
            <span class="field-label">协议类型</span>
            <select id="legalDocTypeInput" class="form-select" ${isReadOnly ? 'disabled' : ''}>
              ${buildSelectOptionsMarkup(LEGAL_DOCUMENT_TYPE_OPTIONS, draft.docType)}
            </select>
          </label>
          <label class="field-group">
            <span class="field-label">标题</span>
            <input id="legalDocTitleInput" class="form-input" value="${escapeHtml(draft.title || '')}" ${isReadOnly ? 'disabled' : ''} />
          </label>
          <label class="field-group">
            <span class="field-label">版本号</span>
            <input id="legalDocVersionInput" class="form-input" value="${escapeHtml(draft.version || '')}" placeholder="v1.0.0" ${isReadOnly ? 'disabled' : ''} />
          </label>
          <label class="field-group">
            <span class="field-label">生效时间</span>
            <input id="legalDocEffectiveAtInput" class="form-input" type="datetime-local" value="${escapeHtml(formatDateTimeLocalValue(draft.effectiveAt))}" ${isReadOnly ? 'disabled' : ''} />
          </label>
        </div>
        <label class="checkbox-item">
          <input id="legalDocRequiresReconsentInput" type="checkbox" ${draft.requiresReconsent ? 'checked' : ''} ${isReadOnly ? 'disabled' : ''}>
          发布后需要用户重新确认
        </label>
        <label class="field-group">
          <span class="field-label">版本摘要</span>
          <textarea id="legalDocSummaryInput" class="form-textarea is-compact" placeholder="一句话说明本版本调整重点。" ${isReadOnly ? 'disabled' : ''}>${escapeHtml(draft.summary || '')}</textarea>
        </label>
        <label class="field-group">
          <span class="field-label">变更说明</span>
          <textarea id="legalDocChangeNotesInput" class="form-textarea is-compact" placeholder="每行一条变更说明。" ${isReadOnly ? 'disabled' : ''}>${escapeHtml(draft.changeNotesText || '')}</textarea>
        </label>
      </section>

      <section class="detail-card">
        <div class="panel-head">
          <h4 class="detail-card-title">协议正文</h4>
          <div class="inline-actions">
            <button id="fillLegalTemplateBtn" class="ghost-btn" type="button" ${isReadOnly ? 'disabled' : ''}>填入默认模板</button>
          </div>
        </div>
        <textarea id="legalDocMarkdownInput" class="form-textarea legal-markdown-editor" placeholder="使用 Markdown 编写协议正文。" ${isReadOnly ? 'disabled' : ''}>${escapeHtml(draft.markdownSource || '')}</textarea>
        <div class="plan-editor-footer">
          <div class="plan-editor-preview">支持最小 Markdown：标题、段落、无序列表。发布时会在云端生成 HTML 与纯文本快照。</div>
          <div class="inline-actions">
            <button id="previewLegalDocumentBtn" class="secondary-btn" type="button" ${state.runtime.loading ? 'disabled' : ''}>${state.runtime.legalDocumentPreviewLoading ? '生成中...' : '服务端预览'}</button>
            <button id="saveLegalDocumentDraftBtn" class="primary-btn" type="button" ${isReadOnly || state.runtime.loading ? 'disabled' : ''}>保存草稿</button>
            <button id="publishLegalDocumentBtn" class="ghost-btn" type="button" ${!isExistingDocument || isReadOnly || state.runtime.loading ? 'disabled' : ''}>发布</button>
            <button id="cloneLegalDocumentBtn" class="ghost-btn" type="button" ${!isExistingDocument || state.runtime.loading ? 'disabled' : ''}>复制新版本</button>
          </div>
        </div>
      </section>

      <section class="detail-card">
        <div class="panel-head">
          <h4 class="detail-card-title">预览</h4>
          <div class="panel-meta">${escapeHtml(previewTitle)}${preview.generatedAt ? ` · ${formatCompactDateText(preview.generatedAt)}` : ''}</div>
        </div>
        ${preview.html
          ? `<div class="legal-markdown-preview">${preview.html}</div>`
          : `<div class="empty-card">${escapeHtml(state.runtime.legalDocumentPreviewLoading ? '正在生成预览...' : '当前还没有预览内容。可先点击“服务端预览”，已发布版本则会展示快照。')}</div>`}
      </section>

      <section class="detail-card">
        <h4 class="detail-card-title">版本信息</h4>
        <div class="detail-grid">
          <div>
            <div class="detail-item-label">文档标识</div>
            <div class="detail-item-value">${escapeHtml(draft.docId || '保存后生成')}</div>
          </div>
          <div>
            <div class="detail-item-label">当前修订</div>
            <div class="detail-item-value">${escapeHtml(`${draft.currentRevision || 1}`)}</div>
          </div>
          <div>
            <div class="detail-item-label">上一版本</div>
            <div class="detail-item-value">${escapeHtml(draft.previousVersion || '-')}</div>
          </div>
          <div>
            <div class="detail-item-label">已发布时间</div>
            <div class="detail-item-value">${escapeHtml(formatCompactDateText(draft.publishedAt) || '-')}</div>
          </div>
          <div>
            <div class="detail-item-label">最近更新</div>
            <div class="detail-item-value">${escapeHtml(formatCompactDateText(draft.updatedAt) || '-')}</div>
          </div>
          <div>
            <div class="detail-item-label">快照 Hash</div>
            <div class="detail-item-value legal-mono-text">${escapeHtml(draft.hash || '-')}</div>
          </div>
        </div>
        ${selectedSummary && selectedSummary.summary ? `<div class="order-note">${escapeHtml(selectedSummary.summary)}</div>` : ''}
      </section>
    </div>
  `

  bindLegalDocumentActions()
}

function renderAiConfig() {
  try {
    renderAiModelConfigPanel()
  } catch (error) {
    const wrap = document.getElementById('aiModelConfigWrap')
    if (wrap) {
      wrap.innerHTML = `<div class="empty-card">AI 模型配置面板渲染失败：${escapeHtml(error && error.message ? error.message : '未知错误')}</div>`
    }
  }
}

function renderAiModelConfigPanel() {
  const wrap = document.getElementById('aiModelConfigWrap')
  if (!wrap) {
    return
  }

  const config = normalizeAiModelConfig(state.aiModelConfig)
  const providers = config.providers || {}
  const providerKeys = Object.keys(providers)
  const routeKeys = AI_ROUTE_DEFINITIONS.map((item) => item.key)
  const activeTab = state.aiConfigTab === 'routing' ? 'routing' : 'providers'

  wrap.innerHTML = `
    <div class="ai-routing-panel">
      <div class="ai-routing-head">
        <div class="ai-routing-head-title">AI 模型路由与额度策略</div>
        <div class="ai-routing-head-meta">可切换额度策略、维护供应商连接（含 baseURL / API Key）、并把小程序全部 AI 业务路由绑定到指定供应商。</div>
      </div>

      <section class="ai-routing-policy-card">
        <div class="field-group">
          <span class="field-label">额度策略</span>
          <select id="aiQuotaPolicySelect" class="form-select">
            <option value="local_quota" ${config.quotaPolicy === 'local_quota' ? 'selected' : ''}>local_quota（本地权益 token 控制）</option>
            <option value="provider_plan" ${config.quotaPolicy === 'provider_plan' ? 'selected' : ''}>provider_plan（按云厂商 Token Plan）</option>
          </select>
          <div class="ai-routing-tip">选择 provider_plan 后，前台与云函数不再用本地 aiTokensRemaining 阻断 AI 调用。</div>
        </div>
      </section>

      <section class="ai-config-tabs" aria-label="AI 配置页签" role="tablist">
        <button class="ai-config-tab ${activeTab === 'providers' ? 'is-active' : ''}" type="button" role="tab" aria-selected="${activeTab === 'providers' ? 'true' : 'false'}" aria-controls="ai-config-pane-providers" data-ai-config-tab="providers">供应商管理</button>
        <button class="ai-config-tab ${activeTab === 'routing' ? 'is-active' : ''}" type="button" role="tab" aria-selected="${activeTab === 'routing' ? 'true' : 'false'}" aria-controls="ai-config-pane-routing" data-ai-config-tab="routing">路由策略</button>
      </section>

      <section id="ai-config-pane-providers" class="ai-config-pane ${activeTab === 'providers' ? 'is-active' : ''}" role="tabpanel" data-ai-config-pane="providers" ${activeTab === 'providers' ? '' : 'hidden'}>
        <div class="ai-provider-grid">
          ${providerKeys.map((providerKey) => {
          const provider = providers[providerKey]
          const providerType = provider.providerType === 'openai_compatible' ? 'openai_compatible' : 'cloudbase'
          const protocolMode = normalizeProtocolMode(provider.protocolMode || 'auto')
          const routeModeHint = providerType === 'cloudbase'
            ? '使用 CloudBase 官方接入，不需要 API Key。'
            : (provider.baseURLRequired ? '优先使用预置地址；只有兼容网关差异时再改 baseURL。' : '当前通道无需填写 baseURL。')
          const providerModelOptions = getProviderModelOptions(providerKey)
          const providerPreset = getAiProviderPreset(providerKey)
          const providerRecommendedAt = toText((providerPreset && providerPreset.recommendedAt) || provider.recommendedAt)
          const providerModelHint = providerModelOptions.length
            ? providerModelOptions.map((item) => toText(item.label || item.value)).join(' / ')
            : '填写当前正式模型名'
          return `
            <article class="ai-provider-card" data-ai-provider="${escapeHtml(providerKey)}">
              <div class="ai-route-card-head">
                <div>
                  <div class="ai-route-title">${escapeHtml(provider.displayName || providerKey)}</div>
                  <div class="panel-meta">${escapeHtml(providerKey)} · ${escapeHtml(getProviderTypeLabel(providerType))} · ${escapeHtml(provider.visibleLabel || provider.providerClass || '')}</div>
                </div>
                <label class="checkbox-item">
                  <input type="checkbox" data-ai-provider-field="enabled" ${provider.enabled ? 'checked' : ''}>
                  启用
                </label>
              </div>

              <div class="plan-editor-grid">
                <label class="field-group">
                  <span class="field-label">显示名称</span>
                  <input class="form-input" data-ai-provider-field="displayName" value="${escapeHtml(provider.displayName || providerKey)}" />
                </label>
                <label class="field-group">
                  <span class="field-label">cloudbaseProvider</span>
                  ${providerType === 'cloudbase'
                    ? `<select class="form-select" data-ai-provider-field="cloudbaseProvider">
                        <option value="hunyuan-exp" ${provider.cloudbaseProvider === 'hunyuan-exp' ? 'selected' : ''}>hunyuan-exp</option>
                      </select>`
                    : `<input class="form-input" value="不适用" disabled />
                       <input type="hidden" data-ai-provider-field="cloudbaseProvider" value="${escapeHtml(provider.cloudbaseProvider || '')}" />`}
                </label>
                <label class="field-group">
                  <span class="field-label">defaultModel</span>
                  <input class="form-input" data-ai-provider-field="defaultModel" value="${escapeHtml(provider.defaultModel || '')}" placeholder="直接填写厂商当前模型名" />
                  <div class="ai-routing-tip">${escapeHtml(providerModelHint)}</div>
                  ${providerRecommendedAt ? `<div class="ai-routing-tip">建议口径已同步至 ${escapeHtml(providerRecommendedAt)}，仍以你当前实测通过的正式模型名为准。</div>` : ''}
                </label>
                <label class="field-group">
                  <span class="field-label">baseURL</span>
                  <input class="form-input" data-ai-provider-field="baseURL" value="${escapeHtml(provider.baseURL || '')}" placeholder="使用预置地址即可" ${provider.baseURLEditable === false ? 'disabled' : ''} />
                  <div class="ai-routing-tip">${escapeHtml(routeModeHint)}</div>
                </label>
                <label class="field-group">
                  <span class="field-label">API Key</span>
                  <input class="form-input" data-ai-provider-field="apiKeyInput" value="" placeholder="${provider.hasApiKey ? '留空保持不变，输入则覆盖' : '输入新的 API Key'}" />
                  <div class="ai-routing-tip">${provider.hasApiKey ? `已配置：${escapeHtml(provider.apiKeyMasked || '******')}` : '当前未配置 API Key'}</div>
                </label>
              </div>
              ${buildModelPricingEditorMarkup(provider)}
              <details class="ai-provider-advanced">
                <summary>高级信息</summary>
                <div class="ai-provider-advanced-grid">
                  <label class="field-group">
                    <span class="field-label">providerType</span>
                    <input class="form-input" value="${escapeHtml(providerType)}" disabled />
                    <input type="hidden" data-ai-provider-field="providerType" value="${escapeHtml(providerType)}" />
                  </label>
                  <label class="field-group">
                    <span class="field-label">protocolMode</span>
                    <input class="form-input" value="${escapeHtml(getProtocolModeLabel(protocolMode))}" disabled />
                    <input type="hidden" data-ai-provider-field="protocolMode" value="${escapeHtml(protocolMode)}" />
                  </label>
                  <label class="field-group">
                    <span class="field-label">visibleLabel</span>
                    <input class="form-input" value="${escapeHtml(provider.visibleLabel || '')}" disabled />
                    <input type="hidden" data-ai-provider-field="visibleLabel" value="${escapeHtml(provider.visibleLabel || '')}" />
                  </label>
                  <label class="field-group">
                    <span class="field-label">providerClass</span>
                    <input class="form-input" value="${escapeHtml(provider.providerClass || '')}" disabled />
                    <input type="hidden" data-ai-provider-field="providerClass" value="${escapeHtml(provider.providerClass || '')}" />
                  </label>
                  <label class="field-group">
                    <span class="field-label">commercialTier</span>
                    <input class="form-input" value="${escapeHtml(provider.commercialTier || '')}" disabled />
                    <input type="hidden" data-ai-provider-field="commercialTier" value="${escapeHtml(provider.commercialTier || '')}" />
                  </label>
                </div>
              </details>
            </article>
          `
        }).join('')}
        </div>
      </section>

      <section id="ai-config-pane-routing" class="ai-config-pane ${activeTab === 'routing' ? 'is-active' : ''}" role="tabpanel" data-ai-config-pane="routing" ${activeTab === 'routing' ? '' : 'hidden'}>
        <div class="ai-routing-grid">
          ${routeKeys.map((routeKey) => {
          const route = config.modelRouting[routeKey] || DEFAULT_AI_MODEL_CONFIG.modelRouting[routeKey]
          const selectedProvider = providers[route.providerKey] || DEFAULT_AI_MODEL_CONFIG.providers.cloudbase_default
          const selectedRouteModels = getProviderModelOptions(route.providerKey)
          const fallbackProvider = providers[route.fallbackProviderKey] || null
          const fallbackRouteModels = route.fallbackProviderKey ? getProviderModelOptions(route.fallbackProviderKey) : []
          const selectedRouteHint = buildProviderModelHint(route.providerKey, '填写实际模型名')
          const fallbackRouteHint = route.fallbackProviderKey
            ? buildProviderModelHint(route.fallbackProviderKey, '留空走回退默认模型')
            : '留空走回退默认模型'
          const modelListId = `ai-route-${routeKey}-models`
          const fallbackModelListId = `ai-route-${routeKey}-fallback-models`
          return `
            <article class="ai-route-card" data-ai-route="${escapeHtml(routeKey)}">
              <div class="ai-route-card-head">
                <div class="ai-route-title">${escapeHtml(getRouteLabel(routeKey))}</div>
                <label class="checkbox-item">
                  <input type="checkbox" data-ai-route-field="enabled" ${route.enabled ? 'checked' : ''}>
                  启用
                </label>
              </div>
              <div class="plan-editor-grid">
                <label class="field-group">
                  <span class="field-label">providerKey</span>
                  <select class="form-select" data-ai-route-field="providerKey">
                    ${providerKeys.map((providerKey) => `
                      <option value="${escapeHtml(providerKey)}" ${route.providerKey === providerKey ? 'selected' : ''}>${escapeHtml(providerKey)}</option>
                    `).join('')}
                  </select>
                </label>
                <label class="field-group">
                  <span class="field-label">model</span>
                  <input class="form-input" data-ai-route-field="model" value="${escapeHtml(route.model || '')}" placeholder="直接填写此路由实际模型名" list="${escapeHtml(modelListId)}" />
                  <datalist id="${escapeHtml(modelListId)}" data-ai-route-model-options>${buildProviderModelOptionMarkup(route.providerKey)}</datalist>
                  <div class="ai-routing-tip" data-ai-route-model-hint>${escapeHtml(selectedRouteHint)}</div>
                </label>
                <label class="field-group">
                  <span class="field-label">fallbackProviderKey</span>
                  <select class="form-select" data-ai-route-field="fallbackProviderKey">
                    <option value="">不启用回退</option>
                    ${providerKeys.map((providerKey) => `
                      <option value="${escapeHtml(providerKey)}" ${route.fallbackProviderKey === providerKey ? 'selected' : ''}>${escapeHtml(providerKey)}</option>
                    `).join('')}
                  </select>
                </label>
                <label class="field-group">
                  <span class="field-label">fallbackModel</span>
                  <input class="form-input" data-ai-route-field="fallbackModel" value="${escapeHtml(route.fallbackModel || '')}" placeholder="留空则走回退供应商默认模型" list="${escapeHtml(fallbackModelListId)}" />
                  <datalist id="${escapeHtml(fallbackModelListId)}" data-ai-route-fallback-model-options>${buildProviderModelOptionMarkup(route.fallbackProviderKey)}</datalist>
                  <div class="ai-routing-tip" data-ai-route-fallback-model-hint>${escapeHtml(fallbackRouteHint)}</div>
                </label>
              </div>
              <details class="ai-provider-advanced">
                <summary>高级信息</summary>
                <div class="ai-provider-advanced-grid">
                  <label class="field-group">
                    <span class="field-label">provider</span>
                    <input class="form-input" value="${escapeHtml(route.provider || selectedProvider.cloudbaseProvider || selectedProvider.providerType || '')}" disabled>
                    <input type="hidden" data-ai-route-field="provider" value="${escapeHtml(route.provider || selectedProvider.cloudbaseProvider || selectedProvider.providerType || '')}">
                  </label>
                </div>
              </details>
            </article>
          `
        }).join('')}
        </div>
      </section>

      <div class="plan-editor-footer ${activeTab === 'routing' ? '' : 'is-compact'}">
        <div class="plan-editor-preview">${activeTab === 'routing' ? '先保存路由配置，再执行路由连通性测试。失败会返回可定位的错误原因。' : '先维护供应商连接信息，再切换到路由页签绑定业务。'}</div>
        <div class="inline-actions">
          ${activeTab === 'routing'
            ? `<select id="aiTestRouteKeySelect" class="form-select">
                ${AI_ROUTE_DEFINITIONS.map((route) => `
                  <option value="${escapeHtml(route.key)}">测试路由：${escapeHtml(route.label)}</option>
                `).join('')}
              </select>
              <button id="testAiModelConfigBtn" class="secondary-btn" type="button">测试当前配置</button>`
            : ''}
          <button id="saveAiModelConfigBtn" class="primary-btn" type="button">保存 AI 配置</button>
        </div>
      </div>
      <div id="aiModelConfigTestResultWrap" ${activeTab === 'routing' ? '' : 'hidden'}></div>
    </div>
  `

  bindAiModelConfigActions(config)
  if (activeTab === 'routing') {
    renderAiModelConfigTestResult()
  }
}

function bindAiModelConfigActions(currentConfig) {
  const saveButton = document.getElementById('saveAiModelConfigBtn')
  if (!saveButton) {
    return
  }

  const testButton = document.getElementById('testAiModelConfigBtn')

  document.querySelectorAll('[data-ai-config-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextTab = button.dataset.aiConfigTab === 'routing' ? 'routing' : 'providers'
      if (state.aiConfigTab === nextTab) {
        return
      }
      state.aiConfigTab = nextTab
      renderAiConfig()
    })
  })

  document.querySelectorAll('[data-ai-route]').forEach((card) => {
    const providerSelect = card.querySelector('[data-ai-route-field="providerKey"]')
    const providerHidden = card.querySelector('[data-ai-route-field="provider"]')
    const modelInput = card.querySelector('[data-ai-route-field="model"]')
    const modelHint = card.querySelector('[data-ai-route-model-hint]')
    const modelOptions = card.querySelector('[data-ai-route-model-options]')
    const fallbackProviderSelect = card.querySelector('[data-ai-route-field="fallbackProviderKey"]')
    const fallbackModelInput = card.querySelector('[data-ai-route-field="fallbackModel"]')
    const fallbackModelHint = card.querySelector('[data-ai-route-fallback-model-hint]')
    const fallbackModelOptions = card.querySelector('[data-ai-route-fallback-model-options]')
    let previousProviderKey = providerSelect ? toText(providerSelect.value) : ''
    let previousFallbackProviderKey = fallbackProviderSelect ? toText(fallbackProviderSelect.value) : ''

    const refreshRouteFields = (options = {}) => {
      const providerKey = providerSelect ? toText(providerSelect.value) : ''
      const providerPreset = getAiProviderPreset(providerKey)
      const providerConfig = (currentConfig.providers && currentConfig.providers[providerKey]) || providerPreset || {}
      const providerValue = providerConfig.providerType === 'cloudbase'
        ? toText(providerConfig.cloudbaseProvider || 'hunyuan-exp')
        : 'openai_compatible'
      if (providerHidden) {
        providerHidden.value = providerValue
      }

      if (modelHint) {
        modelHint.textContent = buildProviderModelHint(providerKey, '填写实际模型名')
      }
      if (modelOptions) {
        modelOptions.innerHTML = buildProviderModelOptionMarkup(providerKey)
      }

      const nextDefaultModel = getProviderDefaultModelForRoute(providerKey, currentConfig.providers)
      const previousDefaultModel = getProviderDefaultModelForRoute(previousProviderKey, currentConfig.providers)
      if (modelInput && options.providerChanged && nextDefaultModel) {
        const currentModel = toText(modelInput.value)
        if (!currentModel || currentModel === previousDefaultModel) {
          modelInput.value = nextDefaultModel
        }
      }

      const fallbackProviderKey = fallbackProviderSelect ? toText(fallbackProviderSelect.value) : ''
      if (fallbackModelHint) {
        fallbackModelHint.textContent = fallbackProviderKey
          ? buildProviderModelHint(fallbackProviderKey, '留空走回退默认模型')
          : '留空走回退默认模型'
      }
      if (fallbackModelOptions) {
        fallbackModelOptions.innerHTML = buildProviderModelOptionMarkup(fallbackProviderKey)
      }

      const nextFallbackDefaultModel = getProviderDefaultModelForRoute(fallbackProviderKey, currentConfig.providers)
      const previousFallbackDefaultModel = getProviderDefaultModelForRoute(previousFallbackProviderKey, currentConfig.providers)
      if (fallbackModelInput && options.fallbackProviderChanged) {
        const currentFallbackModel = toText(fallbackModelInput.value)
        if (!fallbackProviderKey) {
          fallbackModelInput.value = ''
        } else if (nextFallbackDefaultModel && (!currentFallbackModel || currentFallbackModel === previousFallbackDefaultModel)) {
          fallbackModelInput.value = nextFallbackDefaultModel
        }
      }

      previousProviderKey = providerKey
      previousFallbackProviderKey = fallbackProviderKey
    }

    if (providerSelect) {
      providerSelect.addEventListener('change', () => {
        refreshRouteFields({
          providerChanged: true
        })
      })
    }
    if (fallbackProviderSelect) {
      fallbackProviderSelect.addEventListener('change', () => {
        refreshRouteFields({
          fallbackProviderChanged: true
        })
      })
    }
    refreshRouteFields()
  })

  if (testButton) {
    testButton.addEventListener('click', () => {
      const routeSelect = document.getElementById('aiTestRouteKeySelect')
      const routeKey = routeSelect ? toText(routeSelect.value) : 'followup_summary'
      performAiModelConfigTestAction({
        routeKey
      })
    })
  }

  saveButton.addEventListener('click', () => {
    const quotaPolicyElement = document.getElementById('aiQuotaPolicySelect')
    const nextQuotaPolicy = quotaPolicyElement && toText(quotaPolicyElement.value) === 'provider_plan'
      ? 'provider_plan'
      : 'local_quota'

    const nextProviders = {}
    const changedApiKeyProviders = []
    const providerKeys = Object.keys(currentConfig.providers || {})
    providerKeys.forEach((providerKey) => {
      const card = document.querySelector(`[data-ai-provider="${providerKey}"]`)
      if (!card) {
        nextProviders[providerKey] = normalizeProviderConfig(
          providerKey,
          currentConfig.providers[providerKey],
          DEFAULT_AI_MODEL_CONFIG.providers[providerKey]
        )
        return
      }
      nextProviders[providerKey] = readAiProviderCardPayload(card, providerKey, currentConfig)
      if (nextProviders[providerKey] && toText(nextProviders[providerKey].apiKey)) {
        changedApiKeyProviders.push(providerKey)
      }
    })

    const nextRouting = {}
    const routeKeys = AI_ROUTE_DEFINITIONS.map((item) => item.key)
    routeKeys.forEach((routeKey) => {
      const card = document.querySelector(`[data-ai-route="${routeKey}"]`)
      if (!card) {
        nextRouting[routeKey] = normalizeRouteConfig(
          currentConfig.modelRouting[routeKey],
          DEFAULT_AI_MODEL_CONFIG.modelRouting[routeKey]
        )
        return
      }
      nextRouting[routeKey] = readAiRouteCardPayload(card, routeKey, currentConfig)
    })

    const missingProviderKeys = []
    Object.keys(nextRouting).forEach((routeKey) => {
      const providerKey = toText(nextRouting[routeKey].providerKey)
      if (!providerKey || !nextProviders[providerKey]) {
        missingProviderKeys.push(`${routeKey}:${providerKey || '-'}`)
      }
    })
    if (missingProviderKeys.length) {
      setNotice(`保存失败：存在未配置的 providerKey（${missingProviderKeys.join(', ')}）`, 'danger')
      render()
      return
    }

    const successText = changedApiKeyProviders.length
      ? `AI 模型配置已保存，已更新 API Key：${changedApiKeyProviders.join(', ')}。`
      : 'AI 模型配置已保存。'

    performAiModelConfigAction({
      config: {
        quotaPolicy: nextQuotaPolicy,
        providers: nextProviders,
        modelRouting: nextRouting
      },
      reason: `后台维护 AI 模型路由（quotaPolicy=${nextQuotaPolicy}）`
    }, successText)
  })
}

function renderAiModelConfigTestResult() {
  const wrap = document.getElementById('aiModelConfigTestResultWrap')
  if (!wrap) {
    return
  }

  const result = state.aiModelConfigTest
  if (!result) {
    wrap.innerHTML = '<div class="empty-card">尚未执行测试。可选择路由后点击“测试当前配置”。</div>'
    return
  }

  const runtime = result.runtime && typeof result.runtime === 'object' ? result.runtime : {}
  const probe = result.probe && typeof result.probe === 'object' ? result.probe : {}
  const statusBadge = result.ok
    ? '<span class="badge is-success">连通成功</span>'
    : '<span class="badge is-danger">连通失败</span>'
  const routeLabel = getRouteLabel(result.routeKey || runtime.routeKey || '')
  const runtimeProviderKey = toText(runtime.providerKey || '')
  const runtimeProviderPreset = runtimeProviderKey ? getAiProviderPreset(runtimeProviderKey) : null
  const runtimeRecommendedAt = toText(runtimeProviderPreset && runtimeProviderPreset.recommendedAt)

  wrap.innerHTML = `
    <section class="detail-card">
      <div class="ai-test-head">
        <h4 class="detail-card-title">测试结果</h4>
        ${statusBadge}
      </div>
      <div class="detail-grid purchase-summary-grid">
        <div>
          <div class="detail-item-label">测试时间</div>
          <div class="detail-item-value">${escapeHtml(result.testedAt || '-')}</div>
        </div>
        <div>
          <div class="detail-item-label">测试路由</div>
          <div class="detail-item-value">${escapeHtml(routeLabel || '-')}</div>
        </div>
        <div>
          <div class="detail-item-label">耗时</div>
          <div class="detail-item-value">${escapeHtml(result.elapsedMs > 0 ? `${result.elapsedMs} ms` : '-')}</div>
        </div>
        <div>
          <div class="detail-item-label">配置来源</div>
          <div class="detail-item-value">${escapeHtml(result.source || '-')}</div>
        </div>
        <div>
          <div class="detail-item-label">建议口径日期</div>
          <div class="detail-item-value">${escapeHtml(runtimeRecommendedAt || '-')}</div>
        </div>
        <div>
          <div class="detail-item-label">providerKey</div>
          <div class="detail-item-value">${escapeHtml(runtime.providerKey || '-')}</div>
        </div>
        <div>
          <div class="detail-item-label">供应商名称</div>
          <div class="detail-item-value">${escapeHtml(runtime.providerLabel || '-')}</div>
        </div>
        <div>
          <div class="detail-item-label">引擎</div>
          <div class="detail-item-value">${escapeHtml(runtime.engine || '-')}</div>
        </div>
        <div>
          <div class="detail-item-label">协议模式</div>
          <div class="detail-item-value">${escapeHtml(getProtocolModeLabel(runtime.protocolMode || 'auto'))}</div>
        </div>
        <div>
          <div class="detail-item-label">模型</div>
          <div class="detail-item-value">${escapeHtml(runtime.model || '-')}</div>
        </div>
        <div>
          <div class="detail-item-label">API Key</div>
          <div class="detail-item-value">${escapeHtml(runtime.apiKeyMasked || (runtime.engine === 'openai_compatible' ? '未配置' : '不适用'))}</div>
        </div>
      </div>
      ${runtimeRecommendedAt
        ? `<div class="order-note">建议口径已同步至 ${escapeHtml(runtimeRecommendedAt)}，最终仍以当前环境联调通过结果为准。</div>`
        : ''}
      ${runtime.fallbackProviderKey
        ? `<div class="order-note">已配置回退：${escapeHtml(runtime.fallbackProviderKey)}${runtime.fallbackModel ? ` / ${escapeHtml(runtime.fallbackModel)}` : ''}</div>`
        : ''}
      ${result.ok
        ? `<div class="order-note order-note-strong">模型返回片段：${escapeHtml(toText(probe.snippet || '-'))}</div>`
        : `<div class="order-note order-note-strong">失败原因：${escapeHtml(result.error || '未知错误')}</div>`}
    </section>
  `
}

function buildUsageDetailMarkup(summary) {
  const usageLedger = Array.isArray(state.usageViewLedger) ? state.usageViewLedger : []
  const matchedLedger = usageLedger
    .filter((item) => item.accountId === summary.accountId)
    .filter((item) => state.usageTypeFilter === 'all' || toText(item.usageType) === state.usageTypeFilter)
    .filter((item) => isUsageWithinTimeWindow(item, state.usageTimeWindow))
    .filter((item) => state.usageSourceFilter === 'all' || toText(item.sourceType) === state.usageSourceFilter)
    .filter((item) => matchesUsageProviderModel(item, state.usageProviderFilter, state.usageModelFilter))
    .sort((left, right) => parseDateMs(right.occurredAt) - parseDateMs(left.occurredAt))
  const ledger = matchedLedger.slice(0, 16)
  const hiddenLedgerCount = Math.max(0, matchedLedger.length - ledger.length)
  const ledgerStats = buildUsageLedgerStats(matchedLedger)
  const ledgerGroupsMap = {}
  ledger.forEach((item) => {
    const key = formatUsageDateKey(parseDateMs(item.occurredAt)) || '未知日期'
    if (!ledgerGroupsMap[key]) {
      ledgerGroupsMap[key] = []
    }
    ledgerGroupsMap[key].push(item)
  })
  const ledgerGroups = Object.keys(ledgerGroupsMap)
    .sort((left, right) => right.localeCompare(left))
    .map((dateKey) => ({
      dateKey,
      items: ledgerGroupsMap[dateKey]
    }))
  const usageTypeLabel = state.usageTypeFilter === 'all'
    ? '全部额度类型'
    : getUsageTypeLabel(state.usageTypeFilter)
  const timeWindowLabel = getUsageTimeWindowLabel(state.usageTimeWindow)
  const sourceLabel = getUsageSourceFilterLabel(state.usageSourceFilter)
  const subscription = summary.latestSubscription || {}
  const currentPlan = getPlanByCode(subscription.planCode)
  const accessBadgeClass = summary.status === 'active_paid'
    ? 'is-success'
    : (summary.status === 'trialing' ? 'is-brand' : 'is-soft')
  const displayLabel = getAccountDisplayLabel(summary) || '当前未设置显示名'

  return `
    <div class="detail-stack">
      <section class="detail-card detail-card-hero">
        <div class="purchase-hero">
          <div class="purchase-hero-main">
            <div class="mini-kicker">权益总览</div>
            <h4 class="purchase-title">${escapeHtml(getAccountPrimaryPhone(summary))}</h4>
            <div class="purchase-subtitle">${escapeHtml(getAccountSecondaryMeta(summary) || summary.accountId || '-')}</div>
            <div class="purchase-price-row">
              <div class="purchase-price">${escapeHtml(summary.latestSubscription.planName || '未开订阅')}</div>
            </div>
          </div>
          <div class="badge ${accessBadgeClass}">${escapeHtml(getStatusLabel(summary.status))}</div>
        </div>
        <div class="detail-grid purchase-summary-grid">
          <div>
            <div class="detail-item-label">当前显示名</div>
            <div class="detail-item-value">${escapeHtml(displayLabel)}</div>
          </div>
          <div>
            <div class="detail-item-label">手机号状态</div>
            <div class="detail-item-value">${escapeHtml(summary.phoneVerified ? (summary.phone || '已绑定') : '未绑定')}</div>
          </div>
          <div>
            <div class="detail-item-label">当前订阅</div>
            <div class="detail-item-value">${escapeHtml(subscription.planName || '未开订阅')}</div>
          </div>
          <div>
            <div class="detail-item-label">语音总量 / 剩余</div>
            <div class="detail-item-value">${escapeHtml(`${formatVoiceQuotaText(summary.voiceSecondsTotal)} / ${formatVoiceQuotaText(summary.voiceSecondsRemaining)}`)}</div>
          </div>
          <div>
            <div class="detail-item-label">AI 总量 / 剩余</div>
            <div class="detail-item-value">${escapeHtml(`${formatAiQuotaText(summary.aiTokensTotal)} / ${formatAiQuotaText(summary.aiTokensRemaining)}`)}</div>
          </div>
          <div>
            <div class="detail-item-label">项目位</div>
            <div class="detail-item-value">${escapeHtml(summary.projectLimit < 0 ? `${summary.currentProjectCount} 个在用项目` : `${summary.currentProjectCount} / ${summary.projectLimit}`)}</div>
          </div>
          <div>
            <div class="detail-item-label">最近流水</div>
            <div class="detail-item-value">${escapeHtml(summary.latestUsageAt || '暂无流水')}</div>
          </div>
        </div>
        ${summary.reasonSummary ? `<div class="order-note order-note-strong">${escapeHtml(summary.reasonSummary)}</div>` : ''}
      </section>

      ${currentPlan ? `
        <section class="detail-card">
          <h4 class="detail-card-title">当前订阅商品</h4>
          ${buildMiniPlanCardMarkup(currentPlan, { current: true })}
          <div class="detail-grid purchase-summary-grid">
            <div>
              <div class="detail-item-label">订阅状态</div>
              <div class="detail-item-value">${escapeHtml(subscription.status || '无')}</div>
            </div>
            <div>
              <div class="detail-item-label">结算周期</div>
              <div class="detail-item-value">${escapeHtml(subscription.billingCycle || '-')}</div>
            </div>
            <div>
              <div class="detail-item-label">到期时间</div>
              <div class="detail-item-value">${escapeHtml(subscription.expiresAt || '-')}</div>
            </div>
            <div>
              <div class="detail-item-label">来源订单</div>
              <div class="detail-item-value">${escapeHtml(subscription.sourceOrderId || '-')}</div>
            </div>
          </div>
        </section>
      ` : `
        <section class="detail-card">
          <h4 class="detail-card-title">当前订阅</h4>
          <div class="empty-card">当前还没有匹配到订阅商品目录。若用户已经到账但这里为空，请先确认商品目录中的 planCode 与订阅记录一致。</div>
        </section>
      `}

      <section class="detail-card">
        <h4 class="detail-card-title">最近额度流水 · ${escapeHtml(getUsageSourceFilterLabel(state.usageSourceFilter))}</h4>
        <div class="detail-card-subtitle">口径：${escapeHtml(usageTypeLabel)} · ${escapeHtml(timeWindowLabel)} · ${escapeHtml(sourceLabel)} · 展示 ${escapeHtml(`${ledger.length} / ${matchedLedger.length}`)} 条</div>
        <div class="usage-ledger-top-grid">
          <article class="usage-ledger-top-card">
            <div class="section-summary-label">总流水</div>
            <div class="section-summary-value">${escapeHtml(`${matchedLedger.length} 条`)}</div>
            <div class="section-summary-note">消耗 ${escapeHtml(`${ledgerStats.consumeCount}`)} 条 · 发放 ${escapeHtml(`${ledgerStats.grantCount}`)} 条</div>
          </article>
          <article class="usage-ledger-top-card">
            <div class="section-summary-label">语音净消耗</div>
            <div class="section-summary-value">${escapeHtml(formatVoiceQuotaText(ledgerStats.consumeVoiceSeconds))}</div>
            <div class="section-summary-note">回补 ${escapeHtml(formatVoiceQuotaText(ledgerStats.grantVoiceSeconds))}</div>
          </article>
          <article class="usage-ledger-top-card">
            <div class="section-summary-label">AI 净消耗</div>
            <div class="section-summary-value">${escapeHtml(formatAiQuotaText(ledgerStats.consumeAiTokens))}</div>
            <div class="section-summary-note">回补 ${escapeHtml(formatAiQuotaText(ledgerStats.grantAiTokens))}</div>
          </article>
          <article class="usage-ledger-top-card">
            <div class="section-summary-label">fallback 次数</div>
            <div class="section-summary-value">${escapeHtml(`${ledgerStats.fallbackCount} 次`)}</div>
            <div class="section-summary-note">仅统计当前筛选口径</div>
          </article>
        </div>
        ${ledger.length ? `
          <div class="usage-ledger-list">
            ${ledgerGroups.map((group) => `
              <section class="usage-ledger-day-group">
                <div class="usage-ledger-day-head">
                  <span class="usage-ledger-day-title">${escapeHtml(group.dateKey)}</span>
                  <span class="badge is-neutral">${escapeHtml(`${group.items.length} 条`)}</span>
                </div>
                <div class="usage-ledger-day-list">
                  ${group.items.map((item) => {
                    const metaInfo = buildUsageMetaInfo(item)
                    return `
                      <article class="usage-ledger-item">
                        <div class="usage-ledger-head">
                          <div class="usage-ledger-title-wrap">
                            <div class="usage-ledger-title">${escapeHtml(item.sourceTypeLabel || '-')}</div>
                            <div class="usage-ledger-meta">${escapeHtml(item.occurredAt || '-')}</div>
                          </div>
                          <div class="table-badge-row">
                            <span class="badge ${getUsageTypeBadgeClass(item.usageType)}">${escapeHtml(item.usageTypeLabel || '-')}</span>
                            <span class="badge ${item.directionBadgeClass}">${escapeHtml(item.directionLabel)}</span>
                            <span class="badge is-neutral">${escapeHtml(item.deltaText)}</span>
                          </div>
                        </div>
                        <div class="usage-ledger-balance">余额变化：${escapeHtml(item.balanceText)}</div>
                        ${metaInfo.primaryLines && metaInfo.primaryLines.length ? `
                          <div class="usage-ledger-notes">
                            ${metaInfo.primaryLines.map((line) => `<div class="usage-ledger-note">${escapeHtml(line)}</div>`).join('')}
                          </div>
                        ` : ''}
                        ${metaInfo.technicalLines && metaInfo.technicalLines.length ? `
                          <details class="usage-ledger-tech">
                            <summary>技术追踪</summary>
                            <div class="usage-ledger-tech-list">
                              ${metaInfo.technicalLines.map((line) => `<div class="usage-ledger-note">${escapeHtml(line)}</div>`).join('')}
                            </div>
                          </details>
                        ` : ''}
                      </article>
                    `
                  }).join('')}
                </div>
              </section>
            `).join('')}
          </div>
          ${hiddenLedgerCount > 0 ? `<div class="order-note">还有 ${escapeHtml(`${hiddenLedgerCount}`)} 条较早流水未在本屏展示，可继续收窄筛选条件查看。</div>` : ''}
        ` : `
          <div class="empty-card">当前还没有额度流水。等语音转写、AI 调用、后台补量或补偿动作发生后，这里会开始出现记录。</div>
        `}
      </section>
    </div>
  `
}

function renderPlanCatalog() {
  const wrap = document.getElementById('planCatalogWrap')
  if (!wrap) {
    return
  }

  if (!state.plans.length) {
    wrap.innerHTML = '<div class="empty-card">当前还没有商品目录数据。请先确认 `plans` 集合已导入或已通过默认商品回填。</div>'
    return
  }

  wrap.innerHTML = `
    <div class="plan-admin-grid">
      ${state.plans.map((plan) => `
        <article class="plan-editor-card" data-plan-card="${escapeHtml(plan.planCode)}">
          <div class="plan-editor-head">
            <div>
              <div class="plan-editor-title">${escapeHtml(plan.planName)}</div>
              <div class="plan-editor-meta">${escapeHtml(plan.planCode)} · ${escapeHtml(getPlanTypeLabel(plan.planType))} / ${escapeHtml(plan.billingCycle || 'one_time')}</div>
            </div>
            <div class="badge ${plan.enabled ? 'is-success' : 'is-danger'}">${plan.enabled ? '启用中' : '已停用'}</div>
          </div>

          <div class="plan-front-preview">
            <div class="plan-front-preview-head">
              <div>
                <div class="mini-kicker">${escapeHtml(getPlanTypeLabel(plan.planType))}</div>
                <div class="plan-front-preview-title">${escapeHtml(plan.planName)}</div>
                <div class="plan-front-preview-subtitle">${escapeHtml(plan.displayBillingText || plan.billingCycle || 'one_time')}</div>
              </div>
              <div class="plan-front-preview-price-wrap">
                <div class="plan-front-preview-price">${escapeHtml(plan.amountText || '价格待定')}</div>
                ${plan.originalPriceText ? `<div class="plan-front-preview-original">原价 ${escapeHtml(plan.originalPriceText)}</div>` : ''}
              </div>
            </div>
            <div class="detail-grid purchase-summary-grid">
              <div>
                <div class="detail-item-label">项目位</div>
                <div class="detail-item-value">${escapeHtml(formatProjectLimitText(plan.projectLimit))}</div>
              </div>
              <div>
                <div class="detail-item-label">包含语音</div>
                <div class="detail-item-value">${escapeHtml(formatVoiceQuotaText(plan.monthlyVoiceSeconds))}</div>
              </div>
              <div>
                <div class="detail-item-label">包含 AI</div>
                <div class="detail-item-value">${escapeHtml(formatAiQuotaText(plan.monthlyAiTokens))}</div>
              </div>
              <div>
                <div class="detail-item-label">显示价格</div>
                <div class="detail-item-value">${escapeHtml(plan.displayPriceText || '按真实价格展示')}</div>
              </div>
            </div>
            ${buildCapabilityPillsMarkup(plan.capabilityLines)}
            ${plan.summary ? `<div class="order-note order-note-strong">${escapeHtml(plan.summary)}</div>` : ''}
          </div>

          <div class="plan-editor-grid">
            <label class="field-group">
              <span class="field-label">商品名称</span>
              <input class="form-input" data-plan-field="planName" value="${escapeHtml(plan.planName)}" />
            </label>
            <label class="field-group">
              <span class="field-label">显示周期</span>
              <input class="form-input" data-plan-field="displayBillingText" value="${escapeHtml(plan.displayBillingText || '')}" placeholder="按月订阅 / 流量包" />
            </label>
            <label class="field-group">
              <span class="field-label">价格（元）</span>
              <input class="form-input" data-plan-field="priceYuan" type="number" min="0" step="0.01" value="${escapeHtml((plan.price / 100).toFixed(2))}" />
            </label>
            <label class="field-group">
              <span class="field-label">原价（元）</span>
              <input class="form-input" data-plan-field="originalPriceYuan" type="number" min="0" step="0.01" value="${escapeHtml((plan.originalPrice / 100).toFixed(2))}" />
            </label>
            <label class="field-group">
              <span class="field-label">展示文案</span>
              <input class="form-input" data-plan-field="displayPriceText" value="${escapeHtml(plan.displayPriceText || '')}" placeholder="留空时优先按真实价格显示" />
            </label>
            <label class="field-group">
              <span class="field-label">排序</span>
              <input class="form-input" data-plan-field="sortOrder" type="number" value="${escapeHtml(plan.sortOrder)}" />
            </label>
            <label class="field-group">
              <span class="field-label">项目上限</span>
              <input class="form-input" data-plan-field="projectLimit" type="number" value="${escapeHtml(plan.projectLimit)}" />
            </label>
            <label class="field-group">
              <span class="field-label">语音额度</span>
              <input class="form-input" data-plan-field="monthlyVoiceSeconds" type="number" min="0" value="${escapeHtml(plan.monthlyVoiceSeconds)}" />
            </label>
            <label class="field-group">
              <span class="field-label">AI 额度</span>
              <input class="form-input" data-plan-field="monthlyAiTokens" type="number" min="0" value="${escapeHtml(plan.monthlyAiTokens)}" />
            </label>
          </div>

          <label class="field-group">
            <span class="field-label">套餐摘要</span>
            <textarea class="form-textarea is-compact" data-plan-field="summary" placeholder="一句话说明这个商品适合什么场景。">${escapeHtml(plan.summary || '')}</textarea>
          </label>

          <label class="field-group">
            <span class="field-label">特性列表</span>
            <textarea class="form-textarea is-compact" data-plan-field="featureLines" placeholder="每行一条能力说明。">${escapeHtml((plan.featureLines || []).join('\n'))}</textarea>
          </label>

          <div class="checkbox-grid">
            <label class="checkbox-item"><input type="checkbox" data-plan-field="enabled" ${plan.enabled ? 'checked' : ''}>启用商品</label>
            <label class="checkbox-item"><input type="checkbox" data-plan-field="isPricePending" ${plan.isPricePending ? 'checked' : ''}>价格待确认</label>
            <label class="checkbox-item"><input type="checkbox" data-plan-field="supportsShareOut" ${plan.supportsShareOut ? 'checked' : ''}>支持外发</label>
            <label class="checkbox-item"><input type="checkbox" data-plan-field="supportsQuickEntry" ${plan.supportsQuickEntry ? 'checked' : ''}>支持闪录</label>
            <label class="checkbox-item"><input type="checkbox" data-plan-field="supportsSpeechToText" ${plan.supportsSpeechToText ? 'checked' : ''}>支持语音</label>
            <label class="checkbox-item"><input type="checkbox" data-plan-field="supportsAi" ${plan.supportsAi ? 'checked' : ''}>支持 AI</label>
            <label class="checkbox-item"><input type="checkbox" data-plan-field="trialEligible" ${plan.trialEligible ? 'checked' : ''}>允许试用入口</label>
          </div>

          <div class="plan-editor-footer">
            <div class="plan-editor-preview">前台卡片会优先显示真实价格、周期、额度和能力摘要。</div>
            <button class="primary-btn" type="button" data-plan-save="${escapeHtml(plan.planCode)}">保存商品</button>
          </div>
        </article>
      `).join('')}
    </div>
  `

  bindPlanCatalogActions()
}

function renderPlanCatalogSummary() {
  const wrap = document.getElementById('planCatalogSummaryWrap')
  if (!wrap) {
    return
  }

  const totalPlans = state.plans.length
  const enabledPlans = state.plans.filter((item) => item.enabled).length
  const subscriptionPlans = state.plans.filter((item) => item.planType === 'subscription').length
  const pendingPricePlans = state.plans.filter((item) => item.isPricePending).length

  wrap.innerHTML = [
    {
      label: '启用商品',
      value: `${enabledPlans} 个`,
      note: enabledPlans > 0 ? '前台会优先展示这批商品。' : '当前没有启用中的商品。'
    },
    {
      label: '订阅套餐',
      value: `${subscriptionPlans} 个`,
      note: subscriptionPlans > 0 ? '用于承接月付、年付等持续订阅。' : '当前没有订阅型商品。'
    },
    {
      label: '待补价格',
      value: `${pendingPricePlans} 个`,
      note: pendingPricePlans > 0 ? '这批商品仍处于价格待确认状态。' : `商品总数 ${totalPlans} 个，当前价格口径已完整。`
    }
  ].map((item) => `
    <article class="section-summary-card">
      <div class="section-summary-label">${escapeHtml(item.label)}</div>
      <div class="section-summary-value">${escapeHtml(item.value)}</div>
      <div class="section-summary-note">${escapeHtml(item.note)}</div>
    </article>
  `).join('')
}

function bindPlanCatalogActions() {
  document.querySelectorAll('[data-plan-save]').forEach((button) => {
    button.addEventListener('click', () => {
      const planCode = toText(button.dataset.planSave)
      const card = button.closest('[data-plan-card]')
      const currentPlan = state.plans.find((item) => item.planCode === planCode)

      if (!planCode || !card || !currentPlan) {
        setNotice('当前商品不存在，无法保存。', 'danger')
        render()
        return
      }

      const readField = (fieldName) => {
        const element = card.querySelector(`[data-plan-field="${fieldName}"]`)
        return element ? element.value : ''
      }
      const readChecked = (fieldName) => {
        const element = card.querySelector(`[data-plan-field="${fieldName}"]`)
        return Boolean(element && element.checked)
      }
      const priceYuan = toNumber(readField('priceYuan'), 0)
      const originalPriceYuan = toNumber(readField('originalPriceYuan'), 0)

      performPlanAction({
        planCode,
        planName: readField('planName'),
        planType: currentPlan.planType,
        billingCycle: currentPlan.billingCycle,
        price: Math.max(0, Math.round(priceYuan * 100)),
        originalPrice: Math.max(0, Math.round(originalPriceYuan * 100)),
        displayPriceText: readField('displayPriceText'),
        displayBillingText: readField('displayBillingText'),
        sortOrder: Math.floor(toNumber(readField('sortOrder'), currentPlan.sortOrder)),
        projectLimit: Math.floor(toNumber(readField('projectLimit'), currentPlan.projectLimit)),
        monthlyVoiceSeconds: Math.max(0, Math.floor(toNumber(readField('monthlyVoiceSeconds'), currentPlan.monthlyVoiceSeconds))),
        monthlyAiTokens: Math.max(0, Math.floor(toNumber(readField('monthlyAiTokens'), currentPlan.monthlyAiTokens))),
        summary: readField('summary'),
        featureLines: readField('featureLines'),
        enabled: readChecked('enabled'),
        isPricePending: readChecked('isPricePending'),
        supportsShareOut: readChecked('supportsShareOut'),
        supportsQuickEntry: readChecked('supportsQuickEntry'),
        supportsSpeechToText: readChecked('supportsSpeechToText'),
        supportsAi: readChecked('supportsAi'),
        trialEligible: readChecked('trialEligible'),
        reason: `后台维护商品目录：${planCode}`
      }, `已保存商品 ${planCode}。`)
    })
  })
}

function renderAudit() {
  const filteredLogs = state.auditLogs.filter((item) => auditMatches(item, state.auditSearch))
  document.getElementById('auditCountMeta').textContent = `共 ${filteredLogs.length} 条操作记录`

  if (!filteredLogs.length) {
    document.getElementById('auditTableWrap').innerHTML = `<div class="empty-card">${escapeHtml(buildEmptyAuditCopy())}</div>`
    return
  }

  document.getElementById('auditTableWrap').innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>时间</th>
          <th>操作人</th>
          <th>动作</th>
          <th>目标</th>
          <th>原因</th>
        </tr>
      </thead>
      <tbody>
        ${filteredLogs.map((item) => `
          <tr>
            <td>${buildTableMainCell(item.createdAt || '-', item.logId)}</td>
            <td>${buildTableMainCell(item.operatorId, '管理操作')}</td>
            <td>
              ${buildBadgeListMarkup([
                `<span class="badge ${getActionBadgeClass(item.actionType)}">${escapeHtml(getActionLabel(item.actionType))}</span>`
              ])}
              <div class="table-main-meta">${escapeHtml(item.actionType)}</div>
            </td>
            <td>${buildTableMainCell(item.targetId, item.targetType)}</td>
            <td>
              <div class="audit-reason-block">
                <div class="audit-note">${escapeHtml(item.reason)}</div>
              </div>
              <div class="audit-snapshot-grid">
                <div class="snapshot-block">
                  <div class="snapshot-title">变更前</div>
                  <pre class="snapshot-code">${escapeHtml(JSON.stringify(item.beforeSnapshot, null, 2))}</pre>
                </div>
                <div class="snapshot-block">
                  <div class="snapshot-title">变更后</div>
                  <pre class="snapshot-code">${escapeHtml(JSON.stringify(item.afterSnapshot, null, 2))}</pre>
                </div>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

function bindGlobalEvents() {
  const switchAdminView = (nextView) => {
    const normalizedView = toText(nextView)
    if (!normalizedView || !VIEW_META[normalizedView]) {
      setNotice(`菜单配置异常：未知视图 ${normalizedView || '(empty)'}`, 'danger')
      render()
      return
    }
    state.currentView = normalizedView
    if (isBillingView(normalizedView)) {
      state.sidebarGroups.billing = true
    }
    render()
    if (normalizedView === 'legalDocuments' && !state.legalDocuments.length && !state.runtime.legalDocumentsLoading) {
      refreshLegalDocumentsData({
        preserveSelection: true,
        renderOnFinish: true
      })
    }
  }

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      switchAdminView(item.dataset.view)
    })
  })

  document.querySelectorAll('.nav-subitem').forEach((item) => {
    item.addEventListener('click', () => {
      switchAdminView(item.dataset.view)
    })
  })

  const billingNavToggle = document.getElementById('billingNavToggle')
  if (billingNavToggle) {
    billingNavToggle.addEventListener('click', () => {
      state.sidebarGroups.billing = !Boolean(state.sidebarGroups.billing)
      render()
    })
  }

  const loginForm = document.getElementById('adminLoginForm')
  if (loginForm) {
    loginForm.addEventListener('submit', handleAdminLogin)
  }

  const logoutBtn = document.getElementById('adminLogoutBtn')
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleAdminLogout)
  }

  document.getElementById('refreshDataBtn').addEventListener('click', async () => {
    await refreshData({ preserveSelection: true })
  })

  document.getElementById('resetStateBtn').addEventListener('click', async () => {
    try {
      state.runtime.loading = true
      setNotice('', 'info')
      render()
      const result = await provider.reset()
      state.accounts = result.accounts || []
      state.orders = result.orders || []
      state.feedbackItems = result.feedbackItems || []
      state.referralItems = result.referralItems || []
      state.referralStats = result.referralStats || buildLocalReferralStats(state.referralItems)
      state.usageSummaries = result.usageSummaries || []
      state.usageLedger = result.usageLedger || []
      state.usageViewSummaries = result.usageSummaries || []
      state.usageViewLedger = result.usageLedger || []
      state.globalUsageSummaries = result.usageSummaries || []
      state.globalUsageLedger = result.usageLedger || []
      state.overviewUsageReport = buildUsageReportFromLocalData({
        summaries: state.usageSummaries,
        ledger: getLedgerByTimeWindow(state.usageLedger, 'last_30d'),
        usageType: 'all',
        pageInfo: {
          page: 1,
          pageSize: 1,
          total: getLedgerByTimeWindow(state.usageLedger, 'last_30d').length,
          totalPages: 1,
          hasPrev: false,
          hasNext: false,
          returned: 0
        }
      })
      state.globalUsageReport = buildUsageReportFromLocalData({
        summaries: state.globalUsageSummaries,
        ledger: state.globalUsageLedger,
        usageType: getGlobalUsageActiveType(),
        pageInfo: {
          page: 1,
          pageSize: state.globalUsagePageSize,
          total: state.globalUsageLedger.length,
          totalPages: state.globalUsageLedger.length > 0 ? Math.ceil(state.globalUsageLedger.length / state.globalUsagePageSize) : 1,
          hasPrev: false,
          hasNext: state.globalUsageLedger.length > state.globalUsagePageSize,
          returned: Math.min(state.globalUsageLedger.length, state.globalUsagePageSize)
        }
      })
      state.globalUsagePageInfo = normalizeUsagePageInfo(
        state.globalUsageReport && state.globalUsageReport.pageInfo ? state.globalUsageReport.pageInfo : {},
        state.globalUsageLedger.length,
        state.globalUsagePageSize
      )
      state.plans = result.plans || []
      state.aiModelConfig = normalizeAiModelConfig(DEFAULT_AI_MODEL_CONFIG)
      state.auditLogs = result.auditLogs || []
      state.manualAdjustmentLogs = result.manualAdjustmentLogs || []
      state.runtime.sourceLabel = toText(result.sourceLabel) || state.runtime.sourceLabel
      state.runtime.supportsReset = Boolean(result.supportsReset)
      state.runtime.lastSyncAt = formatDateTimeText(new Date())

      state.selectedAccountId = state.accounts[0] ? state.accounts[0].accountId : ''
      state.selectedOrderId = state.orders[0] ? state.orders[0].orderId : ''
      state.selectedFeedbackId = state.feedbackItems[0] ? state.feedbackItems[0].feedbackId : ''
      state.selectedReferralId = state.referralItems[0] ? state.referralItems[0].relationId : ''
      state.selectedUsageAccountId = state.usageViewSummaries[0] ? state.usageViewSummaries[0].accountId : ''
      state.legalDocuments = []
      state.selectedLegalDocumentId = ''
      applyLegalDocumentDetail(null)
      if (supportsLegalDocumentAdmin()) {
        await refreshLegalDocumentsData({
          preserveSelection: false,
          renderOnFinish: false
        })
      }
      setNotice('已重置为初始演示数据。', 'success')
    } catch (error) {
      setNotice(error.message || '重置失败。', 'danger')
    } finally {
      state.runtime.loading = false
      render()
    }
  })

  document.getElementById('accountSearchInput').addEventListener('input', (event) => {
    state.accountSearch = event.target.value
    renderAccounts()
  })

  document.getElementById('accountStatusFilter').addEventListener('change', (event) => {
    state.accountStatusFilter = event.target.value
    renderAccounts()
  })

  document.getElementById('adjustmentRecordScopeSelect').addEventListener('change', (event) => {
    state.adjustmentRecordScope = toText(event.target.value) === 'selected' ? 'selected' : 'all'
    refreshManualAdjustmentRecords({
      renderOnFinish: true
    })
    renderAdjustmentRecords()
  })

  document.getElementById('adjustmentRecordSearchInput').addEventListener('input', (event) => {
    state.adjustmentRecordSearch = event.target.value
    refreshManualAdjustmentRecords({
      renderOnFinish: true
    })
    renderAdjustmentRecords()
  })

  document.getElementById('createTrialBtn').addEventListener('click', () => {
    const selectedAccount = getSelectedAccount()
    if (!selectedAccount) {
      setNotice('请先选择一个账户。', 'danger')
      render()
      return
    }
    performAccountAction({
      accountId: selectedAccount.accountId,
      action: 'extend_trial',
      days: 7,
      reason: '运营批量延长试用 7 天'
    }, '已给选中账户延长 7 天试用。')
  })

  document.getElementById('orderSearchInput').addEventListener('input', (event) => {
    state.orderSearch = event.target.value
    renderOrders()
  })

  document.getElementById('orderStatusFilter').addEventListener('change', (event) => {
    state.orderStatusFilter = event.target.value
    renderOrders()
  })

  document.getElementById('orderReadinessFilter').addEventListener('change', (event) => {
    state.orderReadinessFilter = event.target.value
    renderOrders()
  })

  document.getElementById('feedbackSearchInput').addEventListener('input', (event) => {
    state.feedbackSearch = event.target.value
    refreshFeedbackData({
      preserveSelection: true,
      renderOnFinish: true
    })
  })

  document.getElementById('feedbackStatusFilter').addEventListener('change', (event) => {
    state.feedbackStatusFilter = event.target.value
    refreshFeedbackData({
      preserveSelection: true,
      renderOnFinish: true
    })
  })

  document.getElementById('refreshFeedbackBtn').addEventListener('click', () => {
    refreshFeedbackData({
      preserveSelection: true,
      renderOnFinish: true
    })
  })

  document.getElementById('referralSearchInput').addEventListener('input', (event) => {
    state.referralSearch = event.target.value
    refreshReferralData({
      renderOnFinish: true
    })
  })

  document.getElementById('referralStatusFilter').addEventListener('change', (event) => {
    state.referralStatusFilter = event.target.value
    refreshReferralData({
      renderOnFinish: true
    })
  })

  document.getElementById('referralTimeWindowFilter').addEventListener('change', (event) => {
    state.referralTimeWindow = event.target.value
    refreshReferralData({
      renderOnFinish: true
    })
  })

  document.getElementById('refreshReferralsBtn').addEventListener('click', () => {
    refreshReferralData({
      renderOnFinish: true
    })
  })

  document.getElementById('legalDocumentSearchInput').addEventListener('input', (event) => {
    state.legalDocumentSearch = toText(event.target.value)
    refreshLegalDocumentsData({
      preserveSelection: true,
      renderOnFinish: true
    })
  })

  document.getElementById('legalDocumentDocTypeFilter').addEventListener('change', (event) => {
    state.legalDocumentDocTypeFilter = toText(event.target.value) || 'all'
    refreshLegalDocumentsData({
      preserveSelection: false,
      renderOnFinish: true
    })
  })

  document.getElementById('legalDocumentStatusFilter').addEventListener('change', (event) => {
    state.legalDocumentStatusFilter = toText(event.target.value) || 'all'
    refreshLegalDocumentsData({
      preserveSelection: false,
      renderOnFinish: true
    })
  })

  document.getElementById('usageSearchInput').addEventListener('input', (event) => {
    state.usageSearch = event.target.value
    scheduleUsageViewRefresh({
      debounceMs: 260
    })
  })

  document.getElementById('usageTypeFilter').addEventListener('change', (event) => {
    state.usageTypeFilter = event.target.value
    state.usageSourceFilter = 'all'
    scheduleUsageViewRefresh()
  })
  document.getElementById('usageTimeWindowFilter').addEventListener('change', (event) => {
    state.usageTimeWindow = event.target.value
    state.usageSourceFilter = 'all'
    scheduleUsageViewRefresh()
  })
  document.getElementById('usageSourceFilterSelect').addEventListener('change', (event) => {
    state.usageSourceFilter = toText(event.target.value) || 'all'
    scheduleUsageViewRefresh()
  })
  document.getElementById('usageProviderFilterInput').addEventListener('input', (event) => {
    state.usageProviderFilter = toText(event.target.value)
    scheduleUsageViewRefresh({
      debounceMs: 260
    })
  })
  document.getElementById('usageModelFilterInput').addEventListener('input', (event) => {
    state.usageModelFilter = toText(event.target.value)
    scheduleUsageViewRefresh({
      debounceMs: 260
    })
  })
  document.querySelectorAll('[data-global-usage-tab]').forEach((item) => {
    item.addEventListener('click', () => {
      const nextTab = toText(item.getAttribute('data-global-usage-tab'))
      if (!nextTab || nextTab === state.globalUsageTab) {
        return
      }
      state.globalUsageTab = nextTab
      state.globalUsagePage = 1
      state.globalUsageSourceFilter = 'all'
      scheduleGlobalUsageRefresh()
    })
  })
  document.getElementById('globalUsageSearchInput').addEventListener('input', (event) => {
    state.globalUsageSearch = toText(event.target.value)
    state.globalUsagePage = 1
    scheduleGlobalUsageRefresh({
      debounceMs: 260
    })
  })
  document.getElementById('globalUsageTimeWindowFilter').addEventListener('change', (event) => {
    state.globalUsageTimeWindow = toText(event.target.value) || 'all'
    state.globalUsagePage = 1
    state.globalUsageSourceFilter = 'all'
    scheduleGlobalUsageRefresh()
  })
  document.getElementById('globalUsageSourceFilterSelect').addEventListener('change', (event) => {
    state.globalUsageSourceFilter = toText(event.target.value) || 'all'
    state.globalUsagePage = 1
    scheduleGlobalUsageRefresh()
  })
  document.getElementById('globalUsageProviderFilterInput').addEventListener('input', (event) => {
    state.globalUsageProviderFilter = toText(event.target.value)
    state.globalUsagePage = 1
    scheduleGlobalUsageRefresh({
      debounceMs: 260
    })
  })
  document.getElementById('globalUsageModelFilterInput').addEventListener('input', (event) => {
    state.globalUsageModelFilter = toText(event.target.value)
    state.globalUsagePage = 1
    scheduleGlobalUsageRefresh({
      debounceMs: 260
    })
  })

  document.getElementById('auditSearchInput').addEventListener('input', (event) => {
    state.auditSearch = event.target.value
    renderAudit()
  })
}

async function boot() {
  window.addEventListener('error', (event) => {
    const message = event && event.error && event.error.message
      ? event.error.message
      : (event && event.message ? event.message : '脚本运行失败')
    reportFatalUiError(message)
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event && event.reason
    const message = reason && reason.message ? reason.message : String(reason || '异步请求失败')
    reportFatalUiError(message)
  })

  bindGlobalEvents()
  await refreshAuthSession()
  if (state.runtime.authenticated) {
    await refreshData({ preserveSelection: false })
  } else {
    render()
  }
}

boot()
