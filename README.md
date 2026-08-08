# GPT Lens

GPT Lens is a streaming, multi-model AI chat app built for understanding answers in depth. Highlight any text in a response, choose a lens such as **Explain**, **Example**, **Go Deeper**, **Step by Step**, or ask a custom question. GPT Lens streams the result into a focused modal where you can keep drilling down into nested tabs without losing your place.

![GPT Lens home screen](docs/screenshots/gpt-lens-home.jpg)

## What makes it different

- **Selection-driven exploration** — highlight part of any answer and act on exactly that text.
- **Nested drill-down tabs** — branch repeatedly from explanations while preserving the ancestor context.
- **Independent follow-up threads** — each lens keeps its own conversation history and variants.
- **Streaming responses** — chat, drill-downs, and follow-ups render as tokens arrive.
- **Multi-model support** — choose from a curated OpenRouter model list and four reasoning levels.
- **Persistent local history** — chats, messages, modal sessions, and model preferences live in SQLite.
- **Markdown tooling** — syntax highlighting plus copy and select controls for code blocks.
- **Browser extension** — send the page you are reading into GPT Lens as source material.

![GPT Lens drill-down modal](docs/screenshots/gpt-lens-drilldown.jpg)

## How the drill-down flow works

1. Ask a question in the main chat.
2. Highlight any useful or unclear part of the response.
3. Pick a preset action or enter a custom instruction.
4. Read the streamed answer in its own modal tab.
5. Select text inside that answer to branch into another tab.
6. Return to any earlier tab without losing its content, follow-ups, or scroll position.

Tabs show a pulsing indicator while their response is still loading. Newly created background tabs automatically scroll into view, and the selected source text remains highlighted while the action popup is open.

## Stack

| Layer | Technology |
|---|---|
| Client | React 18, Vite, React Markdown |
| Server | Node.js, Express |
| LLM gateway | OpenRouter through the OpenAI-compatible SDK |
| Persistence | SQLite with `better-sqlite3` |
| Extension | Chrome Manifest V3, Vite library builds |

## Quick start

Requirements:

- Node.js 20 or newer
- An [OpenRouter](https://openrouter.ai/) API key

Install every workspace dependency:

```bash
npm run install:all
```

Create the server environment file:

```bash
cp server/.env.example server/.env
```

Set `OPENROUTER_API_KEY` in `server/.env`, then start the client and server:

```bash
npm run dev
```

- Client: [http://localhost:5173](http://localhost:5173)
- Server: [http://localhost:3001](http://localhost:3001)
- Health check: [http://localhost:3001/api/health](http://localhost:3001/api/health)

Vite proxies `/api/*` requests to the Express server during development.

## Configuration

```dotenv
OPENROUTER_API_KEY=       # required
OPENROUTER_MODEL=         # default: openai/gpt-oss-120b
OPENROUTER_MAX_TOKENS=    # default: 8192
OPENROUTER_REASONING=     # off | low | medium | high (default: high)
OPENROUTER_BASE_URL=      # default: https://openrouter.ai/api/v1
EXTRA_CONTEXT=            # true | false (default: true)
PORT=                     # default: 3001
```

Model and reasoning selections are validated server-side and stored app-wide in SQLite. The environment values seed the settings record on a fresh database. After that, changes made through the header selectors are persisted through `/api/settings`.

Set `EXTRA_CONTEXT=false` to send only the immediate parent context for modal actions. Keeping it enabled gives nested drill-downs the full main conversation and ancestor chain, at the cost of additional input tokens.

## Available commands

```bash
npm run dev              # server and client
npm run dev:server       # Express server only, port 3001
npm run dev:client       # Vite client only, port 5173
npm run build:extension  # build the Chrome extension into extension/dist
```

The repository currently has no automated test or lint scripts. Use the client production build for a frontend compilation check:

```bash
npm --prefix client run build
```

## Browser extension

Build the extension:

```bash
npm run build:extension
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `extension/dist`.

The extension currently targets the local app at `http://localhost:5173`. Clicking its toolbar icon extracts the active page, opens or focuses GPT Lens, and imports the page as source content.

## Architecture

```text
client (React/Vite)
  ├─ main chat and streaming UI
  ├─ text-selection popup
  ├─ nested modal session tree
  └─ chat/session side panels
          │ /api/*
          ▼
server (Express)
  ├─ prompt and ancestor-context construction
  ├─ model/reasoning validation
  ├─ OpenRouter streaming
  └─ SQLite persistence
          │
          ▼
server/data/gpt-lens.db
```

The primary streaming endpoints are:

- `POST /api/chat` — streams a multi-turn main-chat response.
- `POST /api/action` — streams a selection-driven response with chat and ancestor context.

SQLite stores normalized chats and messages, whole modal-session trees as JSON, and a singleton app-settings row. The database is created automatically and is gitignored.

## Project structure

```text
client/       React application
server/       Express API, OpenRouter integration, SQLite persistence
extension/    Chrome extension source and build configuration
docs/         README screenshots and project documentation assets
```

## Data and privacy

- The OpenRouter API key stays on the server and is never sent to the browser.
- Conversation and session history is stored locally in `server/data/gpt-lens.db`.
- Prompts and selected context are sent to the configured OpenRouter model when generating a response.
