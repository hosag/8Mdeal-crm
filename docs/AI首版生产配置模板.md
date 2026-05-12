# AI 首版生产配置模板

这份文档不是讨论架构，而是给当前版本直接落地用的。

目标只有 3 个：

1. 让后台运营知道 AI 模型配置中心该怎么填
2. 让 3 条核心 AI 路由在生产上先跑稳
3. 出现模型异常时，可以用最短路径回切

适用版本：

- 第一版用户不可见模型
- 第一版用户不可见模式
- 全部路由由后台统一控制

相关文档：

- 多模型长期架构见 [AI多模型路由与用户切换方案](/Users/shaominhe/成交CRM-CodeX版/docs/AI多模型路由与用户切换方案.md)
- 部署与联调步骤见 [AI功能部署与联调清单](/Users/shaominhe/成交CRM-CodeX版/docs/AI功能部署与联调清单.md)
- 腾讯云正式商用建议见 [腾讯云正式商用AI接入方案](/Users/shaominhe/成交CRM-CodeX版/docs/腾讯云正式商用AI接入方案.md)

## 一、首版上线原则

当前阶段建议坚持 4 条原则：

1. `cloudbase_default` 永远保留，并作为全局兜底。
2. 只开放后台切换，不开放前台切换。
3. 每条业务路由都配置主通道和回退通道。
4. 先追求稳定可收费，再追求最优模型效果。

这意味着第一版不要做这些事：

- 不让用户自己选模型
- 不让用户自己选深度模式
- 不为每条路由同时挂太多实验通道
- 不在生产直接依赖单一第三方网关

## 二、推荐的生产供应商池

首版建议只维护 3 个供应商。

以下推荐模型名已按 `2026-05-06` 的官方口径同步过一轮。
如果你接入的是兼容网关或私有中转，请仍以后台实测通过的正式模型名为准。

### 1. `cloudbase_default`

定位：

- 平台默认兜底
- 主通道异常时的保底恢复
- 新环境初始化后的默认可用供应商

推荐填写：

```json
{
  "providerKey": "cloudbase_default",
  "providerType": "cloudbase",
  "protocolMode": "auto",
  "providerClass": "fallback",
  "commercialTier": "default",
  "visibleLabel": "腾讯云默认",
  "displayName": "CloudBase 默认",
  "cloudbaseProvider": "hunyuan-exp",
  "baseURL": "",
  "defaultModel": "hunyuan-turbos-latest",
  "enabled": true
}
```

说明：

- `providerType` 必须是 `cloudbase`
- `baseURL` 和 `API Key` 不需要填
- 这是生产保命通道，不建议关闭

### 2. `deepseek_primary`

定位：

- 国内主通道
- 首版推荐的摘要和建议主力模型
- 性价比优先的正式通道

推荐填写：

```json
{
  "providerKey": "deepseek_primary",
  "providerType": "openai_compatible",
  "protocolMode": "chat_completions",
  "providerClass": "domestic",
  "commercialTier": "balanced",
  "visibleLabel": "DeepSeek",
  "displayName": "DeepSeek 主通道",
  "cloudbaseProvider": "",
  "baseURL": "你的正式 DeepSeek 或兼容网关地址",
  "defaultModel": "deepseek-v4-flash",
  "enabled": true
}
```

说明：

- 如果你接的是标准兼容接口，`protocolMode` 先用 `chat_completions`
- 如果后续某个网关明确只支持 `responses`，再改为 `responses`
- 当前推荐优先 `deepseek-v4-flash`
- 质量优先时可切 `deepseek-v4-pro`
- `deepseek-chat` / `deepseek-reasoner` 当前只建议作为兼容名兜底，不再建议作为新默认值

### 3. `openai_primary`

定位：

- 国际模型备用通道
- 特定质量要求场景的备选
- 后续海外模型或兼容聚合网关接入位

推荐填写：

```json
{
  "providerKey": "openai_primary",
  "providerType": "openai_compatible",
  "protocolMode": "chat_completions",
  "providerClass": "international",
  "commercialTier": "premium",
  "visibleLabel": "国际模型",
  "displayName": "OpenAI 兼容主通道",
  "cloudbaseProvider": "",
  "baseURL": "你的 OpenAI 兼容正式网关地址",
  "defaultModel": "gpt-5.4-mini",
  "enabled": false
}
```

说明：

- 首版可以先配置好但不启用
- 等国内主通道跑稳后，再按需要启用
- 如果你当前并没有稳定的国际正式网关，宁可先关着，也不要挂一个不稳定地址
- 当前推荐优先 `gpt-5.4-mini`，质量优先场景可切 `gpt-5.4`

## 三、推荐的生产路由模板

首版先只管 3 条已经落地的核心路由：

1. `quick_entry_project`
2. `followup_summary`
3. `followup_next_action`

### 方案 A：最稳上线模板

适用场景：

- 刚开始收费
- 刚开始内测放量
- 优先追求稳定，不优先追求单次最优结果

推荐配置：

```json
{
  "quick_entry_project": {
    "providerKey": "cloudbase_default",
    "provider": "hunyuan-exp",
    "model": "hunyuan-turbos-latest",
    "fallbackProviderKey": "deepseek_primary",
    "fallbackModel": "deepseek-v4-flash",
    "enabled": true
  },
  "followup_summary": {
    "providerKey": "cloudbase_default",
    "provider": "hunyuan-exp",
    "model": "hunyuan-turbos-latest",
    "fallbackProviderKey": "deepseek_primary",
    "fallbackModel": "deepseek-v4-flash",
    "enabled": true
  },
  "followup_next_action": {
    "providerKey": "cloudbase_default",
    "provider": "hunyuan-exp",
    "model": "hunyuan-turbos-latest",
    "fallbackProviderKey": "deepseek_primary",
    "fallbackModel": "deepseek-v4-flash",
    "enabled": true
  }
}
```

判断：

- 这是最保守的生产起步方式
- 优点是兜底最稳
- 缺点是效果提升空间没完全吃到

### 方案 B：推荐的首版正式模板

适用场景：

- DeepSeek 正式通道已经联通
- 后台“测试当前配置”已通过
- 小程序真实链路至少走通 1 轮

推荐配置：

```json
{
  "quick_entry_project": {
    "providerKey": "cloudbase_default",
    "provider": "hunyuan-exp",
    "model": "hunyuan-turbos-latest",
    "fallbackProviderKey": "deepseek_primary",
    "fallbackModel": "deepseek-v4-flash",
    "enabled": true
  },
  "followup_summary": {
    "providerKey": "deepseek_primary",
    "provider": "openai_compatible",
    "model": "deepseek-v4-flash",
    "fallbackProviderKey": "cloudbase_default",
    "fallbackModel": "hunyuan-turbos-latest",
    "enabled": true
  },
  "followup_next_action": {
    "providerKey": "deepseek_primary",
    "provider": "openai_compatible",
    "model": "deepseek-v4-flash",
    "fallbackProviderKey": "cloudbase_default",
    "fallbackModel": "hunyuan-turbos-latest",
    "enabled": true
  }
}
```

判断：

- `quick_entry_project` 更偏稳定和速度，先让腾讯云默认兜住最稳
- `followup_summary` 和 `followup_next_action` 更看语言质量，可以让国内主通道先扛主力
- 如果 DeepSeek 主通道出问题，会自动回退到 `cloudbase_default`

这是当前最推荐你上生产的模板。

### 方案 C：国际模型增强模板

适用场景：

- 国内主通道已经稳定
- 某些摘要或建议质量需要更高上限
- 已有稳定可商用的国际兼容网关

推荐配置：

```json
{
  "quick_entry_project": {
    "providerKey": "cloudbase_default",
    "provider": "hunyuan-exp",
    "model": "hunyuan-turbos-latest",
    "fallbackProviderKey": "deepseek_primary",
    "fallbackModel": "deepseek-v4-flash",
    "enabled": true
  },
  "followup_summary": {
    "providerKey": "deepseek_primary",
    "provider": "openai_compatible",
    "model": "deepseek-v4-flash",
    "fallbackProviderKey": "cloudbase_default",
    "fallbackModel": "hunyuan-turbos-latest",
    "enabled": true
  },
  "followup_next_action": {
    "providerKey": "openai_primary",
    "provider": "openai_compatible",
    "model": "gpt-5.4-mini",
    "fallbackProviderKey": "cloudbase_default",
    "fallbackModel": "hunyuan-turbos-latest",
    "enabled": true
  }
}
```

判断：

- 不建议作为第一天生产模板
- 更适合第二阶段做效果和成本对比

## 四、quotaPolicy 推荐值

后台有两个模式：

- `local_quota`
- `provider_plan`

首版正式收费建议：

### 1. 如果你还要强控本地权益

用：

```json
"quotaPolicy": "local_quota"
```

适用：

- 当前收费规则还主要由本地权益系统控制
- 你要严格根据 `aiTokensRemaining` 做前置控制
- 你还没有完全切换到云厂商实际 token 方案

### 2. 如果你已经准备按云厂商 Token Plan 走

用：

```json
"quotaPolicy": "provider_plan"
```

适用：

- 你已经把大模型成本控制迁到供应商侧
- 前台不再因为本地 token 余额为 0 就直接拦住
- 运营更关注账户状态和写权限，而不是本地 token 数值

当前建议：

- 内测后期、正式收费初期，以 `provider_plan` 为目标
- 但如果你还在观察成本，先用 `local_quota` 也可以

如果你问我“首版更推荐哪一个”，我的建议是：

- 功能试运行阶段：`local_quota`
- 开始正式商用阶段：逐步切到 `provider_plan`

## 五、后台填写顺序

建议不要一上来就全填满，按这个顺序最稳：

1. 先配置 `cloudbase_default`
2. 保存
3. 测试 `quick_entry_project`
4. 再配置 `deepseek_primary`
5. 保存
6. 测试 `followup_summary`
7. 再测试 `followup_next_action`
8. 最后再写回退 `fallbackProviderKey`

这样做的原因：

- 出问题时容易定位
- 能知道到底是供应商配置问题，还是路由问题
- 不会把“供应商不可用”和“回退不可用”混在一起

## 六、后台推荐填写样例

如果你要在 web 后台直接照着填，建议先维护成下面这版。

### 1. 供应商

```json
{
  "quotaPolicy": "provider_plan",
  "providers": {
    "cloudbase_default": {
      "providerKey": "cloudbase_default",
      "providerType": "cloudbase",
      "protocolMode": "auto",
      "providerClass": "fallback",
      "commercialTier": "default",
      "visibleLabel": "腾讯云默认",
      "displayName": "CloudBase 默认",
      "cloudbaseProvider": "hunyuan-exp",
      "baseURL": "",
      "defaultModel": "hunyuan-turbos-latest",
      "enabled": true
    },
    "deepseek_primary": {
      "providerKey": "deepseek_primary",
      "providerType": "openai_compatible",
      "protocolMode": "chat_completions",
      "providerClass": "domestic",
      "commercialTier": "balanced",
      "visibleLabel": "DeepSeek",
      "displayName": "DeepSeek 主通道",
      "cloudbaseProvider": "",
      "baseURL": "请填你的正式地址",
      "defaultModel": "deepseek-v4-flash",
      "enabled": true
    },
    "openai_primary": {
      "providerKey": "openai_primary",
      "providerType": "openai_compatible",
      "protocolMode": "chat_completions",
      "providerClass": "international",
      "commercialTier": "premium",
      "visibleLabel": "国际模型",
      "displayName": "OpenAI 兼容主通道",
      "cloudbaseProvider": "",
      "baseURL": "请填你的国际正式地址",
      "defaultModel": "gpt-5.4-mini",
      "enabled": false
    }
  }
}
```

### 2. 路由

```json
{
  "modelRouting": {
    "quick_entry_project": {
      "providerKey": "cloudbase_default",
      "provider": "hunyuan-exp",
      "model": "hunyuan-turbos-latest",
      "fallbackProviderKey": "deepseek_primary",
      "fallbackModel": "deepseek-v4-flash",
      "enabled": true
    },
    "followup_summary": {
      "providerKey": "deepseek_primary",
      "provider": "openai_compatible",
      "model": "deepseek-v4-flash",
      "fallbackProviderKey": "cloudbase_default",
      "fallbackModel": "hunyuan-turbos-latest",
      "enabled": true
    },
    "followup_next_action": {
      "providerKey": "deepseek_primary",
      "provider": "openai_compatible",
      "model": "deepseek-v4-flash",
      "fallbackProviderKey": "cloudbase_default",
      "fallbackModel": "hunyuan-turbos-latest",
      "enabled": true
    }
  }
}
```

## 七、上线前最短验收顺序

按下面顺序验最省时间：

1. 在后台保存供应商配置
2. 用“测试当前配置”测试 `quick_entry_project`
3. 用“测试当前配置”测试 `followup_summary`
4. 用“测试当前配置”测试 `followup_next_action`
5. 真机测试一次闪录项目匹配
6. 真机测试一次跟进摘要
7. 真机测试一次下一步建议
8. 人为关闭主通道，确认回退能工作

验收通过标准：

- 3 条路由都能成功
- 至少 1 条路由验证过回退
- 失败时后台能看到明确错误原因
- 小程序端不会直接无提示失败

## 八、推荐的生产切换策略

建议按这个阶段推进：

### 阶段 1：上线首周

- 主体走 `cloudbase_default`
- 或者摘要/建议走 `deepseek_primary`
- 所有回退都指向 `cloudbase_default`

目的：

- 先稳住
- 先收真实调用和真实反馈

### 阶段 2：开始看效果和成本

- 保持 `quick_entry_project` 稳定优先
- 比较 `followup_summary` 与 `followup_next_action` 的质量
- 逐步调整 `deepseek_primary` 与 `openai_primary`

目的：

- 找到最值的主力模型
- 为正式扩量做准备

### 阶段 3：后台精细化运营

- 按任务拆不同模型
- 按成本和效果做月度调整
- 准备第二版的用户可见模式开关

## 九、回滚模板

如果线上出现异常，直接回到这套最保守模板：

```json
{
  "quotaPolicy": "provider_plan",
  "providers": {
    "cloudbase_default": {
      "providerKey": "cloudbase_default",
      "providerType": "cloudbase",
      "protocolMode": "auto",
      "providerClass": "fallback",
      "commercialTier": "default",
      "visibleLabel": "腾讯云默认",
      "displayName": "CloudBase 默认",
      "cloudbaseProvider": "hunyuan-exp",
      "baseURL": "",
      "defaultModel": "hunyuan-turbos-latest",
      "enabled": true
    }
  },
  "modelRouting": {
    "quick_entry_project": {
      "providerKey": "cloudbase_default",
      "provider": "hunyuan-exp",
      "model": "hunyuan-turbos-latest",
      "fallbackProviderKey": "",
      "fallbackModel": "",
      "enabled": true
    },
    "followup_summary": {
      "providerKey": "cloudbase_default",
      "provider": "hunyuan-exp",
      "model": "hunyuan-turbos-latest",
      "fallbackProviderKey": "",
      "fallbackModel": "",
      "enabled": true
    },
    "followup_next_action": {
      "providerKey": "cloudbase_default",
      "provider": "hunyuan-exp",
      "model": "hunyuan-turbos-latest",
      "fallbackProviderKey": "",
      "fallbackModel": "",
      "enabled": true
    }
  }
}
```

这套模板的意义不是效果最好，而是最快恢复可用。

## 十、当前最推荐你采用的版本

如果现在就准备做第一版正式商用，我的建议是：

1. `quotaPolicy` 先按 `provider_plan` 设计
2. `cloudbase_default` 永远保留
3. `deepseek_primary` 作为摘要和建议主通道
4. `quick_entry_project` 先继续让 `cloudbase_default` 扛主路由
5. `openai_primary` 先配好但默认关闭

也就是一句话：

首版生产先采用“腾讯云兜底 + DeepSeek 主力 + 国际通道预留”的模板。
