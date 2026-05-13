function padTime(value) {
  return `${Math.max(0, Math.floor(Number(value) || 0))}`.padStart(2, '0')
}

function formatVoiceRecordingElapsed(seconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0))
  const minutes = Math.floor(totalSeconds / 60)
  const currentSeconds = totalSeconds % 60
  return `${padTime(minutes)}:${padTime(currentSeconds)}`
}

function stopVoiceRecordingTicker(page, timerKey, dataField) {
  if (!page || !timerKey || !dataField) {
    return
  }

  if (page[timerKey]) {
    clearInterval(page[timerKey])
    page[timerKey] = null
  }

  if (typeof page.setData === 'function') {
    page.setData({
      [dataField]: ''
    })
  }
}

function startVoiceRecordingTicker(page, timerKey, dataField) {
  if (!page || !timerKey || !dataField) {
    return
  }

  stopVoiceRecordingTicker(page, timerKey, dataField)
  const startedAt = Date.now()

  if (typeof page.setData === 'function') {
    page.setData({
      [dataField]: formatVoiceRecordingElapsed(0)
    })
  }

  page[timerKey] = setInterval(() => {
    if (typeof page.setData !== 'function') {
      return
    }

    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000)
    page.setData({
      [dataField]: formatVoiceRecordingElapsed(elapsedSeconds)
    })
  }, 500)
}

module.exports = {
  formatVoiceRecordingElapsed,
  startVoiceRecordingTicker,
  stopVoiceRecordingTicker
}
