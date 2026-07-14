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

// The curated model + reasoning-level list for the UI selector.
export async function fetchModels() {
  const res = await fetch("/api/models");
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  return res.json();
}

// Small JSON helper for the non-streaming endpoints.
async function json(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

// ---- chat persistence ----
export const fetchChats = () => json("/api/chats");
export const createChat = (title) =>
  json("/api/chats", { method: "POST", body: JSON.stringify({ title }) });
export const fetchChat = (id) => json(`/api/chats/${id}`);
export const deleteChat = (id) => json(`/api/chats/${id}`, { method: "DELETE" });
export const saveSession = (session) =>
  json(`/api/sessions/${session.id}`, {
    method: "PUT",
    body: JSON.stringify({ chatId: session.chatId, data: session }),
  });
export const deleteSessionApi = (id) => json(`/api/sessions/${id}`, { method: "DELETE" });

// messages: [{ role: "user" | "assistant", content }]
// chatId (optional) tells the server to persist the exchange.
export function streamChat(messages, chatId, llmOpts, onChunk, signal) {
  return stream("/api/chat", { messages, chatId, ...llmOpts }, onChunk, signal);
}

// action: key string; custom: optional free-text instruction.
// chatHistory: optional — the full main-chat transcript this session opened from.
// ancestorHistory: optional — turns for every tab older than the immediate
// one this request's Context/sourceMessageText already covers.
// history/question: optional — continues that lens's chat (see server/index.js).
export function streamAction(
  { action, custom, selectedText, sourceMessageText, chatHistory, ancestorHistory, history, question },
  llmOpts,
  onChunk,
  signal
) {
  return stream(
    "/api/action",
    { action, custom, selectedText, sourceMessageText, chatHistory, ancestorHistory, history, question, ...llmOpts },
    onChunk,
    signal
  );
}
