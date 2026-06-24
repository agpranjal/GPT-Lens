import { useEffect, useState } from "react";
import Markdown from "./Markdown.jsx";
import { ACTIONS } from "../actions.js";

function shorten(text, n = 28) {
  const t = (text || "").trim().replace(/\s+/g, " ");
  return t.length > n ? t.slice(0, n) + "…" : t;
}

// Modal showing a navigable stack of selection-action explanations.
// - Breadcrumbs (top) = drill-down depth (different snippets).
// - Chip row = different lenses on the SAME snippet; click to generate/switch.
export default function ActionModal({ modal, onClose, onNavigate, onVariant, onStop }) {
  const { frames, index } = modal;
  const frame = frames[index];
  const current = frame.variants[frame.activeKey];
  const streaming = current.status === "loading" || current.status === "streaming";
  const [custom, setCustom] = useState("");

  // Close on Escape.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Custom variants created on this frame (in creation order), for chips.
  const customKeys = frame.order.filter((k) => frame.variants[k]?.kind === "custom");

  // All chips (standard actions + custom), with the active one moved to front.
  const chips = [
    ...ACTIONS.map((a) => ({
      key: a.action,
      display: a.label,
      payload: a,
      generated: !!frame.variants[a.action],
    })),
    ...customKeys.map((k) => {
      const v = frame.variants[k];
      return {
        key: k,
        display: shorten(v.label, 20),
        payload: { custom: v.custom, label: v.label },
        generated: true,
      };
    }),
  ];
  const orderedChips = [...chips].sort((x, y) =>
    x.key === frame.activeKey ? -1 : y.key === frame.activeKey ? 1 : 0
  );

  function submitCustom(e) {
    e.preventDefault();
    const text = custom.trim();
    if (!text) return;
    onVariant({ custom: text, label: text });
    setCustom("");
  }

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
                  {shorten(f.selectedText)}
                </button>
              </span>
            ))}
          </nav>
          <div className="modal-actions">
            {streaming && (
              <button className="modal-stop" onClick={onStop}>
                Stop
              </button>
            )}
            <button className="modal-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </header>

        <div className="modal-content">
          <div className="modal-meta">
            <blockquote className="modal-snippet">{frame.selectedText}</blockquote>
          </div>

          {/* lenses on this snippet — horizontally scrollable, never wraps.
              the active chip is moved to the front. */}
          <div className="variant-chips">
            {orderedChips.map((c) => (
              <button
                key={c.key}
                className={`chip${c.key === frame.activeKey ? " active" : ""}${
                  c.generated ? " generated" : ""
                }`}
                onClick={() => onVariant(c.payload)}
                title={c.display}
              >
                {c.display}
              </button>
            ))}
            <form className="chip-custom" onSubmit={submitCustom}>
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="ask your own…"
              />
            </form>
          </div>

          <div className="modal-body" data-modal-body>
            {current.status === "loading" && <div className="muted">thinking…</div>}
            {current.status === "error" && (
              <div className="error">⚠️ {current.error}</div>
            )}
            {(current.status === "streaming" || current.status === "done") && (
              <Markdown>{current.text || ""}</Markdown>
            )}
            {current.status === "streaming" && <span className="caret">▍</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
