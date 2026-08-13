import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Message from "./Message.jsx";
import Welcome from "./Welcome.jsx";
import Dots from "./Dots.jsx";

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
    // Nothing to follow in an empty chat, and the welcome screen can be taller
    // than the window — pinning that to the bottom would hide its top.
    if (stickRef.current && messages.length) el.scrollTop = el.scrollHeight;
    setAwayFromBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 150);
  }, [messages]);

  // A whole new message (you sent one, a reply began, a chat was opened)
  // re-engages follow even if the reader had scrolled away from the previous one.
  useEffect(() => {
    stickRef.current = true;
    if (messages.length) endRef.current?.scrollIntoView({ behavior: "smooth" });
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
      <div
        className={`messages${messages.length === 0 ? " is-empty" : ""}`}
        ref={listRef}
        onScroll={onScroll}
      >
        <div className="selection-popup-layer" data-selection-layer />
        {messages.length === 0 && <Welcome onSend={onSend} />}
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
          className={`jump-to-bottom${loading ? " generating" : ""}`}
          onClick={scrollToBottom}
          title={loading ? "Follow generation" : "Jump to latest"}
          aria-label={loading ? "Follow generation" : "Jump to latest"}
        >
          {loading ? (
            <Dots />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5v14M6.5 13.5 12 19l5.5-5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
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
            placeholder="Type a message…"
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
