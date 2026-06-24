// Read a streaming text response, invoking onChunk(text) as chunks arrive.
// Pass an AbortSignal to allow cancelling mid-stream.
async function stream(url, body, onChunk, signal) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    if (text) onChunk(text);
  }
}

// messages: [{ role: "user" | "assistant", content }]
export function streamChat(messages, onChunk, signal) {
  return stream("/api/chat", { messages }, onChunk, signal);
}

// action: key string; custom: optional free-text instruction
export function streamAction({ action, custom, selectedText, sourceMessageText }, onChunk, signal) {
  return stream(
    "/api/action",
    { action, custom, selectedText, sourceMessageText },
    onChunk,
    signal
  );
}

// Experimental: get suggested questions for a snippet. Returns { questions: [...] }.
export async function fetchQuestions({ selectedText, sourceMessageText }) {
  const res = await fetch("/api/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedText, sourceMessageText }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}
