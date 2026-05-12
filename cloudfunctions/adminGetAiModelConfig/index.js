const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const ROUTE_KEYS = [
  'quick_entry_project',
  'followup_summary',
  'followup_next_action',
  'project_judgement',
  'project_review',
  'project_wake',
  'share_brief'
]

const DEFAULT_PAYLOAD = {
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
      modelPricing: {
        'hunyuan-turbos-latest': {
          multiplier: 1
        }
      },
      apiKey: '',
      enabled: true
    },
    openai_primary: {
      providerKey: 'openai_primary',
      providerType: 'openai_compatible',
      protocolMode: 'auto',
      providerClass: 'international',
      commercialTier: 'premium',
      visibleLabel: '国际模型',
      displayName: 'OpenAI 兼容主通道',
      cloudbaseProvider: '',
      baseURL: 'https://api.openai.com/v1',
      defaultModel: 'gpt-5.4-mini',
      modelPricing: {
        'gpt-5.4-mini': {
          multiplier: 1
        }
      },
      apiKey: '',
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
      modelPricing: {
        'deepseek-v4-flash': {
          multiplier: 1
        }
      },
      apiKey: '',
      enabled: false
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
      modelPricing: {
        'qwen-max': {
          multiplier: 1
        }
      },
      apiKey: '',
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
      modelPricing: {
        'glm-4.5': {
          multiplier: 1
        }
      },
      apiKey: '',
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
      modelPricing: {
        'kimi-k2': {
          multiplier: 1
        }
      },
      apiKey: '',
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

function toText(value) {
  return String(value || '').trim()
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeUrl(value) {
  return toText(value).replace(/\/+$/, '')
}

function maskApiKey(value) {
  const text = toText(value)
  if (!text) {
    return ''
  }
  if (text.length <= 8) {
    return `${text.slice(0, 2)}***`
  }
  return `${text.slice(0, 4)}***${text.slice(-4)}`
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
    throw new Error('BILLING_OPERATOR_FORBIDDEN: 当前无权读取模型配置')
  }
  return config
}

function normalizeRoute(value, fallback) {
  const source = value && typeof value === 'object' ? value : {}
  const provider = toText(source.provider || fallback.provider || 'hunyuan-exp')
  const model = toText(source.model || fallback.model || 'hunyuan-turbos-latest')
  return {
    providerKey: toText(source.providerKey || fallback.providerKey || 'cloudbase_default'),
    provider,
    model,
    fallbackProviderKey: toText(source.fallbackProviderKey || fallback.fallbackProviderKey || ''),
    fallbackModel: toText(source.fallbackModel || fallback.fallbackModel || ''),
    enabled: source.enabled !== false
  }
}

function normalizeProtocolMode(value, fallback = 'auto') {
  const current = toText(value || fallback)
  return ['auto', 'chat_completions', 'responses'].includes(current) ? current : 'auto'
}

function normalizeModelPricingEntries(value) {
  const result = []
  const seen = new Set()
  const appendEntry = (modelName, rawValue) => {
    const model = toText(modelName)
    if (!model || seen.has(model)) {
      return
    }
    const node = rawValue && typeof rawValue === 'object' ? rawValue : {}
    const multiplier = Number(
      rawValue && typeof rawValue === 'number'
        ? rawValue
        : (node.multiplier)
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

function buildModelPricingObject(value) {
  const result = {}
  normalizeModelPricingEntries(value).forEach((item) => {
    result[item.model] = {
      multiplier: item.multiplier
    }
  })
  return result
}

function normalizeProvider(providerKey, value, fallback) {
  const source = value && typeof value === 'object' ? value : {}
  const defaultProvider = fallback && typeof fallback === 'object' ? fallback : {}
  const providerType = toText(source.providerType || defaultProvider.providerType) === 'openai_compatible'
    ? 'openai_compatible'
    : 'cloudbase'
  const modelPricingSource = Array.isArray(source.modelPricingItems)
    ? source.modelPricingItems
    : (source.modelPricing && typeof source.modelPricing === 'object'
      ? source.modelPricing
      : (Array.isArray(defaultProvider.modelPricingItems)
        ? defaultProvider.modelPricingItems
        : (defaultProvider.modelPricing && typeof defaultProvider.modelPricing === 'object' ? defaultProvider.modelPricing : {})))
  const normalizedModelPricing = buildModelPricingObject(modelPricingSource)
  return {
    providerKey,
    providerType,
    protocolMode: normalizeProtocolMode(source.protocolMode, defaultProvider.protocolMode),
    providerClass: toText(source.providerClass || defaultProvider.providerClass || 'fallback'),
    commercialTier: toText(source.commercialTier || defaultProvider.commercialTier || 'default'),
    visibleLabel: toText(source.visibleLabel || defaultProvider.visibleLabel || defaultProvider.displayName || providerKey),
    displayName: toText(source.displayName || defaultProvider.displayName || providerKey),
    cloudbaseProvider: toText(source.cloudbaseProvider || defaultProvider.cloudbaseProvider || 'hunyuan-exp'),
    baseURL: normalizeUrl(source.baseURL || defaultProvider.baseURL || ''),
    defaultModel: toText(source.defaultModel || defaultProvider.defaultModel || 'hunyuan-turbos-latest'),
    modelPricing: normalizedModelPricing,
    apiKey: toText(source.apiKey || defaultProvider.apiKey || ''),
    enabled: source.enabled !== false
  }
}

function normalizeProviders(value) {
  const source = value && typeof value === 'object' ? value : {}
  const merged = {
    ...DEFAULT_PAYLOAD.providers,
    ...source
  }
  const result = {}
  Object.keys(merged).forEach((providerKey) => {
    result[providerKey] = normalizeProvider(
      providerKey,
      merged[providerKey],
      DEFAULT_PAYLOAD.providers[providerKey]
    )
  })
  return result
}

function sanitizeProvidersForOutput(providers = {}) {
  const result = {}
  Object.keys(providers).forEach((providerKey) => {
    const provider = providers[providerKey]
    const modelPricing = buildModelPricingObject(
      Array.isArray(provider && provider.modelPricingItems)
        ? provider.modelPricingItems
        : (provider && provider.modelPricing)
    )
    result[providerKey] = {
      providerKey: provider.providerKey,
      providerType: provider.providerType,
      protocolMode: provider.protocolMode,
      providerClass: provider.providerClass,
      commercialTier: provider.commercialTier,
      visibleLabel: provider.visibleLabel,
      displayName: provider.displayName,
      cloudbaseProvider: provider.cloudbaseProvider,
      baseURL: provider.baseURL,
      defaultModel: provider.defaultModel,
      modelPricing,
      enabled: provider.enabled !== false,
      hasApiKey: Boolean(toText(provider.apiKey)),
      apiKeyMasked: maskApiKey(provider.apiKey)
    }
  })
  return result
}

function normalizePayload(value) {
  const source = value && typeof value === 'object' ? value : {}
  const routing = source.modelRouting && typeof source.modelRouting === 'object'
    ? source.modelRouting
    : {}
  const providers = normalizeProviders(source.providers)
  const normalizedRouting = {}
  ROUTE_KEYS.forEach((routeKey) => {
    normalizedRouting[routeKey] = normalizeRoute(
      routing[routeKey],
      DEFAULT_PAYLOAD.modelRouting[routeKey]
    )
  })
  return {
    quotaPolicy: toText(source.quotaPolicy) === 'provider_plan' ? 'provider_plan' : 'local_quota',
    providers,
    modelRouting: normalizedRouting
  }
}

exports.main = async (event = {}) => {
  const operatorConfig = await ensureOperatorAuthorized(event.operatorKey)
  const flag = await safeGetOne('featureFlags', {
    flagKey: 'ai_model_routing_v1'
  })

  const payload = normalizePayload(flag && flag.payload)
  return {
    ok: true,
    operatorId: operatorConfig.operatorId,
    config: {
      ...payload,
      providers: sanitizeProvidersForOutput(payload.providers)
    },
    source: flag ? 'featureFlags.ai_model_routing_v1' : 'default'
  }
}
