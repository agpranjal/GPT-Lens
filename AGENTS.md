# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Setup & Dev Commands

```bash
npm run install:all       # first-time: installs root + server + client deps
cp server/.env.example server/.env   # set OPENROUTER_API_KEY here
npm run dev               # starts both server (port 3001) and client (port 5173)
npm run dev:server        # server only
npm run dev:client        # client only
```

Server uses `node --watch index.js` (no nodemon needed). Client uses Vite with HMR. Vite proxies `/api/*` to `http://localhost:3001`.

There are no test or lint scripts.

## UI Design System (Required)

All future UI work must preserve the app's established desktop visual language. Treat design consistency as a requirement for every frontend change, including small controls and interaction states.

- Keep controls quiet at rest; prefer transparent or existing neutral surfaces over permanent emphasis.
- Use neutral gray background/color changes for hover and focus feedback. Avoid borders, motion, or accent colors unless they communicate real state.
- Reserve blue for meaningful selections, active states, and primary actions. Reserve red for destructive or stop actions.
- Keep compact UI text around 13px and main conversation/composer text at 16px. Use smaller text only for clearly secondary metadata.
- Reuse the rounded line-style SVG icon language. Do not introduce emoji or font glyphs for interface icons when an SVG is appropriate.
- Use the existing radius hierarchy: approximately 8px for compact controls, 12px for popups/cards, 16px for major modals, and pills/circles only where already established.
- Minimize permanent borders. Use borders for structure or input boundaries, not to box every clickable item.
- Keep compact controls stationary on hover. Do not add lift, bounce, or scale effects without a functional reason.
- Preserve existing spacing, hierarchy, and component proportions unless a specific observed problem requires changing them.
- Match new controls to the nearest existing component pattern instead of inventing a one-off treatment.
- Provide visible but restrained keyboard focus feedback without stacking multiple focus effects on inputs.
- When changing UI, inspect the rendered desktop state and verify relevant hover, active, focus, loading, disabled, and error states. Do not declare the design consistent based only on source code or a successful build.
- Do not perform speculative micro-tweaks. Make visual changes only for a concrete usability or consistency issue.

## Architecture

**What it is:** A streaming chat app with a selection-driven "drill-down" layer. Users highlight text in any message, pick an action, and a response streams into a modal. Those modals can be nested (drill-down sessions), and each session maintains its own conversation thread.

**Stack:** React 18 + Vite (frontend), Node.js + Express (backend), SQLite via better-sqlite3, OpenRouter (OpenAI-compatible API).

### Server (`server/`)

| File | Purpose |
|---|---|
| `index.js` | Express app, all route definitions |
| `db.js` | SQLite schema + all queries (chats, messages, sessions, app settings) |
| `llm.js` | OpenRouter client, streaming helper, strips `<think>…</think>` spans |
| `prompts.js` | Builds the prompt for `/api/action` from context + selection + instruction |
| `models.js` | Curated model allowlist, default model, reasoning budget constants |

Two main streaming endpoints:
- `POST /api/chat` — multi-turn conversation (optionally persisted to DB)
- `POST /api/action` — selection-driven follow-up; enriched with full chat history and the ancestor session chain

Responses stream plain-text chunks. Reasoning tokens (`<think>` blocks) are filtered before the stream reaches the client.

### Client (`client/src/`)

All state lives in `App.jsx` (~900 lines). There is no external state library.

Key state:
- `messages` — main chat thread
- `sessions` — modal drill-down tree (array of session objects, each with its own messages + variants)
- `chats` — saved chat list from DB (shown in left sidebar)
- `selection` — currently selected text and source, drives `SelectionPopup`
- `model` / `reasoning` — LLM settings, loaded from and persisted to SQLite through `/api/settings`

Key components:
- `ChatView.jsx` — main chat area + input
- `ActionModal.jsx` — the modal shown when an action fires; supports nested drill-downs and variant tabs
- `SelectionPopup.jsx` — floating popup on text selection, shows preset actions + custom input
- `Message.jsx` / `Markdown.jsx` — message rendering with code-block toolbars
- `ChatPanel.jsx` / `SessionPanel.jsx` — left/right sidebars

`api.js` has all fetch helpers. Streaming is done via `ReadableStream` + `AbortController`. Sessions are debounce-saved to the server (600 ms).

### Data Model

SQLite DB at `server/data/gpt-lens.db` (created on first run, gitignored).

- `chats(id, title, created_at, updated_at)`
- `messages(id, chat_id FK→chats, role, content, created_at)`
- `sessions(id, chat_id FK→chats, data JSON)` — entire session tree stored as a JSON blob, upserted on each save
- `app_settings(id=1, model, reasoning, updated_at)` — singleton app-wide LLM preferences

### LLM / Prompt Flow

- Model and reasoning level are stored app-wide in SQLite and selected per request from the client (validated server-side against the `models.js` allowlist).
- Defaults are `openai/gpt-oss-120b` with high reasoning; environment variables can override them when valid.
- Reasoning budgets: off=0, low=128, medium=512, high=2048 tokens.
- For `/api/action`, `prompts.js` builds the prompt from: full chat history context + ancestor drill-down chain + selected text + instruction.
- The system prompt enforces concrete examples and no analogies (see `server/llm.js`).
- Environment variable `EXTRA_CONTEXT=false` disables the richer context injection.

### Environment Variables (server/.env)

```
OPENROUTER_API_KEY=       # required
OPENROUTER_MODEL=         # default: openai/gpt-oss-120b
OPENROUTER_MAX_TOKENS=    # default: 8192
OPENROUTER_REASONING=     # off | low | medium | high (default: high)
OPENROUTER_BASE_URL=      # default: https://openrouter.ai/api/v1
EXTRA_CONTEXT=            # true | false (default: true)
PORT=                     # default: 3001
```
