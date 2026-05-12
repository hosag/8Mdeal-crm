const cloud = require('wx-server-sdk')
const tcb = require('@cloudbase/node-sdk')
const https = require('https')
const http = require('http')
const { URL } = require('url')
const createAiUsageHelper = require('./usageHelper')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const app = tcb.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  timeout: 58000
})
const ai = app.ai()

const MODEL_PROVIDER = 'hunyuan-exp'
const MODEL_NAME = 'hunyuan-turbos-latest'
const AI_MODEL_ROUTING_FLAG_KEY = 'ai_model_routing_v1'
const AI_ROUTE_KEY = 'share_brief'
const DEFAULT_PROVIDER_KEY = 'cloudbase_default'
const DEFAULT_PROVIDER_CONFIG = {
  providerKey: DEFAULT_PROVIDER_KEY,
  providerType: 'cloudbase',
  protocolMode: 'auto',
  providerClass: 'fallback',
  commercialTier: 'default',
  visibleLabel: '腾讯云默认',
  displayName: 'CloudBase 默认',
  cloudbaseProvider: MODEL_PROVIDER,
  baseURL: '',
  defaultModel: MODEL_NAME,
  apiKey: '',
  enabled: true
}
const DEFAULT_AI_POLICY = {
  quotaPolicy: 'local_quota',
  providers: {
    [DEFAULT_PROVIDER_KEY]: DEFAULT_PROVIDER_CONFIG
  },
  route: {
    providerKey: DEFAULT_PROVIDER_KEY,
    provider: MODEL_PROVIDER,
    model: MODEL_NAME,
    fallbackProviderKey: '',
    fallbackModel: '',
    enabled: true
  }
}

function buildModelSourceMeta(options = {}) {
  const provider = safeText(options.provider || MODEL_PROVIDER)
  const model = safeText(options.model || MODEL_NAME)
  const providerLabel = safeText(options.providerLabel || 'CloudBase AI')
  return {
    sourceType: 'model',
    sourceLabel: '云端模型',
    providerLabel,
    modelName: `${provider} / ${model}`,
    canRegenerate: true
  }
}

const defaultShareTags = [
  {
    id: 't1',
    mode: 'info',
    name: '发送资料',
    desc: '对方仅查看资料，项目仍由我维护。',
    fields: ['项目名称', '客户名称', '当前阶段', '预计金额', '联系人姓名', '项目描述']
  },
  {
    id: 't2',
    mode: 'outbound',
    name: '转交项目',
    desc: '对方接手后继续推进，我在外发项目查看进展。',
    fields: ['项目名称', '客户名称', '当前阶段', '预计金额', '项目描述', '联系人姓名', '联系人电话', '联系人微信', '下一步动作', '分享来源']
  }
]

const ACTION_RULES = [
  {
    key: 'executive_visit',
    patterns: [
      /(董事长|总经理|负责人).*(参观|访问|到访|来我司|见面|会面|交流)/,
      /(参观|访问|到访|来我司|见面|会面|交流).*(董事长|总经理|负责人)/
    ]
  },
  {
    key: 'quote',
    patterns: [
      /报价/,
      /价格/
    ]
  },
  {
    key: 'survey',
    patterns: [
      /调研/,
      /上门/
    ]
  },
  {
    key: 'competitor_visit',
    patterns: [
      /(竞争对手|对手).*(参观|访问|拜访)/,
      /(参观|访问|拜访).*(竞争对手|对手)/
    ]
  },
  {
    key: 'business_talk',
    patterns: [
      /商务/,
      /返点/,
      /合作/
    ]
  }
]

function safeText(value, fallback = '') {
  const text = String(value || '').trim()
  return text || fallback
}

function toNumber(value, fallback = 0) {
  const current = Number(value)
  return Number.isFinite(current) ? current : fallback
}

function normalizeUrl(value) {
  return safeText(value, '').replace(/\/+$/, '')
}

function isDeepSeekRuntime(runtimeConfig = {}) {
  const baseURL = normalizeUrl(runtimeConfig.baseURL || '')
  const providerKey = safeText(runtimeConfig.providerKey || '')
  const providerLabel = safeText(runtimeConfig.providerLabel || '')
  const model = safeText(runtimeConfig.model || '')
  return baseURL.includes('deepseek.com')
    || providerKey.includes('deepseek')
    || providerLabel.toLowerCase().includes('deepseek')
    || model.toLowerCase().includes('deepseek')
}

function useResponsesApi(runtimeConfig = {}) {
  if (runtimeConfig.protocolMode === 'responses') {
    return true
  }
  if (runtimeConfig.protocolMode === 'chat_completions') {
    return false
  }
  const baseURL = normalizeUrl(runtimeConfig.baseURL || '').toLowerCase()
  return baseURL.includes('tabcode')
}

function normalizeProtocolMode(value, fallback = 'auto') {
  const current = safeText(value || fallback, fallback)
  return ['auto', 'chat_completions', 'responses'].includes(current) ? current : 'auto'
}

async function safeGetOne(collectionName, query) {
  try {
    const result = await db.collection(collectionName).where(query).limit(1).get()
    return result.data[0] || null
  } catch (error) {
    return null
  }
}

async function resolveAiAccessContext(openid) {
  const identityResult = await db.collection('accountIdentities').where({
    provider: 'wechat_mp',
    openid
  }).limit(1).get()
  const identity = identityResult.data[0] || null
  const accountId = safeText(identity && identity.accountId)

  if (!accountId) {
    throw new Error('ACCOUNT_NOT_INITIALIZED: 当前账号尚未初始化，请重新进入小程序后再试')
  }

  const accountResult = await db.collection('accounts').where({
    accountId
  }).limit(1).get()
  const entitlementsResult = await db.collection('entitlements').where({
    accountId
  }).limit(1).get()

  return {
    account: accountResult.data[0] || null,
    entitlements: entitlementsResult.data[0] || null
  }
}

function normalizeAiPolicy(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const modelRouting = source.modelRouting && typeof source.modelRouting === 'object'
    ? source.modelRouting
    : {}
  const providerSource = source.providers && typeof source.providers === 'object'
    ? source.providers
    : {}
  const providerMap = {
    [DEFAULT_PROVIDER_KEY]: {
      ...DEFAULT_PROVIDER_CONFIG,
      ...(providerSource[DEFAULT_PROVIDER_KEY] || {})
    }
  }
  Object.keys(providerSource).forEach((providerKey) => {
    providerMap[providerKey] = {
      ...DEFAULT_PROVIDER_CONFIG,
      ...(providerSource[providerKey] || {}),
      providerKey,
      providerType: safeText(providerSource[providerKey] && providerSource[providerKey].providerType, '') === 'openai_compatible'
        ? 'openai_compatible'
        : 'cloudbase',
      protocolMode: normalizeProtocolMode(
        providerSource[providerKey] && providerSource[providerKey].protocolMode,
        DEFAULT_PROVIDER_CONFIG.protocolMode
      ),
      providerClass: safeText(providerSource[providerKey] && providerSource[providerKey].providerClass, DEFAULT_PROVIDER_CONFIG.providerClass),
      commercialTier: safeText(providerSource[providerKey] && providerSource[providerKey].commercialTier, DEFAULT_PROVIDER_CONFIG.commercialTier),
      visibleLabel: safeText(providerSource[providerKey] && providerSource[providerKey].visibleLabel, DEFAULT_PROVIDER_CONFIG.visibleLabel),
      modelPricing: buildModelPricingObject(providerSource[providerKey]),
      baseURL: normalizeUrl(providerSource[providerKey] && providerSource[providerKey].baseURL),
      apiKey: safeText(providerSource[providerKey] && providerSource[providerKey].apiKey, ''),
      enabled: providerSource[providerKey] && providerSource[providerKey].enabled !== false
    }
  })
  const route = modelRouting[AI_ROUTE_KEY] && typeof modelRouting[AI_ROUTE_KEY] === 'object'
    ? modelRouting[AI_ROUTE_KEY]
    : {}
  return {
    quotaPolicy: safeText(source.quotaPolicy) === 'provider_plan' ? 'provider_plan' : 'local_quota',
    providers: providerMap,
    route: {
      providerKey: safeText(route.providerKey || DEFAULT_AI_POLICY.route.providerKey || DEFAULT_PROVIDER_KEY, DEFAULT_PROVIDER_KEY),
      provider: safeText(route.provider || DEFAULT_AI_POLICY.route.provider, MODEL_PROVIDER),
      model: safeText(route.model || DEFAULT_AI_POLICY.route.model, MODEL_NAME),
      fallbackProviderKey: safeText(route.fallbackProviderKey || DEFAULT_AI_POLICY.route.fallbackProviderKey || '', ''),
      fallbackModel: safeText(route.fallbackModel || DEFAULT_AI_POLICY.route.fallbackModel || '', ''),
      enabled: route.enabled !== false
    }
  }
}

function normalizeModelPricingEntries(value) {
  const result = []
  const seen = new Set()
  const appendEntry = (modelName, rawValue) => {
    const model = safeText(modelName)
    if (!model || seen.has(model)) {
      return
    }
    const node = rawValue && typeof rawValue === 'object' ? rawValue : {}
    const multiplier = toNumber(
      rawValue && typeof rawValue === 'number'
        ? rawValue
        : node.multiplier,
      NaN
    )
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      return
    }
    seen.add(model)
    result.push({
      model,
      multiplier
    })
  }

  if (Array.isArray(value)) {
    value.forEach((item) => {
      const source = item && typeof item === 'object' ? item : {}
      appendEntry(source.model || source.modelName || source.key, source)
    })
    return result
  }

  const source = value && typeof value === 'object' ? value : {}
  Object.keys(source).forEach((modelName) => {
    appendEntry(modelName, source[modelName])
  })
  return result
}

function buildModelPricingObject(providerConfig = {}) {
  const source = providerConfig && typeof providerConfig === 'object'
    ? (Array.isArray(providerConfig.modelPricingItems) ? providerConfig.modelPricingItems : providerConfig.modelPricing)
    : {}
  const result = {}
  normalizeModelPricingEntries(source).forEach((item) => {
    result[item.model] = {
      multiplier: item.multiplier
    }
  })
  return result
}

async function loadAiPolicy() {
  const flag = await safeGetOne('featureFlags', {
    flagKey: AI_MODEL_ROUTING_FLAG_KEY
  })
  if (!flag) {
    return DEFAULT_AI_POLICY
  }
  return normalizeAiPolicy(flag.payload)
}

function getModelMultiplier(aiPolicy, runtimeConfig = {}) {
  const providerKey = safeText(runtimeConfig.providerKey || DEFAULT_PROVIDER_KEY)
  const model = safeText(runtimeConfig.model || MODEL_NAME)
  const providers = aiPolicy && aiPolicy.providers ? aiPolicy.providers : DEFAULT_AI_POLICY.providers
  const providerConfig = providers[providerKey] || {}
  const modelPricing = providerConfig && providerConfig.modelPricing && typeof providerConfig.modelPricing === 'object'
    ? providerConfig.modelPricing
    : {}
  const pricingItem = modelPricing[model] && typeof modelPricing[model] === 'object'
    ? modelPricing[model]
    : null
  const multiplier = toNumber(pricingItem && pricingItem.multiplier, 1)
  return multiplier > 0 ? multiplier : 1
}

function extractRawUsageTotals(usage = {}) {
  const source = usage && typeof usage === 'object' ? usage : {}
  const inputTokens = Math.max(0, toNumber(source.input_tokens, NaN))
  const outputTokens = Math.max(0, toNumber(source.output_tokens, NaN))
  const promptTokens = Math.max(0, toNumber(source.prompt_tokens, NaN))
  const completionTokens = Math.max(0, toNumber(source.completion_tokens, NaN))
  const totalTokens = Math.max(0, toNumber(
    source.total_tokens,
    Number.isFinite(inputTokens + outputTokens)
      ? inputTokens + outputTokens
      : (Number.isFinite(promptTokens + completionTokens) ? promptTokens + completionTokens : 0)
  ))
  return {
    rawTotalTokens: totalTokens,
    rawPromptTokens: Number.isFinite(promptTokens) ? promptTokens : Math.max(0, inputTokens),
    rawCompletionTokens: Number.isFinite(completionTokens) ? completionTokens : Math.max(0, outputTokens)
  }
}

function estimateTokensByChars(inputText = '', outputText = '') {
  const inputChars = String(inputText || '').length
  const outputChars = String(outputText || '').length
  return Math.max(0, Math.ceil(inputChars * 1.2 + outputChars * 1.4))
}

const {
  buildAiUsageTraceId,
  buildUsageEventKey,
  consumeAiUsage,
  appendUsageEvent
} = createAiUsageHelper({
  db,
  safeText,
  toNumber,
  extractRawUsageTotals,
  estimateTokensByChars
})

function resolveRouteRuntimeConfig(aiPolicy) {
  const route = aiPolicy && aiPolicy.route ? aiPolicy.route : DEFAULT_AI_POLICY.route
  const providers = aiPolicy && aiPolicy.providers ? aiPolicy.providers : DEFAULT_AI_POLICY.providers
  const providerKey = safeText(route.providerKey || DEFAULT_PROVIDER_KEY, DEFAULT_PROVIDER_KEY)
  const providerConfig = providers[providerKey] || providers[DEFAULT_PROVIDER_KEY] || DEFAULT_PROVIDER_CONFIG

  if (providerConfig.enabled === false) {
    throw new Error(`MODEL_PROVIDER_DISABLED: 当前供应商(${providerKey})已停用`)
  }

  const model = safeText(route.model || providerConfig.defaultModel || MODEL_NAME, MODEL_NAME)
  const protocolMode = normalizeProtocolMode(providerConfig.protocolMode, 'auto')
  const fallbackProviderKey = safeText(route.fallbackProviderKey, '')
  const fallbackProviderConfig = fallbackProviderKey ? (providers[fallbackProviderKey] || null) : null
  const fallbackModel = safeText(route.fallbackModel || (fallbackProviderConfig && fallbackProviderConfig.defaultModel) || '', '')

  if (safeText(providerConfig.providerType, '') === 'openai_compatible') {
    const baseURL = normalizeUrl(providerConfig.baseURL)
    const apiKey = safeText(providerConfig.apiKey, '')
    if (!baseURL || !apiKey) {
      throw new Error(`MODEL_PROVIDER_CONFIG_INVALID: 供应商(${providerKey})缺少 baseURL 或 apiKey`)
    }
    return {
      engine: 'openai_compatible',
      providerKey,
      providerLabel: safeText(providerConfig.displayName || providerKey, providerKey),
      provider: 'openai_compatible',
      model,
      protocolMode,
      fallbackProviderKey,
      fallbackModel,
      baseURL,
      apiKey
    }
  }

  return {
    engine: 'cloudbase',
    providerKey,
    providerLabel: safeText(providerConfig.displayName || 'CloudBase AI', 'CloudBase AI'),
    provider: safeText(route.provider || providerConfig.cloudbaseProvider || MODEL_PROVIDER, MODEL_PROVIDER),
    model,
    protocolMode,
    fallbackProviderKey,
    fallbackModel
  }
}

function buildFallbackRuntimeConfig(aiPolicy, routeRuntime) {
  const fallbackProviderKey = safeText(routeRuntime && routeRuntime.fallbackProviderKey, '')
  if (!fallbackProviderKey) {
    return null
  }
  const providers = aiPolicy && aiPolicy.providers ? aiPolicy.providers : DEFAULT_AI_POLICY.providers
  const providerConfig = providers[fallbackProviderKey]
  if (!providerConfig || providerConfig.enabled === false) {
    return null
  }

  const model = safeText(routeRuntime.fallbackModel || providerConfig.defaultModel || MODEL_NAME, MODEL_NAME)
  const protocolMode = normalizeProtocolMode(providerConfig.protocolMode, 'auto')
  if (safeText(providerConfig.providerType, '') === 'openai_compatible') {
    const baseURL = normalizeUrl(providerConfig.baseURL)
    const apiKey = safeText(providerConfig.apiKey, '')
    if (!baseURL || !apiKey) {
      return null
    }
    return {
      engine: 'openai_compatible',
      providerKey: fallbackProviderKey,
      providerLabel: safeText(providerConfig.displayName || fallbackProviderKey, fallbackProviderKey),
      provider: 'openai_compatible',
      model,
      protocolMode,
      fallbackProviderKey: '',
      fallbackModel: '',
      baseURL,
      apiKey
    }
  }

  return {
    engine: 'cloudbase',
    providerKey: fallbackProviderKey,
    providerLabel: safeText(providerConfig.displayName || 'CloudBase AI', 'CloudBase AI'),
    provider: safeText(providerConfig.cloudbaseProvider || MODEL_PROVIDER, MODEL_PROVIDER),
    model,
    protocolMode,
    fallbackProviderKey: '',
    fallbackModel: ''
  }
}

function shouldTryFallback(error) {
  const message = safeText(error && error.message, '')
  if (!message) {
    return false
  }
  return [
    'MODEL_PROVIDER_HTTP_',
    'MODEL_PROVIDER_TIMEOUT',
    'MODEL_PROVIDER_EMPTY_RESPONSE',
    'MODEL_PROVIDER_RESPONSE_INVALID',
    'MODEL_PROVIDER_CONFIG_INVALID',
    'MODEL_PROVIDER_DISABLED'
  ].some((item) => message.includes(item))
}

function requestJson(options = {}, payload = null, timeoutMs = 55000) {
  return new Promise((resolve, reject) => {
    const protocol = options.protocol === 'http:' ? http : https
    const req = protocol.request(options, (res) => {
      let raw = ''
      res.on('data', (chunk) => {
        raw += chunk
      })
      res.on('end', () => {
        let parsed = {}
        try {
          parsed = raw ? JSON.parse(raw) : {}
        } catch (error) {
          reject(new Error(`MODEL_PROVIDER_RESPONSE_INVALID: ${raw.slice(0, 160)}`))
          return
        }
        const statusCode = Number(res.statusCode || 0)
        if (statusCode < 200 || statusCode >= 300) {
          const errorMessage = safeText(parsed.error && parsed.error.message || parsed.message || raw || 'openai compatible request failed', 'openai compatible request failed')
          reject(new Error(`MODEL_PROVIDER_HTTP_${statusCode}: ${errorMessage}`))
          return
        }
        resolve(parsed)
      })
    })

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('MODEL_PROVIDER_TIMEOUT'))
    })
    req.on('error', reject)
    if (payload) {
      req.write(payload)
    }
    req.end()
  })
}

async function runOpenAiCompatibleGenerateText(runtimeConfig, payload = {}) {
  if (useResponsesApi(runtimeConfig)) {
    return runResponsesCompatibleGenerateText(runtimeConfig, payload)
  }
  const url = new URL(`${runtimeConfig.baseURL}/chat/completions`)
  const requestPayload = {
    model: runtimeConfig.model,
    messages: Array.isArray(payload.messages) ? payload.messages : [],
    temperature: Number.isFinite(Number(payload.temperature)) ? Number(payload.temperature) : 0.2
  }
  if (isDeepSeekRuntime(runtimeConfig)) {
    requestPayload.thinking = { type: 'disabled' }
  }
  const requestBody = JSON.stringify(requestPayload)
  const response = await requestJson({
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || (url.protocol === 'http:' ? 80 : 443),
    path: `${url.pathname}${url.search || ''}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestBody),
      Authorization: `Bearer ${runtimeConfig.apiKey}`
    }
  }, requestBody)

  const firstChoice = Array.isArray(response.choices) ? response.choices[0] : null
  const message = firstChoice && firstChoice.message ? firstChoice.message : {}
  let text = safeText(message.content, '')
  if (!text && Array.isArray(message.content)) {
    text = message.content
      .map((item) => safeText(item && (item.text || item.content), ''))
      .filter(Boolean)
      .join('\n')
  }
  if (!text) {
    text = safeText(message.reasoning_content || response.reasoning_content, '')
  }
  if (!text) {
    throw new Error('MODEL_PROVIDER_EMPTY_RESPONSE')
  }
  return {
    text,
    usage: response.usage || null
  }
}

function buildResponsesInputFromMessages(messages = []) {
  return messages.map((message) => ({
    type: 'message',
    role: safeText(message && message.role, 'user'),
    content: [
      {
        type: 'input_text',
        text: safeText(message && message.content, '')
      }
    ]
  }))
}

function extractResponsesOutputText(response = {}) {
  const directText = safeText(response.output_text, '')
  if (directText) {
    return directText
  }
  const outputItems = Array.isArray(response.output) ? response.output : []
  const textParts = []
  outputItems.forEach((item) => {
    const contentItems = Array.isArray(item && item.content) ? item.content : []
    contentItems.forEach((content) => {
      const text = safeText(content && (content.text || content.output_text), '')
      if (text) {
        textParts.push(text)
      }
    })
  })
  return textParts.join('\n').trim()
}

async function runResponsesCompatibleGenerateText(runtimeConfig, payload = {}) {
  const url = new URL(`${runtimeConfig.baseURL}/responses`)
  const requestBody = JSON.stringify({
    model: runtimeConfig.model,
    instructions: '',
    input: buildResponsesInputFromMessages(Array.isArray(payload.messages) ? payload.messages : []),
    temperature: Number.isFinite(Number(payload.temperature)) ? Number(payload.temperature) : 0.2,
    max_output_tokens: 2048
  })
  const response = await requestJson({
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || (url.protocol === 'http:' ? 80 : 443),
    path: `${url.pathname}${url.search || ''}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestBody),
      Authorization: `Bearer ${runtimeConfig.apiKey}`
    }
  }, requestBody)
  const text = extractResponsesOutputText(response)
  if (!text) {
    throw new Error('MODEL_PROVIDER_EMPTY_RESPONSE')
  }
  return {
    text,
    usage: response.usage || null
  }
}

async function runRoutedModelGenerateText(runtimeConfig, payload = {}) {
  if (runtimeConfig.engine === 'openai_compatible') {
    return runOpenAiCompatibleGenerateText(runtimeConfig, payload)
  }
  const model = ai.createModel(runtimeConfig.provider)
  const result = await model.generateText({
    model: runtimeConfig.model,
    temperature: payload.temperature,
    messages: payload.messages
  })
  return {
    text: safeText(result && result.text, ''),
    usage: result && result.usage ? result.usage : null
  }
}

async function runWithFallback(aiPolicy, routeRuntime, payload = {}) {
  try {
    const result = await runRoutedModelGenerateText(routeRuntime, payload)
    return {
      result,
      runtime: routeRuntime,
      fallbackUsed: false
    }
  } catch (primaryError) {
    const fallbackRuntime = buildFallbackRuntimeConfig(aiPolicy, routeRuntime)
    if (!fallbackRuntime || !shouldTryFallback(primaryError)) {
      throw primaryError
    }
    const result = await runRoutedModelGenerateText(fallbackRuntime, payload)
    return {
      result,
      runtime: fallbackRuntime,
      fallbackUsed: true,
      primaryError: safeText(primaryError && primaryError.message, '')
    }
  }
}

function ensureAiAccess(context, aiPolicy) {
  const account = context && context.account ? context.account : {}
  const entitlements = context && context.entitlements ? context.entitlements : {}
  const status = safeText(entitlements.status || account.status || 'trialing')

  if (status === 'disabled') {
    throw new Error('ACCOUNT_DISABLED: 当前账号已被禁用')
  }

  if (!entitlements || !Object.keys(entitlements).length) {
    if (status === 'free_limited' || status === 'expired_readonly') {
      throw new Error('ENTITLEMENT_WRITE_DISABLED: 当前账号为只读状态')
    }
    return
  }

  if (!entitlements.canUseAi) {
    if (aiPolicy && aiPolicy.quotaPolicy === 'provider_plan') {
      return
    }
    if (Number(entitlements.aiTokensRemaining) <= 0) {
      throw new Error('ENTITLEMENT_AI_EXHAUSTED: 当前 AI 额度已用完')
    }
    throw new Error('ENTITLEMENT_WRITE_DISABLED: 当前账号为只读状态')
  }
}

function normalizeCompactText(value, maxLength = 220) {
  const text = safeText(value, '')
    .replace(/\s+/g, ' ')
    .replace(/[；;]+/g, '，')
    .replace(/^(综合来看|整体来看|当前来看|从目前情况看|结合当前情况看|基于当前信息看)[，,:：]*/g, '')
    .replace(/当前核心关注点是/g, '当前需关注')
    .replace(/目前核心关注点是/g, '当前需关注')
    .replace(/需要重点关注的是/g, '当前需关注')
    .replace(/已提供交付能力/g, '已说明交付能力保障')
    .replace(/提供了交付能力/g, '说明了交付能力保障')
    .replace(/提供交付能力/g, '说明交付能力保障')
    .replace(/还约了吃饭/g, '已约饭局')
    .replace(/还约了饭局/g, '已约饭局')
    .replace(/未提供相关联系人信息|未提供联系人信息/g, '')
    .replace(/[，。]{2,}/g, '，')
    .replace(/^[，。]+|[，。]+$/g, '')

  if (!text) {
    return ''
  }

  const segments = text
    .split(/[。]/)
    .map((item) => safeText(item))
    .filter(Boolean)
    .filter((item) => !/分享摘要|资料同步|转发说明/.test(item))

  const result = []
  const seen = new Set()
  segments.forEach((item) => {
    const current = item.replace(/\s+/g, '')
    if (!current || seen.has(current)) {
      return
    }
    seen.add(current)
    result.push(item)
  })

  const compact = result.join('，')
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => safeText(item)).filter(Boolean)
}

function extractJson(text) {
  if (!text) {
    throw new Error('AI_EMPTY_RESPONSE')
  }

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('AI_INVALID_RESPONSE')
  }

  return JSON.parse(text.slice(start, end + 1))
}

function clone(data) {
  return JSON.parse(JSON.stringify(data))
}

function normalizeTag(item, index) {
  return {
    id: safeText(item && item.id, `tag-${index + 1}`),
    name: safeText(item && item.name, `标签${index + 1}`),
    desc: safeText(item && item.desc),
    fields: Array.isArray(item && item.fields)
      ? item.fields.map((field) => safeText(field)).filter(Boolean)
      : []
  }
}

function formatDateOnly(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function hasAnyField(fields, targets) {
  if (!Array.isArray(fields) || !fields.length) {
    return false
  }

  if (fields.indexOf('全部字段') > -1) {
    return true
  }

  return targets.some((item) => fields.indexOf(item) > -1)
}

function buildActionKeys(text) {
  const source = safeText(text)
  if (!source) {
    return []
  }

  return ACTION_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(source)))
    .map((rule) => rule.key)
}

function detectTimelineStatus(text) {
  const source = safeText(text)
  if (!source) {
    return 'info'
  }

  const donePatterns = [
    /已完成/,
    /完成了/,
    /已经/,
    /已报价/,
    /到访/,
    /访问.*反馈/,
    /反馈/,
    /表示满意/,
    /要求后续/,
    /明确/,
    /达成/,
    /确认了/
  ]
  const plannedPatterns = [
    /计划/,
    /安排/,
    /待定/,
    /下周/,
    /确认时间/,
    /约/,
    /将/,
    /准备/,
    /拟/,
    /打算/
  ]

  const isDone = donePatterns.some((pattern) => pattern.test(source))
  const isPlanned = plannedPatterns.some((pattern) => pattern.test(source))

  if (isDone) {
    return 'done'
  }

  if (isPlanned) {
    return 'planned'
  }

  return 'info'
}

function sanitizeBusinessNarrativeText(value) {
  let text = safeText(value)
  if (!text) {
    return ''
  }

  const segments = text
    .split(/[。；;，,\n]/)
    .map((item) => safeText(item))
    .filter(Boolean)
    .filter((item) => {
      if (!/吃饭|饭局|聚餐/.test(item)) {
        return true
      }

      return /(与|和).*(吃饭|饭局|聚餐)|(吃饭|饭局|聚餐).*(与|和)/.test(item)
    })
    .map((item) => item.replace(/已提供交付能力/g, '已说明交付能力保障'))
    .map((item) => item.replace(/提供了交付能力/g, '说明了交付能力保障'))
    .map((item) => item.replace(/提供交付能力/g, '说明交付能力保障'))

  return segments.join('，')
}

function buildTimelinePromptEvents(followUps, tasks) {
  const taskSourceIds = new Set(
    (Array.isArray(followUps) ? followUps : []).map((item) => safeText(item && item.sourceTaskId)).filter(Boolean)
  )

  const events = []

  ;(Array.isArray(followUps) ? followUps : []).forEach((followUp) => {
    const rawText = [
      sanitizeBusinessNarrativeText(followUp.aiSummary || followUp.content),
      sanitizeBusinessNarrativeText(followUp.content),
      safeText(followUp.stageChange),
      safeText(followUp.nextFollowUpTime)
    ].filter(Boolean).join(' ')
    const actionKeys = buildActionKeys(rawText)
    events.push({
      eventAt: followUp.followUpTime instanceof Date ? followUp.followUpTime : new Date(followUp.followUpTime),
      time: formatDateTime(followUp.followUpTime),
      type: safeText(followUp.method, '其他'),
      summary: sanitizeBusinessNarrativeText(followUp.aiSummary || followUp.content),
      content: sanitizeBusinessNarrativeText(followUp.content),
      stageChange: safeText(followUp.stageChange),
      nextFollowUpTime: safeText(followUp.nextFollowUpTime),
      actionKeys,
      status: detectTimelineStatus(rawText)
    })
  })

  ;(Array.isArray(tasks) ? tasks : [])
    .filter((task) => safeText(task && task.status) === 'done' && !taskSourceIds.has(safeText(task && task._id)))
    .forEach((task) => {
      const rawText = `${safeText(task.title)} ${sanitizeBusinessNarrativeText(task.resultSummary)}`
      events.push({
        eventAt: task.completedAt instanceof Date ? task.completedAt : new Date(task.completedAt || task.updatedAt || task.createdAt),
        time: formatDateTime(task.completedAt || task.updatedAt || task.createdAt),
        type: '动作完成',
        summary: sanitizeBusinessNarrativeText(task.resultSummary) || `已完成推进动作「${safeText(task.title, '未命名动作')}」`,
        content: safeText(task.title),
        stageChange: '',
        nextFollowUpTime: '',
        actionKeys: buildActionKeys(rawText),
        status: 'done'
      })
    })

  const sorted = events
    .filter((item) => item.eventAt instanceof Date && !Number.isNaN(item.eventAt.getTime()))
    .sort((left, right) => left.eventAt.getTime() - right.eventAt.getTime())

  const resolvedActionMap = {}
  sorted.forEach((item, index) => {
    if (item.status !== 'done') {
      return
    }

    item.actionKeys.forEach((key) => {
      resolvedActionMap[key] = index
    })
  })

  const filtered = sorted.filter((item, index) => {
    if (item.status !== 'planned' || !item.actionKeys.length) {
      return true
    }

    return !item.actionKeys.some((key) => Number.isInteger(resolvedActionMap[key]) && resolvedActionMap[key] > index)
  })

  return filtered.slice(-10).map((item) => ({
    time: item.time,
    type: item.type,
    status: item.status,
    summary: item.summary,
    stageChange: item.stageChange,
    nextFollowUpTime: item.nextFollowUpTime,
    content: item.content
  }))
}

function buildCurrentFocuses(timelineEvents, openTasks) {
  const values = []
  const seen = new Set()

  ;(Array.isArray(openTasks) ? openTasks : []).forEach((item) => {
    const text = [safeText(item.title), safeText(item.dueDateText) ? `截止 ${safeText(item.dueDateText)}` : ''].filter(Boolean).join('，')
    if (text && !seen.has(text)) {
      seen.add(text)
      values.push(text)
    }
  })

  ;(Array.isArray(timelineEvents) ? timelineEvents : []).forEach((item) => {
    const source = [safeText(item.summary), safeText(item.content)].filter(Boolean).join(' ')
    if (!source) {
      return
    }

    const isConcern = item.status === 'planned'
      || /竞争对手|风险|待定|未透露|待确认|未确认|卡点/.test(source)

    if (!isConcern) {
      return
    }

    const text = safeText(item.summary || item.content)
    if (text && !seen.has(text)) {
      seen.add(text)
      values.push(text)
    }
  })

  return values.slice(0, 5)
}

function isTaskOpen(status) {
  const current = safeText(status)
  return current === 'pending' || current === 'in_progress'
}

function buildFollowUpTimelineEvent(followUp) {
  const method = safeText(followUp.method, '其他')
  const summary = safeText(followUp.aiSummary || followUp.content)
  const stageChange = safeText(followUp.stageChange)
  const nextFollowUpTime = safeText(followUp.nextFollowUpTime)
  const autoGeneratedByTask = !!followUp.autoGeneratedByTask || method === '任务完成' || method === '动作完成'
  const eventAt = followUp.followUpTime instanceof Date ? followUp.followUpTime : new Date(followUp.followUpTime)

  return {
    eventAt,
    sourceTaskId: safeText(followUp.sourceTaskId),
    type: autoGeneratedByTask ? 'task_done' : (stageChange ? 'stage_change' : 'follow_up'),
    title: autoGeneratedByTask ? '动作已完成' : `${method}跟进`,
    method,
    summary,
    stageChange,
    nextFollowUpTime,
    highlights: Array.isArray(followUp.aiHighlights) ? followUp.aiHighlights.map((item) => safeText(item)).filter(Boolean) : [],
    content: safeText(followUp.content)
  }
}

function buildCompletedTaskEvent(task) {
  const completedAt = task.completedAt instanceof Date ? task.completedAt : new Date(task.completedAt || task.updatedAt || task.createdAt)
  return {
    eventAt: completedAt,
    sourceTaskId: safeText(task._id),
    type: 'task_done',
    title: safeText(task.title, '未命名动作'),
    method: '动作完成',
    summary: safeText(task.resultSummary) || `已完成推进动作「${safeText(task.title, '未命名动作')}」`,
    stageChange: '',
    nextFollowUpTime: '',
    highlights: [],
    content: ''
  }
}

function resolveProjectNextFollowUp(project, openTasks, followUps) {
  const activeTasks = (Array.isArray(openTasks) ? openTasks : [])
    .filter((item) => item && item.dueAt instanceof Date && !Number.isNaN(item.dueAt.getTime()))
    .sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime())

  if (activeTasks.length) {
    return safeText(activeTasks[0].dueDateText)
  }

  const latestFollowWithNext = (Array.isArray(followUps) ? followUps : []).find((item) => safeText(item && item.nextFollowUpTime))
  if (latestFollowWithNext) {
    return safeText(latestFollowWithNext.nextFollowUpTime)
  }

  return safeText(project && project.nextFollowUpDate)
}

function buildModeRules(mode) {
  if (mode === 'outbound') {
    return {
      modeLabel: '项目外发',
      ruleText: [
        '这是项目交接场景，摘要主体仍然必须是项目本身，不是交接动作说明。',
        '重点输出项目现状、完整推进脉络、阶段变化和当前最需要关注的未闭环问题。',
        '可以提到这是接手场景，但不要写成操作说明、提醒文案或动作建议。'
      ].join('\n')
    }
  }

  return {
    modeLabel: '分享信息',
    ruleText: [
      '这是资料同步场景，摘要主体必须是项目本身，而不是分享动作说明。',
      '重点输出项目背景、当前进展、最近时间线和当前最需要关注的未闭环问题。',
      '禁止出现接手、转移管理权、继续维护项目等表述。'
    ].join('\n')
  }
}

function formatContactsForPrompt(contacts) {
  const list = Array.isArray(contacts) ? contacts : []
  if (!list.length) {
    return '未提供'
  }

  return list
    .map((item, index) => `${index + 1}. ${safeText(item.name)}${safeText(item.role) ? `（${safeText(item.role)}）` : ''}`)
    .join('\n')
}

function formatOpenTasksForPrompt(tasks) {
  const list = Array.isArray(tasks) ? tasks : []
  if (!list.length) {
    return '无'
  }

  return list
    .map((item, index) => {
      const parts = [
        `${index + 1}. ${safeText(item.title)}`,
        safeText(item.dueDateText) ? `截止 ${safeText(item.dueDateText)}` : '',
        safeText(item.description) ? `说明：${safeText(item.description)}` : ''
      ].filter(Boolean)
      return parts.join('，')
    })
    .join('\n')
}

function formatCompletedTasksForPrompt(tasks) {
  const list = Array.isArray(tasks) ? tasks : []
  if (!list.length) {
    return '无'
  }

  return list
    .map((item, index) => {
      const parts = [
        `${index + 1}. ${safeText(item.title)}`,
        safeText(item.completedAtText) ? `完成于 ${safeText(item.completedAtText)}` : '',
        safeText(item.resultSummary) ? `结果：${safeText(item.resultSummary)}` : ''
      ].filter(Boolean)
      return parts.join('，')
    })
    .join('\n')
}

function formatTimelineForPrompt(timeline) {
  const list = Array.isArray(timeline) ? timeline : []
  if (!list.length) {
    return '无'
  }

  return list
    .map((item, index) => {
      const parts = [
        `${index + 1}. ${safeText(item.time)}`,
        safeText(item.type),
        safeText(item.status) ? `状态 ${safeText(item.status)}` : '',
        safeText(item.summary),
        safeText(item.stageChange) ? `阶段变更：${safeText(item.stageChange)}` : '',
        safeText(item.nextFollowUpTime) ? `当时计划：${safeText(item.nextFollowUpTime)}` : ''
      ].filter(Boolean)
      return parts.join('，')
    })
    .join('\n')
}

function formatCurrentFocusesForPrompt(values) {
  const list = Array.isArray(values) ? values : []
  if (!list.length) {
    return '无'
  }

  return list.map((item, index) => `${index + 1}. ${safeText(item)}`).join('\n')
}

function buildFieldVisibilityHints(visibleFields, contacts) {
  const fields = Array.isArray(visibleFields) ? visibleFields : []
  const contactList = Array.isArray(contacts) ? contacts : []
  const hasContactField = hasAnyField(fields, ['联系人姓名'])
  const hints = []

  if (!hasContactField && contactList.length) {
    hints.push('项目内部已有联系人信息，但本次分享未开放联系人字段；摘要中不得写成“项目缺少联系人”或“未提供相关联系人信息”。')
  }

  return hints.length ? hints.join('\n') : '无'
}

function validateShareBriefPayload(value, mode) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI_INVALID_RESPONSE')
  }

  const requiredFields = ['title', 'cta', 'tone']
  const hasAllFields = requiredFields.every((field) => Object.prototype.hasOwnProperty.call(value, field))
  const summaryText = safeText(value.summaryText)
  const hasLegacyOverview = Array.isArray(value.overviewLines) || Array.isArray(value.briefLines)
  const hasLegacyTimeline = Object.prototype.hasOwnProperty.call(value, 'timelineInsight') || Object.prototype.hasOwnProperty.call(value, 'shareGoal')
  if (!hasAllFields || (!summaryText && (!hasLegacyOverview || !hasLegacyTimeline))) {
    throw new Error('AI_INVALID_RESPONSE')
  }

  const overviewLines = Array.isArray(value.overviewLines) ? value.overviewLines : value.briefLines
  const timelineInsight = safeText(value.timelineInsight || value.shareGoal)
  const normalizedSummaryText = summaryText || normalizeStringArray(overviewLines).concat(timelineInsight ? [timelineInsight] : []).join(' ')

  return {
    title: normalizeCompactText(value.title, 20) || '项目现状',
    summaryText: normalizeCompactText(normalizedSummaryText, 220) || '当前项目已有基础资料，建议结合最新时间线进一步确认现状。',
    overviewLines: normalizeStringArray(overviewLines).slice(0, 4),
    timelineInsight: normalizeCompactText(timelineInsight, 80),
    cta: safeText(value.cta),
    tone: normalizeTone(value.tone, mode)
  }
}

async function getShareContext(projectId, openid, shareTagId) {
  const [projectResult, userResult, followUpResult, taskResult] = await Promise.all([
    db.collection('projects').where({
      _id: projectId,
      _openid: openid
    }).limit(1).get(),
    db.collection('users').where({
      _openid: openid
    }).limit(1).get(),
    db.collection('followUps').where({
      _openid: openid,
      projectId
    }).orderBy('followUpTime', 'desc').limit(10).get(),
    db.collection('tasks').where({
      _openid: openid,
      projectId
    }).get()
  ])

  if (!projectResult.data.length) {
    return null
  }

  const project = projectResult.data[0]
  const user = userResult.data[0] || {}
  const shareTags = Array.isArray(user.shareTags) && user.shareTags.length
    ? user.shareTags.map(normalizeTag)
    : clone(defaultShareTags).map(normalizeTag)
  const shareTag = shareTags.find((item) => item.id === shareTagId) || shareTags[0]
  const visibleFields = Array.isArray(shareTag && shareTag.fields) ? shareTag.fields : []
  const contacts = Array.isArray(project.contacts) ? project.contacts : []
  const latestFollow = followUpResult.data[0] || null
  const canUseTimeline = hasAnyField(visibleFields, ['跟进摘要'])
  const canUseNextAction = hasAnyField(visibleFields, ['下一步动作'])
  const followUps = Array.isArray(followUpResult.data) ? followUpResult.data : []
  const allTasks = Array.isArray(taskResult.data) ? taskResult.data : []
  const openTasks = allTasks
    .filter((item) => isTaskOpen(item && item.status))
    .map((item) => ({
      title: safeText(item.title),
      dueDateText: safeText(item.dueDateText),
      dueAt: item.dueAt instanceof Date ? item.dueAt : new Date(item.dueAt),
      status: safeText(item.status),
      description: safeText(item.description)
    }))
    .filter((item) => item.title)
    .sort((left, right) => {
      const leftTime = left.dueAt instanceof Date && !Number.isNaN(left.dueAt.getTime()) ? left.dueAt.getTime() : Number.MAX_SAFE_INTEGER
      const rightTime = right.dueAt instanceof Date && !Number.isNaN(right.dueAt.getTime()) ? right.dueAt.getTime() : Number.MAX_SAFE_INTEGER
      return leftTime - rightTime
    })
    .slice(0, 5)
  const completedTasks = allTasks
    .filter((item) => safeText(item && item.status) === 'done')
    .map((item) => ({
      title: safeText(item.title),
      completedAt: item.completedAt instanceof Date ? item.completedAt : new Date(item.completedAt || item.updatedAt || item.createdAt),
      completedAtText: formatDateTime(item.completedAt || item.updatedAt || item.createdAt),
      resultSummary: safeText(item.resultSummary)
    }))
    .sort((left, right) => {
      const leftTime = left.completedAt instanceof Date && !Number.isNaN(left.completedAt.getTime()) ? left.completedAt.getTime() : 0
      const rightTime = right.completedAt instanceof Date && !Number.isNaN(right.completedAt.getTime()) ? right.completedAt.getTime() : 0
      return rightTime - leftTime
    })
    .slice(0, 5)
    .map((item) => ({
      title: item.title,
      completedAtText: item.completedAtText,
      resultSummary: item.resultSummary
    }))
  const recentTimeline = canUseTimeline ? buildTimelinePromptEvents(followUps, allTasks) : []
  const resolvedNextFollowUp = canUseNextAction
    ? resolveProjectNextFollowUp(project, openTasks, followUps)
    : ''
  const currentFocuses = buildCurrentFocuses(recentTimeline, openTasks)
  const fieldVisibilityHints = buildFieldVisibilityHints(visibleFields, contacts)

  return {
    shareTag,
    visibleFields,
    sanitizedPayload: {
      projectName: hasAnyField(visibleFields, ['项目名称']) ? safeText(project.projectName) : '',
      clientName: hasAnyField(visibleFields, ['客户名称']) ? safeText(project.clientName) : '',
      stage: hasAnyField(visibleFields, ['当前阶段']) ? safeText(project.stage) : '',
      estimatedAmount: hasAnyField(visibleFields, ['预计金额']) ? String(project.estimatedAmount || 0) : '',
      description: hasAnyField(visibleFields, ['项目描述']) ? safeText(project.description) : '',
      nextFollowUp: resolvedNextFollowUp,
      latestSummary: hasAnyField(visibleFields, ['跟进摘要'])
        ? safeText(latestFollow && (latestFollow.aiSummary || latestFollow.content))
        : '',
      recentTimeline,
      openTasks,
      completedTasks,
      currentFocuses,
      fieldVisibilityHints,
      contacts: hasAnyField(visibleFields, ['联系人姓名'])
        ? contacts.map((item) => ({
            name: safeText(item.name),
            role: safeText(item.role)
          })).filter((item) => item.name)
        : []
    }
  }
}

function buildPrompt(context) {
  const modeRules = buildModeRules(context.shareMode)
  const payload = context.sanitizedProjectPayload || {}
  const contextLines = [
    `项目名称：${safeText(payload.projectName) || '未提供'}`,
    `客户名称：${safeText(payload.clientName) || '未提供'}`,
    `当前阶段：${safeText(payload.stage) || '未提供'}`,
    `预计金额：${safeText(payload.estimatedAmount) || '未提供'}`,
    `项目描述：${safeText(payload.description) || '未提供'}`,
    `当前系统摘要：${safeText(payload.latestSummary) || '未提供'}`,
    `当前下次跟进：${safeText(payload.nextFollowUp) || '未设置'}`,
    '联系人：',
    formatContactsForPrompt(payload.contacts),
    '最近时间线（按发生顺序）：',
    formatTimelineForPrompt(payload.recentTimeline),
    '当前未完成任务：',
    formatOpenTasksForPrompt(payload.openTasks),
    '最近已完成任务：',
    formatCompletedTasksForPrompt(payload.completedTasks),
    '当前关注事项候选：',
    formatCurrentFocusesForPrompt(payload.currentFocuses),
    '字段可见性提醒：',
    safeText(payload.fieldVisibilityHints, '无')
  ]

  return `
请根据以下信息生成项目摘要卡。

分享模式：${modeRules.modeLabel}
分享范围：${context.shareTagName}
允许展示字段：${context.visibleFields.join('、') || '未提供'}
项目上下文：
${contextLines.join('\n')}
模式要求：
${modeRules.ruleText}

输出要求：
1. title 是项目现状标题，不要写“分享摘要”“资料同步”“转发说明”
2. summaryText 输出一段完整描述，控制在 120-220 字，必须把项目总体情况、时间线总结、核心关注点三部分自然融合成一段话
3. 这段描述要像正式系统里的项目摘要，不要拆点，不要分段，不要使用标题或冒号罗列
4. recentTimeline 按时间从早到晚排序，后续事实优先级高于前序计划；如果前面说“计划安排”，后面又出现“已经完成/已见面/已报价”，输出时只能保留最新事实，不能再把旧计划写成当前待办
5. openTasks 才是当前仍未完成的待办；核心关注点只能写截至最后一条时间线仍未闭环的问题，不能把已完成事项再写成关注点
6. completedTasks 只能作为已完成事实引用，不能再改写成下一步动作
7. currentFocuses 是当前优先关注事项的候选，如果它为空再根据 openTasks 和最后几条时间线自行提炼
8. 只保留影响项目推进的业务事实，优先写阶段、招标采购、报价、竞对、关键决策人反馈、交付要求、未闭环动作；像“沟通过程顺畅”这类泛描述通常省略
9. “吃饭/饭局/聚餐”这类信息若对象明确且对推进判断有价值，可以保留，并直接写清楚是和谁；若对象不明确，则不要写入 summaryText
10. 避免重复表达同一事实；如“已报价198万”和“要求后续安排报价”同时存在时，要根据时间线判断是否是两件不同事情，若无法确认就只保留更确定的一条
11. 涉及交付能力时，优先写成“已说明交付能力保障”或“已说明交付保障方案”，不要使用“提供交付能力”这类口语化表达
12. cta 固定返回空字符串，不要输出建议动作
13. 不要解释这次分享是什么，不要写“本次分享用于…”“适合转发…”“接手方需要…”
14. 如果最近推进时间线为空，就只基于项目资料概括现状，不要虚构历史过程
15. 文风要求：简洁、轻商务、明确，不夸张，不要写成“AI总结”口吻，尽量减少无效修饰
16. 对于字段可见性提醒中标注为“本次未开放”的信息，只能理解为分享范围限制，不能写成项目事实缺失或信息未知
17. 最后一句必须落到“当前真正需要关注的事项”，但不要写成动作建议或命令句
18. 如果涉及饭局、见面、沟通对象，必须写清对象；对象不明确时宁可省略，不要出现“约了吃饭”“有人反馈”这类主语不清表述
19. 只返回合法 JSON，不要输出 markdown 代码块

返回 JSON，字段必须包含：
title
summaryText
cta
tone
`.trim()
}

function normalizeTone(value, mode) {
  const current = safeText(value)
  const allowed = ['info_brief', 'outbound_handover']
  if (allowed.includes(current)) {
    return current
  }

  return mode === 'outbound' ? 'outbound_handover' : 'info_brief'
}

function normalizeAiError(error) {
  const message = safeText(error && error.message)
  if (!message) {
    return 'AI 分享摘要暂时不可用'
  }

  if (message.includes('ACCOUNT_NOT_INITIALIZED')) {
    return '账号初始化失败，请退出后重试'
  }

  if (message.includes('ACCOUNT_DISABLED')) {
    return '当前账号已被禁用，请联系管理员处理'
  }

  if (message.includes('ENTITLEMENT_AI_EXHAUSTED')) {
    return '当前 AI 额度已用完，请补充额度后重试'
  }

  if (message.includes('ENTITLEMENT_WRITE_DISABLED')) {
    return '当前账号为只读状态，暂时无法继续使用 AI 能力'
  }

  if (message.includes('AI_EMPTY_RESPONSE') || message.includes('AI_INVALID_RESPONSE')) {
    return 'AI 返回结果异常，请重试'
  }

  return message
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const projectId = safeText(event && event.projectId)
  const shareMode = safeText(event && event.shareMode, 'info')
  const shareTagId = safeText(event && event.shareTagId)
  const requestId = safeText(event && event.requestId)
  const requestStartedAt = Date.now()
  const occurredAt = new Date()
  const generatedAt = occurredAt.toISOString()
  let aiPolicy = null
  let routeRuntime = null
  let accessContext = null
  let effectiveRuntime = null
  let promptText = ''
  let accountId = ''
  let traceId = ''
  let sourceId = requestId || `${projectId}:${shareTagId}:${generatedAt}`

  if (!projectId || !shareTagId) {
    return {
      ok: false,
      message: 'projectId and shareTagId are required',
      errorType: 'AI_SHARE_BRIEF_INPUT_INVALID'
    }
  }

  try {
    const startAt = Date.now()
    aiPolicy = await loadAiPolicy()
    if (!aiPolicy.route.enabled) {
      throw new Error('MODEL_ROUTE_DISABLED: 当前外发摘要模型路由未启用')
    }
    routeRuntime = resolveRouteRuntimeConfig(aiPolicy)
    accessContext = await resolveAiAccessContext(wxContext.OPENID)
    ensureAiAccess(accessContext, aiPolicy)
    accountId = safeText(
      accessContext.account && accessContext.account.accountId,
      safeText(accessContext.entitlements && accessContext.entitlements.accountId, '')
    )
    traceId = buildAiUsageTraceId('share_brief', accountId, requestId, `${projectId}:${shareTagId}`)
    const context = await getShareContext(projectId, wxContext.OPENID, shareTagId)
    if (!context) {
      return {
        ok: false,
        message: 'project not found',
        errorType: 'AI_SHARE_BRIEF_PROJECT_NOT_FOUND'
      }
    }
    const contextReadyAt = Date.now()

    promptText = buildPrompt({
      shareMode,
      shareTagName: shareMode === 'outbound' ? '转交项目' : '发送资料',
      visibleFields: context.visibleFields,
      sanitizedProjectPayload: context.sanitizedPayload
    })
    const execution = await runWithFallback(aiPolicy, routeRuntime, {
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: '你是销售项目解读助手。你的任务是根据项目资料、当前阶段和最近推进时间线，生成准确的项目摘要，而不是解释分享动作本身。你只能使用提供给你的字段，不允许补充未给出的信息。若事实中的主语、对象、时间或结果不明确，宁可省略，不要硬补全。优先保留影响项目推进的关键信息，弱化泛社交表述，文风保持正式、克制、轻商务，只返回合法 JSON。'
        },
        {
          role: 'user',
          content: promptText
        }
      ]
    })
    const result = execution.result
    effectiveRuntime = execution.runtime
    const modelDoneAt = Date.now()

    const parsed = validateShareBriefPayload(extractJson(result.text), shareMode)
    const usageRecord = await consumeAiUsage({
      accountId,
      entitlements: accessContext.entitlements,
      usage: result.usage || null,
      inputText: promptText,
      outputText: result.text,
      multiplier: getModelMultiplier(aiPolicy, effectiveRuntime),
      runtime: effectiveRuntime,
      sourceType: 'share_brief',
      sourceId,
      traceId,
      routeKey: AI_ROUTE_KEY,
      fallbackUsed: execution.fallbackUsed === true,
      primaryError: execution.primaryError || '',
      providerRequestId: '',
      pageKey: 'pages/share-card/share-card',
      projectId,
      occurredAt
    })

    await appendUsageEvent({
      accountId,
      sourceType: 'share_brief',
      sourceId,
      traceId,
      eventKey: buildUsageEventKey('share_brief', traceId, accountId, `${projectId}:${shareTagId}`, 'success'),
      eventStatus: 'success',
      projectId,
      pageKey: 'pages/share-card/share-card',
      routeKey: AI_ROUTE_KEY,
      plannedRuntime: routeRuntime,
      runtime: effectiveRuntime,
      fallbackUsed: execution.fallbackUsed === true,
      primaryError: execution.primaryError || '',
      billingMethod: usageRecord.billingMethod || '',
      rawTotalTokens: usageRecord.rawTotalTokens || 0,
      rawPromptTokens: usageRecord.rawPromptTokens || 0,
      rawCompletionTokens: usageRecord.rawCompletionTokens || 0,
      billedTokens: usageRecord.billedTokens || 0,
      multiplier: usageRecord.multiplier || getModelMultiplier(aiPolicy, effectiveRuntime),
      inputChars: usageRecord.inputChars || promptText.length,
      outputChars: usageRecord.outputChars || String(result.text || '').length,
      durationMs: Date.now() - requestStartedAt,
      usageRecorded: usageRecord.skipped !== true,
      usageReused: usageRecord.reused === true,
      clientRequestId: requestId,
      providerRequestId: '',
      occurredAt
    })
    console.log('generateShareBrief timing', {
      projectId,
      shareMode,
      contextMs: contextReadyAt - startAt,
      modelMs: modelDoneAt - contextReadyAt,
      totalMs: modelDoneAt - startAt,
      timelineCount: Array.isArray(context.sanitizedProjectPayload && context.sanitizedProjectPayload.recentTimeline)
        ? context.sanitizedProjectPayload.recentTimeline.length
        : 0,
      openTaskCount: Array.isArray(context.sanitizedProjectPayload && context.sanitizedProjectPayload.openTasks)
        ? context.sanitizedProjectPayload.openTasks.length
        : 0,
      completedTaskCount: Array.isArray(context.sanitizedProjectPayload && context.sanitizedProjectPayload.completedTasks)
        ? context.sanitizedProjectPayload.completedTasks.length
        : 0
    })

    return {
      ok: true,
      ...buildModelSourceMeta({
        provider: effectiveRuntime.provider,
        model: effectiveRuntime.model,
        providerLabel: effectiveRuntime.providerLabel
      }),
      generatedAt,
      title: parsed.title,
      summaryText: parsed.summaryText,
      overviewLines: parsed.overviewLines,
      timelineInsight: parsed.timelineInsight,
      briefLines: parsed.summaryText ? [parsed.summaryText] : parsed.overviewLines,
      shareGoal: parsed.timelineInsight || parsed.summaryText,
      cta: parsed.cta,
      tone: parsed.tone,
      usage: result.usage || null,
      billedTokens: usageRecord.billedTokens || 0,
      usageRecorded: usageRecord.skipped !== true,
      usageReused: usageRecord.reused === true,
      fallbackUsed: execution.fallbackUsed === true,
      primaryError: execution.primaryError || ''
    }
  } catch (error) {
    await appendUsageEvent({
      accountId,
      sourceType: 'share_brief',
      sourceId,
      traceId,
      eventKey: buildUsageEventKey('share_brief', traceId, accountId, `${projectId}:${shareTagId}`, 'failed'),
      eventStatus: 'failed',
      projectId,
      pageKey: 'pages/share-card/share-card',
      routeKey: AI_ROUTE_KEY,
      plannedRuntime: routeRuntime,
      runtime: error && error.fallbackAttempted === true ? (error.fallbackRuntime || routeRuntime) : routeRuntime,
      fallbackUsed: error && error.fallbackAttempted === true,
      primaryError: safeText(error && error.primaryErrorMessage),
      errorMessage: normalizeAiError(error),
      billingMethod: '',
      rawTotalTokens: 0,
      rawPromptTokens: 0,
      rawCompletionTokens: 0,
      billedTokens: 0,
      multiplier: aiPolicy && routeRuntime ? getModelMultiplier(aiPolicy, routeRuntime) : 1,
      inputChars: promptText.length,
      outputChars: 0,
      durationMs: Date.now() - requestStartedAt,
      usageRecorded: false,
      usageReused: false,
      clientRequestId: requestId,
      providerRequestId: '',
      occurredAt
    })
    return {
      ok: false,
      message: normalizeAiError(error),
      errorType: 'AI_SHARE_BRIEF_FAILED'
    }
  }
}
