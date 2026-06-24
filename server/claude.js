import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

// Applied to every request (chat + actions).
const SYSTEM = [
  "Do not use analogies in your answers.",
  "Always answer to the best of your ability using the provided context and your own knowledge.",
  "If the selected text or context seems incomplete, ambiguous, or insufficient on its own,",
  "infer what it is about from the surrounding context and respond anyway — never refuse,",
  "never say there isn't enough context, and never ask the user for clarification.",
].join(" ");

let client;
function anthropic() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set (see server/.env)");
    }
    client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  }
  return client;
}

// Multi-turn chat, streamed. `messages` is [{ role: "user" | "assistant", content }].
// Returns an Anthropic MessageStream (async-iterable of stream events).
export function chatStream(messages) {
  return anthropic().messages.stream({
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM,
    messages: messages.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
  });
}

// One-shot generation from a single prompt string, streamed (used by selection actions).
export function generateStream(prompt) {
  return anthropic().messages.stream({
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
}

// One-shot, non-streaming generation returning the full text (used for questions).
export async function generateText(prompt) {
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}
