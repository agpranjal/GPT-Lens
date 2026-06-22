import "dotenv/config";
import express from "express";
import cors from "cors";
import { chat, generate } from "./gemini.js";
import { buildActionPrompt, resolveInstruction } from "./prompts.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Multi-turn chat. Body: { messages: [{ role, content }] }
app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages must be a non-empty array" });
    }
    const text = await chat(messages);
    res.json({ text });
  } catch (err) {
    console.error("/api/chat error:", err);
    res.status(500).json({ error: err.message || "chat failed" });
  }
});

// Selection action. Body: { action, selectedText, sourceMessageText, custom? }
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
    const text = await generate(prompt);
    res.json({ text });
  } catch (err) {
    console.error("/api/action error:", err);
    res.status(500).json({ error: err.message || "action failed" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`server listening on http://localhost:${PORT}`));
