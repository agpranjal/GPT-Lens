import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Message from "./Message.jsx";

// Starters for the empty state. They double as a demo of what the app is for:
// ask something meaty, then highlight any part of the answer to drill in.
const STARTERS = [
  "Explain how HTTPS actually works, end to end",
  "What is a database index, and when does it hurt?",
  "Walk me through how React decides to re-render",
  "Explain event loops like I've never seen one",
];

export default function ChatView({ messages, loading, onSend, onStop, focusToken }) {
  const [input, setInput] = useState("");
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  // Whether the view should keep following new content. True while the reader
  // is parked at (or near) the bottom; flipped off the moment they scroll up
  // to re-read something, so a streaming reply never yanks the page away.
  const stickRef = useRef(true);

  function distanceFromBottom() {
    const el = listRef.current;
    return el ? el.scrollHeight - el.scrollTop - el.clientHeight : 0;
  }

  // Scrolling up past a small threshold disengages follow; coming back within
  // it re-engages. The "jump to bottom" pill uses a larger threshold so it
  // doesn't flash on tiny scrolls.
  function onScroll() {
    const d = distanceFromBottom();
    stickRef.current = d < 40;
    setAwayFromBottom(d > 150);
  }

  function scrollToBottom() {
    stickRef.current = true;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  // Focus the message box on mount and whenever the app requests it
  // (opening a chat, starting a new one, pressing "/").
  useEffect(() => {
    inputRef.current?.focus();
  }, [focusToken]);

  // Grow the box with the prompt, up to the CSS max-height (then it scrolls).
  // Recomputed on window resize too — wrapping changes with width.
  useEffect(() => {
    function resize() {
      const el = inputRef.current;
      if (!el) return;
      el.style.height = "auto";
      const max = parseFloat(getComputedStyle(el).maxHeight) || 200;
      el.style.height = Math.min(el.scrollHeight, max) + "px";
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [input]);

  // Follow the stream chunk by chunk, but only while stuck to the bottom.
  // Jumping straight to scrollHeight (rather than a smooth scroll) keeps the
  // text steady as it grows instead of chasing it with an easing animation.
  // Also re-derives the pill from the DOM: switching chats replaces the list
  // without firing a scroll event, so stale state would leave it visible.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (stickRef.current) el.scrollTop = el.scrollHeight;
    setAwayFromBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 150);
  }, [messages]);

  // A whole new message (you sent one, a reply began, a chat was opened)
  // re-engages follow even if the reader had scrolled away from the previous one.
  useEffect(() => {
    stickRef.current = true;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function submit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    onSend(text);
    setInput("");
    inputRef.current?.focus(); // keep focus for the next message
  }

  return (
    <div className="chat-view">
      <div className="messages" ref={listRef} onScroll={onScroll}>
        {messages.length === 0 && (
          <div className="empty">
            <h2 className="empty-title">What do you want to understand?</h2>
            <p className="empty-sub">
              Ask anything, then <strong>highlight any part of the answer</strong> to
              explain it, get an example, or go deeper — without losing your place.
            </p>
            <div className="empty-starters">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="empty-starter"
                  onClick={() => onSend(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="empty-hint">
              <kbd>/</kbd> jump to the message box · <kbd>⌘⇧O</kbd> new chat
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <Message
            key={m.id}
            message={m}
            streaming={loading && i === messages.length - 1}
          />
        ))}
        <div ref={endRef} />
      </div>
      {awayFromBottom && (
        <button
          type="button"
          className="jump-to-bottom"
          onClick={scrollToBottom}
          title="Jump to latest"
          aria-label="Jump to latest"
        >
          ↓
        </button>
      )}
      <form className="composer" onSubmit={submit}>
        <div className="composer-box">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) submit(e);
            }}
            placeholder="Type a message… (⏎ to send, ⇧⏎ for newline)"
            rows={1}
          />
          {loading ? (
            <button
              type="button"
              className="composer-btn stop"
              onClick={onStop}
              title="Stop"
              aria-label="Stop"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <rect x="2" y="2" width="10" height="10" rx="2" fill="currentColor" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              className="composer-btn"
              disabled={!input.trim()}
              title="Send"
              aria-label="Send"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 19V5" />
                <path d="M5 12l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
