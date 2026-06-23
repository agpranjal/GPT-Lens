import { useEffect, useRef, useState } from "react";
import Message from "./Message.jsx";

export default function ChatView({ messages, loading, onSend, onStop }) {
  const [input, setInput] = useState("");
  const endRef = useRef(null);
  const inputRef = useRef(null);

  // Focus the message box when the app opens, so you can type right away.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
      <div className="messages">
        {messages.length === 0 && (
          <div className="empty">Hey !</div>
        )}
        {messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
        <div ref={endRef} />
      </div>
      <form className="composer" onSubmit={submit}>
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
          <button type="button" className="stop-btn" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()}>
            Send
          </button>
        )}
      </form>
    </div>
  );
}
