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
  timeout: 55000
})
const ai = app.ai()

const MODEL_PROVIDER = 'hunyuan-exp'
const MODEL_NAME = 'hunyuan-turbos-latest'
const AI_MODEL_ROUTING_FLAG_KEY = 'ai_model_routing_v1'
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

function safeText(value, fallback = '') {
  const text = String(value || '').trim()
  return text || fallback
}

function toNumber(value, fallback = 0) {
  const current = Number(value)
  return Number.isFinite(current) ? current : fallback
}

function normalizeUrl(value) {
  return safeText(value).replace(/\/+$/, '')
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
  const current = safeText(value || fallback)
  return ['auto', 'chat_completions', 'responses'].includes(current) ? current : 'auto'
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

async function safeGetOne(collectionName, query) {
  try {
    const result = await db.collection(collectionName).where(query).limit(1).get()
    return result.data[0] || null
  } catch (error) {
    return null
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
      providerType: safeText(providerSource[providerKey] && providerSource[providerKey].providerType) === 'openai_compatible'
        ? 'openai_compatible'
        : 'cloudbase',
      protocolMode: normalizeProtocolMode(providerSource[providerKey] && providerSource[providerKey].protocolMode, DEFAULT_PROVIDER_CONFIG.protocolMode),
      providerClass: safeText(providerSource[providerKey] && providerSource[providerKey].providerClass, DEFAULT_PROVIDER_CONFIG.providerClass),
      commercialTier: safeText(providerSource[providerKey] && providerSource[providerKey].commercialTier, DEFAULT_PROVIDER_CONFIG.commercialTier),
      visibleLabel: safeText(providerSource[providerKey] && providerSource[providerKey].visibleLabel, DEFAULT_PROVIDER_CONFIG.visibleLabel),
      modelPricing: buildModelPricingObject(providerSource[providerKey]),
      baseURL: normalizeUrl(providerSource[providerKey] && providerSource[providerKey].baseURL),
      apiKey: safeText(providerSource[providerKey] && providerSource[providerKey].apiKey),
      enabled: providerSource[providerKey] && providerSource[providerKey].enabled !== false
    }
  })

  const route = modelRouting.followup_next_action && typeof modelRouting.followup_next_action === 'object'
    ? modelRouting.followup_next_action
    : {}
  const provider = safeText(route.provider || DEFAULT_AI_POLICY.route.provider)
  const model = safeText(route.model || DEFAULT_AI_POLICY.route.model)
  return {
    quotaPolicy: safeText(source.quotaPolicy) === 'provider_plan' ? 'provider_plan' : 'local_quota',
    providers: providerMap,
    route: {
      providerKey: safeText(route.providerKey || DEFAULT_AI_POLICY.route.providerKey || DEFAULT_PROVIDER_KEY),
      provider: provider || DEFAULT_AI_POLICY.route.provider,
      model: model || DEFAULT_AI_POLICY.route.model,
      fallbackProviderKey: safeText(route.fallbackProviderKey || DEFAULT_AI_POLICY.route.fallbackProviderKey || ''),
      fallbackModel: safeText(route.fallbackModel || DEFAULT_AI_POLICY.route.fallbackModel || ''),
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
      appendEntry(
        source.model || source.modelName || source.key,
        source
      )
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
  const providerKey = safeText(route.providerKey || DEFAULT_PROVIDER_KEY)
  const providerConfig = providers[providerKey] || providers[DEFAULT_PROVIDER_KEY] || DEFAULT_PROVIDER_CONFIG

  if (providerConfig.enabled === false) {
    throw new Error(`MODEL_PROVIDER_DISABLED: 当前供应商(${providerKey})已停用`)
  }

  const model = safeText(route.model || providerConfig.defaultModel || MODEL_NAME)
  const protocolMode = normalizeProtocolMode(providerConfig.protocolMode, 'auto')
  const fallbackProviderKey = safeText(route.fallbackProviderKey, '')
  const fallbackProviderConfig = fallbackProviderKey
    ? (providers[fallbackProviderKey] || null)
    : null
  const fallbackModel = safeText(route.fallbackModel || (fallbackProviderConfig && fallbackProviderConfig.defaultModel) || '')
  if (safeText(providerConfig.providerType) === 'openai_compatible') {
    const baseURL = normalizeUrl(providerConfig.baseURL)
    const apiKey = safeText(providerConfig.apiKey)
    if (!baseURL || !apiKey) {
      throw new Error(`MODEL_PROVIDER_CONFIG_INVALID: 供应商(${providerKey})缺少 baseURL 或 apiKey`)
    }
    return {
      engine: 'openai_compatible',
      providerKey,
      providerLabel: safeText(providerConfig.displayName || providerKey),
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
    providerLabel: safeText(providerConfig.displayName || 'CloudBase AI'),
    provider: safeText(route.provider || providerConfig.cloudbaseProvider || MODEL_PROVIDER),
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

  const model = safeText(routeRuntime.fallbackModel || providerConfig.defaultModel || MODEL_NAME)
  const protocolMode = normalizeProtocolMode(providerConfig.protocolMode, 'auto')
  if (safeText(providerConfig.providerType) === 'openai_compatible') {
    const baseURL = normalizeUrl(providerConfig.baseURL)
    const apiKey = safeText(providerConfig.apiKey)
    if (!baseURL || !apiKey) {
      return null
    }
    return {
      engine: 'openai_compatible',
      providerKey: fallbackProviderKey,
      providerLabel: safeText(providerConfig.displayName || fallbackProviderKey),
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
    providerLabel: safeText(providerConfig.displayName || 'CloudBase AI'),
    provider: safeText(providerConfig.cloudbaseProvider || MODEL_PROVIDER),
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
          const errorMessage = safeText(parsed.error && parsed.error.message || parsed.message || raw || 'openai compatible request failed')
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
  let text = safeText(message.content)
  if (!text && Array.isArray(message.content)) {
    text = message.content
      .map((item) => safeText(item && (item.text || item.content)))
      .filter(Boolean)
      .join('\n')
  }
  if (!text) {
    text = safeText(message.reasoning_content || response.reasoning_content)
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
  const directText = safeText(response.output_text)
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
    max_output_tokens: 1024
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
    text: safeText(result && result.text),
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
    try {
      const result = await runRoutedModelGenerateText(fallbackRuntime, payload)
      return {
        result,
        runtime: fallbackRuntime,
        fallbackUsed: true,
        primaryError: safeText(primaryError && primaryError.message, '')
      }
    } catch (fallbackError) {
      fallbackError.primaryErrorMessage = safeText(primaryError && primaryError.message, '')
      fallbackError.fallbackAttempted = true
      fallbackError.fallbackRuntime = fallbackRuntime
      throw fallbackError
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

function normalizeCompactText(value, maxLength = 80) {
  const text = safeText(value, '')
    .replace(/\s+/g, ' ')
    .replace(/[；;]+/g, '，')
    .replace(/^(建议|建议先|建议优先|可考虑|可以考虑|优先建议)[，,:：]*/g, '')
    .replace(/^(综合来看|整体来看|当前来看|从目前情况看|结合当前情况看)[，,:：]*/g, '')
    .replace(/已提供交付能力/g, '已说明交付能力保障')
    .replace(/提供了交付能力/g, '说明了交付能力保障')
    .replace(/提供交付能力/g, '说明交付能力保障')
    .replace(/[，。]{2,}/g, '，')
    .replace(/^[，。]+|[，。]+$/g, '')

  if (!text) {
    return ''
  }

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function isLowSignalItem(value) {
  const text = safeText(value, '')
  if (!text) {
    return true
  }

  return [
    /持续跟进/,
    /保持沟通/,
    /继续沟通/,
    /继续推进/,
    /后续跟进/,
    /继续关注/
  ].some((pattern) => pattern.test(text))
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

function formatTimeOnly(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${hour}:${minute}`
}

function buildFallbackDueDate(offsetDays = 1) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  date.setHours(10, 0, 0, 0)
  return {
    dueDate: formatDateOnly(date),
    dueTime: formatTimeOnly(date)
  }
}

function normalizeTaskType(value) {
  const current = safeText(value)
  const allowed = ['send_solution', 'send_quote', 'demo', 'report_solution', 'business_negotiation', 'research', 'callback', 'meeting', 'contract', 'collect_info', 'other']
  return allowed.includes(current) ? current : 'other'
}

function normalizeTaskDrafts(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.slice(0, 3).map((item, index) => {
    const fallbackDue = buildFallbackDueDate(index + 1)
    return {
      title: normalizeCompactText(item && item.title, 18) || `推进动作 ${index + 1}`,
      type: normalizeTaskType(item && item.type),
      dueDate: safeText(item && item.dueDate, fallbackDue.dueDate),
      dueTime: safeText(item && item.dueTime, fallbackDue.dueTime),
      description: normalizeCompactText(item && item.description, 40)
    }
  })
}

function validateSuggestionPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI_INVALID_RESPONSE')
  }

  const requiredFields = [
    'nextAction',
    'recommendedTarget',
    'recommendedMethod',
    'recommendedTimeWindow',
    'recommendedDate',
    'recommendedTime',
    'talkTrack',
    'reason',
    'missingInfo',
    'taskDrafts'
  ]

  const hasAllFields = requiredFields.every((field) => Object.prototype.hasOwnProperty.call(value, field))
  if (!hasAllFields) {
    throw new Error('AI_INVALID_RESPONSE')
  }

  const normalizedTasks = normalizeTaskDrafts(value.taskDrafts)
  const fallbackDue = normalizedTasks[0] || buildFallbackDueDate(1)

  return {
    nextAction: normalizeCompactText(value.nextAction, 36) || '先补一条明确推进动作',
    recommendedTarget: normalizeCompactText(value.recommendedTarget, 20) || '相关联系人',
    recommendedMethod: normalizeCompactText(value.recommendedMethod, 12) || '微信',
    recommendedTimeWindow: normalizeCompactText(value.recommendedTimeWindow, 24) || '尽快安排',
    recommendedDate: safeText(value.recommendedDate, fallbackDue.dueDate),
    recommendedTime: safeText(value.recommendedTime, fallbackDue.dueTime),
    talkTrack: normalizeCompactText(value.talkTrack, 80) || '这边把当前方案和关键节点再对齐一下，确认您这边本周最适合推进的下一步。',
    reason: normalizeCompactText(value.reason, 40) || '这一步最接近当前成交推进节点。',
    missingInfo: normalizeStringArray(value.missingInfo)
      .map((item) => normalizeCompactText(item, 30))
      .filter((item) => item && !isLowSignalItem(item)),
    taskDrafts: normalizedTasks
  }
}

async function getProjectContext(projectId, openid) {
  const projectResult = await db.collection('projects').where({
    _id: projectId,
    _openid: openid
  }).limit(1).get()

  if (!projectResult.data.length) {
    return null
  }

  const project = projectResult.data[0]
  const contacts = Array.isArray(project.contacts)
    ? project.contacts.map((contact) => ({
        name: safeText(contact.name),
        role: safeText(contact.role),
        company: safeText(contact.company)
      })).filter((contact) => contact.name)
    : []

  const followUpResult = await db.collection('followUps').where({
    _openid: openid,
    projectId
  }).orderBy('followUpTime', 'desc').limit(3).get()

  const taskResult = await db.collection('tasks').where({
    _openid: openid,
    projectId,
    status: _.in(['pending', 'in_progress'])
  }).orderBy('dueAt', 'asc').limit(5).get()

  return {
    projectName: safeText(project.projectName, '未命名项目'),
    clientName: safeText(project.clientName, '未填写客户'),
    stage: safeText(project.stage, '线索'),
    description: safeText(project.description, '暂无项目摘要'),
    contacts,
    recentFollowUps: (followUpResult.data || []).map((item) => ({
      time: formatDateOnly(item.followUpTime),
      method: safeText(item.method, '其他'),
      summary: safeText(item.aiSummary || item.content),
      stageChange: safeText(item.stageChange),
      nextFollowUpTime: safeText(item.nextFollowUpTime)
    })),
    openTasks: (taskResult.data || []).map((item) => ({
      title: safeText(item.title),
      type: safeText(item.type),
      dueDateText: safeText(item.dueDateText),
      status: safeText(item.status)
    }))
  }
}

function buildPrompt(context) {
  const contacts = context.contacts.length
    ? context.contacts.map((item) => `${item.name}${item.role ? `（${item.role}）` : ''}`).join('、')
    : '未提供'
  const recentFollowUps = context.recentFollowUps.length
    ? context.recentFollowUps.map((item, index) => {
        return `${index + 1}. ${item.time}｜${item.method}｜${item.summary}${item.stageChange ? `｜阶段变化：${item.stageChange}` : ''}${item.nextFollowUpTime ? `｜下次跟进：${item.nextFollowUpTime}` : ''}`
      }).join('\n')
    : '暂无最近跟进'
  const openTasks = context.openTasks.length
    ? context.openTasks.map((item, index) => `${index + 1}. ${item.title}${item.dueDateText ? `（截止 ${item.dueDateText}）` : ''}`).join('\n')
    : '当前无开放任务'
  const today = new Date()
  const fallbackDue = buildFallbackDueDate(1)

  return `
请为以下项目给出下一步跟进建议。

项目名称：${context.projectName}
客户名称：${context.clientName}
当前阶段：${context.stage}
项目摘要：${context.description}
相关联系人：${contacts}
最近跟进记录：
${recentFollowUps}
本次摘要：${context.currentSummary}
当前未完成任务：
${openTasks}
今天日期：${formatDateOnly(today)}
默认建议截止时间参考：${fallbackDue.dueDate} ${fallbackDue.dueTime}

输出要求：
1. 给出 1 条最优先动作，表述直接，可立即执行
2. 指出建议跟进对象，优先写明确人名或角色
3. 给出建议跟进方式
4. 给出建议时间窗口
5. 同时输出 recommendedDate 和 recommendedTime，用于前端直接回填
6. 提供一段 40-80 字的话术建议，口吻自然，不要像模板话术
7. 如果适合，生成 1-2 条推进任务草稿
8. taskDrafts 中每条都必须包含 title、type、dueDate、dueTime、description
9. reason 只说明为什么优先做这一步，控制在 1 句内
10. missingInfo 只保留真正影响执行的缺失信息，没有则返回空数组
11. 如果已有开放任务，nextAction 和 taskDrafts 优先承接当前任务，不要另起无关动作
12. nextAction、talkTrack、reason 不要用“建议”“可考虑”起句，直接写动作和判断
13. 不要输出“持续跟进”“保持沟通”这类空话
14. 只返回合法 JSON，不要输出 markdown 代码块

返回 JSON，字段必须包含：
nextAction
recommendedTarget
recommendedMethod
recommendedTimeWindow
recommendedDate
recommendedTime
talkTrack
reason
missingInfo
taskDrafts
`.trim()
}

function normalizeAiError(error) {
  const message = safeText(error && error.message)
  if (!message) {
    return 'AI 下一步建议暂时不可用'
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
  const projectId = safeText(event.projectId)
  const currentSummary = safeText(event.currentSummary)
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
  let sourceId = requestId || `${projectId}:${generatedAt}`

  if (!projectId || !currentSummary) {
    return {
      ok: false,
      message: 'projectId and currentSummary are required',
      errorType: 'AI_NEXT_INPUT_INVALID'
    }
  }

  try {
    aiPolicy = await loadAiPolicy()
    if (!aiPolicy.route.enabled) {
      throw new Error('MODEL_ROUTE_DISABLED: 当前下一步建议模型路由未启用')
    }
    routeRuntime = resolveRouteRuntimeConfig(aiPolicy)
    accessContext = await resolveAiAccessContext(wxContext.OPENID)
    ensureAiAccess(accessContext, aiPolicy)
    accountId = safeText(
      accessContext.account && accessContext.account.accountId,
      safeText(accessContext.entitlements && accessContext.entitlements.accountId, '')
    )
    traceId = buildAiUsageTraceId('followup_next_action', accountId, requestId, `${projectId}:${currentSummary.slice(0, 24)}`)
    const projectContext = await getProjectContext(projectId, wxContext.OPENID)
    if (!projectContext) {
      return {
        ok: false,
        message: 'project not found',
        errorType: 'AI_NEXT_PROJECT_NOT_FOUND'
      }
    }
    promptText = buildPrompt({
      ...projectContext,
      currentSummary
    })

    const execution = await runWithFallback(aiPolicy, routeRuntime, {
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: '你是销售推进建议助手。请基于项目阶段、最近跟进和未完成任务，输出明确、可执行、可直接落地为推进任务的建议。不要虚构事实，不要补全未提供的联系方式，文风保持正式、克制、轻商务，只返回合法 JSON。'
        },
        {
          role: 'user',
          content: promptText
        }
      ]
    })
    const result = execution.result
    effectiveRuntime = execution.runtime

    const parsed = validateSuggestionPayload(extractJson(result.text))
    const usageRecord = await consumeAiUsage({
      accountId,
      entitlements: accessContext.entitlements,
      usage: result.usage || null,
      inputText: promptText,
      outputText: result.text,
      multiplier: getModelMultiplier(aiPolicy, effectiveRuntime),
      runtime: effectiveRuntime,
      sourceType: 'followup_next_action',
      sourceId,
      traceId,
      routeKey: 'followup_next_action',
      fallbackUsed: execution.fallbackUsed === true,
      primaryError: execution.primaryError || '',
      providerRequestId: '',
      pageKey: 'pages/follow-up-edit/follow-up-edit',
      projectId,
      occurredAt
    })

    await appendUsageEvent({
      accountId,
      sourceType: 'followup_next_action',
      sourceId,
      traceId,
      eventKey: buildUsageEventKey('followup_next_action', traceId, accountId, `${projectId}:${currentSummary.slice(0, 24)}`, 'success'),
      eventStatus: 'success',
      projectId,
      pageKey: 'pages/follow-up-edit/follow-up-edit',
      routeKey: 'followup_next_action',
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

    return {
      ok: true,
      ...buildModelSourceMeta({
        provider: effectiveRuntime.provider,
        model: effectiveRuntime.model,
        providerLabel: effectiveRuntime.providerLabel
      }),
      generatedAt,
      nextAction: parsed.nextAction,
      recommendedTarget: parsed.recommendedTarget,
      recommendedMethod: parsed.recommendedMethod,
      recommendedTimeWindow: parsed.recommendedTimeWindow,
      recommendedDate: parsed.recommendedDate,
      recommendedTime: parsed.recommendedTime,
      talkTrack: parsed.talkTrack,
      reason: parsed.reason,
      missingInfo: parsed.missingInfo,
      taskDrafts: parsed.taskDrafts,
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
      sourceType: 'followup_next_action',
      sourceId,
      traceId,
      eventKey: buildUsageEventKey(
        'followup_next_action',
        traceId,
        accountId,
        `${projectId}:${currentSummary.slice(0, 24)}`,
        'failed'
      ),
      eventStatus: 'failed',
      projectId,
      pageKey: 'pages/follow-up-edit/follow-up-edit',
      routeKey: 'followup_next_action',
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
      errorType: 'AI_NEXT_SUGGESTION_FAILED'
    }
  }
}
