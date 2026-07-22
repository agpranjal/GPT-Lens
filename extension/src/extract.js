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
  // Artifacts (claude.ai) and canvas files (chatgpt.com): these render as a
  // reference card/chip pointing at a side panel this app has no way to open
  // or fetch the content of. Showing the card's flattened text ("Hello world
  // PY Download") reads as broken UI, not a file. Drop the whole thing rather
  // than show that; this app doesn't process artifacts/canvas at all.
  clone.querySelectorAll('[class*="artifact-block"]').forEach((el) => el.remove())
  clone.querySelectorAll('button.behavior-btn').forEach((el) => el.closest('p, li, div')?.remove())
  // claude.ai's collapsible status pill — the "Thinking about …" / "Untangling
  // …" extended-thinking summary, or a "Presented file" tool-use recap — is a
  // live `aria-expanded` toggle (class `group/status`) sitting in its own pill
  // wrapper (whose class uses the `--msg-pill-py` CSS var), separate from the
  // actual reply. Collapsed, the pill is just the toggle button; but if the
  // user expanded it before importing, the full reasoning/tool body is a
  // sibling of the button *inside that same pill*, so removing only the button
  // would leak the entire chain-of-thought into the chat as plain prose.
  // Remove the whole pill — but only pills that actually contain a status
  // toggle, never ordinary message content — then drop any stray toggle that
  // wasn't wrapped in a recognizable pill.
  clone.querySelectorAll('[class*="msg-pill-py"]').forEach((pill) => {
    if (pill.querySelector('[class*="group/status"]')) pill.remove()
  })
  clone.querySelectorAll('[class*="group/status"]').forEach((el) => el.remove())
  // Math (KaTeX, used by both sites): what's actually visible on the page is
  // dozens of tiny per-glyph spans with no real word boundaries — reading
  // that as text produces unreadable symbol soup, not a formula. The clean
  // LaTeX source does sit alongside it in a screen-reader-only annotation,
  // but this app has no LaTeX renderer to display it properly either, so the
  // honest option is to drop the formula rather than show broken math.
  clone.querySelectorAll('.katex, math').forEach((el) => el.remove())
  return stripIconGlyphs(cleanMarkdown(makeTurndown().turndown(clone.innerHTML)))
}

// The first scrollable ancestor of an element — the element whose own
// scrolling moves `el` through the viewport. Used to drive a virtualized turn
// list past every mount position.
function findScrollParent(el) {
  let cur = el.parentElement
  while (cur) {
    const s = getComputedStyle(cur)
    if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && cur.scrollHeight > cur.clientHeight + 20) {
      return cur
    }
    cur = cur.parentElement
  }
  return null
}

// A signature of which virtual rows are currently mounted, so we can tell when
// a scroll has finished mounting/rendering new turns (the set stops changing).
function mountedIndexSignature() {
  return [...document.querySelectorAll('[data-index][data-rs-index]')]
    .map((e) => e.getAttribute('data-index'))
    .sort()
    .join(',')
}

// After a scroll, wait for the newly-positioned turns to mount and render,
// then settle. Two phases so we never return on a false "stable": first wait
// for the mounted set to actually *change* from what it was before the scroll
// (rocksteady can lag a frame or two, and the thread loads pinned to the
// bottom, so the pre-scroll set is briefly still stable right after a jump),
// then wait for it to stop changing. Both phases are capped so a scroll that
// genuinely mounts nothing new (already-covered region, or the very end)
// doesn't stall the sweep.
async function waitForMountSettle(beforeSig, maxMs = 3000) {
  const start = Date.now()
  let sawChange = beforeSig == null
  let prev = null
  while (Date.now() - start < maxMs) {
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 90)))
    const cur = mountedIndexSignature()
    if (!sawChange) {
      if (cur !== beforeSig || Date.now() - start > 900) sawChange = true
      prev = cur
      continue
    }
    if (cur && cur === prev) return
    prev = cur
  }
}

// claude.ai renders each turn as a `[data-testid="user-message"]` (human) or a
// sibling block (Claude), but wraps the whole thread in a virtualized list
// ("rocksteady": rows carry `data-index`/`data-rs-index`). On a long chat only
// a small window of turns is actually mounted in the DOM at any moment — the
// rest are a single tall empty spacer — so reading the DOM once silently
// exports just the few turns near the current scroll position and drops the
// entire rest of the conversation. So we scroll the thread top→bottom and
// collect every turn as it mounts, keyed by its stable `data-index` (which is
// also its true chronological order), then convert them in order.
// Returns turns as `{ role, content }` (not a flattened string): the app
// imports each turn as a real message so an imported chat renders — and
// continues — exactly like one composed natively in Skillmaxx.
async function extractClaudeConversation() {
  const indexed = document.querySelector('[data-index][data-rs-index]')
  if (!indexed) return extractClaudeConversationStatic()

  const virtualRoot = indexed.parentElement
  const scroller = findScrollParent(virtualRoot)
  const byIndex = new Map()
  // A turn wrapper is a virtual row that actually contains a message; rows with
  // neither a user-message nor an action bar are spacers or sr-only markers.
  const collect = () => {
    for (const el of virtualRoot.children) {
      const idxAttr = el.getAttribute('data-index')
      if (idxAttr == null) continue
      const isUser = !!el.querySelector('[data-testid="user-message"]')
      const isAssistant = !!el.querySelector('[data-testid="action-bar-retry"]')
      if (!isUser && !isAssistant) continue
      byIndex.set(Number(idxAttr), { role: isUser ? 'user' : 'assistant', el: el.cloneNode(true) })
    }
  }

  if (scroller) {
    const originalScroll = scroller.scrollTop
    // Rocksteady keeps a generous buffer mounted around the viewport (many
    // turns, well beyond one screen), so we can step by several viewports and
    // still have every turn mounted at some stop with overlap to spare — while
    // keeping the number of stops (and total sweep time) low enough that even a
    // very long, render-heavy thread finishes within the wall-clock cap rather
    // than importing a partial conversation. Floor at 3000px for short
    // viewports. A turn taller than a step still stays mounted while we pass
    // through it, so tall turns aren't skipped.
    const step = Math.max(3000, scroller.clientHeight * 3)
    const deadline = Date.now() + 120000
    let beforeSig = mountedIndexSignature()
    scroller.scrollTop = 0
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }))
    await waitForMountSettle(beforeSig)
    collect()
    let pos = 0
    while (Date.now() < deadline) {
      const maxScroll = scroller.scrollHeight - scroller.clientHeight
      if (pos >= maxScroll) break
      pos = Math.min(pos + step, maxScroll)
      beforeSig = mountedIndexSignature()
      scroller.scrollTop = pos
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }))
      await waitForMountSettle(beforeSig)
      collect()
    }
    await waitForMountSettle(null)
    collect()
    scroller.scrollTop = originalScroll // restore the user's view
  } else {
    collect()
  }

  const result = [...byIndex.keys()]
    .sort((a, b) => a - b)
    .map((i) => {
      const { role, el } = byIndex.get(i)
      const content = turnToMarkdown(el)
      return content ? { role, content } : null
    })
    .filter(Boolean)
  return result.length ? result : null
}

// Fallback for a claude.ai thread that isn't virtualized (no `data-index`):
// find the turn-list container by climbing from an anchor until it contains
// every anchor — which needs at least two anchors spread across different
// turns to force the climb past same-turn wrapper divs that also happen to
// have >1 child (e.g. an avatar+bubble split). A single-question chat has only
// one `user-message`, so pair it with `action-bar-retry` (present once per
// Claude turn, including the first) to guarantee a second, independent anchor.
function extractClaudeConversationStatic() {
  const userMsgs = document.querySelectorAll('[data-testid="user-message"]')
  if (userMsgs.length === 0) return null

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
      const isAssistant = !!turn.querySelector('[data-testid="action-bar-retry"]')
      if (!isUser && !isAssistant) return null // spacers / sr-only markers
      const content = turnToMarkdown(turn)
      return content ? { role: isUser ? 'user' : 'assistant', content } : null
    })
    .filter(Boolean)

  return result.length ? result : null
}

// ChatGPT virtualizes long threads: off-screen turns collapse into
// `--last-known-height` placeholder spacers, and only a window of turns near
// the viewport stays mounted with `data-message-author-role`. Scraping the DOM
// would export just that window (e.g. the last ~7 turns of a 34-turn chat) and
// silently drop the rest. Unlike claude.ai's list, ChatGPT's virtualizer
// ignores *programmatic* scrolling entirely — only real, trusted wheel events
// rehydrate turns — so a content script (synthetic scroll only) can't page the
// rest into the DOM the way the claude.ai extractor does.
//
// Instead, pull the whole conversation straight from ChatGPT's own backend —
// the same endpoint its frontend loads from, complete regardless of what's
// mounted — and fall back to scraping the mounted DOM only if that fails.
async function extractChatGptConversation() {
  const fromApi = await extractChatGptConversationFromApi()
  if (fromApi && fromApi.length) return fromApi
  return extractChatGptConversationFromDom()
}

// Fetches the full conversation as JSON from ChatGPT's backend. Runs in the
// page's own origin with the user's session, so it's a same-origin authorized
// request — the access token comes from the session endpoint the frontend
// itself uses. Returns `{ role, content }[]` on the active branch, or null on
// any failure (temporary chat, token/endpoint change, parse error) so the
// caller falls back to the DOM.
async function extractChatGptConversationFromApi() {
  try {
    const convId = (location.pathname.match(/\/c\/([^/?#]+)/) || [])[1]
    if (!convId) return null
    const session = await fetch('/api/auth/session', { credentials: 'include' }).then((r) =>
      r.ok ? r.json() : null
    )
    const token = session?.accessToken
    if (!token) return null
    const res = await fetch('/backend-api/conversation/' + convId, {
      credentials: 'include',
      headers: { Authorization: 'Bearer ' + token },
    })
    if (!res.ok) return null
    const data = await res.json()
    const mapping = data.mapping || {}
    // The mapping is a tree (edits/regenerations branch it); walk the *active*
    // branch only, from the current leaf up to the root, so abandoned branches
    // don't leak in. The guard set defends against a malformed parent cycle.
    const chain = []
    const seen = new Set()
    let cur = data.current_node
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      const node = mapping[cur]
      if (!node) break
      if (node.message) chain.push(node.message)
      cur = node.parent
    }
    chain.reverse()
    const turns = []
    for (const m of chain) {
      const role = m.author?.role
      if (role !== 'user' && role !== 'assistant') continue // skip system/tool
      // Only plain text messages: this drops reasoning ("thoughts"), the
      // "Worked for Ns" recap ("reasoning_recap"), tool code, execution output,
      // and image parts — the same things we don't render from the DOM.
      if (m.content?.content_type !== 'text') continue
      if (m.recipient && m.recipient !== 'all') continue // skip tool-directed calls
      // A reasoning model also emits plain-text planning interjections ("I'll
      // reduce the equation to…") on the "commentary" channel — shown inside
      // the page's thinking block, not the answer bubble. The real answer is on
      // the "final" channel; user turns carry no channel. Keep those two, drop
      // commentary/analysis so chain-of-thought never lands in the chat.
      if (m.channel && m.channel !== 'final') continue
      const text = (m.content.parts || [])
        .filter((p) => typeof p === 'string')
        .join('\n\n')
        .trim()
      if (!text) continue
      // An answer occasionally arrives as several consecutive text nodes; merge
      // same-role runs so each turn is one message/bubble.
      if (turns.length && turns[turns.length - 1].role === role) {
        turns[turns.length - 1].content += '\n\n' + text
      } else {
        turns.push({ role, content: text })
      }
    }
    return turns.length ? turns : null
  } catch {
    return null
  }
}

// DOM fallback: ChatGPT tags every mounted turn with `data-message-author-role`
// in document order. Only reaches turns currently in the DOM, so on a long
// (virtualized) thread it's incomplete — but it's a safety net for when the
// backend fetch fails, and it's complete for short, fully-mounted chats.
function extractChatGptConversationFromDom() {
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

async function extract() {
  try {
    const host = location.hostname
    if (/(^|\.)claude\.ai$/.test(host)) {
      const turns = await extractClaudeConversation()
      if (turns) return { title: document.title || '', turns }
    }
    if (/(^|\.)chatgpt\.com$/.test(host) || /(^|\.)chat\.openai\.com$/.test(host)) {
      const turns = await extractChatGptConversation()
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

// Extraction is async now (a virtualized claude.ai thread has to be scrolled
// through to mount every turn), so the send waits for it to finish.
;(async () => {
  const { title, markdown, turns } = await extract()
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
})()
