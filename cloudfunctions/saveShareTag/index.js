const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const defaultShareTags = [
  {
    id: 't1',
    mode: 'info',
    name: '发送资料',
    desc: '对方仅查看资料，项目仍由我维护。',
    fields: ['项目名称', '客户名称', '当前阶段', '预计金额', '联系人姓名', '项目描述']
  },
  {
    id: 't2',
    mode: 'outbound',
    name: '转交项目',
    desc: '对方接手后继续推进，我在外发项目查看进展。',
    fields: ['项目名称', '客户名称', '当前阶段', '预计金额', '项目描述', '联系人姓名', '联系人电话', '联系人微信', '下一步动作', '分享来源']
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
    mode: item && item.mode === 'outbound' ? 'outbound' : (item && item.mode === 'info' ? 'info' : ''),
    name: String(item && item.name ? item.name : `标签${index + 1}`).trim(),
    desc: String(item && item.desc ? item.desc : '').trim(),
    fields: normalizeFields(item && item.fields)
  }
}

function hasContactField(tag) {
  const fields = Array.isArray(tag && tag.fields) ? tag.fields : []
  return fields.indexOf('全部字段') > -1
    || fields.indexOf('联系人电话') > -1
    || fields.indexOf('联系人微信') > -1
    || fields.indexOf('下一步动作') > -1
}

function isOutboundScopeTag(tag) {
  const name = String(tag && tag.name || '')
  return tag && (
    tag.mode === 'outbound'
    || tag.id === 't2'
    || name.indexOf('转交') > -1
    || name.indexOf('外发') > -1
    || name.indexOf('全量') > -1
    || hasContactField(tag)
  )
}

function isInfoScopeTag(tag) {
  return tag && (
    tag.mode === 'info'
    || tag.id === 't1'
    || !hasContactField(tag)
  )
}

function buildScopeTag(scope, source) {
  const fields = Array.isArray(source && source.fields) && source.fields.length
    ? source.fields
    : scope.fields

  return {
    ...scope,
    fields: fields.slice()
  }
}

function resolveShareTags(tags) {
  const normalizedTags = Array.isArray(tags) ? tags.map(normalizeTag) : []
  const infoSource = normalizedTags.find(isInfoScopeTag)
  const outboundSource = normalizedTags.find(isOutboundScopeTag)

  return defaultShareTags.map((scope) => {
    if (scope.mode === 'outbound') {
      return buildScopeTag(scope, outboundSource)
    }
    return buildScopeTag(scope, infoSource)
  })
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const now = new Date()
  const mode = event.mode === 'outbound' || event.tagId === 't2' ? 'outbound' : 'info'
  const scope = defaultShareTags.find((item) => item.mode === mode) || defaultShareTags[0]
  const fields = normalizeFields(event.fields)

  if (!fields.length) {
    return {
      ok: false,
      message: 'fields are required'
    }
  }

  const result = await db.collection('users').where({
    _openid: wxContext.OPENID
  }).limit(1).get()

  const currentTags = resolveShareTags(result.data[0] && result.data[0].shareTags)

  const payload = {
    ...scope,
    fields
  }

  const targetIndex = currentTags.findIndex((item) => item.mode === mode)
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
        wechatNickname: '',
        customDisplayName: '',
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
