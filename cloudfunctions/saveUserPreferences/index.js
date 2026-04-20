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

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const now = new Date()
  const reminderSettings = normalizeReminderSettings(event.reminderSettings)
  const users = db.collection('users')
  const existing = await users.where({
    _openid: wxContext.OPENID
  }).limit(1).get()

  if (existing.data.length) {
    await users.doc(existing.data[0]._id).update({
      data: {
        reminderSettings,
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
        createdAt: now,
        updatedAt: now
      }
    })
  }

  return {
    ok: true,
    reminderSettings
  }
}
