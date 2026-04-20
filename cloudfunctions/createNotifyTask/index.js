const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value
}

function parseDate(value) {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  const text = normalizeText(value)
  if (!text) {
    return null
  }

  const date = new Date(text.includes('T') ? text : text.replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date
}

function formatBizDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeLevel(value) {
  const current = normalizeText(value)
  const allowed = ['high', 'normal', 'info']
  return allowed.includes(current) ? current : 'normal'
}

function normalizeStatus(value) {
  const current = normalizeText(value)
  const allowed = ['unread', 'read', 'resolved']
  return allowed.includes(current) ? current : 'unread'
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const recipientOpenid = normalizeText(event.recipientOpenid) || wxContext.OPENID
  const type = normalizeText(event.type)
  const projectId = normalizeText(event.projectId)
  const notifyTime = parseDate(event.notifyTime)
  const dedupeKey = normalizeText(event.dedupeKey)

  if (!type) {
    return {
      ok: false,
      message: 'type is required'
    }
  }

  if (!projectId && !normalizeText(event.shareRecordId) && !dedupeKey) {
    return {
      ok: false,
      message: 'projectId, shareRecordId or dedupeKey is required'
    }
  }

  if (dedupeKey) {
    const existedResult = await db.collection('notifications').where({
      _openid: recipientOpenid,
      dedupeKey
    }).limit(1).get()

    if (Array.isArray(existedResult.data) && existedResult.data.length) {
      return {
        ok: true,
        existed: true,
        id: existedResult.data[0]._id
      }
    }
  }

  const now = new Date()
  const result = await db.collection('notifications').add({
    data: {
      _openid: recipientOpenid,
      recipientOpenid,
      type,
      level: normalizeLevel(event.level),
      status: normalizeStatus(event.status),
      title: normalizeText(event.title) || '系统提醒',
      summary: normalizeText(event.summary),
      projectId,
      projectName: normalizeText(event.projectName),
      shareRecordId: normalizeText(event.shareRecordId),
      sourceOpenid: normalizeText(event.sourceOpenid),
      sourceName: normalizeText(event.sourceName),
      actionUrl: normalizeText(event.actionUrl),
      actionLabel: normalizeText(event.actionLabel) || '查看',
      bizDate: normalizeText(event.bizDate) || formatBizDate(notifyTime || now),
      dedupeKey,
      extra: normalizeObject(event.extra),
      notifyTime,
      isSent: false,
      createdAt: now,
      updatedAt: now,
      readAt: null,
      resolvedAt: null
    }
  })

  return {
    ok: true,
    id: result._id
  }
}
