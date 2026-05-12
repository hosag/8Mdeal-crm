const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const DEFAULT_TRIAL_DAYS = 7

function addDays(source, days) {
  const base = source instanceof Date ? source : new Date(source)
  const result = new Date(base.getTime())
  result.setDate(result.getDate() + days)
  return result
}

function createAccountId(now) {
  return `acc_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`
}

function getDefaultReminderSettings() {
  return {
    followUpEnabled: true,
    followUpAdvance: 'same_day',
    taskEnabled: true,
    taskAdvance: 'same_day'
  }
}

function getDefaultAppearanceSettings() {
  return {
    themeKey: 'deep_business',
    fontScaleMode: 'default',
    festivalThemeEnabled: false
  }
}

function maskPhone(value) {
  const text = String(value || '').trim()
  if (!/^1\d{10}$/.test(text)) {
    return ''
  }

  return `${text.slice(0, 3)}****${text.slice(-4)}`
}

function normalizeText(value) {
  return String(value || '').trim()
}

function buildDisplayProfile(user = {}, account = {}) {
  const wechatNickname = normalizeText(user.wechatNickname || user.nickName)
  const customDisplayName = normalizeText(user.customDisplayName)
  const phoneMasked = maskPhone(account.phone)
  if (customDisplayName) {
    return {
      wechatNickname,
      customDisplayName,
      displayName: customDisplayName,
      displayNameSource: 'custom'
    }
  }
  if (wechatNickname) {
    return {
      wechatNickname,
      customDisplayName,
      displayName: wechatNickname,
      displayNameSource: 'wechat'
    }
  }
  if (phoneMasked) {
    return {
      wechatNickname,
      customDisplayName,
      displayName: phoneMasked,
      displayNameSource: 'phone'
    }
  }
  return {
    wechatNickname,
    customDisplayName,
    displayName: normalizeText(account.accountId),
    displayNameSource: 'account'
  }
}

function buildAccountSummary(account, user = {}) {
  const displayProfile = buildDisplayProfile(user, account)
  return {
    accountId: String(account && account.accountId ? account.accountId : '').trim(),
    status: String(account && account.status ? account.status : 'trialing').trim() || 'trialing',
    phone: normalizeText(account && account.phone),
    phoneVerified: Boolean(account && account.phoneVerified),
    phoneMasked: maskPhone(account && account.phone),
    wechatNickname: displayProfile.wechatNickname,
    customDisplayName: displayProfile.customDisplayName,
    displayName: displayProfile.displayName,
    displayNameSource: displayProfile.displayNameSource,
    trialEndsAt: account && account.trialEndsAt ? new Date(account.trialEndsAt).toISOString() : '',
    currentAccessLevel: String(account && account.currentAccessLevel ? account.currentAccessLevel : 'trial_full').trim() || 'trial_full'
  }
}

async function getFeatureFlag(flagKey) {
  try {
    const result = await db.collection('featureFlags').where({
      flagKey
    }).limit(1).get()
    return result.data[0] || null
  } catch (error) {
    return null
  }
}

async function ensureUserProfile(openid, accountId, now) {
  const users = db.collection('users')
  const result = await users.where({
    _openid: openid
  }).limit(1).get()

  if (result.data.length) {
    const currentUser = result.data[0]
    const nextData = {
      accountId,
      wechatNickname: normalizeText(currentUser.wechatNickname || currentUser.nickName || '微信用户'),
      customDisplayName: normalizeText(currentUser.customDisplayName),
      bindStatus: currentUser.phoneMasked ? 'bound' : 'unbound',
      updatedAt: now
    }

    if (!currentUser.reminderSettings) {
      nextData.reminderSettings = getDefaultReminderSettings()
    }
    if (!currentUser.appearanceSettings) {
      nextData.appearanceSettings = getDefaultAppearanceSettings()
    }

    await users.doc(currentUser._id).update({
      data: nextData
    })

    return {
      ...currentUser,
      ...nextData
    }
  }

  const nextUser = {
    _openid: openid,
    accountId,
    nickName: '微信用户',
    wechatNickname: '微信用户',
    customDisplayName: '',
    avatarUrl: '',
    phoneMasked: '',
    bindStatus: 'unbound',
    shareTags: [],
    reminderSettings: getDefaultReminderSettings(),
    appearanceSettings: getDefaultAppearanceSettings(),
    createdAt: now,
    updatedAt: now
  }

  await users.add({
    data: nextUser
  })

  return nextUser
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const now = new Date()
  const openid = String(wxContext.OPENID || '').trim()

  if (!openid) {
    throw new Error('无法解析当前微信身份，请稍后重试')
  }

  const trialPolicy = await getFeatureFlag('trial_policy_v1')
  const trialDays = Number(trialPolicy && trialPolicy.payload && trialPolicy.payload.trialDays) > 0
    ? Number(trialPolicy.payload.trialDays)
    : DEFAULT_TRIAL_DAYS

  const identityCollection = db.collection('accountIdentities')
  const identityResult = await identityCollection.where({
    provider: 'wechat_mp',
    openid
  }).limit(1).get()
  const existingIdentity = identityResult.data[0] || null

  if (existingIdentity) {
    const identity = existingIdentity
    const accountResult = await db.collection('accounts').where({
      accountId: identity.accountId
    }).limit(1).get()

    if (accountResult.data.length) {
      const account = accountResult.data[0]
      const userProfile = await ensureUserProfile(openid, account.accountId, now)

      if (!account.lastActiveAt || now.getTime() - new Date(account.lastActiveAt).getTime() > 60 * 1000) {
        await db.collection('accounts').doc(account._id).update({
          data: {
            lastActiveAt: now,
            updatedAt: now
          }
        })
      }

      return {
        ok: true,
        ...buildAccountSummary(account, userProfile)
      }
    }
  }

  const accountId = createAccountId(now)
  const trialEndsAt = addDays(now, trialDays)

  await db.collection('accounts').add({
    data: {
      accountId,
      status: 'trialing',
      phone: '',
      phoneVerified: false,
      primaryIdentityType: 'wechat_mp',
      trialStartedAt: now,
      trialEndsAt,
      currentAccessLevel: 'trial_full',
      lastActiveAt: now,
      disabledReason: '',
      createdAt: now,
      updatedAt: now
    }
  })

  if (existingIdentity && existingIdentity._id) {
    await identityCollection.doc(existingIdentity._id).update({
      data: {
        accountId,
        appId: wxContext.APPID || '',
        updatedAt: now
      }
    })
  } else {
    await identityCollection.add({
      data: {
        accountId,
        provider: 'wechat_mp',
        openid,
        unionid: '',
        appId: wxContext.APPID || '',
        isPrimary: true,
        createdAt: now,
        updatedAt: now
      }
    })
  }

  const userProfile = await ensureUserProfile(openid, accountId, now)

  return {
    ok: true,
    ...buildAccountSummary({
      accountId,
      status: 'trialing',
      phone: '',
      phoneVerified: false,
      trialEndsAt,
      currentAccessLevel: 'trial_full'
    }, userProfile)
  }
}
