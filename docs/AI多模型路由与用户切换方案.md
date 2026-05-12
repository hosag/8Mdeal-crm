# AI 多模型路由与用户切换方案

这份文档用于定义成交 CRM 的多模型长期架构。

目标不是“再接一个模型”，而是把当前已经跑通的 AI 能力，演进成可运营、可切换、可扩展、可收费的模型平台层。

## 一、方案目标

围绕当前产品阶段，这份方案解决 5 个问题：

1. 平台默认走哪条模型通道最稳
2. 运营后台如何按任务实时切换模型
3. 是否允许用户自己切模型，何时开放
4. 套餐和模型档位如何挂钩
5. 当某个供应商故障、涨价或效果下降时，如何平滑迁移

## 二、总体判断

建议采用三层模型池架构：

1. 腾讯云 / CloudBase 默认兜底层
2. 国产主流模型扩展层
3. OpenAI 兼容国际模型扩展层

当前官方能力已经支持这个方向：

- CloudBase AI 已预集成 Hunyuan、DeepSeek
- 自定义模型支持兼容 OpenAI 协议的接口
- CloudBase AI 也提供统一调用能力，适合做默认保底层

对本项目来说，这意味着：

- `cloudbase_default` 适合作为默认商用保底通道
- `deepseek_primary` 适合作为高性价比扩展通道
- `openai_primary` 适合作为国际模型或兼容网关接入通道

## 三、推荐的模型层级

### 1. 平台保底层

定义：

- 平台必须始终有一条默认可用通道
- 当其他供应商异常时，可快速回切
- 优先保证主流程不中断

当前建议：

- `cloudbase_default`

适用场景：

- 首页闪录主链路兜底
- 跟进摘要兜底
- 下一步建议兜底
- 新环境初始化后的默认模型

保底层原则：

- 不追求单次最优效果
- 优先追求稳定、接入简单、恢复快
- 保证运营后台可一键切回

### 2. 扩展供应商层

定义：

- 用于引入国产主流模型、兼容网关、国际模型
- 让运营后台可以比较不同模型的质量、速度和成本

当前建议保留：

- `deepseek_primary`
- `openai_primary`

后续可新增：

- `hunyuan_premium`
- `deepseek_reasoning`
- `glm_primary`
- `qwen_primary`
- `international_premium`

设计原则：

- 供应商配置要与任务路由解耦
- 供应商只是“模型资源池”
- 最终是任务路由决定具体调用哪条通道

### 3. 用户可见层

第一版不向用户开放任何模型切换能力，也不开放“模式切换”。

也就是说，第一版策略是：

- 用户看不见具体模型名
- 用户也看不见 `极速 / 均衡 / 深度` 这类模式入口
- 所有模型选择、路由切换、故障回退全部由后台控制

这样做的好处：

- 前台体验最稳定
- 用户完全不需要理解模型差异
- 售后排障最简单
- 运营后台可以随时调整而不影响用户操作心智

## 四、为什么不建议第一版直接开放“用户选具体模型”

虽然从产品想象上很强，但第一版直接开放“模型名选择器”会有 4 个问题：

1. 用户不知道怎么选  
   普通用户不会理解 `hunyuan-turbos-latest`、`deepseek-v4-flash`、`gpt-5.4-mini` 的差异。

2. 结果风格不一致  
   不同模型在摘要、建议、项目匹配上的风格差异会很明显，用户会误以为系统不稳定。

3. 成本不可控  
   一旦开放高价模型，用户会直接把调用成本拉高。

4. 售后排障复杂  
   同一个功能在不同模型下表现不同，问题定位会更慢。

因此建议：

- 第一版：后台全控，用户不可切具体模型，也不可切模式
- 第二版：如有必要，再开放用户可切“模式”
- 第三版：高级版用户可选具体模型

## 五、后台应该如何扩展

当前 AI 模型配置中心已经有：

- `providerKey`
- `providerType`
- `baseURL`
- `apiKey`
- `defaultModel`
- `enabled`

建议继续扩展以下字段：

### 1. 供应商级字段

- `protocolMode`
  - `auto`
  - `chat_completions`
  - `responses`

- `providerClass`
  - `fallback`
  - `domestic`
  - `international`
  - `internal_test`

- `commercialTier`
  - `default`
  - `premium`
  - `economy`
  - `experimental`

- `latencyTier`
  - `fast`
  - `balanced`
  - `deep`

- `costTier`
  - `low`
  - `medium`
  - `high`

- `qualityTier`
  - `standard`
  - `advanced`
  - `premium`

- `allowUserSelection`
  - `true / false`

- `visibleLabel`
  - 给用户看的名字，不一定等于模型名

### 2. 路由级字段

当前系统已经按任务做路由，这个方向必须保留。

建议每条任务路由继续扩展：

- `providerKey`
- `model`
- `enabled`
- `fallbackProviderKey`
- `fallbackModel`
- `modeBindings`

其中 `modeBindings` 示例：

```json
{
  "speed": {
    "providerKey": "cloudbase_default",
    "model": "hunyuan-turbos-latest"
  },
  "balanced": {
    "providerKey": "deepseek_primary",
    "model": "deepseek-v4-flash"
  },
  "deep": {
    "providerKey": "openai_primary",
    "model": "gpt-4.1"
  }
}
```

这意味着：

- 后台既能维护默认路由
- 也能维护用户模式映射
- 同一个任务下，不同用户模式可走不同模型

## 六、推荐的任务路由粒度

不建议整个系统只保留一个全局默认模型。

建议至少按以下任务拆路由：

1. `quick_entry_project`
   闪录项目匹配

2. `followup_summary`
   跟进摘要生成

3. `followup_next_action`
   下一步建议

4. `project_judgement`
   项目 AI 研判

5. `project_review`
   项目 AI 复盘

6. `project_wake`
   AI 唤醒

7. `share_brief`
   分享摘要

原因：

- 项目匹配更偏速度和容错
- 摘要更偏压缩与语言稳定性
- 下一步建议更偏业务表达质量
- 复盘和研判更偏深度分析

这些任务天然不适合强制使用同一个模型。

## 七、推荐的默认路由策略

基于当前阶段，建议这样定义：

### 阶段 A：当前联调与内测

- 默认保底：`cloudbase_default`
- 对比验证：`deepseek_primary`
- 国际兼容预留：`openai_primary`

推荐初始路由：

- `quick_entry_project` -> `cloudbase_default`
- `followup_summary` -> `deepseek_primary`
- `followup_next_action` -> `deepseek_primary`

原因：

- 项目匹配更敏感，优先稳
- 摘要和建议对性价比要求更高

### 阶段 B：收费前准备

开始在后台数据结构中预留“模式映射”能力，但前台仍然不开放显式切换入口。

后台可先维护：

- `speed`
- `balanced`
- `deep`

这一阶段的作用不是让用户立刻可切，而是：

- 为后续套餐分层预留结构
- 为不同任务挂不同档位模型做准备
- 为将来灰度开放用户切换留出数据基础

### 阶段 C：正式收费

默认策略：

- 免费/基础版用户：只开放 `speed` 或 `balanced`
- 高级版用户：开放 `deep`
- 指定行业或内测白名单用户：可开放具体模型实验能力

## 八、套餐与模型档位如何挂钩

这部分建议产品化，而不是技术上临时判断。

### 1. 第一版收费方式

套餐仍以：

- 项目位
- 语音额度
- AI 额度

作为主权益。

不要第一版就做“模型逐个计费”。

### 2. 第一版模型权益

建议把模型能力映射成“模式权限”：

- 免费或试用：`speed`
- 基础付费：`balanced`
- 高阶付费：`deep`

这样前台能表达为：

- 极速模式
- 标准模式
- 深度模式

而后台仍可灵活改成：

- Hunyuan
- DeepSeek
- OpenAI 兼容模型

### 3. 第二版收费方式

后续再考虑把高级模型单独做成增值项：

- 高级推理包
- 深度分析包
- 国际模型扩展包

这样可以做到：

- 主套餐卖通用能力
- 增值包卖高质量模型能力

## 九、推荐的用户开放节奏

### 第一阶段：后台切换

只有运营后台可以切换模型与任务路由。

适用现在，也适合作为第一版正式收费策略。

### 第二阶段：用户可切模式

前台如需开放，建议先只开放：

- `默认`
- `极速`
- `深度`

后台决定具体模型。

这一阶段不是当前版本目标，只作为后续扩展预留。

### 第三阶段：高级用户可选具体模型

只对少量高阶用户开放，例如：

- 国际版模型
- 高级推理模型
- 实验模型

这一步一定放在系统稳定后做。

## 十、故障切换建议

正式商用必须考虑模型故障切换。

建议每条任务路由都预留：

- 主通道
- 备用通道

例如：

- 主通道：`deepseek_primary`
- 备用通道：`cloudbase_default`

切换原则：

1. 主通道失败率超阈值
2. 主通道时延连续升高
3. 模型输出质量明显下降
4. 成本策略临时调整

后台要支持人工快速切换，后续再考虑自动切换。

## 十一、数据结构建议

建议后续把 `featureFlags.ai_model_routing_v1` 演进成下面结构：

```json
{
  "quotaPolicy": "local_quota",
  "providers": {
    "cloudbase_default": {
      "providerType": "cloudbase",
      "protocolMode": "auto",
      "providerClass": "fallback",
      "commercialTier": "default",
      "visibleLabel": "腾讯云默认",
      "cloudbaseProvider": "hunyuan-exp",
      "defaultModel": "hunyuan-turbos-latest",
      "enabled": true
    },
    "deepseek_primary": {
      "providerType": "openai_compatible",
      "protocolMode": "chat_completions",
      "providerClass": "domestic",
      "commercialTier": "balanced",
      "visibleLabel": "DeepSeek",
      "baseURL": "https://api.deepseek.com/v1",
      "defaultModel": "deepseek-v4-flash",
      "enabled": true
    },
    "openai_primary": {
      "providerType": "openai_compatible",
      "protocolMode": "responses",
      "providerClass": "international",
      "commercialTier": "premium",
      "visibleLabel": "国际模型",
      "baseURL": "https://api2.tabcode.cc/openai",
      "defaultModel": "gpt-5.4-mini",
      "enabled": false
    }
  },
  "modelRouting": {
    "followup_summary": {
      "providerKey": "deepseek_primary",
      "model": "deepseek-v4-flash",
      "fallbackProviderKey": "cloudbase_default",
      "fallbackModel": "hunyuan-turbos-latest",
      "enabled": true,
      "modeBindings": {
        "speed": {
          "providerKey": "cloudbase_default",
          "model": "hunyuan-turbos-latest"
        },
        "balanced": {
          "providerKey": "deepseek_primary",
          "model": "deepseek-v4-flash"
        }
      }
    }
  }
}
```

## 十二、推荐的开发顺序

建议按下面顺序推进：

1. 先把当前三条路由稳定跑通
2. 后台补 `protocolMode / providerClass / commercialTier / visibleLabel`
3. 路由补 `fallbackProviderKey / fallbackModel`
4. 增加“模式映射”配置能力，但仅作为后台预留结构
5. 第一版前台不开放任何模型或模式切换
6. 收费体系稳定后，再评估是否开放模式切换
7. 更晚阶段再评估是否开放高级用户模型选择

## 十三、最终建议

最终建议可以概括成一句话：

平台保底走腾讯云 CloudBase 默认通道，运营后台掌握多模型任务路由，第一版完全由后台控制模型选择，后续如有必要再逐步开放模式切换，正式收费后再把模型档位与套餐权益绑定。

这条路径最符合你当前的产品阶段，也最适合后续持续运营和收费。
