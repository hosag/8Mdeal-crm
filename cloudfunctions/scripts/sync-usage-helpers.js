const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')

const syncMap = [
  {
    template: path.join(rootDir, '_shared_templates', 'aiUsageHelper.js'),
    targets: [
      path.join(rootDir, 'resolveQuickEntryProject', 'usageHelper.js'),
      path.join(rootDir, 'summarizeFollowUp', 'usageHelper.js'),
      path.join(rootDir, 'suggestNextFollowUp', 'usageHelper.js'),
      path.join(rootDir, 'judgeProject', 'usageHelper.js'),
      path.join(rootDir, 'reviewClosedProject', 'usageHelper.js'),
      path.join(rootDir, 'wakeDormantProject', 'usageHelper.js'),
      path.join(rootDir, 'generateShareBrief', 'usageHelper.js')
    ]
  },
  {
    template: path.join(rootDir, '_shared_templates', 'voiceUsageHelper.js'),
    targets: [
      path.join(rootDir, 'speechToText', 'usageHelper.js')
    ]
  }
]

function ensureTemplateExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`模板文件不存在: ${filePath}`)
  }
}

function copyTemplate(templatePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.copyFileSync(templatePath, targetPath)
  console.log(`[sync-usage-helpers] ${path.relative(rootDir, targetPath)}`)
}

function main() {
  syncMap.forEach((entry) => {
    ensureTemplateExists(entry.template)
    entry.targets.forEach((targetPath) => {
      copyTemplate(entry.template, targetPath)
    })
  })
  console.log('[sync-usage-helpers] done')
}

main()
