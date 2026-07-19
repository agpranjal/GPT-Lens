// Injected into the active tab on toolbar-icon click. Extracts the page's
// readable content and reports it back to the service worker. Runs once,
// standalone — not a persistent content script.
import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'

// Raised from 50k: on a long technical chat (lots of code/output pasted back
// and forth) that cap was routinely hit well before the end of the
// conversation, silently dropping everything after it.
const MAX_CHARS = 200000

function makeTurndown() {
  const turndown = new TurndownService()
  // Default link rule emits the anchor's raw text content, newlines and all.
  // Real-world nav/card markup often wraps block-level or multi-line content
  // in a single <a>, which then breaks `[text](url)` across lines — an
  // inline link can't survive a hard line break, so the renderer just prints
  // the literal brackets instead of a link. Flattening to one line first
  // makes that structurally impossible, regardless of the source markup.
  turndown.addRule('flattenedLink', {
    filter: (node) => node.nodeName === 'A' && !!node.getAttribute('href'),
    replacement(content, node) {
      const href = node.getAttribute('href')
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
      if (!text) return content // e.g. an image-only link — leave as-is
      return `[${text}](${href})`
    },
  })
  return turndown
}

// Strip artifacts that are syntactically valid markdown but meaningless here:
// empty/decorative blockquote markers (from breadcrumb chevrons or spacer
// <blockquote> tags, which are real markdown blockquote syntax the moment
// they start a line, quote or not) and excess blank lines from stripped nodes.
function cleanMarkdown(md) {
  return md
    .replace(/^[ \t]*>[ \t]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Icon fonts (toolbar buttons, etc.) render via ligatures over Private Use
// Area codepoints — meaningless outside the page that has that font loaded,
// where they show up as tofu boxes. innerText picks them up because they're
// real (if invisible-until-hover) rendered text, not something CSS can hide
// from the DOM tree. Strip PUA codepoints from the BMP and both supplementary
// PUA planes, then collapse whatever stray whitespace that leaves behind.
const PUA_RANGES = '\\uE000-\\uF8FF\\u{F0000}-\\u{FFFFD}\\u{100000}-\\u{10FFFD}'
const PUA_GLYPH_RE = new RegExp('[' + PUA_RANGES + ']', 'gu')
function stripIconGlyphs(text) {
  return text
    .replace(PUA_GLYPH_RE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
}

// claude.ai renders every conversation turn as a `[data-testid="user-message"]`
// (human side) or a sibling block (Claude's side), all under one shared list
// container. Readability treats the whole page as a single scored "article",
// which happens to work for short chats but isn't something to rely on for
// long, code-heavy ones — walking the actual turn structure instead
// guarantees every turn makes it into the export.
function extractClaudeConversation() {
  const userMsgs = document.querySelectorAll('[data-testid="user-message"]')
  if (userMsgs.length === 0) return null

  // Finding the turn-list container works by climbing from an anchor until
  // it contains every anchor — which needs at least two anchors spread
  // across different turns to force the climb past same-turn wrapper divs
  // that also happen to have >1 child (e.g. an avatar+bubble split). A
  // single-question chat has only one `user-message`, so pair it with
  // `action-bar-retry` (present once per Claude turn, including the first)
  // to guarantee a second, independent anchor even then.
  const anchors = [...userMsgs, ...document.querySelectorAll('[data-testid="action-bar-retry"]')]

  let ancestor = anchors[0].parentElement
  while (ancestor && !anchors.every((el) => ancestor.contains(el))) {
    ancestor = ancestor.parentElement
  }
  if (!ancestor) return null

  // Each anchor node sits several levels inside its turn wrapper; climb from
  // it to the direct child of `ancestor` that contains it — that child is
  // one turn (user or assistant) among the turn siblings.
  function turnWrapperFor(node) {
    let el = node
    while (el.parentElement !== ancestor) el = el.parentElement
    return el
  }
  const turns = Array.from(ancestor.children)
  if (!turns.includes(turnWrapperFor(anchors[0])) || turns.length < userMsgs.length) return null

  const lines = turns
    .map((turn) => {
      const isUser = !!turn.querySelector('[data-testid="user-message"]')
      // innerText needs the node attached with real layout to compute line
      // breaks correctly, so read it straight off the live turn node — the
      // per-message toolbar's icon-font glyphs get filtered out later by
      // stripIconGlyphs instead of by removing those buttons here.
      const paragraphs = (turn.innerText || '')
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
      // The first paragraph is an accessibility-label echo ("You said: …" /
      // "Claude responded: …") that duplicates a (sometimes truncated)
      // prefix of the paragraph right after it — drop it when that holds,
      // keeping only the real message text.
      if (paragraphs.length > 1) {
        const label = paragraphs[0].replace(/^(you said|claude responded):\s*/i, '')
        const echoedPrefix = label.replace(/\.\.\.$/, '').slice(0, 30).toLowerCase()
        if (echoedPrefix && paragraphs[1].toLowerCase().startsWith(echoedPrefix)) paragraphs.shift()
      }
      const text = paragraphs.join('\n\n').trim()
      return text ? `**${isUser ? 'You' : 'Claude'}:** ${text}` : null
    })
    .filter(Boolean)

  return lines.length ? lines.join('\n\n---\n\n') : null
}

function extract() {
  try {
    if (/(^|\.)claude\.ai$/.test(location.hostname)) {
      const conversation = extractClaudeConversation()
      if (conversation) return { title: document.title || '', markdown: stripIconGlyphs(conversation) }
    }
    const clone = document.cloneNode(true)
    const article = new Readability(clone).parse()
    const markdown = article?.content
      ? cleanMarkdown(makeTurndown().turndown(article.content))
      : document.body.innerText || ''
    return { title: article?.title || document.title || '', markdown: stripIconGlyphs(markdown) }
  } catch {
    return { title: document.title || '', markdown: stripIconGlyphs(document.body.innerText || '') }
  }
}

const { title, markdown } = extract()
chrome.runtime.sendMessage({
  type: 'skillmaxx:extracted',
  title,
  url: location.href,
  content: markdown.slice(0, MAX_CHARS),
})
