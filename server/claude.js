import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

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
    messages: [{ role: "user", content: prompt }],
  });
}
