const { loadTagEditorData, saveShareTagData } = require('../../services/data')
const { syncPageAppearance } = require('../../utils/appearance')
const { resolveShareTags } = require('../../services/share')

const SCOPE_META = {
  info: {
    title: '发送资料',
    desc: '对方仅查看资料，项目仍由我维护。'
  },
  outbound: {
    title: '转交项目',
    desc: '对方接手后继续推进，我在外发项目查看进展。'
  }
}

function normalizeMode(value) {
  return value === 'outbound' ? 'outbound' : 'info'
}

function buildVisibleFieldOptions(visibleFields, selected) {
  const selectedFields = Array.isArray(selected) ? selected : []

  return (Array.isArray(visibleFields) ? visibleFields : []).map((field) => ({
    name: field,
    active: selectedFields.indexOf(field) > -1
  }))
}

Page({
  data: {
    appearancePageClass: '',
    mode: 'info',
    tagId: '',
    scopeTitle: '发送资料',
    scopeDesc: '对方仅查看资料，项目仍由我维护。',
    visibleFields: [],
    visibleFieldOptions: [],
    selected: [],
    isSaving: false,
    isLoading: true,
    dataSource: 'Mock Demo'
  },

  async onLoad(options) {
    syncPageAppearance(this)
    try {
      const mode = normalizeMode(options.mode)
      const { data, source } = await loadTagEditorData(options.tagId || '')
      const scopes = resolveShareTags(data.shareTags)
      const matchedScope = scopes.find((item) => item.mode === mode)
      const scopeMeta = SCOPE_META[mode] || SCOPE_META.info
      const scope = matchedScope || {
        id: mode === 'outbound' ? 't2' : 't1',
        fields: []
      }
      this.setData({
        mode,
        tagId: scope.id || '',
        scopeTitle: scopeMeta.title,
        scopeDesc: scopeMeta.desc,
        visibleFields: data.visibleFields,
        visibleFieldOptions: buildVisibleFieldOptions(data.visibleFields, scope.fields),
        selected: scope.fields,
        isLoading: false,
        dataSource: source
      })
    } catch (error) {
      this.setData({
        isLoading: false
      })
      wx.showToast({
        title: '当前无法加载标签设置',
        icon: 'none'
      })
    }
  },

  onShow() {
    syncPageAppearance(this)
  },

  toggleField(event) {
    const field = event.currentTarget.dataset.field
    const selected = (Array.isArray(this.data.selected) ? this.data.selected : []).slice()
    const index = selected.indexOf(field)

    if (index > -1) {
      selected.splice(index, 1)
    } else {
      selected.push(field)
    }

    this.setData({
      selected,
      visibleFieldOptions: buildVisibleFieldOptions(this.data.visibleFields, selected)
    })
  },

  async handleSave() {
    if (this.data.isSaving) {
      return
    }

    if (!this.data.selected.length) {
      wx.showToast({
        title: '至少选择一个可见字段',
        icon: 'none'
      })
      return
    }

    this.setData({
      isSaving: true
    })

    try {
      const result = await saveShareTagData({
        tagId: this.data.tagId,
        mode: this.data.mode,
        tagName: this.data.scopeTitle,
        tagDesc: this.data.scopeDesc,
        fields: this.data.selected
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '保存失败')
      }

      wx.showToast({
        title: '设置已保存',
        icon: 'success'
      })

      setTimeout(() => {
        wx.navigateBack({
          delta: 1
        })
      }, 320)
    } catch (error) {
      wx.showToast({
        title: error.message || '当前无法保存设置，请稍后重试',
        icon: 'none'
      })
    } finally {
      this.setData({
        isSaving: false
      })
    }
  },

  goBack() {
    wx.navigateBack({
      delta: 1
    })
  },

  openPage(event) {
    const { url } = event.currentTarget.dataset
    wx.navigateTo({ url })
  }
})
