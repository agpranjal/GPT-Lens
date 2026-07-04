// Collapsible right rail listing the current chat's saved modal sessions.
// Slides open on hover, slides shut when the pointer leaves.

// A panel/sidebar glyph shown on the collapsed strip.
function SidebarIcon() {
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
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="9" y1="4" x2="9" y2="20" />
    </svg>
  );
}

export default function SessionPanel({
  sessions,
  activeId,
  collapsed,
  onExpand,
  onCollapse,
  onOpen,
  onDelete,
}) {
  return (
    <aside
      className={`side-panel right${collapsed ? " collapsed" : ""}`}
      onMouseEnter={onExpand}
      onMouseLeave={onCollapse}
    >
      <div className="panel-rail">
        <span className="panel-toggle" title="Saved sessions">
          <SidebarIcon />
          {sessions.length > 0 && <span className="panel-count">{sessions.length}</span>}
        </span>
      </div>

      <div className="panel-body">
        <div className="panel-header">
          <span className="panel-title">
            Saved {sessions.length > 0 && `(${sessions.length})`}
          </span>
        </div>
        <div className="panel-list">
          {sessions.length === 0 ? (
            <div className="panel-empty">
              Saved sessions appear here. Highlight text in a reply and pick an action.
            </div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className={`panel-item${s.id === activeId ? " active" : ""}`}
                onClick={() => onOpen(s.id)}
                title={s.title}
              >
                <div className="panel-item-text">
                  <div className="panel-item-title">{s.title}</div>
                  <div className="panel-item-sub">{s.label}</div>
                </div>
                <button
                  className="panel-item-del"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(s.id);
                  }}
                  title="Delete"
                  aria-label="Delete session"
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
