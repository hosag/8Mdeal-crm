function getTaskCompletionToastTitle(shouldCreateNextTask) {
  return shouldCreateNextTask ? '已完成，并续接下一步' : '已完成，已写入时间线'
}

function buildTaskCompletionFeedback(options = {}) {
  const shouldCreateNextTask = !!options.shouldCreateNextTask
  const nextTaskTitle = String(options.nextTaskTitle || '').trim()

  return {
    title: getTaskCompletionToastTitle(shouldCreateNextTask),
    detail: shouldCreateNextTask
      ? `本次结果已写入时间线，下一步任务：${nextTaskTitle || '已补下一步动作'}`
      : '本次结果已写入时间线，可稍后继续补下一步任务。'
  }
}

function getTaskStatusToastTitle(status) {
  if (status === 'done') {
    return '已完成'
  }

  if (status === 'canceled') {
    return '已取消'
  }

  if (status === 'in_progress') {
    return '已开始推进'
  }

  return '状态已更新'
}

function buildTaskStatusFeedback(status) {
  if (status === 'canceled') {
    return {
      title: getTaskStatusToastTitle(status),
      detail: '这条任务已移出当前推进节奏，如有需要可再补新的下一步任务。'
    }
  }

  if (status === 'in_progress') {
    return {
      title: getTaskStatusToastTitle(status),
      detail: '你可以继续推进，完成后再补结果，系统会自动写入时间线。'
    }
  }

  return {
    title: getTaskStatusToastTitle(status),
    detail: '任务状态已更新。'
  }
}

module.exports = {
  buildTaskCompletionFeedback,
  buildTaskStatusFeedback,
  getTaskCompletionToastTitle,
  getTaskStatusToastTitle
}
