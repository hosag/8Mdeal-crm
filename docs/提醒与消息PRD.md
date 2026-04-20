# 提醒与消息 PRD

本文档用于定义成交 CRM 小程序的“提醒与消息”能力，目标不是做一个泛消息中心，而是做一个真正服务销售推进的动作提醒系统。

本文档包含：

- 功能目标与边界
- 用户场景与消息类型
- 页面与交互方案
- 数据模型与状态流转
- 云函数改造清单
- 验收标准与分期计划

适用前提：

- 云环境已接通
- `projects`、`followUps`、`shareRecords` 已进入真实数据流
- `notifications` 集合已创建
- [createNotifyTask](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/createNotifyTask/index.js) 与 [sendNotify](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/sendNotify/index.js) 已存在基础骨架，可继续升级

---

## 一、目标与原则

### 1.1 目标

提醒与消息在本项目中不是做“通知流”，而是做“销售动作推进系统”。第一阶段目标是：

1. 让用户一眼知道今天必须推进哪些项目
2. 让项目外发后的原拥有者第一时间知道管理权是否已转移、对方是否继续推进
3. 让接手方明确哪些外发项目已经进入自己负责推进的项目池
4. 让失败状态被清楚暴露，避免用户误以为系统已成功处理

### 1.2 核心原则

- 提醒必须服务动作，不做纯展示型通知
- 首页负责“当前最重要”，消息中心负责“全部消息”
- 同一项目同类提醒必须去重，不能刷屏
- 用户点击消息后必须能直达处理页面
- 用户完成动作后，系统应自动关闭对应提醒
- 第一阶段优先做站内消息，不强依赖订阅消息模板

### 1.3 第一阶段范围

第一阶段只做 5 类提醒：

1. `todo_due`
   今日待跟进提醒

2. `todo_overdue`
   已逾期提醒

3. `project_taken_over`
   接手项目提醒

4. `shared_opened / shared_imported / shared_followed`
   对外分享动态提醒

5. `ai_failed / save_failed`
   AI 整理失败或保存失败提示

### 1.4 明确不做

第一阶段不做：

- 复杂审批消息流
- 营销型批量推送
- 独立“消息详情页”
- 每次字段变更都生成通知
- 强依赖微信订阅消息模板才能工作

---

## 二、问题定义

当前项目已具备首页待办、我的项目、项目详情、外发项目等核心页面，但仍存在以下业务缺口：

1. 首页能看到待办，但没有“统一沉淀”的提醒中心
2. 对外分享的关键状态变化只能在页面里被动查看，不能主动提醒
3. 跟进逾期和接手项目缺少稳定的消息留痕
4. AI 失败、保存失败缺少统一的系统反馈入口
5. 用户完成动作后，系统无法自动把对应提醒置为已处理

提醒与消息能力要补上的，不是“再做一个页面”，而是建立一条完整链路：

事件发生 -> 写入消息 -> 首页或消息中心提醒 -> 用户点击处理 -> 系统自动闭环

---

## 三、用户角色与场景

## 3.1 用户角色

第一阶段涉及 3 类业务身份：

1. 当前项目拥有者
   当前有项目操作权并负责推进项目的人

2. 项目外发接手方
   在“项目外发”模式下接手项目并继续推进的人

3. 信息分享接收方
   只能查看项目卡片和授权详情，但不能操作项目的人

## 3.2 核心场景

### 场景 A：今天该跟进哪些项目

用户打开首页或消息中心，应该立刻知道：

- 哪些项目今天必须跟
- 哪些项目已经逾期
- 哪些项目需要优先补动作

### 场景 B：项目外发后是否真的被接手并继续推进

用户把项目外发后，不需要每天手动翻“外发项目”列表去看，而是应在状态变化时收到提醒：

- 对方已打开
- 对方已接手
- 对方已继续跟进

### 场景 C：我接手的外发项目已经进入我的责任范围

接收方完成接手后，系统应明确提示：

- 该项目已进入“我的项目”
- 后续由自己负责推进

### 场景 D：信息分享是否已被对方查看

“信息分享”模式下，对方没有操作权，也不会接手项目，但分享者仍然需要知道：

- 对方是否已经打开卡片
- 对方是否已经查看授权详情

### 场景 E：系统处理失败

AI 整理失败、保存失败、云函数超时等异常，必须明确告诉用户这次没有成功，不能让用户以为结果已写入。

---

## 四、功能范围与 PRD

## 4.1 今日待跟进提醒

### 功能名称

今日待跟进提醒

### 触发条件

- 项目未成交、未流失
- 存在 `nextFollowUpDate`
- `nextFollowUpDate` 所在日期等于当天
- 当天尚未生成过该项目的同类提醒

### 用户价值

- 把当天必须推进的项目拉到用户面前
- 让首页待办与消息中心形成一致的动作入口

### 展示文案

- 标题：`今天需要跟进`
- 摘要：`{项目名} 已到跟进时间。`

### 动作

- 按钮文案：`去跟进`
- 跳转页面：
  [follow-up](/Users/shaominhe/成交CRM-CodeX版/pages/follow-up/follow-up.js)

### 完成闭环

用户成功保存一条新的跟进记录后，对应 `todo_due` 提醒自动标记为 `resolved`。

---

## 4.2 已逾期提醒

### 功能名称

已逾期提醒

### 触发条件

- 项目未成交、未流失
- 存在 `nextFollowUpDate`
- 当前时间已晚于 `nextFollowUpDate`
- 尚未生成同日逾期提醒

### 用户价值

- 优先暴露真正有流失风险的项目
- 帮用户先补最重要的动作

### 展示文案

- 标题：`跟进已逾期`
- 摘要：`{项目名} 已超过计划时间。`

### 动作

- 按钮文案：`立即跟进`
- 跳转页面：
  [follow-up](/Users/shaominhe/成交CRM-CodeX版/pages/follow-up/follow-up.js)

### 完成闭环

保存新跟进成功后，对应 `todo_overdue` 提醒自动标记为 `resolved`。

---

## 4.3 接手项目提醒

### 功能名称

接手项目提醒

### 触发条件

- 接收方在“项目外发”模式下打开卡片并完成项目导入
- 项目正式进入接收方“我的项目”
- 该项目尚未生成过接手提醒

### 用户价值

- 明确责任切换已经发生
- 避免接收方误把项目当成普通浏览卡片

### 展示文案

- 标题：`你已接手项目`
- 摘要：`{项目名} 已进入“我的项目”，后续由你继续推进。`

### 动作

- 按钮文案：`查看项目`
- 跳转页面：
  [project-detail](/Users/shaominhe/成交CRM-CodeX版/pages/project-detail/project-detail.js)

### 完成闭环

用户点击消息或进入项目详情后，提醒标记为 `read`；接手方完成首条跟进后可自动标记为 `resolved`。

---

## 4.4 外发动态提醒

### 功能名称

外发动态提醒

### 触发事件

不同分享模式下，状态变化提醒规则不同。

### 项目外发

在“项目外发”模式下，向原拥有者写入提醒：

1. `shared_opened`
   接收方首次打开卡片

2. `shared_imported`
   接收方完成接手，项目进入其“我的项目”

3. `shared_followed`
   接手方新增推进记录

### 信息分享

在“信息分享”模式下，只写入：

1. `shared_opened`
   接收方首次打开卡片或授权详情

### 用户价值

- 原拥有者不必反复手动打开“外发项目”检查状态
- 能及时判断管理权是否完成转移、项目是否已继续推进

### 展示文案建议

`shared_opened`

- 标题：`对方已查看分享卡片`
- 摘要：`{项目名} 的接收方已打开卡片，可继续观察后续状态。`

`shared_imported`

- 标题：`对方已接手项目`
- 摘要：`{项目名} 已进入对方“我的项目”，后续可在外发项目中继续追踪。`

`shared_followed`

- 标题：`对方已新增推进记录`
- 摘要：`{项目名} 有新的推进记录，建议查看最新进展。`

### 动作

- 按钮文案：`查看外发详情`
- 跳转页面：
  [shared-out](/Users/shaominhe/成交CRM-CodeX版/pages/shared-out/shared-out.js)
  或
  [project-detail](/Users/shaominhe/成交CRM-CodeX版/pages/project-detail/project-detail.js)

### 完成闭环

用户进入对应详情页后标记 `read`；若其明确进入外发详情页，可进一步标记为 `resolved`。

---

## 4.5 失败提醒

### 功能名称

失败提醒

### 第一阶段拆分

1. `ai_failed`
   AI 整理失败

2. `save_failed`
   跟进保存失败

### 触发条件

- 前端调用 AI 云函数失败
- 跟进保存云函数失败
- 云函数超时或返回异常

### 用户价值

- 让用户明确知道“本次没有成功”
- 避免误判数据已入库

### 第一阶段实现建议

- 失败时前端 `toast` 必做
- 是否写入 `notifications` 集合，第一阶段可选
- 若写入集合，建议仅保留最近一次失败提醒，避免过度堆积

---

## 五、信息架构与页面方案

## 5.1 总体架构

第一阶段采用“双入口”方案：

1. 首页入口
   首页只展示当前最重要的提醒与待办

2. 消息中心
   新增统一沉淀页，承接所有消息记录

### 设计原则

- 首页负责“今天最该做什么”
- 消息中心负责“所有提醒和历史处理记录”
- 消息点击后直接跳业务页面，不增加中间层

## 5.2 首页改造

### 建议改造点

- 在 [首页](/Users/shaominhe/成交CRM-CodeX版/pages/index/index.wxml) 顶部增加消息入口
- 支持未读数角标
- 点击后进入消息中心

### 首页与消息中心的关系

- 今日待跟进、已逾期仍保留在首页
- 这些项目同时会在消息中心留痕
- 首页优先做快速处理，不替代消息中心

## 5.3 消息中心页面

### 建议新增页面

- [pages/notifications/notifications](/Users/shaominhe/成交CRM-CodeX版/pages)

### 页面结构

顶部统计区：

- 未读数
- 待处理数
- 今日新增数

筛选区：

- 全部
- 待处理
- 跟进提醒
- 外发动态

消息列表区：

- 标题
- 一行摘要
- 项目名
- 时间
- 状态标签
- 动作按钮

### 明确不做

- 独立消息详情页
- 复杂多 tab 消息中心
- 冗长二级筛选

---

## 六、消息类型与优先级

## 6.1 类型定义

建议统一使用以下 `type`：

- `todo_due`
- `todo_overdue`
- `project_taken_over`
- `shared_opened`
- `shared_imported`
- `shared_followed`
- `ai_failed`
- `save_failed`

## 6.2 优先级定义

建议统一使用以下 `level`：

1. `high`
   用于已逾期、保存失败、AI 失败

2. `normal`
   用于今日待跟进、接手项目、对方已接手

3. `info`
   用于对方已打开、对方已新增推进记录

## 6.3 状态定义

建议统一使用以下 `status`：

1. `unread`
   用户尚未查看

2. `read`
   用户已查看，但尚未完成动作

3. `resolved`
   用户已处理完成

---

## 七、数据模型设计

## 7.1 `notifications` 集合建议结构

```js
{
  _id: '',
  recipientOpenid: '',
  type: 'todo_due | todo_overdue | shared_opened | shared_imported | shared_followed | project_taken_over | ai_failed | save_failed',
  level: 'high | normal | info',
  status: 'unread | read | resolved',
  title: '',
  summary: '',
  projectId: '',
  shareRecordId: '',
  sourceOpenid: '',
  sourceName: '',
  actionUrl: '',
  actionLabel: '',
  bizDate: '2026-04-18',
  dedupeKey: '',
  extra: {},
  createdAt: new Date(),
  readAt: null,
  resolvedAt: null
}
```

## 7.2 与现有骨架的关系

当前 [createNotifyTask](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/createNotifyTask/index.js) 和 [sendNotify](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/sendNotify/index.js) 只支持最基础的提醒任务字段：

- `projectId`
- `notifyTime`
- `isSent`

建议不要继续沿用极简结构硬扩展，而是升级为消息模型。原骨架可保留，但需要补上：

- `type`
- `level`
- `status`
- `title`
- `summary`
- `recipientOpenid`
- `actionUrl`
- `dedupeKey`
- `bizDate`

## 7.3 去重规则

### 必须去重

同一项目、同一消息类型、同一天，只保留一条提醒。

### 推荐 `dedupeKey`

- `todo_due_{projectId}_{bizDate}`
- `todo_overdue_{projectId}_{bizDate}`
- `project_taken_over_{projectId}`
- `shared_opened_{shareRecordId}`
- `shared_imported_{shareRecordId}`
- `shared_followed_{shareRecordId}_{bizDate}`

### 去重原则

- 同类型状态型消息，不重复写入
- 新状态产生时，可以新增消息
- 同一状态当日重复触发时，只刷新时间或忽略

---

## 八、事件与触发规则

## 8.1 每日待办提醒生成

### 触发方式

建议双保险：

1. 定时任务生成
2. 首页加载时兜底扫描生成

### 规则

`todo_due`

- 项目状态不是成交或流失
- 存在 `nextFollowUpDate`
- 日期等于当天
- 不存在当日同类提醒

`todo_overdue`

- 项目状态不是成交或流失
- 存在 `nextFollowUpDate`
- 当前时间晚于 `nextFollowUpDate`
- 不存在当日同类提醒

## 8.2 接手项目提醒生成

### 触发点

- 在 [openSharedProject](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/openSharedProject/index.js) 成功接手后写入

### 接收人

- 接手方

### 生成规则

- 只在首次导入成功时生成一次

## 8.3 外发动态提醒生成

### 触发点

与 `shareRecords` 状态流转绑定：

- 项目外发：未打开 -> 已打开 -> 已导入 -> 已跟进
- 信息分享：未打开 -> 已打开

### 接收人

- 原拥有者或分享发起人

### 推荐写入位置

- [openSharedProject](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/openSharedProject/index.js)
- [saveFollowUp](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/saveFollowUp/index.js)
- 涉及 `shareRecords` 状态更新的相关函数

## 8.4 自动关闭规则

### 跟进提醒关闭

当用户保存新的跟进记录成功后：

- 自动查找该项目对应未关闭的 `todo_due`
- 自动查找该项目对应未关闭的 `todo_overdue`
- 统一标记为 `resolved`

### 接手提醒关闭

接手方完成第一条跟进后，可自动标记 `project_taken_over` 为 `resolved`。

### 外发动态提醒关闭

原拥有者进入详情或外发追踪页后，可标记为 `read`；若已看到最新推进内容，可进一步标记为 `resolved`。

---

## 九、页面交互规则

## 9.1 消息列表卡片字段

每条消息卡片至少显示：

- 优先级标识
- 标题
- 摘要
- 项目名
- 时间
- 状态标签
- 处理按钮

## 9.2 状态交互

### 进入列表

- 不自动全部标记已读

### 点击单条消息

- 当前消息标记为 `read`
- 跳转到业务页面

### 处理成功

- 由业务页面回写 `resolved`

### 支持的快捷动作

- `全部标记已读`
- 单条 `标记已处理`

第一阶段不建议做批量复杂操作。

---

## 十、云函数与接口改造清单

## 10.1 新增云函数

建议新增以下云函数：

1. `listNotifications`
   获取当前用户消息列表与统计

2. `markNotificationRead`
   标记单条消息为已读

3. `resolveNotification`
   标记单条消息为已处理

4. `generateTodoNotifications`
   生成今日待跟进与逾期提醒

## 10.2 升级现有云函数

### [createNotifyTask](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/createNotifyTask/index.js)

升级方向：

- 从“定时提醒写入器”升级为“统一消息写入器”
- 支持写入完整消息结构
- 支持 `dedupeKey`

### [sendNotify](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/sendNotify/index.js)

第一阶段建议继续保留，但职责调整为：

- 扫描待发送的站内消息或订阅消息任务
- 处理是否需要对接真实订阅消息模板

说明：

- 第一阶段就算不接微信订阅消息模板，站内消息中心也必须可用

### [saveFollowUp](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/saveFollowUp/index.js)

需要补的逻辑：

- 新跟进保存成功后，关闭本项目的待跟进提醒
- 若为“项目外发”后接手方新增跟进，向原拥有者写入 `shared_followed`

### [openSharedProject](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/openSharedProject/index.js)

需要补的逻辑：

- 对接收方写入 `project_taken_over`
- 对原拥有者写入 `shared_imported`

### 其他分享状态更新点

涉及首次打开分享卡片的逻辑处，需要补写：

- `shared_opened`

---

## 十一、前端改造清单

## 11.1 首页

涉及页面：

- [index.wxml](/Users/shaominhe/成交CRM-CodeX版/pages/index/index.wxml)
- [index.js](/Users/shaominhe/成交CRM-CodeX版/pages/index/index.js)

改造项：

- 新增消息入口
- 显示未读数角标
- 点击进入消息中心

## 11.2 消息中心

建议新增：

- [pages/notifications](/Users/shaominhe/成交CRM-CodeX版/pages)

改造项：

- 新建列表页
- 支持筛选、已读、已处理
- 支持空状态与错误状态

## 11.3 跟进页

涉及页面：

- [follow-up](/Users/shaominhe/成交CRM-CodeX版/pages/follow-up/follow-up.js)

改造项：

- 跟进保存成功后，自动回写关闭对应提醒
- AI 失败时支持标准失败提示

## 11.4 详情页与外发页

涉及页面：

- [project-detail](/Users/shaominhe/成交CRM-CodeX版/pages/project-detail/project-detail.js)
- [shared-out](/Users/shaominhe/成交CRM-CodeX版/pages/shared-out/shared-out.js)

改造项：

- 支持从消息中心直达打开
- 进入后标记对应消息为已读

---

## 十二、验收标准

第一阶段完成后，至少满足以下 10 条：

1. 今日到期项目会自动生成提醒
2. 已逾期项目会自动生成提醒
3. 接收方接手项目后，会收到接手提醒
4. 原拥有者能收到“已打开 / 已接手 / 已跟进”提醒
5. 点击消息能直达对应业务页面
6. 消息点击后会变为 `read`
7. 完成业务动作后会变为 `resolved`
8. 同一项目同类提醒不会重复刷屏
9. 首页和消息中心对待办状态的口径一致
10. 断网或云函数异常时，失败提示清晰，不出现“假成功”

---

## 十三、分期计划

## 13.1 P0 必做

1. `notifications` 数据模型升级
2. `listNotifications`
3. `markNotificationRead`
4. `resolveNotification`
5. `todo_due`
6. `todo_overdue`
7. 首页消息入口
8. 消息中心页

## 13.2 P1 应做

1. `project_taken_over`
2. `shared_opened`
3. `shared_imported`
4. `shared_followed`
5. 保存跟进后的自动关闭闭环

## 13.3 P2 后做

1. 微信订阅消息模板接入
2. 更细的消息筛选
3. 批量处理能力
4. 更复杂的失败回放与系统诊断

---

## 十四、开发建议顺序

建议按下面顺序落地，风险最低：

1. 升级 `notifications` 集合字段与写入逻辑
2. 新建消息中心页面
3. 跑通 `todo_due` / `todo_overdue`
4. 跑通 `read` / `resolved` 状态闭环
5. 接入接手项目提醒
6. 接入外发动态提醒
7. 最后再考虑是否接微信订阅消息

---

## 十五、与现有能力的关系说明

当前项目里已有：

- 首页待办
- 外发项目追踪
- `notifications` 集合
- [createNotifyTask](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/createNotifyTask/index.js)
- [sendNotify](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/sendNotify/index.js)

因此，这份 PRD 不是从零设计，而是在现有能力基础上做“统一化、结构化、闭环化”升级。

第一阶段重点不是消息渠道，而是把站内提醒链路先做扎实。
