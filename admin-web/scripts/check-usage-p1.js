#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const repoRoot = path.resolve(__dirname, '..', '..')

const files = {
  html: path.join(repoRoot, 'admin-web', 'index.html'),
  css: path.join(repoRoot, 'admin-web', 'styles.css'),
  appJs: path.join(repoRoot, 'admin-web', 'app.js'),
  cfGet: path.join(repoRoot, 'cloudfunctions', 'adminGetAiModelConfig', 'index.js'),
  cfUpdate: path.join(repoRoot, 'cloudfunctions', 'adminUpdateAiModelConfig', 'index.js'),
  doc: path.join(repoRoot, 'docs', 'P1后台运营控制增强验收清单.md')
}

const results = []

function pushResult(ok, label, detail = '') {
  results.push({ ok, label, detail })
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function checkExists(filePath, label) {
  const ok = fs.existsSync(filePath)
  pushResult(ok, label, ok ? filePath : 'file not found')
}

function checkSyntax(filePath, label) {
  const proc = spawnSync(process.execPath, ['--check', filePath], {
    encoding: 'utf8'
  })
  const ok = proc.status === 0
  const detail = ok
    ? 'syntax ok'
    : `${proc.stderr || proc.stdout || 'syntax check failed'}`.trim()
  pushResult(ok, label, detail)
}

function checkPattern(filePath, pattern, label) {
  const text = readText(filePath)
  const ok = pattern.test(text)
  pushResult(ok, label, ok ? 'matched' : `missing pattern ${pattern}`)
}

function section(title) {
  console.log(`\n# ${title}`)
}

function printResults() {
  let passed = 0
  let failed = 0

  results.forEach((item) => {
    if (item.ok) {
      passed += 1
      console.log(`[PASS] ${item.label}`)
      return
    }
    failed += 1
    console.log(`[FAIL] ${item.label}`)
    if (item.detail) {
      console.log(`       ${item.detail}`)
    }
  })

  console.log('\nSummary')
  console.log(`- passed: ${passed}`)
  console.log(`- failed: ${failed}`)
  console.log('- scope: admin-web P1 static regression only')
  console.log('- note: this script does not replace browser/manual verification')

  process.exitCode = failed > 0 ? 1 : 0
}

section('File Presence')
checkExists(files.html, 'usage 页面 HTML 存在')
checkExists(files.css, 'usage 页面样式文件存在')
checkExists(files.appJs, 'usage 页面脚本存在')
checkExists(files.cfGet, 'adminGetAiModelConfig 云函数存在')
checkExists(files.cfUpdate, 'adminUpdateAiModelConfig 云函数存在')
checkExists(files.doc, 'P1 验收清单文档存在')

section('Syntax Checks')
checkSyntax(files.appJs, 'admin-web/app.js 语法通过')
checkSyntax(files.cfGet, 'adminGetAiModelConfig/index.js 语法通过')
checkSyntax(files.cfUpdate, 'adminUpdateAiModelConfig/index.js 语法通过')

section('Usage View Markers')
checkPattern(files.html, /id="billingNavGroup"/, '额度与订阅左侧二级菜单分组已接入')
checkPattern(files.html, /id="billingOverviewView"/, '额度与订阅总览视图已接入')
checkPattern(files.html, /id="billingGlobalUsageView"/, '全局流水视图已接入')
checkPattern(files.html, /id="billingAccountsView"/, '账户与流水视图已接入')
checkPattern(files.html, /id="billingPlansView"/, '商品目录视图已接入')
checkPattern(files.html, /data-global-usage-tab="ai_tokens"/, '全局流水包含 AI Token 页签')
checkPattern(files.html, /data-global-usage-tab="voice_seconds"/, '全局流水包含语音页签')
checkPattern(files.html, /id="globalUsageSearchInput"/, '全局流水关键词筛选控件已接入')
checkPattern(files.html, /id="globalUsageSourceSummaryWrap"/, '全局流水来源场景容器已接入')
checkPattern(files.html, /id="globalUsageLedgerWrap"/, '全局流水明细容器已接入')
checkPattern(files.html, /id="usageSourceFilterSelect"/, 'usage 场景筛选控件已接入')
checkPattern(files.html, /id="usageProviderFilterInput"/, 'usage 供应商筛选控件已接入')
checkPattern(files.html, /id="usageModelFilterInput"/, 'usage 模型筛选控件已接入')
checkPattern(files.html, /id="usageAlertsWrap"/, '低余额预警容器已接入')
checkPattern(files.html, /id="usageProviderSummaryWrap"/, '供应商维度容器已接入')
checkPattern(files.html, /id="usageModelSummaryWrap"/, '模型维度容器已接入')
checkPattern(files.html, /id="usageAnomalyWrap"/, '异常高消耗容器已接入')

section('Usage Logic Markers')
checkPattern(files.appJs, /const BILLING_VIEW_KEYS = \['billingOverview', 'billingGlobalUsage', 'billingAccounts', 'billingPlans'\]/, '额度与订阅子视图常量已定义')
checkPattern(files.appJs, /function isBillingView\(/, '已实现额度与订阅子视图判断 helper')
checkPattern(files.appJs, /sidebarGroups:\s*\{\s*billing:\s*false/s, '侧边栏二级菜单展开状态已入 state')
checkPattern(files.appJs, /usageProviderFilter:\s*''/, 'usage 状态包含供应商筛选')
checkPattern(files.appJs, /usageModelFilter:\s*''/, 'usage 状态包含模型筛选')
checkPattern(files.appJs, /usageBalanceAlertFilter:\s*'all'/, 'usage 状态包含低余额预警筛选')
checkPattern(files.appJs, /globalUsageTab:\s*'ai_tokens'/, '全局流水状态包含当前页签')
checkPattern(files.appJs, /globalUsageProviderFilter:\s*''/, '全局流水状态包含供应商筛选')
checkPattern(files.appJs, /globalUsageModelFilter:\s*''/, '全局流水状态包含模型筛选')
checkPattern(files.appJs, /function buildUsageProviderStats\(/, '已实现供应商统计 helper')
checkPattern(files.appJs, /function buildUsageModelStats\(/, '已实现模型统计 helper')
checkPattern(files.appJs, /function buildUsageDimensionStats\(/, '已实现全局流水维度聚合 helper')
checkPattern(files.appJs, /function matchesGlobalUsageKeyword\(/, '已实现全局流水关键词匹配 helper')
checkPattern(files.appJs, /function matchesUsageProviderModel\(/, '已实现 provider\/model 匹配 helper')
checkPattern(files.appJs, /function renderUsage\(/, '已实现 usage 主渲染逻辑')
checkPattern(files.appJs, /function renderGlobalUsage\(/, '已实现全局流水主渲染逻辑')
checkPattern(files.appJs, /function buildUsageDetailMarkup\(/, '已实现 usage 详情渲染逻辑')
checkPattern(files.appJs, /\.filter\(\(item\) => matchesUsageProviderModel\(item, state\.usageProviderFilter, state\.usageModelFilter\)\)/, '右侧流水详情口径已对齐 provider\/model 筛选')
checkPattern(files.appJs, /data-usage-model=.*data-usage-provider=/, '模型卡片已绑定 provider+model 组合过滤')
checkPattern(files.appJs, /billingNavGroup\.classList\.toggle\('is-expanded', billingExpanded\)/, '左侧额度与订阅二级菜单展开态已接入')
checkPattern(files.appJs, /document\.querySelectorAll\('\.nav-subitem'\)/, '额度与订阅二级菜单点击事件已接入')
checkPattern(files.appJs, /document\.getElementById\('usageProviderFilterInput'\)\.addEventListener\('input'/, '供应商输入筛选事件已绑定')
checkPattern(files.appJs, /document\.getElementById\('usageModelFilterInput'\)\.addEventListener\('input'/, '模型输入筛选事件已绑定')
checkPattern(files.appJs, /document\.getElementById\('globalUsageProviderFilterInput'\)\.addEventListener\('input'/, '全局流水供应商筛选事件已绑定')
checkPattern(files.appJs, /document\.getElementById\('globalUsageModelFilterInput'\)\.addEventListener\('input'/, '全局流水模型筛选事件已绑定')
checkPattern(files.appJs, /document\.querySelectorAll\('\[data-global-usage-tab\]'\)/, '全局流水页签点击事件已接入')
checkPattern(files.appJs, /resetUsageFilters\(/, 'usage 重置筛选能力存在')
checkPattern(files.appJs, /resetGlobalUsageFilters\(/, '全局流水重置筛选能力存在')

section('AI Config Markers')
checkPattern(files.appJs, /function resolveModelPricingEditorRows\(/, '已实现模型倍率编辑行解析')
checkPattern(files.appJs, /function readModelPricingRows\(/, '已实现模型倍率行读取逻辑')
checkPattern(files.appJs, /data-ai-provider-model-pricing-multiplier/, '供应商配置卡片支持倍率输入框编辑')
checkPattern(files.appJs, /aiConfigTab:\s*'providers'/, 'AI 配置页签状态存在')
checkPattern(files.appJs, /data-ai-config-tab="providers"/, 'AI 配置包含供应商页签')
checkPattern(files.appJs, /data-ai-config-tab="routing"/, 'AI 配置包含路由页签')

section('Cloud Function Markers')
checkPattern(files.cfGet, /quotaPolicy:\s*'local_quota'/, '读取云函数包含 quotaPolicy 默认值')
checkPattern(files.cfGet, /modelPricing:/, '读取云函数包含 modelPricing 输出')
checkPattern(files.cfGet, /sanitizeProvidersForOutput/, '读取云函数会脱敏输出 provider 配置')
checkPattern(files.cfUpdate, /modelPricing:/, '保存云函数包含 modelPricing 入库逻辑')
checkPattern(files.cfUpdate, /Number\.isFinite\(multiplier\)/, '保存云函数校验倍率必须为正数')
checkPattern(files.cfUpdate, /appendAuditLog/, '保存云函数保留审计日志')

printResults()
