const THEME_OPTIONS = [
  {
    key: 'deep_business',
    label: '深海商务',
    desc: '冷静克制，适合高频谈单与日常推进'
  },
  {
    key: 'warm_almond',
    label: '琥珀签章',
    desc: '温润稳重，适合轻商务与女性审美'
  },
  {
    key: 'misty_blossom',
    label: '樱雾轻盈',
    desc: '柔和轻快，适合更细腻的个人表达'
  },
  {
    key: 'festive_crimson',
    label: '节庆朱砂',
    desc: '红金节奏，适合节庆拜访与签约阶段'
  },
  {
    key: 'cloud_mist',
    label: '青禾暖杏',
    desc: '暖白轻商务，久看不累，也更显亲和'
  },
  {
    key: 'ink_readable',
    label: '墨竹易读',
    desc: '对比更强，久看更轻松'
  }
]
const THEME_KEYS = THEME_OPTIONS.map((item) => item.key)
const THEME_LABELS = THEME_OPTIONS.reduce((result, item) => {
  result[item.key] = item.label
  return result
}, {})
const FONT_SCALE_MODES = ['default', 'large', 'readable']

function getDefaultAppearanceSettings() {
  return {
    themeKey: 'deep_business',
    fontScaleMode: 'default',
    festivalThemeEnabled: false
  }
}

function normalizeThemeKey(value) {
  const current = String(value || '').trim()
  return THEME_KEYS.includes(current) ? current : 'deep_business'
}

function normalizeFontScaleMode(value) {
  const current = String(value || '').trim()
  return FONT_SCALE_MODES.includes(current) ? current : 'default'
}

function normalizeAppearanceSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const defaults = getDefaultAppearanceSettings()

  return {
    themeKey: normalizeThemeKey(source.themeKey || defaults.themeKey),
    fontScaleMode: normalizeFontScaleMode(source.fontScaleMode || defaults.fontScaleMode),
    festivalThemeEnabled: typeof source.festivalThemeEnabled === 'boolean'
      ? source.festivalThemeEnabled
      : defaults.festivalThemeEnabled
  }
}

function getAppearancePageClass(value) {
  const settings = normalizeAppearanceSettings(value)
  return `appearance-theme-${settings.themeKey} appearance-font-${settings.fontScaleMode}`
}

function applyAppearanceSettingsToApp(value) {
  const app = getApp()
  if (!app) {
    return normalizeAppearanceSettings(value)
  }

  const nextSettings = normalizeAppearanceSettings(value)
  if (!app.globalData) {
    app.globalData = {}
  }

  const currentVersion = Number(app.globalData.appearanceVersion || 0)
  app.globalData.appearanceSettings = nextSettings
  app.globalData.appearancePageClass = getAppearancePageClass(nextSettings)
  app.globalData.appearanceVersion = currentVersion + 1
  return nextSettings
}

function syncPageAppearance(page) {
  if (!page || typeof page.setData !== 'function') {
    return
  }

  const app = getApp()
  const currentSettings = normalizeAppearanceSettings(
    app && app.globalData ? app.globalData.appearanceSettings : null
  )
  const appearancePageClass = getAppearancePageClass(currentSettings)
  const update = {}

  if (page.data.appearancePageClass !== appearancePageClass) {
    update.appearancePageClass = appearancePageClass
  }

  if (!page.data.appearanceSettings
    || JSON.stringify(page.data.appearanceSettings) !== JSON.stringify(currentSettings)) {
    update.appearanceSettings = currentSettings
  }

  if (Object.keys(update).length) {
    page.setData(update)
  }
}

module.exports = {
  THEME_OPTIONS,
  THEME_LABELS,
  getDefaultAppearanceSettings,
  normalizeAppearanceSettings,
  getAppearancePageClass,
  applyAppearanceSettingsToApp,
  syncPageAppearance
}
