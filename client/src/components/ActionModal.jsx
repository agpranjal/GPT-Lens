import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Markdown from "./Markdown.jsx";
import Dots from "./Dots.jsx";

function shorten(text, n = 28) {
  const t = (text || "").trim().replace(/\s+/g, " ");
  return t.length > n ? t.slice(0, n) + "…" : t;
}

function frameIsStreaming(frame) {
  const variant = frame.variants[frame.activeKey];
  return (
    variant?.status === "loading" ||
    variant?.status === "streaming" ||
    variant?.followUps?.some(
      (followUp) => followUp.status === "loading" || followUp.status === "streaming"
    )
  );
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
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [tabTooltip, setTabTooltip] = useState(null);
  const tabTooltipTimerRef = useRef(null);
  const followUpInputRef = useRef(null);
  const dockRef = useRef(null);
  const bodyRef = useRef(null);
  const tabsRef = useRef(null);
  const activeCrumbRef = useRef(null);
  const knownFrameIdsRef = useRef(new Set(frames.map((f) => String(f.id))));
  const scrollPositions = useRef({}); // frame.id -> last scrollTop in .modal-body
  const settlingRef = useRef(false); // true while a tab switch is settling
  const stickToFollowUpRef = useRef(false);

  function modalDistanceFromBottom() {
    const body = bodyRef.current;
    return body ? body.scrollHeight - body.scrollTop - body.clientHeight : 0;
  }

  function scrollModalToBottom() {
    const body = bodyRef.current;
    if (!body) return;
    stickToFollowUpRef.current = true;
    body.scrollTo({ top: body.scrollHeight, behavior: "smooth" });
    setAwayFromBottom(false);
  }

  useEffect(() => () => clearTimeout(tabTooltipTimerRef.current), []);

  function showTabTooltip(event, text) {
    clearTimeout(tabTooltipTimerRef.current);
    const tab = event.currentTarget;
    tabTooltipTimerRef.current = setTimeout(() => {
      const rect = tab.getBoundingClientRect();
      const halfWidth = Math.min(180, (window.innerWidth - 24) / 2);
      setTabTooltip({
        text,
        left: Math.max(12 + halfWidth, Math.min(rect.left + rect.width / 2, window.innerWidth - 12 - halfWidth)),
        top: rect.bottom + 4,
      });
    }, 180);
  }

  function hideTabTooltip() {
    clearTimeout(tabTooltipTimerRef.current);
    setTabTooltip(null);
  }

  // Record where the current tab is parked, right now. Called synchronously
  // before any navigation this component starts, because the scroll event is
  // not a reliable moment to save: scroll events are coalesced to one per
  // frame, so scrolling and then clicking a tab in the same frame delivers the
  // event AFTER the switch has rendered — filing the old tab's offset under
  // the new tab's id, which then reads as "this tab drifted" on the next visit.
  const rememberScroll = useCallback(() => {
    const el = bodyRef.current;
    if (el) scrollPositions.current[frame.id] = el.scrollTop;
  }, [frame.id]);

  // Switch tabs, saving the outgoing tab's position on the way out.
  const goTo = useCallback(
    (i) => {
      if (i === index) return;
      rememberScroll();
      onNavigate(i);
    },
    [index, rememberScroll, onNavigate]
  );

  // Each tab mounts its own body element (see the key below), so arriving at
  // one means arriving at a fresh scroller sitting at the top — put it back
  // where this tab was left. The assignment fires a scroll event of its own,
  // which lands after this commit, so scroll events are ignored until the
  // switch has settled rather than being allowed to overwrite what was just
  // restored.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    settlingRef.current = true;
    el.scrollTop = scrollPositions.current[frame.id] ?? 0;
    // Two frames: scroll events are dispatched just before requestAnimationFrame
    // callbacks, so one frame can still be mid-flight when the first fires.
    let inner;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        settlingRef.current = false;
        setAwayFromBottom(modalDistanceFromBottom() > 80);
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
      settlingRef.current = false;
    };
  }, [frame.id]);

  // Keep the active tab in view when the strip overflows. Scrolled by hand
  // rather than with scrollIntoView, which nudges EVERY scrollable ancestor:
  // .modal-tabs scrolls in the block axis too (declaring overflow-x computes
  // overflow-y to auto), and .modal is overflow:hidden — still programmatically
  // scrollable, and a pixel of sub-pixel rounding there is enough to shift the
  // whole modal a little on every single tab switch.
  useLayoutEffect(() => {
    const tab = activeCrumbRef.current;
    const strip = tabsRef.current;
    if (!tab || !strip) return;
    const t = tab.getBoundingClientRect();
    const s = strip.getBoundingClientRect();
    if (t.left < s.left) strip.scrollLeft -= s.left - t.left;
    else if (t.right > s.right) strip.scrollLeft += t.right - s.right;
  }, [index]);

  // Drill-down tabs are inserted in the background, so `index` deliberately
  // stays unchanged and the active-tab effect above does not run. Detect the
  // newly inserted frame and reveal it in the horizontal strip without
  // switching away from the answer the user is currently reading.
  useLayoutEffect(() => {
    const strip = tabsRef.current;
    const currentIds = new Set(frames.map((f) => String(f.id)));
    const addedFrame = frames.find((f) => !knownFrameIdsRef.current.has(String(f.id)));
    knownFrameIdsRef.current = currentIds;
    if (!strip || !addedFrame) return;

    const tab = Array.from(strip.children).find(
      (el) => el.dataset.frameId === String(addedFrame.id)
    );
    if (!tab) return;
    const t = tab.getBoundingClientRect();
    const s = strip.getBoundingClientRect();
    if (t.left < s.left) strip.scrollLeft -= s.left - t.left;
    else if (t.right > s.right) strip.scrollLeft += t.right - s.right;
  }, [frames]);

  function closeFollowUp() {
    setFollowUpOpen(false);
    followUpInputRef.current?.blur();
  }

  // Clear/collapse the follow-up box when switching frames/lenses — it was
  // meant for a different context.
  useEffect(() => {
    setFollowUp("");
    setFollowUpOpen(false);
    stickToFollowUpRef.current = false;
  }, [frame.id, frame.activeKey]);

  useEffect(() => {
    if (followUpOpen) followUpInputRef.current?.focus();
  }, [followUpOpen]);

  const latestFollowUp = current.followUps?.[current.followUps.length - 1];
  useLayoutEffect(() => {
    if (!stickToFollowUpRef.current || !latestFollowUp) return;
    const body = bodyRef.current;
    if (!body) return;
    body.scrollTop = body.scrollHeight;
    scrollPositions.current[frame.id] = body.scrollTop;
    setAwayFromBottom(false);
    if (latestFollowUp.status === "done" || latestFollowUp.status === "error") {
      stickToFollowUpRef.current = false;
    }
  }, [frame.id, latestFollowUp?.status, latestFollowUp?.answer]);

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
      if (e.key === "ArrowLeft" && index > 0) goTo(index - 1);
      else if (e.key === "ArrowRight" && index < frames.length - 1) goTo(index + 1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, goTo, onCloseFrame, index, frames.length, followUpOpen]);

  function submitFollowUp(e) {
    e.preventDefault();
    const text = followUp.trim();
    if (!text || anyStreaming) return;
    stickToFollowUpRef.current = true;
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
    rememberScroll(); // this tab is about to be left for the new one
    onVariant({ custom: text, label: text });
    setFollowUp("");
    closeFollowUp();
  }

  return (
    <>
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
          <nav className="modal-tabs" role="tablist" ref={tabsRef}>
            {frames.map((f, i) => {
              const tabStreaming = frameIsStreaming(f);
              return (
                <div
                  key={f.id}
                  data-frame-id={f.id}
                  className={`modal-tab${i === index ? " active" : ""}${tabStreaming ? " streaming" : ""}`}
                  ref={i === index ? activeCrumbRef : null}
                  onClick={() => goTo(i)}
                  onMouseEnter={(event) => showTabTooltip(event, (f.tabLabel || f.selectedText || "").trim())}
                  onMouseLeave={hideTabTooltip}
                  role="tab"
                  aria-selected={i === index}
                  aria-busy={tabStreaming}
                >
                  {tabStreaming && (
                    <span className="modal-tab-loading" aria-label="Response loading" />
                  )}
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
              );
            })}
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
              aria-label={maximized ? "Restore" : "Maximize"}
            >
              {maximized ? (
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M8 3v5H3M12 17v-5h5M8 8 3.5 3.5M12 12l4.5 4.5" />
                </svg>
              ) : (
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M8 8 3.5 3.5M3 7V3h4M12 12l4.5 4.5M13 17h4v-4" />
                </svg>
              )}
            </button>
            <button className="modal-close" onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m4 4 12 12M16 4 4 16" />
              </svg>
            </button>
          </div>
        </header>

        <div className="modal-content">
          <div className="modal-meta">
            <blockquote className="modal-snippet">{frame.selectedText}</blockquote>
          </div>

          {/* Keyed by frame, so every tab gets its OWN scroll container rather
              than swapping content through a shared one. A scroller carries
              live state the next tab has no business inheriting: an in-flight
              momentum fling from a trackpad (compositor-driven — assigning
              scrollTop does not cancel it), the browser's scroll anchoring
              adjustment, and the offset clamp applied when taller content is
              replaced by shorter. All of those land after the switch and nudge
              the arriving tab by a small amount. Mounting a fresh element
              leaves them attached to the outgoing node, which is by then
              detached and harmless. */}
          <div
            key={frame.id}
            className="modal-body"
            data-modal-body
            ref={bodyRef}
            onScroll={(e) => {
              if (settlingRef.current) return; // echo of the switch, not the reader
              scrollPositions.current[frame.id] = e.currentTarget.scrollTop;
              const distance = modalDistanceFromBottom();
              setAwayFromBottom(distance > 80);
              if (distance > 40) stickToFollowUpRef.current = false;
            }}
            onWheel={(e) => {
              if (e.deltaY < 0) stickToFollowUpRef.current = false;
            }}
            onTouchMove={() => { stickToFollowUpRef.current = false; }}
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

          {awayFromBottom && (
            <button
              type="button"
              className={`jump-to-bottom modal-jump-to-bottom${anyStreaming ? " generating" : ""}`}
              onClick={scrollModalToBottom}
              title={anyStreaming ? "Follow generation" : "Jump to latest"}
              aria-label={anyStreaming ? "Follow generation" : "Jump to latest"}
            >
              {anyStreaming ? (
                <Dots />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 5v14M6.5 13.5 12 19l5.5-5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          )}

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
    {tabTooltip && createPortal(
      <div
        className="modal-tab-tooltip"
        role="tooltip"
        style={{ left: tabTooltip.left, top: tabTooltip.top }}
      >
        {tabTooltip.text}
      </div>,
      document.body
    )}
    </>
  );
}
