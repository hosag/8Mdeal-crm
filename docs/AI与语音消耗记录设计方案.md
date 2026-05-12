# AI 与语音消耗记录设计方案

## 1. 文档目标

本文档用于统一成交 CRM 在 AI 能力与语音识别能力上的消耗记录、权益扣减、用户可见展示与后台运营控制方案。

当前落地进度（2026-05-07）：

- 已完成语音识别、AI 项目匹配、AI 跟进摘要、AI 下一步建议的 `usageLedger` 落账闭环
- 已完成小程序前台“AI 额度”文案统一，用户侧不再直接暴露 `token` 口径
- 已完成权益页“最近消耗”展示，用户可直接看到最近语音与 AI 额度变化
- 已完成后台 usage 页面真实字段接入，能够看到账户额度汇总、最近流水、来源场景、供应商/模型分布
- 已完成后台全局流水视图按 AI / 语音拆分查看
- 已完成后台 usage / 全局流水在 Cloud 模式下按筛选条件回源查询，避免前端只拿一份全量数据后本地误筛
- 已完成后台全局流水分页、服务端聚合统计与 30 天运营报表基础视图
- 已完成后台 AI 模型配置中心中的模型倍率维护能力
- 已完成 `usageEvents` 事件日志、场景级成本分析、模型效率分析、路由效果分析与后台运营展示接入
- 已完成四个核心云函数的统一记账 helper 抽离，并通过共享模板 + 本地同步脚本维护
- 已完成后台 usage 总览页的运营驾驶舱升级，包括预警汇总、套餐健康看板与高风险账户定位
- 已完成后台 usage 总览预警的可操作化，待绑定、即将到期、高风险、只读、项目受限、双低余额可一键进入账户与流水筛选

本方案服务以下目标：

- 用户能够清楚看到自己的语音与 AI 消耗、剩余额度与最近使用记录
- 后台能够看到所有用户的汇总消耗、明细流水、额度发放与当前产品控制状态
- 支持多模型、多供应商、多路由策略并行接入，不把用户权益直接绑定到单一模型厂商口径
- 为后续订阅、流量包、试用、赠送、补偿、退款、成本核算提供统一账本基础

---

## 2. 当前结论

现有仓库已经具备正确主骨架：

- `accounts`
- `entitlements`
- `subscriptions`
- `plans`
- `usageLedger`
- `getEntitlements`
- `adminListUsage`

这意味着：

- 前后台“看额度”与“看套餐”的主数据结构已经成立
- 消耗账本、权益聚合、后台运营视图和模型倍率维护已经形成可运营主链路
- 后续不需要推翻架构，主要进入补强与第二阶段分析建设

当前状态判断：

- `P0` 已完成：真实语音与 AI 消耗已稳定落账，用户侧也已能看到最近消耗
- `P1` 已完成：后台已具备低余额预警、来源场景聚合、供应商 / 模型分布、全局流水分页、模型倍率维护
- `P2` 已完成：`usageEvents`、场景级平均 token 分析、模型成本效率分析、路由效果分析、统一记账 helper 工程化收口均已落地
- usage 总览已从基础统计页升级为运营驾驶舱，支持预警、套餐健康与高风险账户排查
- usage 总览预警已与账户与流水联动，运营人员可以从汇总指标直接下钻到账户列表，不需要手工复制账户或二次筛选

当前主要剩余缺口：

- `usageEvents` 已作为调用过程观测层接入，可与 `usageLedger` 配合做运营分析
- 后台已经进入模型成本优化与路由效果分析阶段，后续可继续演进到倍率策略与成本预测

---

## 3. 设计原则

### 3.1 单一账本真相源

`usageLedger` 作为语音与 AI 用量变化的唯一余额账本。

账本只记录：

- 发放
- 扣减
- 补偿
- 退款回滚

不在账本中承载复杂页面展示逻辑。

### 3.2 供应商原始用量与产品内计费用量分离

必须区分两套概念：

- 供应商原始用量
- 产品内计费用量

原因：

- 不同模型、不同供应商的 token 口径可能不同
- 同样文本在不同模型上的成本差异很大
- 后台未来会调整模型路由，如果用户权益直接绑定供应商原始 token，套餐口径会失稳

### 3.3 用户看到“额度”，后台保留“原始成本”

对用户：

- 看到的是可理解、可稳定运营的“语音秒数”和“AI 额度”

对后台：

- 同时保留原始 token、模型名、供应商、路由、调用场景等细节，支撑成本分析与排障

### 3.4 第一版先做稳定与可运营

第一版不追求过度复杂：

- 语音按秒扣减
- AI 按“原始 token x 模型倍率”扣减
- 模型倍率由后台管理端可配置

场景倍率、复杂分摊、成本预测等能力放到后续迭代。

---

## 4. 核心定义

### 4.1 语音额度

用户可消费的语音识别时长，单位为秒。

字段沿用：

- `voiceSecondsTotal`
- `voiceSecondsUsed`
- `voiceSecondsRemaining`

### 4.2 AI 额度

用户在产品内可消费的 AI 额度单位。

说明：

- 对用户前台文案建议逐步显示为“AI 额度”
- 数据字段暂继续沿用既有命名 `ai_tokens`
- 该值不等于任何单一供应商的原始 token

字段沿用：

- `aiTokensTotal`
- `aiTokensUsed`
- `aiTokensRemaining`

### 4.3 供应商原始 token

模型供应商接口原样返回的 token 用量，通常包括：

- `prompt_tokens`
- `completion_tokens`
- `total_tokens`

该值用于：

- 成本核算
- 模型路由分析
- 后台排障

不直接作为用户扣减标准。

### 4.4 产品内计费 token

产品内部统一的 AI 额度扣减单位。

该值用于：

- 写入 `usageLedger`
- 计算 `aiTokensUsed`
- 计算 `aiTokensRemaining`
- 套餐与流量包控制
- 用户前台展示

---

## 5. 第一版计费逻辑

## 5.1 语音识别扣减逻辑

第一版语音按成功识别的计费秒数扣减。

规则：

- 以识别成功后的实际音频时长为准
- 毫秒向上取整到秒
- 仅在识别成功且返回有效文本后写扣减账
- 失败、超时、权限错误、配置错误不扣减

计算公式：

```text
billedVoiceSeconds = ceil(audioDurationMs / 1000)
```

示例：

- 12.1 秒，扣 13 秒
- 38.0 秒，扣 38 秒
- 59.2 秒，扣 60 秒

## 5.2 AI 扣减逻辑

第一版 AI 采用“供应商原始 token x 模型倍率”的统一折算逻辑。

计算公式：

```text
billableAiTokens = ceil(rawTotalTokens * modelMultiplier)
```

其中：

- `rawTotalTokens`：优先使用供应商返回的 `usage.total_tokens`
- `modelMultiplier`：当前模型对应倍率，由后台管理端配置

### 5.2.1 为什么只按模型倍率，不先上场景倍率

第一版只使用模型倍率，原因如下：

- 简单，方便运营解释
- 可以先解决多模型成本差异
- 不会让后台配置过重
- 便于先跑通真实收费闭环

### 5.2.2 无 usage 返回时的兜底估算

当供应商未返回 `usage.total_tokens` 时，允许用字符数估算。

第一版估算公式：

```text
estimatedTokens = ceil(inputChars * 1.2 + outputChars * 1.4)
billableAiTokens = ceil(estimatedTokens * modelMultiplier)
```

说明：

- `inputChars` 为模型主输入字符数
- `outputChars` 为模型主输出字符数
- 该估算仅作为供应商未返回 usage 时的兜底

### 5.2.3 第一版暂不做的能力

以下能力暂不进入第一版正式扣减逻辑：

- 场景倍率
- 最低消费
- 峰值时段倍率
- 用户级专属倍率
- 输出超长附加费

---

## 6. 模型倍率配置方案

## 6.1 产品决策

每个模型的倍率必须可在后台管理端配置。

后台目标：

- 支持按供应商维护模型倍率
- 支持切换默认模型而不改代码
- 支持后续扩展不同模型的商用成本策略

## 6.2 推荐配置方式

模型倍率配置纳入 AI 路由配置主体系，与现有路由策略保持一致。

建议放在 `featureFlags.flagKey = ai_model_routing_v1` 的 `payload` 中。

建议结构：

```json
{
  "quotaPolicy": "local_quota",
  "providers": {
    "cloudbase_default": {
      "providerKey": "cloudbase_default",
      "providerType": "cloudbase",
      "displayName": "CloudBase 默认",
      "defaultModel": "hunyuan-turbos-latest",
      "enabled": true,
      "modelPricing": {
        "hunyuan-turbos-latest": {
          "multiplier": 1
        },
        "hunyuan-lite": {
          "multiplier": 0.8
        }
      }
    },
    "deepseek_official": {
      "providerKey": "deepseek_official",
      "providerType": "openai_compatible",
      "displayName": "DeepSeek 官方",
      "defaultModel": "deepseek-chat",
      "enabled": true,
      "modelPricing": {
        "deepseek-chat": {
          "multiplier": 1
        },
        "deepseek-reasoner": {
          "multiplier": 1.5
        }
      }
    }
  },
  "modelRouting": {
    "quick_entry_project": {
      "providerKey": "cloudbase_default",
      "model": "hunyuan-turbos-latest",
      "enabled": true
    },
    "followup_summary": {
      "providerKey": "deepseek_official",
      "model": "deepseek-chat",
      "enabled": true
    },
    "followup_next_action": {
      "providerKey": "deepseek_official",
      "model": "deepseek-chat",
      "enabled": true
    }
  }
}
```

## 6.3 倍率读取规则

AI 调用完成后，按以下顺序读取倍率：

1. 读取实际执行成功的 `providerKey`
2. 读取实际执行成功的 `model`
3. 在该供应商的 `modelPricing[model].multiplier` 中取值
4. 若缺失，则默认使用 `1`

说明：

- 若主路由失败且走 fallback，按最终实际成功模型倍率扣减
- 不按原计划模型扣减

---

## 7. 数据模型设计

## 7.1 `usageLedger` 定位

`usageLedger` 是余额变动账本，不是调用过程日志。

一条账本记录必须回答以下问题：

- 谁的额度变了
- 变了哪种额度
- 为什么变
- 变之前多少
- 变之后多少
- 这个变化是否可追踪与幂等

## 7.2 `usageLedger` 建议字段

```json
{
  "accountId": "acc_20260506_0001",
  "usageType": "ai_tokens",
  "sourceType": "followup_summary",
  "sourceId": "followup_20260506_0008",
  "delta": -1860,
  "unit": "token",
  "beforeBalance": 50000,
  "afterBalance": 48140,
  "traceId": "trace:followup_summary:acc_20260506_0001:followup_20260506_0008",
  "meta": {
    "projectId": "proj_001",
    "pageKey": "pages/follow-up-edit/follow-up-edit",
    "providerKey": "deepseek_official",
    "providerType": "openai_compatible",
    "providerLabel": "DeepSeek 官方",
    "model": "deepseek-chat",
    "multiplier": 1,
    "rawTotalTokens": 1860,
    "rawPromptTokens": 1120,
    "rawCompletionTokens": 740,
    "billingMethod": "provider_usage",
    "routeKey": "followup_summary",
    "fallbackUsed": false,
    "requestId": "req_xxx"
  },
  "occurredAt": "2026-05-06T10:30:00.000Z"
}
```

语音示例：

```json
{
  "accountId": "acc_20260506_0001",
  "usageType": "voice_seconds",
  "sourceType": "speech_to_text",
  "sourceId": "quick_entry_voice_20260506_0012",
  "delta": -38,
  "unit": "second",
  "beforeBalance": 600,
  "afterBalance": 562,
  "traceId": "trace:speech_to_text:acc_20260506_0001:quick_entry_voice_20260506_0012",
  "meta": {
    "projectId": "proj_001",
    "pageKey": "pages/index/index",
    "providerKey": "tencent_asr",
    "providerLabel": "Tencent Cloud ASR",
    "audioDurationMs": 37820,
    "billedSeconds": 38,
    "requestId": "req_xxx"
  },
  "occurredAt": "2026-05-06T10:28:00.000Z"
}
```

字段说明：

- `usageType`：`voice_seconds / ai_tokens`
- `sourceType`：消耗或发放来源
- `sourceId`：业务对象主键
- `delta`：正数为发放，负数为消耗
- `unit`：`second / token`
- `beforeBalance / afterBalance`：余额快照
- `traceId`：幂等键
- `meta`：上下文信息

## 7.3 `usageLedger` 的 `sourceType` 约定

第一版建议统一以下值：

- `speech_to_text`
- `quick_entry_project_match`
- `followup_summary`
- `followup_next_action`
- `billing_subscription`
- `billing_voice_pack`
- `billing_ai_pack`
- `admin_console`
- `compensate`
- `refund_revert`

## 7.4 `usageLedger` 索引建议

- `accountId + occurredAt`
- `traceId`
- `usageType + occurredAt`
- `sourceType + occurredAt`

---

## 8. 可选扩展表：`usageEvents`

## 8.1 定位

`usageEvents` 不是第一版必须集合，但建议作为第二阶段扩展。

它的定位是“调用事件日志”，而不是余额账本。

适合记录：

- 调用开始
- 调用成功
- 调用失败
- 模型 fallback
- 原始错误原因
- 原始请求时长
- 输入输出大小

## 8.2 为什么要和 `usageLedger` 分开

因为两者职责不同：

- `usageLedger` 只关心余额变动
- `usageEvents` 关心过程观测

如果强行把失败调用、调试信息、错误堆栈都写进账本，会导致账本语义混乱。

---

## 9. 权益计算规则

## 9.1 语音额度

```text
voiceSecondsRemaining = totalGrantedVoiceSeconds - totalConsumedVoiceSeconds
```

## 9.2 AI 额度

```text
aiTokensRemaining = totalGrantedAiTokens - totalConsumedAiTokens
```

## 9.3 数据来源

继续沿用现有 `getEntitlements` 聚合方式：

- 正向 `delta` 计入 granted
- 负向 `delta` 计入 consumed
- `remaining = granted - consumed`

## 9.4 两种配额策略

### `local_quota`

含义：

- 本地额度是正式拦截依据
- 余额为 0 时禁止继续调用 AI 或语音

适用：

- 正式收费阶段
- 套餐、流量包、试用期控制

### `provider_plan`

含义：

- 云厂商套餐承担主成本控制
- 本地仍记录消耗，但默认不以前置本地余额为唯一拦截

适用：

- 供应商套餐灰度阶段
- 真云商用联调阶段
- 从云厂商计费过渡到产品自计费阶段

要求：

- 即使是 `provider_plan`，也必须本地落账
- 否则用户无法看到消耗，后台也无法做统一运营分析

---

## 10. 写账时机设计

## 10.1 语音识别

写账时机：

- 云函数识别成功
- 返回有效文本
- 拿到音频时长后写 `usageLedger`

不写账场景：

- 权限校验失败
- 上传文件无效
- 识别失败
- 配置缺失
- 无有效文本

## 10.2 AI 项目匹配

写账时机：

- 云函数成功返回 AI 判断结果或成功 fallback 结果
- 完成结果解析后写 `usageLedger`

不写账场景：

- 权限校验失败
- 路由配置错误导致未真正调用
- 请求失败且无结果
- 返回内容不可解析

## 10.3 AI 跟进摘要

写账时机：

- 成功得到可用摘要结果并通过校验

## 10.4 AI 下一步动作

写账时机：

- 成功得到可用建议结果并通过校验

## 10.5 幂等要求

所有写账必须通过 `traceId` 去重，避免以下情况重复扣减：

- 云函数超时重试
- 前端重复点击
- 供应商调用成功但前端未收到响应
- fallback 后重复执行保存

建议 `traceId` 模式：

```text
trace:{sourceType}:{accountId}:{sourceId}
```

如一次业务允许显式重试再扣减，则 `sourceId` 中必须包含新的 attemptId。

---

## 11. 用户侧展示方案

## 11.1 展示目标

用户只需要看懂三件事：

- 我现在还剩多少
- 我最近用了什么
- 我什么时候需要续费或补量

不建议把模型名、路由名、fallback 等运营细节直接暴露给普通用户。

## 11.2 推荐承载页面

第一版优先在现有权益页补齐，不单独新开重页面。

推荐页面：

- `pages/entitlements/entitlements`

## 11.3 页面内容结构

### 模块一：当前额度

- 当前套餐 / 当前权益状态
- 语音总量、已用、剩余
- AI 总量、已用、剩余
- 生效截止时间

### 模块二：最近消耗

展示最近 10 至 20 条即可。

单条显示建议：

- 时间
- 能力名称
- 关联项目名
- 扣减值

示例：

- `05-06 10:28 闪录语音识别 -38 秒`
- `05-06 10:30 AI 生成摘要 -1860 额度`

### 模块三：低余额提示

当余额低于阈值时轻提示：

- 语音额度不足
- AI 额度不足
- 当前账号仅可查看，需续费或补量

## 11.4 用户文案建议

前台建议逐步统一为：

- `语音额度`
- `AI 额度`
- `最近消耗`
- `剩余额度`

避免直接向普通用户展示“供应商 token”。

---

## 12. 后台展示方案

## 12.1 后台目标

后台需要同时满足：

- 账户运营查看
- 用量排查
- 套餐与额度控制
- 模型与成本控制

## 12.2 汇总视图

每个用户展示：

- 手机号
- 账户内码
- 昵称 / 微信昵称
- 当前状态
- 当前套餐
- 项目数
- 语音总量 / 已用 / 剩余
- AI 总量 / 已用 / 剩余
- 最近一次使用时间

现有 `adminListUsage` 可继续作为主接口扩展。

## 12.3 流水视图

建议支持筛选：

- 账户
- 手机号
- `usageType`
- `sourceType`
- 日期范围
- 项目 ID
- 供应商
- 模型

单条流水建议展示：

- 时间
- 用户
- 消耗类型
- 来源场景
- 扣减值
- 扣减前后余额
- 模型 / 供应商
- 原始 token 或音频秒数

## 12.4 产品控制视图

后台应可看到以下控制状态：

- `quotaPolicy`
- 各 AI 场景的路由供应商与模型
- 当前默认模型
- 各模型倍率
- 语音最大时长
- AI 低余额阈值
- 语音低余额阈值

## 12.5 模型倍率维护要求

后台需支持：

- 新增模型倍率
- 修改模型倍率
- 删除已停用模型倍率
- 查看当前实际生效倍率

若后台暂不具备完整表单能力，也至少要确保可通过现有 AI 配置中心维护配置。

---

## 13. 云函数改造要求

第一版至少覆盖以下云函数：

- `speechToText`
- `resolveQuickEntryProject`
- `summarizeFollowUp`
- `suggestNextFollowUp`

当前状态：

- 以上四个云函数均已接入真实写账、`traceId` 幂等、倍率读取与 usage 兜底估算
- AI / 语音记账 helper 已收敛为共享模板，并通过本地 `usageHelper.js` 同步到各云函数目录

当前实现要求：

- 使用统一记账 helper
- 统一幂等规则
- 统一 `meta` 字段格式
- 统一 usage 兜底估算

当前 helper 负责：

- 校验 `traceId` 幂等
- 写入 `usageLedger`
- 写入 `usageEvents`
- 计算 `beforeBalance / afterBalance`
- 封装 token 估算逻辑

维护约定：

- 共享模板位于 `cloudfunctions/_shared_templates/`
- 同步脚本位于 `cloudfunctions/scripts/sync-usage-helpers.js`
- 修改 helper 时，先改模板，再运行同步脚本，把最新 `usageHelper.js` 分发到目标云函数目录后再部署

---

## 14. 后台配置要求
 
## 14.1 第一版必须可配置项

- `quotaPolicy`
- 每个供应商的 `defaultModel`
- 每个模型的 `multiplier`
- 各业务场景路由到哪个供应商 / 模型

## 14.2 第一版可延后项

- 场景倍率
- 用户专属折扣倍率
- 调用级最大 token 限额
- 分时段价格策略

---

## 15. 分阶段实施计划

## P0：真实消耗闭环

当前状态：已完成

目标：

- 让每次成功的语音与 AI 调用都真实写账
- 用户能看到已用与最近消耗
- 后台能看到真实消耗明细

内容：

- `speechToText` 成功后扣减 `voice_seconds`
- 三个 AI 云函数成功后扣减 `ai_tokens`
- 补统一记账 helper
- 前台权益页增加最近消耗模块
- 后台 usage 页面接入真实字段

完成说明：

- 以上内容已全部完成
- 统一记账 helper 已落为共享模板 + 同步脚本机制，部署时仍以各云函数目录内的本地 `usageHelper.js` 为准

## P1：后台运营控制增强

当前状态：基本完成

目标：

- 让后台能清楚看懂产品控制情况与消耗分布

内容：

- usage 流水筛选增强
- 供应商 / 模型维度展示
- 模型倍率可视维护
- 低余额预警
- 异常高消耗排查

完成说明：

- usage 页面、全局流水页、供应商 / 模型维度、低余额预警、倍率维护已落地
- 当前仍可继续优化展示细节，但主能力已经达到后台运营可用状态

## P2：成本与模型优化

当前状态：已完成

目标：

- 让后台基于数据优化成本与体验

内容：

- `usageEvents` 事件日志
- 场景级平均 token 分析
- 不同模型成本效率分析
- 路由效果分析
- 是否引入场景倍率评估

后续重点：

- 持续基于 `usageLedger + usageEvents` 做场景、模型、路由的成本与效果分析
- 视运营数据决定是否需要引入场景倍率、调用级限额等第二阶段策略

---

## 16. 明确不做与风险提示

## 16.1 第一版不做

- 用户侧模型选择
- 用户侧自定义倍率
- 用户侧展示供应商原始 token
- 复杂场景倍率
- 失败调用收费

## 16.2 风险提示

### 风险一：供应商 usage 口径不一致

解决：

- 原始用量只做成本参考
- 用户扣减统一按产品内计费 token

### 风险二：无 usage 返回导致无法扣减

解决：

- 使用字符估算兜底

### 风险三：重试导致重复扣减

解决：

- 所有扣减必须基于 `traceId` 幂等

### 风险四：fallback 模型成本与主模型不一致

解决：

- 按最终成功模型倍率扣减

---

## 17. 最终决策摘要

本方案第一版正式采用以下规则：

- 语音按识别成功后的实际秒数扣减，向上取整到秒
- AI 按 `rawTotalTokens x modelMultiplier` 折算为产品内 AI 额度扣减
- 当供应商无 usage 返回时，用字符估算兜底
- 模型倍率必须可在后台管理端配置
- 用户前台展示“语音额度”和“AI 额度”
- 后台同时保留供应商原始用量与产品内计费用量
- 即使采用 `provider_plan`，本地仍必须写消耗账本

本方案的核心收益是：

- 用户权益口径稳定
- 后台模型路由可持续演进
- 成本与运营分析有据可依
- 订阅、流量包、赠送、补偿、退款能全部落到统一账本体系
