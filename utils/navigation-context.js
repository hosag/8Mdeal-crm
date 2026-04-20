function normalizeText(value) {
  return String(value || '').trim()
}

function appendQueryParams(url, params = {}) {
  const baseUrl = normalizeText(url)
  if (!baseUrl) {
    return ''
  }

  const hashIndex = baseUrl.indexOf('#')
  const hashText = hashIndex > -1 ? baseUrl.slice(hashIndex) : ''
  const pathWithQuery = hashIndex > -1 ? baseUrl.slice(0, hashIndex) : baseUrl
  const queryIndex = pathWithQuery.indexOf('?')
  const path = queryIndex > -1 ? pathWithQuery.slice(0, queryIndex) : pathWithQuery
  const queryText = queryIndex > -1 ? pathWithQuery.slice(queryIndex + 1) : ''
  const queryMap = {}

  queryText.split('&').forEach((pair) => {
    const currentPair = String(pair || '').trim()
    if (!currentPair) {
      return
    }

    const equalIndex = currentPair.indexOf('=')
    const rawKey = equalIndex > -1 ? currentPair.slice(0, equalIndex) : currentPair
    const rawValue = equalIndex > -1 ? currentPair.slice(equalIndex + 1) : ''
    const key = decodeURIComponent(rawKey)
    if (!key) {
      return
    }

    queryMap[key] = decodeURIComponent(rawValue)
  })

  Object.keys(params || {}).forEach((key) => {
    const value = params[key]
    if (value === undefined || value === null || value === '') {
      return
    }

    if (!Object.prototype.hasOwnProperty.call(queryMap, key)) {
      queryMap[key] = String(value)
    }
  })

  const nextQuery = Object.keys(queryMap).map((key) => {
    return `${encodeURIComponent(key)}=${encodeURIComponent(queryMap[key])}`
  }).join('&')
  return `${path}${nextQuery ? `?${nextQuery}` : ''}${hashText}`
}

function getSourcePrefix(source) {
  const currentSource = normalizeText(source)
  if (currentSource === 'home-headline') {
    return '来自首页提醒'
  }

  if (currentSource === 'notifications') {
    return '来自消息中心'
  }

  return ''
}

function buildFollowUpEntryHint(entry, source, type) {
  const currentEntry = normalizeText(entry)
  const currentType = normalizeText(type)
  const sourcePrefix = getSourcePrefix(source)

  if (currentEntry === 'home-todo') {
    return '来自首页待办：提交后会自动回写项目时间线，并同步首页待办节奏。'
  }

  if (currentEntry === 'projects') {
    return '来自我的项目：提交后会同步项目详情、列表摘要和首页待办。'
  }

  if (currentEntry === 'notification') {
    const prefix = sourcePrefix || '来自消息中心'
    if (currentType === 'todo_overdue') {
      return `${prefix}：提交后会自动收口对应逾期提醒，并同步首页待办节奏。`
    }

    return `${prefix}：提交后会自动收口对应提醒，并同步首页待办节奏。`
  }

  return ''
}

function buildProjectDetailEntryContext(viewMode, source, notificationType) {
  const currentViewMode = normalizeText(viewMode)
  const currentType = normalizeText(notificationType)
  const sourcePrefix = getSourcePrefix(source)

  if (sourcePrefix) {
    if (currentType === 'task_overdue' || currentType === 'task_due') {
      return `${sourcePrefix}：这里展示这条推进动作对应的完整项目上下文，处理后会自动收口对应提醒。`
    }

    if (currentType === 'task_upcoming') {
      return `${sourcePrefix}：这里展示明天动作对应的完整项目上下文，方便你提前准备。`
    }

    if (currentType === 'todo_overdue' || currentType === 'todo_due') {
      return `${sourcePrefix}：这里展示这次跟进对应的完整项目上下文，处理后会自动收口对应提醒。`
    }

    if (currentType === 'todo_upcoming') {
      return `${sourcePrefix}：这里展示明天跟进对应的完整项目上下文，方便你提前准备。`
    }

    if (currentType === 'shared_opened' || currentType === 'shared_imported' || currentType === 'shared_followed' || currentType === 'project_taken_over') {
      return `${sourcePrefix}：这里展示这条业务动态背后的完整项目上下文。`
    }

    return `${sourcePrefix}：这里展示这条提醒对应的完整项目上下文。`
  }

  if (currentViewMode === 'home-task') {
    return '来自首页动作优先：这里展示这条推进动作背后的完整项目上下文与最新状态。'
  }

  if (currentViewMode === 'home-todo') {
    return '来自首页待办：这里展示这条待办对应的完整项目上下文。'
  }

  if (currentViewMode === 'home-timeline') {
    return '来自首页动态：这里展示这条动态背后的完整项目上下文与最新进展。'
  }

  if (currentViewMode === 'projects') {
    return '来自我的项目：这里展示该项目的完整上下文、推进状态与分享情况。'
  }

  if (currentViewMode === 'shared-out') {
    return '来自外发项目：当前页用于查看接手方接手后的后续进展。'
  }

  return ''
}

function buildProjectsEntryContext(source, quickFilter, stageFilter) {
  const currentSource = normalizeText(source)
  const currentQuickFilter = normalizeText(quickFilter)
  const currentStageFilter = normalizeText(stageFilter)

  if (currentSource === 'home-task' || currentSource === 'home-todo') {
    return '来自首页待办：已自动筛选有动作项目，并按动作优先排序。'
  }

  if (currentSource === 'home-overdue') {
    return '来自首页快捷入口：已自动筛选逾期项目，方便你优先处理。'
  }

  if (currentSource === 'home-shared') {
    return '来自首页快捷入口：已自动筛选我接手的项目，方便你集中推进。'
  }

  if (currentQuickFilter !== 'all' || currentStageFilter !== '全部阶段') {
    return '当前结果已按入口条件自动筛选，你也可以继续手动调整。'
  }

  return ''
}

module.exports = {
  appendQueryParams,
  buildFollowUpEntryHint,
  buildProjectDetailEntryContext,
  buildProjectsEntryContext
}
