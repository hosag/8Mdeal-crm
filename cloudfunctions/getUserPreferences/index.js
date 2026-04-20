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

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const result = await db.collection('users').where({
    _openid: wxContext.OPENID
  }).limit(1).get()

  return {
    ok: true,
    reminderSettings: normalizeReminderSettings(result.data[0] && result.data[0].reminderSettings)
  }
}
