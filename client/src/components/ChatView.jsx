import { useEffect, useRef, useState } from "react";
import Message from "./Message.jsx";

export default function ChatView({ messages, loading, onSend, onStop, focusToken }) {
  const [input, setInput] = useState("");
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Show a "jump to bottom" pill once the reader scrolls up past a threshold.
  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    setAwayFromBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 150);
  }

  const scrollToBottom = () =>
    endRef.current?.scrollIntoView({ behavior: "smooth" });

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

  // Scroll to the bottom only when a new message is added (e.g. you send one),
  // not on every streamed chunk — so the view stays put while a reply streams in.
  useEffect(() => {
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
          <div className="empty">Hey !</div>
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
            placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
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
