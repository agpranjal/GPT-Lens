async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

// messages: [{ role: "user" | "assistant", content }]
export function sendChat(messages) {
  return post("/api/chat", { messages });
}

// action: key string; custom: optional free-text instruction
export function sendAction({ action, custom, selectedText, sourceMessageText }) {
  return post("/api/action", { action, custom, selectedText, sourceMessageText });
}
