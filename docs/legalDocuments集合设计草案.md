# `legalDocuments` 集合设计草案

这份草案用于支撑以下目标：

- 《隐私政策》《用户服务协议》可在 Web 后台更新
- 已发布协议支持版本化管理
- 小程序端只读取“当前生效版本”
- 用户同意行为单独留痕到 `agreementConsents`
- 协议更新后可判断是否需要用户重新确认

这份设计不替代 `agreementConsents`。  
职责划分建议如下：

- `legalDocuments`：存协议正文、版本、发布状态、展示快照
- `agreementConsents`：存用户同意哪一版协议的留痕

---

## 一、集合定位

集合名：

- `legalDocuments`

用途：

- 管理隐私政策、用户服务协议等合规文档的正文与版本
- 提供后台草稿编辑、预览、发布、历史版本查看能力
- 为小程序端提供当前生效协议的元信息与正文

第一版建议支持的 `docType`：

- `privacy_policy`
- `user_agreement`

第二版可扩展：

- `ai_notice`
- `audio_notice`
- `phone_bind_notice`
- `data_storage_notice`
- `account_cancellation_notice`

---

## 二、推荐文档结构

### 2.1 完整示例

```json
{
  "docId": "legal_privacy_policy_2026_06_03_v1",
  "docType": "privacy_policy",
  "title": "隐私政策",
  "version": "2026-06-03-v1",
  "status": "published",
  "isCurrent": true,
  "contentFormat": "markdown",
  "markdownSource": "# 隐私政策\\n\\n这里是后台编辑的 Markdown 正文",
  "htmlSnapshot": "<h1>隐私政策</h1><p>这里是发布时生成的 HTML 快照</p>",
  "plainTextSnapshot": "隐私政策 这里是发布时生成的纯文本快照",
  "summary": "补充录音、图片上传、AI 和支付相关说明",
  "changeNotes": [
    "新增语音录入与图片上传处理说明",
    "新增 AI 辅助与支付场景的数据使用说明"
  ],
  "requiresReconsent": true,
  "effectiveAt": "2026-06-05T00:00:00.000Z",
  "publishedAt": "2026-06-03T10:00:00.000Z",
  "archivedAt": null,
  "hash": "sha256:1e0d3d9a...",
  "sourceDraftId": "",
  "previousVersion": "2026-05-20-v1",
  "currentRevision": 3,
  "operatorId": "admin_console",
  "updatedBy": "admin_console",
  "updatedAt": "2026-06-03T10:00:00.000Z",
  "createdAt": "2026-06-03T09:30:00.000Z"
}
```

---

## 三、字段设计

### 3.1 主标识字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `docId` | string | 建议是 | 文档业务主键，建议自定义，避免直接依赖 `_id` |
| `docType` | string | 是 | 文档类型，如 `privacy_policy / user_agreement` |
| `title` | string | 是 | 展示标题 |
| `version` | string | 是 | 版本号，必须稳定且可用于留痕 |

建议：

- `docType` 使用固定枚举
- `version` 不要用自动递增数字裸值，建议使用“日期 + 版次”，如：
  - `2026-06-03-v1`
  - `2026-06-15-v2`

---

### 3.2 状态字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `status` | string | 是 | `draft / published / archived` |
| `isCurrent` | boolean | 是 | 当前是否为该 `docType` 的生效版本 |
| `requiresReconsent` | boolean | 是 | 该版本发布后是否要求用户重新确认 |

状态建议规则：

- `draft`
  草稿，允许编辑，不对前台生效
- `published`
  已发布，可供小程序端展示
- `archived`
  已归档，仅作历史留存

`isCurrent` 约束建议：

- 同一个 `docType` 只能有一条 `isCurrent = true`
- 发布新版本时，旧版本自动改为 `isCurrent = false`

---

### 3.3 正文字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `contentFormat` | string | 是 | 第一版建议固定 `markdown` |
| `markdownSource` | string | 是 | 后台编辑原文 |
| `htmlSnapshot` | string | 是 | 发布时生成的 HTML 快照 |
| `plainTextSnapshot` | string | 否 | 发布时生成的纯文本快照，便于检索或 diff |

设计建议：

- 后台编辑存 `markdownSource`
- 正式发布时生成 `htmlSnapshot`
- 小程序正文展示优先读取 `htmlSnapshot`
- 如果以后要换编辑器，也尽量保留 `htmlSnapshot` 作为最终发布快照

原因：

- 避免上线后“同一个版本的 Markdown 被后台偷偷改掉”
- 避免小程序端每次都依赖临时渲染逻辑

---

### 3.4 变更说明字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `summary` | string | 否 | 本次版本摘要 |
| `changeNotes` | string[] | 否 | 本次变更要点 |

用途：

- 给后台运营看本次改了什么
- 给内部审计看为什么发了新版本
- 后续若要提示老用户“协议更新”，可用作摘要提示

建议：

- 发布时要求后台至少填 `summary`
- `changeNotes` 第一版可选

---

### 3.5 生效与时间字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `effectiveAt` | date | 是 | 协议生效时间 |
| `publishedAt` | date | 否 | 实际发布时间 |
| `archivedAt` | date | 否 | 归档时间 |
| `createdAt` | date | 是 | 创建时间 |
| `updatedAt` | date | 是 | 更新时间 |

建议规则：

- 草稿创建时写 `createdAt`
- 每次编辑草稿更新 `updatedAt`
- 发布时写 `publishedAt`
- 若有“延迟生效”需求，可把 `effectiveAt` 晚于 `publishedAt`

第一版如果不做延迟生效，也建议保留 `effectiveAt` 字段，避免后续再迁移。

---

### 3.6 完整性与审计辅助字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `hash` | string | 是 | 对发布正文生成的哈希值，建议 `sha256` |
| `previousVersion` | string | 否 | 上一个版本号 |
| `sourceDraftId` | string | 否 | 如采用草稿派生，可记录来源草稿 |
| `currentRevision` | number | 否 | 同一草稿的编辑修订次数 |
| `operatorId` | string | 否 | 最近一次发布操作人 |
| `updatedBy` | string | 否 | 最近一次修改人 |

`hash` 用途：

- 保证“同一版本正文”可校验
- 与 `agreementConsents.meta.hash` 对齐
- 后续若发生合规争议，可以证明用户同意的正文内容

建议：

- `hash` 只在发布时计算并固化
- 草稿阶段可以为空，或使用临时值

---

## 四、字段枚举建议

### 4.1 `docType`

第一版建议固定枚举：

- `privacy_policy`
- `user_agreement`

### 4.2 `status`

- `draft`
- `published`
- `archived`

### 4.3 `contentFormat`

第一版建议固定：

- `markdown`

如果后续升级可扩展：

- `richtext_json`
- `html`

---

## 五、索引建议

第一版建议至少建立这些索引：

1. 唯一索引：`docType + version`
   目的：
   防止同一协议类型重复创建同版本号

2. 普通索引：`docType + isCurrent`
   目的：
   快速查询当前生效版本

3. 普通索引：`docType + status + updatedAt`
   目的：
   后台列表页和历史版本页查询

4. 普通索引：`publishedAt`
   目的：
   历史发布时间排序

如果你们后续会频繁按 `effectiveAt` 检查生效版本，也可补：

5. 普通索引：`docType + effectiveAt`

---

## 六、推荐业务规则

### 6.1 草稿规则

- 草稿可多次编辑
- 草稿默认 `status = draft`
- 草稿默认 `isCurrent = false`
- 草稿不对前台开放

### 6.2 发布规则

发布时建议系统自动执行：

1. 校验 `docType / version / title / markdownSource` 完整
2. 生成 `htmlSnapshot`
3. 生成 `plainTextSnapshot`
4. 生成 `hash`
5. 将当前同 `docType` 的旧 `isCurrent = true` 版本改成 `false`
6. 把当前文档改成：
   - `status = published`
   - `isCurrent = true`
   - `publishedAt = now`
7. 写入 `adminAuditLogs`

### 6.3 修改规则

建议：

- 已发布版本不允许直接覆盖正文
- 如需修改，必须“复制当前版本 -> 生成新草稿 -> 发布新版本”

原因：

- 避免历史版本内容漂移
- 便于和 `agreementConsents` 的 `version + hash` 一一对应

### 6.4 重签规则

建议字段：

- `requiresReconsent`

含义：

- `true`：发布后需要老用户重新确认
- `false`：仅更新展示文案或轻微说明，不强制重签

适合设为 `true` 的场景：

- 数据用途变化
- 第三方共享范围变化
- 收费条款变化
- 权益规则变化
- 责任边界变化

---

## 七、与 `agreementConsents` 的配合方式

建议 `agreementConsents` 第一版继续沿用当前设计：

- `accountId`
- `agreementType`
- `version`
- `acceptedAt`
- `clientType`
- `meta`

建议把以下信息写入 `meta`：

```json
{
  "docType": "privacy_policy",
  "title": "隐私政策",
  "hash": "sha256:1e0d3d9a...",
  "sourcePage": "agreement-center",
  "triggerScene": "first_launch"
}
```

推荐映射关系：

- `agreementType = docType`
- `version = legalDocuments.version`
- `meta.hash = legalDocuments.hash`

这样用户同意记录就能和具体发布正文一一对应。

---

## 八、前台读取建议

前台最常用的读取方式应该只有两种：

### 8.1 读取当前生效协议列表

适用于：

- “我的 -> 协议中心”
- 登录前协议提示
- 手机号绑定页

返回建议：

```json
{
  "documents": [
    {
      "docType": "privacy_policy",
      "title": "隐私政策",
      "version": "2026-06-03-v1",
      "effectiveAt": "2026-06-05T00:00:00.000Z",
      "requiresReconsent": true
    },
    {
      "docType": "user_agreement",
      "title": "用户服务协议",
      "version": "2026-06-03-v1",
      "effectiveAt": "2026-06-05T00:00:00.000Z",
      "requiresReconsent": true
    }
  ]
}
```

### 8.2 读取某一份协议正文

适用于：

- 打开协议详情页

返回建议：

```json
{
  "docType": "privacy_policy",
  "title": "隐私政策",
  "version": "2026-06-03-v1",
  "htmlSnapshot": "<h1>隐私政策</h1>...",
  "effectiveAt": "2026-06-05T00:00:00.000Z",
  "publishedAt": "2026-06-03T10:00:00.000Z"
}
```

---

## 九、第一版不建议做的事

以下能力建议先不要塞进第一版：

- 一个集合同时混存“草稿模板、发布版本、外部公告、FAQ”
- 只存 HTML 不存原始 Markdown
- 允许后台直接修改已发布正文
- 不做 `version`，只保留“当前协议正文”
- 不做 `hash`，导致留痕与正文无法严格对齐

---

## 十、推荐第一版最小可用范围

第一版最小可用建议如下：

1. 集合 `legalDocuments`
2. 支持两类协议：
   - `privacy_policy`
   - `user_agreement`
3. 支持三种状态：
   - `draft`
   - `published`
   - `archived`
4. 支持 Markdown 编辑
5. 支持发布时生成 HTML 快照和 `hash`
6. 支持同一 `docType` 只有一个当前版本
7. 小程序可读取当前版本并展示
8. 用户同意后写 `agreementConsents`

做到这 8 条，已经够支撑当前提审与正式商用的基础合规能力。

---

## 十一、后续可扩展方向

如果第一版跑稳，后续可以再加：

- 协议版本 diff 对比
- 多语言协议
- H5 对外公开协议页
- 自动生成“协议更新提示摘要”
- 后台富文本编辑器
- “当前用户是否已同意最新版本”的后台视图
- 注销、删除、导出、申诉等合规链路联动
