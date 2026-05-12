const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const now = new Date()
  const users = db.collection('users')
  const incomingNickName = normalizeText(event.nickName)
  const incomingAvatarUrl = normalizeText(event.avatarUrl)
  const nextNickName = incomingNickName || '微信用户'
  const profile = {
    updatedAt: now
  }
  if (incomingNickName) {
    profile.nickName = incomingNickName
    profile.wechatNickname = incomingNickName
  }
  if (typeof event.avatarUrl === 'string') {
    profile.avatarUrl = incomingAvatarUrl
  }
  const reminderSettings = {
    followUpEnabled: true,
    followUpAdvance: 'same_day',
    taskEnabled: true,
    taskAdvance: 'same_day'
  }
  const appearanceSettings = {
    themeKey: 'deep_business',
    fontScaleMode: 'default',
    festivalThemeEnabled: false
  }

  const existing = await users.where({
    _openid: wxContext.OPENID
  }).limit(1).get()

  if (existing.data.length) {
    await users.doc(existing.data[0]._id).update({
      data: profile
    })
  } else {
    await users.add({
      data: {
        _openid: wxContext.OPENID,
        nickName: nextNickName,
        wechatNickname: nextNickName,
        customDisplayName: '',
        avatarUrl: incomingAvatarUrl,
        shareTags: [],
        reminderSettings,
        appearanceSettings,
        createdAt: now,
        ...profile
      }
    })
  }

  return {
    ok: true,
    openid: wxContext.OPENID
  }
}
