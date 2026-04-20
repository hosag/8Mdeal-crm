const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const defaultShareTags = [
  {
    id: 't1',
    name: '基础浏览',
    desc: '隐藏电话、微信，仅展示项目基础信息与联系人姓名。',
    fields: ['项目名称', '客户名称', '当前阶段', '预计金额', '联系人姓名', '项目描述']
  },
  {
    id: 't2',
    name: '完整外发',
    desc: '展示完整联系方式与下一步动作，适合项目接手。',
    fields: ['项目名称', '客户名称', '当前阶段', '预计金额', '项目描述', '联系人姓名', '联系人电话', '联系人微信', '下一步动作', '分享来源']
  },
  {
    id: 't3',
    name: '全量查看',
    desc: '展示全部可分享字段，并附带来源说明。',
    fields: ['全部字段']
  }
]

const visibleFields = [
  '项目名称',
  '客户名称',
  '当前阶段',
  '预计金额',
  '项目描述',
  '联系人姓名',
  '联系人电话',
  '联系人微信',
  '跟进摘要',
  '下一步动作',
  '分享来源',
  '全部字段'
]

function clone(data) {
  return JSON.parse(JSON.stringify(data))
}

function normalizeTag(item, index) {
  const fields = Array.isArray(item && item.fields)
    ? item.fields.map((field) => String(field || '').trim()).filter(Boolean)
    : []

  return {
    id: String(item && item.id ? item.id : `tag-${Date.now()}-${index}`).trim(),
    name: String(item && item.name ? item.name : `标签${index + 1}`).trim(),
    desc: String(item && item.desc ? item.desc : '').trim(),
    fields
  }
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const result = await db.collection('users').where({
    _openid: wxContext.OPENID
  }).limit(1).get()

  const user = result.data[0]
  const shareTags = Array.isArray(user && user.shareTags) && user.shareTags.length
    ? user.shareTags.map(normalizeTag)
    : clone(defaultShareTags)

  return {
    ok: true,
    shareTags,
    visibleFields: clone(visibleFields)
  }
}
