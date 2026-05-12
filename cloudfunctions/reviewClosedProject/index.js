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
const AI_ROUTE_KEY = 'project_review'
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
const CLOSED_STAGES = ['成交', '流失']

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

  return value.map((item) => safeText(item)).filter(Boolean)
}

function dedupeStringArray(value, maxCount = 3) {
  const result = []
  const seen = new Set()

  normalizeStringArray(value).forEach((item) => {
    if (seen.has(item) || result.length >= maxCount) {
      return
    }
    seen.add(item)
    result.push(item)
  })

  return result
}

function isProjectIrrelevantItem(value) {
  const text = safeText(value)
  if (!text) {
    return false
  }

  return [
    /crm跟进整理助手/i,
    /crm 助手/i,
    /ai助手/i,
    /提示词/i,
    /prompt/i,
    /系统功能/i,
    /模型能力/i,
    /大模型/i,
    /工具本身/i,
    /产品需求/i
  ].some((pattern) => pattern.test(text))
}

function sanitizeList(value, maxCount = 3) {
  return dedupeStringArray(
    normalizeStringArray(value).filter((item) => !isProjectIrrelevantItem(item)),
    maxCount
  )
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

function buildTaskSummary(task) {
  const title = safeText(task && task.title, '未命名任务')
  const status = safeText(task && task.status)
  const dueDateText = safeText(task && task.dueDateText)
  const dueAt = task && task.dueAt ? formatDateTime(task.dueAt) : ''
  const resultSummary = safeText(task && task.resultSummary)
  const dueText = dueDateText || dueAt
  return `${title}${status ? `｜状态：${status}` : ''}${dueText ? `｜时间：${dueText}` : ''}${resultSummary ? `｜结果：${resultSummary}` : ''}`
}

async function getProjectContext(projectId, openid) {
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
        name: safeText(contact.name),
        role: safeText(contact.role)
      })).filter((contact) => contact.name)
    : []

  const [followResult, taskResult] = await Promise.all([
    db.collection('followUps').where({
      projectId,
      _openid: openid
    }).orderBy('followUpTime', 'desc').limit(10).get(),
    db.collection('tasks').where({
      projectId,
      _openid: openid,
      status: _.in(['pending', 'in_progress', 'done', 'canceled'])
    }).orderBy('updatedAt', 'desc').limit(8).get()
  ])

  return {
    projectName: safeText(project.projectName, '未命名项目'),
    clientName: safeText(project.clientName, '未填写客户'),
    stage: safeText(project.stage, '线索'),
    estimatedAmount: Number(project.estimatedAmount || 0) || 0,
    actualAmount: Number(project.actualAmount || 0) || 0,
    description: safeText(project.description, '暂无项目摘要'),
    contacts,
    recentFollowUps: (followResult.data || []).map((item) => ({
      time: formatDateTime(item.followUpTime || item.createdAt),
      method: safeText(item.method, '其他'),
      summary: safeText(item.aiSummary || item.content),
      highlights: normalizeStringArray(item.aiHighlights).slice(0, 3),
      risks: normalizeStringArray(item.aiRisks).slice(0, 3),
      stageChange: safeText(item.stageChange)
    })),
    recentTasks: (taskResult.data || []).map((item) => buildTaskSummary(item))
  }
}

function buildPrompt(context) {
  const contacts = context.contacts.length
    ? context.contacts.map((item) => `${item.name}${item.role ? `（${item.role}）` : ''}`).join('、')
    : '未提供'
  const recentFollowUps = context.recentFollowUps.length
    ? context.recentFollowUps.map((item, index) => {
        return `${index + 1}. ${item.time || '时间未填'}｜${item.method || '其他'}｜${item.summary || '暂无摘要'}${item.stageChange ? `｜阶段变化：${item.stageChange}` : ''}${item.highlights.length ? `｜进展：${item.highlights.join(' / ')}` : ''}${item.risks.length ? `｜风险：${item.risks.join(' / ')}` : ''}`
      }).join('\n')
    : '暂无最近时间线'
  const recentTasks = context.recentTasks.length
    ? context.recentTasks.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : '暂无推进任务记录'
  const stageSpecificRules = context.stage === '成交'
    ? `
成交复盘要求：
1. reviewOverview 写“过程简述”，用 60-100 字简要说明项目从什么背景、通过哪些关键节点走到成交；只写事实路径，不做长篇赞美
2. turningPoints 输出 1-3 条真正改变成交概率的节点；没有明确节点就返回空数组
3. effectiveActions 输出 2-3 条“成功原因”，必须解释为什么成交，而不是罗列做过什么；可包含价格合适、品牌认可、客户时机成熟、关系基础、方案匹配、关键人推动、竞品失误等
4. reusableLessons 输出 1-3 条“后续指导价值”，必须能指导下一单怎么做；如果本单主要靠运气、价格合适、品牌认可或客户窗口期，必须直说，不能硬提炼方法论
5. 如果记录不足以支撑强结论，可以写“当前记录不足以提炼稳定方法，成交更可能来自价格/品牌/客户窗口期等外部因素”
6. slowdownPoints、lossReasons 返回空数组
7. reactivationAdvice 返回空字符串
`.trim()
    : `
流失复盘要求：
1. reviewOverview 写“过程简述”，用 60-100 字简要说明项目从什么背景走到流失；只写事实路径，不做长篇解释
2. slowdownPoints 输出 1-3 条真正导致推进失速的节点；没有明确节点就返回空数组
3. lossReasons 输出 2-3 条“失败原因”，必须解释为什么失败；可包含预算不匹配、价格劣势、品牌不被认可、关键人缺失、时机不成熟、竞品占优、需求不强等
4. reactivationAdvice 写“后续指导价值”，用 1-2 句说明这次失败对后续项目推进有什么提醒；如果没有可复用价值，就直说“当前记录不足以提炼稳定经验”
5. turningPoints、effectiveActions、reusableLessons 返回空数组
`.trim()

  return `
请根据以下已经结束的项目信息，输出一份“项目 AI 复盘”结果。

项目名称：${context.projectName}
客户名称：${context.clientName}
当前阶段：${context.stage}
预计金额：${context.estimatedAmount || 0}
已签金额：${context.actualAmount || 0}
项目摘要：${context.description}
相关联系人：${contacts}
关键时间线：
${recentFollowUps}
任务记录：
${recentTasks}

${stageSpecificRules}

通用要求：
1. 只基于已提供信息复盘，不要虚构未出现的人名、金额、结论、动作或原因
2. 如果某件事已经发生或完成，不要写成未来动作
3. 分析对象是客户项目推进，不是 CRM 软件、AI 助手、提示词或系统功能本身
4. 严禁输出“持续跟进、加强沟通、沉淀经验、优化流程、提升能力、保持关注、及时响应”这类空泛废话
5. 每条原因必须落到具体业务因素；每条指导价值必须能让用户下一单采取或避免某个具体做法
6. 如果证据不足，不要强行总结成功学或失败学，直接说明“当前记录不足以提炼稳定经验”
7. 只返回合法 JSON，不要输出 markdown 代码块

返回 JSON，字段必须包含：
stage
reviewOverview
turningPoints
effectiveActions
reusableLessons
slowdownPoints
lossReasons
reactivationAdvice
`.trim()
}

function validatePayload(value, stage) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI_INVALID_RESPONSE')
  }

  const requiredFields = [
    'stage',
    'reviewOverview',
    'turningPoints',
    'effectiveActions',
    'reusableLessons',
    'slowdownPoints',
    'lossReasons',
    'reactivationAdvice'
  ]

  const hasAllFields = requiredFields.every((field) => Object.prototype.hasOwnProperty.call(value, field))
  if (!hasAllFields) {
    throw new Error('AI_INVALID_RESPONSE')
  }

  return {
    stage,
    reviewOverview: safeText(value.reviewOverview, stage === '成交' ? '当前项目已成交，建议结合时间线再补关键转折点。' : '当前项目已流失，建议结合时间线再补流失原因。'),
    turningPoints: stage === '成交' ? sanitizeList(value.turningPoints, 3) : [],
    effectiveActions: stage === '成交' ? sanitizeList(value.effectiveActions, 3) : [],
    reusableLessons: stage === '成交' ? sanitizeList(value.reusableLessons, 3) : [],
    slowdownPoints: stage === '流失' ? sanitizeList(value.slowdownPoints, 3) : [],
    lossReasons: stage === '流失' ? sanitizeList(value.lossReasons, 3) : [],
    reactivationAdvice: stage === '流失'
      ? safeText(value.reactivationAdvice, '当前记录不足以提炼稳定经验。')
      : ''
  }
}

function buildProjectReviewSnapshot(parsed, options = {}) {
  return {
    ...buildModelSourceMeta({
      provider: options.provider,
      model: options.model,
      providerLabel: options.providerLabel
    }),
    generatedAt: safeText(options.generatedAt),
    stage: parsed.stage,
    reviewOverview: parsed.reviewOverview,
    turningPoints: parsed.turningPoints,
    effectiveActions: parsed.effectiveActions,
    reusableLessons: parsed.reusableLessons,
    slowdownPoints: parsed.slowdownPoints,
    lossReasons: parsed.lossReasons,
    reactivationAdvice: parsed.reactivationAdvice
  }
}

function normalizeAiError(error) {
  const message = safeText(error && error.message)
  if (!message) {
    return 'AI 复盘暂时不可用'
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

  if (!projectId) {
    return {
      ok: false,
      message: 'projectId is required'
    }
  }

  try {
    aiPolicy = await loadAiPolicy()
    if (!aiPolicy.route.enabled) {
      throw new Error('MODEL_ROUTE_DISABLED: 当前项目复盘模型路由未启用')
    }
    routeRuntime = resolveRouteRuntimeConfig(aiPolicy)
    accessContext = await resolveAiAccessContext(wxContext.OPENID)
    ensureAiAccess(accessContext, aiPolicy)
    accountId = safeText(
      accessContext.account && accessContext.account.accountId,
      safeText(accessContext.entitlements && accessContext.entitlements.accountId, '')
    )
    traceId = buildAiUsageTraceId('project_review', accountId, requestId, projectId)
    const context = await getProjectContext(projectId, wxContext.OPENID)
    if (!context) {
      return {
        ok: false,
        message: 'project not found'
      }
    }

    if (!CLOSED_STAGES.includes(context.stage)) {
      return {
        ok: false,
        message: '当前项目请使用项目研判'
      }
    }

    promptText = buildPrompt(context)
    const execution = await runWithFallback(aiPolicy, routeRuntime, {
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: '你是销售项目复盘助手。你只复盘已经成交或流失的客户项目，不评价 CRM 软件、AI 助手、提示词或系统功能。时间线和任务记录是主依据，不要虚构事实，文风保持正式、克制、轻商务，只返回合法 JSON。'
        },
        {
          role: 'user',
          content: promptText
        }
      ]
    })
    const result = execution.result
    effectiveRuntime = execution.runtime

    const parsed = validatePayload(extractJson(result.text), context.stage)
    const usageRecord = await consumeAiUsage({
      accountId,
      entitlements: accessContext.entitlements,
      usage: result.usage || null,
      inputText: promptText,
      outputText: result.text,
      multiplier: getModelMultiplier(aiPolicy, effectiveRuntime),
      runtime: effectiveRuntime,
      sourceType: 'project_review',
      sourceId,
      traceId,
      routeKey: AI_ROUTE_KEY,
      fallbackUsed: execution.fallbackUsed === true,
      primaryError: execution.primaryError || '',
      providerRequestId: '',
      pageKey: 'pages/projects/projects',
      projectId,
      occurredAt
    })

    await appendUsageEvent({
      accountId,
      sourceType: 'project_review',
      sourceId,
      traceId,
      eventKey: buildUsageEventKey('project_review', traceId, accountId, projectId, 'success'),
      eventStatus: 'success',
      projectId,
      pageKey: 'pages/projects/projects',
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

    const reviewSnapshot = buildProjectReviewSnapshot(parsed, {
      provider: effectiveRuntime.provider,
      model: effectiveRuntime.model,
      providerLabel: effectiveRuntime.providerLabel,
      generatedAt
    })
    let reviewSaved = true

    try {
      await db.collection('projects').doc(projectId).update({
        data: {
          aiReview: reviewSnapshot,
          aiReviewUpdatedAt: occurredAt
        }
      })
    } catch (error) {
      reviewSaved = false
    }

    return {
      ok: true,
      ...reviewSnapshot,
      reviewSaved,
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
      sourceType: 'project_review',
      sourceId,
      traceId,
      eventKey: buildUsageEventKey('project_review', traceId, accountId, projectId, 'failed'),
      eventStatus: 'failed',
      projectId,
      pageKey: 'pages/projects/projects',
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
      errorType: 'AI_PROJECT_REVIEW_FAILED'
    }
  }
}
