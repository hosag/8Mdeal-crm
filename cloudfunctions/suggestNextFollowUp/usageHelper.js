module.exports = function createAiUsageHelper(deps = {}) {
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
  const extractRawUsageTotals = typeof deps.extractRawUsageTotals === 'function'
    ? deps.extractRawUsageTotals
    : (() => ({
        rawTotalTokens: 0,
        rawPromptTokens: 0,
        rawCompletionTokens: 0
      }))
  const estimateTokensByChars = typeof deps.estimateTokensByChars === 'function'
    ? deps.estimateTokensByChars
    : (() => 0)

  if (!db || typeof db.collection !== 'function') {
    throw new Error('AI_USAGE_HELPER_DB_REQUIRED')
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

  function buildAiUsageTraceId(sourceType, accountId, requestId, fallbackKey) {
    const requestKey = text(requestId, '')
    if (requestKey) {
      return `trace:${sourceType}:${accountId}:${requestKey}`
    }
    return `trace:${sourceType}:${accountId}:${text(fallbackKey, '') || Date.now()}`
  }

  function buildUsageEventKey(sourceType, traceId, accountId, fallbackKey, eventStatus) {
    const baseKey = text(traceId, '') || `trace:${sourceType}:${accountId}:${text(fallbackKey, '') || Date.now()}`
    return `event:${baseKey}:${text(eventStatus, 'success') || 'success'}`
  }

  async function consumeAiUsage(options = {}) {
    const accountId = text(options.accountId, '')
    const traceId = text(options.traceId, '')
    const inputChars = String(options.inputText || '').length
    const outputChars = String(options.outputText || '').length
    const configuredMultiplier = number(options.multiplier, 1)
    const multiplier = configuredMultiplier > 0 ? configuredMultiplier : 1

    if (!accountId || !traceId) {
      return {
        reused: false,
        skipped: true,
        billedTokens: 0,
        rawTotalTokens: 0,
        rawPromptTokens: 0,
        rawCompletionTokens: 0,
        multiplier,
        billingMethod: '',
        inputChars,
        outputChars,
        traceId
      }
    }

    const existing = await getOne('usageLedger', { traceId })
    if (existing) {
      return {
        reused: true,
        skipped: false,
        billedTokens: Math.abs(number(existing.delta, 0)),
        rawTotalTokens: number(existing.meta && existing.meta.rawTotalTokens, 0),
        rawPromptTokens: number(existing.meta && existing.meta.rawPromptTokens, 0),
        rawCompletionTokens: number(existing.meta && existing.meta.rawCompletionTokens, 0),
        multiplier: number(existing.meta && existing.meta.multiplier, multiplier),
        billingMethod: text(existing.meta && existing.meta.billingMethod, ''),
        inputChars: Math.max(0, number(existing.meta && existing.meta.inputChars, inputChars)),
        outputChars: Math.max(0, number(existing.meta && existing.meta.outputChars, outputChars)),
        traceId
      }
    }

    const rawUsage = extractRawUsageTotals(options.usage)
    const rawTotalTokens = rawUsage.rawTotalTokens > 0
      ? rawUsage.rawTotalTokens
      : Math.max(0, number(estimateTokensByChars(options.inputText, options.outputText), 0))
    const billedTokens = Math.max(0, Math.ceil(rawTotalTokens * multiplier))
    const billingMethod = rawUsage.rawTotalTokens > 0 ? 'provider_usage' : 'estimated_chars'

    if (billedTokens <= 0) {
      return {
        reused: false,
        skipped: true,
        billedTokens: 0,
        rawTotalTokens,
        rawPromptTokens: rawUsage.rawPromptTokens,
        rawCompletionTokens: rawUsage.rawCompletionTokens,
        multiplier,
        billingMethod,
        inputChars,
        outputChars,
        traceId
      }
    }

    const entitlements = options.entitlements && typeof options.entitlements === 'object'
      ? options.entitlements
      : {}
    const beforeBalance = Math.max(0, number(entitlements.aiTokensRemaining, 0))
    const afterBalance = Math.max(0, beforeBalance - billedTokens)

    await db.collection('usageLedger').add({
      data: {
        accountId,
        usageType: 'ai_tokens',
        sourceType: text(options.sourceType, ''),
        sourceId: text(options.sourceId, ''),
        delta: -billedTokens,
        unit: 'token',
        beforeBalance,
        afterBalance,
        traceId,
        meta: {
          projectId: text(options.projectId, ''),
          pageKey: text(options.pageKey, ''),
          providerKey: text(options.runtime && options.runtime.providerKey, ''),
          providerType: text(options.runtime && options.runtime.engine, ''),
          providerLabel: text(options.runtime && options.runtime.providerLabel, ''),
          model: text(options.runtime && options.runtime.model, ''),
          multiplier,
          rawTotalTokens,
          rawPromptTokens: rawUsage.rawPromptTokens,
          rawCompletionTokens: rawUsage.rawCompletionTokens,
          billingMethod,
          routeKey: text(options.routeKey, ''),
          fallbackUsed: options.fallbackUsed === true,
          primaryError: text(options.primaryError, ''),
          requestId: text(options.providerRequestId, ''),
          inputChars,
          outputChars
        },
        occurredAt: options.occurredAt instanceof Date ? options.occurredAt : new Date()
      }
    })

    return {
      reused: false,
      skipped: false,
      billedTokens,
      rawTotalTokens,
      rawPromptTokens: rawUsage.rawPromptTokens,
      rawCompletionTokens: rawUsage.rawCompletionTokens,
      multiplier,
      billingMethod,
      inputChars,
      outputChars,
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
          usageType: 'ai_tokens',
          sourceType: text(options.sourceType, ''),
          sourceId: text(options.sourceId, ''),
          traceId: text(options.traceId, ''),
          eventKey,
          eventStatus: text(options.eventStatus, 'success') || 'success',
          occurredAt: options.occurredAt instanceof Date ? options.occurredAt : new Date(),
          meta: {
            projectId: text(options.projectId, ''),
            pageKey: text(options.pageKey, ''),
            routeKey: text(options.routeKey, ''),
            plannedProviderKey: text(options.plannedRuntime && options.plannedRuntime.providerKey, ''),
            plannedProviderLabel: text(options.plannedRuntime && options.plannedRuntime.providerLabel, ''),
            plannedProviderType: text(options.plannedRuntime && options.plannedRuntime.engine, ''),
            plannedModel: text(options.plannedRuntime && options.plannedRuntime.model, ''),
            providerKey: text(options.runtime && options.runtime.providerKey, ''),
            providerLabel: text(options.runtime && options.runtime.providerLabel, ''),
            providerType: text(options.runtime && options.runtime.engine, ''),
            model: text(options.runtime && options.runtime.model, ''),
            fallbackUsed: options.fallbackUsed === true,
            primaryError: text(options.primaryError, ''),
            errorMessage: text(options.errorMessage, ''),
            billingMethod: text(options.billingMethod, ''),
            rawTotalTokens: Math.max(0, number(options.rawTotalTokens, 0)),
            rawPromptTokens: Math.max(0, number(options.rawPromptTokens, 0)),
            rawCompletionTokens: Math.max(0, number(options.rawCompletionTokens, 0)),
            billedTokens: Math.max(0, number(options.billedTokens, 0)),
            multiplier: number(options.multiplier, 1),
            inputChars: Math.max(0, number(options.inputChars, 0)),
            outputChars: Math.max(0, number(options.outputChars, 0)),
            durationMs: Math.max(0, number(options.durationMs, 0)),
            usageRecorded: options.usageRecorded !== false,
            usageReused: options.usageReused === true,
            clientRequestId: text(options.clientRequestId, ''),
            providerRequestId: text(options.providerRequestId, '')
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
    buildAiUsageTraceId,
    buildUsageEventKey,
    consumeAiUsage,
    appendUsageEvent
  }
}
