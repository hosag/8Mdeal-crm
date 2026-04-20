const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function startOfDay(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function parseDateTime(value) {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatAmount(value) {
  const amount = Number(value || 0)
  if (!amount) {
    return '0'
  }
  if (amount >= 10000) {
    const wan = amount / 10000
    return `${Number.isInteger(wan) ? wan : wan.toFixed(1)}万`
  }
  return String(amount)
}

function formatDateTime(value) {
  if (!value) {
    return '刚刚更新'
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '刚刚更新'
  }

  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

function computeProgress(stage) {
  const progressMap = {
    线索: 18,
    洽谈: 36,
    方案: 58,
    商务: 82,
    成交: 100,
    流失: 0
  }

  return progressMap[stage] || 12
}

function computeNextStatus(stage, nextDate, now = new Date()) {
  if (stage === '成交' || stage === '流失') {
    return {
      code: 'closed',
      text: stage === '成交' ? '已成交' : '已流失'
    }
  }

  if (!nextDate) {
    return {
      code: 'unplanned',
      text: '待安排'
    }
  }

  const diff = Math.round((startOfDay(nextDate).getTime() - startOfDay(now).getTime()) / 86400000)
  if (diff < 0) {
    return {
      code: 'overdue',
      text: '已逾期'
    }
  }

  if (diff === 0) {
    return {
      code: 'today',
      text: '今天跟进'
    }
  }

  return {
    code: 'upcoming',
    text: '待跟进'
  }
}

function getStageFocus(stage, isSharedProject) {
  if (isSharedProject) {
    return '接手后先确认共享历史，再继续推进'
  }

  const focusMap = {
    线索: '先确认客户背景、真实需求和决策链路',
    洽谈: '把需求边界和关键联系人补完整',
    方案: '推动方案确认，准备商务前置条件',
    商务: '围绕报价、合同条款和预算拍板推进',
    成交: '跟进回款、交付与复盘沉淀',
    流失: '沉淀流失原因，保留后续再激活机会'
  }

  return focusMap[stage] || '围绕当前阶段继续推进关键动作'
}

function isTaskClosed(status) {
  return status === 'done' || status === 'canceled'
}

function buildTaskStats(tasks) {
  const list = Array.isArray(tasks) ? tasks : []
  const now = new Date()
  const openTasks = list.filter((task) => !isTaskClosed(task.status))
  const openTaskTypes = [...new Set(openTasks
    .map((task) => String(task.type || '').trim())
    .filter(Boolean))]
  const overdueCount = openTasks.filter((task) => {
    const dueAt = parseDateTime(task.dueAt)
    return dueAt && dueAt.getTime() < now.getTime()
  }).length
  const nextTask = openTasks
    .map((task) => ({
      id: task._id,
      title: String(task.title || '').trim(),
      dueText: String(task.dueDateText || '').trim(),
      dueAt: parseDateTime(task.dueAt)
    }))
    .filter((task) => task.title)
    .sort((left, right) => {
      const leftTime = left.dueAt ? left.dueAt.getTime() : Number.MAX_SAFE_INTEGER
      const rightTime = right.dueAt ? right.dueAt.getTime() : Number.MAX_SAFE_INTEGER
      return leftTime - rightTime
    })[0] || null

  return {
    openCount: openTasks.length,
    overdueCount,
    openTaskTypes,
    nextTaskId: nextTask ? nextTask.id : '',
    nextTaskTitle: nextTask ? nextTask.title : '',
    nextTaskDueText: nextTask ? nextTask.dueText : '',
    nextTaskDueAt: nextTask && nextTask.dueAt ? nextTask.dueAt.toISOString() : ''
  }
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const now = new Date()

  const result = await db.collection('projects')
    .where({
      _openid: wxContext.OPENID
    })
    .orderBy('updatedAt', 'desc')
    .get()

  const visibleProjects = result.data.filter((item) => !(item.handoverStatus === 'handed_over' && !item.isSharedProject))
  const projectIds = visibleProjects.map((item) => item._id)
  const latestFollowMap = {}

  if (projectIds.length) {
    const followResult = await db.collection('followUps')
      .where({
        _openid: wxContext.OPENID
      })
      .orderBy('followUpTime', 'desc')
      .get()

    ;(followResult.data || []).forEach((followUp) => {
      if (!followUp || !followUp.projectId || latestFollowMap[followUp.projectId]) {
        return
      }

      latestFollowMap[followUp.projectId] = followUp
    })
  }

  const taskStatsMap = {}
  if (projectIds.length) {
    try {
      const taskResult = await db.collection('tasks')
        .where({
          _openid: wxContext.OPENID
        })
        .get()

      ;(taskResult.data || []).forEach((task) => {
        if (!task || !task.projectId || projectIds.indexOf(task.projectId) === -1) {
          return
        }

        if (!taskStatsMap[task.projectId]) {
          taskStatsMap[task.projectId] = []
        }

        taskStatsMap[task.projectId].push(task)
      })
    } catch (error) {
      // Allow the project list to keep working before the tasks collection is created.
    }
  }

  return {
    ok: true,
    projects: visibleProjects.map((item) => {
      const updatedAt = parseDateTime(item.updatedAt || item.createdAt)
      const nextFollowUpAt = parseDateTime(item.nextFollowUpDate)
      const nextStatus = computeNextStatus(item.stage, nextFollowUpAt, now)
      const contactNames = Array.isArray(item.contacts)
        ? item.contacts
          .map((contact) => String(contact.name || '').trim())
          .filter(Boolean)
        : []
      const latestFollow = latestFollowMap[item._id] || null
      const latestSummary = String((latestFollow && (latestFollow.aiSummary || latestFollow.content)) || '').trim()
      const taskStats = buildTaskStats(taskStatsMap[item._id])

      return {
        id: item._id,
        name: item.projectName || '未命名项目',
        client: item.clientName || '未填写客户',
        stage: item.stage || '线索',
        next: item.nextFollowUpDate ? `下次跟进 ${item.nextFollowUpDate}` : '暂无下次跟进',
        nextFollowUpAt: nextFollowUpAt ? nextFollowUpAt.toISOString() : '',
        nextStatus: nextStatus.code,
        nextStatusText: nextStatus.text,
        amount: formatAmount(item.estimatedAmount),
        amountValue: Number(item.estimatedAmount || 0),
        commission: formatAmount(item.expectedCommission),
        commissionValue: Number(item.expectedCommission || 0),
        latest: formatDateTime(updatedAt || item.updatedAt || item.createdAt),
        updatedAtRaw: updatedAt ? updatedAt.toISOString() : '',
        progress: computeProgress(item.stage),
        tag: item.isSharedProject ? '外发给我' : '我创建',
        ownerType: item.isSharedProject ? 'shared_in' : 'owned',
        ownerLabel: item.isSharedProject
          ? `${item.sharedFromName || '分享方'} 外发给我`
          : '我负责推进',
        contactCount: contactNames.length,
        contactNames,
        tags: Array.isArray(item.tags) ? item.tags : [],
        sharedFromName: item.sharedFromName || '',
        description: String(item.description || '').trim(),
        focusText: getStageFocus(item.stage || '线索', !!item.isSharedProject),
        latestSummary: latestSummary || '当前还没有跟进摘要',
        openTaskCount: taskStats.openCount,
        overdueTaskCount: taskStats.overdueCount,
        openTaskTypes: taskStats.openTaskTypes,
        nextTaskId: taskStats.nextTaskId,
        nextTaskTitle: taskStats.nextTaskTitle,
        nextTaskDueText: taskStats.nextTaskDueText,
        nextTaskDueAt: taskStats.nextTaskDueAt
      }
    })
  }
}
