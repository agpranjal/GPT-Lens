import OpenAI from "openai";

// MiniMax exposes an OpenAI-compatible API, so we use the OpenAI SDK pointed at
// MiniMax's base URL. See https://platform.minimax.io/docs/api-reference/text-openai-api
const MODEL = process.env.MINIMAX_MODEL || "MiniMax-M3";
const BASE_URL = process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1";

// Applied to every request (chat + actions).
const SYSTEM = [
  "Do not use analogies in your answers.",
  "Always answer to the best of your ability using the provided context and your own knowledge.",
  "If the selected text or context seems incomplete, ambiguous, or insufficient on its own,",
  "infer what it is about from the surrounding context and respond anyway — never refuse,",
  "never say there isn't enough context, and never ask the user for clarification.",
].join(" ");

let client;
function llm() {
  if (!client) {
    if (!process.env.MINIMAX_API_KEY) {
      throw new Error("MINIMAX_API_KEY is not set (see server/.env)");
    }
    client = new OpenAI({
      apiKey: process.env.MINIMAX_API_KEY,
      baseURL: BASE_URL,
    });
  }
  return client;
}

// Multi-turn chat, streamed. `messages` is [{ role: "user" | "assistant", content }].
// Returns a Promise<Stream> of OpenAI chat-completion chunks.
export function chatStream(messages) {
  return llm().chat.completions.create({
    model: MODEL,
    max_tokens: 8192,
    stream: true,
    messages: [
      { role: "system", content: SYSTEM },
      ...messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    ],
  });
}

// One-shot generation from a single prompt string, streamed (used by selection actions).
export function generateStream(prompt) {
  return llm().chat.completions.create({
    model: MODEL,
    max_tokens: 8192,
    stream: true,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
    ],
  });
}

// One-shot, non-streaming generation returning the full text (used for questions).
export async function generateText(prompt) {
  const res = await llm().chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
    ],
  });
  return stripReasoning(res.choices[0]?.message?.content || "");
}

// MiniMax reasoning models (e.g. MiniMax-M2) interleave chain-of-thought inside
// <think>...</think> tags in the content. Remove it from a complete string.
export function stripReasoning(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/<\/?think>/g, "").trim();
}

// Streaming-safe variant: feed it chunk text, get back only the text that falls
// outside <think>...</think> blocks. Tags may straddle chunk boundaries, so it
// holds back a small tail that could be the start of a (closing) tag.
export function makeReasoningFilter() {
  const OPEN = "<think>";
  const CLOSE = "</think>";
  let inside = false;
  let buf = "";
  return {
    push(text) {
      buf += text;
      let out = "";
      for (;;) {
        if (!inside) {
          const i = buf.indexOf(OPEN);
          if (i === -1) {
            const safe = buf.length - (OPEN.length - 1);
            if (safe > 0) {
              out += buf.slice(0, safe);
              buf = buf.slice(safe);
            }
            break;
          }
          out += buf.slice(0, i);
          buf = buf.slice(i + OPEN.length);
          inside = true;
        } else {
          const j = buf.indexOf(CLOSE);
          if (j === -1) {
            const safe = buf.length - (CLOSE.length - 1);
            if (safe > 0) buf = buf.slice(safe);
            break;
          }
          buf = buf.slice(j + CLOSE.length);
          inside = false;
        }
      }
      return out;
    },
    flush() {
      const out = inside ? "" : buf;
      buf = "";
      return out;
    },
  };
}
