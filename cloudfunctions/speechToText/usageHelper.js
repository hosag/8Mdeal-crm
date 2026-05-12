module.exports = function createVoiceUsageHelper(deps = {}) {
  const db = deps.db
  const safeText = typeof deps.safeText === 'function'
    ? deps.safeText
    : ((value, fallback = '') => {
        const text = String(value || '').trim()
        return text || fallback
      })
  const toNumber = typeof deps.toNumber === 'function'
    ? deps.toNumber
    : ((value, fallback = 0) => {
        const current = Number(value)
        return Number.isFinite(current) ? current : fallback
      })

  if (!db || typeof db.collection !== 'function') {
    throw new Error('VOICE_USAGE_HELPER_DB_REQUIRED')
  }

  function text(value, fallback = '') {
    const normalized = safeText(value, fallback)
    const current = typeof normalized === 'string'
      ? normalized.trim()
      : String(normalized || '').trim()
    return current || fallback
  }

  function number(value, fallback = 0) {
    const current = toNumber(value, fallback)
    return Number.isFinite(current) ? current : fallback
  }

  async function getOne(collectionName, query) {
    try {
      const result = await db.collection(collectionName).where(query).limit(1).get()
      return result.data[0] || null
    } catch (error) {
      return null
    }
  }

  function buildUsageTraceId(accountId, requestId, fileID) {
    const requestKey = text(requestId, '')
    if (requestKey) {
      return `trace:speech_to_text:${accountId}:${requestKey}`
    }
    return `trace:speech_to_text:${accountId}:${text(fileID, '')}`
  }

  function buildSpeechSourceId(requestId, fileID) {
    return text(requestId, '') || text(fileID, '') || `speech_${Date.now()}`
  }

  function buildUsageEventKey(accountId, requestId, fileID, eventStatus) {
    const requestKey = text(requestId, '') || text(fileID, '') || `${Date.now()}`
    return `event:speech_to_text:${accountId}:${requestKey}:${text(eventStatus, 'success') || 'success'}`
  }

  async function consumeVoiceUsage(options = {}) {
    const accountId = text(options.accountId, '')
    const billedSeconds = Math.max(0, Math.ceil(number(options.audioDurationMs, 0) / 1000))
    const traceId = text(options.traceId, '')
    if (!accountId || !traceId || billedSeconds <= 0) {
      return {
        reused: false,
        skipped: true,
        billedSeconds: 0,
        traceId
      }
    }

    const existing = await getOne('usageLedger', { traceId })
    if (existing) {
      return {
        reused: true,
        skipped: false,
        billedSeconds: Math.abs(number(existing.delta, billedSeconds)),
        traceId
      }
    }

    const entitlements = options.entitlements && typeof options.entitlements === 'object'
      ? options.entitlements
      : {}
    const beforeBalance = Math.max(0, number(entitlements.voiceSecondsRemaining, 0))
    const afterBalance = Math.max(0, beforeBalance - billedSeconds)
    const occurredAt = options.occurredAt instanceof Date ? options.occurredAt : new Date()

    await db.collection('usageLedger').add({
      data: {
        accountId,
        usageType: 'voice_seconds',
        sourceType: 'speech_to_text',
        sourceId: buildSpeechSourceId(options.requestId, options.fileID),
        delta: -billedSeconds,
        unit: 'second',
        beforeBalance,
        afterBalance,
        traceId,
        meta: {
          projectId: text(options.projectId, ''),
          pageKey: text(options.pageKey, 'pages/index/index'),
          providerKey: 'tencent_asr',
          providerLabel: 'Tencent Cloud ASR',
          audioDurationMs: Math.max(0, number(options.audioDurationMs, 0)),
          billedSeconds,
          requestId: text(options.providerRequestId, ''),
          voiceFormat: text(options.voiceFormat, '')
        },
        occurredAt
      }
    })

    return {
      reused: false,
      skipped: false,
      billedSeconds,
      traceId
    }
  }

  async function appendUsageEvent(options = {}) {
    const accountId = text(options.accountId, '')
    const eventKey = text(options.eventKey, '')
    if (!accountId || !eventKey) {
      return {
        reused: false,
        skipped: true,
        eventKey
      }
    }

    try {
      const existing = await getOne('usageEvents', { eventKey })
      if (existing) {
        return {
          reused: true,
          skipped: false,
          eventKey
        }
      }

      await db.collection('usageEvents').add({
        data: {
          accountId,
          usageType: 'voice_seconds',
          sourceType: 'speech_to_text',
          sourceId: buildSpeechSourceId(options.requestId, options.fileID),
          traceId: text(options.traceId, ''),
          eventKey,
          eventStatus: text(options.eventStatus, 'success') || 'success',
          occurredAt: options.occurredAt instanceof Date ? options.occurredAt : new Date(),
          meta: {
            projectId: text(options.projectId, ''),
            pageKey: text(options.pageKey, 'pages/index/index'),
            providerKey: 'tencent_asr',
            providerLabel: 'Tencent Cloud ASR',
            providerType: 'tencent_cloud',
            clientRequestId: text(options.requestId, ''),
            providerRequestId: text(options.providerRequestId, ''),
            audioDurationMs: Math.max(0, number(options.audioDurationMs, 0)),
            billedSeconds: Math.max(0, number(options.billedSeconds, 0)),
            durationMs: Math.max(0, number(options.durationMs, 0)),
            voiceFormat: text(options.voiceFormat, ''),
            outputChars: Math.max(0, text(options.outputText, '').length),
            usageRecorded: options.usageRecorded !== false,
            usageReused: options.usageReused === true,
            errorMessage: text(options.errorMessage, '')
          }
        }
      })

      return {
        reused: false,
        skipped: false,
        eventKey
      }
    } catch (error) {
      return {
        reused: false,
        skipped: true,
        eventKey,
        errorMessage: text(error && error.message, '')
      }
    }
  }

  return {
    buildUsageTraceId,
    buildSpeechSourceId,
    buildUsageEventKey,
    consumeVoiceUsage,
    appendUsageEvent
  }
}
