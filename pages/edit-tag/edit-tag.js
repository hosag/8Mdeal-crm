const { loadTagEditorData, saveShareTagData } = require('../../services/data')

function buildVisibleFieldOptions(visibleFields, selected) {
  const selectedFields = Array.isArray(selected) ? selected : []

  return (Array.isArray(visibleFields) ? visibleFields : []).map((field) => ({
    name: field,
    active: selectedFields.indexOf(field) > -1
  }))
}

Page({
  data: {
    tagId: '',
    tagName: '',
    tagDesc: '',
    visibleFields: [],
    visibleFieldOptions: [],
    selected: [],
    isSaving: false,
    isLoading: true,
    dataSource: 'Mock Demo'
  },

  async onLoad(options) {
    try {
      const { data, source } = await loadTagEditorData(options.tagId || '')
      this.setData({
        tagId: data.tag.id || '',
        tagName: data.tag.name,
        tagDesc: data.tag.desc,
        visibleFields: data.visibleFields,
        visibleFieldOptions: buildVisibleFieldOptions(data.visibleFields, data.tag.fields),
        selected: data.tag.fields,
        isLoading: false,
        dataSource: source
      })
    } catch (error) {
      this.setData({
        isLoading: false
      })
      wx.showToast({
        title: '暂时无法加载标签设置',
        icon: 'none'
      })
    }
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

  onTagNameInput(event) {
    this.setData({
      tagName: event.detail.value
    })
  },

  onTagDescInput(event) {
    this.setData({
      tagDesc: event.detail.value
    })
  },

  async handleSave() {
    if (this.data.isSaving) {
      return
    }

    if (!String(this.data.tagName || '').trim()) {
      wx.showToast({
        title: '请先填写标签名称',
        icon: 'none'
      })
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
        tagName: this.data.tagName,
        tagDesc: this.data.tagDesc,
        fields: this.data.selected
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '保存失败')
      }

      wx.showToast({
        title: '标签已保存',
        icon: 'success'
      })

      setTimeout(() => {
        wx.navigateBack({
          delta: 1
        })
      }, 320)
    } catch (error) {
      wx.showToast({
        title: error.message || '暂时无法保存标签，请稍后重试',
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
