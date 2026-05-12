# AI 模型建议更新策略

这份文档只解决一件事：

当各家模型厂商更新节奏变快时，如何让后台“AI 模型配置中心”的建议模型、默认模型、生产模板文档不落后。

适用范围：

- 后台 `AI 模型配置` 页面里的供应商建议模型
- 云函数默认配置中的 `defaultModel`
- 生产部署模板和运维文档里的推荐模型名

不适用范围：

- 用户前台直接选模型
- 针对单个客户的临时试验路由
- 私有代理网关的专属命名约定

## 一、更新原则

每次更新都坚持这 5 条：

1. 只采信官方文档或官方控制台当前明确可用的模型名。
2. 建议模型要优先选“正式可商用、稳定、适合当前 CRM 任务”的型号，不盲追预览名。
3. 兼容名可以保留，但必须标清“兼容名”或“即将废弃”，不能继续作为默认推荐。
4. 后台建议值、云函数默认值、关键生产模板要一起改，不能只改一层。
5. 最终以后台“测试当前配置”通过和真实链路验证通过为准。

## 二、建议更新频率

建议频率：

- 内测期：每 2 周检查一次
- 正式收费后：每月检查一次
- 发现厂商公告“废弃/替换/迁移”时：当周立即检查

以下情况必须立即更新：

- 官方声明某模型将在明确日期废弃
- 官方主推模型已经切换
- 当前后台默认模型在官方文档中已不再推荐
- 真实调用已经因为模型名变更开始报错

## 三、当前维护的供应商清单

当前项目后台预设里维护这些供应商：

1. `cloudbase_default`
2. `deepseek_primary`
3. `qwen_primary`
4. `zhipu_primary`
5. `kimi_primary`
6. `openai_primary`

## 四、当前建议口径基线

以下基线以 `2026-05-06` 为准：

1. `cloudbase_default`
   - `defaultModel = hunyuan-turbos-latest`
2. `deepseek_primary`
   - `defaultModel = deepseek-v4-flash`
   - 候选补充：`deepseek-v4-pro`
   - 兼容名保留：`deepseek-chat`、`deepseek-reasoner`
3. `qwen_primary`
   - `defaultModel = qwen-max`
   - 候选补充：`qwen-plus`、`qwen-turbo`
4. `zhipu_primary`
   - `defaultModel = glm-4.5`
   - 候选补充：`glm-4.5-air`、`glm-4.5-flash`
5. `kimi_primary`
   - `defaultModel = kimi-k2`
   - 候选补充：`kimi-k2-turbo-preview`、`kimi-latest`
6. `openai_primary`
   - `defaultModel = gpt-5.4-mini`
   - 候选补充：`gpt-5.4`

## 五、每次更新必须核对的官方来源

建议只看官方来源：

1. DeepSeek
   - `https://api-docs.deepseek.com/`
2. 阿里云 DashScope / 百炼
   - 阿里云官方模型列表 / 模型广场
3. 智谱
   - `https://docs.bigmodel.cn/`
4. Moonshot / Kimi
   - `https://platform.moonshot.cn/docs`
5. OpenAI
   - `https://platform.openai.com/docs/models`
6. CloudBase / 腾讯云默认
   - CloudBase AI 官方文档

要求：

- 必须看“当前支持的模型”页，而不是只看旧文章或二手博客
- 如果官方只给能力层名称、不强调默认型号，则选择最稳的正式量产档，不选实验档

## 六、每次更新要改哪些文件

### 1. 后台前端建议值

文件：

- [app.js](/Users/shaominhe/成交CRM-CodeX版/admin-web/app.js)

重点字段：

- `AI_PROVIDER_LIBRARY`
- 每个供应商的 `defaultModel`
- 每个供应商的 `modelOptions`
- 每个供应商的 `recommendedAt`

### 2. 云函数默认配置

文件：

- [index.js](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/adminGetAiModelConfig/index.js)
- [index.js](/Users/shaominhe/成交CRM-CodeX版/cloudfunctions/adminUpdateAiModelConfig/index.js)

重点字段：

- `DEFAULT_PAYLOAD.providers.*.defaultModel`

### 3. 运维和生产模板文档

至少同步这些文件：

- [AI首版生产配置模板.md](/Users/shaominhe/成交CRM-CodeX版/docs/AI首版生产配置模板.md)
- [AI多模型路由与用户切换方案.md](/Users/shaominhe/成交CRM-CodeX版/docs/AI多模型路由与用户切换方案.md)

如有口径变化明显，再检查：

- [腾讯云正式商用AI接入方案.md](/Users/shaominhe/成交CRM-CodeX版/docs/腾讯云正式商用AI接入方案.md)

## 七、推荐的更新步骤

每次更新建议按下面顺序走：

1. 先核对各厂商官方当前模型列表。
2. 明确每家要不要改“默认推荐模型”。
3. 更新后台 `AI_PROVIDER_LIBRARY`。
4. 更新 `adminGetAiModelConfig` 和 `adminUpdateAiModelConfig` 的默认值。
5. 更新生产模板文档。
6. 运行语法检查：
   - `node --check admin-web/app.js`
   - `node --check cloudfunctions/adminGetAiModelConfig/index.js`
   - `node --check cloudfunctions/adminUpdateAiModelConfig/index.js`
7. 重新部署云函数：
   - `adminGetAiModelConfig`
   - `adminUpdateAiModelConfig`
8. 强刷后台页面，检查供应商卡片建议值。
9. 在后台“测试当前配置”里至少测试 1 个国内通道和 1 个国际通道。

## 八、更新后的最短验证清单

更新完后至少做这些验证：

1. 后台供应商卡片里看到新的 `defaultModel`
2. 建议模型提示里日期已更新
3. `adminGetAiModelConfig` 返回的新默认值正确
4. 后台保存配置后不会把新模型名抹掉
5. `测试当前配置` 至少成功 1 次

## 九、哪些情况不要盲改

以下情况不要因为“看起来更新了”就直接改默认值：

1. 官方是预览模型，没有稳定商用说明
2. 兼容网关并不支持该新模型名
3. 当前生产流量已经稳定，而新模型还没完成一轮联调
4. 新模型虽然更强，但成本和时延明显不适合当前 CRM 任务

这种情况下的处理方式：

- 先加到 `modelOptions`
- 不急着改 `defaultModel`
- 等后台测试和真实链路验证过后再切默认

## 十、回滚原则

如果新模型建议值更新后引发异常：

1. 先回退后台配置到上一轮已验证模型
2. 再回退文档默认模板
3. 不要保留“代码推荐新值、后台实际用旧值”的半同步状态

优先级：

- 可用性优先于“建议值最新”

## 十一、维护备注

当前项目不是“让用户自己理解模型差异”，而是“让后台管理员有清晰、不过时的建议口径”。

所以这份策略的目标不是追求最花哨，而是：

1. 不落后
2. 不混乱
3. 可验证
4. 可回滚
