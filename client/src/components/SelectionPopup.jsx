import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ACTIONS } from "../actions.js";

// Floating toolbar anchored above the current selection rect.
export default function SelectionPopup({ rect, range, container, portalTarget, onAction }) {
  const ref = useRef(null);
  const inputRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, pointerX: 0, placement: "above", ready: false });
  const [custom, setCustom] = useState("");

  // Position in the scroll container's content coordinates. The popup then
  // scrolls and clips with the selected text without any scroll-event JS.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    function position() {
      const anchor = range?.getBoundingClientRect() || rect;
      const { width, height } = el.getBoundingClientRect();
      const clip = container.getBoundingClientRect();
      let placement = "above";
      let viewportTop = anchor.top - height - 8;
      if (viewportTop < clip.top + 8) {
        viewportTop = anchor.bottom + 8;
        placement = "below";
      }
      viewportTop = Math.max(clip.top + 8, Math.min(viewportTop, clip.bottom - height - 8));
      let viewportLeft = anchor.left + anchor.width / 2 - width / 2;
      viewportLeft = Math.max(clip.left + 8, Math.min(viewportLeft, clip.right - width - 8));
      const top = viewportTop - clip.top + container.scrollTop;
      const left = viewportLeft - clip.left + container.scrollLeft;
      const pointerX = Math.max(14, Math.min(anchor.left + anchor.width / 2 - viewportLeft, width - 14));
      setPos({ top, left, pointerX, placement, ready: true });
    }

    position();
    const observer = new ResizeObserver(position);
    observer.observe(container);
    return () => observer.disconnect();
  }, [rect, range, container]);

  // Focus the "ask your own…" box whenever the popup appears (or moves to a
  // new selection). Runs off `pos` — the input is unfocusable while the popup
  // is still visibility:hidden waiting to be positioned. The highlight
  // overlay keeps the selected text visible.
  useEffect(() => {
    if (pos.ready) inputRef.current?.focus({ preventScroll: true });
  }, [pos]);

  useEffect(() => setCustom(""), [rect]);

  function submitCustom(e, concise = false) {
    e.preventDefault();
    const text = custom.trim();
    if (!text) return;
    onAction({ action: "custom", custom: text, label: text, concise });
  }

  return createPortal(
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
            onClick={(e) => onAction({ ...b, concise: e.shiftKey })}
            title="Shift+click for a concise answer"
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
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.shiftKey) submitCustom(e, true);
          }}
          onMouseDown={(e) => {
            // Don't let the click collapse the page selection; focus manually
            // so the highlighted text stays visible while you type.
            e.preventDefault();
            inputRef.current?.focus();
          }}
          placeholder="ask your own…"
        />
        <button
          type="submit"
          disabled={!custom.trim()}
          aria-label="Submit custom action"
          title="Shift+Enter or Shift+click for a concise answer"
          onClick={(e) => {
            if (e.shiftKey) submitCustom(e, true);
          }}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5 10h10M11 6l4 4-4 4" />
          </svg>
        </button>
      </form>
    </div>,
    portalTarget
  );
}
