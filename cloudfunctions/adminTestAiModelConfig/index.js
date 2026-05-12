const cloud = require('wx-server-sdk')
const tcb = require('@cloudbase/node-sdk')
const https = require('https')
const http = require('http')
const { URL } = require('url')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const app = tcb.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  timeout: 55000
})
const ai = app.ai()
const db = cloud.database()

const AI_MODEL_ROUTING_FLAG_KEY = 'ai_model_routing_v1'
const DEFAULT_PROVIDER_KEY = 'cloudbase_default'
const ROUTE_KEYS = [
  'quick_entry_project',
  'followup_summary',
  'followup_next_action',
  'project_judgement',
  'project_review',
  'project_wake',
  'share_brief'
]
const DEFAULT_PROVIDER = {
  providerKey: DEFAULT_PROVIDER_KEY,
  providerType: 'cloudbase',
  protocolMode: 'auto',
  providerClass: 'fallback',
  commercialTier: 'default',
  visibleLabel: '腾讯云默认',
  displayName: 'CloudBase 默认',
  cloudbaseProvider: 'hunyuan-exp',
  baseURL: '',
  defaultModel: 'hunyuan-turbos-latest',
  apiKey: '',
  enabled: true
}
const DEFAULT_ROUTES = {
  quick_entry_project: {
    providerKey: DEFAULT_PROVIDER_KEY,
    provider: 'hunyuan-exp',
    model: 'hunyuan-turbos-latest',
    fallbackProviderKey: '',
    fallbackModel: '',
    enabled: true
  },
  followup_summary: {
    providerKey: DEFAULT_PROVIDER_KEY,
    provider: 'hunyuan-exp',
    model: 'hunyuan-turbos-latest',
    fallbackProviderKey: '',
    fallbackModel: '',
    enabled: true
  },
  followup_next_action: {
    providerKey: DEFAULT_PROVIDER_KEY,
    provider: 'hunyuan-exp',
    model: 'hunyuan-turbos-latest',
    fallbackProviderKey: '',
    fallbackModel: '',
    enabled: true
  },
  project_judgement: {
    providerKey: DEFAULT_PROVIDER_KEY,
    provider: 'hunyuan-exp',
    model: 'hunyuan-turbos-latest',
    fallbackProviderKey: '',
    fallbackModel: '',
    enabled: true
  },
  project_review: {
    providerKey: DEFAULT_PROVIDER_KEY,
    provider: 'hunyuan-exp',
    model: 'hunyuan-turbos-latest',
    fallbackProviderKey: '',
    fallbackModel: '',
    enabled: true
  },
  project_wake: {
    providerKey: DEFAULT_PROVIDER_KEY,
    provider: 'hunyuan-exp',
    model: 'hunyuan-turbos-latest',
    fallbackProviderKey: '',
    fallbackModel: '',
    enabled: true
  },
  share_brief: {
    providerKey: DEFAULT_PROVIDER_KEY,
    provider: 'hunyuan-exp',
    model: 'hunyuan-turbos-latest',
    fallbackProviderKey: '',
    fallbackModel: '',
    enabled: true
  }
}

function toText(value) {
  return String(value || '').trim()
}

function safeText(value, fallback = '') {
  const current = toText(value)
  return current || fallback
}

function normalizeUrl(value) {
  return toText(value).replace(/\/+$/, '')
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

function maskSecret(value) {
  const text = toText(value)
  if (!text) {
    return ''
  }
  if (text.length <= 8) {
    return `${text.slice(0, 2)}***`
  }
  return `${text.slice(0, 4)}***${text.slice(-4)}`
}

function normalizeRoute(value, fallback) {
  const source = value && typeof value === 'object' ? value : {}
  const base = fallback && typeof fallback === 'object' ? fallback : {}
  return {
    providerKey: safeText(source.providerKey || base.providerKey || DEFAULT_PROVIDER_KEY),
    provider: safeText(source.provider || base.provider || 'hunyuan-exp'),
    model: safeText(source.model || base.model || 'hunyuan-turbos-latest'),
    fallbackProviderKey: safeText(source.fallbackProviderKey || base.fallbackProviderKey || ''),
    fallbackModel: safeText(source.fallbackModel || base.fallbackModel || ''),
    enabled: source.enabled !== false
  }
}

function normalizeProtocolMode(value, fallback = 'auto') {
  const current = safeText(value || fallback)
  return ['auto', 'chat_completions', 'responses'].includes(current) ? current : 'auto'
}

function normalizeProvider(providerKey, value, fallback) {
  const source = value && typeof value === 'object' ? value : {}
  const base = fallback && typeof fallback === 'object' ? fallback : {}
  return {
    providerKey: safeText(providerKey || source.providerKey || base.providerKey || DEFAULT_PROVIDER_KEY),
    providerType: safeText(source.providerType || base.providerType) === 'openai_compatible' ? 'openai_compatible' : 'cloudbase',
    protocolMode: normalizeProtocolMode(source.protocolMode, base.protocolMode),
    providerClass: safeText(source.providerClass || base.providerClass || 'fallback'),
    commercialTier: safeText(source.commercialTier || base.commercialTier || 'default'),
    visibleLabel: safeText(source.visibleLabel || base.visibleLabel || base.displayName || providerKey),
    displayName: safeText(source.displayName || base.displayName || providerKey),
    cloudbaseProvider: safeText(source.cloudbaseProvider || base.cloudbaseProvider || 'hunyuan-exp'),
    baseURL: normalizeUrl(source.baseURL || base.baseURL || ''),
    defaultModel: safeText(source.defaultModel || base.defaultModel || 'hunyuan-turbos-latest'),
    apiKey: safeText(source.apiKey || base.apiKey || ''),
    enabled: source.enabled !== false
  }
}

function normalizeProviders(value) {
  const source = value && typeof value === 'object' ? value : {}
  const merged = {
    [DEFAULT_PROVIDER_KEY]: { ...DEFAULT_PROVIDER },
    ...source
  }
  const result = {}
  Object.keys(merged).forEach((providerKey) => {
    const fallback = providerKey === DEFAULT_PROVIDER_KEY ? DEFAULT_PROVIDER : merged[providerKey]
    result[providerKey] = normalizeProvider(providerKey, merged[providerKey], fallback)
  })
  return result
}

function normalizePolicy(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const providers = normalizeProviders(source.providers)
  const modelRouting = source.modelRouting && typeof source.modelRouting === 'object'
    ? source.modelRouting
    : {}
  const normalizedRouting = {}
  ROUTE_KEYS.forEach((routeKey) => {
    normalizedRouting[routeKey] = normalizeRoute(modelRouting[routeKey], DEFAULT_ROUTES[routeKey])
  })
  return {
    providers,
    modelRouting: normalizedRouting
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

async function getOperatorConfig() {
  const flag = await safeGetOne('featureFlags', {
    flagKey: 'billing_internal_operator_v1'
  })
  const payload = flag && flag.payload && typeof flag.payload === 'object' ? flag.payload : {}
  return {
    operatorKey: toText(payload.operatorKey),
    operatorId: toText(payload.operatorId || 'billing_internal'),
    enabled: flag ? flag.enabled !== false : false
  }
}

async function ensureOperatorAuthorized(operatorKey) {
  const config = await getOperatorConfig()
  if (!config.enabled || !config.operatorKey || config.operatorKey !== toText(operatorKey)) {
    throw new Error('BILLING_OPERATOR_FORBIDDEN: 当前无权执行 AI 配置测试')
  }
  return config
}

function resolveRuntimeConfig(policy, routeKeyInput) {
  const routeKey = ROUTE_KEYS.includes(routeKeyInput)
    ? routeKeyInput
    : 'followup_summary'
  const route = policy.modelRouting[routeKey] || DEFAULT_ROUTES[routeKey]
  const providerKey = safeText(route.providerKey || DEFAULT_PROVIDER_KEY)
  const providerConfig = policy.providers[providerKey] || policy.providers[DEFAULT_PROVIDER_KEY] || DEFAULT_PROVIDER
  if (providerConfig.enabled === false) {
    throw new Error(`MODEL_PROVIDER_DISABLED: 当前供应商(${providerKey})已停用`)
  }

  const runtime = {
    routeKey,
    providerKey,
    providerType: providerConfig.providerType,
    providerLabel: safeText(providerConfig.displayName || providerKey),
    protocolMode: normalizeProtocolMode(providerConfig.protocolMode, 'auto'),
    model: safeText(route.model || providerConfig.defaultModel || 'hunyuan-turbos-latest')
  }

  if (providerConfig.providerType === 'openai_compatible') {
    const baseURL = normalizeUrl(providerConfig.baseURL)
    const apiKey = safeText(providerConfig.apiKey)
    if (!baseURL || !apiKey) {
      throw new Error(`MODEL_PROVIDER_CONFIG_INVALID: 供应商(${providerKey})缺少 baseURL 或 apiKey`)
    }
    return {
      ...runtime,
      engine: 'openai_compatible',
      baseURL,
      apiKey
    }
  }

  return {
    ...runtime,
    engine: 'cloudbase',
    provider: safeText(route.provider || providerConfig.cloudbaseProvider || 'hunyuan-exp')
  }
}

function requestJson(options = {}, payload = null, timeoutMs = 15000) {
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

async function runOpenAiCompatibleProbe(runtimeConfig) {
  if (useResponsesApi(runtimeConfig)) {
    return runResponsesCompatibleProbe(runtimeConfig)
  }
  const url = new URL(`${runtimeConfig.baseURL}/chat/completions`)
  const requestPayload = {
    model: runtimeConfig.model,
    messages: [
      { role: 'system', content: '你是一个连通性测试助手。' },
      { role: 'user', content: '请回复：pong' }
    ],
    temperature: 0,
    max_tokens: 64
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
  }, requestBody, 15000)

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
    snippet: text.slice(0, 40),
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

async function runResponsesCompatibleProbe(runtimeConfig) {
  const url = new URL(`${runtimeConfig.baseURL}/responses`)
  const requestBody = JSON.stringify({
    model: runtimeConfig.model,
    instructions: '你是一个连通性测试助手。',
    input: buildResponsesInputFromMessages([
      { role: 'user', content: '请回复：pong' }
    ]),
    temperature: 0,
    max_output_tokens: 64
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
  }, requestBody, 15000)

  const text = extractResponsesOutputText(response)
  if (!text) {
    throw new Error('MODEL_PROVIDER_EMPTY_RESPONSE')
  }
  return {
    snippet: text.slice(0, 40),
    usage: response.usage || null
  }
}

async function runCloudBaseProbe(runtimeConfig) {
  const model = ai.createModel(runtimeConfig.provider)
  const result = await model.generateText({
    model: runtimeConfig.model,
    temperature: 0,
    messages: [
      { role: 'system', content: '你是一个连通性测试助手。' },
      { role: 'user', content: '请回复：pong' }
    ]
  })
  const text = safeText(result && result.text)
  if (!text) {
    throw new Error('MODEL_PROVIDER_EMPTY_RESPONSE')
  }
  return {
    snippet: text.slice(0, 40),
    usage: result && result.usage ? result.usage : null
  }
}

async function loadPolicy() {
  const flag = await safeGetOne('featureFlags', {
    flagKey: AI_MODEL_ROUTING_FLAG_KEY
  })
  if (!flag) {
    return {
      policy: normalizePolicy({}),
      source: 'default'
    }
  }
  return {
    policy: normalizePolicy(flag.payload),
    source: 'featureFlags.ai_model_routing_v1'
  }
}

exports.main = async (event = {}) => {
  const operator = await ensureOperatorAuthorized(event.operatorKey)
  const startedAt = Date.now()
  const routeKey = safeText(event.routeKey || 'followup_summary')
  const loaded = await loadPolicy()
  const runtimeConfig = resolveRuntimeConfig(loaded.policy, routeKey)
  const safeRuntime = {
    routeKey: runtimeConfig.routeKey,
    providerKey: runtimeConfig.providerKey,
    providerType: runtimeConfig.providerType,
    providerLabel: runtimeConfig.providerLabel,
    engine: runtimeConfig.engine,
    protocolMode: runtimeConfig.protocolMode || 'auto',
    model: runtimeConfig.model,
    provider: runtimeConfig.provider || '',
    baseURL: runtimeConfig.baseURL || '',
    apiKeyMasked: runtimeConfig.apiKey ? maskSecret(runtimeConfig.apiKey) : '',
    fallbackProviderKey: runtimeConfig.fallbackProviderKey || '',
    fallbackModel: runtimeConfig.fallbackModel || ''
  }

  try {
    const probeResult = runtimeConfig.engine === 'openai_compatible'
      ? await runOpenAiCompatibleProbe(runtimeConfig)
      : await runCloudBaseProbe(runtimeConfig)
    const elapsedMs = Date.now() - startedAt
    return {
      ok: true,
      operatorId: operator.operatorId,
      source: loaded.source,
      runtime: safeRuntime,
      elapsedMs,
      probe: {
        status: 'success',
        snippet: probeResult.snippet,
        usage: probeResult.usage || null
      }
    }
  } catch (error) {
    const elapsedMs = Date.now() - startedAt
    return {
      ok: false,
      operatorId: operator.operatorId,
      source: loaded.source,
      runtime: safeRuntime,
      elapsedMs,
      probe: {
        status: 'failed'
      },
      error: safeText(error && error.message || 'AI 配置测试失败'),
      code: safeText(error && error.code)
    }
  }
}
