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

function normalizeFields(fields) {
  if (!Array.isArray(fields)) {
    return []
  }

  const unique = []
  fields.forEach((field) => {
    const value = String(field || '').trim()
    if (value && unique.indexOf(value) === -1) {
      unique.push(value)
    }
  })

  return unique
}

function normalizeTag(item, index) {
  return {
    id: String(item && item.id ? item.id : `tag-${Date.now()}-${index}`).trim(),
    name: String(item && item.name ? item.name : `标签${index + 1}`).trim(),
    desc: String(item && item.desc ? item.desc : '').trim(),
    fields: normalizeFields(item && item.fields)
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const now = new Date()
  const tagName = String(event.tagName || '').trim()
  const tagDesc = String(event.tagDesc || '').trim()
  const fields = normalizeFields(event.fields)

  if (!tagName) {
    return {
      ok: false,
      message: 'tagName is required'
    }
  }

  if (!fields.length) {
    return {
      ok: false,
      message: 'fields are required'
    }
  }

  const result = await db.collection('users').where({
    _openid: wxContext.OPENID
  }).limit(1).get()

  const currentTags = Array.isArray(result.data[0] && result.data[0].shareTags) && result.data[0].shareTags.length
    ? result.data[0].shareTags.map(normalizeTag)
    : defaultShareTags.map(normalizeTag)

  const tagId = String(event.tagId || `tag-${Date.now()}`).trim()
  const payload = {
    id: tagId,
    name: tagName,
    desc: tagDesc,
    fields
  }

  const targetIndex = currentTags.findIndex((item) => item.id === tagId)
  if (targetIndex > -1) {
    currentTags[targetIndex] = payload
  } else {
    currentTags.push(payload)
  }

  if (result.data.length) {
    await db.collection('users').doc(result.data[0]._id).update({
      data: {
        shareTags: currentTags,
        updatedAt: now
      }
    })
  } else {
    await db.collection('users').add({
      data: {
        _openid: wxContext.OPENID,
        nickName: '',
        avatarUrl: '',
        shareTags: currentTags,
        createdAt: now,
        updatedAt: now
      }
    })
  }

  return {
    ok: true,
    tag: payload,
    shareTags: currentTags
  }
}
