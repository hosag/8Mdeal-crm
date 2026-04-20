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

  if (
    /Failed to fetch|request:fail|network|Network Error|ERR_INTERNET|abort|socket/i.test(rawMessage)
  ) {
    return new Error('网络连接异常，请检查网络后重试')
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
