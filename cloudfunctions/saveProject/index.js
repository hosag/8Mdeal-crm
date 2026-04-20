const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function normalizeNumber(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

function normalizeTags(tagsText) {
  if (!tagsText) {
    return []
  }

  return String(tagsText)
    .split(/[，,\/]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeContacts(contacts) {
  if (!Array.isArray(contacts)) {
    return []
  }

  return contacts
    .map((contact, index) => ({
      contactId: contact.contactId || `contact-${Date.now()}-${index}`,
      name: String(contact.name || '').trim(),
      role: String(contact.role || '').trim(),
      phone: String(contact.phone || '').trim(),
      wechat: String(contact.wechat || '').trim(),
      company: String(contact.company || '').trim()
    }))
    .filter((contact) => contact.name)
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()

  if (!event.projectName || !event.clientName || !event.stage) {
    return {
      ok: false,
      message: 'projectName, clientName and stage are required'
    }
  }

  const now = new Date()
  const payload = {
    projectName: String(event.projectName).trim(),
    clientName: String(event.clientName).trim(),
    stage: String(event.stage).trim(),
    estimatedAmount: normalizeNumber(event.estimatedAmount),
    actualAmount: normalizeNumber(event.actualAmount),
    expectedCommission: normalizeNumber(event.expectedCommission),
    description: String(event.description || '').trim(),
    tags: normalizeTags(event.tagsText),
    contacts: normalizeContacts(event.contacts),
    updatedAt: now
  }

  if (event.projectId) {
    const existing = await db.collection('projects').where({
      _id: event.projectId,
      _openid: wxContext.OPENID
    }).limit(1).get()

    if (!existing.data.length) {
      return {
        ok: false,
        message: 'project not found'
      }
    }

    if (existing.data[0].handoverStatus === 'handed_over' && !existing.data[0].isSharedProject) {
      return {
        ok: false,
        message: 'project already handed over'
      }
    }

    await db.collection('projects').doc(event.projectId).update({
      data: payload
    })

    return {
      ok: true,
      projectId: event.projectId,
      mode: 'update'
    }
  }

  const result = await db.collection('projects').add({
    data: {
      _openid: wxContext.OPENID,
      createdAt: now,
      ...payload
    }
  })

  return {
    ok: true,
    projectId: result._id,
    mode: 'create'
  }
}
