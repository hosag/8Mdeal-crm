const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const DEMO_SCENARIO_KEY = 'inbound_receiver_follow_up_v1'
const DEMO_SHARE_OPENID = 'demo_sender_openid'
const DEMO_SHARE_NAME = '王顾问'

function formatDateOnly(date) {
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) {
    return ''
  }

  const year = value.getFullYear()
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  const day = `${value.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function offsetDate(base, days, hours = 0, minutes = 0) {
  const date = new Date(base)
  date.setDate(date.getDate() + days)
  date.setHours(hours, minutes, 0, 0)
  return date
}

async function ensureUserProfile(openid) {
  const now = new Date()
  const userResult = await db.collection('users').where({
    _openid: openid
  }).limit(1).get()

  if (userResult.data.length) {
    return userResult.data[0]
  }

  await db.collection('users').add({
    data: {
      _openid: openid,
      nickName: '当前用户',
      avatarUrl: '',
      shareTags: [],
      createdAt: now,
      updatedAt: now
    }
  })

  return {
    _openid: openid,
    nickName: '当前用户'
  }
}

async function ensureProject(wxContext, receiverName) {
  const existing = await db.collection('projects').where({
    _openid: wxContext.OPENID,
    demoScenarioKey: DEMO_SCENARIO_KEY
  }).limit(1).get()

  if (existing.data.length) {
    return existing.data[0]
  }

  const now = new Date()
  const projectPayload = {
    _openid: wxContext.OPENID,
    demoScenarioKey: DEMO_SCENARIO_KEY,
    projectName: '华东智造集团园区数字化改造',
    clientName: '华东智造集团',
    stage: '商务',
    estimatedAmount: 286000,
    actualAmount: 0,
    expectedCommission: 14300,
    description: '该项目由渠道伙伴外发给你，客户已完成初步预算确认，你已接手后续商务推进与方案收口。',
    nextFollowUpDate: formatDateOnly(offsetDate(now, 3)),
    status: '进行中',
    isClosed: false,
    contacts: [
      {
        contactId: 'contact-demo-1',
        name: '周博文',
        role: '信息化负责人',
        phone: '13800001234',
        wechat: 'zhoubowen-it',
        company: '华东智造集团'
      },
      {
        contactId: 'contact-demo-2',
        name: '陈思雅',
        role: '行政采购',
        phone: '13900004567',
        wechat: 'chen-siya-proc',
        company: '华东智造集团'
      }
    ],
    tags: ['渠道跟进', '外发接手'],
    isSharedProject: true,
    sourceProjectId: `demo-source-project-${wxContext.OPENID}`,
    sharedFromOpenid: DEMO_SHARE_OPENID,
    sharedFromName: DEMO_SHARE_NAME,
    receiverOpenid: wxContext.OPENID,
    receiverName,
    sourceShareRecordId: `demo-share-record-${wxContext.OPENID}`,
    sharedMode: 'outbound',
    sharedTagId: 't2',
    sharedTagName: '完整外发',
    createdAt: offsetDate(now, -2, 10, 30),
    updatedAt: now
  }

  const addResult = await db.collection('projects').add({
    data: projectPayload
  })

  return {
    _id: addResult._id,
    ...projectPayload
  }
}

async function ensureFollowUps(wxContext, projectId, receiverName) {
  const existing = await db.collection('followUps').where({
    _openid: wxContext.OPENID,
    projectId,
    demoScenarioKey: DEMO_SCENARIO_KEY
  }).get()

  const existingKeys = new Set(
    existing.data.map((item) => String(item.demoSeedType || '').trim()).filter(Boolean)
  )

  const now = new Date()
  const inserts = []

  if (!existingKeys.has('sender_sync')) {
    inserts.push({
      _openid: wxContext.OPENID,
      projectId,
      demoScenarioKey: DEMO_SCENARIO_KEY,
      demoSeedType: 'sender_sync',
      sourceFollowUpId: `demo-source-followup-${wxContext.OPENID}`,
      sharedFromOpenid: DEMO_SHARE_OPENID,
      importedFromShare: true,
      actorOpenid: DEMO_SHARE_OPENID,
      actorName: DEMO_SHARE_NAME,
      followUpTime: offsetDate(now, -2, 15, 20),
      method: '电话',
      content: '已与客户采购负责人确认预算区间约 25 到 30 万，客户希望本周内先收到实施排期和报价框架，再安排管理层复核。',
      images: [],
      stageChange: '商务',
      nextFollowUpTime: formatDateOnly(offsetDate(now, 1)),
      aiSummary: '分享方已完成预算和采购意向确认，并把项目交接给你继续推进。',
      aiHighlights: [
        '客户确认预算区间约 25 到 30 万',
        '客户接受先看报价框架再进入管理层评审',
        '项目已从渠道初筛阶段进入商务推进'
      ],
      aiRisks: [
        '正式报价前仍需补齐一期实施边界',
        '管理层评审时间尚未锁定'
      ],
      aiRecommendedStage: '商务',
      aiStageChangeReason: '客户已明确预算范围，并要求查看正式报价框架，符合商务阶段特征。',
      aiMissingInfo: [
        '一期模块边界',
        '管理层最终决策人'
      ],
      createdAt: offsetDate(now, -2, 15, 25)
    })
  }

  if (!existingKeys.has('receiver_follow_up')) {
    inserts.push({
      _openid: wxContext.OPENID,
      projectId,
      demoScenarioKey: DEMO_SCENARIO_KEY,
      demoSeedType: 'receiver_follow_up',
      actorOpenid: wxContext.OPENID,
      actorName: receiverName || '当前用户',
      followUpTime: offsetDate(now, -1, 11, 10),
      method: '面谈',
      content: '今天与你方 IT 负责人和行政采购当面沟通，确认一期先做访客管理和能耗看板，客户要求下周二前给正式报价与实施计划。',
      images: [],
      stageChange: '',
      nextFollowUpTime: formatDateOnly(offsetDate(now, 3)),
      aiSummary: '你已完成需求澄清，当前要收敛一期范围并在下周二前提交正式报价。',
      aiHighlights: [
        '已确认一期优先做访客管理和能耗看板',
        '客户要求下周二前提供正式报价',
        '接收方已进入实质推进状态'
      ],
      aiRisks: [
        '若实施计划过粗，客户可能推迟内部评审',
        '能耗数据接口是否打通仍待客户 IT 确认'
      ],
      aiRecommendedStage: '商务',
      aiStageChangeReason: '需求边界已初步明确，当前核心动作是提交报价并推进内部评审。',
      aiMissingInfo: [
        '能耗接口对接方式',
        '最终采购流程节点'
      ],
      createdAt: offsetDate(now, -1, 11, 15)
    })
  }

  for (const item of inserts) {
    await db.collection('followUps').add({
      data: item
    })
  }

  await db.collection('projects').doc(projectId).update({
    data: {
      stage: '商务',
      nextFollowUpDate: formatDateOnly(offsetDate(now, 3)),
      updatedAt: now
    }
  })

  return {
    inserted: inserts.length
  }
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const userProfile = await ensureUserProfile(wxContext.OPENID)
  const receiverName = String(userProfile.nickName || '').trim() || '当前用户'
  const project = await ensureProject(wxContext, receiverName)
  const followUpResult = await ensureFollowUps(wxContext, project._id, receiverName)

  return {
    ok: true,
    message: followUpResult.inserted ? '已生成外发接手测试项目' : '测试项目已存在，已直接复用',
    projectId: project._id,
    projectName: project.projectName,
    receiverName,
    insertedFollowUps: followUpResult.inserted
  }
}
