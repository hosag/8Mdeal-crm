const { loadDealFormData, saveDealData, reportSystemFailureData, resolveNotificationData } = require('../../services/data')
const { syncPageAppearance } = require('../../utils/appearance')
const { markProjectRelatedCachesDirty } = require('../../utils/core-page-cache')

Page({
  data: {
    appearancePageClass: '',
    form: {
      projectId: '',
      projectName: '未命名项目',
      actualAmount: '',
      contractDate: '',
      paymentStatus: '未回款',
      paidAmount: '',
      latestPaymentDate: '',
      expectedCommission: '',
      commissionStatus: '待兑现',
      settledCommission: '',
      commissionSettledDate: '',
      note: ''
    },
    existingDeal: false,
    isLoading: true,
    isSaving: false,
    dataSource: 'Mock Demo'
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

    if (!projectId) {
      this.safeSetData({
        isLoading: false
      })
      wx.showToast({
        title: '未选择项目',
        icon: 'none'
      })
      return
    }

    try {
      const result = await loadDealFormData(projectId)
      const form = result && result.form ? result.form : this.data.form
      const existingDeal = !!(result && result.existingDeal)

      this.safeSetData({
        form,
        existingDeal,
        isLoading: false,
        dataSource: 'CloudBase'
      })

      if (existingDeal) {
        wx.showToast({
          title: '该项目已成交，无需再次标记',
          icon: 'none'
        })

        this.redirectTimer = setTimeout(() => {
          this.redirectTimer = null
          wx.redirectTo({
            url: `/pages/project-detail/project-detail?projectId=${projectId}`
          })
        }, 320)
      }
    } catch (error) {
      this.safeSetData({
        isLoading: false
      })
      wx.showToast({
        title: '成交信息加载失败，请重试',
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
    const field = event.currentTarget.dataset.field
    const update = {}
    update['form.' + field] = event.detail.value
    this.setData(update)
  },

  onContractDateChange(event) {
    this.setData({
      'form.contractDate': event.detail.value
    })
  },

  async handleSave() {
    if (this.data.isSaving) {
      return
    }

    if (this.data.existingDeal) {
      wx.showToast({
        title: '该项目已成交，无需重复保存',
        icon: 'none'
      })
      return
    }

    if (!this.data.form.projectId || !this.data.form.contractDate) {
      wx.showToast({
        title: '请先选择合同日期',
        icon: 'none'
      })
      return
    }

    this.safeSetData({
      isSaving: true
    })

    try {
      const result = await saveDealData(this.data.form)
      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '提交成交失败')
      }

      await resolveNotificationData({
        projectId: this.data.form.projectId,
        types: ['save_failed'],
        scenes: ['mark_deal_submit']
      })

      markProjectRelatedCachesDirty({
        projectId: this.data.form.projectId,
        includeHome: true,
        includeProjects: true,
        includeSharedOut: true,
        includeProjectDetail: true
      })

      wx.showToast({
        title: '成交已提交',
        icon: 'success'
      })

      this.redirectTimer = setTimeout(() => {
        this.redirectTimer = null
        wx.redirectTo({
          url: `/pages/earnings/earnings`
        })
      }, 320)
    } catch (error) {
      await reportSystemFailureData({
        type: 'save_failed',
        scene: 'mark_deal_submit',
        title: '成交提交失败',
        message: error.message || '当前无法提交成交记录，请稍后重试',
        projectId: this.data.form.projectId,
        projectName: this.data.form.projectName,
        actionUrl: this.data.form.projectId
          ? `/pages/mark-deal/mark-deal?projectId=${this.data.form.projectId}`
          : '/pages/mark-deal/mark-deal',
        actionLabel: '重新提交'
      })

      wx.showToast({
        title: error.message || '当前无法提交成交记录，请稍后重试',
        icon: 'none'
      })
    } finally {
      this.safeSetData({
        isSaving: false
      })
    }
  },

  goBack() {
    if (!this.data.form.projectId) {
      wx.navigateBack({
        delta: 1
      })
      return
    }

    wx.navigateTo({
      url: `/pages/project-detail/project-detail?projectId=${this.data.form.projectId}`
    })
  }
})
