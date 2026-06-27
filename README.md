# learnmaxx

A ChatGPT-style chat app (prompt → MiniMax → streamed response) with a
**selection-driven follow-up layer**: highlight any part of a reply, pick an
action ("Explain better", "Give an example", "Simplify", "wtf is this", or type
your own), and the answer streams into a modal.

## Stack
- **Client:** React + Vite
- **Server:** Node + Express (stateless)
- **LLM:** MiniMax via the OpenAI-compatible API (`openai` SDK, default model `MiniMax-M3`)

## Setup

```bash
npm run install:all
```

Create `server/.env` from the example and add your key:

```bash
cp server/.env.example server/.env
# then edit server/.env and set MINIMAX_API_KEY=...
```

## Run (dev)

```bash
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001
- Vite proxies `/api/*` to the server.

## How it works

Both endpoints stream plain-text chunks back to the client:

- `POST /api/chat`  — `{ messages: [{role, content}] }` → streamed text
- `POST /api/action` — `{ action, selectedText, sourceMessageText, custom? }` → streamed text

The MiniMax API key lives only on the server and is never exposed to the client.
Selection-action prompts are assembled in `server/prompts.js`.
