// Runs only on the Skillmaxx app tab (see manifest.json content_scripts
// match). Relays a page import stashed by the background worker in
// extension storage into the page itself, where App.jsx is listening.
function deliver(payload) {
  if (!payload) return
  window.postMessage(
    { source: 'skillmaxx-extension', type: 'import', payload },
    window.location.origin
  )
}

// Covers the "tab just opened for this import" case: the stash was written
// before the tab existed, so it's already there by the time we run.
chrome.storage.local.get('pendingImport', ({ pendingImport }) => {
  if (!pendingImport) return
  deliver(pendingImport)
  chrome.storage.local.remove('pendingImport')
})

// Covers the "tab was already open" case: the stash is written after this
// script already ran, so we catch it via the storage change instead.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.pendingImport?.newValue) return
  deliver(changes.pendingImport.newValue)
  chrome.storage.local.remove('pendingImport')
})
