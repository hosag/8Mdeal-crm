const cloud = require('wx-server-sdk')
const tcb = require('@cloudbase/node-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
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

function safeText(value, fallback = '未提供') {
  const text = String(value || '').trim()
  return text || fallback
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

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

function isProjectIrrelevantItem(value) {
  const text = String(value || '').trim()
  if (!text) {
    return false
  }

  return [
    /crm跟进整理助手/i,
    /crm 助手/i,
    /ai助手/i,
    /跟进整理助手/i,
    /提示词/i,
    /prompt/i,
    /模型能力/i,
    /大模型/i,
    /系统功能/i,
    /工具本身/i
  ].some((pattern) => pattern.test(text))
}

function sanitizeProjectScopedList(value) {
  return normalizeStringArray(value).filter((item) => !isProjectIrrelevantItem(item))
}

function validateSummaryPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI_INVALID_RESPONSE')
  }

  const requiredFields = [
    'summary',
    'highlights',
    'risks',
    'recommendedStage',
    'stageChangeReason',
    'missingInfo'
  ]

  const hasAllFields = requiredFields.every((field) => Object.prototype.hasOwnProperty.call(value, field))
  if (!hasAllFields) {
    throw new Error('AI_INVALID_RESPONSE')
  }

  return {
    summary: safeText(value.summary, ''),
    highlights: normalizeStringArray(value.highlights),
    risks: sanitizeProjectScopedList(value.risks),
    recommendedStage: safeText(value.recommendedStage, ''),
    stageChangeReason: safeText(value.stageChangeReason, ''),
    missingInfo: sanitizeProjectScopedList(value.missingInfo)
  }
}

function normalizeAiError(error) {
  const message = safeText(error && error.message, '')
  if (!message) {
    return 'AI 整理暂时不可用'
  }

  if (message.includes('AI_EMPTY_RESPONSE') || message.includes('AI_INVALID_RESPONSE')) {
    return 'AI 返回结果异常，请重试'
  }

  return message
}

async function getProjectContext(projectId, openid) {
  if (!projectId) {
    return null
  }

  const result = await db.collection('projects').where({
    _id: projectId,
    _openid: openid
  }).limit(1).get()

  if (!result.data.length) {
    return null
  }

  const project = result.data[0]
  const contacts = Array.isArray(project.contacts)
    ? project.contacts.map((contact) => ({
        name: safeText(contact.name, ''),
        role: safeText(contact.role, '')
      })).filter((contact) => contact.name)
    : []

  return {
    projectName: safeText(project.projectName),
    clientName: safeText(project.clientName),
    stage: safeText(project.stage, '线索'),
    description: safeText(project.description, '暂无项目描述'),
    contacts
  }
}

function buildPrompt(context) {
  const contacts = context.contacts.length
    ? context.contacts.map((contact) => `${contact.name}（${contact.role || '未标注角色'}）`).join('、')
    : '未提供'

  return `
请根据以下项目上下文和本次跟进内容，生成结构化整理结果。

项目名称：${context.projectName}
客户名称：${context.clientName}
当前阶段：${context.stage}
项目摘要：${context.description}
相关联系人：${contacts}
跟进方式：${context.method}
本次原始记录：${context.content}
用户手动选择的阶段变更：${context.stageChange}

输出要求：
1. 用简洁中文总结本次跟进
2. 提取 2-4 条关键进展
3. 识别最多 3 条风险或阻塞
4. 判断是否建议阶段变更
5. 若建议阶段变更，说明理由
6. 如果信息不足，在 missingInfo 中明确指出
7. 只返回合法 JSON，不要输出 markdown 代码块
8. 你分析的是“当前客户项目推进”，不是 CRM 软件、AI 助手、提示词或系统功能本身
9. risks 和 missingInfo 只能围绕客户需求、预算、决策链、联系人、商务条款、时间节点、采购流程、竞争态势等项目推进因素
10. 禁止输出与 CRM 助手、AI 模型、提示词、系统设计、本工具产品需求有关的内容

返回 JSON，字段必须包含：
summary
highlights
risks
recommendedStage
stageChangeReason
missingInfo
`.trim()
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()

  if (!event.content) {
    return {
      ok: false,
      message: 'content is required'
    }
  }

  try {
    const projectContext = await getProjectContext(event.projectId, wxContext.OPENID)
    const fallbackContext = event.projectContext || {}
    const context = {
      projectName: projectContext ? projectContext.projectName : safeText(fallbackContext.projectName),
      clientName: projectContext ? projectContext.clientName : safeText(fallbackContext.clientName),
      stage: projectContext ? projectContext.stage : safeText(fallbackContext.stage, '线索'),
      description: projectContext ? projectContext.description : safeText(fallbackContext.description, '暂无项目描述'),
      contacts: projectContext ? projectContext.contacts : [],
      method: safeText(event.method, '其他'),
      content: safeText(event.content),
      stageChange: safeText(event.stageChange, '未选择')
    }

    const model = ai.createModel(MODEL_PROVIDER)
    const result = await model.generateText({
      model: MODEL_NAME,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: '你是一个销售项目跟进整理助手。你的任务是整理当前客户项目推进信息，而不是评价 CRM 软件、AI 助手、提示词或系统功能本身。不要虚构事实，不要补全未提供的信息，不要输出 markdown。必须返回合法 JSON。'
        },
        {
          role: 'user',
          content: buildPrompt(context)
        }
      ]
    })

    const parsed = validateSummaryPayload(extractJson(result.text))

    return {
      ok: true,
      ...buildModelSourceMeta(),
      summary: parsed.summary,
      highlights: parsed.highlights,
      risks: parsed.risks,
      recommendedStage: parsed.recommendedStage,
      stageChangeReason: parsed.stageChangeReason,
      missingInfo: parsed.missingInfo,
      usage: result.usage || null
    }
  } catch (error) {
    return {
      ok: false,
      message: normalizeAiError(error),
      errorType: 'AI_SUMMARY_FAILED'
    }
  }
}
