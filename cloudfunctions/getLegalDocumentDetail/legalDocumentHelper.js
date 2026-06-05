const crypto = require('crypto')

function toText(value) {
  return String(value || '').trim()
}

function toBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function escapeHtml(value) {
  return toText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeLimit(value, fallback = 50, max = 100) {
  const current = Number(value)
  if (!Number.isFinite(current) || current <= 0) {
    return fallback
  }

  return Math.min(max, Math.max(1, Math.floor(current)))
}

function normalizeDocType(value) {
  const current = toText(value)
  const allowed = [
    'privacy_policy',
    'user_agreement',
    'ai_notice',
    'audio_notice',
    'phone_bind_notice',
    'data_storage_notice',
    'account_cancellation_notice'
  ]
  return allowed.includes(current) ? current : ''
}

function normalizeStatus(value, fallback = 'draft') {
  const current = toText(value)
  return ['draft', 'published', 'archived'].includes(current) ? current : fallback
}

function normalizeVersion(value) {
  return toText(value)
}

function normalizeTitle(value, docType) {
  const current = toText(value)
  if (current) {
    return current
  }

  const defaults = {
    privacy_policy: '隐私政策',
    user_agreement: '用户服务协议',
    ai_notice: 'AI 使用说明',
    audio_notice: '录音与语音识别说明',
    phone_bind_notice: '手机号绑定说明',
    data_storage_notice: '云端存储说明',
    account_cancellation_notice: '账号注销说明'
  }

  return defaults[docType] || ''
}

function normalizeChangeNotes(value) {
  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean)
  }

  const text = toText(value)
  return text ? text.split('\n').map((item) => toText(item)).filter(Boolean) : []
}

function normalizeMarkdownSource(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim()
}

function normalizeDocId(value, docType = '', version = '') {
  const explicit = toText(value)
  if (explicit) {
    return explicit
  }

  const safeDocType = normalizeDocType(docType) || 'legal_document'
  const safeVersion = normalizeVersion(version)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `legal_${safeDocType}_${safeVersion || Date.now()}`
}

function normalizeDate(value, fallback = null) {
  if (!value && fallback) {
    return fallback
  }

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? (fallback || null) : date
}

function formatDateText(value) {
  const date = normalizeDate(value)
  return date ? date.toISOString() : ''
}

function renderMarkdownToHtml(markdownSource = '') {
  const lines = normalizeMarkdownSource(markdownSource).split('\n')
  const html = []
  let listBuffer = []
  let paragraphBuffer = []

  function flushList() {
    if (!listBuffer.length) {
      return
    }
    html.push('<ul>')
    listBuffer.forEach((item) => {
      html.push(`<li>${escapeHtml(item)}</li>`)
    })
    html.push('</ul>')
    listBuffer = []
  }

  function flushParagraph() {
    if (!paragraphBuffer.length) {
      return
    }
    html.push(`<p>${paragraphBuffer.map((item) => escapeHtml(item)).join('<br />')}</p>`)
    paragraphBuffer = []
  }

  lines.forEach((line) => {
    const current = String(line || '')
    const trimmed = current.trim()

    if (!trimmed) {
      flushList()
      flushParagraph()
      return
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      flushList()
      flushParagraph()
      const level = Math.min(6, headingMatch[1].length)
      html.push(`<h${level}>${escapeHtml(headingMatch[2])}</h${level}>`)
      return
    }

    const listMatch = trimmed.match(/^[-*]\s+(.+)$/)
    if (listMatch) {
      flushParagraph()
      listBuffer.push(listMatch[1])
      return
    }

    flushList()
    paragraphBuffer.push(trimmed)
  })

  flushList()
  flushParagraph()
  return html.join('')
}

function buildPlainTextSnapshot(markdownSource = '') {
  return normalizeMarkdownSource(markdownSource)
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function buildDocumentHash(options = {}) {
  const payload = [
    toText(options.docType),
    toText(options.version),
    toText(options.title),
    toText(options.htmlSnapshot)
  ].join('\n')
  return `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`
}

function matchesKeyword(document = {}, keyword = '') {
  const currentKeyword = toText(keyword).toLowerCase()
  if (!currentKeyword) {
    return true
  }

  return [
    document.docType,
    document.title,
    document.version,
    document.summary
  ].some((item) => toText(item).toLowerCase().includes(currentKeyword))
}

function buildLegalDocumentSummary(document = {}) {
  return {
    docId: toText(document.docId || document._id),
    docType: normalizeDocType(document.docType),
    title: toText(document.title),
    version: toText(document.version),
    status: normalizeStatus(document.status, 'draft'),
    isCurrent: document.isCurrent === true,
    requiresReconsent: document.requiresReconsent === true,
    contentFormat: toText(document.contentFormat || 'markdown') || 'markdown',
    summary: toText(document.summary),
    changeNotes: normalizeChangeNotes(document.changeNotes),
    effectiveAt: formatDateText(document.effectiveAt),
    publishedAt: formatDateText(document.publishedAt),
    archivedAt: formatDateText(document.archivedAt),
    hash: toText(document.hash),
    previousVersion: toText(document.previousVersion),
    currentRevision: Number(document.currentRevision || 1),
    updatedBy: toText(document.updatedBy || document.operatorId),
    updatedAt: formatDateText(document.updatedAt),
    createdAt: formatDateText(document.createdAt)
  }
}

function buildLegalDocumentDetail(document = {}) {
  return {
    ...buildLegalDocumentSummary(document),
    markdownSource: normalizeMarkdownSource(document.markdownSource),
    htmlSnapshot: toText(document.htmlSnapshot),
    plainTextSnapshot: toText(document.plainTextSnapshot),
    sourceDraftId: toText(document.sourceDraftId),
    operatorId: toText(document.operatorId)
  }
}

module.exports = {
  toText,
  toBoolean,
  clone,
  escapeHtml,
  normalizeLimit,
  normalizeDocType,
  normalizeStatus,
  normalizeVersion,
  normalizeTitle,
  normalizeChangeNotes,
  normalizeMarkdownSource,
  normalizeDocId,
  normalizeDate,
  formatDateText,
  renderMarkdownToHtml,
  buildPlainTextSnapshot,
  buildDocumentHash,
  matchesKeyword,
  buildLegalDocumentSummary,
  buildLegalDocumentDetail
}
