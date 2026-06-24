import { useLayoutEffect, useRef, useState } from "react";
import { ACTIONS } from "../actions.js";

// Floating toolbar anchored above the current selection rect.
export default function SelectionPopup({ rect, onAction }) {
  const ref = useRef(null);
  const inputRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, ready: false });
  const [custom, setCustom] = useState("");

  // Position after mount so we know the popup's own size, and clamp to viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    let top = rect.top - height - 8;
    if (top < 8) top = rect.bottom + 8; // flip below if no room above
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    setPos({ top, left, ready: true });
  }, [rect]);

  function submitCustom(e) {
    e.preventDefault();
    const text = custom.trim();
    if (!text) return;
    onAction({ action: "custom", custom: text, label: text });
  }

  return (
    <div
      ref={ref}
      data-selection-popup
      className="selection-popup"
      style={{
        top: pos.top,
        left: pos.left,
        visibility: pos.ready ? "visible" : "hidden",
      }}
    >
      {/* preventDefault on the buttons keeps the highlight from flickering when
          clicked; the custom input is left free so it can receive focus. */}
      <div className="popup-buttons" onMouseDown={(e) => e.preventDefault()}>
        {ACTIONS.map((b) => (
          <button key={b.action} onClick={() => onAction(b)}>
            {b.label}
          </button>
        ))}
      </div>
      <form className="popup-custom" onSubmit={submitCustom}>
        <input
          ref={inputRef}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onMouseDown={(e) => {
            // Don't let the click collapse the page selection; focus manually
            // so the highlighted text stays visible while you type.
            e.preventDefault();
            inputRef.current?.focus();
          }}
          placeholder="ask your own…"
        />
        <button type="submit" disabled={!custom.trim()}>
          ↵
        </button>
      </form>
    </div>
  );
}
