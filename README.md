# 成交 CRM 小程序

基于 PRD 持续开发的微信小程序，当前已经从高保真 demo 进入“实用版 CRM + AI 推进增强”阶段，同时支持两种运行模式：

- `Mock Demo`：默认开启，页面直接读取本地示例数据，适合做演示和视觉评审。
- `CloudBase`：关闭 `config/cloud.js` 里的 `useMock` 并填入真实 `envId` 后，可切换到云开发调用链。

## 目录

- `pages/`: 17 个业务页面
- `components/`: 底部导航、加载骨架、空状态
- `services/`: 云环境运行时和数据入口
- `admin-web/`: 第一版独立 Web 管理台骨架
- `config/cloud.js`: 云环境配置
- `cloudfunctions/`: 业务云函数与 AI 云函数
- `assets/`: 图标与空状态插画
- `docs/`: 云环境就绪检查清单与操作说明

## 先看这些文档

- 云环境就绪检查清单： [云环境就绪检查清单](/Users/shaominhe/成交CRM-CodeX版/docs/云环境就绪检查清单.md)
- 云函数与数据库清单： [云函数与数据库清单](/Users/shaominhe/成交CRM-CodeX版/docs/云函数与数据库清单.md)
- 云函数部署后检查清单： [云函数部署后检查清单](/Users/shaominhe/成交CRM-CodeX版/docs/云函数部署后检查清单.md)
- AI 功能 PRD 与数据流设计： [AI功能PRD与数据流设计](/Users/shaominhe/成交CRM-CodeX版/docs/AI功能PRD与数据流设计.md)
- AI 功能部署与联调清单： [AI功能部署与联调清单](/Users/shaominhe/成交CRM-CodeX版/docs/AI功能部署与联调清单.md)
- 管理台骨架说明： [admin-web/README.md](/Users/shaominhe/成交CRM-CodeX版/admin-web/README.md)
- 前台权益与付费承接闭环说明： [前台权益与付费承接闭环说明](/Users/shaominhe/成交CRM-CodeX版/docs/前台权益与付费承接闭环说明.md)
- `plans` 集合初始化清单： [plans集合初始化与导入清单](/Users/shaominhe/成交CRM-CodeX版/docs/plans集合初始化与导入清单.md)
- 支付回调适配与联调清单： [支付回调适配与联调清单](/Users/shaominhe/成交CRM-CodeX版/docs/支付回调适配与联调清单.md)
- 微信支付真云部署与联调清单： [微信支付真云部署与联调清单](/Users/shaominhe/成交CRM-CodeX版/docs/微信支付真云部署与联调清单.md)

## 接入真实云环境

1. 在 [cloud.js](/Users/shaominhe/成交CRM-CodeX版/config/cloud.js) 中替换 `envId`。
2. 将 [cloud.js](/Users/shaominhe/成交CRM-CodeX版/config/cloud.js) 中的 `useMock` 改成 `false`。
3. 确认 [project.config.json](/Users/shaominhe/成交CRM-CodeX版/project.config.json) 中的 `appid` 是你的真实小程序 `AppID`。
4. 在微信开发者工具中上传并部署 `cloudfunctions/` 下的云函数。
5. 根据 PRD 创建集合：`users`、`projects`、`followUps`、`tasks`、`shareRecords`、`deals`、`notifications`。
6. 打开首页或项目页，确认顶部数据源标识变成 `CloudBase 已连接`。

## 当前主能力

- 项目管理、项目详情、联系人、成交登记
- 跟进记录、任务化推进、消息提醒
- 资料分享、项目转交、外发追踪
- 跟进 AI 整理、下一步建议、分享摘要
- 项目 AI 研判、成交/流失 AI 复盘、沉默项目 AI 唤醒
- 跟进页语音录入转文字

## 已补齐

- CloudBase 初始化与 mock 回退
- 真实数据流与任务化推进主线
- 分享信息 / 转交项目双链路
- AI 研判、AI 复盘、AI 唤醒、AI 分享摘要、语音转文字接入代码
- 加载态、空状态、插画与图标资源
- 统一轻商务主题与页面引导文案
- 云环境状态标签，可直接在页面顶部识别当前是否已接通 CloudBase
