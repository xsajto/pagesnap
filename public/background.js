chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'FETCH_CSS') {
    return false
  }

  const url = message.url
  if (!url || typeof url !== 'string') {
    sendResponse({ ok: false, error: 'Invalid URL' })
    return false
  }

  ;(async () => {
    try {
      const response = await fetch(url, { credentials: 'include' })
      if (!response.ok) {
        sendResponse({ ok: false, error: `HTTP ${response.status}` })
        return
      }
      const text = await response.text()
      sendResponse({ ok: true, text })
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Unknown fetch error'
      sendResponse({ ok: false, error: messageText })
    }
  })()

  return true
})
