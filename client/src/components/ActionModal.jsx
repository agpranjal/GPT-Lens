import { useEffect, useRef, useState } from "react";
import Markdown from "./Markdown.jsx";
import Dots from "./Dots.jsx";
import { ACTIONS, QUESTIONS_KEY } from "../actions.js";

function shorten(text, n = 28) {
  const t = (text || "").trim().replace(/\s+/g, " ");
  return t.length > n ? t.slice(0, n) + "…" : t;
}

// Modal showing a navigable stack of selection-action explanations.
// - Breadcrumbs (top) = drill-down depth (different snippets).
// - Chip row = different lenses on the SAME snippet; click to generate/switch.
// - Follow-up box (bottom) = continue chatting about the CURRENT lens; the
//   thread is stored on the variant itself, so it persists across chip switches.
export default function ActionModal({ modal, onClose, onNavigate, onVariant, onAskFollowUp, onStop }) {
  const { frames, index } = modal;
  const frame = frames[index];
  const current = frame.variants[frame.activeKey];
  const streaming = current.status === "loading" || current.status === "streaming";
  const followUpStreaming = current.followUps?.some(
    (f) => f.status === "loading" || f.status === "streaming"
  );
  const anyStreaming = streaming || followUpStreaming;
  const [custom, setCustom] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const followUpInputRef = useRef(null);
  const dockRef = useRef(null);

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
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "/" && !followUpOpen && current.kind !== "questions") {
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
  }, [onClose, onNavigate, index, frames.length, followUpOpen, current.kind]);

  // Custom variants created on this frame (in creation order), for chips.
  const customKeys = frame.order.filter((k) => frame.variants[k]?.kind === "custom");

  // The "Questions" chip is pinned to the front (never reordered by MRU).
  const questionsChip = {
    key: QUESTIONS_KEY,
    display: "✨ ?",
    title: "Suggested questions (AI)",
    payload: { questions: true, label: "Questions" },
    generated: !!frame.variants[QUESTIONS_KEY],
    special: true,
  };
  // The rest of the chips: standard actions, then customs (these get MRU-sorted).
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
  // Clicked chips lead, most-recent first (MRU); the rest keep default order.
  const rank = (key) => {
    const i = frame.selectedOrder.indexOf(key);
    return i === -1 ? Infinity : i;
  };
  const orderedChips = [
    questionsChip,
    ...[...chips].sort((x, y) => {
      const rx = rank(x.key);
      const ry = rank(y.key);
      return rx === ry ? 0 : rx - ry;
    }),
  ];

  function submitCustom(e) {
    e.preventDefault();
    const text = custom.trim();
    if (!text) return;
    onVariant({ custom: text, label: text });
    setCustom("");
  }

  function submitFollowUp(e) {
    e.preventDefault();
    const text = followUp.trim();
    if (!text || anyStreaming) return;
    onAskFollowUp(text);
    setFollowUp("");
    closeFollowUp();
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal"
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
            {anyStreaming && (
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
                }${c.special ? " chip-special" : ""}`}
                onClick={() => onVariant(c.payload)}
                title={c.title || c.display}
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
            {current.status === "loading" && <Dots />}
            {current.status === "error" && (
              <div className="error">⚠️ {current.error}</div>
            )}
            {current.kind === "questions"
              ? current.status === "done" && (
                  <div className="questions-list">
                    <div className="questions-hint">Pick a question to explore:</div>
                    {current.questions.map((q, i) => (
                      <button
                        key={i}
                        className="question-item"
                        onClick={() => onVariant({ custom: q, label: q })}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )
              : (current.status === "streaming" || current.status === "done") && (
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

          {current.kind !== "questions" && (
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
                  placeholder="Ask a follow-up…"
                  disabled={anyStreaming}
                />
                <button type="submit" disabled={anyStreaming || !followUp.trim()}>
                  Send
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
