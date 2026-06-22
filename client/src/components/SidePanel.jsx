// Right-hand panel of stacked action cards (newest first).
export default function SidePanel({ cards }) {
  return (
    <aside className="side-panel">
      <header className="panel-header">Selections</header>
      <div className="cards">
        {cards.length === 0 && (
          <div className="empty">
            Highlight text in a reply and pick an action — results show up here.
          </div>
        )}
        {cards.map((c) => (
          <div key={c.id} className="card">
            <div className="card-action">{c.action}</div>
            <blockquote className="card-snippet">{c.selectedText}</blockquote>
            {c.status === "loading" && <div className="card-body muted">thinking…</div>}
            {c.status === "error" && (
              <div className="card-body error">⚠️ {c.error}</div>
            )}
            {c.status === "done" && <div className="card-body">{c.text}</div>}
          </div>
        ))}
      </div>
    </aside>
  );
}
