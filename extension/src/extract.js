// Injected into the active tab on toolbar-icon click. Extracts the page's
// readable content and reports it back to the service worker. Runs once,
// standalone — not a persistent content script.
import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

// Raised from 50k: on a long technical chat (lots of code/output pasted back
// and forth) that cap was routinely hit well before the end of the
// conversation, silently dropping everything after it.
const MAX_CHARS = 200000

function makeTurndown() {
  const turndown = new TurndownService({ codeBlockStyle: 'fenced' })
  // Tables, strikethrough, task lists — the app's renderer (remark-gfm) reads
  // this same dialect, so this is what makes an imported table look like a
  // table instead of flattened prose.
  turndown.use(gfm)
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
  // Turndown's built-in fenced-code rule only fires when a <pre>'s DIRECT
  // child is <code> and reads the language off *that* code element's class.
  // Neither claude.ai nor chatgpt.com renders that plainly: both wrap the
  // code in several layers of syntax-highlighting chrome (a header bar with
  // the language name + copy button, then the code somewhere inside), so the
  // built-in rule never matches and the block would fall through as
  // unstructured text. Added after `.use(gfm)` so it takes precedence over
  // that plugin's own code-block rule too.
  turndown.addRule('codeBlock', {
    filter: (node) => node.nodeName === 'PRE' && !!node.querySelector('code'),
    replacement(content, node) {
      const code = node.querySelector('code')
      let language = (code.className.match(/language-(\S+)/) || [null, ''])[1]
      if (!language) {
        // No language class (chatgpt.com's <code> has none) — the language
        // name is rendered as its own plain-text label in that header bar,
        // which is always the first non-empty text encountered walking the
        // block *before* reaching the code itself.
        const walker = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_TEXT)
        let textNode
        while ((textNode = walker.nextNode())) {
          if (code.contains(textNode)) break
          const t = textNode.textContent.trim()
          if (t) {
            language = t.toLowerCase()
            break
          }
        }
      }
      const codeText = code.textContent.replace(/\n$/, '')
      return `\n\n\`\`\`${language || ''}\n${codeText}\n\`\`\`\n\n`
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

// Converts one conversation turn to markdown via turndown rather than
// innerText: innerText collapses everything to plain lines, which loses code
// fences, tables, bold/italic, and list structure entirely — exactly the
// "why doesn't this render like the original" complaint. Operating on a
// *cloned* subtree (rather than the live node, as the old innerText approach
// needed for correct line-break layout) is safe here because turndown reads
// DOM structure, not rendered layout, so a detached clone converts exactly
// the same as the attached original.
function turnToMarkdown(turnEl) {
  const clone = turnEl.cloneNode(true)
  // Accessibility-only elements: screen-reader headings and the "You said: …"
  // / "Claude responded: …" echo of the message used for a11y announcements.
  // Never visible to a sighted user reading the page, so they don't belong
  // in a "print it as it looks" export either.
  clone.querySelectorAll('.sr-only').forEach((el) => el.remove())
  // Hover-reveal action-bar row (timestamp + copy/retry/etc. buttons) —
  // invisible until hover, but still real DOM text turndown would otherwise
  // pick up. No-op on chatgpt.com, whose action bar lives outside the turn
  // node entirely.
  clone.querySelectorAll('[class*="opacity-0"]').forEach((el) => el.remove())
  // claude.ai's code-block language label ("bash") sits in its own header
  // <div>, a sibling *before* the <pre>'s parent — not nested inside the
  // <pre> the way chatgpt.com's is (where the codeBlock rule in makeTurndown
  // already picks the language out of it). Left alone, turndown treats that
  // header as ordinary prose and prints "bash" as its own line above the
  // code block, duplicating the language tag the fence already carries.
  // No-op on chatgpt.com, where this sibling doesn't exist.
  clone.querySelectorAll('pre').forEach((pre) => {
    pre.parentElement?.previousElementSibling?.remove()
  })
  // Images: turndown's default rule would emit `![alt](src)`, but claude.ai
  // and chatgpt.com serve these from session-scoped blob:/signed URLs this
  // app can never resolve — that markdown would just render as a permanently
  // broken image icon. Drop the image rather than show that; the caption or
  // surrounding text (if any) still comes through fine on its own.
  clone.querySelectorAll('img').forEach((el) => el.remove())
  // Math (KaTeX, used by both sites): what's actually visible on the page is
  // dozens of tiny per-glyph spans with no real word boundaries — reading
  // that as text produces unreadable symbol soup, not a formula. The clean
  // LaTeX source does sit alongside it in a screen-reader-only annotation,
  // but this app has no LaTeX renderer to display it properly either, so the
  // honest option is to drop the formula rather than show broken math.
  clone.querySelectorAll('.katex, math').forEach((el) => el.remove())
  return stripIconGlyphs(cleanMarkdown(makeTurndown().turndown(clone.innerHTML)))
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
      const content = turnToMarkdown(turn)
      return content ? { role: isUser ? 'user' : 'assistant', content } : null
    })
    .filter(Boolean)

  return result.length ? result : null
}

// ChatGPT tags every turn directly with `data-message-author-role`, in
// document order — no ancestor-climbing needed like the claude.ai extractor.
// Readability instead scores the page as a single "article" and was landing
// on just the last message block, dropping the rest of the conversation.
function extractChatGptConversation() {
  const nodes = document.querySelectorAll('[data-message-author-role]')
  if (nodes.length === 0) return null
  const result = Array.from(nodes)
    .map((node) => {
      const role = node.getAttribute('data-message-author-role')
      if (role !== 'user' && role !== 'assistant') return null // skip system/tool turns
      const content = turnToMarkdown(node)
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
      if (turns) return { title: document.title || '', turns }
    }
    if (/(^|\.)chatgpt\.com$/.test(host) || /(^|\.)chat\.openai\.com$/.test(host)) {
      const turns = extractChatGptConversation()
      if (turns) return { title: document.title || '', turns }
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
