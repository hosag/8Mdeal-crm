const cloud = require('wx-server-sdk')
const tcb = require('@cloudbase/node-sdk')
const https = require('https')
const http = require('http')
const { URL } = require('url')
const createAiUsageHelper = require('./usageHelper')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const app = tcb.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  timeout: 55000
})
const ai = app.ai()
const db = cloud.database()

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

function buildRecallSourceMeta() {
  return {
    sourceType: 'fallback',
    sourceLabel: '候选召回',
    providerLabel: '',
    modelName: '',
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

  const route = modelRouting.quick_entry_project && typeof modelRouting.quick_entry_project === 'object'
    ? modelRouting.quick_entry_project
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
          const parseError = new Error(`MODEL_PROVIDER_RESPONSE_INVALID: ${raw.slice(0, 160)}`)
          reject(parseError)
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
    accountId,
    account: accountResult.data[0] || null,
    entitlements: entitlementsResult.data[0] || null
  }
}

async function loadProjectMemoryMap(accountId, candidateIds = []) {
  const currentAccountId = safeText(accountId)
  const projectIds = Array.isArray(candidateIds)
    ? candidateIds.map((item) => safeText(item)).filter(Boolean).slice(0, 8)
    : []

  if (!currentAccountId || !projectIds.length) {
    return {}
  }

  try {
    const result = await db.collection('projectAliasMemories').where({
      accountId: currentAccountId,
      projectId: db.command.in(projectIds),
      enabled: true
    }).get()
    const rows = Array.isArray(result.data) ? result.data : []
    return rows
      .sort((left, right) => {
        const leftScore = Number(left.strength || 0) * 1000 + Number(left.hitCount || 0)
        const rightScore = Number(right.strength || 0) * 1000 + Number(right.hitCount || 0)
        return rightScore - leftScore
      })
      .reduce((map, item) => {
        const projectId = safeText(item && item.projectId)
        const aliasText = safeText(item && item.aliasText)
        if (!projectId || !aliasText) {
          return map
        }
        if (!map[projectId]) {
          map[projectId] = []
        }
        if (map[projectId].indexOf(aliasText) < 0 && map[projectId].length < 6) {
          map[projectId].push(aliasText)
        }
        return map
      }, {})
  } catch (error) {
    return {}
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
    .replace(/[，。]{2,}/g, '，')
    .replace(/^[，。]+|[，。]+$/g, '')

  if (!text) {
    return ''
  }

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
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

function buildChineseNgramTokens(value, minLength = 2, maxLength = 8, limit = 24) {
  const segments = extractChineseSegments(value)
  const tokens = []
  const seen = new Set()

  segments.forEach((segment) => {
    const currentSegment = safeText(segment)
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

function getFuzzyTokenScore(left, right) {
  const source = safeText(left)
  const target = safeText(right)
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

function buildProjectMemoryInsight(content, memoryAliases = []) {
  const currentText = safeText(content).toLowerCase()
  if (!currentText || currentText.length < 2) {
    return {
      score: 0,
      matchedAliases: [],
      summaryText: ''
    }
  }

  const normalizedContent = normalizeHomophoneText(currentText)
  const queryTokens = buildChineseNgramTokens(currentText)
  const matches = []
  let score = 0

  ;(Array.isArray(memoryAliases) ? memoryAliases : []).forEach((alias) => {
    const currentAlias = safeText(alias).toLowerCase()
    if (!currentAlias) {
      return
    }

    if (currentText.includes(currentAlias)) {
      score += 18
      matches.push(`直命中 ${alias}`)
      return
    }

    if (normalizedContent.includes(normalizeHomophoneText(currentAlias))) {
      score += 14
      matches.push(`同音 ${alias}`)
      return
    }

    const aliasTokens = buildChineseNgramTokens(currentAlias, 2, Math.min(8, currentAlias.length || 8), 12)
    let fuzzyMatched = false
    aliasTokens.forEach((aliasToken) => {
      if (fuzzyMatched) {
        return
      }
      queryTokens.forEach((queryToken) => {
        if (fuzzyMatched) {
          return
        }
        if (getFuzzyTokenScore(queryToken, aliasToken) >= 8) {
          fuzzyMatched = true
        }
      })
    })

    if (fuzzyMatched) {
      score += 9
      matches.push(`近似 ${alias}`)
    }
  })

  return {
    score,
    matchedAliases: matches.slice(0, 3),
    summaryText: matches.slice(0, 2).join(' · ')
  }
}

function buildCandidateSignalInsight(content, candidate = {}) {
  const currentText = safeText(content).toLowerCase()
  if (!currentText || currentText.length < 2) {
    return {
      score: 0,
      summaryText: ''
    }
  }

  const normalizedContent = normalizeHomophoneText(currentText)
  const queryTokens = buildChineseNgramTokens(currentText)
  const reasons = []
  let score = 0

  const pushReason = (points, text) => {
    const current = safeText(text)
    if (!current) {
      return
    }
    score += Number(points || 0)
    if (reasons.indexOf(current) < 0 && reasons.length < 3) {
      reasons.push(current)
    }
  }

  const matchFields = [
    { value: candidate.name, label: '项目', exact: 24, homophone: 18, fuzzy: 10, token: 8 },
    { value: candidate.client, label: '客户', exact: 18, homophone: 13, fuzzy: 8, token: 6 },
    { value: candidate.contactText, label: '联系人', exact: 14, homophone: 10, fuzzy: 6, token: 4 }
  ]

  matchFields.forEach(({ value, label, exact, homophone, fuzzy, token }) => {
    const fieldText = safeText(value).toLowerCase()
    if (!fieldText) {
      return
    }

    if (currentText.includes(fieldText)) {
      pushReason(exact, `${label}直命中`)
      return
    }

    if (normalizedContent.includes(normalizeHomophoneText(fieldText))) {
      pushReason(homophone, `${label}同音`)
      return
    }

    const fieldTokens = buildChineseNgramTokens(fieldText, 2, Math.min(8, fieldText.length || 8), 12)
    const directTokenHit = fieldTokens.find((fieldToken) => currentText.includes(fieldToken))
    if (directTokenHit) {
      pushReason(token, `${label}片段`)
      return
    }

    let fuzzyHit = false
    fieldTokens.forEach((fieldToken) => {
      if (fuzzyHit) {
        return
      }
      queryTokens.forEach((queryToken) => {
        if (fuzzyHit) {
          return
        }
        if (getFuzzyTokenScore(queryToken, fieldToken) >= 8) {
          fuzzyHit = true
        }
      })
    })

    if (fuzzyHit) {
      pushReason(fuzzy, `${label}近似`)
    }
  })

  const signalTerms = []
  ;(Array.isArray(candidate.voiceAliases) ? candidate.voiceAliases : []).forEach((item) => {
    const current = safeText(item)
    if (current && signalTerms.indexOf(current) < 0) {
      signalTerms.push(current)
    }
  })
  ;(Array.isArray(candidate.projectMemory) ? candidate.projectMemory : []).forEach((item) => {
    const current = safeText(item)
    if (current && signalTerms.indexOf(current) < 0) {
      signalTerms.push(current)
    }
  })

  signalTerms.slice(0, 12).forEach((term) => {
    const currentTerm = safeText(term).toLowerCase()
    if (!currentTerm) {
      return
    }

    if (currentText.includes(currentTerm)) {
      pushReason(16, `线索直命中 ${term}`)
      return
    }

    if (normalizedContent.includes(normalizeHomophoneText(currentTerm))) {
      pushReason(12, `线索同音 ${term}`)
      return
    }

    const termTokens = buildChineseNgramTokens(currentTerm, 2, Math.min(8, currentTerm.length || 8), 10)
    let fuzzyHit = false
    termTokens.forEach((termToken) => {
      if (fuzzyHit) {
        return
      }
      queryTokens.forEach((queryToken) => {
        if (fuzzyHit) {
          return
        }
        if (getFuzzyTokenScore(queryToken, termToken) >= 8) {
          fuzzyHit = true
        }
      })
    })
    if (fuzzyHit) {
      pushReason(8, `线索近似 ${term}`)
    }
  })

  return {
    score,
    summaryText: reasons.join(' · ')
  }
}

function buildDeterministicProjectFallback(candidates = []) {
  const list = Array.isArray(candidates) ? candidates : []
  const topCandidate = list[0] || null
  const secondCandidate = list[1] || null
  const topScore = Number(topCandidate && topCandidate.effectiveScore || 0)
  const secondScore = Number(secondCandidate && secondCandidate.effectiveScore || 0)

  if (!topCandidate || topScore < 34) {
    return null
  }

  if (secondCandidate && topScore - secondScore < 12) {
    return null
  }

  return {
    matchedProjectId: safeText(topCandidate.id),
    confidence: 'high',
    reason: normalizeCompactText(
      topCandidate.projectMemoryMatchText || topCandidate.cloudSignalMatchText || topCandidate.localMatchText || '当前内容与候选项目特征高度一致。',
      48
    ),
    candidateIds: list.slice(0, 5).map((item) => safeText(item.id)).filter(Boolean),
    sourceType: 'deterministic'
  }
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

function normalizeConfidence(value) {
  const current = safeText(value).toLowerCase()
  if (current === 'high' || current === 'medium' || current === 'low') {
    return current
  }
  return 'low'
}

function normalizeCandidate(item, index, memoryAliasesByProjectId = {}) {
  const id = safeText(item && item.id)
  if (!id) {
    return null
  }

  const projectMemory = Array.isArray(memoryAliasesByProjectId[id])
    ? memoryAliasesByProjectId[id].map((alias) => safeText(alias)).filter(Boolean).slice(0, 6)
    : []

  return {
    id,
    name: safeText(item && item.name, `候选项目 ${index + 1}`),
    client: safeText(item && item.client, '未填写客户'),
    voiceAliases: Array.isArray(item && item.voiceAliases)
      ? item.voiceAliases.map((alias) => safeText(alias)).filter(Boolean).slice(0, 8)
      : [],
    stage: safeText(item && item.stage, '线索'),
    latestSummary: normalizeCompactText(item && item.latestSummary, 60),
    focusText: normalizeCompactText(item && item.focusText, 40),
    nextText: normalizeCompactText(item && item.nextText, 40),
    contactText: normalizeCompactText(item && item.contactText, 36),
    localMatchText: normalizeCompactText(item && item.localMatchText, 72),
    localScore: Number(item && item.localScore) || 0,
    projectMemory,
    projectMemoryScore: 0,
    projectMemoryMatchText: '',
    cloudSignalScore: 0,
    cloudSignalMatchText: '',
    effectiveScore: Number(item && item.localScore) || 0
  }
}

function normalizeCandidates(value, memoryAliasesByProjectId = {}, content = '') {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .slice(0, 8)
    .map((item, index) => normalizeCandidate(item, index, memoryAliasesByProjectId))
    .map((item) => {
      const memoryInsight = buildProjectMemoryInsight(content, item.projectMemory)
      const signalInsight = buildCandidateSignalInsight(content, item)
      const effectiveScore = Number(item.localScore || 0)
        + Number(memoryInsight.score || 0)
        + Number(signalInsight.score || 0)
      return {
        ...item,
        projectMemoryScore: Number(memoryInsight.score || 0),
        projectMemoryMatchText: memoryInsight.summaryText,
        cloudSignalScore: Number(signalInsight.score || 0),
        cloudSignalMatchText: signalInsight.summaryText,
        effectiveScore
      }
    })
    .sort((left, right) => {
      if (right.effectiveScore !== left.effectiveScore) {
        return right.effectiveScore - left.effectiveScore
      }
      if (right.projectMemoryScore !== left.projectMemoryScore) {
        return right.projectMemoryScore - left.projectMemoryScore
      }
      if (right.cloudSignalScore !== left.cloudSignalScore) {
        return right.cloudSignalScore - left.cloudSignalScore
      }
      return right.localScore - left.localScore
    })
    .filter(Boolean)
}

function buildPrompt(content, candidates) {
  const candidateLines = candidates.map((item, index) => {
    const parts = [
      `${index + 1}. ID=${item.id}`,
      `项目=${item.name}`,
      `客户=${item.client}`,
      `阶段=${item.stage}`
    ]

    if (item.contactText) {
      parts.push(`联系人=${item.contactText}`)
    }
    if (item.voiceAliases && item.voiceAliases.length) {
      parts.push(`项目线索=${item.voiceAliases.join('/')}`)
    }
    if (item.projectMemory && item.projectMemory.length) {
      parts.push(`项目记忆=${item.projectMemory.join('/')}`)
    }
    if (item.projectMemoryMatchText) {
      parts.push(`记忆命中=${item.projectMemoryMatchText}`)
    }
    if (item.cloudSignalMatchText) {
      parts.push(`云端命中=${item.cloudSignalMatchText}`)
    }
    if (item.localMatchText) {
      parts.push(`本地命中=${item.localMatchText}`)
    }
    if (item.focusText) {
      parts.push(`当前重点=${item.focusText}`)
    }
    if (item.nextText) {
      parts.push(`下一步=${item.nextText}`)
    }
    if (item.latestSummary) {
      parts.push(`最近摘要=${item.latestSummary}`)
    }
    if (item.localScore) {
      parts.push(`本地召回分=${item.localScore}`)
    }
    if (item.effectiveScore) {
      parts.push(`综合召回分=${item.effectiveScore}`)
    }

    return parts.join('｜')
  }).join('\n')

  return `
请根据下面这条首页闪录内容，在候选项目里判断最可能对应的是哪一个项目。

闪录原文：
${content}

候选项目：
${candidateLines}

判断要求：
1. 你只能在以上候选项目中做判断，禁止虚构新项目，禁止输出候选列表外的 projectId
2. 先看客户名、项目名、联系人、人称线索，再看阶段、最近摘要和推进动作是否一致
3. 语音识别可能出现同音字或近音字，例如“制造/智造”，请结合上下文做判断
4. 如果证据非常明确，confidence 返回 high
5. 如果有一定倾向，但仍可能与别的候选混淆，confidence 返回 medium
6. 如果信息不足、多个候选都像、或无法稳定判断，confidence 返回 low
7. 当 confidence=low 时，matchedProjectId 必须返回空字符串
8. candidateIds 按你重排后的可能性从高到低输出，最多 5 个，且必须都来自候选项目
9. reason 用 1 句中文解释判断依据，控制在 40 字内，不要写模型、提示词、系统、CRM
10. 只返回合法 JSON，不要输出 markdown 代码块

返回 JSON，字段必须包含：
matchedProjectId
confidence
reason
candidateIds
`.trim()
}

function validatePayload(value, candidates) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI_INVALID_RESPONSE')
  }

  const candidateIdSet = new Set(candidates.map((item) => item.id))
  const fallbackCandidateIds = candidates.slice(0, 5).map((item) => item.id)
  const candidateIds = Array.isArray(value.candidateIds)
    ? value.candidateIds.reduce((result, item) => {
        const currentId = safeText(item)
        if (!currentId || !candidateIdSet.has(currentId) || result.indexOf(currentId) >= 0 || result.length >= 5) {
          return result
        }
        result.push(currentId)
        return result
      }, [])
    : []

  fallbackCandidateIds.forEach((item) => {
    if (candidateIds.length >= 5 || candidateIds.indexOf(item) >= 0) {
      return
    }
    candidateIds.push(item)
  })

  let matchedProjectId = safeText(value.matchedProjectId)
  if (!candidateIdSet.has(matchedProjectId)) {
    matchedProjectId = ''
  }

  let confidence = normalizeConfidence(value.confidence)
  if (!matchedProjectId && confidence !== 'low') {
    confidence = 'low'
  }
  if (confidence === 'low') {
    matchedProjectId = ''
  }

  const reason = normalizeCompactText(value.reason, 48) || (
    confidence === 'high'
      ? '当前内容与候选项目特征高度一致。'
      : confidence === 'medium'
        ? '当前内容更接近这些候选项目，仍建议手动确认。'
        : '当前内容不足以稳定判断具体项目。'
  )

  return {
    matchedProjectId,
    confidence,
    reason,
    candidateIds
  }
}

function normalizeAiError(error) {
  const message = safeText(error && error.message)
  if (!message) {
    return 'AI 项目匹配暂时不可用'
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
  const content = safeText(event && event.content)
  const requestId = safeText(event && event.requestId)
  const generatedAt = new Date().toISOString()
  const rawCandidates = Array.isArray(event && event.candidates) ? event.candidates : []
  const requestStartedAt = Date.now()
  let aiPolicy = null
  let accessContext = null
  let routeRuntime = null
  let effectiveRuntime = null
  let promptText = ''
  let traceId = ''
  let traceFallbackKey = ''
  let sourceId = requestId || generatedAt

  if (!content) {
    return {
      ok: false,
      message: 'content is required',
      errorType: 'AI_PROJECT_RESOLUTION_INPUT_INVALID'
    }
  }

  if (!rawCandidates.length) {
    return {
      ok: true,
      ...buildRecallSourceMeta(),
      generatedAt,
      matchedProjectId: '',
      confidence: 'low',
      reason: '当前内容还没有召回到明确候选项目，请手动确认。',
      candidateIds: []
    }
  }

  try {
    aiPolicy = await loadAiPolicy()
    if (!aiPolicy.route.enabled) {
      throw new Error('MODEL_ROUTE_DISABLED: 当前项目匹配模型路由未启用')
    }
    routeRuntime = resolveRouteRuntimeConfig(aiPolicy)
    accessContext = await resolveAiAccessContext(wxContext.OPENID)
    ensureAiAccess(accessContext, aiPolicy)
    traceFallbackKey = rawCandidates
      .map((item) => safeText(item && item.id))
      .filter(Boolean)
      .slice(0, 5)
      .join(',')
      || safeText(content).slice(0, 32)
      || generatedAt
    traceId = buildAiUsageTraceId(
      'quick_entry_project_match',
      accessContext.accountId,
      requestId,
      traceFallbackKey
    )
    sourceId = requestId || traceFallbackKey
    const projectMemoryMap = await loadProjectMemoryMap(
      accessContext.accountId,
      rawCandidates.map((item) => safeText(item && item.id))
    )
    const candidates = normalizeCandidates(rawCandidates, projectMemoryMap, content)
    if (!candidates.length) {
      return {
        ok: true,
        ...buildRecallSourceMeta(),
        generatedAt,
        matchedProjectId: '',
        confidence: 'low',
        reason: '当前内容还没有召回到明确候选项目，请手动确认。',
        candidateIds: []
      }
    }
    const deterministicFallback = buildDeterministicProjectFallback(candidates)
    promptText = buildPrompt(content, candidates)
    const execution = await runWithFallback(aiPolicy, routeRuntime, {
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: '你是销售闪录项目归属助手。你只判断这条跟进更像哪个候选项目，不能编造候选列表外的项目，证据不足时必须保守返回。只返回合法 JSON。'
        },
        {
          role: 'user',
          content: promptText
        }
      ]
    })
    const result = execution.result
    effectiveRuntime = execution.runtime

    let parsed = validatePayload(extractJson(result.text), candidates)
    if (deterministicFallback) {
      if (!parsed.matchedProjectId || parsed.confidence === 'low') {
        parsed = deterministicFallback
      } else if (parsed.candidateIds.indexOf(deterministicFallback.matchedProjectId) < 0) {
        parsed.candidateIds.unshift(deterministicFallback.matchedProjectId)
        parsed.candidateIds = parsed.candidateIds.slice(0, 5)
      }
    }

    const usageRecord = await consumeAiUsage({
      accountId: accessContext.accountId,
      entitlements: accessContext.entitlements,
      usage: result.usage || null,
      inputText: promptText,
      outputText: result.text,
      multiplier: getModelMultiplier(aiPolicy, effectiveRuntime),
      runtime: effectiveRuntime,
      sourceType: 'quick_entry_project_match',
      sourceId,
      traceId,
      routeKey: 'quick_entry_project',
      fallbackUsed: execution.fallbackUsed === true,
      primaryError: execution.primaryError || '',
      providerRequestId: '',
      pageKey: 'pages/index/index',
      occurredAt: new Date()
    })

    await appendUsageEvent({
      accountId: accessContext.accountId,
      sourceType: 'quick_entry_project_match',
      sourceId,
      traceId,
      eventKey: buildUsageEventKey('quick_entry_project_match', traceId, accessContext.accountId, traceFallbackKey, 'success'),
      eventStatus: 'success',
      projectId: safeText(parsed.matchedProjectId),
      pageKey: 'pages/index/index',
      routeKey: 'quick_entry_project',
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
      occurredAt: new Date()
    })

    return {
      ok: true,
      ...buildModelSourceMeta({
        provider: effectiveRuntime.provider,
        model: effectiveRuntime.model,
        providerLabel: effectiveRuntime.providerLabel
      }),
      generatedAt,
      matchedProjectId: parsed.matchedProjectId,
      confidence: parsed.confidence,
      reason: parsed.reason,
      candidateIds: parsed.candidateIds,
      usage: result.usage || null,
      billedTokens: usageRecord.billedTokens || 0,
      usageRecorded: usageRecord.skipped !== true,
      usageReused: usageRecord.reused === true,
      fallbackUsed: execution.fallbackUsed === true,
      primaryError: execution.primaryError || ''
    }
  } catch (error) {
    await appendUsageEvent({
      accountId: accessContext && accessContext.accountId,
      sourceType: 'quick_entry_project_match',
      sourceId,
      traceId,
      eventKey: buildUsageEventKey(
        'quick_entry_project_match',
        traceId,
        accessContext && accessContext.accountId,
        traceFallbackKey || sourceId,
        'failed'
      ),
      eventStatus: 'failed',
      projectId: '',
      pageKey: 'pages/index/index',
      routeKey: 'quick_entry_project',
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
      occurredAt: new Date()
    })
    return {
      ok: false,
      message: normalizeAiError(error),
      errorType: 'AI_PROJECT_RESOLUTION_FAILED'
    }
  }
}
