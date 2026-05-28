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

function getDefaultEntryGuideSettings() {
  return {
    homeBrandSplashDismissed: false,
    homeBrandSplashDismissedVersion: '',
    homeBrandSplashDismissedAt: ''
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

function normalizeEntryGuideSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const defaults = getDefaultEntryGuideSettings()
  return {
    homeBrandSplashDismissed: typeof source.homeBrandSplashDismissed === 'boolean'
      ? source.homeBrandSplashDismissed
      : defaults.homeBrandSplashDismissed,
    homeBrandSplashDismissedVersion: normalizeText(source.homeBrandSplashDismissedVersion || defaults.homeBrandSplashDismissedVersion),
    homeBrandSplashDismissedAt: normalizeText(source.homeBrandSplashDismissedAt || defaults.homeBrandSplashDismissedAt)
  }
}

function normalizeDisplayName(value) {
  return normalizeText(value).slice(0, 24)
}

function maskPhone(value) {
  const text = normalizeText(value)
  if (!/^1\d{10}$/.test(text)) {
    return ''
  }
  return `${text.slice(0, 3)}****${text.slice(-4)}`
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
  if (normalizeText(user.phoneMasked)) {
    return {
      wechatNickname,
      customDisplayName,
      displayName: normalizeText(user.phoneMasked),
      displayNameSource: 'phone'
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

async function loadUserProfile(openid, accountId) {
  if (accountId) {
    try {
      const result = await db.collection('users').where({
        accountId
      }).limit(1).get()
      if (result.data.length) {
        return result.data[0]
      }
    } catch (error) {
      // Fallback to openid lookup below.
    }
  }

  const result = await db.collection('users').where({
    _openid: openid
  }).limit(1).get()
  return result.data[0] || null
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = normalizeText(wxContext.OPENID)
  const accountId = await resolveAccountIdByOpenid(openid)
  const currentUser = await loadUserProfile(openid, accountId)
  const displayProfile = buildDisplayProfile(currentUser || {})

  return {
    ok: true,
    reminderSettings: normalizeReminderSettings(currentUser && currentUser.reminderSettings),
    appearanceSettings: normalizeAppearanceSettings(currentUser && currentUser.appearanceSettings),
    entryGuideSettings: normalizeEntryGuideSettings(currentUser && currentUser.entryGuideSettings),
    wechatNickname: displayProfile.wechatNickname,
    customDisplayName: displayProfile.customDisplayName,
    displayName: displayProfile.displayName,
    displayNameSource: displayProfile.displayNameSource,
    phoneMasked: normalizeText(currentUser && currentUser.phoneMasked) || maskPhone(currentUser && currentUser.phone)
  }
}
