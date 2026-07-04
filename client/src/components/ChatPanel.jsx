// Collapsible left rail listing stored chats (most recently updated first).
// Same slide-open-on-hover behavior as the sessions rail on the right.

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
  return (
    <aside
      className={`side-panel left${collapsed ? " collapsed" : ""}`}
      onMouseEnter={onExpand}
      onMouseLeave={onCollapse}
    >
      <div className="panel-rail">
        <span className="panel-toggle" title="Chats">
          <ChatsIcon />
          {chats.length > 0 && <span className="panel-count">{chats.length}</span>}
        </span>
      </div>

      <div className="panel-body">
        <div className="panel-header">
          <span className="panel-title">Chats {chats.length > 0 && `(${chats.length})`}</span>
          <button className="panel-new" onClick={onNewChat} title="New chat">
            + New
          </button>
        </div>
        <div className="panel-list">
          {chats.length === 0 ? (
            <div className="panel-empty">Your chats will appear here once you send a message.</div>
          ) : (
            chats.map((c) => (
              <div
                key={c.id}
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
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
