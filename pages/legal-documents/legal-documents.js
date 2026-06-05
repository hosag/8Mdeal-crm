const { getCurrentLegalDocumentsData } = require('../../services/data')
const { syncPageAppearance } = require('../../utils/appearance')

const DOC_TYPE_LABELS = {
  privacy_policy: '隐私政策',
  user_agreement: '用户服务协议',
  ai_notice: 'AI 使用说明',
  audio_notice: '录音与语音识别说明',
  phone_bind_notice: '手机号绑定说明',
  data_storage_notice: '云端存储说明',
  account_cancellation_notice: '账号注销说明'
}

function normalizeText(value) {
  return String(value || '').trim()
}

function formatDateLabel(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) {
    return ''
  }
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeDocuments(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const docType = normalizeText(item.docType)
    return {
      docId: normalizeText(item.docId),
      docType,
      title: normalizeText(item.title) || DOC_TYPE_LABELS[docType] || '协议文档',
      typeLabel: DOC_TYPE_LABELS[docType] || docType || '协议文档',
      version: normalizeText(item.version),
      effectiveAtText: formatDateLabel(item.effectiveAt),
      publishedAtText: formatDateLabel(item.publishedAt),
      requiresReconsent: item.requiresReconsent === true
    }
  })
}

Page({
  data: {
    appearancePageClass: '',
    isLoading: true,
    documents: [],
    sourceText: ''
  },

  onLoad() {
    syncPageAppearance(this)
    this.loadDocuments()
  },

  onShow() {
    syncPageAppearance(this)
  },

  async loadDocuments() {
    this.setData({
      isLoading: true
    })

    try {
      const result = await getCurrentLegalDocumentsData()
      this.setData({
        isLoading: false,
        documents: normalizeDocuments(result && result.data && result.data.documents),
        sourceText: normalizeText(result && result.source)
      })
    } catch (error) {
      this.setData({
        isLoading: false,
        documents: [],
        sourceText: ''
      })
      wx.showToast({
        title: error && error.message ? error.message : '当前无法读取协议',
        icon: 'none'
      })
    }
  },

  openDocument(event) {
    const docType = normalizeText(event.currentTarget.dataset.docType)
    if (!docType) {
      return
    }

    wx.navigateTo({
      url: `/pages/legal-document-detail/legal-document-detail?docType=${encodeURIComponent(docType)}`
    })
  }
})
