const { loadShareConfigData, createShareRecordData, reportSystemFailureData, resolveNotificationData } = require('../../services/data')
const { buildSharePreview } = require('../../services/share')

const SHARE_PURPOSES = {
  info: {
    key: 'info',
    title: '发送资料',
    heroTitle: '把资料发出去，不转走项目',
    heroDesc: '适合项目介绍、阶段同步和授权查看。对方能看到你开放的内容，但不会接管项目本身。',
    permissionText: '只看资料',
    ownershipText: '仍由我维护',
    followText: '后续仍在当前项目里推进',
    actionText: '生成资料卡并转发'
  },
  outbound: {
    key: 'outbound',
    title: '转交项目',
    heroTitle: '把项目正式转给接手方',
    heroDesc: '适合正式交接项目管理权。对方打开后自动接手项目，你改到“外发项目”中追踪后续进展。',
    permissionText: '接手后继续推进',
    ownershipText: '接手方维护',
    followText: '你到“外发项目”里追踪进展',
    actionText: '生成交接卡并转发'
  }
}

function normalizeMode(value) {
  return value === 'outbound' ? 'outbound' : 'info'
}

function buildVisibleFields(preview) {
  const fields = ['项目名称']
  const contacts = Array.isArray(preview && preview.contacts) ? preview.contacts : []

  if (preview && preview.showClient) {
    fields.push('客户名称')
  }
  if (preview && preview.showStage) {
    fields.push('当前阶段')
  }
  if (preview && preview.showEstimatedAmount) {
    fields.push('预计金额')
  }
  if (preview && preview.showDescription) {
    fields.push('项目描述')
  }
  if (preview && preview.showSummary) {
    fields.push('跟进摘要')
  }
  if (preview && preview.showNextFollowUp) {
    fields.push('下一步动作')
  }
  if (contacts.length) {
    fields.push('联系人姓名')
  }
  if (contacts.some((item) => item.phone)) {
    fields.push('联系人电话')
  }
  if (contacts.some((item) => item.wechat)) {
    fields.push('联系人微信')
  }

  return fields
}

function buildDefaultRuleText(preview, purpose) {
  const visibleFields = buildVisibleFields(preview)
  const contacts = Array.isArray(preview && preview.contacts) ? preview.contacts : []
  const canDirectContact = contacts.some((item) => item.phone || item.wechat)
  const scopeName = preview && preview.tag ? preview.tag.name : '默认规则'
  const scopeSummary = canDirectContact ? '包含联系方式' : '隐藏电话微信'
  return `${purpose.title} 当前按“${scopeName}”默认规则生成，${scopeSummary}，共展示 ${visibleFields.length} 类核心信息。`
}

function hasField(tag, fieldName) {
  const fields = Array.isArray(tag && tag.fields) ? tag.fields : []
  return fields.indexOf('全部字段') > -1 || fields.indexOf(fieldName) > -1
}

function resolveDefaultTagId(tags, mode) {
  const list = Array.isArray(tags) ? tags : []
  if (!list.length) {
    return mode === 'outbound' ? 't2' : 't1'
  }

  if (mode === 'outbound') {
    const matched = list.find((item) => hasField(item, '联系人电话') || hasField(item, '联系人微信') || String(item.name || '').includes('外发'))
    return matched ? matched.id : list[0].id
  }

  const matched = list.find((item) => !hasField(item, '联系人电话') && !hasField(item, '联系人微信'))
  return matched ? matched.id : list[0].id
}

function buildSummaryCards(preview, purpose) {
  const contacts = Array.isArray(preview && preview.contacts) ? preview.contacts : []
  const canDirectContact = contacts.some((item) => item.phone || item.wechat)

  return [
    {
      label: '发送后会怎样',
      value: purpose.key === 'outbound' ? '对方接手项目' : '对方只看资料',
      note: purpose.key === 'outbound' ? '打开后自动进入对方“我的项目”' : '不会进入对方“我的项目”'
    },
    {
      label: '对方能做什么',
      value: purpose.permissionText,
      note: canDirectContact ? '按默认规则可直接联系关键联系人' : '默认规则下不展示电话微信'
    },
    {
      label: '谁继续维护',
      value: purpose.ownershipText,
      note: purpose.followText
    }
  ]
}

Page({
  data: {
    projectId: '',
    shareTags: [],
    activeMode: 'info',
    activeTag: 't1',
    shareProject: null,
    preview: null,
    summaryCards: [],
    purposeTitle: '',
    purposeDesc: '',
    defaultRuleText: '',
    actionText: '生成资料卡并转发',
    isCreatingShare: false,
    isLoading: true,
    dataSource: 'Mock Demo'
  },

  async onLoad(options) {
    const projectId = options.projectId || ''
    const activeMode = normalizeMode(options.mode)
    const requestedTagId = String(options.tagId || '').trim()

    try {
      const { data, source } = await loadShareConfigData(projectId)
      const nextActiveTag = Array.isArray(data.shareTags) && data.shareTags.some((item) => item.id === requestedTagId)
        ? requestedTagId
        : resolveDefaultTagId(data.shareTags, activeMode)
      this.setData({
        projectId,
        shareTags: data.shareTags,
        shareProject: data.shareProject,
        activeMode,
        activeTag: nextActiveTag,
        isLoading: false,
        dataSource: source
      }, () => {
        this.syncPreview()
      })
    } catch (error) {
      this.setData({
        isLoading: false
      })
      wx.showToast({
        title: '暂时无法加载分享流程',
        icon: 'none'
      })
    }
  },

  syncPreview() {
    const preview = buildSharePreview(this.data.shareProject, this.data.activeMode, this.data.activeTag, this.data.shareTags)
    const purpose = SHARE_PURPOSES[this.data.activeMode] || SHARE_PURPOSES.info

    this.setData({
      preview,
      summaryCards: buildSummaryCards(preview, purpose),
      purposeTitle: purpose.heroTitle,
      purposeDesc: purpose.heroDesc,
      defaultRuleText: buildDefaultRuleText(preview, purpose),
      actionText: purpose.actionText
    })
  },

  async openShareCard() {
    if (this.data.isCreatingShare) {
      return
    }

    const projectId = this.data.preview && this.data.preview.project && this.data.preview.project.id
      ? this.data.preview.project.id
      : this.data.projectId
    const activeTag = (this.data.shareTags || []).find((item) => item.id === this.data.activeTag)

    this.setData({
      isCreatingShare: true
    })

    try {
      let shareRecordId = ''
      if (projectId) {
        const result = await createShareRecordData({
          projectId,
          shareMode: this.data.activeMode,
          shareTagId: this.data.activeTag,
          shareTagName: activeTag ? activeTag.name : '',
          shareTagFields: activeTag ? activeTag.fields : []
        })
        shareRecordId = result && result.shareRecordId ? result.shareRecordId : ''
      }

      await resolveNotificationData({
        projectId,
        types: ['save_failed'],
        scenes: ['share_record_create']
      })

      wx.navigateTo({
        url: `/pages/share-card/share-card?projectId=${projectId}&mode=${this.data.activeMode}&tagId=${this.data.activeTag}&shareRecordId=${shareRecordId}&entry=sender`
      })
    } catch (error) {
      await reportSystemFailureData({
        type: 'save_failed',
        scene: 'share_record_create',
        title: '创建分享失败',
        message: error.message || '暂时无法生成分享卡，请稍后重试',
        projectId,
        projectName: this.data.preview && this.data.preview.project ? this.data.preview.project.name : '',
        actionUrl: projectId
          ? `/pages/share-config/share-config?projectId=${projectId}&mode=${this.data.activeMode}`
          : '/pages/share-config/share-config',
        actionLabel: '重新生成'
      })

      wx.showToast({
        title: error.message || '暂时无法生成分享卡，请稍后重试',
        icon: 'none'
      })
    } finally {
      this.setData({
        isCreatingShare: false
      })
    }
  },

  openScopeSettings() {
    wx.navigateTo({
      url: '/pages/privacy-tags/privacy-tags'
    })
  }
})
