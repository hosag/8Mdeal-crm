const cloud = require('wx-server-sdk')
const tencentcloud = require('tencentcloud-sdk-nodejs')
const createVoiceUsageHelper = require('./usageHelper')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const AsrClient = tencentcloud.asr.v20190614.Client

const SECRET_ID = String(process.env.ASR_SECRET_ID || '').trim()
const SECRET_KEY = String(process.env.ASR_SECRET_KEY || '').trim()
const ASR_REGION = String(process.env.ASR_REGION || 'ap-shanghai').trim()
const ASR_ENGINE = String(process.env.ASR_ENG_SERVICE_TYPE || '16k_zh').trim()
const MAX_AUDIO_DURATION = 60000

function normalizeText(value, fallback = '') {
  const text = String(value || '').trim()
  return text || fallback
}

async function resolveSpeechAccessContext(openid) {
  const identityResult = await db.collection('accountIdentities').where({
    provider: 'wechat_mp',
    openid
  }).limit(1).get()
  const identity = identityResult.data[0] || null
  const accountId = normalizeText(identity && identity.accountId)

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

function ensureSpeechAccess(context) {
  const account = context && context.account ? context.account : {}
  const entitlements = context && context.entitlements ? context.entitlements : {}
  const status = normalizeText(entitlements.status || account.status || 'trialing')

  if (status === 'disabled') {
    throw new Error('ACCOUNT_DISABLED: 当前账号已被禁用')
  }

  if (!entitlements || !Object.keys(entitlements).length) {
    if (status === 'free_limited' || status === 'expired_readonly') {
      throw new Error('ENTITLEMENT_WRITE_DISABLED: 当前账号为只读状态')
    }
    return
  }

  if (!entitlements.canUseSpeechToText) {
    if (Number(entitlements.voiceSecondsRemaining) <= 0) {
      throw new Error('ENTITLEMENT_SPEECH_EXHAUSTED: 当前语音额度已用完')
    }
    throw new Error('ENTITLEMENT_WRITE_DISABLED: 当前账号为只读状态')
  }
}

function normalizeVoiceFormat(value, fileID = '') {
  const raw = normalizeText(value).toLowerCase()
  if (['wav', 'pcm', 'ogg-opus', 'speex', 'silk', 'mp3', 'm4a', 'aac', 'amr'].includes(raw)) {
    return raw
  }

  const matched = /\.([^.\\/]+)$/.exec(String(fileID || '').toLowerCase())
  const extension = matched ? matched[1] : ''
  if (['wav', 'pcm', 'mp3', 'm4a', 'aac', 'amr'].includes(extension)) {
    return extension
  }

  return 'mp3'
}

function createAudioKey(projectId = '') {
  const base = normalizeText(projectId, 'follow-up')
  return `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function toNumber(value, fallback = 0) {
  const current = Number(value)
  return Number.isFinite(current) ? current : fallback
}
const {
  buildUsageTraceId,
  buildSpeechSourceId,
  buildUsageEventKey,
  consumeVoiceUsage,
  appendUsageEvent
} = createVoiceUsageHelper({
  db,
  safeText: normalizeText,
  toNumber
})

function ensureAsrConfig() {
  if (!SECRET_ID || !SECRET_KEY) {
    throw new Error('云端语音识别服务未配置密钥，请在 speechToText 云函数环境变量中设置 ASR_SECRET_ID 和 ASR_SECRET_KEY')
  }
}

async function getTempVoiceUrl(fileID) {
  const result = await cloud.getTempFileURL({
    fileList: [fileID]
  })
  const file = Array.isArray(result.fileList) ? result.fileList[0] : null
  const tempUrl = normalizeText(file && file.tempFileURL)
  if (!tempUrl) {
    throw new Error('录音文件读取失败，请重新录一次')
  }

  return tempUrl
}

async function removeTempVoice(fileID) {
  const current = normalizeText(fileID)
  if (!current) {
    return
  }

  try {
    await cloud.deleteFile({
      fileList: [current]
    })
  } catch (error) {
    // Ignore cleanup failures to avoid masking the main result.
  }
}

function createAsrClient() {
  return new AsrClient({
    credential: {
      secretId: SECRET_ID,
      secretKey: SECRET_KEY
    },
    region: ASR_REGION,
    profile: {
      httpProfile: {
        endpoint: 'asr.tencentcloudapi.com'
      }
    }
  })
}

function normalizeAsrError(error) {
  const code = normalizeText(error && error.code)
  const message = normalizeText(error && error.message)
  const combined = `${code} ${message}`.trim()

  if (!combined) {
    return '语音识别失败，请稍后再试'
  }

  if (/secret|credential|auth/i.test(combined)) {
    return '云端语音识别服务未配置密钥，请先完成云函数环境变量设置'
  }

  if (/60s|duration|AudioDuration|too long|TooLarge/i.test(combined)) {
    return '录音时长超出识别限制，请控制在 60 秒内'
  }

  if (/3MB|size|too large/i.test(combined)) {
    return '录音文件过大，请缩短录音后再试'
  }

  if (/format|codec|unsupported/i.test(combined)) {
    return '录音格式暂不支持，请重新录制后再试'
  }

  if (/download|url|404|403/i.test(combined)) {
    return '录音文件读取失败，请重新录一次'
  }

  return message || '语音识别失败，请稍后再试'
}

async function recognizeSentence(options = {}) {
  const client = createAsrClient()
  const params = {
    ProjectId: 0,
    SubServiceType: 2,
    EngSerViceType: ASR_ENGINE,
    SourceType: 0,
    Url: options.url,
    VoiceFormat: options.voiceFormat,
    UsrAudioKey: options.audioKey,
    FilterDirty: 0,
    FilterModal: 0,
    FilterPunc: 0,
    ConvertNumMode: 1,
    WordInfo: 0
  }

  return client.SentenceRecognition(params)
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const accessContext = await resolveSpeechAccessContext(wxContext.OPENID)
  ensureSpeechAccess(accessContext)
  const fileID = normalizeText(event && event.fileID)
  const projectId = normalizeText(event && event.projectId)
  const requestId = normalizeText(event && event.requestId)
  const voiceFormat = normalizeVoiceFormat(event && event.voiceFormat, fileID)
  const duration = Math.max(0, Number(event && event.duration ? event.duration : 0) || 0)

  if (!fileID) {
    throw new Error('缺少录音文件，请重新录一次')
  }

  if (duration > MAX_AUDIO_DURATION) {
    throw new Error('录音时长超出识别限制，请控制在 60 秒内')
  }

  ensureAsrConfig()
  const requestStartedAt = Date.now()
  const traceId = buildUsageTraceId(accessContext.accountId, requestId, fileID)

  try {
    const tempUrl = await getTempVoiceUrl(fileID)
    const result = await recognizeSentence({
      url: tempUrl,
      voiceFormat,
      audioKey: createAudioKey(projectId)
    })

    const text = normalizeText(result && result.Result)
    if (!text) {
      throw new Error('这次没有识别出有效内容，可以再试一次')
    }

    const audioDurationMs = Math.max(0, Number(result && result.AudioDuration ? result.AudioDuration : duration) || 0)
    const usageRecord = await consumeVoiceUsage({
      accountId: accessContext.accountId,
      entitlements: accessContext.entitlements,
      projectId,
      requestId,
      fileID,
      voiceFormat,
      audioDurationMs,
      providerRequestId: normalizeText(result && result.RequestId),
      traceId,
      occurredAt: new Date()
    })

    await appendUsageEvent({
      accountId: accessContext.accountId,
      requestId,
      fileID,
      projectId,
      traceId,
      pageKey: 'pages/index/index',
      providerRequestId: normalizeText(result && result.RequestId),
      audioDurationMs,
      billedSeconds: usageRecord.billedSeconds || Math.ceil(audioDurationMs / 1000),
      durationMs: Date.now() - requestStartedAt,
      voiceFormat,
      outputText: text,
      usageRecorded: usageRecord.skipped !== true,
      usageReused: usageRecord.reused === true,
      eventStatus: 'success',
      eventKey: buildUsageEventKey(accessContext.accountId, requestId, fileID, 'success'),
      occurredAt: new Date()
    })

    return {
      ok: true,
      text,
      requestId: normalizeText(result && result.RequestId),
      audioDuration: audioDurationMs,
      engineModel: ASR_ENGINE,
      providerLabel: 'Tencent Cloud ASR',
      usageRecorded: usageRecord.skipped !== true,
      usageReused: usageRecord.reused === true,
      billedSeconds: usageRecord.billedSeconds || Math.ceil(audioDurationMs / 1000)
    }
  } catch (error) {
    await appendUsageEvent({
      accountId: accessContext.accountId,
      requestId,
      fileID,
      projectId,
      traceId,
      pageKey: 'pages/index/index',
      audioDurationMs: duration,
      billedSeconds: 0,
      durationMs: Date.now() - requestStartedAt,
      voiceFormat,
      outputText: '',
      usageRecorded: false,
      usageReused: false,
      eventStatus: 'failed',
      eventKey: buildUsageEventKey(accessContext.accountId, requestId, fileID, 'failed'),
      errorMessage: normalizeAsrError(error),
      occurredAt: new Date()
    })
    throw new Error(normalizeAsrError(error))
  } finally {
    await removeTempVoice(fileID)
  }
}
