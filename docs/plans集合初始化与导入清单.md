# `plans` 集合初始化与导入清单

这份清单用于把 `plans` 集合补齐到“前台可展示、下单可读取、后台可查看”的可运营状态。

当前仓库里已经有 3 条链路会读取 `plans`：

1. 商品目录：[`getBillingCatalog`](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/getBillingCatalog/index.js)
2. 创建订单：[`createBillingOrder`](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/createBillingOrder/index.js)
3. 后台额度与订阅页：[`adminListUsage`](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/adminListUsage/index.js)

如果 `plans` 为空：

- 前台仍会回退到代码内默认商品，不会立刻坏掉
- 后台“额度与订阅”里的“当前启用商品”会显示为空
- 后续真支付、真实商品运营和价格调整不方便统一管理

所以现在建议尽快把 `plans` 集合补上。

## 推荐做法

第一版直接导入仓库里的种子文件。

如果你用的是腾讯云开发控制台数据库导入，优先使用这个文件：

- [plans.seed.cloudbase.json](/Users/shaominhe/成交CRM-CodeX版/docs/seeds/plans.seed.cloudbase.json)

这个文件的扩展名是 `.json`，但内容不是顶层数组，而是 CloudBase 要求的“每行一条 JSON 对象”格式。

如果你用的是支持“标准 JSON 数组”的工具，再使用这个文件：

- [plans.seed.json](/Users/shaominhe/成交CRM-CodeX版/docs/seeds/plans.seed.json)

这份种子数据采用“兼容型字段集”：

- 同时保留 `planCode` 和 `productCode`
- 同时保留 `planName` 和 `productName`
- 同时保留 `planType` 和 `productType`
- 同时保留 `monthlyVoiceSeconds` / `includedVoiceSeconds`
- 同时保留 `monthlyAiTokens` / `includedAiTokens`

这样做的目的不是最终范式，而是为了让当前多条链路都能直接读取，避免你现在还要为历史字段口径再做一轮迁移。

## 首版建议商品

当前建议导入 5 条：

1. `trial_preview_v1`
2. `starter_monthly_v1`
3. `starter_yearly_v1`
4. `voice_pack_growth_v1`
5. `ai_pack_growth_v1`

对应你当前已经确认过的业务策略：

- 新用户首周完整试用
- 正式版分月付 / 年付订阅
- 语音按转写时长单独加购
- AI 按 token / 额度包单独加购

## 导入步骤

### 方案 A：云开发控制台导入

1. 打开腾讯云开发控制台，进入环境 `cloud1-8g5sii8ve777802e`
2. 进入数据库
3. 找到或新建集合 `plans`
4. 选择“导入数据”
5. 导入文件 [plans.seed.cloudbase.json](/Users/shaominhe/成交CRM-CodeX版/docs/seeds/plans.seed.cloudbase.json)
6. 如果导入工具支持“新增”或“覆盖”，第一轮优先选择“新增”
7. 导入完成后，在集合里确认有 5 条记录

### 方案 B：微信开发者工具数据库面板导入

1. 打开微信开发者工具
2. 进入当前项目对应的云开发环境
3. 打开数据库
4. 找到或新建 `plans`
5. 优先导入 [plans.seed.cloudbase.json](/Users/shaominhe/成交CRM-CodeX版/docs/seeds/plans.seed.cloudbase.json)

如果你当前工具版本不支持直接导入 JSON 数组：

1. 先新建集合 `plans`
2. 复制种子文件中的每条对象
3. 逐条新增

## 导入后检查

至少检查下面几项字段：

- `enabled`
- `sortOrder`
- `planCode`
- `productCode`
- `planName`
- `productName`
- `planType`
- `productType`
- `billingCycle`
- `includedVoiceSeconds`
- `includedAiTokens`

尤其注意：

- `starter_monthly_v1` 和 `starter_yearly_v1` 的 `projectLimit` 应为 `-1`
- `voice_pack_growth_v1` 的 `includedVoiceSeconds` 应大于 `0`
- `ai_pack_growth_v1` 的 `includedAiTokens` 应大于 `0`
- `trial_preview_v1` 必须保留，否则前台目录未来切到纯数据库商品源后，试用入口会丢失

## 建议索引

第一版至少建这两个：

1. 唯一索引：`planCode`
2. 普通索引：`enabled + sortOrder`

如果当前控制台暂时不方便建索引，也可以先导入并联调，后续再补。

## 导入完成后的验证

### 1. 后台管理台验证

刷新后台页：

```text
http://127.0.0.1:8732/?provider=cloud&operatorKey=e0ae73ab3a4bea099c63f381c414208ef5eb07f381adff0e
```

进入“额度与订阅”，预期：

- “当前启用商品”不再为空
- 至少能看到 5 张商品卡片

### 2. `adminListUsage` 验证

执行：

```bash
curl -iS -X POST http://127.0.0.1:8788/adminListUsage \
  -H 'Content-Type: application/json' \
  -d '{"operatorKey":"e0ae73ab3a4bea099c63f381c414208ef5eb07f381adff0e"}'
```

预期返回中：

- `ok: true`
- `plans` 不再是空数组

### 3. 前台商品目录验证

在真机或开发者工具里进入套餐页，确认至少能看到：

- 试用体验
- 基础版月付
- 基础版年付
- 语音转写包
- AI 额度包

## 后续建议

这一步做完后，下一轮最值得继续的是两件事：

1. 把 `plans` 的真实价格补齐
2. 把支付回调成功后的订阅 / 流量包发放链路做一次完整联调

这样你的“商品目录 -> 下单 -> 支付 -> 到账 -> 后台可查”这条线就真正闭合了。
