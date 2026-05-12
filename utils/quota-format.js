function toSafeNumber(value) {
  const current = Number(value)
  return Number.isFinite(current) ? Math.max(0, current) : 0
}

function formatInteger(value) {
  return Math.round(toSafeNumber(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function formatAiQuotaValue(value, options = {}) {
  const current = formatInteger(value)
  const withUnit = options && options.withUnit === false ? false : true
  const unit = String(options && options.unit || '额度').trim() || '额度'
  return withUnit ? `${current} ${unit}` : current
}

function formatAiQuotaRange(remaining, total, options = {}) {
  const unit = String(options && options.unit || '额度').trim() || '额度'
  return `${formatInteger(remaining)} / ${formatInteger(total)} ${unit}`
}

module.exports = {
  formatInteger,
  formatAiQuotaValue,
  formatAiQuotaRange
}
