# 成交 CRM 小程序 UI Demo

基于 PRD 搭建的微信小程序高保真界面 demo，当前同时支持两种运行模式：

- `Mock Demo`：默认开启，页面直接读取本地示例数据，适合做演示和视觉评审。
- `CloudBase`：关闭 `config/cloud.js` 里的 `useMock` 并填入真实 `envId` 后，可切换到云开发调用链。

## 目录

- `pages/`: 13 个业务页面
- `components/`: 底部导航、加载骨架、空状态
- `services/`: 云环境运行时和数据入口
- `config/cloud.js`: 云环境配置
- `cloudfunctions/`: 云函数骨架
- `assets/`: 图标与空状态插画
- `docs/`: 云环境就绪检查清单与操作说明

## 先看这两份文档

- 云环境就绪检查清单： [云环境就绪检查清单](/Users/shaominhe/成交CRM-CodeX版/docs/云环境就绪检查清单.md)
- 云函数与数据库清单： [云函数与数据库清单](/Users/shaominhe/成交CRM-CodeX版/docs/云函数与数据库清单.md)
- 云函数部署后检查清单： [云函数部署后检查清单](/Users/shaominhe/成交CRM-CodeX版/docs/云函数部署后检查清单.md)
- AI 功能 PRD 与数据流设计： [AI功能PRD与数据流设计](/Users/shaominhe/成交CRM-CodeX版/docs/AI功能PRD与数据流设计.md)

## 接入真实云环境

1. 在 [cloud.js](/Users/shaominhe/成交CRM-CodeX版/config/cloud.js) 中替换 `envId`。
2. 将 [cloud.js](/Users/shaominhe/成交CRM-CodeX版/config/cloud.js) 中的 `useMock` 改成 `false`。
3. 确认 [project.config.json](/Users/shaominhe/成交CRM-CodeX版/project.config.json) 中的 `appid` 是你的真实小程序 `AppID`。
4. 在微信开发者工具中上传并部署 `cloudfunctions/` 下的云函数。
5. 根据 PRD 创建集合：`users`、`projects`、`followUps`、`shareRecords`、`deals`、`notifications`。
6. 打开首页或项目页，确认顶部数据源标识变成 `CloudBase 已连接`。

## 已补齐

- CloudBase 初始化与 mock 回退
- `login` / `createNotifyTask` / `sendNotify` / `getDemoData` 云函数骨架
- 加载态、空状态、插画与图标资源
- 统一轻商务主题与页面引导文案
- 云环境状态标签，可直接在页面顶部识别当前是否已接通 CloudBase
