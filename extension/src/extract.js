// Injected into the active tab on toolbar-icon click. Extracts the page's
// readable content and reports it back to the service worker. Runs once,
// standalone — not a persistent content script.
import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'

const MAX_CHARS = 50000

function extract() {
  try {
    const clone = document.cloneNode(true)
    const article = new Readability(clone).parse()
    const turndown = new TurndownService()
    const markdown = article?.content
      ? turndown.turndown(article.content)
      : document.body.innerText || ''
    return { title: article?.title || document.title || '', markdown }
  } catch {
    return { title: document.title || '', markdown: document.body.innerText || '' }
  }
}

const { title, markdown } = extract()
chrome.runtime.sendMessage({
  type: 'skillmaxx:extracted',
  title,
  url: location.href,
  content: markdown.slice(0, MAX_CHARS),
})
