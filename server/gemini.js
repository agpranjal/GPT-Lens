import { GoogleGenAI } from "@google/genai";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

let ai;
function client() {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set (see server/.env)");
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

// Multi-turn chat, streamed. `messages` is [{ role: "user" | "assistant", content }].
// Gemini expects roles "user" / "model", so we map "assistant" -> "model".
// Returns an async iterable of chunks (each chunk has a `.text`).
export function chatStream(messages) {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  return client().models.generateContentStream({ model: MODEL, contents });
}

// One-shot generation from a single prompt string, streamed (used by selection actions).
export function generateStream(prompt) {
  return client().models.generateContentStream({ model: MODEL, contents: prompt });
}
