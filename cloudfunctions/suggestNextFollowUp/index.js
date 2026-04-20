const cloud = require('wx-server-sdk')
const tcb = require('@cloudbase/node-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const app = tcb.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  timeout: 60000
})
const ai = app.ai()

const MODEL_PROVIDER = 'hunyuan-exp'
const MODEL_NAME = 'hunyuan-turbos-latest'

function buildModelSourceMeta() {
  return {
    sourceType: 'model',
    sourceLabel: '大模型建议',
    providerLabel: 'CloudBase AI',
    modelName: `${MODEL_PROVIDER} / ${MODEL_NAME}`,
    canRegenerate: true
  }
}

function safeText(value, fallback = '') {
  const text = String(value || '').trim()
  return text || fallback
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => safeText(item)).filter(Boolean)
}

function extractJson(text) {
  if (!text) {
    throw new Error('AI_EMPTY_RESPONSE')
  }

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('AI_INVALID_RESPONSE')
  }

  return JSON.parse(text.slice(start, end + 1))
}

function formatDateOnly(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatTimeOnly(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${hour}:${minute}`
}

function buildFallbackDueDate(offsetDays = 1) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  date.setHours(10, 0, 0, 0)
  return {
    dueDate: formatDateOnly(date),
    dueTime: formatTimeOnly(date)
  }
}

function normalizeTaskType(value) {
  const current = safeText(value)
  const allowed = ['send_solution', 'send_quote', 'callback', 'meeting', 'contract', 'collect_info', 'other']
  return allowed.includes(current) ? current : 'other'
}

function normalizeTaskDrafts(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.slice(0, 3).map((item, index) => {
    const fallbackDue = buildFallbackDueDate(index + 1)
    return {
      title: safeText(item && item.title, `推进动作 ${index + 1}`),
      type: normalizeTaskType(item && item.type),
      dueDate: safeText(item && item.dueDate, fallbackDue.dueDate),
      dueTime: safeText(item && item.dueTime, fallbackDue.dueTime),
      description: safeText(item && item.description)
    }
  })
}

function validateSuggestionPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI_INVALID_RESPONSE')
  }

  const requiredFields = [
    'nextAction',
    'recommendedTarget',
    'recommendedMethod',
    'recommendedTimeWindow',
    'recommendedDate',
    'recommendedTime',
    'talkTrack',
    'reason',
    'missingInfo',
    'taskDrafts'
  ]

  const hasAllFields = requiredFields.every((field) => Object.prototype.hasOwnProperty.call(value, field))
  if (!hasAllFields) {
    throw new Error('AI_INVALID_RESPONSE')
  }

  const normalizedTasks = normalizeTaskDrafts(value.taskDrafts)
  const fallbackDue = normalizedTasks[0] || buildFallbackDueDate(1)

  return {
    nextAction: safeText(value.nextAction),
    recommendedTarget: safeText(value.recommendedTarget),
    recommendedMethod: safeText(value.recommendedMethod),
    recommendedTimeWindow: safeText(value.recommendedTimeWindow),
    recommendedDate: safeText(value.recommendedDate, fallbackDue.dueDate),
    recommendedTime: safeText(value.recommendedTime, fallbackDue.dueTime),
    talkTrack: safeText(value.talkTrack),
    reason: safeText(value.reason),
    missingInfo: normalizeStringArray(value.missingInfo),
    taskDrafts: normalizedTasks
  }
}

async function getProjectContext(projectId, openid) {
  const projectResult = await db.collection('projects').where({
    _id: projectId,
    _openid: openid
  }).limit(1).get()

  if (!projectResult.data.length) {
    return null
  }

  const project = projectResult.data[0]
  const contacts = Array.isArray(project.contacts)
    ? project.contacts.map((contact) => ({
        name: safeText(contact.name),
        role: safeText(contact.role),
        company: safeText(contact.company)
      })).filter((contact) => contact.name)
    : []

  const followUpResult = await db.collection('followUps').where({
    _openid: openid,
    projectId
  }).orderBy('followUpTime', 'desc').limit(3).get()

  const taskResult = await db.collection('tasks').where({
    _openid: openid,
    projectId,
    status: _.in(['pending', 'in_progress'])
  }).orderBy('dueAt', 'asc').limit(5).get()

  return {
    projectName: safeText(project.projectName, '未命名项目'),
    clientName: safeText(project.clientName, '未填写客户'),
    stage: safeText(project.stage, '线索'),
    description: safeText(project.description, '暂无项目摘要'),
    contacts,
    recentFollowUps: (followUpResult.data || []).map((item) => ({
      time: formatDateOnly(item.followUpTime),
      method: safeText(item.method, '其他'),
      summary: safeText(item.aiSummary || item.content),
      stageChange: safeText(item.stageChange),
      nextFollowUpTime: safeText(item.nextFollowUpTime)
    })),
    openTasks: (taskResult.data || []).map((item) => ({
      title: safeText(item.title),
      type: safeText(item.type),
      dueDateText: safeText(item.dueDateText),
      status: safeText(item.status)
    }))
  }
}

function buildPrompt(context) {
  const contacts = context.contacts.length
    ? context.contacts.map((item) => `${item.name}${item.role ? `（${item.role}）` : ''}`).join('、')
    : '未提供'
  const recentFollowUps = context.recentFollowUps.length
    ? context.recentFollowUps.map((item, index) => {
        return `${index + 1}. ${item.time}｜${item.method}｜${item.summary}${item.stageChange ? `｜阶段变化：${item.stageChange}` : ''}${item.nextFollowUpTime ? `｜下次跟进：${item.nextFollowUpTime}` : ''}`
      }).join('\n')
    : '暂无最近跟进'
  const openTasks = context.openTasks.length
    ? context.openTasks.map((item, index) => `${index + 1}. ${item.title}${item.dueDateText ? `（截止 ${item.dueDateText}）` : ''}`).join('\n')
    : '当前无开放任务'
  const today = new Date()
  const fallbackDue = buildFallbackDueDate(1)

  return `
请为以下项目给出下一步跟进建议。

项目名称：${context.projectName}
客户名称：${context.clientName}
当前阶段：${context.stage}
项目摘要：${context.description}
相关联系人：${contacts}
最近跟进记录：
${recentFollowUps}
本次摘要：${context.currentSummary}
当前未完成任务：
${openTasks}
今天日期：${formatDateOnly(today)}
默认建议截止时间参考：${fallbackDue.dueDate} ${fallbackDue.dueTime}

输出要求：
1. 给出 1 条最优先动作
2. 指出建议跟进对象
3. 给出建议跟进方式
4. 给出建议时间窗口
5. 同时输出 recommendedDate 和 recommendedTime，用于前端直接回填
6. 提供一段 60-120 字的话术建议
7. 如果适合，生成 1-3 条推进任务草稿
8. taskDrafts 中每条都必须包含 title、type、dueDate、dueTime、description
9. 不要输出“持续跟进”“保持沟通”这类空话
10. 只返回合法 JSON，不要输出 markdown 代码块

返回 JSON，字段必须包含：
nextAction
recommendedTarget
recommendedMethod
recommendedTimeWindow
recommendedDate
recommendedTime
talkTrack
reason
missingInfo
taskDrafts
`.trim()
}

function normalizeAiError(error) {
  const message = safeText(error && error.message)
  if (!message) {
    return 'AI 下一步建议暂时不可用'
  }

  if (message.includes('AI_EMPTY_RESPONSE') || message.includes('AI_INVALID_RESPONSE')) {
    return 'AI 返回结果异常，请重试'
  }

  return message
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const projectId = safeText(event.projectId)
  const currentSummary = safeText(event.currentSummary)

  if (!projectId || !currentSummary) {
    return {
      ok: false,
      message: 'projectId and currentSummary are required',
      errorType: 'AI_NEXT_INPUT_INVALID'
    }
  }

  try {
    const projectContext = await getProjectContext(projectId, wxContext.OPENID)
    if (!projectContext) {
      return {
        ok: false,
        message: 'project not found',
        errorType: 'AI_NEXT_PROJECT_NOT_FOUND'
      }
    }

    const model = ai.createModel(MODEL_PROVIDER)
    const result = await model.generateText({
      model: MODEL_NAME,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: '你是一个销售推进建议助手。请基于项目阶段、最近跟进和未完成任务，输出明确、可执行、可以直接落地为推进任务的建议。不要虚构事实，不要补全未提供的联系方式，必须返回合法 JSON。'
        },
        {
          role: 'user',
          content: buildPrompt({
            ...projectContext,
            currentSummary
          })
        }
      ]
    })

    const parsed = validateSuggestionPayload(extractJson(result.text))

    return {
      ok: true,
      ...buildModelSourceMeta(),
      nextAction: parsed.nextAction,
      recommendedTarget: parsed.recommendedTarget,
      recommendedMethod: parsed.recommendedMethod,
      recommendedTimeWindow: parsed.recommendedTimeWindow,
      recommendedDate: parsed.recommendedDate,
      recommendedTime: parsed.recommendedTime,
      talkTrack: parsed.talkTrack,
      reason: parsed.reason,
      missingInfo: parsed.missingInfo,
      taskDrafts: parsed.taskDrafts,
      usage: result.usage || null
    }
  } catch (error) {
    return {
      ok: false,
      message: normalizeAiError(error),
      errorType: 'AI_NEXT_SUGGESTION_FAILED'
    }
  }
}
