const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async () => {
  const now = new Date()
  const pending = await db.collection('notifications').where({
    isSent: false,
    notifyTime: _.lte(now)
  }).get()

  await Promise.all(
    pending.data.map((item) =>
      db.collection('notifications').doc(item._id).update({
        data: {
          isSent: true,
          sentAt: now,
          updatedAt: now
        }
      })
    )
  )

  return {
    ok: true,
    processed: pending.data.length
  }
}
