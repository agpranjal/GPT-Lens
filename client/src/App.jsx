import { useCallback, useEffect, useRef, useState } from "react";
import ChatView from "./components/ChatView.jsx";
import SidePanel from "./components/SidePanel.jsx";
import SelectionPopup from "./components/SelectionPopup.jsx";
import { sendChat, sendAction } from "./api.js";

let cardId = 0;

export default function App() {
  const [messages, setMessages] = useState([]); // { id, role, content }
  const [chatLoading, setChatLoading] = useState(false);
  const [cards, setCards] = useState([]); // { id, action, selectedText, status, text, error }

  // Active selection inside an assistant message: { selectedText, sourceMessageText, rect }
  const [selection, setSelection] = useState(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Detect a text selection that lands inside an assistant message.
  useEffect(() => {
    function onMouseUp(e) {
      // Ignore clicks inside the popup itself.
      if (e.target.closest?.("[data-selection-popup]")) return;

      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (!text || sel.isCollapsed) {
        setSelection(null);
        return;
      }
      const anchorEl =
        sel.anchorNode?.nodeType === 3
          ? sel.anchorNode.parentElement
          : sel.anchorNode;
      const msgEl = anchorEl?.closest?.("[data-message-id]");
      if (!msgEl) {
        setSelection(null);
        return;
      }
      const id = msgEl.getAttribute("data-message-id");
      const source = messagesRef.current.find((m) => String(m.id) === id);
      if (!source) {
        setSelection(null);
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setSelection({
        selectedText: text,
        sourceMessageText: source.content,
        rect,
      });
    }
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, []);

  const handleSend = useCallback(async (prompt) => {
    const userMsg = { id: ++cardId, role: "user", content: prompt };
    const history = [...messagesRef.current, userMsg];
    setMessages(history);
    setChatLoading(true);
    try {
      const { text } = await sendChat(
        history.map(({ role, content }) => ({ role, content }))
      );
      setMessages((prev) => [
        ...prev,
        { id: ++cardId, role: "assistant", content: text },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: ++cardId, role: "assistant", content: `⚠️ ${err.message}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, []);

  const handleAction = useCallback(
    async ({ action, custom, label }) => {
      if (!selection) return;
      const { selectedText, sourceMessageText } = selection;
      const id = ++cardId;
      setCards((prev) => [
        { id, action: label, selectedText, status: "loading", text: "" },
        ...prev,
      ]);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
      try {
        const { text } = await sendAction({
          action,
          custom,
          selectedText,
          sourceMessageText,
        });
        setCards((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: "done", text } : c))
        );
      } catch (err) {
        setCards((prev) =>
          prev.map((c) =>
            c.id === id ? { ...c, status: "error", error: err.message } : c
          )
        );
      }
    },
    [selection]
  );

  return (
    <div className="app">
      <main className="chat-pane">
        <header className="app-header">
          <h1>select-to-ask</h1>
          <span className="hint">
            highlight any part of a reply to ask about it →
          </span>
        </header>
        <ChatView
          messages={messages}
          loading={chatLoading}
          onSend={handleSend}
        />
      </main>
      <SidePanel cards={cards} />
      {selection && (
        <SelectionPopup rect={selection.rect} onAction={handleAction} />
      )}
    </div>
  );
}
