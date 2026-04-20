const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => normalizeText(item))
    .filter(Boolean)
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const notificationId = normalizeText(event.notificationId)
  const projectId = normalizeText(event.projectId)
  const types = normalizeStringArray(event.types)
  const markAll = !!event.markAll
  const now = new Date()

  if (!notificationId && !markAll && !projectId && !types.length) {
    return {
      ok: false,
      message: 'notificationId, markAll, projectId or types is required'
    }
  }

  const listResult = await db.collection('notifications').where({
    _openid: wxContext.OPENID
  }).get()

  const targets = (listResult.data || []).filter((item) => {
    if (markAll) {
      return normalizeText(item.status) === 'unread'
    }

    if (notificationId) {
      return item._id === notificationId && normalizeText(item.status) === 'unread'
    }

    if (normalizeText(item.status) !== 'unread') {
      return false
    }

    if (projectId && normalizeText(item.projectId) !== projectId) {
      return false
    }

    if (types.length && types.indexOf(normalizeText(item.type)) === -1) {
      return false
    }

    return true
  })

  if (!targets.length) {
    return {
      ok: true,
      updated: 0
    }
  }

  await Promise.all(targets.map((item) => {
    return db.collection('notifications').doc(item._id).update({
      data: {
        status: 'read',
        readAt: now,
        updatedAt: now
      }
    })
  }))

  return {
    ok: true,
    updated: targets.length
  }
}
