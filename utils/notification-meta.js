function normalizeText(value) {
  return String(value || '').trim()
}

function getNotificationCategoryMeta(type) {
  const currentType = normalizeText(type)

  if (currentType === 'task_due' || currentType === 'task_overdue' || currentType === 'task_upcoming') {
    return {
      key: 'todo',
      label: '动作提醒',
      hintText: currentType === 'task_overdue'
        ? '进入后直接提交完成情况；动作完成后这类提醒会自动收口。'
        : (currentType === 'task_upcoming'
          ? '这是提前一天的动作提醒，可先查看项目并准备本次推进。'
          : '进入后直接完成动作；完成后这类提醒会自动收口。'),
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
        ? '进入后直接补跟进，保存成功后这类提醒会自动收口。'
        : (currentType === 'todo_upcoming'
          ? '这是提前一天的跟进提醒，可先查看项目并准备明天的推进。'
          : '进入后直接补本次跟进，保存成功后这类提醒会自动收口。'),
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
      hintText: '项目较久没有推进痕迹，可进入详情回看后自行决定是否补跟进或建任务。',
      fallbackActionLabel: '查看项目',
      autoResolveOnOpen: true
    }
  }

  if (currentType === 'shared_opened' || currentType === 'shared_imported' || currentType === 'shared_followed' || currentType === 'project_taken_over') {
    return {
      key: 'shared',
      label: currentType === 'project_taken_over' ? '接手项目' : '外发动态',
      hintText: currentType === 'project_taken_over'
        ? '进入后直接继续推进项目，补第一条跟进后这类提醒会自动收口。'
        : '进入后直接查看外发项目与最新进展，查看后这条动态会自动收口。',
      fallbackActionLabel: currentType === 'project_taken_over' ? '进入我的项目' : '进入外发项目',
      autoResolveOnOpen: currentType !== 'project_taken_over'
    }
  }

  if (currentType === 'ai_failed' || currentType === 'save_failed') {
    return {
      key: 'system',
      label: '系统异常',
      hintText: '进入原业务页后继续处理；真正成功后，这类失败提醒会自动收口。',
      fallbackActionLabel: '继续处理',
      autoResolveOnOpen: false
    }
  }

  return {
    key: 'all',
    label: '业务消息',
    hintText: '进入对应业务页面继续处理，完成后这条消息会自动收口。',
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
