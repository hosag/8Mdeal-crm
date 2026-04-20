const {
  loadNotificationsData,
  markNotificationReadData,
  resolveNotificationData
} = require('../../services/data')
const { appendQueryParams } = require('../../utils/navigation-context')
const { getNotificationCategoryMeta } = require('../../utils/notification-meta')
const { touchNotificationSync } = require('../../utils/notification-sync')

const STATUS_FILTERS = [
  { key: 'all', label: '全部消息' },
  { key: 'unread', label: '待查看' },
  { key: 'pending', label: '待收口' },
  { key: 'resolved', label: '已收口' }
]
const TYPE_FILTERS = [
  { key: 'all', label: '全部类型' },
  { key: 'todo', label: '待办提醒' },
  { key: 'shared', label: '外发与接手' },
  { key: 'system', label: '系统异常' }
]
const QUICK_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'overdue', label: '逾期' },
  { key: 'today', label: '今天' },
  { key: 'tomorrow', label: '明天' },
  { key: 'updates', label: '动态' }
]

function getQuickFilterKey(item) {
  const type = String(item && item.type || '').trim()

  if (type === 'task_overdue' || type === 'todo_overdue') {
    return 'overdue'
  }

  if (type === 'task_due' || type === 'todo_due') {
    return 'today'
  }

  if (type === 'task_upcoming' || type === 'todo_upcoming') {
    return 'tomorrow'
  }

  if (type === 'shared_opened' || type === 'shared_imported' || type === 'shared_followed' || type === 'project_taken_over' || type === 'ai_failed' || type === 'save_failed') {
    return 'updates'
  }

  return 'all'
}

function getNotificationLevelText(level) {
  const currentLevel = String(level || '').trim()
  if (currentLevel === 'high') {
    return '高优先'
  }

  if (currentLevel === 'info') {
    return '提示'
  }

  return '常规'
}

function getNotificationStatusText(status) {
  const currentStatus = String(status || '').trim()
  if (currentStatus === 'resolved') {
    return '已收口'
  }

  if (currentStatus === 'read') {
    return '待收口'
  }

  return '待查看'
}

function getNotificationToneMeta(type, status) {
  const currentType = String(type || '').trim()
  const currentStatus = String(status || '').trim()

  if (currentStatus === 'resolved') {
    return {
      cardClass: 'is-resolved',
      toneClass: 'is-resolved',
      toneText: '已收口'
    }
  }

  if (currentType === 'task_overdue' || currentType === 'todo_overdue') {
    return {
      cardClass: 'is-overdue',
      toneClass: 'is-overdue',
      toneText: '优先处理'
    }
  }

  if (currentType === 'task_due' || currentType === 'todo_due') {
    return {
      cardClass: 'is-today',
      toneClass: 'is-today',
      toneText: '今天处理'
    }
  }

  if (currentType === 'task_upcoming' || currentType === 'todo_upcoming') {
    return {
      cardClass: 'is-tomorrow',
      toneClass: 'is-tomorrow',
      toneText: '提前准备'
    }
  }

  if (currentType === 'shared_opened' || currentType === 'shared_imported' || currentType === 'shared_followed' || currentType === 'project_taken_over') {
    return {
      cardClass: 'is-update',
      toneClass: 'is-update',
      toneText: '业务动态'
    }
  }

  if (currentType === 'ai_failed' || currentType === 'save_failed') {
    return {
      cardClass: 'is-system',
      toneClass: 'is-system',
      toneText: '异常待处理'
    }
  }

  return {
    cardClass: '',
    toneClass: '',
    toneText: ''
  }
}

function buildNotificationOpenUrl(item) {
  const type = String(item && item.type || '').trim()
  const projectId = String(item && item.projectId || '').trim()
  const taskId = String(item && item.taskId || '').trim()
  const actionUrl = String(item && item.actionUrl || '').trim()

  if (actionUrl) {
    return actionUrl
  }

  if ((type === 'task_due' || type === 'task_overdue') && projectId && taskId) {
    return `/pages/project-detail/project-detail?projectId=${projectId}&view=home-task&taskId=${taskId}&openTaskComplete=1`
  }

  if (type === 'task_upcoming' && projectId && taskId) {
    return `/pages/project-detail/project-detail?projectId=${projectId}&view=home-task&taskId=${taskId}`
  }

  if ((type === 'todo_due' || type === 'todo_overdue') && projectId) {
    return `/pages/follow-up/follow-up?projectId=${projectId}&entry=notification&type=${type}`
  }

  if (type === 'todo_upcoming' && projectId) {
    return `/pages/project-detail/project-detail?projectId=${projectId}&view=projects`
  }

  if (type === 'project_taken_over' && projectId) {
    return `/pages/project-detail/project-detail?projectId=${projectId}&view=projects`
  }

  if ((type === 'shared_opened' || type === 'shared_imported' || type === 'shared_followed') && projectId) {
    return `/pages/project-detail/project-detail?projectId=${projectId}&view=shared-out`
  }

  if (projectId) {
    return `/pages/project-detail/project-detail?projectId=${projectId}`
  }

  if (type === 'shared_opened' || type === 'shared_imported' || type === 'shared_followed') {
    return '/pages/shared-out/shared-out'
  }

  return ''
}

function decorateNotificationUrl(url, type) {
  const currentUrl = normalizeText(url)
  const currentType = normalizeText(type)
  if (!currentUrl) {
    return ''
  }

  if (currentUrl.indexOf('/pages/follow-up/follow-up') === 0) {
    return appendQueryParams(currentUrl, {
      entry: 'notification',
      source: 'notifications',
      type: currentType
    })
  }

  if (currentUrl.indexOf('/pages/project-detail/project-detail') === 0) {
    return appendQueryParams(currentUrl, {
      source: 'notifications',
      notificationType: currentType
    })
  }

  if (currentUrl.indexOf('/pages/projects/projects') === 0) {
    return appendQueryParams(currentUrl, {
      source: 'notifications'
    })
  }

  if (currentUrl.indexOf('/pages/shared-out/shared-out') === 0) {
    return appendQueryParams(currentUrl, {
      source: 'notifications'
    })
  }

  return currentUrl
}

function buildNotificationActions(item, categoryMeta, actionUrl) {
  const status = String(item && item.status || '').trim() || 'unread'
  const canMarkRead = !!item.canMarkRead
  const canResolve = !!item.canResolve
  const actionLabel = String(item && item.actionLabel || '').trim() || categoryMeta.fallbackActionLabel
  const actions = []

  actions.push({
    key: 'open',
    label: status === 'resolved' ? '再次查看' : actionLabel,
    kind: status === 'resolved' ? 'ghost' : 'primary',
    url: actionUrl,
    autoResolve: !!categoryMeta.autoResolveOnOpen
  })

  if (categoryMeta.key === 'system') {
    if (status === 'unread' && canMarkRead) {
      actions.push({
        key: 'mark_read',
        label: '标为已查看',
        kind: 'ghost'
      })
    } else if (status !== 'resolved' && canResolve) {
      actions.push({
        key: 'resolve',
        label: '标为已收口',
        kind: 'ghost'
      })
    }

    return actions
  }

  if (categoryMeta.key === 'all' && status === 'unread' && canMarkRead) {
    actions.push({
      key: 'mark_read',
      label: '标为已查看',
      kind: 'ghost'
    })
  }

  return actions.slice(0, 2)
}

function splitNotificationActions(actions) {
  const list = Array.isArray(actions) ? actions : []
  const primaryAction = list.find((item) => item.key === 'open') || list[0] || null
  const secondaryActions = primaryAction
    ? list.filter((item) => item.key !== primaryAction.key)
    : []

  return {
    primaryAction,
    secondaryActions
  }
}

function normalizeNotification(item, index) {
  const categoryMeta = getNotificationCategoryMeta(item.type)
  const actionUrl = buildNotificationOpenUrl(item)
  const actions = buildNotificationActions(item, categoryMeta, actionUrl)
  const toneMeta = getNotificationToneMeta(item.type, item.status)
  const actionMeta = splitNotificationActions(actions)

  return {
    id: item.id || `notification-${index}`,
    type: item.type || 'system',
    level: item.level || 'normal',
    levelText: getNotificationLevelText(item.level),
    levelClassName: item.levelClassName || '',
    status: item.status || 'unread',
    statusText: getNotificationStatusText(item.status),
    statusClassName: item.statusClassName || '',
    title: item.title || '系统提醒',
    summary: item.summary || '暂无摘要',
    projectId: item.projectId || '',
    projectName: item.projectName || '未命名项目',
    taskId: item.taskId || '',
    actionUrl,
    actionLabel: item.actionLabel || categoryMeta.fallbackActionLabel,
    canMarkRead: !!item.canMarkRead,
    canResolve: !!item.canResolve,
    createdAtText: item.createdAtText || '刚刚',
    sourceName: item.sourceName || '',
    categoryKey: categoryMeta.key,
    categoryLabel: categoryMeta.label,
    cardClassName: toneMeta.cardClass,
    toneClassName: toneMeta.toneClass,
    toneText: toneMeta.toneText,
    quickFilterKey: getQuickFilterKey(item),
    hintText: categoryMeta.hintText,
    autoResolveOnOpen: !!categoryMeta.autoResolveOnOpen,
    actions,
    primaryAction: actionMeta.primaryAction,
    secondaryActions: actionMeta.secondaryActions,
    cardActionText: actionMeta.primaryAction
      ? (actionMeta.primaryAction.label || '点击处理')
      : '',
    hasSecondaryActions: actionMeta.secondaryActions.length > 0
  }
}

Page({
  data: {
    statusFilters: STATUS_FILTERS,
    typeFilters: TYPE_FILTERS,
    quickFilters: QUICK_FILTERS,
    statusFilter: 'all',
    typeFilter: 'all',
    quickFilter: 'all',
    allNotifications: [],
    notifications: [],
    resultSummaryText: '正在整理消息',
    stats: {
      totalCount: 0,
      unreadCount: 0,
      pendingCount: 0,
      resolvedCount: 0
    },
    isLoading: true,
    isLoadFailed: false,
    loadError: '',
    dataSource: 'CloudBase 已连接'
  },

  safeSetData(update, callback) {
    if (!this.isPageActive) {
      return
    }

    this.setData(update, callback)
  },

  async onLoad() {
    this.isPageActive = true
    await this.fetchNotifications()
  },

  async onShow() {
    this.isPageActive = true
    if (!this.data.isLoading) {
      await this.fetchNotifications()
    }
  },

  onHide() {
    this.isPageActive = false
  },

  onUnload() {
    this.isPageActive = false
  },

  async onPullDownRefresh() {
    await this.fetchNotifications()
    wx.stopPullDownRefresh()
  },

  async fetchNotifications() {
    this.safeSetData({
      isLoading: true,
      isLoadFailed: false,
      loadError: ''
    })

    try {
      const result = await loadNotificationsData({
        statusFilter: this.data.statusFilter,
        limit: 50
      })

      const allNotifications = (Array.isArray(result.notifications) ? result.notifications : []).map(normalizeNotification)

      this.safeSetData({
        allNotifications,
        stats: result && result.stats ? result.stats : {
          totalCount: 0,
          unreadCount: 0,
          pendingCount: 0,
          resolvedCount: 0
        },
        isLoading: false
      }, () => this.applyFilters())
    } catch (error) {
      this.safeSetData({
        allNotifications: [],
        notifications: [],
        resultSummaryText: '当前无法读取消息',
        stats: {
          totalCount: 0,
          unreadCount: 0,
          pendingCount: 0,
          resolvedCount: 0
        },
        isLoading: false,
        isLoadFailed: true,
        loadError: error && error.message ? error.message : '暂时无法同步消息中心，请稍后重试'
      })

      wx.showToast({
        title: '暂时无法同步消息中心',
        icon: 'none'
      })
    }
  },

  setStatusFilter(event) {
    const { filter } = event.currentTarget.dataset
    if (!filter || filter === this.data.statusFilter) {
      return
    }

    this.setData({
      statusFilter: filter
    }, () => this.fetchNotifications())
  },

  setTypeFilter(event) {
    const { filter } = event.currentTarget.dataset
    if (!filter || filter === this.data.typeFilter) {
      return
    }

    this.setData({
      typeFilter: filter
    }, () => this.applyFilters())
  },

  setQuickFilter(event) {
    const { filter } = event.currentTarget.dataset
    if (!filter || filter === this.data.quickFilter) {
      return
    }

    this.setData({
      quickFilter: filter
    }, () => this.applyFilters())
  },

  applyFilters() {
    const typeFilter = this.data.typeFilter
    const quickFilter = this.data.quickFilter
    const allNotifications = Array.isArray(this.data.allNotifications) ? this.data.allNotifications : []
    const typeMatchedNotifications = allNotifications.filter((item) => {
      if (typeFilter === 'todo') {
        return item.categoryKey === 'todo'
      }

      if (typeFilter === 'shared') {
        return item.categoryKey === 'shared'
      }

      if (typeFilter === 'system') {
        return item.categoryKey === 'system'
      }

      return true
    })
    const quickFilterStats = QUICK_FILTERS.map((filter) => {
      if (filter.key === 'all') {
        return {
          ...filter,
          count: typeMatchedNotifications.length
        }
      }

      return {
        ...filter,
        count: typeMatchedNotifications.filter((item) => item.quickFilterKey === filter.key).length
      }
    })
    const notifications = typeMatchedNotifications.filter((item) => {
      if (quickFilter === 'all') {
        return true
      }

      return item.quickFilterKey === quickFilter
    })
    const currentTypeFilter = TYPE_FILTERS.find((item) => item.key === typeFilter)
    const currentQuickFilter = quickFilterStats.find((item) => item.key === quickFilter)
    const summaryParts = [
      `当前共 ${notifications.length} 条消息`,
      currentTypeFilter ? currentTypeFilter.label : '全部类型'
    ]

    if (currentQuickFilter && currentQuickFilter.key !== 'all') {
      summaryParts.push(currentQuickFilter.label)
    }

    this.setData({
      quickFilters: quickFilterStats,
      notifications,
      resultSummaryText: summaryParts.join(' · ')
    })
  },

  async markAllRead() {
    if (!this.data.stats.unreadCount) {
      return
    }

    try {
      const result = await markNotificationReadData({
        markAll: true
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '标为已查看失败')
      }

      wx.showToast({
        title: '已标为已查看',
        icon: 'success'
      })

      touchNotificationSync('notifications_mark_all_read')
      await this.fetchNotifications()
    } catch (error) {
      wx.showToast({
        title: error && error.message ? error.message : '标为已查看失败',
        icon: 'none'
      })
    }
  },

  async handleMarkRead(event) {
    const { id } = event.currentTarget.dataset
    if (!id) {
      return
    }

    try {
      const result = await markNotificationReadData({
        notificationId: id
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '标为已查看失败')
      }

      touchNotificationSync('notification_mark_read')
      await this.fetchNotifications()
    } catch (error) {
      wx.showToast({
        title: error && error.message ? error.message : '标为已查看失败',
        icon: 'none'
      })
    }
  },

  async handleResolve(event) {
    const { id } = event.currentTarget.dataset
    if (!id) {
      return
    }

    try {
      const result = await resolveNotificationData({
        notificationId: id
      })

      if (!result || !result.ok) {
        throw new Error(result && result.message ? result.message : '标为已收口失败')
      }

      wx.showToast({
        title: '已标为已收口',
        icon: 'success'
      })

      touchNotificationSync('notification_resolved')
      await this.fetchNotifications()
    } catch (error) {
      wx.showToast({
        title: error && error.message ? error.message : '标为已收口失败',
        icon: 'none'
      })
    }
  },

  handleNotificationAction(event) {
    const { mode, id, url, autoResolve, type } = event.currentTarget.dataset
    if (mode === 'mark_read') {
      this.handleMarkRead({
        currentTarget: {
          dataset: {
            id
          }
        }
      })
      return
    }

    if (mode === 'resolve') {
      this.handleResolve({
        currentTarget: {
          dataset: {
            id
          }
        }
      })
      return
    }

    this.openNotification({
      currentTarget: {
        dataset: {
          id,
          url,
          autoResolve,
          type
        }
      }
    })
  },

  async openNotification(event) {
    const { id, url, autoResolve, type } = event.currentTarget.dataset
    const targetUrl = decorateNotificationUrl(url, type)
    if (!targetUrl) {
      return
    }

    if (id) {
      try {
        await markNotificationReadData({
          notificationId: id
        })
        touchNotificationSync('notification_opened')
      } catch (error) {
        // Keep navigation available even if marking read fails.
      }
    }

    if (id && !!autoResolve) {
      try {
        await resolveNotificationData({
          notificationId: id
        })
        touchNotificationSync('notification_auto_resolved')
      } catch (error) {
        // Keep navigation available even if resolving fails.
      }
    }

    wx.navigateTo({
      url: targetUrl
    })
  }
})
