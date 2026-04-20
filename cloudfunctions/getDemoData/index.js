const cloud = require('wx-server-sdk')
const fixtures = require('./fixtures')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const scope = event.scope || 'dashboard'

  return {
    ok: true,
    scope,
    data: fixtures[scope] || null
  }
}
