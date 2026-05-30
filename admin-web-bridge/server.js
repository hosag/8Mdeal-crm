const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { URL } = require('url')
const tcb = require('@cloudbase/node-sdk')

const cloudConfig = require('../config/cloud')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const STATIC_ROOT = path.join(PROJECT_ROOT, 'admin-web')
const ENV_FILE = path.join(__dirname, '.env.local')

loadLocalEnv(ENV_FILE)

const PORT = normalizePort(process.env.ADMIN_WEB_BRIDGE_PORT, 8788)
const HOST = process.env.ADMIN_WEB_BRIDGE_HOST || '127.0.0.1'
const REQUEST_TIMEOUT_MS = normalizeNumber(process.env.ADMIN_WEB_BRIDGE_TIMEOUT_MS, 15000)
const SESSION_TTL_SECONDS = normalizeNumber(process.env.ADMIN_SESSION_TTL_SECONDS, 8 * 60 * 60)
const SESSION_COOKIE_NAME = 'deal_crm_admin_session'
const SESSION_SECRET = toText(process.env.ADMIN_SESSION_SECRET) || crypto.randomBytes(32).toString('hex')

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

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
}

const sessions = new Map()

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return
  }

  const raw = fs.readFileSync(filePath, 'utf8')
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      return
    }

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) {
      return
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    let value = trimmed.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!process.env[key]) {
      process.env[key] = value
    }
  })
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

function getExpectedAdminUsername() {
  return toText(process.env.ADMIN_USERNAME || 'admin')
}

function getExpectedPasswordHash() {
  return toText(process.env.ADMIN_PASSWORD_HASH)
}

function getOperatorKey() {
  return toText(process.env.ADMIN_OPERATOR_KEY)
}

function isAdminAuthConfigured() {
  return Boolean(getExpectedAdminUsername() && getExpectedPasswordHash())
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(toText(left))
  const rightBuffer = Buffer.from(toText(right))
  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function hashSha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex')
}

function verifyPbkdf2Password(password, passwordHash) {
  const parts = passwordHash.split(':')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2sha256') {
    return false
  }

  const iterations = Number(parts[1])
  const salt = parts[2]
  const expected = parts[3]
  if (!Number.isFinite(iterations) || iterations <= 0 || !salt || !expected) {
    return false
  }

  const actual = crypto.pbkdf2Sync(String(password || ''), Buffer.from(salt, 'hex'), iterations, 32, 'sha256').toString('hex')
  return timingSafeEqualText(actual, expected)
}

function verifyPassword(password, passwordHash) {
  const currentHash = toText(passwordHash)
  if (!currentHash) {
    return false
  }

  if (currentHash.startsWith('pbkdf2sha256:')) {
    return verifyPbkdf2Password(password, currentHash)
  }

  if (currentHash.startsWith('sha256:')) {
    return timingSafeEqualText(hashSha256(password), currentHash.slice('sha256:'.length))
  }

  return false
}

function parseCookies(req) {
  const rawCookie = toText(req.headers.cookie)
  if (!rawCookie) {
    return {}
  }

  return rawCookie.split(';').reduce((cookies, item) => {
    const separatorIndex = item.indexOf('=')
    if (separatorIndex <= 0) {
      return cookies
    }
    const key = item.slice(0, separatorIndex).trim()
    const value = item.slice(separatorIndex + 1).trim()
    cookies[key] = decodeURIComponent(value)
    return cookies
  }, {})
}

function signSessionId(sessionId) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(sessionId).digest('hex')
}

function packSessionCookie(sessionId) {
  return `${sessionId}.${signSessionId(sessionId)}`
}

function unpackSessionCookie(value) {
  const current = toText(value)
  const separatorIndex = current.lastIndexOf('.')
  if (separatorIndex <= 0) {
    return ''
  }

  const sessionId = current.slice(0, separatorIndex)
  const signature = current.slice(separatorIndex + 1)
  if (!timingSafeEqualText(signSessionId(sessionId), signature)) {
    return ''
  }

  return sessionId
}

function createSession(username) {
  const sessionId = crypto.randomBytes(32).toString('hex')
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000
  sessions.set(sessionId, {
    username,
    expiresAt
  })
  return sessionId
}

function getCurrentSession(req) {
  const cookies = parseCookies(req)
  const sessionId = unpackSessionCookie(cookies[SESSION_COOKIE_NAME])
  if (!sessionId) {
    return null
  }

  const session = sessions.get(sessionId)
  if (!session) {
    return null
  }

  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId)
    return null
  }

  return {
    id: sessionId,
    ...session
  }
}

function setSessionCookie(res, sessionId) {
  const cookieValue = packSessionCookie(sessionId)
  res.setHeader('Set-Cookie', [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(cookieValue)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`
  ])
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', [
    `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
  ])
}

function setCorsHeaders(req, res) {
  const origin = toText(req && req.headers && req.headers.origin)
  res.setHeader('Access-Control-Allow-Origin', origin || '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Admin-Bridge-Key')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

function sendJson(req, res, statusCode, payload) {
  setCorsHeaders(req, res)
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

function ensureSession(req) {
  const session = getCurrentSession(req)
  if (session) {
    return session
  }

  const error = new Error('登录状态已失效，请重新登录')
  error.statusCode = 401
  error.code = 'ADMIN_AUTH_REQUIRED'
  throw error
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
  sendJson(req, res, 200, {
    ok: true,
    service: 'admin-web-bridge',
    envId: sdkConfig.envId,
    canInvoke: sdkConfig.canInvoke,
    authMode: sdkConfig.authMode,
    authConfigured: isAdminAuthConfigured(),
    operatorConfigured: Boolean(getOperatorKey()),
    routes: Object.keys(ROUTE_MAP),
    bridgeProtected: Boolean(toText(process.env.ADMIN_WEB_BRIDGE_KEY)),
    staticRoot: STATIC_ROOT
  })
}

async function handleSession(req, res) {
  const session = getCurrentSession(req)
  sendJson(req, res, 200, {
    ok: true,
    authenticated: Boolean(session),
    username: session ? session.username : '',
    authConfigured: isAdminAuthConfigured(),
    canInvoke: sdkConfig.canInvoke,
    operatorConfigured: Boolean(getOperatorKey()),
    envId: sdkConfig.envId
  })
}

async function handleLogin(req, res) {
  if (!isAdminAuthConfigured()) {
    sendJson(req, res, 503, {
      ok: false,
      error: '本地管理台尚未配置 ADMIN_USERNAME / ADMIN_PASSWORD_HASH',
      code: 'ADMIN_AUTH_NOT_CONFIGURED'
    })
    return
  }

  const body = sanitizePayload(await readJsonBody(req))
  const username = toText(body.username)
  const password = String(body.password || '')
  const expectedUsername = getExpectedAdminUsername()
  const expectedPasswordHash = getExpectedPasswordHash()

  if (!timingSafeEqualText(username, expectedUsername) || !verifyPassword(password, expectedPasswordHash)) {
    sendJson(req, res, 401, {
      ok: false,
      error: '管理员用户名或密码不正确',
      code: 'ADMIN_LOGIN_FAILED'
    })
    return
  }

  const sessionId = createSession(username)
  setSessionCookie(res, sessionId)
  sendJson(req, res, 200, {
    ok: true,
    authenticated: true,
    username,
    authConfigured: isAdminAuthConfigured(),
    canInvoke: sdkConfig.canInvoke,
    operatorConfigured: Boolean(getOperatorKey()),
    envId: sdkConfig.envId
  })
}

async function handleLogout(req, res) {
  const session = getCurrentSession(req)
  if (session) {
    sessions.delete(session.id)
  }
  clearSessionCookie(res)
  sendJson(req, res, 200, {
    ok: true,
    authenticated: false
  })
}

function normalizeInvokePath(pathname) {
  const current = toText(pathname)
  if (current.startsWith('/api/')) {
    return current.slice('/api'.length)
  }
  return current
}

async function handleInvoke(req, res, parsedUrl) {
  ensureBridgeAuthorized(req, parsedUrl)
  const session = ensureSession(req)

  if (!sdkConfig.canInvoke) {
    sendJson(req, res, 503, {
      ok: false,
      error: '本地 bridge 尚未配置 CLOUDBASE_SECRET_ID / CLOUDBASE_SECRET_KEY，暂时无法调用管理云函数',
      code: 'BRIDGE_CREDENTIALS_MISSING'
    })
    return
  }

  const operatorKey = getOperatorKey()
  if (!operatorKey) {
    sendJson(req, res, 503, {
      ok: false,
      error: '本地 bridge 尚未配置 ADMIN_OPERATOR_KEY，暂时无法通过管理云函数鉴权',
      code: 'ADMIN_OPERATOR_KEY_MISSING'
    })
    return
  }

  const invokePath = normalizeInvokePath(parsedUrl.pathname)
  const functionName = ROUTE_MAP[invokePath]
  if (!functionName) {
    sendJson(req, res, 404, {
      ok: false,
      error: '当前路径未配置对应的管理云函数'
    })
    return
  }

  const body = sanitizePayload(await readJsonBody(req))
  const payload = {
    ...body,
    operatorKey,
    operatorId: toText(body.operatorId || process.env.ADMIN_OPERATOR_ID || session.username || 'admin_console')
  }
  let invokeResult = null

  try {
    invokeResult = await app.callFunction({
      name: functionName,
      data: payload
    }, {
      timeout: REQUEST_TIMEOUT_MS
    })
  } catch (error) {
    const statusCode = toText(error && error.code) === 'INVALID_PARAM' ? 503 : 500
    sendJson(req, res, statusCode, normalizeError(error))
    return
  }

  const result = invokeResult && typeof invokeResult.result === 'object'
    ? invokeResult.result
    : { ok: true, result: invokeResult.result }

  sendJson(req, res, 200, {
    requestId: toText(invokeResult && invokeResult.requestId),
    ...result
  })
}

function getStaticFilePath(pathname) {
  const decodedPath = decodeURIComponent(pathname.split('?')[0])
  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '')
  const filePath = path.resolve(STATIC_ROOT, relativePath)
  if (!filePath.startsWith(STATIC_ROOT + path.sep) && filePath !== STATIC_ROOT) {
    return ''
  }
  return filePath
}

function sendStatic(req, res, pathname) {
  const filePath = getStaticFilePath(pathname)
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendJson(req, res, 404, {
      ok: false,
      error: '静态资源不存在'
    })
    return
  }

  const ext = path.extname(filePath).toLowerCase()
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-store' : 'no-cache'
  })
  fs.createReadStream(filePath).pipe(res)
}

function isApiPath(pathname) {
  return pathname === '/api/session'
    || pathname === '/api/login'
    || pathname === '/api/logout'
    || pathname.startsWith('/api/admin')
    || pathname.startsWith('/api/update')
    || pathname.startsWith('/api/handle')
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`)

    if (req.method === 'OPTIONS') {
      setCorsHeaders(req, res)
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/healthz') {
      await handleHealth(req, res)
      return
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/session') {
      await handleSession(req, res)
      return
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/login') {
      await handleLogin(req, res)
      return
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/logout') {
      await handleLogout(req, res)
      return
    }

    if (req.method === 'POST' && (isApiPath(parsedUrl.pathname) || ROUTE_MAP[parsedUrl.pathname])) {
      await handleInvoke(req, res, parsedUrl)
      return
    }

    if (req.method === 'GET') {
      sendStatic(req, res, parsedUrl.pathname)
      return
    }

    sendJson(req, res, 405, {
      ok: false,
      error: '当前请求方法不受支持'
    })
  } catch (error) {
    const statusCode = normalizeNumber(error && error.statusCode, 500)
    sendJson(req, res, statusCode, normalizeError(error))
  }
})

server.listen(PORT, HOST, () => {
  const protectedHint = toText(process.env.ADMIN_WEB_BRIDGE_KEY) ? '已开启 bridgeKey 保护' : '未开启 bridgeKey 保护'
  const adminHint = isAdminAuthConfigured() ? '管理员登录已配置' : '管理员登录未配置'
  const operatorHint = getOperatorKey() ? 'operatorKey 已配置' : 'operatorKey 未配置'
  console.log(`[admin-web-bridge] listening on http://${HOST}:${PORT}`)
  console.log(`[admin-web-bridge] envId=${sdkConfig.envId || '未配置'} authMode=${sdkConfig.authMode} ${protectedHint}`)
  console.log(`[admin-web-bridge] ${adminHint} ${operatorHint} staticRoot=${STATIC_ROOT}`)
})
