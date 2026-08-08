// Service worker: orchestrates the "send this page to GPT Lens" flow.
// Clicking the toolbar icon injects extract.js into the active tab; once it
// reports back with the page's content, we stash it in extension storage
// and focus (or open) the GPT Lens app tab. bridge.js, running only on
// that tab, picks the stash up and delivers it into the page.
const APP_URL = 'http://localhost:5173'

// Badge feedback is global (not per-tab) — it reflects the state of the
// background capture/deliver operation, not anything about the page itself,
// and clears itself shortly after each attempt finishes.
function setBadge(text, color) {
  chrome.action.setBadgeText({ text })
  if (color) chrome.action.setBadgeBackgroundColor({ color })
}
function clearBadgeSoon(delayMs) {
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), delayMs)
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url?.startsWith('http')) {
    setBadge('!', '#d33')
    clearBadgeSoon(2500)
    return
  }
  setBadge('•', '#888')
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['extract.js'] })
  } catch (err) {
    console.error('gpt-lens: extraction failed', err)
    setBadge('!', '#d33')
    clearBadgeSoon(2500)
  }
})

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'gpt-lens:extracted') return
  const { title, url, content, turns } = message
  chrome.storage.local.set({ pendingImport: { title, url, content, turns } }, async () => {
    try {
      await deliverToAppTab()
      setBadge('✓', '#2a2')
      clearBadgeSoon(1500)
    } catch (err) {
      console.error('gpt-lens: delivery failed', err)
      setBadge('!', '#d33')
      clearBadgeSoon(2500)
    }
  })
})

async function deliverToAppTab() {
  const tabs = await chrome.tabs.query({ url: `${APP_URL}/*` })
  if (tabs.length > 0) {
    const tab = tabs[0]
    await chrome.tabs.update(tab.id, { active: true })
    if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true })
  } else {
    await chrome.tabs.create({ url: APP_URL })
  }
}
