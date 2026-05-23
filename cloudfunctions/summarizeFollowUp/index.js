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
const ALLOWED_STAGES = ['线索', '洽谈', '方案', '商务', '成交', '流失']
const FOLLOW_UP_METHODS = ['电话', '微信', '邮件', '面谈', '其他']

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

function safeText(value, fallback = '未提供') {
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
  const providerKey = safeText(runtimeConfig.providerKey || '', '')
  const providerLabel = safeText(runtimeConfig.providerLabel || '', '')
  const model = safeText(runtimeConfig.model || '', '')
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
      protocolMode: normalizeProtocolMode(providerSource[providerKey] && providerSource[providerKey].protocolMode, DEFAULT_PROVIDER_CONFIG.protocolMode),
      providerClass: safeText(providerSource[providerKey] && providerSource[providerKey].providerClass, DEFAULT_PROVIDER_CONFIG.providerClass),
      commercialTier: safeText(providerSource[providerKey] && providerSource[providerKey].commercialTier, DEFAULT_PROVIDER_CONFIG.commercialTier),
      visibleLabel: safeText(providerSource[providerKey] && providerSource[providerKey].visibleLabel, DEFAULT_PROVIDER_CONFIG.visibleLabel),
      modelPricing: buildModelPricingObject(providerSource[providerKey]),
      baseURL: normalizeUrl(providerSource[providerKey] && providerSource[providerKey].baseURL),
      apiKey: safeText(providerSource[providerKey] && providerSource[providerKey].apiKey, ''),
      enabled: providerSource[providerKey] && providerSource[providerKey].enabled !== false
    }
  })
  const route = modelRouting.followup_summary && typeof modelRouting.followup_summary === 'object'
    ? modelRouting.followup_summary
    : {}
  const provider = safeText(route.provider || DEFAULT_AI_POLICY.route.provider, MODEL_PROVIDER)
  const model = safeText(route.model || DEFAULT_AI_POLICY.route.model, MODEL_NAME)
  return {
    quotaPolicy: safeText(source.quotaPolicy) === 'provider_plan' ? 'provider_plan' : 'local_quota',
    providers: providerMap,
    route: {
      providerKey: safeText(route.providerKey || DEFAULT_AI_POLICY.route.providerKey || DEFAULT_PROVIDER_KEY, DEFAULT_PROVIDER_KEY),
      provider: provider || MODEL_PROVIDER,
      model: model || MODEL_NAME,
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
  const providerKey = safeText(runtimeConfig.providerKey || DEFAULT_PROVIDER_KEY, DEFAULT_PROVIDER_KEY)
  const model = safeText(runtimeConfig.model || MODEL_NAME, MODEL_NAME)
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
  const fallbackProviderConfig = fallbackProviderKey
    ? (providers[fallbackProviderKey] || null)
    : null
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

async function resolveAiAccessContext(openid) {
  const identityResult = await db.collection('accountIdentities').where({
    provider: 'wechat_mp',
    openid
  }).limit(1).get()
  const identity = identityResult.data[0] || null
  const accountId = safeText(identity && identity.accountId, '')

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

function ensureAiAccess(context, aiPolicy) {
  const account = context && context.account ? context.account : {}
  const entitlements = context && context.entitlements ? context.entitlements : {}
  const status = safeText(entitlements.status || account.status || 'trialing', 'trialing')

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

function normalizeCompactText(value, maxLength = 120) {
  const text = safeText(value, '')
    .replace(/\s+/g, ' ')
    .replace(/[；;]+/g, '，')
    .replace(/^(综合来看|整体来看|当前来看|从目前情况看|结合当前情况看|基于当前信息看)[，,:：]*/g, '')
    .replace(/当前最需要关注的是/g, '当前需关注')
    .replace(/需要重点关注的是/g, '当前需关注')
    .replace(/已提供交付能力/g, '已说明交付能力保障')
    .replace(/提供了交付能力/g, '说明了交付能力保障')
    .replace(/提供交付能力/g, '说明交付能力保障')
    .replace(/[，。]{2,}/g, '，')
    .replace(/^[，。]+|[，。]+$/g, '')

  if (!text) {
    return ''
  }

  const segments = text
    .split(/[。]/)
    .map((item) => safeText(item, ''))
    .filter(Boolean)

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

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

function dedupeStringArray(value, maxCount = 4) {
  const seen = new Set()
  const result = []
  normalizeStringArray(value).forEach((item) => {
    if (seen.has(item) || result.length >= maxCount) {
      return
    }
    seen.add(item)
    result.push(item)
  })
  return result
}

function normalizeRecommendedStage(value) {
  const text = String(value || '').trim()
  if (!text) {
    return '不变更'
  }

  if (text === '不变更' || text === '保持当前阶段' || text === '维持当前阶段') {
    return '不变更'
  }

  return ALLOWED_STAGES.includes(text) ? text : '不变更'
}

function normalizeFollowUpMethod(value) {
  const method = safeText(value)
  return FOLLOW_UP_METHODS.includes(method) ? method : '其他'
}

function padNumber(value) {
  return `${value}`.padStart(2, '0')
}

function formatDateText(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) {
    return ''
  }

  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`
}

function formatTimeText(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) {
    return ''
  }

  return `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`
}

function isValidDateText(value) {
  const current = safeText(value, '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(current)) {
    return false
  }

  return formatDateText(`${current}T00:00:00`) === current
}

function isValidTimeText(value) {
  const current = safeText(value, '')
  if (!/^\d{2}:\d{2}$/.test(current)) {
    return false
  }

  const hour = Number(current.slice(0, 2))
  const minute = Number(current.slice(3, 5))
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
}

function normalizeFollowUpOccurredTimePrecision(value) {
  const current = safeText(value, '')
  return ['exact', 'coarse', 'default_now'].includes(current) ? current : 'default_now'
}

function buildDefaultOccurredMeta(context = {}) {
  const now = new Date()
  const referenceDate = safeText(context.referenceNowDate, '')
  const referenceTime = safeText(context.referenceNowTime, '')
  return {
    followUpOccurredDate: isValidDateText(referenceDate) ? referenceDate : formatDateText(now),
    followUpOccurredTime: isValidTimeText(referenceTime) ? referenceTime : formatTimeText(now),
    followUpOccurredTimePrecision: 'default_now'
  }
}

function parseOccurredMetaDateTime(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const dateText = safeText(value.followUpOccurredDate, '')
  const timeText = safeText(value.followUpOccurredTime, '')
  if (!isValidDateText(dateText) || !isValidTimeText(timeText)) {
    return null
  }

  const parsed = new Date(`${dateText}T${timeText}:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function shouldPreferDetectedOccurredMeta(value, context = {}) {
  if (!value || typeof value !== 'object') {
    return false
  }

  const precision = normalizeFollowUpOccurredTimePrecision(value.followUpOccurredTimePrecision)
  if (precision === 'default_now') {
    return false
  }

  const referenceDate = safeText(context.referenceNowDate, '')
  const referenceTime = safeText(context.referenceNowTime, '')
  const referenceNow = isValidDateText(referenceDate) && isValidTimeText(referenceTime)
    ? new Date(`${referenceDate}T${referenceTime}:00`)
    : new Date()
  const detectedAt = parseOccurredMetaDateTime(value)

  if (!detectedAt || Number.isNaN(referenceNow.getTime()) || detectedAt.getTime() > referenceNow.getTime()) {
    return false
  }

  const todayStart = new Date(referenceNow)
  todayStart.setHours(0, 0, 0, 0)

  if (detectedAt.getTime() < todayStart.getTime()) {
    return true
  }

  return precision === 'exact'
}

function resolveFollowUpMethodFromPayload(value, context = {}) {
  const detectedMethod = normalizeFollowUpMethod(context.detectedFollowUpMethod)
  const aiMethod = normalizeFollowUpMethod(value && value.followUpMethod)

  if (detectedMethod && detectedMethod !== '其他') {
    return detectedMethod
  }

  if (aiMethod && aiMethod !== '其他') {
    return aiMethod
  }

  return aiMethod || detectedMethod || '其他'
}

function resolveOccurredMeta(value, context = {}) {
  const fallbackMeta = buildDefaultOccurredMeta(context)
  const aiDate = safeText(value && value.followUpOccurredDate, '')
  const aiTime = safeText(value && value.followUpOccurredTime, '')
  const aiPrecision = normalizeFollowUpOccurredTimePrecision(value && value.followUpOccurredTimePrecision)
  const detectedDate = safeText(context.detectedFollowUpOccurredDate, '')
  const detectedTime = safeText(context.detectedFollowUpOccurredTime, '')
  const detectedPrecision = normalizeFollowUpOccurredTimePrecision(context.detectedFollowUpOccurredTimePrecision)

  const aiMeta = isValidDateText(aiDate) && isValidTimeText(aiTime)
    ? {
        followUpOccurredDate: aiDate,
        followUpOccurredTime: aiTime,
        followUpOccurredTimePrecision: aiPrecision
      }
    : null
  const detectedMeta = isValidDateText(detectedDate) && isValidTimeText(detectedTime) && detectedPrecision !== 'default_now'
    ? {
        followUpOccurredDate: detectedDate,
        followUpOccurredTime: detectedTime,
        followUpOccurredTimePrecision: detectedPrecision
      }
    : null

  if (aiMeta && aiMeta.followUpOccurredTimePrecision !== 'default_now') {
    return aiMeta
  }

  if (shouldPreferDetectedOccurredMeta(detectedMeta, context)) {
    return detectedMeta
  }

  if (aiMeta) {
    return aiMeta
  }

  return fallbackMeta
}

function isProjectIrrelevantItem(value) {
  const text = String(value || '').trim()
  if (!text) {
    return false
  }

  return [
    /crm跟进整理助手/i,
    /crm 助手/i,
    /ai助手/i,
    /跟进整理助手/i,
    /提示词/i,
    /prompt/i,
    /模型能力/i,
    /大模型/i,
    /系统功能/i,
    /工具本身/i
  ].some((pattern) => pattern.test(text))
}

function sanitizeProjectScopedList(value) {
  return dedupeStringArray(
    normalizeStringArray(value).filter((item) => !isProjectIrrelevantItem(item))
  )
}

function validateSummaryPayload(value, context = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI_INVALID_RESPONSE')
  }

  const requiredFields = [
    'summary',
    'highlights',
    'risks',
    'recommendedStage',
    'stageChangeReason',
    'missingInfo',
    'followUpMethod'
  ]

  const hasAllFields = requiredFields.every((field) => Object.prototype.hasOwnProperty.call(value, field))
  if (!hasAllFields) {
    throw new Error('AI_INVALID_RESPONSE')
  }

  const recommendedStage = normalizeRecommendedStage(value.recommendedStage)
  const stageChangeReason = recommendedStage === '不变更'
    ? safeText(value.stageChangeReason, '基于当前记录，暂不建议调整项目阶段。')
    : safeText(value.stageChangeReason, '当前记录已出现足够信号，建议同步调整项目阶段。')
  const occurredMeta = resolveOccurredMeta(value, context)

  return {
    summary: normalizeCompactText(value.summary, 120) || '本次跟进已记录，建议结合原始内容确认。',
    highlights: dedupeStringArray(value.highlights, 4)
      .map((item) => normalizeCompactText(item, 36))
      .filter((item) => item && !isLowSignalItem(item))
      .slice(0, 3),
    risks: sanitizeProjectScopedList(value.risks)
      .map((item) => normalizeCompactText(item, 36))
      .filter((item) => item && !isLowSignalItem(item))
      .slice(0, 3),
    recommendedStage,
    stageChangeReason: normalizeCompactText(stageChangeReason, 50) || stageChangeReason,
    missingInfo: sanitizeProjectScopedList(value.missingInfo)
      .map((item) => normalizeCompactText(item, 36))
      .filter((item) => item && !isLowSignalItem(item))
      .slice(0, 3),
    followUpMethod: resolveFollowUpMethodFromPayload(value, context),
    followUpOccurredDate: occurredMeta.followUpOccurredDate,
    followUpOccurredTime: occurredMeta.followUpOccurredTime,
    followUpOccurredTimePrecision: occurredMeta.followUpOccurredTimePrecision,
    currentStage: safeText(context.stage, '线索')
  }
}

function normalizeAiError(error) {
  const message = safeText(error && error.message, '')
  if (!message) {
    return 'AI 整理暂时不可用'
  }

  if (message.includes('AI_EMPTY_RESPONSE') || message.includes('AI_INVALID_RESPONSE')) {
    return 'AI 返回结果异常，请重试'
  }

  return message
}

async function getProjectContext(projectId, openid) {
  if (!projectId) {
    return null
  }

  const result = await db.collection('projects').where({
    _id: projectId,
    _openid: openid
  }).limit(1).get()

  if (!result.data.length) {
    return null
  }

  const project = result.data[0]
  const contacts = Array.isArray(project.contacts)
    ? project.contacts.map((contact) => ({
        name: safeText(contact.name, ''),
        role: safeText(contact.role, '')
      })).filter((contact) => contact.name)
    : []

  const [followUpResult, taskResult] = await Promise.all([
    db.collection('followUps').where({
      _openid: openid,
      projectId
    }).orderBy('followUpTime', 'desc').limit(3).get(),
    db.collection('tasks').where({
      _openid: openid,
      projectId,
      status: _.in(['pending', 'in_progress'])
    }).orderBy('dueAt', 'asc').limit(5).get()
  ])

  return {
    projectName: safeText(project.projectName),
    clientName: safeText(project.clientName),
    stage: safeText(project.stage, '线索'),
    description: safeText(project.description, '暂无项目描述'),
    contacts,
    recentFollowUps: Array.isArray(followUpResult.data)
      ? followUpResult.data.map((item) => ({
          time: safeText(item.followUpDate || item.followUpTime),
          method: safeText(item.method, '其他'),
          summary: safeText(item.aiSummary || item.content),
          stageChange: safeText(item.stageChange),
          nextFollowUpTime: safeText(item.nextFollowUpTime)
        }))
      : [],
    openTasks: Array.isArray(taskResult.data)
      ? taskResult.data.map((item) => ({
          title: safeText(item.title),
          dueDateText: safeText(item.dueDateText || item.dueAt)
        }))
      : []
  }
}

function buildPrompt(context) {
  const contacts = context.contacts.length
    ? context.contacts.map((contact) => `${contact.name}（${contact.role || '未标注角色'}）`).join('、')
    : '未提供'
  const recentFollowUps = context.recentFollowUps && context.recentFollowUps.length
    ? context.recentFollowUps.map((item, index) => {
        return `${index + 1}. ${item.time || '时间未填'}｜${item.method || '其他'}｜${item.summary || '暂无摘要'}${item.stageChange ? `｜阶段变更：${item.stageChange}` : ''}${item.nextFollowUpTime ? `｜下次跟进：${item.nextFollowUpTime}` : ''}`
      }).join('\n')
    : '暂无历史跟进'
  const openTasks = context.openTasks && context.openTasks.length
    ? context.openTasks.map((item, index) => `${index + 1}. ${item.title || '未命名任务'}${item.dueDateText ? `（截止 ${item.dueDateText}）` : ''}`).join('\n')
    : '当前无未完成推进任务'

  return `
请根据以下项目上下文和本次跟进内容，生成结构化整理结果。

项目名称：${context.projectName}
客户名称：${context.clientName}
当前阶段：${context.stage}
项目摘要：${context.description}
相关联系人：${contacts}
最近跟进参考：
${recentFollowUps}
未完成推进任务：
${openTasks}
当前参考时间：${context.referenceNowDate} ${context.referenceNowTime}
页面手动选择的跟进方式：${context.method || '未指定'}
本地规则命中的跟进方式提示：${context.detectedFollowUpMethod || '未命中'}
本地规则命中的跟进时间提示：${context.detectedOccurredHint || '未命中'}
本次原始记录：${context.content}
用户手动选择的阶段变更：${context.stageChange}

输出要求：
1. summary 必须聚焦“本次跟进新增了什么信息、推进到了哪里、当前最该关注什么”，使用 70-120 字中文自然表述
2. highlights 提取 2-3 条已明确发生的关键进展，必须基于已提供事实，不要重复 summary 原句
3. risks 只保留最多 3 条真实推进风险或阻塞，没有明确风险时返回空数组
4. missingInfo 只保留最多 3 条真正影响推进判断的缺失信息，没有则返回空数组
5. recommendedStage 只能返回：不变更、线索、洽谈、方案、商务、成交、流失
6. 只有当本次记录出现明确的新证据，足以支持阶段变化时，才建议变更；如果只是补充信息、延续原计划、尚未形成新结论，请返回“不变更”
7. 如果本次记录已经说明某个动作“已完成/已发生”，不要再把它表述成“待完成/待安排”
8. 不得虚构未出现的人名、对象、金额、报价、时间或结论；对象不明确时，只能概括为“对方”或“相关联系人”
9. 你分析的是“当前客户项目推进”，不是 CRM 软件、AI 助手、提示词或系统功能本身
10. risks 和 missingInfo 只能围绕客户需求、预算、决策链、联系人、商务条款、时间节点、采购流程、竞争态势等项目推进因素
11. 禁止输出与 CRM 助手、AI 模型、提示词、系统设计、本工具产品需求有关的内容
12. 文风要像正式系统里的跟进摘要，避免“综合来看”“整体来看”“建议继续保持沟通”这类套话
13. summary 与 highlights 不要重复同一事实，优先保留新增信息和当前关注点
14. followUpMethod 根据本次原始记录判断跟进方式，只能返回：电话、微信、邮件、面谈、其他；无法判断时返回“其他”
15. 如果页面未手动指定跟进方式，可以参考“本地规则命中的跟进方式提示”，但只有当原始记录本身能支持时才采用；不要臆测
16. followUpOccurredDate 只返回 YYYY-MM-DD，表示“本次跟进实际发生时间”的日期部分
17. followUpOccurredTime 只返回 HH:mm，表示“本次跟进实际发生时间”的时间部分
18. followUpOccurredTimePrecision 只能返回：exact、coarse、default_now
19. 如果原始记录明确提到精确时间，例如“昨晚 8:30”“昨天 14:00”，就返回对应精确时间，并将 followUpOccurredTimePrecision 设为 exact
20. 如果原始记录只提到模糊时段，例如“今早”“今天下午”“昨晚”，请转换成稳定的精确时间：凌晨 02:00、早上 09:30、上午 10:00、中午 12:00、下午 15:00、傍晚 18:30、晚上 20:00，并将 followUpOccurredTimePrecision 设为 coarse
21. 如果原始记录只提到日期但没提具体时间或时段，例如“昨天”“前天”“5月3日”，请保留该日期，并使用“当前参考时间”的时分作为时间，followUpOccurredTimePrecision 返回 coarse
22. 如果原始记录没有提到本次跟进发生时间，请直接使用“当前参考时间”，followUpOccurredTimePrecision 返回 default_now
23. 必须识别“本次跟进已经发生的时间”，不要误把“明天发报价”“下周再联系”这类未来计划时间当作 followUpOccurredDate / followUpOccurredTime
24. 只返回合法 JSON，不要输出 markdown 代码块

返回 JSON，字段必须包含：
summary
highlights
risks
recommendedStage
stageChangeReason
missingInfo
followUpMethod
followUpOccurredDate
followUpOccurredTime
followUpOccurredTimePrecision
`.trim()
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const requestId = safeText(event && event.requestId, '')
  const requestStartedAt = Date.now()
  const occurredAt = new Date()
  const generatedAt = occurredAt.toISOString()
  const projectId = safeText(event && event.projectId, '')
  let aiPolicy = null
  let routeRuntime = null
  let accessContext = null
  let effectiveRuntime = null
  let promptText = ''
  let accountId = ''
  let traceId = ''
  let sourceId = requestId || `${projectId}:${generatedAt}`

  if (!event.content) {
    return {
      ok: false,
      message: 'content is required'
    }
  }

  try {
    aiPolicy = await loadAiPolicy()
    if (!aiPolicy.route.enabled) {
      throw new Error('MODEL_ROUTE_DISABLED: 当前跟进摘要模型路由未启用')
    }
    routeRuntime = resolveRouteRuntimeConfig(aiPolicy)
    accessContext = await resolveAiAccessContext(wxContext.OPENID)
    ensureAiAccess(accessContext, aiPolicy)
    accountId = safeText(
      accessContext.account && accessContext.account.accountId,
      safeText(accessContext.entitlements && accessContext.entitlements.accountId, '')
    )
    traceId = buildAiUsageTraceId(
      'followup_summary',
      accountId,
      requestId,
      `${projectId}:${safeText(event.content, '').slice(0, 24)}`
    )
    const projectContext = await getProjectContext(event.projectId, wxContext.OPENID)
    const fallbackContext = event.projectContext || {}
    const referenceNowDate = safeText(event.referenceNowDate, '')
    const referenceNowTime = safeText(event.referenceNowTime, '')
    const detectedFollowUpMethod = normalizeFollowUpMethod(event.detectedFollowUpMethod)
    const detectedFollowUpOccurredDate = safeText(event.detectedFollowUpOccurredDate, '')
    const detectedFollowUpOccurredTime = safeText(event.detectedFollowUpOccurredTime, '')
    const detectedFollowUpOccurredTimePrecision = normalizeFollowUpOccurredTimePrecision(event.detectedFollowUpOccurredTimePrecision)
    const detectedOccurredHint = isValidDateText(detectedFollowUpOccurredDate)
      && isValidTimeText(detectedFollowUpOccurredTime)
      && detectedFollowUpOccurredTimePrecision !== 'default_now'
      ? `${detectedFollowUpOccurredDate} ${detectedFollowUpOccurredTime}（${detectedFollowUpOccurredTimePrecision}）`
      : ''
    const context = {
      projectName: projectContext ? projectContext.projectName : safeText(fallbackContext.projectName),
      clientName: projectContext ? projectContext.clientName : safeText(fallbackContext.clientName),
      stage: projectContext ? projectContext.stage : safeText(fallbackContext.stage, '线索'),
      description: projectContext ? projectContext.description : safeText(fallbackContext.description, '暂无项目描述'),
      contacts: projectContext ? projectContext.contacts : [],
      recentFollowUps: projectContext ? projectContext.recentFollowUps : [],
      openTasks: projectContext ? projectContext.openTasks : [],
      method: safeText(event.method, ''),
      referenceNowDate: isValidDateText(referenceNowDate) ? referenceNowDate : formatDateText(occurredAt),
      referenceNowTime: isValidTimeText(referenceNowTime) ? referenceNowTime : formatTimeText(occurredAt),
      detectedFollowUpMethod: detectedFollowUpMethod !== '其他' ? detectedFollowUpMethod : '',
      detectedFollowUpOccurredDate,
      detectedFollowUpOccurredTime,
      detectedFollowUpOccurredTimePrecision,
      detectedOccurredHint,
      content: safeText(event.content),
      stageChange: safeText(event.stageChange, '未选择')
    }
    promptText = buildPrompt(context)

    const execution = await runWithFallback(aiPolicy, routeRuntime, {
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: '你是销售项目跟进整理助手。你只整理客户项目推进事实，不评价 CRM 软件、AI 助手、提示词或系统功能。当前跟进记录是主依据，历史记录只作辅助参考。不要虚构，不要补全未提供信息，文风保持正式、克制、轻商务，只返回合法 JSON。'
        },
        {
          role: 'user',
          content: promptText
        }
      ]
    })
    const result = execution.result
    effectiveRuntime = execution.runtime

    const parsed = validateSummaryPayload(extractJson(result.text), context)
    const usageRecord = await consumeAiUsage({
      accountId,
      entitlements: accessContext.entitlements,
      usage: result.usage || null,
      inputText: promptText,
      outputText: result.text,
      multiplier: getModelMultiplier(aiPolicy, effectiveRuntime),
      runtime: effectiveRuntime,
      sourceType: 'followup_summary',
      sourceId,
      traceId,
      routeKey: 'followup_summary',
      fallbackUsed: execution.fallbackUsed === true,
      primaryError: execution.primaryError || '',
      providerRequestId: '',
      pageKey: 'pages/follow-up-edit/follow-up-edit',
      projectId,
      occurredAt
    })

    await appendUsageEvent({
      accountId,
      sourceType: 'followup_summary',
      sourceId,
      traceId,
      eventKey: buildUsageEventKey('followup_summary', traceId, accountId, `${projectId}:${safeText(event.content, '').slice(0, 24)}`, 'success'),
      eventStatus: 'success',
      projectId,
      pageKey: 'pages/follow-up-edit/follow-up-edit',
      routeKey: 'followup_summary',
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
      summary: parsed.summary,
      highlights: parsed.highlights,
      risks: parsed.risks,
      recommendedStage: parsed.recommendedStage,
      stageChangeReason: parsed.stageChangeReason,
      missingInfo: parsed.missingInfo,
      followUpMethod: parsed.followUpMethod,
      followUpOccurredDate: parsed.followUpOccurredDate,
      followUpOccurredTime: parsed.followUpOccurredTime,
      followUpOccurredTimePrecision: parsed.followUpOccurredTimePrecision,
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
      sourceType: 'followup_summary',
      sourceId,
      traceId,
      eventKey: buildUsageEventKey(
        'followup_summary',
        traceId,
        accountId,
        `${projectId}:${safeText(event && event.content, '').slice(0, 24)}`,
        'failed'
      ),
      eventStatus: 'failed',
      projectId,
      pageKey: 'pages/follow-up-edit/follow-up-edit',
      routeKey: 'followup_summary',
      plannedRuntime: routeRuntime,
      runtime: error && error.fallbackAttempted === true ? (error.fallbackRuntime || routeRuntime) : routeRuntime,
      fallbackUsed: error && error.fallbackAttempted === true,
      primaryError: safeText(error && error.primaryErrorMessage, ''),
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
      errorType: 'AI_SUMMARY_FAILED'
    }
  }
}
