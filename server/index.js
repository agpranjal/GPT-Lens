import "dotenv/config";
import express from "express";
import cors from "cors";
import {
  chatStream,
  generateStream,
  generateText,
  makeReasoningFilter,
} from "./llm.js";
import {
  buildActionPrompt,
  resolveInstruction,
  buildQuestionsPrompt,
} from "./prompts.js";
import {
  MODELS,
  REASONING_LEVELS,
  DEFAULT_MODEL,
  DEFAULT_REASONING,
  isValidModel,
} from "./models.js";

// Pull { model, reasoning } out of a request body, validating each against
// the allowlist. Invalid/missing values fall through to the server default.
function resolveOpts(body) {
  const model = isValidModel(body?.model) ? body.model : undefined;
  const reasoning = REASONING_LEVELS.some((r) => r.id === body?.reasoning)
    ? body.reasoning
    : undefined;
  return { model, reasoning };
}

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

// Pipe an OpenAI-compatible chat-completion stream to the HTTP response as
// plain-text chunks. `streamPromise` resolves to the SDK's Stream object.
async function pipeStream(res, streamPromise) {
  const stream = await streamPromise;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no"); // disable proxy buffering
  // If the client disconnects (e.g. Stop pressed), abort the upstream request.
  res.on("close", () => stream.controller?.abort());
  const filter = makeReasoningFilter();
  for await (const chunk of stream) {
    const text = chunk.choices?.[0]?.delta?.content;
    if (text) {
      const visible = filter.push(text);
      if (visible) res.write(visible);
    }
  }
  const tail = filter.flush();
  if (tail) res.write(tail);
  res.end();
}

// Surface an error either as JSON (if nothing sent yet) or by ending the stream.
function handleStreamError(res, err, where) {
  console.error(`${where} error:`, err);
  if (res.headersSent) res.end();
  else res.status(500).json({ error: err.message || "request failed" });
}

// Multi-turn chat, streamed. Body: { messages: [{ role, content }], model?, reasoning? }
app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages must be a non-empty array" });
    }
    await pipeStream(res, chatStream(messages, resolveOpts(req.body)));
  } catch (err) {
    handleStreamError(res, err, "/api/chat");
  }
});

// Selection action, streamed. Body: { action, selectedText, sourceMessageText, custom?, model?, reasoning? }
app.post("/api/action", async (req, res) => {
  try {
    const { action, selectedText, sourceMessageText, custom } = req.body || {};
    if (!selectedText || !sourceMessageText) {
      return res
        .status(400)
        .json({ error: "selectedText and sourceMessageText are required" });
    }
    const instruction = resolveInstruction({ action, custom });
    const prompt = buildActionPrompt({ sourceMessageText, selectedText, instruction });
    await pipeStream(res, generateStream(prompt, resolveOpts(req.body)));
  } catch (err) {
    handleStreamError(res, err, "/api/action");
  }
});

// Suggested questions (experimental). Body: { selectedText, sourceMessageText, model?, reasoning? }
// Returns { questions: [...] } (non-streaming).
app.post("/api/questions", async (req, res) => {
  try {
    const { selectedText, sourceMessageText } = req.body || {};
    if (!selectedText || !sourceMessageText) {
      return res
        .status(400)
        .json({ error: "selectedText and sourceMessageText are required" });
    }
    const prompt = buildQuestionsPrompt({ sourceMessageText, selectedText });
    const text = await generateText(prompt, resolveOpts(req.body));
    const questions = text
      .split("\n")
      .map((s) => s.replace(/^[-*\d.)\s]+/, "").trim()) // strip bullets/numbers
      .filter(Boolean)
      .slice(0, 12);
    res.json({ questions });
  } catch (err) {
    console.error("/api/questions error:", err);
    res.status(500).json({ error: err.message || "questions failed" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`server listening on http://localhost:${PORT}`));
