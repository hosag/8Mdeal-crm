const {
  getBillingOrderDetailData,
  prepareBillingPaymentData,
  getBillingCatalogData,
  getEntitlementsData,
  getDefaultEntitlements
} = require('../../services/data')
const { syncPageAppearance } = require('../../utils/appearance')
const {
  formatDateLabel,
  getOrderStatusLabel,
  getOrderStatusClass,
  getProductTypeLabel,
  getBillingCycleLabel,
  normalizeBillingCatalogPayload,
  getDefaultBillingCatalogData
} = require('../../utils/billing')

function buildAmountText(amount, currency = 'CNY') {
  const current = Number(amount)
  if (!Number.isFinite(current) || current <= 0) {
    return currency === 'CNY' ? '待确认金额' : '待确认'
  }

  return `¥${(current / 100).toFixed(2)}`
}

function buildOriginalPriceText(pricingSnapshot = {}, fallbackAmount = 0, currency = 'CNY') {
  const originalPrice = Number(pricingSnapshot && pricingSnapshot.originalPrice)
  const price = Number(pricingSnapshot && pricingSnapshot.price)
  const amount = Number(fallbackAmount)

  if (!Number.isFinite(originalPrice) || originalPrice <= 0) {
    return ''
  }

  const currentPrice = Number.isFinite(price) && price > 0 ? price : amount
  if (!Number.isFinite(currentPrice) || originalPrice <= currentPrice) {
    return ''
  }

  return buildAmountText(originalPrice, currency)
}

function formatInteger(value) {
  const number = Math.max(0, Number(value || 0))
  if (!Number.isFinite(number)) {
    return '0'
  }

  return Math.round(number).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function formatVoiceQuotaText(value) {
  const seconds = Math.max(0, Number(value || 0))
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '无'
  }

  if (seconds % 3600 === 0) {
    return `${seconds / 3600} 小时`
  }

  if (seconds % 60 === 0) {
    return `${seconds / 60} 分钟`
  }

  return `${seconds} 秒`
}

function formatAiQuotaText(value) {
  const tokens = Math.max(0, Number(value || 0))
  if (!Number.isFinite(tokens) || tokens <= 0) {
    return '无'
  }

  return `${formatInteger(tokens)} 额度`
}

function formatProjectLimitText(value) {
  const projectLimit = Number(value)
  if (!Number.isFinite(projectLimit) || projectLimit < 0) {
    return '不限项目位'
  }

  return `${projectLimit} 个项目位`
}

function buildCapabilityLines(pricingSnapshot = {}) {
  const lines = []

  if (pricingSnapshot.supportsQuickEntry) {
    lines.push('支持闪录与快速录入')
  }

  if (pricingSnapshot.supportsSpeechToText) {
    lines.push('支持语音转写')
  }

  if (pricingSnapshot.supportsAi) {
    lines.push('支持 AI 自动整理')
  }

  if (pricingSnapshot.supportsShareOut) {
    lines.push('支持项目外发与转交')
  }

  return lines
}

function getPaymentTransactionStatusLabel(value) {
  const current = String(value || '').trim()
  const labels = {
    pending: '待发起',
    success: '已成功',
    failed: '已失败',
    callback_error: '回调异常'
  }
  return labels[current] || '未定义'
}

function getPaymentTransactionStatusClass(value) {
  const current = String(value || '').trim()
  if (current === 'success') {
    return 'is-success'
  }

  if (current === 'failed' || current === 'callback_error') {
    return 'is-danger'
  }

  if (current === 'pending') {
    return 'is-brand'
  }

  return ''
}

function getChannelLabel(value) {
  const current = String(value || '').trim()
  if (current === 'wechat_pay') {
    return '微信支付'
  }

  return current || '微信支付'
}

function getReadinessLabel(value) {
  const current = String(value || '').trim()
  const labels = {
    ready: '可继续支付',
    config_incomplete: '暂不可支付',
    placeholder_only: '暂不可支付'
  }
  return labels[current] || '待确认'
}

function normalizeReason(value) {
  const current = String(value || '').trim()
  const reasonList = [
    'bind_required',
    'speech_exhausted',
    'ai_exhausted',
    'project_limit_reached',
    'write_disabled',
    'share_out_disabled',
    'account_disabled'
  ]
  return reasonList.includes(current) ? current : ''
}

function normalizeFocus(value) {
  const current = String(value || '').trim()
  return ['subscription', 'addons'].includes(current) ? current : ''
}

function buildPlansPageUrl(focus = '', reason = '') {
  const nextFocus = normalizeFocus(focus)
  const nextReason = normalizeReason(reason)
  const query = []
  if (nextFocus) {
    query.push(`focus=${nextFocus}`)
  }
  if (nextReason) {
    query.push(`reason=${encodeURIComponent(nextReason)}`)
  }

  return `/pages/plans/plans${query.length ? `?${query.join('&')}` : ''}`
}

function buildEntryGuide(reason) {
  const current = normalizeReason(reason)
  const guideMap = {
    speech_exhausted: {
      visible: true,
      tone: 'soft',
      title: '语音额度已用完',
      desc: '补充语音时长后，语音录入和闪录转写可以继续使用。'
    },
    ai_exhausted: {
      visible: true,
      tone: 'brand',
      title: 'AI 额度已用完',
      desc: '补充 AI 额度后，AI 理解、整理和自动建议会恢复可用。'
    },
    project_limit_reached: {
      visible: true,
      tone: 'soft',
      title: '项目数量已达上限',
      desc: '当前更关注的是恢复正式订阅，解决新增项目和持续可写能力。'
    },
    write_disabled: {
      visible: true,
      tone: 'brand',
      title: '账号已只读',
      desc: '这笔订单主要用于恢复正式可写能力，解决新增、保存、闪录和 AI 受限。'
    },
    share_out_disabled: {
      visible: true,
      tone: 'neutral',
      title: '外发能力受限',
      desc: '如果后续完成正式订阅开通，项目外发能力会一并恢复。'
    },
    bind_required: {
      visible: true,
      tone: 'soft',
      title: '请先确认手机号',
      desc: '后续仍建议先确认账户已绑定手机号，再继续正式购买和权益归属。'
    }
  }

  return guideMap[current] || {
    visible: false,
    tone: 'neutral',
    title: '',
    desc: ''
  }
}

function getDefaultOrder() {
  return {
    orderId: '',
    title: '',
    productCode: '',
    productType: '',
    billingCycle: '',
    amount: 0,
    currency: 'CNY',
    status: 'pending',
    createdAt: '',
    paidAt: '',
    updatedAt: '',
    paymentEnabled: false,
    pricingSnapshot: {}
  }
}

function resolvePricingSnapshot(order, billingCatalog = {}) {
  const source = order && typeof order === 'object' ? order : getDefaultOrder()
  const snapshot = source.pricingSnapshot && typeof source.pricingSnapshot === 'object'
    ? source.pricingSnapshot
    : {}
  const catalogProducts = billingCatalog && Array.isArray(billingCatalog.products)
    ? billingCatalog.products
    : []
  const matchedProduct = catalogProducts.find((item) => String(item.productCode || '').trim() === String(source.productCode || '').trim()) || {}

  return {
    ...matchedProduct,
    ...snapshot,
    productCode: String(snapshot.productCode || matchedProduct.productCode || source.productCode || '').trim(),
    productType: String(snapshot.productType || matchedProduct.productType || source.productType || '').trim(),
    billingCycle: String(snapshot.billingCycle || matchedProduct.billingCycle || source.billingCycle || '').trim()
  }
}

function decorateOrder(order, billingCatalog = {}) {
  const source = order && typeof order === 'object' ? order : getDefaultOrder()
  const status = String(source.status || 'pending').trim() || 'pending'
  const pricingSnapshot = resolvePricingSnapshot(source, billingCatalog)
  return {
    ...getDefaultOrder(),
    ...source,
    pricingSnapshot,
    amountText: buildAmountText(source.amount, source.currency),
    originalPriceText: buildOriginalPriceText(pricingSnapshot, source.amount, source.currency),
    statusLabel: getOrderStatusLabel(status),
    statusClass: getOrderStatusClass(status),
    productTypeLabel: getProductTypeLabel(source.productType),
    billingCycleLabel: getBillingCycleLabel(source.billingCycle),
    createdAtText: formatDateLabel(source.createdAt),
    paidAtText: formatDateLabel(source.paidAt),
    updatedAtText: formatDateLabel(source.updatedAt),
    capabilityLines: buildCapabilityLines(pricingSnapshot),
    includedVoiceText: formatVoiceQuotaText(pricingSnapshot.includedVoiceSeconds),
    includedAiText: formatAiQuotaText(pricingSnapshot.includedAiTokens),
    projectLimitText: formatProjectLimitText(pricingSnapshot.projectLimit)
  }
}

function decorateTransaction(record) {
  if (!record || typeof record !== 'object') {
    return null
  }

  const status = String(record.status || 'pending').trim() || 'pending'
  const paymentSession = record.paymentSession && typeof record.paymentSession === 'object'
    ? record.paymentSession
    : {}
  const channelOrder = paymentSession.channelOrder && typeof paymentSession.channelOrder === 'object'
    ? paymentSession.channelOrder
    : {}
  return {
    ...record,
    paymentSession,
    channelLabel: getChannelLabel(record.channel),
    statusLabel: getPaymentTransactionStatusLabel(status),
    statusClass: getPaymentTransactionStatusClass(status),
    createdAtText: formatDateLabel(record.createdAt),
    updatedAtText: formatDateLabel(record.updatedAt),
    expiresAtText: formatDateLabel(record.expiresAt || paymentSession.expiresAt),
    preparedAtText: formatDateLabel(paymentSession.preparedAt),
    invokeStatusText: paymentSession.canInvokePayment ? '可继续支付' : '暂不可支付',
    readinessLabel: getReadinessLabel(paymentSession.readinessCode || ''),
    channelRequestAtText: formatDateLabel(channelOrder.requestAt)
  }
}

function buildOverviewRows(order) {
  return [
    { key: 'orderId', label: '订单号', value: order.orderId || '待生成' },
    { key: 'status', label: '订单状态', value: order.statusLabel },
    { key: 'amount', label: '金额', value: order.amountText },
    { key: 'originalPrice', label: '原价', value: order.originalPriceText || '无' },
    { key: 'productType', label: '商品类型', value: order.productTypeLabel },
    { key: 'billingCycle', label: '计费周期', value: order.billingCycleLabel },
    { key: 'createdAt', label: '创建时间', value: order.createdAtText || '刚刚创建' }
  ]
}

function buildProductSummaryRows(order) {
  return [
    { key: 'amount', label: '成交金额', value: order.pricingSnapshot.priceText || order.amountText },
    { key: 'originalPrice', label: '原价参考', value: order.pricingSnapshot.originalPriceText || '无' },
    { key: 'billing', label: '计费周期', value: order.pricingSnapshot.displayBillingText || order.billingCycleLabel },
    { key: 'projects', label: '项目位', value: order.projectLimitText },
    { key: 'voice', label: '包含语音', value: order.includedVoiceText },
    { key: 'ai', label: '包含 AI', value: order.includedAiText }
  ]
}

function buildPaymentSummaryRows(transaction) {
  if (!transaction) {
    return []
  }

  return [
    { key: 'readiness', label: '拉起状态', value: transaction.readinessLabel },
    { key: 'invoke', label: '当前动作', value: transaction.invokeStatusText },
    { key: 'preparedAt', label: '会话生成', value: transaction.preparedAtText || transaction.createdAtText || '刚刚创建' },
    { key: 'expiresAt', label: '会话有效期', value: transaction.expiresAtText || '10 分钟内有效' }
  ]
}

function buildEffectiveStatusCard(order, entitlements, billingCatalog) {
  const latestSubscription = billingCatalog && billingCatalog.latestSubscription ? billingCatalog.latestSubscription : null
  const accessLevel = String(entitlements && entitlements.currentAccessLevel || '').trim()
  const voiceRemaining = Math.max(0, Number(entitlements && entitlements.voiceSecondsRemaining || 0))
  const aiRemaining = Math.max(0, Number(entitlements && entitlements.aiTokensRemaining || 0))
  const projectLimit = Number(entitlements && entitlements.projectLimit)
  const currentProjectCount = Math.max(0, Number(entitlements && entitlements.currentProjectCount || 0))
  const projectText = Number.isFinite(projectLimit) && projectLimit > -1
    ? `${currentProjectCount}/${projectLimit} 个项目位`
    : `${currentProjectCount} 个在用项目`

  if (order.status !== 'paid' && accessLevel !== 'paid_active') {
    return {
      visible: false,
      title: '',
      desc: '',
      rows: []
    }
  }

  return {
    visible: true,
    title: accessLevel === 'paid_active' ? '已完成开通' : '已完成支付',
    desc: latestSubscription && latestSubscription.expiresAtText
      ? `${latestSubscription.planName || '当前套餐'} 已开通至 ${latestSubscription.expiresAtText}`
      : '当前购买结果已同步，可继续查看最新权益状态。',
    rows: [
      {
        key: 'subscription',
        label: '当前订阅',
        value: latestSubscription && latestSubscription.planName ? latestSubscription.planName : '待同步'
      },
      {
        key: 'expiresAt',
        label: '到期时间',
        value: latestSubscription && latestSubscription.expiresAtText ? latestSubscription.expiresAtText : '待同步'
      },
      {
        key: 'voiceRemaining',
        label: '语音剩余',
        value: `${voiceRemaining} 秒`
      },
      {
        key: 'aiRemaining',
        label: 'AI 剩余',
        value: formatAiQuotaText(aiRemaining)
      },
      {
        key: 'projects',
        label: '项目位',
        value: projectText
      }
    ]
  }
}

function buildPrimaryActionMeta(order, transaction) {
  if (order.status === 'paid') {
    return {
      title: '已完成支付',
      desc: '购买结果已经同步完成，可以继续查看当前订阅、到期时间和剩余额度。',
      actionText: '查看当前权益',
      actionType: 'entitlements'
    }
  }

  if (order.status === 'closed' || order.status === 'failed' || order.status === 'refunded') {
    return {
      title: '这笔订单已结束',
      desc: '如果还需要继续购买，可以回到套餐页重新选择。',
      actionText: '回到套餐页',
      actionType: 'back'
    }
  }

  if (transaction) {
    return {
      title: transaction.paymentSession && transaction.paymentSession.canInvokePayment
        ? '继续完成支付'
        : '暂时无法支付',
      desc: transaction.paymentSession && transaction.paymentSession.canInvokePayment
        ? '确认后将进入微信支付。'
        : '支付信息还在准备中，请稍后再试。',
      actionText: transaction.paymentSession && transaction.paymentSession.canInvokePayment ? '继续支付' : '稍后再试',
      actionType: transaction.paymentSession && transaction.paymentSession.canInvokePayment ? 'invoke' : 'prepare'
    }
  }

  return {
    title: '继续完成支付',
    desc: '确认后将进入微信支付。',
    actionText: '继续支付',
    actionType: 'prepare'
  }
}

function buildPageState(detail = {}, entitlements = {}, billingCatalog = {}, options = {}) {
  const order = decorateOrder(detail.order, billingCatalog)
  const latestPaymentTransaction = decorateTransaction(detail.latestPaymentTransaction)
  const primaryActionMeta = buildPrimaryActionMeta(order, latestPaymentTransaction)

  return {
    order,
    latestPaymentTransaction,
    overviewRows: buildOverviewRows(order),
    productSummaryRows: buildProductSummaryRows(order),
    paymentSummaryRows: buildPaymentSummaryRows(latestPaymentTransaction),
    effectiveStatusCard: buildEffectiveStatusCard(order, entitlements, billingCatalog),
    primaryActionMeta,
    entryGuide: buildEntryGuide(options.reason)
  }
}

Page({
  data: {
    appearancePageClass: '',
    isLoading: true,
    isSubmitting: false,
    dataSource: 'Mock Demo',
    orderId: '',
    arrivalReason: '',
    returnFocus: '',
    order: decorateOrder(getDefaultOrder()),
    latestPaymentTransaction: null,
    overviewRows: [],
    productSummaryRows: [],
    paymentSummaryRows: [],
    effectiveStatusCard: {
      visible: false,
      title: '',
      desc: '',
      rows: []
    },
    entryGuide: {
      visible: false,
      tone: 'neutral',
      title: '',
      desc: ''
    },
    primaryActionMeta: {
      title: '',
      desc: '',
      actionText: '回到套餐页',
      actionType: 'back'
    }
  },

  async onLoad(options) {
    this.isPageActive = true
    syncPageAppearance(this)
    const orderId = String(options && options.orderId || '').trim()
    if (!orderId) {
      wx.showToast({
        title: '订单参数缺失',
        icon: 'none'
      })
      setTimeout(() => {
        this.openPlansPage()
      }, 220)
      return
    }

    this.setData({
      orderId,
      arrivalReason: normalizeReason(options && options.reason),
      returnFocus: normalizeFocus(options && options.focus)
    })
    await this.fetchState()
  },

  onShow() {
    this.isPageActive = true
    syncPageAppearance(this)
    if (!this.data.isLoading && this.data.orderId) {
      this.fetchState({ silent: true })
    }
  },

  onHide() {
    this.isPageActive = false
    this.clearPaymentStatusPolling()
  },

  onUnload() {
    this.isPageActive = false
    this.clearPaymentStatusPolling()
  },

  async fetchState(options = {}) {
    if (this.fetchStatePromise) {
      return this.fetchStatePromise
    }

    const isSilent = options && options.silent === true
    const task = (async () => {
    try {
      const [detailResult, entitlementsResult, billingCatalogResult] = await Promise.all([
        getBillingOrderDetailData({
          orderId: this.data.orderId
        }),
        getEntitlementsData().catch(() => ({
          data: getDefaultEntitlements(),
          source: 'CloudBase'
        })),
        getBillingCatalogData().catch(() => ({
          data: normalizeBillingCatalogPayload(getDefaultBillingCatalogData()),
          source: 'CloudBase'
        }))
      ])
      const app = getApp()
      const entitlements = entitlementsResult && entitlementsResult.data ? entitlementsResult.data : getDefaultEntitlements()
      const billingCatalog = billingCatalogResult && billingCatalogResult.data
        ? billingCatalogResult.data
        : normalizeBillingCatalogPayload(getDefaultBillingCatalogData())

      if (app && typeof app.applyEntitlementsState === 'function') {
        app.applyEntitlementsState(entitlements)
      }

      this.setData({
        isLoading: false,
        dataSource: detailResult && detailResult.source ? detailResult.source : 'CloudBase',
        ...buildPageState(
          detailResult && detailResult.data ? detailResult.data : {},
          entitlements,
          billingCatalog,
          {
            reason: this.data.arrivalReason
          }
        )
      })
    } catch (error) {
      this.setData({
        isLoading: false
      })
      if (!isSilent) {
        wx.showToast({
          title: error && error.message ? error.message : '当前无法读取订单',
          icon: 'none'
        })
      }
    }
    })()

    this.fetchStatePromise = task
    try {
      await task
    } finally {
      this.fetchStatePromise = null
    }
  },

  clearPaymentStatusPolling() {
    if (this.paymentStatusPollingTimer) {
      clearTimeout(this.paymentStatusPollingTimer)
      this.paymentStatusPollingTimer = null
    }
  },

  startPaymentStatusPolling(maxAttempts = 6, delayMs = 1200) {
    this.clearPaymentStatusPolling()
    let remainingAttempts = Math.max(1, Number(maxAttempts) || 1)

    const poll = async () => {
      if (!this.isPageActive || remainingAttempts <= 0) {
        this.clearPaymentStatusPolling()
        return
      }

      remainingAttempts -= 1
      await this.fetchState({ silent: true })

      if (!this.isPageActive) {
        this.clearPaymentStatusPolling()
        return
      }

      if (this.data.order && this.data.order.status === 'paid') {
        this.clearPaymentStatusPolling()
        return
      }

      if (remainingAttempts <= 0) {
        this.clearPaymentStatusPolling()
        return
      }

      this.paymentStatusPollingTimer = setTimeout(poll, delayMs)
    }

    this.paymentStatusPollingTimer = setTimeout(poll, delayMs)
  },

  openPlansPage() {
    const pages = getCurrentPages()
    if (Array.isArray(pages) && pages.length > 1) {
      wx.navigateBack({
        delta: 1
      })
      return
    }

    wx.navigateTo({
      url: buildPlansPageUrl(this.data.returnFocus, this.data.arrivalReason)
    })
  },

  openEntitlementsPage() {
    const suffix = this.data.arrivalReason ? `?reason=${encodeURIComponent(this.data.arrivalReason)}` : ''
    wx.navigateTo({
      url: `/pages/entitlements/entitlements${suffix}`
    })
  },

  async handlePrimaryAction() {
    if (this.data.isSubmitting) {
      return
    }

    const actionType = this.data.primaryActionMeta && this.data.primaryActionMeta.actionType
    if (actionType === 'invoke') {
      await this.invokeLatestPaymentSession()
      return
    }

    if (actionType === 'entitlements') {
      this.openEntitlementsPage()
      return
    }

    if (actionType !== 'prepare') {
      this.openPlansPage()
      return
    }

    this.setData({
      isSubmitting: true
    })

    try {
      const result = await prepareBillingPaymentData({
        orderId: this.data.orderId
      })
      await this.fetchState()
      const paymentSession = result && result.data && result.data.paymentSession
        ? result.data.paymentSession
        : null

      if (paymentSession && paymentSession.canInvokePayment) {
        await this.invokePaymentSession(paymentSession)
        return
      }

      wx.showModal({
        title: '暂不可支付',
        content: '当前暂不可支付，请稍后再试。',
        showCancel: false,
        confirmText: '我知道了'
      })
    } catch (error) {
      wx.showToast({
        title: error && error.message ? error.message : '当前无法准备支付',
        icon: 'none'
      })
    } finally {
      this.setData({
        isSubmitting: false
      })
    }
  },

  async invokeLatestPaymentSession() {
    if (!this.data.latestPaymentTransaction || !this.data.latestPaymentTransaction.paymentSession) {
      wx.showToast({
        title: '当前暂不可支付',
        icon: 'none'
      })
      return
    }

    await this.invokePaymentSession(this.data.latestPaymentTransaction.paymentSession)
  },

  async invokePaymentSession(paymentSession) {
    const session = paymentSession && typeof paymentSession === 'object' ? paymentSession : null
    if (!session) {
      wx.showToast({
        title: '当前暂不可支付',
        icon: 'none'
      })
      return
    }

    if (session.canInvokePayment !== true) {
      wx.showModal({
        title: '暂不可支付',
        content: '当前暂不可支付，请稍后再试。',
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }

    const clientPayload = session.clientPayload && typeof session.clientPayload === 'object'
      ? session.clientPayload
      : null

    if (!clientPayload || !clientPayload.timeStamp || !clientPayload.nonceStr || !clientPayload.package || !clientPayload.signType || !clientPayload.paySign) {
      wx.showModal({
        title: '暂不可支付',
        content: '当前暂不可支付，请稍后再试。',
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }

    if (typeof wx.requestPayment !== 'function') {
      wx.showModal({
        title: '当前环境不支持支付',
        content: '请在微信环境中继续支付。',
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }

    try {
      await new Promise((resolve, reject) => {
        wx.requestPayment({
          timeStamp: clientPayload.timeStamp,
          nonceStr: clientPayload.nonceStr,
          package: clientPayload.package,
          signType: clientPayload.signType,
          paySign: clientPayload.paySign,
          success: resolve,
          fail: reject
        })
      })

      wx.showModal({
        title: '支付已完成',
        content: '支付完成后，权益会自动更新。',
        showCancel: false,
        confirmText: '我知道了'
      })
      await this.fetchState()
      this.startPaymentStatusPolling()
    } catch (error) {
      wx.showModal({
        title: '支付未完成',
        content: error && error.errMsg ? error.errMsg : '微信支付未完成或被取消',
        showCancel: false,
        confirmText: '我知道了'
      })
    }
  }
})
