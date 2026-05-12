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
  const phoneNumber = normalizeText(event.phoneNumber)
  const consentVersion = normalizeText(event.consentVersion || 'p0_phone_bind_v1')
  const consentChecked = event.consentChecked === true
  const now = new Date()

  if (!openid) {
    throw new Error('无法解析当前微信身份，请稍后重试')
  }

  if (!/^1\d{10}$/.test(phoneNumber)) {
    throw new Error('请输入有效的 11 位手机号')
  }

  if (!consentChecked) {
    throw new Error('请先勾选绑定说明后再继续')
  }

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
        phoneMasked: maskPhone(phoneNumber),
        bindStatus: 'bound',
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
        phoneMasked: maskPhone(phoneNumber),
        granted: true,
        source: 'manual_entry',
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
    phoneMasked: maskPhone(phoneNumber),
    bindStatus: 'bound'
  }
}
