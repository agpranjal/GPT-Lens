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

// Multi-turn chat. `messages` is [{ role: "user" | "assistant", content }].
// Gemini expects roles "user" / "model", so we map "assistant" -> "model".
export async function chat(messages) {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const res = await client().models.generateContent({
    model: MODEL,
    contents,
  });
  return res.text;
}

// One-shot generation from a single prompt string (used by selection actions).
export async function generate(prompt) {
  const res = await client().models.generateContent({
    model: MODEL,
    contents: prompt,
  });
  return res.text;
}
