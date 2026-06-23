// Read a streaming text response, invoking onChunk(text) as chunks arrive.
async function stream(url, body, onChunk) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
export function streamChat(messages, onChunk) {
  return stream("/api/chat", { messages }, onChunk);
}

// action: key string; custom: optional free-text instruction
export function streamAction({ action, custom, selectedText, sourceMessageText }, onChunk) {
  return stream(
    "/api/action",
    { action, custom, selectedText, sourceMessageText },
    onChunk
  );
}
