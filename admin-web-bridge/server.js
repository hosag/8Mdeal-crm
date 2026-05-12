const http = require('http')
const { URL } = require('url')
const tcb = require('@cloudbase/node-sdk')

const cloudConfig = require('../config/cloud')

const PORT = normalizePort(process.env.ADMIN_WEB_BRIDGE_PORT, 8788)
const HOST = process.env.ADMIN_WEB_BRIDGE_HOST || '127.0.0.1'
const REQUEST_TIMEOUT_MS = normalizeNumber(process.env.ADMIN_WEB_BRIDGE_TIMEOUT_MS, 15000)

const ROUTE_MAP = {
  '/adminListUsers': 'adminListUsers',
  '/adminListOrders': 'adminListOrders',
  '/adminListUsage': 'adminListUsage',
  '/adminListAuditLogs': 'adminListAuditLogs',
  '/adminListManualAdjustments': 'adminListAuditLogs',
  '/adminListFeedback': 'adminListFeedback',
  '/adminListReferrals': 'adminListReferrals',
  '/adminUpdateFeedback': 'adminUpdateFeedback',
  '/adminGetAiModelConfig': 'adminGetAiModelConfig',
  '/adminUpdateAiModelConfig': 'adminUpdateAiModelConfig',
  '/adminTestAiModelConfig': 'adminTestAiModelConfig',
  '/adminUpdateEntitlements': 'adminUpdateEntitlements',
  '/adminUpsertPlan': 'adminUpsertPlan',
  '/updateBillingOrderStatus': 'updateBillingOrderStatus',
  '/handleBillingPaymentCallback': 'handleBillingPaymentCallback'
}

function toText(value) {
  return String(value || '').trim()
}

function normalizeNumber(value, fallback) {
  const current = Number(value)
  return Number.isFinite(current) ? current : fallback
}

function normalizePort(value, fallback) {
  const current = Number(value)
  if (!Number.isFinite(current) || current <= 0) {
    return fallback
  }
  return Math.floor(current)
}

function extractAuthConfig() {
  const envId = toText(process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV || cloudConfig.envId)
  const secretId = toText(
    process.env.CLOUDBASE_SECRET_ID ||
    process.env.TENCENTCLOUD_SECRETID ||
    process.env.SECRETID
  )
  const secretKey = toText(
    process.env.CLOUDBASE_SECRET_KEY ||
    process.env.TENCENTCLOUD_SECRETKEY ||
    process.env.SECRETKEY
  )

  const initConfig = {
    env: envId,
    timeout: REQUEST_TIMEOUT_MS
  }

  let authMode = 'default_env'

  if (secretId && secretKey) {
    initConfig.secretId = secretId
    initConfig.secretKey = secretKey
    authMode = 'secret_pair'
  }

  return {
    envId,
    canInvoke: Boolean(secretId && secretKey),
    authMode,
    initConfig
  }
}

const sdkConfig = extractAuthConfig()
const app = tcb.init(sdkConfig.initConfig)

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Admin-Bridge-Key')
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res)
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 1024 * 1024) {
        reject(new Error('请求体过大，已拒绝处理'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!raw) {
        resolve({})
        return
      }

      try {
        resolve(JSON.parse(raw))
      } catch (error) {
        reject(new Error('请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

function ensureBridgeAuthorized(req, parsedUrl) {
  const expectedKey = toText(process.env.ADMIN_WEB_BRIDGE_KEY)
  if (!expectedKey) {
    return
  }

  const headerKey = toText(req.headers['x-admin-bridge-key'])
  const queryKey = toText(parsedUrl.searchParams.get('bridgeKey'))
  if (headerKey !== expectedKey && queryKey !== expectedKey) {
    const error = new Error('当前无权访问本地 bridge')
    error.statusCode = 403
    error.code = 'BRIDGE_FORBIDDEN'
    throw error
  }
}

function sanitizePayload(body) {
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {}
}

function normalizeError(error) {
  const message = toText(error && (error.message || error.errMsg || error.reason)) || '本地 bridge 调用失败'
  return {
    ok: false,
    error: message,
    code: toText(error && error.code),
    requestId: toText(error && error.requestId)
  }
}

async function handleHealth(req, res) {
  sendJson(res, 200, {
    ok: true,
    service: 'admin-web-bridge',
    envId: sdkConfig.envId,
    canInvoke: sdkConfig.canInvoke,
    authMode: sdkConfig.authMode,
    routes: Object.keys(ROUTE_MAP),
    bridgeProtected: Boolean(toText(process.env.ADMIN_WEB_BRIDGE_KEY))
  })
}

async function handleInvoke(req, res, parsedUrl) {
  ensureBridgeAuthorized(req, parsedUrl)

  if (!sdkConfig.canInvoke) {
    sendJson(res, 503, {
      ok: false,
      error: '本地 bridge 尚未配置 CLOUDBASE_SECRET_ID / CLOUDBASE_SECRET_KEY，暂时无法调用管理云函数',
      code: 'BRIDGE_CREDENTIALS_MISSING'
    })
    return
  }

  const functionName = ROUTE_MAP[parsedUrl.pathname]
  if (!functionName) {
    sendJson(res, 404, {
      ok: false,
      error: '当前路径未配置对应的管理云函数'
    })
    return
  }

  const body = sanitizePayload(await readJsonBody(req))
  let invokeResult = null

  try {
    invokeResult = await app.callFunction({
      name: functionName,
      data: body
    }, {
      timeout: REQUEST_TIMEOUT_MS
    })
  } catch (error) {
    const statusCode = toText(error && error.code) === 'INVALID_PARAM' ? 503 : 500
    sendJson(res, statusCode, normalizeError(error))
    return
  }

  const result = invokeResult && typeof invokeResult.result === 'object'
    ? invokeResult.result
    : { ok: true, result: invokeResult.result }

  sendJson(res, 200, {
    requestId: toText(invokeResult && invokeResult.requestId),
    ...result
  })
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`)

    if (req.method === 'OPTIONS') {
      setCorsHeaders(res)
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/healthz') {
      await handleHealth(req, res)
      return
    }

    if (req.method === 'POST') {
      await handleInvoke(req, res, parsedUrl)
      return
    }

    sendJson(res, 405, {
      ok: false,
      error: '当前请求方法不受支持'
    })
  } catch (error) {
    const statusCode = normalizeNumber(error && error.statusCode, 500)
    sendJson(res, statusCode, normalizeError(error))
  }
})

server.listen(PORT, HOST, () => {
  const protectedHint = toText(process.env.ADMIN_WEB_BRIDGE_KEY) ? '已开启 bridgeKey 保护' : '未开启 bridgeKey 保护'
  console.log(`[admin-web-bridge] listening on http://${HOST}:${PORT}`)
  console.log(`[admin-web-bridge] envId=${sdkConfig.envId || '未配置'} authMode=${sdkConfig.authMode} ${protectedHint}`)
})
