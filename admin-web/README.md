# 成交 CRM 管理台骨架

目录：

- [index.html](/Users/shaominhe/成交CRM-CodeX版/admin-web/index.html)
- [styles.css](/Users/shaominhe/成交CRM-CodeX版/admin-web/styles.css)
- [app.js](/Users/shaominhe/成交CRM-CodeX版/admin-web/app.js)

## 当前定位

这是第一版独立 Web 管理台骨架。

当前目标不是直接接通真实后台接口，而是先把后台第一阶段最关键的结构和操作流落出来：

1. 用户与账户列表
2. 订单与支付状态列表
3. 额度与订阅视图
4. 账户详情
5. 权益人工调整
6. 审计日志展示

## 当前特点

- 无依赖静态实现
- 打开 `index.html` 就能查看界面
- 默认使用本地 mock 数据
- 已抽出 `mock / cloud` provider 结构
- 当前 `mock` 模式下，人工调整仍只在前端状态生效
- 所有调整都会写入页面内的审计日志列表

当前仓库已经补了第一批只读管理云函数：

- `adminListUsers`
- `adminListOrders`
- `adminListUsage`
- `adminListAuditLogs`

这些接口读取真实 CloudBase 集合，但需要提供内部操作密钥。

同时，仓库现在也补了一个本地桥接目录：

- [admin-web-bridge](/Users/shaominhe/成交CRM-CodeX版/admin-web-bridge)

这个 bridge 会把浏览器请求转成服务端 CloudBase Node SDK 调用，避免直接在浏览器里暴露云端 SDK 和服务端密钥。

## 运行模式

### 1. 本地 Mock

直接打开页面，或者通过本地静态服务访问即可：

- `index.html`
- `http://127.0.0.1:8731/`

这是默认模式，适合先确认后台结构和交互。

### 2. Cloud Bridge 预留模式

当前浏览器端没有直接接 CloudBase SDK，而是预留了一个“桥接服务”模式。

地址参数示例：

```text
http://127.0.0.1:8731/?provider=cloud&bridgeBase=http://127.0.0.1:8788&operatorKey=你的内部密钥
```

说明：

- `provider=cloud`：切到云端模式
- `bridgeBase`：可选，默认就是 `http://127.0.0.1:8788`
- `operatorKey`：对应 `billing_internal_operator_v1.payload.operatorKey`
- `bridgeKey`：可选，对应本地 bridge 自己的保护口令

当前页面会向这些路径发 `POST`：

- `/adminListUsers`
- `/adminListOrders`
- `/adminListUsage`
- `/adminListAuditLogs`
- `/adminUpdateEntitlements`
- `/updateBillingOrderStatus`
- `/handleBillingPaymentCallback`

请求体会自动带上：

```json
{
  "operatorKey": "你的内部管理密钥"
}
```

再叠加各自业务参数。

## P1 回归

本仓库已经补了一份 P1 验收文档和一个静态回归脚本，用于验证本轮 `usage` 页面增强与 `AI 模型配置中心` 的基础结构没有被后续改动破坏。

文档：

- [P1后台运营控制增强验收清单](/Users/shaominhe/成交CRM-CodeX版/docs/P1后台运营控制增强验收清单.md)

脚本：

```bash
node admin-web/scripts/check-usage-p1.js
```

这个脚本会检查：

- usage 页面新增筛选与统计容器是否还在
- `app.js` 中的 P1 核心逻辑挂点是否还在
- `adminGetAiModelConfig / adminUpdateAiModelConfig` 是否仍支持 `modelPricing`
- 三个关键 JS 文件是否还能通过 `node --check`

说明：

- 这是静态结构回归，不代替浏览器联调
- 浏览器联调步骤请直接看上面的验收清单文档

## 后续接真实接口建议

优先替换这几类能力：

1. 账户列表数据源
2. 订单列表数据源
3. 账户详情权益数据源
4. 权益更新提交接口
5. 审计日志查询接口

建议对接的管理接口名称，沿用规划文档中的命名：

- `adminListUsers`
- `adminUpdateEntitlements`
- `adminListOrders`
- `adminListUsage`
- `adminAuditLogs` 查询接口

## 内部操作密钥

当前这批管理云函数沿用已有内部操作开关：

- `featureFlags.flagKey = billing_internal_operator_v1`

建议 `payload` 至少包含：

```json
{
  "operatorKey": "你的内部管理密钥",
  "operatorId": "admin_console"
}
```

说明：

- `enabled = true` 时接口才可用
- 当前这是内部预览方案，只适合内测和开发阶段
- 正式商用前仍需要补后台登录和更严格的鉴权

## 当前适合做什么

- 先确认后台页面结构是否符合你的运营习惯
- 先确认第一版后台模块边界是否合理
- 先给后续真接口接入预留页面和交互骨架
- 后续只要补一个带 CORS 的桥接服务，就能把当前 Web 页面切到真实数据
