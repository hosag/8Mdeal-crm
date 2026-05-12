# AI 功能部署与联调清单

这份清单用于把当前这轮 AI 能力真正落到“可提测”状态，重点不是继续开发，而是避免漏配云函数、漏建集合、漏做真机验证。

适用范围：

- 跟进页 `AI整理` / `下一步建议` / `语音录入`
- 首页闪录 `语音闪录` / `项目归属` / `下一步建议`
- 项目详情页 `AI研判` / `AI复盘`
- 我的项目页 `AI唤醒`
- 分享卡页 `AI整理`

相关策略文档：

- 正式商用接入路径、腾讯云生态建议和 `provider_plan / local_quota` 阶段切换，请同时参考 [腾讯云正式商用AI接入方案](/Users/shaominhe/成交CRM-CodeX版/docs/腾讯云正式商用AI接入方案.md)
- 首版后台建议填写模板、三条核心路由推荐配置，请同时参考 [AI首版生产配置模板](/Users/shaominhe/成交CRM-CodeX版/docs/AI首版生产配置模板.md)

## 一、先确认前提

提测前，先确认这 5 条：

- [ ] [cloud.js](/Users/shaominhe/成交CRM-CodeX版/config/cloud.js) 中 `useMock` 为 `false`
- [ ] [cloud.js](/Users/shaominhe/成交CRM-CodeX版/config/cloud.js) 中 `envId` 已指向真实环境
- [ ] 微信开发者工具当前绑定的云环境与 `envId` 一致
- [ ] 集合 `projects`、`followUps`、`tasks`、`shareRecords`、`notifications` 已创建
- [ ] 首页或项目页顶部已显示 `CloudBase 已连接`

如果这一步没满足，先不要测 AI，先把云环境接通。

## 二、必须先部署的云函数

按这个顺序最稳：

1. `summarizeFollowUp`
2. `resolveQuickEntryProject`
3. `suggestNextFollowUp`
4. `saveFollowUp`
5. `updateTaskStatus`
6. `generateShareBrief`
7. `judgeProject`
8. `reviewClosedProject`
9. `wakeDormantProject`
10. `adminGetAiModelConfig`
11. `adminUpdateAiModelConfig`
12. `getEntitlements`

每个函数都统一用：

1. 右键云函数目录
2. 选择“上传并部署：云端安装依赖”
3. 等待完成后看部署结果

最小成功标准：

- [ ] 没有 `Cannot find module 'wx-server-sdk'`
- [ ] 没有依赖安装失败
- [ ] 没有环境不存在或权限错误
- [ ] 云函数日志中没有启动时报错

## 三、语音录入额外前提

`speechToText` 不是纯前端功能，它有额外依赖。

部署前必须确认：

- [ ] 已上传并部署 [speechToText](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/speechToText/index.js)
- [ ] 腾讯云控制台侧已开通语音识别 ASR 相关服务与接口调用权限
- [ ] 云函数环境变量已配置 `ASR_SECRET_ID`
- [ ] 云函数环境变量已配置 `ASR_SECRET_KEY`
- [ ] 如有需要，已配置 `ASR_REGION`
- [ ] 如有需要，已配置 `ASR_ENG_SERVICE_TYPE`
- [ ] 真机允许录音权限

这块如果没配好，跟进页语音入口会出现“服务未就绪”或识别失败提示，这是预期表现，不是前端崩了。

已确认的真实排障结论：

- 只把 `speechToText` 云函数部署成功、环境变量配对，还不足以保证可用
- 如果腾讯云控制台侧没有先开通语音识别 ASR 服务或对应权限，真机调用时仍会失败
- 这类问题表面上可能像“网络异常”或“密钥未生效”，排查时不要只盯前端和 CloudBase

## 四、必须重点测的场景

### 0. AI 模型配置中心（新增）

- [ ] `admin-web-bridge` 已重启，`/healthz` 返回 routes 中包含 `/adminGetAiModelConfig` 和 `/adminUpdateAiModelConfig`
- [ ] 管理台“额度与订阅”页可看到“AI 模型配置中心”
- [ ] 能读取当前 `quotaPolicy`、供应商配置和 3 条路由配置
- [ ] 修改后保存成功，刷新后配置仍一致
- [ ] 审计日志出现 `update_ai_model_config`
- [ ] 供应商配置可维护 `providerType / cloudbaseProvider / baseURL / defaultModel / API Key`
- [ ] API Key 不回显明文，只显示 `hasApiKey` 和掩码

建议用这两个命令做快速核验：

```bash
curl -s -X POST http://127.0.0.1:8788/adminGetAiModelConfig \
  -H 'Content-Type: application/json' \
  -d '{"operatorKey":"你的operatorKey"}'
```

```bash
curl -s -X POST http://127.0.0.1:8788/adminUpdateAiModelConfig \
  -H 'Content-Type: application/json' \
  -d '{"operatorKey":"你的operatorKey","config":{"quotaPolicy":"provider_plan","providers":{"cloudbase_default":{"providerType":"cloudbase","displayName":"CloudBase 默认","cloudbaseProvider":"hunyuan-exp","defaultModel":"hunyuan-turbos-latest","enabled":true},"openai_primary":{"providerType":"openai_compatible","displayName":"OpenAI 主通道","baseURL":"https://api.openai.com/v1","defaultModel":"gpt-4.1-mini","apiKey":"<YOUR_API_KEY>","enabled":false}},"modelRouting":{"quick_entry_project":{"providerKey":"cloudbase_default","provider":"hunyuan-exp","model":"hunyuan-turbos-latest","enabled":true},"followup_summary":{"providerKey":"cloudbase_default","provider":"hunyuan-exp","model":"hunyuan-turbos-latest","enabled":true},"followup_next_action":{"providerKey":"cloudbase_default","provider":"hunyuan-exp","model":"hunyuan-turbos-latest","enabled":true}}},"reason":"联调验证：切到 provider_plan"}'
```

回切本地额度策略：

```bash
curl -s -X POST http://127.0.0.1:8788/adminUpdateAiModelConfig \
  -H 'Content-Type: application/json' \
  -d '{"operatorKey":"你的operatorKey","config":{"quotaPolicy":"local_quota","providers":{"cloudbase_default":{"providerType":"cloudbase","displayName":"CloudBase 默认","cloudbaseProvider":"hunyuan-exp","defaultModel":"hunyuan-turbos-latest","enabled":true}},"modelRouting":{"quick_entry_project":{"providerKey":"cloudbase_default","provider":"hunyuan-exp","model":"hunyuan-turbos-latest","enabled":true},"followup_summary":{"providerKey":"cloudbase_default","provider":"hunyuan-exp","model":"hunyuan-turbos-latest","enabled":true},"followup_next_action":{"providerKey":"cloudbase_default","provider":"hunyuan-exp","model":"hunyuan-turbos-latest","enabled":true}}},"reason":"联调完成：回切 local_quota"}'
```

关键设计说明（本轮新增）：

1. 管理台里的 `baseURL / API Key` 只写入云端 `featureFlags.ai_model_routing_v1`，不会下发到小程序端。
2. 三条 AI 云函数（`resolveQuickEntryProject` / `summarizeFollowUp` / `suggestNextFollowUp`）按 `providerKey` 读取供应商配置。
3. 当 `providerType=openai_compatible` 时，云函数直连 `${baseURL}/chat/completions`；当 `providerType=cloudbase` 时，继续走 `CloudBase AI SDK`。

### 1. 跟进页 AI 整理

- [ ] 输入原始记录后，点击 `AI整理` 能返回结构化摘要
- [ ] 可把整理结果回填到正文
- [ ] 二次生成后，可恢复上一版
- [ ] 失败时会出现中文错误提示，不会卡死保存流程

### 2. 跟进页下一步建议

- [ ] 在已有整理结果的前提下，可生成下一步建议
- [ ] 采用建议后，会回填下一次跟进时间和任务草稿
- [ ] 二次生成后，可恢复上一版
- [ ] 当 `quotaPolicy=provider_plan` 时，即使本地 `aiTokensRemaining=0`，仍可正常调用（前提是账号处于可写状态）

### 3. 跟进页语音录入

- [ ] 真机开始录音正常
- [ ] 结束录音后会经历“上传中 -> 识别中”
- [ ] 识别文本会自动追加到原始记录框
- [ ] 超过 60 秒、密钥缺失、网络异常时，错误提示可读

### 4. 项目详情页 AI 研判

- [ ] 进行中项目可看到 `AI研判` 入口
- [ ] 生成后能展示项目全貌、当前判断、关键卡点、推进信号、优先动作
- [ ] 二次生成后，可恢复上一版
- [ ] 只读外发项目不显示该入口

### 5. 首页闪录项目归属

- [ ] 语音转文字后，会自动触发项目归属判断
- [ ] 高置信度时可看到 `AI 已匹配`
- [ ] 中置信度时会显示 `AI 推荐候选`，且仍要求手动确认
- [ ] 未确认项目前，不会生成可保存的完整链路
- [ ] 确认项目后，能继续生成下一步动作建议

### 6. 项目详情页 AI 复盘

- [ ] 仅 `成交` / `流失` 项目显示 `AI复盘`
- [ ] 成交项目输出成交路径、转折点、有效动作、可复制经验
- [ ] 流失项目输出流失过程、失速点、流失原因、是否值得二次激活

### 7. 我的项目页 AI 唤醒

- [ ] 沉默 7 天以上且未关闭项目，出现 `AI唤醒` 入口
- [ ] 弹层中能看到唤醒判断、建议动作、建议切入口
- [ ] 可跳到项目详情或新增跟进

### 8. 分享卡页 AI 摘要

- [ ] 发送资料模式下，摘要主体是项目信息，不会写成分享说明
- [ ] 转交项目模式下，摘要主体仍然是项目，不会变成操作提示
- [ ] 二次生成后，可恢复上一版

## 五、常见问题先看这里

### 页面能打开，但一直显示基础建议

说明：
云端调用失败后走了本地兜底，不一定是坏事，但说明云函数还没完全通。

优先排查：

1. 对应云函数是否重新上传部署
2. 当前网络是否稳定
3. 云函数日志里是否有超时或依赖错误

### 语音录入按钮能点，但没有识别结果

优先排查：

1. 是否在真机环境
2. 录音权限是否已放开
3. `speechToText` 是否已部署
4. 密钥环境变量是否已配置
5. 腾讯云控制台侧是否已开通 ASR 服务与对应权限

### 项目页没有看到 AI 入口

优先排查：

1. 当前项目阶段是否符合入口条件
2. 是否是外发只读项目
3. 页面是否拉到了最新代码并重新编译

## 六、提测通过标准

满足下面这组条件，就可以认为这轮 AI 功能进入可提测状态：

- [ ] 9 个 AI 相关云函数已部署成功
- [ ] 新增 3 个管理与权益函数（`adminGetAiModelConfig` / `adminUpdateAiModelConfig` / `getEntitlements`）已部署成功
- [ ] `speechToText` 已按需部署并完成密钥配置
- [ ] `tasks` 集合已创建并真实参与任务链路
- [ ] 5 个 AI 主能力都至少走通 1 次成功流程
- [ ] 至少 1 条失败链路验证过错误提示可读
- [ ] 真机已验证语音录入链路
- [ ] 首页闪录已验证“高置信度自动匹配 / 中置信度候选确认”两条链路
- [ ] 已验证 `provider_plan` 下 AI 不再被本地 token 额度前置拦截

## 七、建议提测顺序

1. 先测跟进页 `AI整理`
2. 再测 `下一步建议` 和保存跟进
3. 再测任务完成与续接下一步任务
4. 再测项目详情页 `AI研判`
5. 再测成交 / 流失项目 `AI复盘`
6. 再测我的项目页 `AI唤醒`
7. 最后测分享卡 `AI整理` 和语音录入

这样排最省时间，因为它是从高频主流程往外围扩。
