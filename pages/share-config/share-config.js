const { loadShareConfigData, createShareRecordData, reportSystemFailureData, resolveNotificationData } = require('../../services/data')
const { buildSharePreview } = require('../../services/share')
const { syncPageAppearance } = require('../../utils/appearance')
const { markProjectRelatedCachesDirty } = require('../../utils/core-page-cache')
const { ensureActionAllowed } = require('../../utils/entitlement-guard')

const SHARE_PURPOSES = {
  info: {
    key: 'info',
    title: '发送资料',
    heroTitle: '发送资料',
    heroDesc: '你继续维护项目。',
    permissionText: '查看资料',
    ownershipText: '仍由我维护',
    followText: '后续仍在当前项目里推进',
    actionText: '进入分享卡设置'
  },
  outbound: {
    key: 'outbound',
    title: '转交项目',
    heroTitle: '转交项目',
    heroDesc: '后续在“外发项目”查看。',
    permissionText: '接手后继续推进',
    ownershipText: '接手方维护',
    followText: '后续在“外发项目”查看进展',
    actionText: '进入分享卡设置'
  }
}

function normalizeMode(value) {
  return value === 'outbound' ? 'outbound' : 'info'
}

function getShareScopeName(mode) {
  return normalizeMode(mode) === 'outbound' ? '转交项目' : '发送资料'
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

function buildDefaultRuleText(preview) {
  const visibleFields = buildVisibleFields(preview)
  const contacts = Array.isArray(preview && preview.contacts) ? preview.contacts : []
  const canDirectContact = contacts.some((item) => item.phone || item.wechat)
  const scopeName = preview && preview.mode && preview.mode.key === 'outbound' ? '转交项目' : '发送资料'
  const scopeSummary = canDirectContact ? '包含联系方式' : '隐藏电话微信'
  return `${scopeName} · ${visibleFields.length} 项字段 · ${scopeSummary}`
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

Page({
  data: {
    appearancePageClass: '',
    projectId: '',
    shareTags: [],
    activeMode: 'info',
    activeTag: 't1',
    shareProject: null,
    preview: null,
    visibleFields: [],
    purposeTitle: '',
    purposeDesc: '',
    defaultRuleText: '',
    actionText: '生成资料卡并转发',
    isCreatingShare: false,
    isLoading: true,
    dataSource: 'Mock Demo'
  },

  async onLoad(options) {
    syncPageAppearance(this)
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
        title: '当前无法加载分享流程',
        icon: 'none'
      })
    }
  },

  onShow() {
    syncPageAppearance(this)
  },

  syncPreview() {
    const preview = buildSharePreview(this.data.shareProject, this.data.activeMode, this.data.activeTag, this.data.shareTags)
    const purpose = SHARE_PURPOSES[this.data.activeMode] || SHARE_PURPOSES.info
    const visibleFields = buildVisibleFields(preview)

    this.setData({
      preview,
      visibleFields,
      purposeTitle: purpose.heroTitle,
      purposeDesc: purpose.heroDesc,
      defaultRuleText: buildDefaultRuleText(preview),
      actionText: purpose.actionText
    })
  },

  async openShareCard() {
    if (this.data.isCreatingShare) {
      return
    }

    const decision = await ensureActionAllowed(
      this.data.activeMode === 'outbound' ? 'share_out' : 'share_record',
      { refresh: true, guide: true }
    )
    if (!decision.allowed) {
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
          shareTagName: getShareScopeName(this.data.activeMode),
          shareTagFields: activeTag ? activeTag.fields : []
        })
        shareRecordId = result && result.shareRecordId ? result.shareRecordId : ''

        if (result && result.reusedExistingOutbound) {
          wx.showToast({
            title: '已沿用当前项目的转交记录',
            icon: 'none'
          })
        }
      }

      await resolveNotificationData({
        projectId,
        types: ['save_failed'],
        scenes: ['share_record_create']
      })

      markProjectRelatedCachesDirty({
        projectId,
        includeHome: this.data.activeMode === 'outbound',
        includeProjects: true,
        includeSharedOut: this.data.activeMode === 'outbound',
        includeProjectDetail: true
      })

      wx.navigateTo({
        url: `/pages/share-card/share-card?projectId=${projectId}&mode=${this.data.activeMode}&tagId=${this.data.activeTag}&shareRecordId=${shareRecordId}&entry=sender`
      })
    } catch (error) {
      await reportSystemFailureData({
        type: 'save_failed',
        scene: 'share_record_create',
        title: '创建分享失败',
        message: error.message || '当前无法生成分享卡，请稍后重试',
        projectId,
        projectName: this.data.preview && this.data.preview.project ? this.data.preview.project.name : '',
        actionUrl: projectId
          ? `/pages/share-config/share-config?projectId=${projectId}&mode=${this.data.activeMode}`
          : '/pages/share-config/share-config',
        actionLabel: '重新生成'
      })

      wx.showToast({
        title: error.message || '当前无法生成分享卡，请稍后重试',
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
