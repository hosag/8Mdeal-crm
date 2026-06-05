const {
  loadNotificationsData,
  markNotificationReadData,
  resolveNotificationData
} = require('../../services/data')
const { appendQueryParams } = require('../../utils/navigation-context')
const { getNotificationCategoryMeta } = require('../../utils/notification-meta')
const { touchNotificationSync } = require('../../utils/notification-sync')
const { syncPageAppearance } = require('../../utils/appearance')
const { markHomePageCacheDirty } = require('../../utils/core-page-cache')
const { openTabPage } = require('../../utils/tab-bar-navigation')

const STATUS_FILTERS = [
  { key: 'all', label: '全部消息' },
  { key: 'unread', label: '待查看' },
  { key: 'pending', label: '待处理' },
  { key: 'resolved', label: '已处理' }
]
const TYPE_FILTERS = [
  { key: 'all', label: '全部类型' },
  { key: 'todo', label: '待办提醒' },
  { key: 'shared', label: '外发动态' },
  { key: 'system', label: '系统异常' }
]
const QUICK_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'overdue', label: '逾期' },
  { key: 'today', label: '今天' },
  { key: 'tomorrow', label: '明天' },
  { key: 'updates', label: '动态' }
]

function normalizeText(value) {
  return String(value || '').trim()
}

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

  if (type === 'shared_opened' || type === 'shared_imported' || type === 'shared_followed' || type === 'project_taken_over' || type === 'project_silent' || type === 'ai_failed' || type === 'save_failed') {
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
    return '已处理'
  }

  if (currentStatus === 'read') {
    return '已查看'
  }

  return '待查看'
}

function getNotificationStatusClassName(status) {
  const currentStatus = normalizeText(status)
  if (currentStatus === 'resolved') {
    return 'is-success'
  }
  if (currentStatus === 'read') {
    return ''
  }
  return 'is-danger'
}

function getNotificationToneMeta(type, status) {
  const currentType = String(type || '').trim()
  const currentStatus = String(status || '').trim()

  if (currentStatus === 'resolved') {
    return {
      cardClass: 'is-resolved',
      toneClass: 'is-resolved',
      toneText: '已处理'
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

  if (currentType === 'project_silent') {
    return {
      cardClass: 'is-update',
      toneClass: 'is-update',
      toneText: '回看项目'
    }
  }

  if (currentType === 'shared_opened' || currentType === 'shared_imported' || currentType === 'shared_followed' || currentType === 'project_taken_over') {
    return {
      cardClass: 'is-update',
      toneClass: 'is-update',
      toneText: currentType === 'project_taken_over' ? '接手动态' : '外发动态'
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

function isSharedNotificationType(type) {
  const currentType = String(type || '').trim()
  return currentType === 'shared_opened'
    || currentType === 'shared_imported'
    || currentType === 'shared_followed'
    || currentType === 'project_taken_over'
}

function buildSharedNotificationPresentation(item) {
  const type = String(item && item.type || '').trim()
  const projectName = String(item && item.projectName || '').trim() || '当前项目'
  const actorName = String(item && item.sourceName || '').trim()
  const titleMap = {
    shared_opened: '对方已查看资料',
    shared_imported: '对方已接手项目',
    shared_followed: '对方已继续推进',
    project_taken_over: '已接手到我的项目'
  }
  const summaryMap = {
    shared_opened: `${actorName || '对方'}已查看 ${projectName}。`,
    shared_imported: `${actorName || '对方'}已接手 ${projectName}。`,
    shared_followed: `${actorName || '对方'}已更新 ${projectName}，点击查看。`,
    project_taken_over: `${projectName} 已进入“我的项目”，现在可以继续跟进。`
  }
  const hintMap = {
    shared_opened: '点击查看当前状态。',
    shared_imported: '点击查看接手后的进展。',
    shared_followed: '点击查看最新更新。',
    project_taken_over: '已进入“我的项目”，可继续跟进。'
  }
  const actionTextMap = {
    shared_opened: '进入外发项目',
    shared_imported: '进入外发项目',
    shared_followed: '进入外发项目',
    project_taken_over: '进入我的项目'
  }
  const sourceFallbackMap = {
    shared_opened: '',
    shared_imported: '',
    shared_followed: '',
    project_taken_over: ''
  }
  const sourcePrefixMap = {
    shared_opened: '接收方',
    shared_imported: '接收方',
    shared_followed: '接收方',
    project_taken_over: actorName ? '分享方' : '来源'
  }

  const summaryText = summaryMap[type] || ''

  return {
    title: titleMap[type] || '',
    summary: summaryText,
    hintText: hintMap[type] || '',
    cardActionText: actionTextMap[type] || '',
    sourceName: actorName || sourceFallbackMap[type] || '',
    sourcePrefixText: sourcePrefixMap[type] || '来自'
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

  if (type === 'project_silent' && projectId) {
    return `/pages/project-detail/project-detail?projectId=${projectId}&view=notifications`
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
        label: '标为已处理',
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
  const sharedPresentation = isSharedNotificationType(item.type)
    ? buildSharedNotificationPresentation(item)
    : null

  return {
    id: item.id || `notification-${index}`,
    type: item.type || 'system',
    level: item.level || 'normal',
    levelText: getNotificationLevelText(item.level),
    levelClassName: item.levelClassName || '',
    status: item.status || 'unread',
    statusText: getNotificationStatusText(item.status),
    statusClassName: item.statusClassName || '',
    title: sharedPresentation && sharedPresentation.title
      ? sharedPresentation.title
      : (item.title || '系统提醒'),
    summary: sharedPresentation && sharedPresentation.summary
      ? sharedPresentation.summary
      : (item.summary || '暂无摘要'),
    projectId: item.projectId || '',
    projectName: item.projectName || '未命名项目',
    taskId: item.taskId || '',
    actionUrl,
    actionLabel: item.actionLabel || categoryMeta.fallbackActionLabel,
    canMarkRead: !!item.canMarkRead,
    canResolve: !!item.canResolve,
    createdAtText: item.createdAtText || '刚刚',
    sourceName: sharedPresentation && sharedPresentation.sourceName
      ? sharedPresentation.sourceName
      : (item.sourceName || ''),
    sourcePrefixText: sharedPresentation && sharedPresentation.sourcePrefixText
      ? sharedPresentation.sourcePrefixText
      : '来自',
    categoryKey: categoryMeta.key,
    categoryLabel: categoryMeta.label,
    cardClassName: toneMeta.cardClass,
    toneClassName: toneMeta.toneClass,
    toneText: toneMeta.toneText,
    isSharedCard: !!sharedPresentation,
    showLevelBadge: !sharedPresentation,
    quickFilterKey: getQuickFilterKey(item),
    hintText: sharedPresentation && sharedPresentation.hintText
      ? sharedPresentation.hintText
      : categoryMeta.hintText,
    autoResolveOnOpen: !!categoryMeta.autoResolveOnOpen,
    actions,
    primaryAction: actionMeta.primaryAction,
    secondaryActions: actionMeta.secondaryActions,
    cardActionText: sharedPresentation && sharedPresentation.cardActionText
      ? sharedPresentation.cardActionText
      : (actionMeta.primaryAction
        ? (actionMeta.primaryAction.label || '点击处理')
        : ''),
    hasSecondaryActions: actionMeta.secondaryActions.length > 0
  }
}

function patchNotificationStatus(item, status) {
  if (!item) {
    return item
  }

  const nextStatus = normalizeText(status) || 'read'
  const categoryMeta = getNotificationCategoryMeta(item.type)
  const actionUrl = buildNotificationOpenUrl(item)
  const actions = buildNotificationActions({
    ...item,
    status: nextStatus,
    canMarkRead: nextStatus === 'unread',
    canResolve: nextStatus !== 'resolved'
  }, categoryMeta, actionUrl)
  const actionMeta = splitNotificationActions(actions)

  return {
    ...item,
    status: nextStatus,
    statusText: getNotificationStatusText(nextStatus),
    statusClassName: getNotificationStatusClassName(nextStatus),
    canMarkRead: nextStatus === 'unread',
    canResolve: nextStatus !== 'resolved',
    actions,
    primaryAction: actionMeta.primaryAction,
    secondaryActions: actionMeta.secondaryActions,
    cardActionText: item.isSharedCard && item.cardActionText
      ? item.cardActionText
      : (actionMeta.primaryAction
        ? (actionMeta.primaryAction.label || '点击处理')
        : ''),
    hasSecondaryActions: actionMeta.secondaryActions.length > 0
  }
}

Page({
  data: {
    appearancePageClass: '',
    statusFilters: STATUS_FILTERS,
    typeFilters: TYPE_FILTERS,
    quickFilters: QUICK_FILTERS,
    statusFilter: 'all',
    typeFilter: 'all',
    quickFilter: 'all',
    allNotifications: [],
    notifications: [],
    resultSummaryText: '正在整理消息数据',
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
    syncPageAppearance(this)
    await this.fetchNotifications()
  },

  async onShow() {
    this.isPageActive = true
    syncPageAppearance(this)
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
        resultSummaryText: '当前无法同步消息数据',
        stats: {
          totalCount: 0,
          unreadCount: 0,
          pendingCount: 0,
          resolvedCount: 0
        },
        isLoading: false,
        isLoadFailed: true,
        loadError: error && error.message ? error.message : '消息加载失败，请稍后重试'
      })

      wx.showToast({
        title: '当前无法同步消息数据',
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

  updateNotificationStatusLocally(id, status) {
    const currentId = normalizeText(id)
    if (!currentId) {
      return
    }

    const nextStatus = normalizeText(status) || 'read'
    const allNotifications = (Array.isArray(this.data.allNotifications) ? this.data.allNotifications : []).map((item) => {
      return item.id === currentId ? patchNotificationStatus(item, nextStatus) : item
    })
    const stats = {
      ...this.data.stats,
      unreadCount: allNotifications.filter((item) => item.status === 'unread').length,
      resolvedCount: allNotifications.filter((item) => item.status === 'resolved').length
    }
    stats.pendingCount = Math.max(allNotifications.length - stats.resolvedCount, 0)

    this.setData({
      allNotifications,
      stats
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
      markHomePageCacheDirty()
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
      if (Number(result.updated || 0) <= 0) {
        throw new Error('当前消息未成功标为已查看，请重新进入消息中心后再试')
      }

      touchNotificationSync('notification_mark_read')
      markHomePageCacheDirty()
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
        throw new Error(result && result.message ? result.message : '标为已处理失败')
      }

      wx.showToast({
        title: '已标为已处理',
        icon: 'success'
      })

      touchNotificationSync('notification_resolved')
      markHomePageCacheDirty()
      await this.fetchNotifications()
    } catch (error) {
      wx.showToast({
        title: error && error.message ? error.message : '标为已处理失败',
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
        const result = await markNotificationReadData({
          notificationId: id
        })
        if (!result || !result.ok) {
          throw new Error(result && result.message ? result.message : '标为已查看失败')
        }
        if (Number(result.updated || 0) <= 0) {
          throw new Error('当前消息未成功标为已查看')
        }
        touchNotificationSync('notification_opened')
        markHomePageCacheDirty()
        this.updateNotificationStatusLocally(id, 'read')
      } catch (error) {
        wx.showToast({
          title: error && error.message ? error.message : '标为已查看失败',
          icon: 'none'
        })
      }
    }

    if (id && !!autoResolve) {
      try {
        await resolveNotificationData({
          notificationId: id
        })
        touchNotificationSync('notification_auto_resolved')
        markHomePageCacheDirty()
        this.updateNotificationStatusLocally(id, 'resolved')
      } catch (error) {
        // Keep navigation available even if resolving fails.
      }
    }

    if (openTabPage(targetUrl, {
      failTitle: '暂时无法打开提醒页面'
    })) {
      return
    }

    wx.navigateTo({
      url: targetUrl
    })
  }
})
