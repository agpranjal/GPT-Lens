import { useEffect } from "react";
import Markdown from "./Markdown.jsx";

function crumbLabel(text) {
  const t = (text || "").trim().replace(/\s+/g, " ");
  return t.length > 28 ? t.slice(0, 28) + "…" : t;
}

// Modal showing a navigable stack of selection-action explanations.
// Highlighting text inside the body and picking an action pushes a new frame.
export default function ActionModal({ modal, onClose, onNavigate }) {
  const { frames, index } = modal;
  const current = frames[index];

  // Close on Escape.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <nav className="modal-breadcrumbs">
            {frames.map((f, i) => (
              <span key={f.id} className="crumb-wrap">
                {i > 0 && <span className="crumb-sep">›</span>}
                <button
                  className={`crumb${i === index ? " active" : ""}`}
                  onClick={() => onNavigate(i)}
                  title={f.selectedText}
                >
                  {crumbLabel(f.selectedText)}
                </button>
              </span>
            ))}
          </nav>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal-label">{current.label}</div>
        <blockquote className="modal-snippet">{current.selectedText}</blockquote>

        <div className="modal-body" data-modal-body>
          {current.status === "loading" && <div className="muted">thinking…</div>}
          {current.status === "error" && <div className="error">⚠️ {current.error}</div>}
          {(current.status === "streaming" || current.status === "done") && (
            <Markdown>{current.text || ""}</Markdown>
          )}
          {current.status === "streaming" && <span className="caret">▍</span>}
        </div>
      </div>
    </div>
  );
}
