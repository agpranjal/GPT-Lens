# select-to-ask

A chat app (prompt → Gemini → response) with a **selection-driven follow-up layer**:
highlight any part of a response, pick an action ("explain better", "give an example",
"wtf is this", or type your own), and the answer appears as a card in a side panel.

## Stack
- **Client:** React + Vite
- **Server:** Node + Express (stateless)
- **LLM:** Google Gemini via `@google/genai` (default model `gemini-2.5-flash`)

## Setup

```bash
npm run install:all
```

Create `server/.env` from the example and add your key:

```bash
cp server/.env.example server/.env
# then edit server/.env and set GEMINI_API_KEY=...
```

## Run (dev)

```bash
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001
- Vite proxies `/api/*` to the server.

## How it works

- `POST /api/chat`  — `{ messages: [{role, content}] }` → `{ text }`
- `POST /api/action` — `{ action, selectedText, sourceMessageText, custom? }` → `{ text }`

The Gemini API key lives only on the server and is never exposed to the client.
Action wording (the instruction each button maps to) lives in `server/prompts.js`.
