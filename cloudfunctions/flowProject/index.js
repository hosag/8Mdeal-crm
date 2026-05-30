const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNumber(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

function normalizeSilenceDays(value) {
  const days = Math.floor(Number(value) || 0)
  return [0, 7, 14, 30].includes(days) ? days : 0
}

function clone(value) {
  if (!value || typeof value !== 'object') {
    return value
  }

  return JSON.parse(JSON.stringify(value))
}

async function resolveAccountAccessContext(openid) {
  const identityResult = await db.collection('accountIdentities').where({
    provider: 'wechat_mp',
    openid
  }).limit(1).get()
  const identity = identityResult.data[0] || null
  const accountId = normalizeText(identity && identity.accountId)

  if (!accountId) {
    throw new Error('ACCOUNT_NOT_INITIALIZED: 当前账号尚未初始化，请重新进入小程序后再试')
  }

  const accountResult = await db.collection('accounts').where({
    accountId
  }).limit(1).get()
  const entitlementsResult = await db.collection('entitlements').where({
    accountId
  }).limit(1).get()

  return {
    accountId,
    account: accountResult.data[0] || null,
    entitlements: entitlementsResult.data[0] || null
  }
}

function ensureCreateProjectAccess(context) {
  const account = context && context.account ? context.account : {}
  const entitlements = context && context.entitlements ? context.entitlements : {}
  const status = normalizeText(entitlements.status || account.status || 'trialing')

  if (status === 'disabled') {
    throw new Error('ACCOUNT_DISABLED: 当前账号已被禁用')
  }

  if (account.phoneVerified !== true || (entitlements && entitlements.bindRequiredForWrite)) {
    throw new Error('ACCOUNT_PHONE_REQUIRED: 保存正式数据前需要先绑定手机号')
  }

  if (!entitlements || !Object.keys(entitlements).length) {
    if (status === 'free_limited' || status === 'expired_readonly') {
      throw new Error('ENTITLEMENT_WRITE_DISABLED: 当前账号为只读状态')
    }
    return
  }

  if (!entitlements.canCreateProject) {
    const projectLimit = Number(entitlements.projectLimit)
    const currentProjectCount = Number(entitlements.currentProjectCount)
    if (projectLimit > -1 && currentProjectCount >= projectLimit) {
      throw new Error('ENTITLEMENT_PROJECT_LIMIT_REACHED: 当前项目数量已达上限')
    }
    throw new Error('ENTITLEMENT_WRITE_DISABLED: 当前账号为只读状态')
  }
}

function buildClonedContacts(contacts) {
  const list = Array.isArray(contacts) ? contacts : []
  const now = Date.now()

  return list
    .map((contact, index) => {
      const current = contact && typeof contact === 'object' ? contact : {}
      return {
        contactId: `contact-${now}-${index}`,
        name: normalizeText(current.name),
        role: normalizeText(current.role),
        phone: normalizeText(current.phone),
        wechat: normalizeText(current.wechat),
        company: normalizeText(current.company)
      }
    })
    .filter((contact) => contact.name)
}

function buildCloneStaticProjectPayload(sourceProject, accessContext, now) {
  const sourceName = normalizeText(sourceProject.projectName) || '未命名项目'

  return {
    accountId: accessContext.accountId,
    ownerAccountId: accessContext.accountId,
    writeSource: 'project_flow_clone',
    projectName: `${sourceName} · 复制`,
    clientName: normalizeText(sourceProject.clientName) || '未填写客户',
    stage: '线索',
    estimatedAmount: normalizeNumber(sourceProject.estimatedAmount),
    actualAmount: 0,
    expectedCommission: normalizeNumber(sourceProject.expectedCommission),
    followUpSilenceDays: normalizeSilenceDays(sourceProject.followUpSilenceDays),
    description: normalizeText(sourceProject.description),
    tags: Array.isArray(sourceProject.tags) ? clone(sourceProject.tags).map(normalizeText).filter(Boolean) : [],
    voiceAliases: Array.isArray(sourceProject.voiceAliases) ? clone(sourceProject.voiceAliases).map(normalizeText).filter(Boolean) : [],
    contacts: buildClonedContacts(sourceProject.contacts),
    isClosed: false,
    sourceProjectId: sourceProject._id,
    sourceProjectName: sourceName,
    sourceFlowMode: 'clone_static',
    sourceFlowIntent: 'self_clone',
    sourceFlowCreatedAt: now,
    createdAt: now,
    updatedAt: now
  }
}

async function addProjectFlowRecord(payload) {
  try {
    const result = await db.collection('projectFlows').add({
      data: payload
    })
    return result._id
  } catch (error) {
    return ''
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const accessContext = await resolveAccountAccessContext(wxContext.OPENID)
  const flowMode = normalizeText(event.flowMode)
  const projectId = normalizeText(event.projectId)

  if (!projectId) {
    return {
      ok: false,
      message: 'projectId is required'
    }
  }

  if (flowMode !== 'clone_static') {
    return {
      ok: false,
      message: 'unsupported flowMode'
    }
  }

  ensureCreateProjectAccess(accessContext)

  const sourceResult = await db.collection('projects').where({
    _id: projectId,
    _openid: wxContext.OPENID
  }).limit(1).get()

  if (!sourceResult.data.length) {
    return {
      ok: false,
      message: 'project not found'
    }
  }

  const sourceProject = sourceResult.data[0]
  const now = new Date()
  const flowRecordId = await addProjectFlowRecord({
    _openid: wxContext.OPENID,
    accountId: accessContext.accountId,
    sourceProjectId: sourceProject._id,
    sourceProjectName: normalizeText(sourceProject.projectName) || '未命名项目',
    flowMode: 'clone_static',
    flowIntent: 'self_clone',
    targetOpenid: wxContext.OPENID,
    targetAccountId: accessContext.accountId,
    status: 'completed',
    createdAt: now,
    updatedAt: now
  })
  const payload = {
    ...buildCloneStaticProjectPayload(sourceProject, accessContext, now),
    sourceFlowRecordId: flowRecordId
  }

  const addResult = await db.collection('projects').add({
    data: {
      _openid: wxContext.OPENID,
      ...payload
    }
  })

  if (flowRecordId) {
    try {
      await db.collection('projectFlows').doc(flowRecordId).update({
        data: {
          targetProjectId: addResult._id,
          updatedAt: now
        }
      })
    } catch (error) {
      // The cloned project is already created; flow trace update is best-effort.
    }
  }

  return {
    ok: true,
    flowMode: 'clone_static',
    projectId: addResult._id,
    sourceProjectId: sourceProject._id,
    sourceFlowRecordId: flowRecordId
  }
}
