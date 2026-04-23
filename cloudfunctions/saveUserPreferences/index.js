const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

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

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const now = new Date()
  const users = db.collection('users')
  const existing = await users.where({
    _openid: wxContext.OPENID
  }).limit(1).get()
  const currentUser = existing.data[0] || null

  const reminderSettings = Object.prototype.hasOwnProperty.call(event || {}, 'reminderSettings')
    ? normalizeReminderSettings(event.reminderSettings)
    : normalizeReminderSettings(currentUser && currentUser.reminderSettings)
  const appearanceSettings = Object.prototype.hasOwnProperty.call(event || {}, 'appearanceSettings')
    ? normalizeAppearanceSettings(event.appearanceSettings)
    : normalizeAppearanceSettings(currentUser && currentUser.appearanceSettings)

  if (currentUser) {
    await users.doc(currentUser._id).update({
      data: {
        reminderSettings,
        appearanceSettings,
        updatedAt: now
      }
    })
  } else {
    await users.add({
      data: {
        _openid: wxContext.OPENID,
        nickName: '微信用户',
        avatarUrl: '',
        shareTags: [],
        reminderSettings,
        appearanceSettings,
        createdAt: now,
        updatedAt: now
      }
    })
  }

  return {
    ok: true,
    reminderSettings,
    appearanceSettings
  }
}
