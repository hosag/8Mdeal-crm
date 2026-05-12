# admin-web-bridge

这是成交 CRM 后台 Web 的本地桥接服务。

作用：

1. 浏览器访问 [admin-web](/Users/shaominhe/成交CRM-CodeX版/admin-web)
2. `admin-web` 通过 `fetch` 调本地 bridge
3. bridge 再用 CloudBase Node SDK 调已部署的管理云函数

## 当前已接的路径

- `POST /adminListUsers`
- `POST /adminListOrders`
- `POST /adminListUsage`
- `POST /adminListAuditLogs`
- `POST /adminUpdateEntitlements`
- `POST /updateBillingOrderStatus`
- `POST /handleBillingPaymentCallback`
- `GET /healthz`

## 依赖来源

bridge 依赖 `@cloudbase/node-sdk` 调云函数。腾讯云开发官方文档说明：

- Node SDK 可用 `callFunction` 调云函数
- 在普通 Node.js 环境里，可通过 `secretId` / `secretKey` 初始化服务端调用

参考：

- https://docs.cloudbase.net/en/api-reference/server/node-sdk/functions
- https://docs.cloudbase.net/en/api-reference/server/node-sdk/initialization

## 启动前准备

至少准备以下一组鉴权方式：

### 方案 A：显式密钥对

```bash
export CLOUDBASE_ENV_ID=cloud1-8g5sii8ve777802e
export CLOUDBASE_SECRET_ID=你的SecretId
export CLOUDBASE_SECRET_KEY=你的SecretKey
```

可选：

```bash
export ADMIN_WEB_BRIDGE_PORT=8788
export ADMIN_WEB_BRIDGE_HOST=127.0.0.1
export ADMIN_WEB_BRIDGE_TIMEOUT_MS=15000
export ADMIN_WEB_BRIDGE_KEY=你自定义的一段本地bridge口令
```

## 安装与启动

```bash
cd /Users/shaominhe/成交CRM-CodeX版/admin-web-bridge
npm install
npm run check
npm start
```

## 浏览器访问方式

### 1. 管理台静态页

如果静态页跑在 `8732`：

```text
http://127.0.0.1:8732/
```

### 2. 切到 Cloud 模式

如果 bridge 跑在 `8788`：

```text
http://127.0.0.1:8732/?provider=cloud&bridgeBase=http://127.0.0.1:8788&operatorKey=你的内部operatorKey
```

如果同时启用了 bridge 保护口令：

```text
http://127.0.0.1:8732/?provider=cloud&bridgeBase=http://127.0.0.1:8788&operatorKey=你的内部operatorKey&bridgeKey=你的本地bridge口令
```

## 注意

- bridge 只负责把浏览器请求转到云函数，不替代云函数里的 `operatorKey` 鉴权
- `operatorKey` 仍由管理云函数自行校验
- 浏览器 query 里带密钥只适合本地内测，正式商用前必须改成后台登录态 + 服务端会话
