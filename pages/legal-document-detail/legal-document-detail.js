const {
  getLegalDocumentDetailData
} = require('../../services/data')
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

Page({
  data: {
    appearancePageClass: '',
    isLoading: true,
    docId: '',
    docType: '',
    title: '',
    typeLabel: '协议文档',
    version: '',
    effectiveAtText: '',
    publishedAtText: '',
    htmlSnapshot: ''
  },

  onLoad(options) {
    syncPageAppearance(this)
    const docType = normalizeText(options && options.docType)
    this.setData({
      docType,
      typeLabel: DOC_TYPE_LABELS[docType] || '协议文档'
    })
    this.bootstrap()
  },

  onShow() {
    syncPageAppearance(this)
  },

  async bootstrap() {
    this.setData({
      isLoading: true
    })

    try {
      const documentResult = await getLegalDocumentDetailData({
        docType: this.data.docType
      })
      const document = documentResult && documentResult.data ? documentResult.data.document : null

      if (!document) {
        throw new Error('当前协议不存在')
      }

      wx.setNavigationBarTitle({
        title: normalizeText(document.title) || DOC_TYPE_LABELS[document.docType] || '协议详情'
      })

      this.setData({
        isLoading: false,
        docId: normalizeText(document.docId),
        docType: normalizeText(document.docType),
        title: normalizeText(document.title) || DOC_TYPE_LABELS[document.docType] || '协议文档',
        typeLabel: DOC_TYPE_LABELS[document.docType] || normalizeText(document.docType) || '协议文档',
        version: normalizeText(document.version),
        effectiveAtText: formatDateLabel(document.effectiveAt),
        publishedAtText: formatDateLabel(document.publishedAt),
        htmlSnapshot: normalizeText(document.htmlSnapshot)
      })
    } catch (error) {
      this.setData({
        isLoading: false
      })
      wx.showToast({
        title: error && error.message ? error.message : '当前无法读取协议',
        icon: 'none'
      })
    }
  }
})
