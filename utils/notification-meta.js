function normalizeText(value) {
  return String(value || '').trim()
}

function getNotificationCategoryMeta(type) {
  const currentType = normalizeText(type)

  if (currentType === 'task_due' || currentType === 'task_overdue' || currentType === 'task_upcoming') {
    return {
      key: 'todo',
      label: '任务提醒',
      hintText: currentType === 'task_overdue'
        ? '点击完成任务，提醒自动消除'
        : (currentType === 'task_upcoming'
          ? '明天到期，可提前准备'
          : '点击完成任务，提醒自动消除'),
      fallbackActionLabel: currentType === 'task_overdue'
        ? '立即完成'
        : (currentType === 'task_upcoming' ? '查看动作' : '完成动作'),
      autoResolveOnOpen: false
    }
  }

  if (currentType === 'todo_due' || currentType === 'todo_overdue' || currentType === 'todo_upcoming') {
    return {
      key: 'todo',
      label: '跟进提醒',
      hintText: currentType === 'todo_overdue'
        ? '点击补录跟进，提醒自动消除'
        : (currentType === 'todo_upcoming'
          ? '明天到期，可提前准备'
          : '点击补录跟进，提醒自动消除'),
      fallbackActionLabel: currentType === 'todo_overdue'
        ? '立即跟进'
        : (currentType === 'todo_upcoming' ? '查看项目' : '去跟进'),
      autoResolveOnOpen: false
    }
  }

  if (currentType === 'project_silent') {
    return {
      key: 'todo',
      label: '项目回看',
      hintText: '项目许久未更新，点击查看',
      fallbackActionLabel: '查看项目',
      autoResolveOnOpen: true
    }
  }

  if (currentType === 'shared_opened' || currentType === 'shared_imported' || currentType === 'shared_followed' || currentType === 'project_taken_over') {
    return {
      key: 'shared',
      label: currentType === 'project_taken_over' ? '接手项目' : '外发动态',
      hintText: currentType === 'project_taken_over'
        ? '已进入我的项目，可继续跟进'
        : '点击查看外发项目进展',
      fallbackActionLabel: currentType === 'project_taken_over' ? '进入我的项目' : '进入外发项目',
      autoResolveOnOpen: currentType !== 'project_taken_over'
    }
  }

  if (currentType === 'ai_failed' || currentType === 'save_failed') {
    return {
      key: 'system',
      label: '系统异常',
      hintText: '点击返回原页面继续处理',
      fallbackActionLabel: '继续处理',
      autoResolveOnOpen: false
    }
  }

  return {
    key: 'all',
    label: '业务消息',
    hintText: '点击进入对应页面继续处理',
    fallbackActionLabel: '查看',
    autoResolveOnOpen: false
  }
}

function getNotificationPrimaryActionLabel(type, actionLabel) {
  const currentActionLabel = normalizeText(actionLabel)
  if (currentActionLabel) {
    return currentActionLabel
  }

  return getNotificationCategoryMeta(type).fallbackActionLabel || '查看'
}

module.exports = {
  getNotificationCategoryMeta,
  getNotificationPrimaryActionLabel
}
