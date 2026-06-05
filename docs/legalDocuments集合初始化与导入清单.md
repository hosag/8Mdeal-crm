# `legalDocuments` 集合初始化与导入清单

这份清单用于把协议中心补齐到“后台可维护、小程序可查看、用户可留痕”的可提审状态。

当前仓库里已经有三条链路会直接读取或写入这套数据：

1. 后台协议中心：
   - [adminListLegalDocuments](/Users/shaominhe/8Mdeal-crm/cloudfunctions/adminListLegalDocuments/index.js)
   - [adminGetLegalDocumentDetail](/Users/shaominhe/8Mdeal-crm/cloudfunctions/adminGetLegalDocumentDetail/index.js)
   - [adminUpsertLegalDocumentDraft](/Users/shaominhe/8Mdeal-crm/cloudfunctions/adminUpsertLegalDocumentDraft/index.js)
   - [adminPublishLegalDocument](/Users/shaominhe/8Mdeal-crm/cloudfunctions/adminPublishLegalDocument/index.js)
2. 小程序查看协议：
   - [getCurrentLegalDocuments](/Users/shaominhe/8Mdeal-crm/cloudfunctions/getCurrentLegalDocuments/index.js)
   - [getLegalDocumentDetail](/Users/shaominhe/8Mdeal-crm/cloudfunctions/getLegalDocumentDetail/index.js)
3. 用户同意留痕：
   - [saveAgreementConsent](/Users/shaominhe/8Mdeal-crm/cloudfunctions/saveAgreementConsent/index.js)

如果 `legalDocuments` 为空：

- 小程序“协议中心”会提示当前还没有可展示的正式协议
- 用户无法对当前正式版本写入同意留痕
- 提审时很难给出稳定、可复查的协议版本口径

所以现在建议直接导入首版正式协议，再补索引和云函数部署。

## 推荐做法

第一版直接导入仓库里的种子文件。

如果你用的是腾讯云开发控制台数据库导入，优先使用这个文件：

- [legalDocuments.seed.cloudbase.json](/Users/shaominhe/8Mdeal-crm/docs/seeds/legalDocuments.seed.cloudbase.json)

这个文件虽然是 `.json` 扩展名，但内容是 CloudBase 常用的“每行一条 JSON 对象”格式。

如果你用的是支持标准 JSON 数组的工具，再使用这个文件：

- [legalDocuments.seed.json](/Users/shaominhe/8Mdeal-crm/docs/seeds/legalDocuments.seed.json)

## 首版建议导入内容

当前建议至少导入 2 条已发布正式版本：

1. `privacy_policy` -> `v1.0.0`
2. `user_agreement` -> `v1.0.0`

这两条已经足够支撑提审阶段的“查看入口 + 正式正文 + 同意留痕”要求。

## 导入步骤

### 方案 A：云开发控制台导入

1. 打开腾讯云开发控制台，进入环境 `cloud1-8g5sii8ve777802e`
2. 进入数据库
3. 新建集合 `legalDocuments`
4. 选择“导入数据”
5. 导入文件 [legalDocuments.seed.cloudbase.json](/Users/shaominhe/8Mdeal-crm/docs/seeds/legalDocuments.seed.cloudbase.json)
6. 第一轮优先选择“新增”
7. 导入完成后，确认集合里至少有 2 条正式发布记录

### 方案 B：后台协议中心手动创建

如果你不想直接导入种子，也可以：

1. 先创建空集合 `legalDocuments`
2. 部署协议中心相关云函数
3. 通过 `admin-web` 的“协议中心”新建草稿
4. 再点击发布

这个方案更接近长期使用方式，但提审前速度会慢一些。

## 必建索引

第一版建议至少建下面 5 个：

1. 唯一索引：`docType + version`
2. 普通索引：`docType + isCurrent`
3. 普通索引：`docType + status + updatedAt`
4. 普通索引：`publishedAt`
5. 普通索引：`docType + effectiveAt`

如果你当前控制台时间很紧，最少也要先把下面两个建起来：

1. `docType + version`
2. `docType + isCurrent`

## 关联集合检查

`agreementConsents` 不需要额外导入种子，但建议确认至少已有下面两个索引：

1. 普通索引：`accountId + agreementType`
2. 普通索引：`acceptedAt`

这样小程序记录用户同意留痕时，不会把后续查账和排查搞得很被动。

## 需要重新部署的云函数

协议中心这一轮至少重新上传并部署下面 9 个函数：

1. `adminListLegalDocuments`
2. `adminGetLegalDocumentDetail`
3. `adminUpsertLegalDocumentDraft`
4. `adminPreviewLegalDocument`
5. `adminPublishLegalDocument`
6. `adminCloneLegalDocumentDraft`
7. `getCurrentLegalDocuments`
8. `getLegalDocumentDetail`
9. `saveAgreementConsent`

部署方式建议统一使用：

1. 右键云函数目录
2. 选择“上传并部署：云端安装依赖”
3. 等待部署完成

## 导入后检查

至少检查下面这些字段是否存在且值正确：

- `docId`
- `docType`
- `title`
- `version`
- `status`
- `isCurrent`
- `contentFormat`
- `markdownSource`
- `htmlSnapshot`
- `summary`
- `requiresReconsent`
- `effectiveAt`
- `publishedAt`
- `hash`

尤其注意：

- 两条记录的 `status` 都必须是 `published`
- 两条记录的 `isCurrent` 都必须是 `true`
- `htmlSnapshot` 不能为空，否则小程序详情页会没有正文
- `hash` 不能为空，否则同意留痕里的 `meta.hash` 无法和正式版本对齐

## 导入完成后的验证

### 1. 后台协议中心验证

启动本地 bridge 和 `admin-web` 后，进入“协议中心”，预期：

- 能看到“隐私政策”
- 能看到“用户服务协议”
- 点进详情后能看到版本号和正文快照

### 2. 小程序协议中心验证

进入小程序：

1. 打开“我的”
2. 进入“隐私政策与协议”
3. 预期能看到 2 张协议卡片
4. 点进详情后能看到正文

### 3. 同意留痕验证

在协议详情页点击“已阅读并同意当前版本”，预期：

- 页面 toast 成功
- `agreementConsents` 新增或更新一条记录
- `agreementType` 与页面协议类型一致
- `version` 与当前正式版本一致
- `meta.hash` 与 `legalDocuments.hash` 一致

## 当前边界

这份清单只覆盖协议中心本身，不扩散到原有小程序业务流：

- 不改原有首页/项目/闪录的交互逻辑
- 不强制把旧页面改成“先同意再使用”
- 只补“可查看、可留痕、后台可维护”的最小提审能力
