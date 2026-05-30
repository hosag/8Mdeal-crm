const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const CONTACT_CRYPTO_SECRET = String(process.env.CONTACT_CRYPTO_SECRET || '').trim()
if (!CONTACT_CRYPTO_SECRET) {
  throw new Error('CONTACT_CRYPTO_SECRET is required')
}
const CONTACT_CRYPTO_PREFIX = 'enc:v1'
const CONTACT_CRYPTO_KEY = crypto.createHash('sha256').update(CONTACT_CRYPTO_SECRET).digest()
const PAGE_SIZE = 100

function normalizeText(value) {
  return String(value || '').trim()
}

function isEncryptedValue(value) {
  return normalizeText(value).startsWith(`${CONTACT_CRYPTO_PREFIX}:`)
}

function encryptSensitiveValue(value) {
  const text = normalizeText(value)
  if (!text) {
    return ''
  }

  if (isEncryptedValue(text)) {
    return text
  }

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', CONTACT_CRYPTO_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    CONTACT_CRYPTO_PREFIX,
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64')
  ].join(':')
}

function normalizeContacts(contacts) {
  if (!Array.isArray(contacts)) {
    return []
  }

  return contacts.map((contact, index) => ({
    ...contact,
    contactId: normalizeText(contact && (contact.contactId || contact.id)) || `contact-${Date.now()}-${index}`,
    name: normalizeText(contact && contact.name),
    role: normalizeText(contact && contact.role),
    phone: encryptSensitiveValue(contact && contact.phone),
    wechat: encryptSensitiveValue(contact && contact.wechat),
    company: normalizeText(contact && contact.company)
  }))
}

function needsMigration(contacts) {
  return Array.isArray(contacts) && contacts.some((contact) => {
    const phone = normalizeText(contact && contact.phone)
    const wechat = normalizeText(contact && contact.wechat)
    return (phone && !isEncryptedValue(phone)) || (wechat && !isEncryptedValue(wechat))
  })
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  let total = 0
  let migrated = 0
  let page = 0

  while (true) {
    const result = await db.collection('projects').where({
      _openid: openid,
      contacts: _.exists(true)
    }).orderBy('createdAt', 'asc').skip(page * PAGE_SIZE).limit(PAGE_SIZE).get()
    const list = Array.isArray(result.data) ? result.data : []

    if (!list.length) {
      break
    }

    for (const item of list) {
      total += 1
      if (!needsMigration(item.contacts)) {
        continue
      }

      await db.collection('projects').doc(item._id).update({
        data: {
          contacts: normalizeContacts(item.contacts),
          updatedAt: new Date()
        }
      })
      migrated += 1
    }

    page += 1
    if (list.length < PAGE_SIZE) {
      break
    }
  }

  return {
    ok: true,
    total,
    migrated
  }
}
