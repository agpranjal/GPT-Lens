import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ACTIONS } from "../actions.js";

// Floating toolbar anchored above the current selection rect.
export default function SelectionPopup({ rect, onAction }) {
  const ref = useRef(null);
  const inputRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, pointerX: 0, placement: "above", ready: false });
  const [custom, setCustom] = useState("");

  // Position after mount so we know the popup's own size, and clamp to viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    let placement = "above";
    let top = rect.top - height - 8;
    if (top < 8) {
      top = rect.bottom + 8;
      placement = "below";
    }
    // Keep the popup fully on-screen even for very tall selections (e.g. a
    // whole code block), where "below" would otherwise land under the composer.
    top = Math.max(8, Math.min(top, window.innerHeight - height - 8));
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    const pointerX = Math.max(14, Math.min(rect.left + rect.width / 2 - left, width - 14));
    setPos({ top, left, pointerX, placement, ready: true });
  }, [rect]);

  // Focus the "ask your own…" box whenever the popup appears (or moves to a
  // new selection). Runs off `pos` — the input is unfocusable while the popup
  // is still visibility:hidden waiting to be positioned. The highlight
  // overlay keeps the selected text visible.
  useEffect(() => {
    if (pos.ready) inputRef.current?.focus({ preventScroll: true });
  }, [pos]);

  useEffect(() => setCustom(""), [rect]);

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
      className={`selection-popup ${pos.placement}`}
      style={{
        top: pos.top,
        left: pos.left,
        "--popup-pointer-x": `${pos.pointerX}px`,
        visibility: pos.ready ? "visible" : "hidden",
      }}
    >
      {/* preventDefault on the buttons keeps the highlight from flickering when
          clicked; the custom input is left free so it can receive focus. */}
      <div className="popup-buttons" onMouseDown={(e) => e.preventDefault()}>
        {ACTIONS.map((b) => (
          <button
            key={b.action}
            onClick={() => onAction(b)}
          >
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
        <button type="submit" disabled={!custom.trim()} aria-label="Submit custom action">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5 10h10M11 6l4 4-4 4" />
          </svg>
        </button>
      </form>
    </div>
  );
}
