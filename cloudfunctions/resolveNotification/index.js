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
  const scenes = normalizeStringArray(event.scenes)
  const now = new Date()

  if (!notificationId && !projectId && !scenes.length && !types.length) {
    return {
      ok: false,
      message: 'notificationId, projectId, types or scenes is required'
    }
  }

  const listResult = await db.collection('notifications').where({
    _openid: wxContext.OPENID
  }).get()

  const targets = (listResult.data || []).filter((item) => {
    if (normalizeText(item.status) === 'resolved') {
      return false
    }

    if (notificationId) {
      return item._id === notificationId
    }

    if (projectId && normalizeText(item.projectId) !== projectId) {
      return false
    }

    if (types.length && types.indexOf(normalizeText(item.type)) === -1) {
      return false
    }

    if (scenes.length) {
      const itemScene = normalizeText(item.extra && item.extra.scene)
      if (scenes.indexOf(itemScene) === -1) {
        return false
      }
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
        status: 'resolved',
        readAt: item.readAt || now,
        resolvedAt: now,
        updatedAt: now
      }
    })
  }))

  return {
    ok: true,
    updated: targets.length
  }
}
