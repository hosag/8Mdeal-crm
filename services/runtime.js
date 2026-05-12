const cloudConfig = require('../config/cloud')

let initialized = false

function hasCloud() {
  return typeof wx !== 'undefined' && !!wx.cloud
}

function isRealEnvId(envId) {
  return !!envId && envId !== 'YOUR_CLOUD_ENV_ID'
}

function getCloudStatus() {
  if (!hasCloud()) {
    return {
      ready: false,
      useCloud: false,
      label: 'Mock Demo · 基础库不支持',
      reason: '当前环境未检测到 wx.cloud'
    }
  }

  if (cloudConfig.useMock) {
    return {
      ready: false,
      useCloud: false,
      label: 'Mock Demo · 已开启模拟数据',
      reason: 'config/cloud.js 中 useMock 为 true'
    }
  }

  if (!isRealEnvId(cloudConfig.envId)) {
    return {
      ready: false,
      useCloud: false,
      label: 'Mock Demo · 待填写 Env ID',
      reason: 'config/cloud.js 中 envId 仍是占位值'
    }
  }

  return {
    ready: true,
    useCloud: true,
    label: 'CloudBase 已连接',
    reason: '云环境配置满足初始化条件'
  }
}

function canUseCloud() {
  return getCloudStatus().useCloud
}

function initCloud() {
  const status = getCloudStatus()

  if (!hasCloud()) {
    return false
  }

  if (!initialized) {
    wx.cloud.init({
      env: isRealEnvId(cloudConfig.envId) ? cloudConfig.envId : undefined,
      traceUser: cloudConfig.traceUser
    })
    initialized = true
  }

  return status.ready
}

function clone(data) {
  return JSON.parse(JSON.stringify(data))
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function extractErrorMessage(error) {
  if (!error) {
    return ''
  }

  if (typeof error === 'string') {
    return error
  }

  return String(error.errMsg || error.message || error.reason || '').trim()
}

function normalizeCloudError(error) {
  const rawMessage = extractErrorMessage(error)

  if (!rawMessage) {
    return new Error('云端请求失败，请稍后重试')
  }

  if (rawMessage.includes('CloudBase unavailable')) {
    return new Error('云环境未连接，请先确认开发者工具已连接 CloudBase')
  }

  if (/timeout|timed out|超时/i.test(rawMessage)) {
    return new Error('云端请求超时，请稍后重试')
  }

  const businessMappings = [
    {
      pattern: /FunctionName parameter could not be found|FUNCTION_NOT_FOUND|找不到.*云函数|云函数.*不存在/i,
      code: 'FUNCTION_NOT_FOUND',
      message: '相关云函数尚未部署到当前环境，请先上传并部署后再重试'
    },
    {
      pattern: /ACCOUNT_NOT_INITIALIZED/i,
      code: 'ACCOUNT_NOT_INITIALIZED',
      message: '账号初始化失败，请退出后重试'
    },
    {
      pattern: /ACCOUNT_PHONE_REQUIRED/i,
      code: 'ACCOUNT_PHONE_REQUIRED',
      message: '请先绑定手机号后再继续'
    },
    {
      pattern: /ENTITLEMENT_WRITE_DISABLED/i,
      code: 'ENTITLEMENT_WRITE_DISABLED',
      message: '当前账号为只读状态，暂时无法继续保存'
    },
    {
      pattern: /ENTITLEMENT_PROJECT_LIMIT_REACHED/i,
      code: 'ENTITLEMENT_PROJECT_LIMIT_REACHED',
      message: '当前项目数量已达上限，请开通套餐后继续新增'
    },
    {
      pattern: /ENTITLEMENT_SPEECH_EXHAUSTED/i,
      code: 'ENTITLEMENT_SPEECH_EXHAUSTED',
      message: '当前语音额度已用完，请购买语音时长包后重试'
    },
    {
      pattern: /ENTITLEMENT_AI_EXHAUSTED/i,
      code: 'ENTITLEMENT_AI_EXHAUSTED',
      message: '当前 AI 额度已用完，请购买 AI 额度包后重试'
    },
    {
      pattern: /ENTITLEMENT_SHARE_OUT_DISABLED/i,
      code: 'ENTITLEMENT_SHARE_OUT_DISABLED',
      message: '当前套餐暂不支持项目外发'
    },
    {
      pattern: /REFERRAL_CODE_INVALID/i,
      code: 'REFERRAL_CODE_INVALID',
      message: '推荐链接已失效'
    },
    {
      pattern: /REFERRAL_CODE_CREATE_FAILED/i,
      code: 'REFERRAL_CODE_CREATE_FAILED',
      message: '推荐码生成失败，请稍后重试'
    },
    {
      pattern: /REFERRAL_COLLECTION_NOT_READY/i,
      code: 'REFERRAL_COLLECTION_NOT_READY',
      message: '推荐功能数据表未就绪，请先创建 referralCodes 和 referralRelations 集合'
    },
    {
      pattern: /REFERRAL_INVITEE_NOT_NEW/i,
      code: 'REFERRAL_INVITEE_NOT_NEW',
      message: '当前账号已使用过项目功能，不参与新用户推荐奖励'
    },
    {
      pattern: /BILLING_PRODUCT_NOT_FOUND/i,
      code: 'BILLING_PRODUCT_NOT_FOUND',
      message: '当前商品未配置，请稍后重试'
    },
    {
      pattern: /BILLING_ORDER_UNAVAILABLE/i,
      code: 'BILLING_ORDER_UNAVAILABLE',
      message: '当前暂时无法创建订单，请稍后重试'
    },
    {
      pattern: /BILLING_ORDER_NOT_FOUND/i,
      code: 'BILLING_ORDER_NOT_FOUND',
      message: '当前订单不存在或已无权查看'
    },
    {
      pattern: /BILLING_ORDER_STATUS_INVALID/i,
      code: 'BILLING_ORDER_STATUS_INVALID',
      message: '当前订单状态不支持继续发起支付'
    },
    {
      pattern: /BILLING_PAYMENT_PREPARE_UNAVAILABLE/i,
      code: 'BILLING_PAYMENT_PREPARE_UNAVAILABLE',
      message: '当前暂时无法准备支付，请稍后重试'
    },
    {
      pattern: /BILLING_ORDER_TRANSITION_UNAVAILABLE/i,
      code: 'BILLING_ORDER_TRANSITION_UNAVAILABLE',
      message: '当前暂时无法更新订单状态，请稍后重试'
    },
    {
      pattern: /BILLING_OPERATOR_FORBIDDEN/i,
      code: 'BILLING_OPERATOR_FORBIDDEN',
      message: '当前无权执行内部到账操作'
    },
    {
      pattern: /ACCOUNT_DISABLED/i,
      code: 'ACCOUNT_DISABLED',
      message: '当前账号已被禁用，请联系管理员处理'
    }
  ]

  const businessMatch = businessMappings.find((item) => item.pattern.test(rawMessage))
  if (businessMatch) {
    const normalized = new Error(businessMatch.message)
    normalized.code = businessMatch.code
    normalized.rawMessage = rawMessage
    return normalized
  }

  if (
    /Failed to fetch|request:fail|network|Network Error|ERR_INTERNET|abort|socket/i.test(rawMessage)
  ) {
    const normalized = new Error('网络连接异常，请检查网络后重试')
    normalized.code = 'NETWORK_ERROR'
    normalized.rawMessage = rawMessage
    return normalized
  }

  return error instanceof Error ? error : new Error(rawMessage)
}

async function callCloudFunction(name, data = {}) {
  if (!canUseCloud()) {
    throw normalizeCloudError(new Error('CloudBase unavailable'))
  }

  try {
    const result = await wx.cloud.callFunction({
      name,
      data
    })

    return result.result
  } catch (error) {
    throw normalizeCloudError(error)
  }
}

module.exports = {
  canUseCloud,
  initCloud,
  callCloudFunction,
  clone,
  wait,
  getCloudStatus
}
