const cloudConfig = require('./config/cloud')
const { initCloud, getCloudStatus } = require('./services/runtime')

App({
  onLaunch() {
    const cloudReady = initCloud()
    const cloudStatus = getCloudStatus()

    this.globalData = {
      brandName: '成交 CRM',
      cloudReady,
      cloudStatus,
      cloudConfig,
      dataSourceLabel: cloudStatus.label,
      notificationSync: {
        version: 0,
        updatedAt: 0,
        reason: ''
      }
    }
  }
})
