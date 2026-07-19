// SQLite persistence for chats and modal sessions.
// Chats/messages are normalized (messages append while streaming);
// sessions are stored as one JSON blob each — they're always read and
// written as a unit, so rows-per-frame would buy nothing here.
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "data");
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, "skillmaxx.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    data_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_chat ON sessions(chat_id);
`);

export function listChats() {
  return db
    .prepare("SELECT id, title, created_at, updated_at FROM chats ORDER BY updated_at DESC")
    .all();
}

export function createChat(title) {
  const now = Date.now();
  const { lastInsertRowid } = db
    .prepare("INSERT INTO chats (title, created_at, updated_at) VALUES (?, ?, ?)")
    .run(title, now, now);
  return { id: Number(lastInsertRowid), title, created_at: now, updated_at: now };
}

// Full chat payload for hydrating the client: messages + that chat's sessions.
export function getChat(id) {
  const chat = db.prepare("SELECT id, title FROM chats WHERE id = ?").get(id);
  if (!chat) return null;
  const messages = db
    .prepare("SELECT id, role, content FROM messages WHERE chat_id = ? ORDER BY id")
    .all(id);
  const sessions = db
    .prepare("SELECT data_json FROM sessions WHERE chat_id = ? ORDER BY created_at")
    .all(id)
    .map((r) => JSON.parse(r.data_json));
  return { ...chat, messages, sessions };
}

export function deleteChat(id) {
  db.prepare("DELETE FROM chats WHERE id = ?").run(id);
}

export function chatExists(id) {
  return !!db.prepare("SELECT 1 FROM chats WHERE id = ?").get(id);
}

export function addMessage(chatId, role, content) {
  const now = Date.now();
  db.prepare(
    "INSERT INTO messages (chat_id, role, content, created_at) VALUES (?, ?, ?, ?)"
  ).run(chatId, role, content, now);
  db.prepare("UPDATE chats SET updated_at = ? WHERE id = ?").run(now, chatId);
}

// Write-through upsert: the client owns the session shape, we just store it.
export function upsertSession(id, chatId, data) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (id, chat_id, data_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`
  ).run(String(id), chatId, JSON.stringify(data), now, now);
}

export function deleteSession(id) {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(String(id));
}

export function searchMessages(query) {
  const q = `%${query}%`;
  return db
    .prepare(
      `SELECT c.id AS chatId, c.title, m.content AS snippet, c.updated_at
       FROM messages m
       JOIN chats c ON c.id = m.chat_id
       WHERE m.content LIKE ? OR c.title LIKE ?
       GROUP BY c.id
       ORDER BY c.updated_at DESC
       LIMIT 30`
    )
    .all(q, q);
}
