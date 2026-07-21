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
// Returns turns as `{ role, content }` (not a flattened string): the app
// imports each turn as a real message so an imported chat renders — and
// continues — exactly like one composed natively in Skillmaxx.
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

  const result = turns
    .map((turn) => {
      const isUser = !!turn.querySelector('[data-testid="user-message"]')
      // Each turn has a hover-reveal action-bar row (timestamp + copy/retry/
      // etc. buttons) — invisible until hover via `opacity-0 group-hover:
      // opacity-100`, but still real text as far as innerText is concerned.
      // Hide it (not clone-and-strip: innerText needs the node attached with
      // real layout to compute line breaks correctly) just long enough to
      // read innerText without it, then restore — synchronous, so nothing
      // ever paints in between.
      const hoverEls = turn.querySelectorAll('[class*="opacity-0"]')
      const prevDisplay = Array.from(hoverEls).map((el) => el.style.display)
      hoverEls.forEach((el) => { el.style.display = 'none' })
      const rawText = turn.innerText || ''
      hoverEls.forEach((el, i) => { el.style.display = prevDisplay[i] })

      const paragraphs = rawText
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
      return text ? { role: isUser ? 'user' : 'assistant', content: text } : null
    })
    .filter(Boolean)

  return result.length ? result : null
}

// ChatGPT tags every turn directly with `data-message-author-role`, in
// document order, with no hover-only action-bar noise baked into its
// innerText — no ancestor-climbing needed like the claude.ai extractor.
// Readability instead scores the page as a single "article" and was landing
// on just the last message block, dropping the rest of the conversation.
function extractChatGptConversation() {
  const nodes = document.querySelectorAll('[data-message-author-role]')
  if (nodes.length === 0) return null
  const result = Array.from(nodes)
    .map((node) => {
      const role = node.getAttribute('data-message-author-role')
      if (role !== 'user' && role !== 'assistant') return null // skip system/tool turns
      const content = (node.innerText || '').trim()
      return content ? { role, content } : null
    })
    .filter(Boolean)
  return result.length ? result : null
}

function extract() {
  try {
    const host = location.hostname
    if (/(^|\.)claude\.ai$/.test(host)) {
      const turns = extractClaudeConversation()
      if (turns) {
        return {
          title: document.title || '',
          turns: turns.map((t) => ({ role: t.role, content: stripIconGlyphs(t.content) })),
        }
      }
    }
    if (/(^|\.)chatgpt\.com$/.test(host) || /(^|\.)chat\.openai\.com$/.test(host)) {
      const turns = extractChatGptConversation()
      if (turns) {
        return {
          title: document.title || '',
          turns: turns.map((t) => ({ role: t.role, content: stripIconGlyphs(t.content) })),
        }
      }
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

const { title, markdown, turns } = extract()
// Cap total exported size the same way for both shapes: keep the earliest
// content and drop whatever falls past the budget, rather than truncating
// mid-message.
let cappedTurns
if (turns) {
  cappedTurns = []
  let total = 0
  for (const t of turns) {
    if (total + t.content.length > MAX_CHARS) break
    cappedTurns.push(t)
    total += t.content.length
  }
}
chrome.runtime.sendMessage({
  type: 'skillmaxx:extracted',
  title,
  url: location.href,
  content: markdown ? markdown.slice(0, MAX_CHARS) : undefined,
  turns: cappedTurns,
})
