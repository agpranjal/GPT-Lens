import OpenAI from "openai";
import { DEFAULT_MODEL, DEFAULT_REASONING, reasoningMaxTokens } from "./models.js";

const BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const MAX_TOKENS = Number(process.env.OPENROUTER_MAX_TOKENS) || 8192;

// Resolve the per-request model/reasoning overrides (from the UI) down to
// concrete values, falling back to the server defaults.
function resolveParams({ model, reasoning } = {}) {
  const budget = reasoningMaxTokens(reasoning) ?? reasoningMaxTokens(DEFAULT_REASONING);
  return {
    model: model || DEFAULT_MODEL,
    // Hard thinking-token budget so reasoning models (e.g. gemini-2.5-pro)
    // keep their answer quality without stalling on time-to-first-token.
    // Some models (e.g. gemini-3.1-pro, gpt-5-mini) treat reasoning as
    // mandatory and 400 on an explicit 0 — clamp "off" to the smallest
    // nonzero budget instead, which those models accept and everything
    // else still treats as effectively no reasoning.
    reasoning: { max_tokens: Math.max(budget, 1) },
  };
}

// Applied to every request (chat + actions).
const SYSTEM = [
  "DO NOT use analogies in your answers.",
  "While giving examples - include concrete example(s) illustrating the actual thing being",
  "explained (real code, real data, a real scenario) — never a hypothetical stand-in",
  "or analogy from an unrelated domain.",
  "Always answer to the best of your ability using the provided context and your own knowledge.",
  "If the selected text or context seems incomplete, ambiguous, or insufficient on its own,",
  "infer what it is about from the surrounding context and respond anyway — never refuse,",
  "never say there isn't enough context, and never ask the user for clarification.",
].join(" ");

// Strips <think>...</think> reasoning spans from a streamed text sequence,
// handling tags that straddle chunk boundaries. Use one instance per response:
// call push(chunk) for each streamed chunk, then flush() once at the end.
export function makeReasoningFilter() {
  const OPEN = "<think>";
  const CLOSE = "</think>";
  let inside = false;
  let pending = ""; // buffered tail that may be the start of a tag

  // Longest suffix of s that is a prefix of tag (so we don't emit a partial tag).
  function partialLen(s, tag) {
    for (let n = Math.min(s.length, tag.length); n > 0; n--) {
      if (s.slice(s.length - n) === tag.slice(0, n)) return n;
    }
    return 0;
  }

  function push(chunk) {
    pending += chunk;
    let out = "";
    while (true) {
      if (!inside) {
        const idx = pending.indexOf(OPEN);
        if (idx !== -1) {
          out += pending.slice(0, idx);
          pending = pending.slice(idx + OPEN.length);
          inside = true;
          continue;
        }
        const keep = partialLen(pending, OPEN);
        out += pending.slice(0, pending.length - keep);
        pending = pending.slice(pending.length - keep);
        return out;
      }
      const idx = pending.indexOf(CLOSE);
      if (idx !== -1) {
        pending = pending.slice(idx + CLOSE.length);
        inside = false;
        continue;
      }
      pending = pending.slice(pending.length - partialLen(pending, CLOSE));
      return out;
    }
  }

  // Emit any leftover: a never-completed think span is dropped; otherwise the
  // held-back tail was only a partial open tag that never materialized — emit it.
  function flush() {
    const out = inside ? "" : pending;
    pending = "";
    return out;
  }

  return { push, flush };
}

let client;
function llm() {
  if (!client) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not set (see server/.env)");
    }
    client = new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: BASE_URL });
  }
  return client;
}

// Multi-turn chat, streamed. `messages` is [{ role: "user" | "assistant", content }].
// `opts`: { model?, reasoning? } — reasoning is a level id ("off"|"low"|"medium"|"high").
// Returns a Promise<Stream> of OpenAI chat-completion chunks.
export function chatStream(messages, opts) {
  const { model, reasoning } = resolveParams(opts);
  return llm().chat.completions.create({
    model,
    max_tokens: MAX_TOKENS,
    stream: true,
    reasoning,
    messages: [
      { role: "system", content: SYSTEM },
      ...messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    ],
  });
}
