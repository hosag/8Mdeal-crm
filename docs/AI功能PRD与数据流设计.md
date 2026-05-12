# AI 功能 PRD 与数据流设计

更新时间：2026-04-27

本文档用于定义成交 CRM 小程序后续 AI 能力的正式边界、页面入口、数据流和落地顺序。

本版为当前定稿版，目标是把 AI 做成产品核心竞争力，同时严格遵守“精简应用”原则，不让 AI 反过来制造复杂流程。

---

## 一、产品定位

本项目的 AI 不是聊天助手，也不是独立工具中心，而是嵌入私人 CRM 主流程里的“推进增强能力”。

核心定位：

- 帮用户更快整理跟进
- 帮用户更准判断项目
- 帮用户更轻生成对外摘要
- 帮用户在关键节点做项目复盘

AI 在这个产品里只解决一件事：

让用户更快、更准地推进项目，而不是花更多时间维护系统。

---

## 二、总原则

### 2.1 设计原则

- AI 不做独立入口首页，不新增 AI 中心
- AI 必须嵌入现有业务页面
- AI 输出优先服务“判断”和“推进”，不追求花哨表达
- AI 能力宁少勿杂，避免多个按钮做相似事情
- AI 失败不能阻塞主流程，用户始终可以手工继续
- AI 只拿最小必要数据，不把敏感字段无差别送入模型
- 所有 AI 输出都要标识来源与模型名称
- AI 结果必须允许用户决定是否采用，不自动替用户做关键决策

### 2.2 明确不做

当前阶段不做：

- 自由聊天式 AI 助手
- 日常 AI 复盘
- 独立 AI 页面
- 自动改项目阶段
- 自动发送消息、自动分享、自动转交
- 自动补全联系人电话、微信
- 到处都放一个 AI 按钮
- 复杂评分体系、复杂预测页、复杂分析报表

### 2.3 关键边界

AI 能力边界按项目阶段明确切开：

- 进行中的项目：用 `AI 研判`
- 已成交 / 已流失的项目：用 `AI 复盘`

结论：

- `日常复盘` 取消
- `AI 复盘` 只做成交后复盘和流失后复盘

---

## 三、正式能力范围

当前确认只做 5 个 AI 能力。

### 3.1 跟进 AI 整理

#### 页面位置

- [录入跟进页](/Users/shaominhe/成交CRM-CodeX版/pages/follow-up/follow-up.wxml)

#### 触发方式

- 用户输入原始跟进内容后，点击 `AI整理`

#### 用户价值

- 把口语化、碎片化内容整理成结构化跟进结果
- 降低手工补摘要成本
- 让时间线内容更清晰、更适合后续回看

#### 输入

- 项目基础信息
- 当前阶段
- 跟进方式
- 原始跟进内容
- 用户手动选择的阶段变更

#### 输出

- 跟进摘要
- 关键进展
- 风险
- 待补信息
- 建议阶段
- 阶段建议理由
- 下一步建议

#### 是否写回

- 不自动写回
- 用户确认后再回填到当前跟进结果区

#### 当前状态

- 已实现基础版
- 后续重点是继续提高事实识别准确度、阶段建议准确度和风险提炼质量

#### 首页闪录补充边界

- 入口位置：[首页快速录入](/Users/shaominhe/成交CRM-CodeX版/pages/index/index.wxml)
- 触发方式：优先语音录入，识别成文字后自动进入 AI 理解链路
- 当前链路：候选召回 -> `resolveQuickEntryProject` 项目复判 -> `summarizeFollowUp` 跟进整理 -> `suggestNextFollowUp` 下一步建议
- 项目归属规则：
  - 高置信度时可自动带出项目
  - 中置信度时只给候选，不替用户直接拍板
  - 低置信度时要求手动确认项目
- 保存边界：
  - 不自动保存
  - 不自动改项目阶段
  - 用户确认项目后再提交

---

### 3.2 项目 AI 研判

#### 页面位置

- [项目详情页](/Users/shaominhe/成交CRM-CodeX版/pages/project-detail/project-detail.wxml)

#### 触发方式

- 用户在进行中的项目详情页点击 `AI研判`

#### 显示条件

- 仅当项目阶段不是 `成交`、`流失` 时显示

#### 用户价值

- 帮用户快速判断项目现在推进到哪一步
- 帮用户识别当前卡点、推进信号和真实风险
- 避免“看起来很忙，实际上没推进”

#### 输入

- 项目基础信息
- 当前阶段
- 最近时间线
- 当前开放任务
- 最近一次跟进摘要

#### 输出

- 项目当前全貌
- 当前推进状态判断
- 关键卡点
- 关键推进信号
- 最值得关注的一个动作建议

#### 是否写回

- 默认不写回数据库
- 只作为项目详情页中的判断结果展示

#### 备注

- `AI 研判` 是进行中项目的判断工具
- 它不与 `AI 复盘` 重叠

---

### 3.3 成交 / 流失 AI 复盘

#### 页面位置

- [项目详情页](/Users/shaominhe/成交CRM-CodeX版/pages/project-detail/project-detail.wxml)

#### 触发方式

- 用户在已成交或已流失项目详情页点击 `AI复盘`

#### 显示条件

- 仅当项目阶段为 `成交` 或 `流失` 时显示

#### 用户价值

- 总结关键转折点
- 提炼哪些动作真正有效，哪些动作无效
- 为后续类似项目沉淀经验

#### 成交复盘输出

- 成交路径概览
- 关键转折点
- 最有效动作
- 可复制经验

#### 流失复盘输出

- 流失过程概览
- 关键失速点
- 主要流失原因
- 是否值得二次激活

#### 是否写回

- 默认不自动写回
- 可后续扩展为“保存为项目复盘备注”

#### 备注

- 不做日常复盘
- 不做独立复盘中心
- 不做长报告

---

### 3.4 分享 AI 摘要

#### 页面位置

- [分享卡页](/Users/shaominhe/成交CRM-CodeX版/pages/share-card/share-card.wxml)

#### 触发方式

- 用户在分享设置中点击 `AI整理`

#### 用户价值

- 自动生成更适合对外展示的项目摘要
- 不只是总结单条记录，而是总结整个项目与时间线
- 适配 `发送资料` 和 `转交项目` 两种不同语境

#### 输入

- 项目基础信息
- 当前阶段
- 已授权可见字段
- 项目整体摘要
- 近期时间线
- 分享模式

#### 输出

- 面向接收方的项目整体概览
- 关键推进信息
- 当前最值得关注的焦点
- 一段可直接用于卡片的摘要文案

#### 是否写回

- 用户可三选一：
  - 使用系统摘要
  - 替换为 AI 摘要
  - 追加并修改

#### 备注

- 必须先按可见范围过滤字段，再送模型
- `发送资料` 和 `转交项目` 不是同一段话换词，而是同一目标下的不同语气分支

---

### 3.5 沉默项目 AI 唤醒

#### 页面位置

- 首页轻入口
- 或项目卡轻入口

#### 触发方式

- 仅针对长时间未推进项目，用户主动点击触发

#### 用户价值

- 给出一句短而明确的唤醒建议
- 帮用户快速决定这条项目是否值得重新拉起

#### 输入

- 项目当前阶段
- 最近时间线
- 最近一次有效推进时间
- 当前是否有开放任务

#### 输出

- 一句唤醒判断
- 一个建议动作
- 一个建议联系对象或切入口

#### 是否写回

- 不写回
- 只作为轻量提示

#### 备注

- 不做长分析
- 不做独立页面

---

## 四、页面与入口规范

### 4.1 入口分布

| AI能力 | 页面 | 入口文案 | 显示条件 |
| --- | --- | --- | --- |
| 跟进 AI 整理 | 跟进录入页 | `AI整理` | 始终可用 |
| 项目 AI 研判 | 项目详情页 | `AI研判` | 进行中项目 |
| 成交 / 流失 AI 复盘 | 项目详情页 | `AI复盘` | 仅成交或流失项目 |
| 分享 AI 摘要 | 分享卡页 | `AI整理` | 分享配置流程内 |
| 沉默项目 AI 唤醒 | 首页 / 项目卡 | `AI唤醒` 或轻提示 | 沉默项目 |

### 4.2 入口规则

- 同一页面不出现两个含义接近的 AI 按钮
- 进行中项目只显示 `AI研判`
- 成交 / 流失项目只显示 `AI复盘`
- 分享相关 AI 统一保持 `AI整理` 视觉语言

### 4.3 结果展示规则

- AI 结果默认在当前页内展示
- 优先弹窗或卡片内展示，不开新页面
- AI 输出要标识：
  - 来源：系统基础建议 / 云端模型
  - 模型名称
  - 生成时间

---

## 五、数据与安全边界

### 5.1 总体数据流

统一采用：

小程序页面 -> AI 云函数 -> 数据清洗 / 脱敏 / Prompt 组装 -> 大模型 -> JSON 校验 -> 返回前端

### 5.2 原则

- 前端不直接访问模型
- 所有模型调用都走云函数
- 先做字段过滤，再做 Prompt 组装
- AI 失败不阻塞用户手工流程

### 5.3 不进入模型的字段

默认不进入模型：

- 联系人电话
- 联系人微信
- 联系人邮箱
- 付款信息
- 细颗粒度财务信息
- 未授权展示字段

### 5.4 可进入模型的字段

允许按需进入模型：

- 项目名称
- 客户名称
- 当前阶段
- 预计金额区间
- 联系人姓名与角色
- 跟进时间线文本
- 任务标题与状态
- 分享授权后可见字段

---

## 六、模型输出规范

### 6.1 统一要求

- 统一返回 JSON
- 不返回 Markdown 代码块
- 不返回解释型前缀
- 不写无意义空话
- 不虚构主语、对象、时间、结果

### 6.2 输出风格

- 用正式系统语言
- 优先真实、清晰、可执行
- 不过度 AI 腔
- 句子不宜太长

### 6.3 来源标识

所有 AI 输出都要对齐为：

- 如果调用成功：
  - `来自：云端模型 · {模型名称}`
- 如果走兜底：
  - `来自：系统基础建议`

---

## 七、当前实现状态

### 7.1 已有能力

当前代码中已落地的能力：

1. `summarizeFollowUp`
   - 云函数：[index.js](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/summarizeFollowUp/index.js)
   - 服务层：[data.js](/Users/shaominhe/成交CRM-CodeX版/services/data.js)
   - 页面接入：[follow-up.js](/Users/shaominhe/成交CRM-CodeX版/pages/follow-up/follow-up.js)

2. `suggestNextFollowUp`
   - 云函数：[index.js](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/suggestNextFollowUp/index.js)
   - 服务层：[data.js](/Users/shaominhe/成交CRM-CodeX版/services/data.js)
   - 页面接入：[follow-up.js](/Users/shaominhe/成交CRM-CodeX版/pages/follow-up/follow-up.js)
   - 首页闪录接入：[index.js](/Users/shaominhe/成交CRM-CodeX版/pages/index/index.js)

3. `resolveQuickEntryProject`
   - 云函数：[index.js](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/resolveQuickEntryProject/index.js)
   - 服务层：[data.js](/Users/shaominhe/成交CRM-CodeX版/services/data.js)
   - 页面接入：[index.js](/Users/shaominhe/成交CRM-CodeX版/pages/index/index.js)

4. `generateShareBrief`
   - 云函数：[index.js](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/generateShareBrief/index.js)
   - 服务层：[data.js](/Users/shaominhe/成交CRM-CodeX版/services/data.js)
   - 页面接入：[share-card.js](/Users/shaominhe/成交CRM-CodeX版/pages/share-card/share-card.js)

5. `judgeProject`
   - 云函数：[index.js](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/judgeProject/index.js)
   - 服务层：[data.js](/Users/shaominhe/成交CRM-CodeX版/services/data.js)
   - 页面接入：[project-detail.js](/Users/shaominhe/成交CRM-CodeX版/pages/project-detail/project-detail.js)

6. `reviewClosedProject`
   - 云函数：[index.js](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/reviewClosedProject/index.js)
   - 服务层：[data.js](/Users/shaominhe/成交CRM-CodeX版/services/data.js)
   - 页面接入：[project-detail.js](/Users/shaominhe/成交CRM-CodeX版/pages/project-detail/project-detail.js)

7. `wakeDormantProject`
   - 云函数：[index.js](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/wakeDormantProject/index.js)
   - 服务层：[data.js](/Users/shaominhe/成交CRM-CodeX版/services/data.js)
   - 页面接入：[projects.js](/Users/shaominhe/成交CRM-CodeX版/pages/projects/projects.js)

### 7.2 已完成的共性基础项

- AI 输出已统一做结构校验
- 错误提示已统一为可读中文
- 模型来源已进入统一表达主线
- 分享摘要已按 `发送资料` / `转交项目` 做语义区分

### 7.3 尚未落地的能力

- 无

---

## 八、实施顺序

按当前产品定位，后续只建议继续做 AI，不再扩更多管理型功能。

推荐顺序：

1. 跟进 AI 整理正式版
2. 项目 AI 研判
3. 成交 / 流失 AI 复盘
4. 分享 AI 摘要正式版
5. 沉默项目 AI 唤醒

原因：

- 第 1 项最高频，直接影响日常使用效率
- 第 2 项最能体现“私人 CRM 的判断价值”
- 第 3 项帮助沉淀成交经验和流失经验
- 第 4 项增强对外表达质量
- 第 5 项最后做，且必须保持轻量

---

## 九、最终结论

当前阶段，AI 是本项目唯一值得继续重点投入的能力方向。

但投入方式不是“做很多 AI 功能”，而是只做这 5 个足够清晰、边界明确、不会增加认知负担的能力：

1. 跟进 AI 整理
2. 项目 AI 研判
3. 成交 / 流失 AI 复盘
4. 分享 AI 摘要
5. 沉默项目 AI 唤醒

其中：

- `日常复盘` 已取消
- `AI 复盘` 只做成交后复盘和流失后复盘
- `AI 研判` 与 `AI 复盘` 的使用时机严格分开

这就是当前 AI 路线的正式定稿边界。
