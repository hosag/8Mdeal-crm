const { loadProjectFormData, saveProjectData, reportSystemFailureData, resolveNotificationData } = require('../../services/data')
const { syncPageAppearance } = require('../../utils/appearance')
const { ensureActionAllowed } = require('../../utils/entitlement-guard')

Page({
  data: {
    appearancePageClass: '',
    projectId: '',
    isEdit: false,
    isLoading: true,
    isSaving: false,
    dataSource: 'Mock Demo',
    stages: ['线索', '洽谈', '方案', '商务', '成交', '流失'],
    silenceReminderOptions: [
      { value: 0, label: '不提醒' },
      { value: 7, label: '7天' },
      { value: 14, label: '14天' },
      { value: 30, label: '30天' }
    ],
    stageIndex: 0,
    form: {
      projectName: '',
      clientName: '',
      voiceAliasesText: '',
      stage: '线索',
      estimatedAmount: '',
      expectedCommission: '',
      followUpSilenceDays: 0,
      tagsText: '',
      description: '',
      contacts: [
        {
          name: '',
          role: '',
          phone: '',
          wechat: '',
          company: ''
        }
      ]
    }
  },

  safeSetData(update, callback) {
    if (!this.isPageActive) {
      return
    }

    this.setData(update, callback)
  },

  async onLoad(options) {
    this.isPageActive = true
    syncPageAppearance(this)
    const projectId = options.projectId || ''
    try {
      const { data, source } = await loadProjectFormData(projectId)
      const stageIndex = this.data.stages.indexOf(data.stage)

      this.safeSetData({
        projectId,
        isEdit: !!projectId,
        isLoading: false,
        dataSource: source,
        form: data,
        stageIndex: stageIndex > -1 ? stageIndex : 0
      })
    } catch (error) {
      this.safeSetData({ isLoading: false })
      wx.showToast({
        title: '当前无法加载项目信息',
        icon: 'none'
      })
    }
  },

  onShow() {
    this.isPageActive = true
    syncPageAppearance(this)
  },

  onHide() {
    this.isPageActive = false
    if (this.redirectTimer) {
      clearTimeout(this.redirectTimer)
      this.redirectTimer = null
    }
  },

  onUnload() {
    this.isPageActive = false
    if (this.redirectTimer) {
      clearTimeout(this.redirectTimer)
      this.redirectTimer = null
    }
  },

  onFieldInput(event) {
    const { field } = event.currentTarget.dataset
    const update = {}
    update['form.' + field] = event.detail.value
    this.setData(update)
  },

  setSilenceReminder(event) {
    const value = Number(event.currentTarget.dataset.value || 0)
    this.setData({
      'form.followUpSilenceDays': Number.isFinite(value) ? value : 0
    })
  },

  onStageChange(event) {
    const stageIndex = Number(event.detail.value)
    this.setData({
      stageIndex,
      'form.stage': this.data.stages[stageIndex]
    })
  },

  onContactInput(event) {
    const { index, field } = event.currentTarget.dataset
    const update = {}
    update['form.contacts[' + index + '].' + field] = event.detail.value
    this.setData(update)
  },

  addContact() {
    const contacts = this.data.form.contacts.concat({
      name: '',
      role: '',
      phone: '',
      wechat: '',
      company: ''
    })

    this.setData({
      'form.contacts': contacts
    })
  },

  removeContact(event) {
    const { index } = event.currentTarget.dataset
    const contacts = (Array.isArray(this.data.form.contacts) ? this.data.form.contacts : []).slice()

    if (contacts.length === 1) {
      contacts[0] = {
        name: '',
        role: '',
        phone: '',
        wechat: '',
        company: ''
      }
    } else {
      contacts.splice(index, 1)
    }

    this.setData({
      'form.contacts': contacts
    })
  },

  async handleSave() {
    if (this.data.isSaving) {
      return
    }

    const payload = {
      projectId: this.data.projectId,
      projectName: String(this.data.form.projectName || '').trim(),
      clientName: String(this.data.form.clientName || '').trim(),
      voiceAliasesText: this.data.isEdit
        ? String(this.data.form.voiceAliasesText || '').trim()
        : '',
      stage: this.data.form.stage,
      estimatedAmount: this.data.form.estimatedAmount,
      expectedCommission: this.data.form.expectedCommission,
      followUpSilenceDays: Number(this.data.form.followUpSilenceDays || 0),
      tagsText: this.data.form.tagsText,
      description: this.data.form.description,
      contacts: this.data.form.contacts
    }

    if (!payload.projectName || !payload.clientName || !payload.stage) {
      wx.showToast({
        title: '请先填写项目名称、客户名称和当前阶段',
        icon: 'none'
      })
      return
    }

    const decision = await ensureActionAllowed('save_project', {
      refresh: true,
      isEdit: this.data.isEdit,
      guide: true
    })
    if (!decision.allowed) {
      return
    }

    this.safeSetData({ isSaving: true })

    try {
      const result = await saveProjectData(payload)
      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '保存失败')
      }

      await resolveNotificationData({
        projectId: this.data.isEdit ? result.projectId : '',
        types: ['save_failed'],
        scenes: [this.data.isEdit ? 'project_update' : 'project_create']
      })

      wx.showToast({
        title: this.data.isEdit ? '项目已更新' : '项目已创建',
        icon: 'success'
      })

      this.redirectTimer = setTimeout(() => {
        this.redirectTimer = null
        wx.redirectTo({
          url: `/pages/project-detail/project-detail?projectId=${result.projectId}`
        })
      }, 320)
    } catch (error) {
      await reportSystemFailureData({
        type: 'save_failed',
        scene: this.data.isEdit ? 'project_update' : 'project_create',
        title: this.data.isEdit ? '项目更新失败' : '项目创建失败',
        message: error.message || '当前无法保存项目，请稍后重试',
        projectId: this.data.projectId,
        projectName: payload.projectName,
        actionUrl: this.data.projectId
          ? `/pages/project-form/project-form?projectId=${this.data.projectId}`
          : '/pages/project-form/project-form',
        actionLabel: '继续编辑'
      })

      wx.showToast({
        title: error.message || '当前无法保存项目，请稍后重试',
        icon: 'none'
      })
    } finally {
      this.safeSetData({ isSaving: false })
    }
  },

  goBack() {
    wx.reLaunch({
      url: '/pages/projects/projects'
    })
  }
})
