# AI 功能 PRD 与数据流设计

本文档用于定义成交 CRM 小程序的 AI 能力边界、数据流和分阶段落地顺序。

适用前提：

- 云环境已接通
- `projects`、`followUps`、`shareRecords` 已接入真实数据
- 当前产品边界已固定为私人 CRM
- 对外只有两种模式：`分享信息`、`项目外发`

---

## 一、目标与原则

### 1.1 产品目标

AI 在本项目中不是自由聊天助手，而是销售过程中的结构化增强能力。核心目标有三件事：

1. 降低跟进记录整理成本
2. 把下一步动作收敛成可执行建议
3. 让分享卡片更清晰、更适合真实外发场景

### 1.2 设计原则

- AI 只给建议，不直接改数据库关键字段
- AI 输出优先结构化，避免散文式长回复
- AI 只接收最小必要数据，不把敏感字段无差别送入模型
- AI 必须嵌入现有页面，不额外制造独立 AI 页面
- AI 失败不能阻塞主流程，用户必须始终可以手工完成操作

### 1.3 第一阶段能力范围

第一阶段定义 3 个能力：

1. `summarizeFollowUp`
   跟进内容智能整理

2. `suggestNextFollowUp`
   下一步动作与任务草稿建议

3. `generateShareBrief`
   分享卡片摘要生成

### 1.4 明确不做

第一阶段不做：

- 自由聊天式 AI 助手
- AI 自动修改项目阶段
- AI 自动发送消息、自动分享、自动外发
- AI 自动补全联系人电话、微信、邮箱
- AI 自动代替用户落库关键决策字段

### 1.5 当前落地状态

截至 2026-04-19，当前状态如下：

1. 已落地 `summarizeFollowUp`
   - 云函数已存在：[index.js](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/summarizeFollowUp/index.js)
   - 服务层已接入：[data.js](/Users/shaominhe/成交CRM-CodeX版/services/data.js)
   - 录入页已接入：[follow-up.js](/Users/shaominhe/成交CRM-CodeX版/pages/follow-up/follow-up.js)

2. 已补齐 `suggestNextFollowUp`
   - 云函数已存在：[index.js](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/suggestNextFollowUp/index.js)
   - 服务层已接入：[data.js](/Users/shaominhe/成交CRM-CodeX版/services/data.js)
   - 录入页已接入：[follow-up.js](/Users/shaominhe/成交CRM-CodeX版/pages/follow-up/follow-up.js)

3. 已补齐 `generateShareBrief`
   - 云函数已存在：[index.js](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/generateShareBrief/index.js)
   - 服务层已接入：[data.js](/Users/shaominhe/成交CRM-CodeX版/services/data.js)
   - 分享卡页已接入：[share-card.js](/Users/shaominhe/成交CRM-CodeX版/pages/share-card/share-card.js)

4. 本轮已同步收紧的共性基础项
   - 三类 AI 云函数均增加 JSON 字段校验
   - AI 错误提示已统一为可读中文错误
   - 下一步建议已与“推进任务草稿”结构联动
   - 分享摘要已按“分享信息”/“项目外发”区分 prompt 分支

5. 仍需在云端部署时手动确认
   - 云函数上传后将 AI 函数执行超时调到 20-30 秒
   - 如需后续统计 AI 采纳率，再补埋点与日志落库

---

## 二、用户场景与 PRD

## 2.1 AI 跟进整理

### 功能名称

AI 跟进整理

### 页面位置

- [录入跟进页](/Users/shaominhe/成交CRM-CodeX版/pages/follow-up/follow-up.wxml)

### 触发方式

- 用户输入原始跟进内容后，点击“AI整理”

### 用户价值

- 把口语化、碎片化记录整理成结构化 CRM 内容
- 自动提炼关键信息，方便后续回看
- 降低手工补写摘要的时间

### 输入

- 项目基础信息
- 当前项目阶段
- 跟进方式
- 原始跟进内容
- 用户手动选择的阶段变更

### 输出

- 跟进摘要
- 关键进展
- 风险提示
- 建议阶段
- 阶段建议理由
- 缺失信息

### 成功标准

- 用户能一键把长文本整理为结构化内容
- 输出能直接用于保存跟进记录
- AI 失败时用户仍可手工保存

---

## 2.2 AI 下一步建议

### 功能名称

AI 下一步建议

### 页面位置

- [录入跟进页](/Users/shaominhe/成交CRM-CodeX版/pages/follow-up/follow-up.wxml)
- 后续可扩展到 [项目详情页](/Users/shaominhe/成交CRM-CodeX版/pages/project-detail/project-detail.wxml)

### 触发方式

- 用户完成本次跟进整理后，点击“AI建议下一步”

### 用户价值

- 给出明确可执行的下一步动作，而不是泛泛而谈
- 帮助用户明确“下一次该联系谁、用什么方式、在什么时间推进”
- 直接生成推进任务草稿，让 CRM 从“记录工具”变成“推进工具”

### 输入

- 项目基础信息
- 当前项目阶段
- 最近 1 到 3 条跟进记录
- 本次跟进摘要

### 输出

- 最优先动作
- 建议跟进对象
- 建议跟进方式
- 建议时间窗口
- 建议话术
- 任务草稿数组

### 成功标准

- 建议必须具体到可以执行
- 不输出“持续跟进”“保持沟通”这类空话
- 用户可以一键写入“下次跟进”或“推进任务”

---

## 2.3 AI 分享摘要生成

### 功能名称

AI 分享摘要生成

### 页面位置

- [分享卡页](/Users/shaominhe/成交CRM-CodeX版/pages/share-card/share-card.wxml)

### 触发方式

- 用户选定分享模式与标签后，点击“AI生成摘要”

### 用户价值

- 自动生成更适合当前分享模式的摘要文案
- “分享信息”模式聚焦项目背景、当前进展和允许查看范围
- “项目外发”模式聚焦接手重点、风险提示和下一步动作

### 输入

- 项目基础信息
- 当前阶段
- 预计金额
- 联系人角色信息
- 分享模式
- 标签可见字段

### 输出

- 标题建议
- 2 到 4 句摘要
- 分享目的或接手目标
- CTA 文案

### 成功标准

- 同一项目在“分享信息”和“项目外发”两种模式下生成结果明显不同
- 文案不泄露标签规则之外的敏感信息
- “分享信息”模式不出现接手类表述

---

## 三、数据流设计

## 3.1 总体原则

AI 不直接从前端访问模型。统一采用：

小程序页面 -> AI 云函数 -> 数据清洗 / 脱敏 / Prompt 组装 -> 大模型 -> JSON 校验 -> 返回前端

这样做的原因：

- 前端不暴露模型密钥和复杂逻辑
- 便于做脱敏、限流、日志和错误处理
- 后续迁移到云托管或云原生架构时，前端调用层几乎不变

## 3.2 云函数边界

目标 AI 云函数共 3 个：

1. `summarizeFollowUp`
   已实现

2. `suggestNextFollowUp`
   已实现

3. `generateShareBrief`
   已实现

建议抽一层公共模块，后续复用：

- `buildAiContext`
- `sanitizeAiInput`
- `callAiModel`
- `validateAiJson`

## 3.3 跟进整理数据流

1. 用户在录入跟进页输入原始内容
2. 前端点击“AI整理”
3. 前端调用 `summarizeFollowUp`
4. 云函数读取必要项目数据：
   - `projects.projectName`
   - `projects.clientName`
   - `projects.stage`
   - 联系人姓名与角色
5. 云函数接收用户当前输入：
   - `method`
   - `content`
   - `stageChange`
6. 云函数做脱敏和裁剪
7. 云函数构造 prompt 并调用模型
8. 模型返回结构化 JSON
9. 云函数校验字段完整性与类型
10. 前端展示结果，由用户确认是否采用

### 不进入模型的字段

- 联系人电话
- 联系人微信
- 联系人邮箱
- 付款信息和细颗粒度财务信息

## 3.4 下一步建议数据流

1. 用户在录入跟进页点击“AI建议下一步”
2. 前端调用 `suggestNextFollowUp`
3. 云函数读取：
   - 当前项目基础信息
   - 最近 1 到 3 条 `followUps`
   - 当前项目已有开放任务
4. 云函数拼接本次跟进摘要
5. 云函数调用模型
6. 返回结构化结果：
   - `nextAction`
   - `recommendedTarget`
   - `recommendedMethod`
   - `recommendedTimeWindow`
   - `talkTrack`
   - `reason`
   - `missingInfo`
   - `taskDrafts`
7. 前端展示并允许用户一键填入“下次跟进时间”和“推进任务草稿”

## 3.5 分享摘要生成数据流

1. 用户在分享配置页选中模式和标签
2. 前端调用 `generateShareBrief`
3. 云函数读取：
   - 项目基础信息
   - 当前阶段
   - 标签可见字段
4. 云函数先按标签过滤字段，再构造 prompt
5. 根据分享模式选择不同 prompt 分支
6. 返回：
   - `title`
   - `briefLines`
   - `shareGoal`
   - `cta`
   - `tone`
7. 前端写入分享卡片预览区

关键要求：

- 必须先过滤，再生成
- 绝不能把未授权字段先送给模型再要求模型“不说出来”
- `分享信息` 和 `项目外发` 不是同一文案模板换词，而是两条独立语气分支

---

## 四、请求与响应结构

## 4.1 前端请求结构

### `summarizeFollowUp`

```json
{
  "projectId": "p_xxx",
  "method": "面谈",
  "content": "原始跟进内容",
  "stageChange": "商务"
}
```

### `suggestNextFollowUp`

```json
{
  "projectId": "p_xxx",
  "currentSummary": "本次跟进摘要"
}
```

### `generateShareBrief`

```json
{
  "projectId": "p_xxx",
  "shareMode": "info",
  "shareTagId": "t1"
}
```

## 4.2 AI 响应原则

- 统一返回 JSON
- 不返回 Markdown
- 不返回解释型前缀
- 不返回带代码块的文本

---

## 五、Prompt 设计

## 5.1 通用 Prompt 规则

所有 AI 函数都共享以下系统约束：

- 你是面向 IT / SaaS / 咨询销售场景的 CRM 助手
- 输出必须简洁、具体、可执行
- 不杜撰不存在的客户信息
- 不补全未提供的联系方式
- 不越权输出未授权字段
- 结果必须是 JSON
- 如果信息不足，应在 `missingInfo` 中明确指出

## 5.2 `summarizeFollowUp` Prompt

### System Prompt

```text
你是一个销售 CRM 跟进整理助手。
你的任务是把销售人员输入的原始跟进内容，整理为结构化结果。
不要虚构事实，不要补全未提供的信息，不要输出 markdown。
必须返回合法 JSON。
```

### User Prompt 模板

```text
请根据以下项目上下文和本次跟进内容，生成结构化整理结果。

项目名称：{{projectName}}
客户名称：{{clientName}}
当前阶段：{{stage}}
项目摘要：{{projectDescription}}
相关联系人：{{contacts}}
跟进方式：{{method}}
本次原始记录：{{content}}
用户手动选择的阶段变更：{{stageChange}}

输出要求：
1. 用简洁中文总结本次跟进
2. 提取 2-4 条关键进展
3. 识别最多 3 条风险或阻塞
4. 判断是否建议阶段变更
5. 若建议阶段变更，说明理由
6. 如果信息不足，在 missingInfo 中明确指出
7. 只返回合法 JSON，不要输出 markdown 代码块

返回 JSON，字段必须包含：
summary
highlights
risks
recommendedStage
stageChangeReason
missingInfo
```

### 期望输出结构

```json
{
  "summary": "客户已接受阶段拆分报价，希望本周五确认商务条款。",
  "highlights": [
    "客户认可当前方案方向",
    "预算人意见需要补充确认",
    "商务条款将在本周五讨论"
  ],
  "risks": [
    "关键预算拍板人尚未完全锁定"
  ],
  "recommendedStage": "商务",
  "stageChangeReason": "客户讨论重心已从方案评估转向商务条款确认。",
  "missingInfo": [
    "尚未确认最终预算审批人"
  ]
}
```

## 5.3 `suggestNextFollowUp` Prompt

### System Prompt

```text
你是一个销售推进建议助手。
请基于当前项目阶段和最近跟进记录，输出明确、可执行的下一步建议。
不要给空泛建议，例如“持续跟进”“继续保持沟通”。
必须返回合法 JSON。
```

### User Prompt 模板

```text
请为以下项目给出下一步跟进建议。

项目名称：{{projectName}}
客户名称：{{clientName}}
当前阶段：{{stage}}
项目摘要：{{projectDescription}}
最近跟进记录：{{recentFollowUps}}
本次摘要：{{currentSummary}}
当前未完成任务：{{openTasks}}

输出要求：
1. 给出 1 条最优先动作
2. 指出建议跟进对象
3. 给出建议跟进方式
4. 给出建议时间窗口
5. 提供一段 60-120 字的话术建议
6. 如果适合，生成 1-3 条推进任务草稿

返回 JSON，字段必须包含：
nextAction
recommendedTarget
recommendedMethod
recommendedTimeWindow
talkTrack
reason
missingInfo
taskDrafts
```

### 期望输出结构

```json
{
  "nextAction": "在本周五商务条款沟通前，先确认预算拍板人与法务参与节点。",
  "recommendedTarget": "客户决策人或商务负责人",
  "recommendedMethod": "电话或面谈",
  "recommendedTimeWindow": "24-48小时内",
  "talkTrack": "这次想先和您对齐两个关键点：一是预算审批的最终口径，二是商务条款确认后是否需要同步法务，以便我们提前准备版本。",
  "reason": "当前项目已进入商务推进阶段，继续停留在方案讨论会降低推进效率。",
  "missingInfo": [
    "预算审批链路仍不完整"
  ],
  "taskDrafts": [
    {
      "title": "确认预算拍板人与法务参与节点",
      "type": "待回访",
      "dueAt": "24-48小时内",
      "description": "围绕预算审批和法务参与节点做一次关键人确认。"
    }
  ]
}
```

## 5.4 `generateShareBrief` Prompt

### System Prompt

```text
你是一个销售分享文案助手。
你的任务是根据分享模式和可见字段，生成适合转发的小程序分享摘要。
你只能使用提供给你的字段，不允许补充未给出的信息。
必须返回合法 JSON。
```

### User Prompt 模板

```text
请根据以下信息生成分享摘要。

分享模式：{{shareMode}}
标签名称：{{shareTagName}}
允许展示字段：{{visibleFields}}
项目信息：{{sanitizedProjectPayload}}

输出要求：
1. 生成一个适合卡片展示的标题
2. 生成 2-4 句摘要
3. 明确分享目的或接手目标
4. 生成 CTA 文案
5. 文风要求：简洁、轻商务、明确，不夸张

返回 JSON，字段必须包含：
title
briefLines
shareGoal
cta
tone
```

### 期望输出结构

```json
{
  "title": "华东制造集团数字工厂项目外发摘要",
  "briefLines": [
    "项目当前已进入商务推进阶段。",
    "客户重点关注预算确认与商务条款节奏。",
    "希望本周内完成关键角色对齐。"
  ],
  "shareGoal": "请优先判断是否接手，并继续推进预算与商务条款确认。",
  "cta": "如确认接手，请打开卡片进入你的项目继续推进。",
  "tone": "outbound_handover"
}
```

---

## 六、输出校验与前端展示策略

## 6.1 云函数侧校验

AI 返回后必须做 3 类校验：

1. JSON 是否可解析
2. 必填字段是否存在
3. 字段类型是否匹配

若校验失败：

- 不把原始模型结果直接返回前端
- 返回统一错误码，例如 `AI_INVALID_RESPONSE`

## 6.2 前端展示原则

- AI 结果默认是建议草稿，不是最终落库内容
- 用户必须确认后才能写入输入框或保存记录
- AI 失败时要允许用户继续手工完成
- AI 结果卡片要支持“采用结果”和“继续手填”

---

## 七、安全与合规

## 7.1 绝不直接送入模型的字段

- 联系人电话
- 联系人微信
- 联系人邮箱
- 未授权的分享字段
- 明确属于标签限制之外的信息

## 7.2 建议脱敏策略

- 联系人只保留姓名和角色
- 客户名称按业务需要决定是否脱敏
- 金额默认保留整数或区间，不保留细颗粒度财务信息

## 7.3 权限原则

- 分享摘要必须先按标签过滤字段，再做 Prompt
- `项目外发` 和 `分享信息` 必须使用不同 Prompt 分支
- `分享信息` 模式不能输出任何接手、转移管理权、继续维护项目的表述

---

## 八、埋点与评估指标

建议埋点：

- AI 触发次数
- AI 成功返回率
- AI 结果采纳率
- AI 建议被编辑后的保存率
- 平均响应时间

首批核心判断指标：

- 跟进整理采纳率是否超过 40%
- 下一步建议采纳率是否超过 30%
- 任务草稿写入率是否超过 20%
- 分享摘要生成后是否提升分享完成率

---

## 九、分阶段落地顺序

### Phase 1

已完成：

1. `summarizeFollowUp`

原因：

- 直接作用于高频场景
- 对用户价值最直观
- 对分享权限体系依赖较少

### Phase 2

已完成：

1. `suggestNextFollowUp`

原因：

- 已与“推进任务”能力打通
- 已支持一键回填下次跟进时间与任务草稿

### Phase 3

已完成：

1. `generateShareBrief`

后续可扩展：

1. 项目阶段风险评分
2. 月度销售复盘生成
3. AI 生成项目推进周报

---

## 十、与当前代码结构的接入建议

### 云函数

- `summarizeFollowUp`
  已存在
- `suggestNextFollowUp`
  已新增
- `generateShareBrief`
  已新增

### 服务层

- `requestFollowUpSummary`
  已存在
- `requestNextFollowUpSuggestion`
  已新增
- `requestShareBrief`
  已新增

### 页面接入

- [录入跟进页](/Users/shaominhe/成交CRM-CodeX版/pages/follow-up/follow-up.wxml)
  已接 `summarizeFollowUp` + `suggestNextFollowUp`
- [项目详情页](/Users/shaominhe/成交CRM-CodeX版/pages/project-detail/project-detail.wxml)
  预留下一步建议入口
- [分享卡页](/Users/shaominhe/成交CRM-CodeX版/pages/share-card/share-card.wxml)
  已接 `generateShareBrief`

### 前端交互模式

- 按钮触发
- 加载中状态
- AI 结果卡片
- 用户确认写入
- 失败后可继续手工处理

---

## 十一、下一步实施建议

当前这一轮代码实现已完成：

1. `suggestNextFollowUp`
2. `generateShareBrief`
3. AI 基础设施第一轮收口

基础设施收口项：

- 输入裁剪
- Prompt 稳定性
- JSON 输出校验
- 错误回退
- 云函数超时配置
- AI 日志与错误码统一

下一轮建议优先项：

1. 项目详情页补一个“AI 下一步建议”快捷入口
2. 分享摘要增加采纳率埋点
3. 补齐 AI 云函数的超时/重试部署规范
