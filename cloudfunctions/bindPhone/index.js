const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

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

function resolvePhoneInfo(result) {
  if (!result || typeof result !== 'object') {
    return {}
  }

  return result.phone_info || result.phoneInfo || result.phoneNumberInfo || {}
}

async function getTrustedPhoneNumber(code) {
  if (!code) {
    throw new Error('请使用微信手机号授权完成绑定')
  }

  if (!cloud.openapi || !cloud.openapi.phonenumber || typeof cloud.openapi.phonenumber.getPhoneNumber !== 'function') {
    throw new Error('当前云环境暂不支持手机号授权，请检查云函数 SDK')
  }

  let result
  try {
    result = await cloud.openapi.phonenumber.getPhoneNumber({
      code
    })
  } catch (error) {
    throw new Error('手机号授权校验失败，请重新授权')
  }

  const phoneInfo = resolvePhoneInfo(result)
  const phoneNumber = normalizeText(phoneInfo.phoneNumber || phoneInfo.purePhoneNumber)
  const purePhoneNumber = normalizeText(phoneInfo.purePhoneNumber || phoneNumber)
  const countryCode = normalizeText(phoneInfo.countryCode || '86')

  if (!/^1\d{10}$/.test(purePhoneNumber)) {
    throw new Error('暂仅支持绑定中国大陆手机号')
  }

  return {
    phoneNumber: purePhoneNumber,
    phoneMasked: maskPhone(purePhoneNumber),
    countryCode,
    providerPhoneNumber: phoneNumber,
    watermark: phoneInfo.watermark || null
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

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = normalizeText(wxContext.OPENID)
  const code = normalizeText(event.code)
  const consentVersion = normalizeText(event.consentVersion || 'p0_phone_bind_v1')
  const consentChecked = event.consentChecked === true
  const now = new Date()

  if (!openid) {
    throw new Error('无法解析当前微信身份，请稍后重试')
  }

  if (!consentChecked) {
    throw new Error('请先勾选绑定说明后再继续')
  }

  const phoneInfo = await getTrustedPhoneNumber(code)
  const phoneNumber = phoneInfo.phoneNumber

  const identity = await safeGetOne('accountIdentities', {
    provider: 'wechat_mp',
    openid
  })

  if (!identity || !identity.accountId) {
    throw new Error('ACCOUNT_NOT_INITIALIZED: 当前账号尚未初始化，请稍后重试')
  }

  const account = await safeGetOne('accounts', {
    accountId: identity.accountId
  })

  if (!account || !account._id) {
    throw new Error('ACCOUNT_NOT_INITIALIZED: 当前账号尚未初始化，请稍后重试')
  }

  await db.collection('accounts').doc(account._id).update({
    data: {
      phone: phoneNumber,
      phoneVerified: true,
      phoneBindProvider: 'wechat_get_phone_number',
      phoneVerifiedAt: now,
      phoneCountryCode: phoneInfo.countryCode,
      updatedAt: now
    }
  })

  const userProfile = await safeGetOne('users', {
    _openid: openid
  })

  if (userProfile && userProfile._id) {
    await db.collection('users').doc(userProfile._id).update({
      data: {
        accountId: identity.accountId,
        phoneMasked: phoneInfo.phoneMasked,
        bindStatus: 'bound',
        phoneBindProvider: 'wechat_get_phone_number',
        updatedAt: now
      }
    })
  }

  try {
    await db.collection('agreementConsents').add({
      data: {
        accountId: identity.accountId,
        consentType: 'phone_bind',
        consentVersion,
        phoneMasked: phoneInfo.phoneMasked,
        granted: true,
        source: 'wechat_get_phone_number',
        phoneBindProvider: 'wechat_get_phone_number',
        createdAt: now,
        updatedAt: now
      }
    })
  } catch (error) {
    // Keep phone binding usable even if consent logging is not deployed yet.
  }

  return {
    ok: true,
    accountId: identity.accountId,
    phoneVerified: true,
    phoneMasked: phoneInfo.phoneMasked,
    bindStatus: 'bound'
  }
}
