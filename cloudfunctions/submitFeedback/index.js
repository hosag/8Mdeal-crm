const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const TYPE_MAP = {
  bug: '遇到问题',
  feature: '功能需求',
  ux: '体验建议',
  other: '其他'
}

const SCENE_MAP = {
  home: '首页',
  projects: '我的项目',
  project_detail: '项目详情',
  quick_entry: '闪录',
  share: '分享/外发',
  mine: '我的设置',
  other: '其他'
}

function normalizeText(value) {
  return String(value || '').trim()
}

function maskPhone(value) {
  const text = normalizeText(value)
  if (!/^1\d{10}$/.test(text)) {
    return ''
  }

  return `${text.slice(0, 3)}****${text.slice(-4)}`
}

function normalizeType(value) {
  const current = normalizeText(value)
  return TYPE_MAP[current] ? current : 'other'
}

function normalizeScene(value) {
  const current = normalizeText(value)
  return SCENE_MAP[current] ? current : 'other'
}

function normalizeClientInfo(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    platform: normalizeText(source.platform),
    system: normalizeText(source.system),
    version: normalizeText(source.version),
    SDKVersion: normalizeText(source.SDKVersion),
    brand: normalizeText(source.brand),
    model: normalizeText(source.model)
  }
}

function buildDisplayName(user = {}, account = {}) {
  const customDisplayName = normalizeText(user.customDisplayName)
  const wechatNickname = normalizeText(user.wechatNickname || user.nickName)
  const phoneMasked = normalizeText(user.phoneMasked) || maskPhone(account.phone)

  return customDisplayName || wechatNickname || phoneMasked || normalizeText(account.accountId)
}

async function resolveAccount(openid) {
  const identityResult = await db.collection('accountIdentities').where({
    provider: 'wechat_mp',
    openid
  }).limit(1).get()
  const accountId = normalizeText(identityResult.data[0] && identityResult.data[0].accountId)

  let account = null
  if (accountId) {
    const accountResult = await db.collection('accounts').where({
      accountId
    }).limit(1).get()
    account = accountResult.data[0] || null
  }

  const userResult = await db.collection('users').where({
    _openid: openid
  }).limit(1).get()
  const user = userResult.data[0] || {}

  return {
    accountId,
    account: account || {},
    user
  }
}

async function ensureFeedbackRateLimit(openid, now) {
  const since = new Date(now.getTime() - 60 * 1000)
  const result = await db.collection('feedback').where({
    _openid: openid,
    createdAt: _.gte(since)
  }).limit(1).get()

  if (Array.isArray(result.data) && result.data.length) {
    throw new Error('反馈提交太频繁，请稍后再试')
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = normalizeText(wxContext.OPENID)
  const now = new Date()

  if (!openid) {
    throw new Error('无法识别当前用户，请稍后重试')
  }

  const content = normalizeText(event.content).slice(0, 1000)
  if (content.length < 8) {
    return {
      ok: false,
      message: '请稍微多写一点反馈内容'
    }
  }

  await ensureFeedbackRateLimit(openid, now)

  const type = normalizeType(event.type)
  const scene = normalizeScene(event.scene)
  const accountMeta = await resolveAccount(openid)
  const phoneMasked = maskPhone(accountMeta.account.phone) || normalizeText(accountMeta.user.phoneMasked)
  const displayName = buildDisplayName(accountMeta.user, accountMeta.account)
  const payload = {
    _openid: openid,
    accountId: accountMeta.accountId,
    phoneMasked,
    displayName,
    type,
    typeLabel: TYPE_MAP[type],
    scene,
    sceneLabel: SCENE_MAP[scene],
    content,
    contact: normalizeText(event.contact).slice(0, 80),
    allowContact: event.allowContact !== false,
    status: 'pending',
    statusLabel: '待处理',
    rewardAiTokens: 0,
    adminNote: '',
    clientInfo: normalizeClientInfo(event.clientInfo),
    createdAt: now,
    updatedAt: now
  }

  const result = await db.collection('feedback').add({
    data: payload
  })

  return {
    ok: true,
    feedbackId: result._id,
    message: '反馈已提交'
  }
}
