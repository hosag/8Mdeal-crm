const FOLLOW_UP_METHODS = ['电话', '微信', '邮件', '面谈', '其他']

const METHOD_PATTERNS = {
  电话: [
    /电话/,
    /通话/,
    /来电/,
    /回电/,
    /致电/,
    /电联/,
    /电话沟通/,
    /电话交流/,
    /电话联系/,
    /语音电话/
  ],
  微信: [
    /微信/,
    /企微/,
    /企业微信/,
    /\bwx\b/i,
    /\bvx\b/i,
    /私信/,
    /群里/,
    /朋友圈/,
    /聊天记录/,
    /微信沟通/,
    /微信交流/
  ],
  邮件: [
    /邮件/,
    /邮箱/,
    /\be-?mail\b/i,
    /\bmail\b/i,
    /发函/,
    /回函/
  ],
  面谈: [
    /面谈/,
    /当面/,
    /见面/,
    /会面/,
    /碰面/,
    /拜访/,
    /到访/,
    /来访/,
    /现场/,
    /线下/,
    /上门/,
    /去公司/,
    /来公司/,
    /到公司/,
    /在公司/,
    /办公室/,
    /会议室/,
    /约饭/,
    /一起吃饭/,
    /吃饭/,
    /喝茶/,
    /咖啡/,
    /打球/,
    /约球/
  ]
}

const RELATIVE_DAY_META = {
  今天: { dayOffset: 0 },
  今日: { dayOffset: 0 },
  今早: { dayOffset: 0, period: '早上' },
  今晨: { dayOffset: 0, period: '早上' },
  今天早上: { dayOffset: 0, period: '早上' },
  今天上午: { dayOffset: 0, period: '上午' },
  今天中午: { dayOffset: 0, period: '中午' },
  今天下午: { dayOffset: 0, period: '下午' },
  今天晚上: { dayOffset: 0, period: '晚上' },
  今晚: { dayOffset: 0, period: '晚上' },
  昨天: { dayOffset: -1 },
  昨天早上: { dayOffset: -1, period: '早上' },
  昨天上午: { dayOffset: -1, period: '上午' },
  昨天中午: { dayOffset: -1, period: '中午' },
  昨天下午: { dayOffset: -1, period: '下午' },
  昨天晚上: { dayOffset: -1, period: '晚上' },
  昨晚: { dayOffset: -1, period: '晚上' },
  前天: { dayOffset: -2 },
  前天早上: { dayOffset: -2, period: '早上' },
  前天上午: { dayOffset: -2, period: '上午' },
  前天中午: { dayOffset: -2, period: '中午' },
  前天下午: { dayOffset: -2, period: '下午' },
  前天晚上: { dayOffset: -2, period: '晚上' },
  前晚: { dayOffset: -2, period: '晚上' },
  刚才: { dayOffset: 0, useCurrentClock: true },
  刚刚: { dayOffset: 0, useCurrentClock: true }
}

const COARSE_PERIOD_TIME_MAP = {
  凌晨: { hour: 2, minute: 0 },
  早上: { hour: 9, minute: 30 },
  上午: { hour: 10, minute: 0 },
  中午: { hour: 12, minute: 0 },
  下午: { hour: 15, minute: 0 },
  傍晚: { hour: 18, minute: 30 },
  晚上: { hour: 20, minute: 0 }
}

const FUTURE_CONTEXT_PATTERN = /明天|后天|下周|下次|计划|准备|待|将|预计|约在|会在|打算|安排在|定在|定于|约了|约好|约定|预定|拟于/
const COMMUNICATION_CONTEXT_PATTERN = /沟通|交流|联系|聊|谈|回电|来电|电话|微信|邮件|见面|会面|拜访|到访|碰面|当面|现场/
const PLANNED_METHOD_PATTERN = /约了|约好|约定|约在|安排|计划|准备|打算|定在|定于|预定|拟于/
const COMPLETED_ACTION_PATTERN = /已|已经|完成|刚才|刚刚|聊了|沟通了|交流了|联系了|回复了|确认了|同步了|见了|会了|碰了|拜访了|到访了|吃了|打了/
const EXACT_RELATIVE_TIME_PATTERN = /(今天早上|今天上午|今天中午|今天下午|今天晚上|昨天下午|昨天晚上|昨天上午|昨天中午|前天下午|前天晚上|前天上午|前天中午|今天|今日|今早|今晨|今晚|昨天|昨晚|前天|前晚)\s*(凌晨|早上|上午|中午|下午|傍晚|晚上)?\s*(\d{1,2})(?:[:：点时](\d{1,2})分?)?(半|一刻|三刻)?/
const EXACT_ABSOLUTE_DATE_TIME_PATTERNS = [
  /(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})[日号]?\s*(凌晨|早上|上午|中午|下午|傍晚|晚上)?\s*(\d{1,2})(?:[:：点时](\d{1,2})分?)?(半|一刻|三刻)?/,
  /(\d{1,2})月(\d{1,2})[日号]?\s*(凌晨|早上|上午|中午|下午|傍晚|晚上)?\s*(\d{1,2})(?:[:：点时](\d{1,2})分?)?(半|一刻|三刻)?/
]
const COARSE_RELATIVE_TOKENS = [
  '昨天晚上',
  '昨晚',
  '昨天上午',
  '昨天中午',
  '昨天下午',
  '前天晚上',
  '前晚',
  '前天上午',
  '前天中午',
  '前天下午',
  '今天晚上',
  '今晚',
  '今天上午',
  '今天中午',
  '今天下午',
  '今早',
  '今晨',
  '昨天',
  '前天',
  '今天',
  '今日',
  '刚才',
  '刚刚'
]
const COARSE_ABSOLUTE_DATE_PATTERNS = [
  /(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})[日号]?/,
  /(\d{1,2})月(\d{1,2})[日号]?/
]

function normalizeText(value) {
  return String(value || '').trim()
}

function padNumber(value) {
  return `${value}`.padStart(2, '0')
}

function isValidDateObject(value) {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

function formatDateInput(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (!isValidDateObject(date)) {
    return ''
  }

  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`
}

function formatTimeInput(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (!isValidDateObject(date)) {
    return ''
  }

  return `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`
}

function isValidDateText(value) {
  const current = normalizeText(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(current)) {
    return false
  }

  const parsed = new Date(`${current}T00:00:00`)
  return isValidDateObject(parsed) && formatDateInput(parsed) === current
}

function isValidTimeText(value) {
  const current = normalizeText(value)
  if (!/^\d{2}:\d{2}$/.test(current)) {
    return false
  }

  const hour = Number(current.slice(0, 2))
  const minute = Number(current.slice(3, 5))
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
}

function normalizeFollowUpOccurredTimePrecision(value) {
  const current = normalizeText(value)
  return ['exact', 'coarse', 'default_now'].includes(current) ? current : 'default_now'
}

function normalizeFollowUpMethod(value, fallback = '') {
  const method = normalizeText(value)
  return FOLLOW_UP_METHODS.includes(method) ? method : fallback
}

function isSpecificFollowUpMethod(value) {
  const method = normalizeFollowUpMethod(value, '')
  return !!method && method !== '其他'
}

function buildDefaultFollowUpOccurredMeta(options = {}) {
  const now = isValidDateObject(options.now) ? new Date(options.now) : new Date()
  return {
    followUpOccurredDate: formatDateInput(now),
    followUpOccurredTime: formatTimeInput(now),
    followUpOccurredTimePrecision: 'default_now'
  }
}

function normalizeFollowUpOccurredMeta(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const followUpOccurredDate = normalizeText(value.followUpOccurredDate)
  const followUpOccurredTime = normalizeText(value.followUpOccurredTime)
  if (!isValidDateText(followUpOccurredDate) || !isValidTimeText(followUpOccurredTime)) {
    return null
  }

  return {
    followUpOccurredDate,
    followUpOccurredTime,
    followUpOccurredTimePrecision: normalizeFollowUpOccurredTimePrecision(value.followUpOccurredTimePrecision)
  }
}

function resolvePreferredFollowUpMethod(options = {}) {
  const detectedMethod = normalizeFollowUpMethod(options.detectedMethod, '')
  const aiMethod = normalizeFollowUpMethod(options.aiMethod, '')
  const fallbackMethod = normalizeFollowUpMethod(options.fallbackMethod, '其他') || '其他'

  if (isSpecificFollowUpMethod(detectedMethod)) {
    return detectedMethod
  }

  if (isSpecificFollowUpMethod(aiMethod)) {
    return aiMethod
  }

  return aiMethod || detectedMethod || fallbackMethod
}

function resolvePreferredFollowUpOccurredMeta(aiMeta, detectedMeta, options = {}) {
  const aiOccurredMeta = normalizeFollowUpOccurredMeta(aiMeta)
  const detectedOccurredMeta = normalizeFollowUpOccurredMeta(detectedMeta)

  if (aiOccurredMeta && aiOccurredMeta.followUpOccurredTimePrecision !== 'default_now') {
    return aiOccurredMeta
  }

  if (shouldPreferDetectedOccurredMeta(detectedOccurredMeta, options)) {
    return detectedOccurredMeta
  }

  if (aiOccurredMeta) {
    return aiOccurredMeta
  }

  return buildDefaultFollowUpOccurredMeta(options)
}

function parseMinuteValue(rawMinute = '', suffix = '') {
  const minuteText = normalizeText(rawMinute)
  const suffixText = normalizeText(suffix)
  if (minuteText) {
    const minute = Number(minuteText)
    return Number.isFinite(minute) ? minute : 0
  }

  if (suffixText === '半') {
    return 30
  }

  if (suffixText === '一刻') {
    return 15
  }

  if (suffixText === '三刻') {
    return 45
  }

  return 0
}

function applyPeriodToHour(rawHour, period = '') {
  let hour = Number(rawHour)
  if (!Number.isFinite(hour)) {
    return null
  }

  const currentPeriod = normalizeText(period)
  if (currentPeriod === '凌晨') {
    if (hour === 12) {
      return 0
    }
    return hour
  }

  if (currentPeriod === '中午') {
    if (hour >= 1 && hour <= 10) {
      return hour + 12
    }
    return hour
  }

  if (currentPeriod === '下午' || currentPeriod === '傍晚' || currentPeriod === '晚上') {
    if (hour >= 1 && hour <= 11) {
      return hour + 12
    }
    return hour
  }

  return hour
}

function buildOccurredMeta(date, hour, minute, precision) {
  const nextDate = new Date(date)
  nextDate.setHours(hour, minute, 0, 0)
  return {
    followUpOccurredDate: formatDateInput(nextDate),
    followUpOccurredTime: formatTimeInput(nextDate),
    followUpOccurredTimePrecision: precision
  }
}

function findPatternIndex(text, pattern) {
  const matched = pattern.exec(text)
  if (!matched) {
    return null
  }

  return {
    matched,
    index: matched.index
  }
}

function buildDateFromParts(year, month, day, hour, minute) {
  const nextDate = new Date(Number(year), Number(month) - 1, Number(day), hour, minute, 0, 0)
  if (!isValidDateObject(nextDate)) {
    return null
  }

  if (
    nextDate.getFullYear() !== Number(year)
    || nextDate.getMonth() !== Number(month) - 1
    || nextDate.getDate() !== Number(day)
  ) {
    return null
  }

  return nextDate
}

function isFutureOccurredAt(occurredAt, now) {
  return isValidDateObject(occurredAt) && isValidDateObject(now) && occurredAt.getTime() > now.getTime()
}

function parseOccurredMetaDateTime(value) {
  const meta = normalizeFollowUpOccurredMeta(value)
  if (!meta) {
    return null
  }

  const parsed = new Date(`${meta.followUpOccurredDate}T${meta.followUpOccurredTime}:00`)
  return isValidDateObject(parsed) ? parsed : null
}

function shouldPreferDetectedOccurredMeta(value, options = {}) {
  const detectedMeta = normalizeFollowUpOccurredMeta(value)
  if (!detectedMeta || detectedMeta.followUpOccurredTimePrecision === 'default_now') {
    return false
  }

  const now = isValidDateObject(options.now) ? new Date(options.now) : new Date()
  const detectedAt = parseOccurredMetaDateTime(detectedMeta)
  if (!detectedAt || isFutureOccurredAt(detectedAt, now)) {
    return false
  }

  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  if (detectedAt.getTime() < todayStart.getTime()) {
    return true
  }

  return detectedMeta.followUpOccurredTimePrecision === 'exact'
}

function hasFutureContext(text, index, length) {
  const start = Math.max(0, index - 4)
  const end = Math.min(text.length, index + length + 8)
  return FUTURE_CONTEXT_PATTERN.test(text.slice(start, end))
}

function hasCommunicationContext(text, index, length) {
  const start = Math.max(0, index - 8)
  const end = Math.min(text.length, index + length + 10)
  return COMMUNICATION_CONTEXT_PATTERN.test(text.slice(start, end))
}

function getClauseContext(text, index, length) {
  const separators = '，,。；;！？\n'
  let start = 0
  let end = text.length

  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (separators.indexOf(text[cursor]) >= 0) {
      start = cursor + 1
      break
    }
  }

  for (let cursor = index + length; cursor < text.length; cursor += 1) {
    if (separators.indexOf(text[cursor]) >= 0) {
      end = cursor
      break
    }
  }

  return {
    text: text.slice(start, end),
    index: Math.max(0, index - start)
  }
}

function buildGlobalPattern(pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  return new RegExp(pattern.source, flags)
}

function hasFutureSameDayPeriodContext(text, index, length, now) {
  const currentNow = isValidDateObject(now) ? new Date(now) : new Date()
  const start = Math.max(0, index - 10)
  const end = Math.min(text.length, index + length + 12)
  const contextText = text.slice(start, end)
  const tokens = Object.keys(RELATIVE_DAY_META)
    .filter((token) => {
      const config = RELATIVE_DAY_META[token]
      return Number(config && config.dayOffset) === 0 && config.period
    })
    .sort((left, right) => right.length - left.length)

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex]
    if (contextText.indexOf(token) < 0) {
      continue
    }

    const config = RELATIVE_DAY_META[token]
    const clock = getCoarsePeriodClock(config.period, currentNow)
    const occurredAt = new Date(currentNow)
    occurredAt.setHours(clock.hour, clock.minute, 0, 0)
    if (isFutureOccurredAt(occurredAt, currentNow)) {
      return true
    }
  }

  return false
}

function hasFutureExactRelativeDateTime(text, now) {
  const result = findPatternIndex(text, EXACT_RELATIVE_TIME_PATTERN)
  if (!result) {
    return false
  }

  const token = result.matched[1]
  const config = getRelativeDayConfig(token)
  if (!config) {
    return false
  }

  const period = normalizeText(result.matched[2]) || normalizeText(config.period)
  const hour = applyPeriodToHour(result.matched[3], period)
  const minute = parseMinuteValue(result.matched[4], result.matched[5])
  if (hour === null || minute > 59) {
    return false
  }

  const occurredAt = new Date(now)
  occurredAt.setDate(occurredAt.getDate() + Number(config.dayOffset || 0))
  occurredAt.setHours(hour, minute, 0, 0)
  return isFutureOccurredAt(occurredAt, now)
}

function hasFutureExactAbsoluteDateTime(text, now) {
  for (let index = 0; index < EXACT_ABSOLUTE_DATE_TIME_PATTERNS.length; index += 1) {
    const pattern = EXACT_ABSOLUTE_DATE_TIME_PATTERNS[index]
    const result = findPatternIndex(text, pattern)
    if (!result) {
      continue
    }

    const values = result.matched
    let year = now.getFullYear()
    let month = ''
    let day = ''
    let period = ''
    let rawHour = ''
    let rawMinute = ''
    let suffix = ''

    if (index === 0) {
      year = Number(values[1])
      month = values[2]
      day = values[3]
      period = values[4]
      rawHour = values[5]
      rawMinute = values[6]
      suffix = values[7]
    } else {
      month = values[1]
      day = values[2]
      period = values[3]
      rawHour = values[4]
      rawMinute = values[5]
      suffix = values[6]
    }

    const hour = applyPeriodToHour(rawHour, period)
    const minute = parseMinuteValue(rawMinute, suffix)
    if (hour === null || minute > 59) {
      continue
    }

    const occurredAt = buildDateFromParts(year, month, day, hour, minute)
    if (occurredAt && isFutureOccurredAt(occurredAt, now)) {
      return true
    }
  }

  return false
}

function hasFutureCoarseAbsoluteDateTime(text, now) {
  for (let index = 0; index < COARSE_ABSOLUTE_DATE_PATTERNS.length; index += 1) {
    const pattern = COARSE_ABSOLUTE_DATE_PATTERNS[index]
    const result = findPatternIndex(text, pattern)
    if (!result) {
      continue
    }

    let year = now.getFullYear()
    let month = ''
    let day = ''

    if (index === 0) {
      year = Number(result.matched[1])
      month = result.matched[2]
      day = result.matched[3]
    } else {
      month = result.matched[1]
      day = result.matched[2]
    }

    const occurredAt = buildDateFromParts(year, month, day, now.getHours(), now.getMinutes())
    if (occurredAt && isFutureOccurredAt(occurredAt, now)) {
      return true
    }
  }

  return false
}

function hasFutureOccurredReferenceInText(text, now) {
  return hasFutureSameDayPeriodContext(text, 0, text.length, now)
    || hasFutureExactRelativeDateTime(text, now)
    || hasFutureExactAbsoluteDateTime(text, now)
    || hasFutureCoarseAbsoluteDateTime(text, now)
}

function isPlannedMethodClause(text = '') {
  const current = normalizeText(text)
  if (!current || (!FUTURE_CONTEXT_PATTERN.test(current) && !PLANNED_METHOD_PATTERN.test(current))) {
    return false
  }

  return !COMPLETED_ACTION_PATTERN.test(current)
}

function hasOccurredMethodMatch(text, pattern, now) {
  const globalPattern = buildGlobalPattern(pattern)
  let matched = globalPattern.exec(text)

  while (matched) {
    const matchedText = normalizeText(matched[0])
    const matchedIndex = Number(matched.index)
    const clauseContext = getClauseContext(text, matchedIndex, matchedText.length)
    if (
      matchedText
      && !hasFutureContext(clauseContext.text, clauseContext.index, matchedText.length)
      && !isPlannedMethodClause(clauseContext.text)
      && !hasFutureOccurredReferenceInText(clauseContext.text, now)
    ) {
      return true
    }
    matched = globalPattern.exec(text)
  }

  return false
}

function detectFollowUpMethodFromContent(value, options = {}) {
  const text = normalizeText(value)
  if (!text) {
    return '其他'
  }

  const now = isValidDateObject(options.now) ? new Date(options.now) : new Date()
  const matchedMethods = Object.keys(METHOD_PATTERNS).filter((method) => {
    return METHOD_PATTERNS[method].some((pattern) => hasOccurredMethodMatch(text, pattern, now))
  })

  if (matchedMethods.length !== 1) {
    return '其他'
  }

  return matchedMethods[0]
}

function getRelativeDayConfig(token = '') {
  return RELATIVE_DAY_META[normalizeText(token)] || null
}

function getCoarsePeriodClock(period = '', fallbackDate = null) {
  const current = normalizeText(period)
  const matched = COARSE_PERIOD_TIME_MAP[current]
  if (matched) {
    return matched
  }

  const date = isValidDateObject(fallbackDate) ? fallbackDate : new Date()
  return {
    hour: date.getHours(),
    minute: date.getMinutes()
  }
}

function extractExactAbsoluteDateTime(text, now) {
  for (let index = 0; index < EXACT_ABSOLUTE_DATE_TIME_PATTERNS.length; index += 1) {
    const pattern = EXACT_ABSOLUTE_DATE_TIME_PATTERNS[index]
    const result = findPatternIndex(text, pattern)
    if (!result) {
      continue
    }

    const values = result.matched
    let year = now.getFullYear()
    let month = ''
    let day = ''
    let period = ''
    let rawHour = ''
    let rawMinute = ''
    let suffix = ''

    if (index === 0) {
      year = Number(values[1])
      month = values[2]
      day = values[3]
      period = values[4]
      rawHour = values[5]
      rawMinute = values[6]
      suffix = values[7]
    } else {
      month = values[1]
      day = values[2]
      period = values[3]
      rawHour = values[4]
      rawMinute = values[5]
      suffix = values[6]
    }

    const hour = applyPeriodToHour(rawHour, period)
    const minute = parseMinuteValue(rawMinute, suffix)
    if (hour === null || minute > 59) {
      continue
    }

    const occurredAt = buildDateFromParts(year, month, day, hour, minute)
    if (!occurredAt || hasFutureContext(text, result.index, result.matched[0].length) || isFutureOccurredAt(occurredAt, now)) {
      continue
    }

    return buildOccurredMeta(occurredAt, occurredAt.getHours(), occurredAt.getMinutes(), 'exact')
  }

  return null
}

function extractExactRelativeDateTime(text, now) {
  const result = findPatternIndex(text, EXACT_RELATIVE_TIME_PATTERN)
  if (!result) {
    return null
  }

  const token = result.matched[1]
  const config = getRelativeDayConfig(token)
  if (!config || hasFutureContext(text, result.index, result.matched[0].length)) {
    return null
  }

  const period = normalizeText(result.matched[2]) || normalizeText(config.period)
  const hour = applyPeriodToHour(result.matched[3], period)
  const minute = parseMinuteValue(result.matched[4], result.matched[5])
  if (hour === null || minute > 59) {
    return null
  }

  const occurredAt = new Date(now)
  occurredAt.setDate(occurredAt.getDate() + Number(config.dayOffset || 0))
  occurredAt.setHours(hour, minute, 0, 0)
  if (isFutureOccurredAt(occurredAt, now)) {
    return null
  }
  return buildOccurredMeta(occurredAt, occurredAt.getHours(), occurredAt.getMinutes(), 'exact')
}

function extractCoarseRelativeDateTime(text, now) {
  const token = COARSE_RELATIVE_TOKENS.find((item) => text.indexOf(item) >= 0)
  if (!token) {
    return null
  }

  const config = getRelativeDayConfig(token)
  if (!config) {
    return null
  }

  const tokenIndex = text.indexOf(token)
  if (
    Number(config.dayOffset || 0) === 0
    && !config.useCurrentClock
    && hasFutureContext(text, tokenIndex, token.length)
    && !hasCommunicationContext(text, tokenIndex, token.length)
  ) {
    return null
  }

  const occurredAt = new Date(now)
  occurredAt.setDate(occurredAt.getDate() + Number(config.dayOffset || 0))

  if (config.useCurrentClock) {
    occurredAt.setHours(now.getHours(), now.getMinutes(), 0, 0)
  } else {
    const clock = getCoarsePeriodClock(config.period, now)
    occurredAt.setHours(clock.hour, clock.minute, 0, 0)
  }

  if (isFutureOccurredAt(occurredAt, now)) {
    return null
  }

  return buildOccurredMeta(occurredAt, occurredAt.getHours(), occurredAt.getMinutes(), 'coarse')
}

function extractCoarseAbsoluteDateTime(text, now) {
  for (let index = 0; index < COARSE_ABSOLUTE_DATE_PATTERNS.length; index += 1) {
    const pattern = COARSE_ABSOLUTE_DATE_PATTERNS[index]
    const result = findPatternIndex(text, pattern)
    if (!result) {
      continue
    }

    let year = now.getFullYear()
    let month = ''
    let day = ''

    if (index === 0) {
      year = Number(result.matched[1])
      month = result.matched[2]
      day = result.matched[3]
    } else {
      month = result.matched[1]
      day = result.matched[2]
    }

    const occurredAt = buildDateFromParts(year, month, day, now.getHours(), now.getMinutes())
    if (!occurredAt || hasFutureContext(text, result.index, result.matched[0].length) || isFutureOccurredAt(occurredAt, now)) {
      continue
    }

    return buildOccurredMeta(occurredAt, occurredAt.getHours(), occurredAt.getMinutes(), 'coarse')
  }

  return null
}

function extractFollowUpOccurredMetaFromContent(value, options = {}) {
  const now = isValidDateObject(options.now) ? new Date(options.now) : new Date()
  const text = normalizeText(value)
  if (!text) {
    return buildDefaultFollowUpOccurredMeta({ now })
  }

  const exactAbsoluteDateTime = extractExactAbsoluteDateTime(text, now)
  if (exactAbsoluteDateTime) {
    return exactAbsoluteDateTime
  }

  const exactRelativeDateTime = extractExactRelativeDateTime(text, now)
  if (exactRelativeDateTime) {
    return exactRelativeDateTime
  }

  const coarseRelativeDateTime = extractCoarseRelativeDateTime(text, now)
  if (coarseRelativeDateTime) {
    return coarseRelativeDateTime
  }

  const coarseAbsoluteDateTime = extractCoarseAbsoluteDateTime(text, now)
  if (coarseAbsoluteDateTime) {
    return coarseAbsoluteDateTime
  }

  return buildDefaultFollowUpOccurredMeta({ now })
}

module.exports = {
  FOLLOW_UP_METHODS,
  formatDateInput,
  formatTimeInput,
  isValidDateText,
  isValidTimeText,
  normalizeFollowUpMethod,
  isSpecificFollowUpMethod,
  detectFollowUpMethodFromContent,
  normalizeFollowUpOccurredMeta,
  normalizeFollowUpOccurredTimePrecision,
  buildDefaultFollowUpOccurredMeta,
  extractFollowUpOccurredMetaFromContent,
  resolvePreferredFollowUpMethod,
  resolvePreferredFollowUpOccurredMeta
}
