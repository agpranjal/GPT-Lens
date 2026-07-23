import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Markdown from "./Markdown.jsx";
import Dots from "./Dots.jsx";

function shorten(text, n = 28) {
  const t = (text || "").trim().replace(/\s+/g, " ");
  return t.length > n ? t.slice(0, n) + "…" : t;
}


// Modal showing a navigable stack of selection-action explanations.
// - Tabs (top) = drill-down depth (different snippets) and different lenses
//   on the same snippet — each lens opens as its own tab (see onVariant).
// - Follow-up box (bottom) = continue chatting about the CURRENT lens (plain
//   Enter), or ask it as a fresh lens in a new tab (Cmd/Ctrl+Enter). The
//   thread is stored on the variant itself, so it persists across tab switches.
export default function ActionModal({ modal, onClose, onNavigate, onVariant, onAskFollowUp, onCloseFrame, onStopStream }) {
  const { frames, index } = modal;
  const frame = frames[index];
  const current = frame.variants[frame.activeKey];
  const streaming = current.status === "loading" || current.status === "streaming";
  const followUpStreaming = current.followUps?.some(
    (f) => f.status === "loading" || f.status === "streaming"
  );
  const anyStreaming = streaming || followUpStreaming;
  const [followUp, setFollowUp] = useState("");
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const followUpInputRef = useRef(null);
  const dockRef = useRef(null);
  const bodyRef = useRef(null);
  const activeCrumbRef = useRef(null);
  const scrollPositions = useRef({}); // frame.id -> last scrollTop in .modal-body

  // The body element is shared by every breadcrumb, so restore the frame's own
  // scroll position when navigating; positions are saved in onScroll below.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = scrollPositions.current[frame.id] ?? 0;
  }, [frame.id]);

  // Keep the active breadcrumb in view when the tab row overflows.
  useLayoutEffect(() => {
    activeCrumbRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [index]);

  function closeFollowUp() {
    setFollowUpOpen(false);
    followUpInputRef.current?.blur();
  }

  // Clear/collapse the follow-up box when switching frames/lenses — it was
  // meant for a different context.
  useEffect(() => {
    setFollowUp("");
    setFollowUpOpen(false);
  }, [frame.id, frame.activeKey]);

  useEffect(() => {
    if (followUpOpen) followUpInputRef.current?.focus();
  }, [followUpOpen]);

  // Escape closes the follow-up box if open, else the modal; "/" opens the
  // follow-up box; ←/→ move between frames (unless typing in an input).
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        // A selection popup on screen owns Esc (the app-level handler dismisses it).
        if (document.querySelector("[data-selection-popup]")) return;
        if (followUpOpen) closeFollowUp();
        else onClose();
        return;
      }
      // Cmd/Ctrl+M toggles maximize — works even while typing in an input,
      // since "m" isn't otherwise bound. Note: on macOS this key combo is
      // normally "minimize window", which some browsers intercept before a
      // page ever sees the keydown — same class of issue as Cmd+W earlier.
      if ((e.metaKey || e.ctrlKey) && (e.key === "m" || e.key === "M")) {
        e.preventDefault();
        setMaximized((m) => !m);
        return;
      }
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      // Cmd/Ctrl+X closes the current tab (never the first — that's the root).
      // Placed after the input guard so Cmd+X still cuts text inside inputs.
      if ((e.metaKey || e.ctrlKey) && (e.key === "x" || e.key === "X")) {
        if (index > 0) {
          e.preventDefault();
          onCloseFrame(index);
        }
        return;
      }
      if (e.key === "/" && !followUpOpen) {
        // A selection popup on screen owns "/" (it focuses its own input).
        if (document.querySelector("[data-selection-popup]")) return;
        e.preventDefault();
        setFollowUpOpen(true);
        return;
      }
      if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      else if (e.key === "ArrowRight" && index < frames.length - 1) onNavigate(index + 1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onNavigate, onCloseFrame, index, frames.length, followUpOpen]);

  function submitFollowUp(e) {
    e.preventDefault();
    const text = followUp.trim();
    if (!text || anyStreaming) return;
    onAskFollowUp(text);
    setFollowUp("");
    closeFollowUp();
  }

  // Cmd/Ctrl+Enter (or Cmd/Ctrl+click Send) from the follow-up box asks it as
  // a fresh lens in a NEW tab instead of appending to the current one — same
  // snippet, but its own thread, for when the follow-up is really a tangent.
  function askFollowUpAsNewTab() {
    const text = followUp.trim();
    if (!text || anyStreaming) return;
    onVariant({ custom: text, label: text });
    setFollowUp("");
    closeFollowUp();
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className={`modal${maximized ? " maximized" : ""}`}
        onMouseDown={(e) => {
          e.stopPropagation();
          // Click anywhere in the modal other than the follow-up dock itself
          // closes the follow-up box (it stays open only for deliberate typing).
          if (followUpOpen && dockRef.current && !dockRef.current.contains(e.target)) {
            closeFollowUp();
          }
        }}
      >
        <header className="modal-header">
          <nav className="modal-tabs" role="tablist">
            {frames.map((f, i) => (
              <div
                key={f.id}
                className={`modal-tab${i === index ? " active" : ""}`}
                ref={i === index ? activeCrumbRef : null}
                onClick={() => onNavigate(i)}
                title={f.selectedText}
                role="tab"
                aria-selected={i === index}
              >
                <span className="modal-tab-label">{shorten(f.tabLabel || f.selectedText)}</span>
                {i > 0 && (
                  <button
                    className="modal-tab-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseFrame(i);
                    }}
                    title="Close tab (⌘X)"
                    aria-label="Close tab"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </nav>
          <div className="modal-actions">
            {/* Cut the answer short without closing the tab — whatever has
                streamed in so far stays on screen and stays drillable. */}
            {anyStreaming && (
              <button
                className="modal-stop"
                onClick={onStopStream}
                title="Stop generating (esc closes)"
                aria-label="Stop generating"
              >
                <svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true">
                  <rect x="2" y="2" width="10" height="10" rx="2" fill="currentColor" />
                </svg>
                Stop
              </button>
            )}
            <button
              className="modal-maximize"
              onClick={(e) => {
                setMaximized((m) => !m);
                e.currentTarget.blur();
              }}
              title={maximized ? "Restore" : "Maximize"}
              aria-label={maximized ? "Restore" : "Maximize"}
            >
              {maximized ? "⤡" : "⤢"}
            </button>
            <button className="modal-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </header>

        <div className="modal-content">
          <div className="modal-meta">
            <blockquote className="modal-snippet">{frame.selectedText}</blockquote>
          </div>

          <div
            className="modal-body"
            data-modal-body
            ref={bodyRef}
            onScroll={(e) => {
              scrollPositions.current[frame.id] = e.currentTarget.scrollTop;
            }}
          >
            {current.status === "loading" && <Dots />}
            {current.status === "error" && (
              <div className="error">⚠️ {current.error}</div>
            )}
            {(current.status === "streaming" || current.status === "done") && (
              <>
                <Markdown>{current.text || ""}</Markdown>
                {current.followUps?.map((f) => (
                  <div key={f.id} className="followup">
                    <div className="followup-q">{f.question}</div>
                    <div className="followup-a">
                      {f.status === "loading" && <Dots />}
                      {f.status === "error" && <div className="error">⚠️ {f.error}</div>}
                      {(f.status === "streaming" || f.status === "done") && (
                        <Markdown>{f.answer || ""}</Markdown>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          <div ref={dockRef} className={`followup-dock${followUpOpen ? " open" : ""}`}>
              <button
                type="button"
                className="followup-fab"
                onClick={() => setFollowUpOpen(true)}
                title="Ask a follow-up (/)"
                aria-label="Ask a follow-up"
              >
                💬
              </button>
              <form className="modal-followup" onSubmit={submitFollowUp}>
                <input
                  ref={followUpInputRef}
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      askFollowUpAsNewTab();
                    }
                  }}
                  placeholder="Ask a follow-up… (⌘⏎ for a new tab)"
                  disabled={anyStreaming}
                />
                <button
                  type="submit"
                  disabled={anyStreaming || !followUp.trim()}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey) {
                      e.preventDefault();
                      askFollowUpAsNewTab();
                    }
                  }}
                  title="Send (⌘+click for a new tab)"
                >
                  Send
                </button>
              </form>
          </div>
        </div>
      </div>
    </div>
  );
}
