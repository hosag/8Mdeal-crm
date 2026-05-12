const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
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

function normalizeAdvance(value) {
  const current = String(value || '').trim()
  return current === 'one_day_before' ? 'one_day_before' : 'same_day'
}

function normalizeReminderSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const defaults = getDefaultReminderSettings()
  return {
    followUpEnabled: typeof source.followUpEnabled === 'boolean' ? source.followUpEnabled : defaults.followUpEnabled,
    followUpAdvance: normalizeAdvance(source.followUpAdvance || defaults.followUpAdvance),
    taskEnabled: typeof source.taskEnabled === 'boolean' ? source.taskEnabled : defaults.taskEnabled,
    taskAdvance: normalizeAdvance(source.taskAdvance || defaults.taskAdvance)
  }
}

function normalizeThemeKey(value) {
  const current = String(value || '').trim()
  return ['deep_business', 'warm_almond', 'misty_blossom', 'festive_crimson', 'cloud_mist', 'ink_readable'].includes(current)
    ? current
    : 'deep_business'
}

function normalizeFontScaleMode(value) {
  const current = String(value || '').trim()
  return ['default', 'large', 'readable'].includes(current) ? current : 'default'
}

function normalizeAppearanceSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const defaults = getDefaultAppearanceSettings()
  return {
    themeKey: normalizeThemeKey(source.themeKey || defaults.themeKey),
    fontScaleMode: normalizeFontScaleMode(source.fontScaleMode || defaults.fontScaleMode),
    festivalThemeEnabled: typeof source.festivalThemeEnabled === 'boolean'
      ? source.festivalThemeEnabled
      : defaults.festivalThemeEnabled
  }
}

function normalizeDisplayName(value) {
  return normalizeText(value).slice(0, 24)
}

function buildDisplayProfile(user = {}) {
  const wechatNickname = normalizeText(user.wechatNickname || user.nickName)
  const customDisplayName = normalizeDisplayName(user.customDisplayName)
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
  return {
    wechatNickname,
    customDisplayName,
    displayName: '',
    displayNameSource: ''
  }
}

async function resolveAccountIdByOpenid(openid = '') {
  const currentOpenid = normalizeText(openid)
  if (!currentOpenid) {
    return ''
  }

  try {
    const result = await db.collection('accountIdentities').where({
      provider: 'wechat_mp',
      openid: currentOpenid
    }).limit(1).get()
    return normalizeText(result.data[0] && result.data[0].accountId)
  } catch (error) {
    return ''
  }
}

async function loadUserProfile(users, openid, accountId) {
  if (accountId) {
    try {
      const result = await users.where({
        accountId
      }).limit(1).get()
      if (result.data.length) {
        return result.data[0]
      }
    } catch (error) {
      // Fallback to openid lookup below.
    }
  }

  const result = await users.where({
    _openid: openid
  }).limit(1).get()
  return result.data[0] || null
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const now = new Date()
  const users = db.collection('users')
  const openid = normalizeText(wxContext.OPENID)
  const accountId = await resolveAccountIdByOpenid(openid)
  const currentUser = await loadUserProfile(users, openid, accountId)

  const reminderSettings = Object.prototype.hasOwnProperty.call(event || {}, 'reminderSettings')
    ? normalizeReminderSettings(event.reminderSettings)
    : normalizeReminderSettings(currentUser && currentUser.reminderSettings)
  const appearanceSettings = Object.prototype.hasOwnProperty.call(event || {}, 'appearanceSettings')
    ? normalizeAppearanceSettings(event.appearanceSettings)
    : normalizeAppearanceSettings(currentUser && currentUser.appearanceSettings)
  const customDisplayName = Object.prototype.hasOwnProperty.call(event || {}, 'customDisplayName')
    ? normalizeDisplayName(event.customDisplayName)
    : normalizeDisplayName(currentUser && currentUser.customDisplayName)
  const wechatNickname = normalizeText(currentUser && (currentUser.wechatNickname || currentUser.nickName || '微信用户')) || '微信用户'

  if (currentUser) {
    await users.doc(currentUser._id).update({
      data: {
        reminderSettings,
        appearanceSettings,
        wechatNickname,
        customDisplayName,
        accountId: accountId || normalizeText(currentUser.accountId),
        updatedAt: now
      }
    })
  } else {
    await users.add({
      data: {
        _openid: openid,
        accountId,
        nickName: '微信用户',
        wechatNickname,
        customDisplayName,
        avatarUrl: '',
        shareTags: [],
        reminderSettings,
        appearanceSettings,
        createdAt: now,
        updatedAt: now
      }
    })
  }

  const displayProfile = buildDisplayProfile({
    ...(currentUser || {}),
    wechatNickname,
    customDisplayName
  })

  return {
    ok: true,
    reminderSettings,
    appearanceSettings,
    wechatNickname: displayProfile.wechatNickname,
    customDisplayName: displayProfile.customDisplayName,
    displayName: displayProfile.displayName,
    displayNameSource: displayProfile.displayNameSource
  }
}
