import { useEffect } from "react";
import Markdown from "./Markdown.jsx";

// Modal showing the result of a selection action. Streams text in as it arrives.
export default function ActionModal({ modal, onClose }) {
  const { label, selectedText, status, text, error } = modal;

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
          <span className="modal-label">{label}</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <blockquote className="modal-snippet">{selectedText}</blockquote>
        <div className="modal-body">
          {status === "loading" && <div className="muted">thinking…</div>}
          {status === "error" && <div className="error">⚠️ {error}</div>}
          {(status === "streaming" || status === "done") && (
            <Markdown>{text || ""}</Markdown>
          )}
          {status === "streaming" && <span className="caret">▍</span>}
        </div>
      </div>
    </div>
  );
}
