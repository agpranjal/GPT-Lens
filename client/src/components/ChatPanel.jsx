// Collapsible left rail listing stored chats (most recently updated first).
// Same slide-open-on-hover behavior as the sessions rail on the right.
import { useEffect, useRef, useState } from "react";
import { searchChats } from "../api.js";

function ChatsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

// "2m ago" style timestamp for the chat list.
function timeAgo(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Day bucket for grouping the list (it's already sorted newest-first).
function dayGroup(ts) {
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(new Date());
  if (ts >= today) return "Today";
  if (ts >= today - 86400000) return "Yesterday";
  if (ts >= today - 6 * 86400000) return "This week";
  return "Earlier";
}

// Pull the first ~120 chars around the query match for the result snippet.
function makeSnippet(content, query) {
  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return content.slice(0, 120);
  const start = Math.max(0, idx - 40);
  const end = Math.min(content.length, idx + query.length + 80);
  return (start > 0 ? "…" : "") + content.slice(start, end) + (end < content.length ? "…" : "");
}

export default function ChatPanel({
  chats,
  activeId,
  collapsed,
  onExpand,
  onCollapse,
  onNewChat,
  onOpen,
  onDelete,
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      searchChats(q)
        .then(({ results }) => setResults(results))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const isSearching = query.trim().length > 0;

  return (
    <aside
      className={`side-panel left${collapsed ? " collapsed" : ""}`}
      onMouseEnter={onExpand}
      onMouseLeave={onCollapse}
    >
      <div className="panel-rail">
        <span className="panel-toggle" title="Chats">
          <ChatsIcon />
        </span>
      </div>

      <div className="panel-body">
        <div className="panel-header">
          <span className="panel-title">Chats {!isSearching && chats.length > 0 && `(${chats.length})`}</span>
          <button className="panel-new" onClick={onNewChat} title="New chat">
            + New
          </button>
        </div>

        <div className="panel-search-wrap">
          <input
            ref={inputRef}
            className="panel-search"
            type="text"
            placeholder="Search chats…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          />
          {isSearching && (
            <button className="panel-search-clear" onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label="Clear search">✕</button>
          )}
        </div>

        <div className="panel-list">
          {isSearching ? (
            searching ? (
              <div className="panel-empty">Searching…</div>
            ) : results.length === 0 ? (
              <div className="panel-empty">No results for "{query}"</div>
            ) : (
              results.map((r) => (
                <div
                  key={r.chatId}
                  className={`panel-item${r.chatId === activeId ? " active" : ""}`}
                  onClick={() => onOpen(r.chatId)}
                  title={r.title}
                >
                  <div className="panel-item-text">
                    <div className="panel-item-title">{r.title}</div>
                    <div className="panel-item-sub">{makeSnippet(r.snippet, query.trim())}</div>
                  </div>
                </div>
              ))
            )
          ) : chats.length === 0 ? (
            <div className="panel-empty">Your chats will appear here once you send a message.</div>
          ) : (
            chats.map((c, i) => {
              const group = dayGroup(c.updated_at);
              const isNewGroup = i === 0 || dayGroup(chats[i - 1].updated_at) !== group;
              return (
                <div key={c.id}>
                  {isNewGroup && <div className="panel-group">{group}</div>}
                  <div
                    className={`panel-item${c.id === activeId ? " active" : ""}`}
                    onClick={() => onOpen(c.id)}
                    title={c.title}
                  >
                    <div className="panel-item-text">
                      <div className="panel-item-title">{c.title}</div>
                      <div className="panel-item-sub">{timeAgo(c.updated_at)}</div>
                    </div>
                    <button
                      className="panel-item-del"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(c.id);
                      }}
                      title="Delete"
                      aria-label="Delete chat"
                    >
                      <svg viewBox="0 0 20 20" aria-hidden="true">
                        <path d="m4 4 12 12M16 4 4 16" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
