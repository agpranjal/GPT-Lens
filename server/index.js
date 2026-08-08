import "dotenv/config";
import express from "express";
import cors from "cors";
import {
  chatStream,
  makeReasoningFilter,
} from "./llm.js";
import {
  buildActionPrompt,
  resolveInstruction,
} from "./prompts.js";
import {
  MODELS,
  REASONING_LEVELS,
  DEFAULT_MODEL,
  DEFAULT_REASONING,
  isValidModel,
} from "./models.js";
import {
  listChats,
  createChat,
  getChat,
  deleteChat,
  chatExists,
  addMessage,
  upsertSession,
  deleteSession,
  searchMessages,
  getSettings,
  updateSettings,
} from "./db.js";

// Pull { model, reasoning } out of a request body, validating each against
// the allowlist. Invalid/missing values fall through to the server default.
function resolveOpts(body) {
  const settings = getSettings(DEFAULT_MODEL, DEFAULT_REASONING);
  const model = isValidModel(body?.model) ? body.model : settings.model;
  const reasoning = REASONING_LEVELS.some((r) => r.id === body?.reasoning)
    ? body.reasoning
    : settings.reasoning;
  return { model, reasoning };
}

// Toggle for the extra context added in chatHistory/ancestorHistory (the
// full main-chat transcript and the rest of the drill-down chain sent with
// every modal action). Defaults to ON — set EXTRA_CONTEXT=false in .env to
// fall back to the leaner, pre-existing one-hop-back behavior. Doesn't
// affect same-tab follow-up continuation (history/question) — that's a
// separate, older mechanism this flag leaves untouched either way.
const EXTRA_CONTEXT = process.env.EXTRA_CONTEXT !== "false";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// The curated model + reasoning-level list the UI renders as a dropdown.
app.get("/api/models", (_req, res) => {
  res.json({
    models: MODELS,
    reasoningLevels: REASONING_LEVELS,
    defaultModel: DEFAULT_MODEL,
    defaultReasoning: DEFAULT_REASONING,
  });
});

app.get("/api/settings", (_req, res) => {
  res.json(getSettings(DEFAULT_MODEL, DEFAULT_REASONING));
});

app.patch("/api/settings", (req, res) => {
  const { model, reasoning } = req.body || {};
  if (model === undefined && reasoning === undefined) {
    return res.status(400).json({ error: "model or reasoning is required" });
  }
  if (model !== undefined && !isValidModel(model)) {
    return res.status(400).json({ error: "invalid model" });
  }
  if (
    reasoning !== undefined &&
    !REASONING_LEVELS.some((level) => level.id === reasoning)
  ) {
    return res.status(400).json({ error: "invalid reasoning level" });
  }
  getSettings(DEFAULT_MODEL, DEFAULT_REASONING);
  res.json(updateSettings({ model, reasoning }));
});

// Pipe an OpenAI-compatible chat-completion stream to the HTTP response as
// plain-text chunks. `streamPromise` resolves to the SDK's Stream object.
// `onDone(fullText)` fires once the stream ends (including client aborts,
// where fullText is whatever had streamed so far).
async function pipeStream(res, streamPromise, onDone) {
  const stream = await streamPromise;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no"); // disable proxy buffering
  // If the client disconnects (e.g. Stop pressed), abort the upstream request.
  res.on("close", () => stream.controller?.abort());
  const filter = makeReasoningFilter();
  let full = "";
  try {
    for await (const chunk of stream) {
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) {
        const visible = filter.push(text);
        if (visible) {
          full += visible;
          res.write(visible);
        }
      }
    }
    const tail = filter.flush();
    if (tail) {
      full += tail;
      res.write(tail);
    }
  } catch (err) {
    // Upstream abort after client disconnect is expected; anything else bubbles.
    if (err.name !== "AbortError" && !res.writableEnded && !res.destroyed) throw err;
  }
  res.end();
  onDone?.(full);
}

// Surface an error either as JSON (if nothing sent yet) or by ending the stream.
function handleStreamError(res, err, where) {
  console.error(`${where} error:`, err);
  if (res.headersSent) res.end();
  else res.status(500).json({ error: err.message || "request failed" });
}

// ---- chat persistence ----

app.get("/api/search", (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ results: [] });
  res.json({ results: searchMessages(q) });
});

app.get("/api/chats", (_req, res) => res.json({ chats: listChats() }));

app.post("/api/chats", (req, res) => {
  const title = (req.body?.title || "").trim();
  if (!title) return res.status(400).json({ error: "title is required" });
  res.json(createChat(title));
});

app.get("/api/chats/:id", (req, res) => {
  const chat = getChat(Number(req.params.id));
  if (!chat) return res.status(404).json({ error: "chat not found" });
  res.json(chat);
});

app.delete("/api/chats/:id", (req, res) => {
  deleteChat(Number(req.params.id));
  res.json({ ok: true });
});

// Add a single message directly, without an LLM call — used to seed a chat
// with content that wasn't generated in this app (e.g. a page imported from
// the browser extension).
app.post("/api/chats/:id/messages", (req, res) => {
  const chatId = Number(req.params.id);
  if (!chatExists(chatId)) return res.status(404).json({ error: "chat not found" });
  const { role, content } = req.body || {};
  if (!role || !content) return res.status(400).json({ error: "role and content are required" });
  addMessage(chatId, role, content);
  res.json({ ok: true });
});

// Write-through save of a modal session (client sends the whole tree).
app.put("/api/sessions/:id", (req, res) => {
  const { chatId, data } = req.body || {};
  if (!chatId || !data) return res.status(400).json({ error: "chatId and data are required" });
  if (!chatExists(chatId)) return res.status(404).json({ error: "chat not found" });
  upsertSession(req.params.id, chatId, data);
  res.json({ ok: true });
});

app.delete("/api/sessions/:id", (req, res) => {
  deleteSession(req.params.id);
  res.json({ ok: true });
});

// Multi-turn chat, streamed. Body: { messages: [{ role, content }], chatId?, model?, reasoning? }
// With a chatId, the incoming user message is persisted up front and the
// assistant reply is persisted when the stream ends (partial on abort).
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, chatId } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages must be a non-empty array" });
    }
    const persist = chatId && chatExists(chatId);
    if (persist) {
      const last = messages[messages.length - 1];
      if (last.role === "user") addMessage(chatId, "user", last.content);
    }
    await pipeStream(res, chatStream(messages, resolveOpts(req.body)), (full) => {
      if (persist && full) addMessage(chatId, "assistant", full);
    });
  } catch (err) {
    handleStreamError(res, err, "/api/chat");
  }
});

// Selection action, streamed. Body: { action, selectedText, sourceMessageText, custom?, model?, reasoning? }
// `chatHistory` (optional): the full main-chat transcript this session was
// opened from — [{role, content}, ...] — prepended so every action, however
// many tabs deep, still has everything discussed in the main chat.
// `ancestorHistory` (optional): turns for every tab OLDER than the immediate
// one sourceMessageText already covers — the rest of the drill-down chain,
// so a tab several levels deep still knows about every tab before it, not
// just the one it directly branched from.
// Follow-up (continuing the same lens's chat): also pass
// { history: [{role,content}, ...], question } — history is the prior
// exchange (starting with the lens's own answer), question is the new turn.
// The seed prompt is rebuilt identically from action/custom/selectedText/
// sourceMessageText so continuation always has the exact original context.
app.post("/api/action", async (req, res) => {
  try {
    const { action, selectedText, sourceMessageText, custom, chatHistory, ancestorHistory, history, question } =
      req.body || {};
    if (!selectedText || !sourceMessageText) {
      return res
        .status(400)
        .json({ error: "selectedText and sourceMessageText are required" });
    }
    const instruction = resolveInstruction({ action, custom });
    const seedPrompt = buildActionPrompt({ sourceMessageText, selectedText, instruction });

    const messages = [
      ...(EXTRA_CONTEXT && Array.isArray(chatHistory) ? chatHistory : []),
      ...(EXTRA_CONTEXT && Array.isArray(ancestorHistory) ? ancestorHistory : []),
      { role: "user", content: seedPrompt },
      ...(Array.isArray(history) ? history : []),
      ...(question ? [{ role: "user", content: question }] : []),
    ];
    await pipeStream(res, chatStream(messages, resolveOpts(req.body)));
  } catch (err) {
    handleStreamError(res, err, "/api/action");
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`server listening on http://localhost:${PORT}`));
