const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const PAGE_SIZE = 100
const CONTACT_CRYPTO_SECRET = String(process.env.CONTACT_CRYPTO_SECRET || '').trim()
if (!CONTACT_CRYPTO_SECRET) {
  throw new Error('CONTACT_CRYPTO_SECRET is required')
}
const CONTACT_CRYPTO_PREFIX = 'enc:v1'
const CONTACT_CRYPTO_KEY = crypto.createHash('sha256').update(CONTACT_CRYPTO_SECRET).digest()

function normalizeText(value) {
  return String(value || '').trim()
}

function isEncryptedValue(value) {
  return normalizeText(value).startsWith(`${CONTACT_CRYPTO_PREFIX}:`)
}

function decryptSensitiveValue(value) {
  const text = normalizeText(value)
  if (!text) {
    return ''
  }

  if (!isEncryptedValue(text)) {
    return text
  }

  const parts = text.split(':')
  if (parts.length !== 5) {
    return ''
  }

  try {
    const iv = Buffer.from(parts[2], 'base64')
    const authTag = Buffer.from(parts[3], 'base64')
    const encrypted = Buffer.from(parts[4], 'base64')
    const decipher = crypto.createDecipheriv('aes-256-gcm', CONTACT_CRYPTO_KEY, iv)
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return decrypted.toString('utf8').trim()
  } catch (error) {
    return ''
  }
}

function parseDateTime(value) {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateTime(value) {
  const date = parseDateTime(value)
  if (!date) {
    return '最近'
  }

  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

function uniqueList(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((item) => normalizeText(item))
    .filter(Boolean))]
}

function maskPhone(value) {
  const text = normalizeText(value)
  if (!text) {
    return ''
  }

  const digits = text.replace(/\s+/g, '')
  if (digits.length < 7) {
    return text
  }

  return `${digits.slice(0, 3)}****${digits.slice(-4)}`
}

function maskWechat(value) {
  const text = normalizeText(value)
  if (!text) {
    return ''
  }

  if (text.length <= 4) {
    return text
  }

  return `${text.slice(0, 2)}***${text.slice(-2)}`
}

function buildContactKey(contact, fallbackKey) {
  const phone = normalizeText(contact.phone)
  const wechat = normalizeText(contact.wechat).toLowerCase()
  const name = normalizeText(contact.name)
  const company = normalizeText(contact.company)
  const role = normalizeText(contact.role)

  if (phone) {
    return `phone:${phone}`
  }

  if (wechat) {
    return `wechat:${wechat}`
  }

  if (name && company) {
    return `name_company:${name}__${company}`
  }

  if (name && role) {
    return `name_role:${name}__${role}`
  }

  if (name) {
    return `name:${name}`
  }

  return fallbackKey
}

function buildRoleTags(roles) {
  const source = uniqueList(roles)
  const tags = []
  const roleText = source.join(' ')

  if (/董事长|总经理|老板|决策|拍板|CEO|总裁|VP|副总/i.test(roleText)) {
    tags.push('关键人')
  }
  if (/内线|关系|顾问|引荐|支持/i.test(roleText)) {
    tags.push('内线')
  }
  if (/采购|法务|招标/i.test(roleText)) {
    tags.push('采购相关')
  }
  if (/技术|实施|IT|运维|顾问|架构/i.test(roleText)) {
    tags.push('技术接口')
  }
  if (/财务|付款|出纳/i.test(roleText)) {
    tags.push('资金相关')
  }

  return uniqueList(tags).slice(0, 3)
}

async function fetchAll(collectionName, where, orderField = '', orderDirection = 'desc') {
  const rows = []
  let page = 0

  while (true) {
    let query = db.collection(collectionName).where(where).skip(page * PAGE_SIZE).limit(PAGE_SIZE)
    if (orderField) {
      query = query.orderBy(orderField, orderDirection)
    }

    const result = await query.get()
    const list = Array.isArray(result.data) ? result.data : []
    rows.push(...list)

    if (list.length < PAGE_SIZE) {
      break
    }

    page += 1
  }

  return rows
}

function ensureAggregate(map, key, contact, project) {
  if (map[key]) {
    return map[key]
  }

  const name = normalizeText(contact.name)
  const role = normalizeText(contact.role)
  const company = normalizeText(contact.company || project.clientName)
  const phone = normalizeText(contact.phone)
  const wechat = normalizeText(contact.wechat)

  map[key] = {
    id: key,
    name,
    company,
    phone,
    wechat,
    roles: role ? [role] : [],
    roleTags: [],
    projectMap: {},
    projectNames: [],
    stageTags: [],
    latestTouchAt: null,
    latestSummary: '',
    latestProjectId: '',
    latestProjectName: '',
    latestProjectClient: '',
    latestOwnerLabel: '',
    latestOwnerType: '',
    projects: []
  }

  return map[key]
}

function pushProject(aggregate, project, projectLatestTouchAt, projectLatestSummary) {
  if (aggregate.projectMap[project._id]) {
    return
  }

  const isReadOnlySharedOut = project.handoverStatus === 'handed_over' && !project.isSharedProject
  const ownerLabel = project.isSharedProject
    ? `${normalizeText(project.sharedFromName) || '分享方'} 外发给我`
    : (isReadOnlySharedOut ? `已转交给 ${normalizeText(project.handoverToName) || '接手方'}` : '我负责推进')
  const ownerType = project.isSharedProject
    ? 'shared_in'
    : (isReadOnlySharedOut ? 'shared_out_readonly' : 'owned')

  const projectEntry = {
    id: project._id,
    name: normalizeText(project.projectName) || '未命名项目',
    client: normalizeText(project.clientName) || '未填写客户',
    stage: normalizeText(project.stage) || '线索',
    latestSummary: projectLatestSummary || '当前还没有跟进摘要',
    latestTouchText: formatDateTime(projectLatestTouchAt || project.updatedAt || project.createdAt),
    latestTouchRaw: (() => {
      const source = parseDateTime(projectLatestTouchAt || project.updatedAt || project.createdAt)
      return source ? source.toISOString() : ''
    })(),
    ownerLabel,
    ownerType
  }

  aggregate.projectMap[project._id] = true
  aggregate.projectNames.push(projectEntry.name)
  aggregate.projects.push(projectEntry)
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const projects = await fetchAll('projects', {
    _openid: wxContext.OPENID
  }, 'updatedAt', 'desc')
  const visibleProjects = projects

  if (!visibleProjects.length) {
    return {
      ok: true,
      contacts: []
    }
  }

  const projectMap = {}
  const projectIds = []
  visibleProjects.forEach((project) => {
    projectMap[project._id] = project
    projectIds.push(project._id)
  })

  const followUps = await fetchAll('followUps', {
    _openid: wxContext.OPENID
  }, 'followUpTime', 'desc')
  const latestFollowMap = {}

  followUps.forEach((followUp) => {
    const projectId = normalizeText(followUp && followUp.projectId)
    if (!projectId || !projectMap[projectId] || latestFollowMap[projectId]) {
      return
    }

    latestFollowMap[projectId] = followUp
  })

  const contactMap = {}

  visibleProjects.forEach((project, projectIndex) => {
    const rawContacts = Array.isArray(project.contacts) ? project.contacts : []
    const latestFollow = latestFollowMap[project._id] || null
    const latestFollowTime = parseDateTime(latestFollow && (latestFollow.followUpTime || latestFollow.createdAt))
    const projectUpdatedAt = parseDateTime(project.updatedAt || project.createdAt)
    const projectLatestTouchAt = latestFollowTime || projectUpdatedAt
    const projectLatestSummary = normalizeText(latestFollow && (latestFollow.aiSummary || latestFollow.content))
      || normalizeText(project.description)

    rawContacts.forEach((rawContact, contactIndex) => {
      const contact = {
        name: normalizeText(rawContact && rawContact.name),
        role: normalizeText(rawContact && rawContact.role),
        company: normalizeText(rawContact && rawContact.company),
        phone: decryptSensitiveValue(rawContact && rawContact.phone),
        wechat: decryptSensitiveValue(rawContact && rawContact.wechat)
      }

      if (!contact.name) {
        return
      }

      const key = buildContactKey(contact, `contact:${project._id}:${projectIndex}:${contactIndex}`)
      const aggregate = ensureAggregate(contactMap, key, contact, project)

      if (!aggregate.company && contact.company) {
        aggregate.company = contact.company
      }
      if (!aggregate.phone && contact.phone) {
        aggregate.phone = contact.phone
      }
      if (!aggregate.wechat && contact.wechat) {
        aggregate.wechat = contact.wechat
      }
      if (contact.role) {
        aggregate.roles.push(contact.role)
      }

      const currentLatestTime = aggregate.latestTouchAt ? aggregate.latestTouchAt.getTime() : 0
      const candidateLatestTime = projectLatestTouchAt ? projectLatestTouchAt.getTime() : 0
      if (candidateLatestTime >= currentLatestTime) {
        const isReadOnlySharedOut = project.handoverStatus === 'handed_over' && !project.isSharedProject
        aggregate.latestTouchAt = projectLatestTouchAt
        aggregate.latestSummary = projectLatestSummary || aggregate.latestSummary
        aggregate.latestProjectId = project._id
        aggregate.latestProjectName = normalizeText(project.projectName) || '未命名项目'
        aggregate.latestProjectClient = normalizeText(project.clientName) || ''
        aggregate.latestOwnerLabel = project.isSharedProject
          ? `${normalizeText(project.sharedFromName) || '分享方'} 外发给我`
          : (isReadOnlySharedOut ? `已转交给 ${normalizeText(project.handoverToName) || '接手方'}` : '我负责推进')
        aggregate.latestOwnerType = project.isSharedProject
          ? 'shared_in'
          : (isReadOnlySharedOut ? 'shared_out_readonly' : 'owned')
      }

      aggregate.stageTags.push(normalizeText(project.stage) || '线索')
      pushProject(aggregate, project, projectLatestTouchAt, projectLatestSummary)
    })
  })

  const contacts = Object.keys(contactMap)
    .map((key) => {
      const item = contactMap[key]
      const roles = uniqueList(item.roles)
      const roleTags = buildRoleTags(roles)
      const stageTags = uniqueList(item.stageTags)
      const projectsList = item.projects
        .slice()
        .sort((left, right) => new Date(right.latestTouchRaw || 0).getTime() - new Date(left.latestTouchRaw || 0).getTime())

      return {
        id: item.id,
        name: item.name || '未命名联系人',
        company: item.company || item.latestProjectClient || '',
        roleSummary: roles.length ? roles.join(' / ') : '未标注角色',
        phone: item.phone,
        phoneMasked: maskPhone(item.phone),
        wechat: item.wechat,
        wechatMasked: maskWechat(item.wechat),
        hasPhone: Boolean(item.phone),
        hasWechat: Boolean(item.wechat),
        relationTags: roleTags,
        isKeyContact: roleTags.includes('关键人'),
        stageTags: stageTags.slice(0, 4),
        projectCount: projectsList.length,
        projectNames: uniqueList(item.projectNames),
        latestFollowUpText: formatDateTime(item.latestTouchAt),
        latestFollowUpTimeRaw: item.latestTouchAt ? item.latestTouchAt.toISOString() : '',
        latestSummary: item.latestSummary || '当前还没有沟通摘要',
        latestProjectId: item.latestProjectId || (projectsList[0] ? projectsList[0].id : ''),
        latestProjectName: item.latestProjectName || (projectsList[0] ? projectsList[0].name : ''),
        latestOwnerLabel: item.latestOwnerLabel || (projectsList[0] ? projectsList[0].ownerLabel : ''),
        latestOwnerType: item.latestOwnerType || (projectsList[0] ? projectsList[0].ownerType : ''),
        projectCards: projectsList
      }
    })
    .sort((left, right) => {
      const leftTime = parseDateTime(left.latestFollowUpTimeRaw)
      const rightTime = parseDateTime(right.latestFollowUpTimeRaw)
      const timeWeight = (rightTime ? rightTime.getTime() : 0) - (leftTime ? leftTime.getTime() : 0)
      if (timeWeight !== 0) {
        return timeWeight
      }

      return left.name.localeCompare(right.name, 'zh-CN')
    })

  return {
    ok: true,
    contacts
  }
}
