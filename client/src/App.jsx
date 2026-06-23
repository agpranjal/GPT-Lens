import { useCallback, useEffect, useRef, useState } from "react";
import ChatView from "./components/ChatView.jsx";
import SelectionPopup from "./components/SelectionPopup.jsx";
import ActionModal from "./components/ActionModal.jsx";
import { streamChat, streamAction } from "./api.js";

let nextId = 0;

export default function App() {
  const [messages, setMessages] = useState([]); // { id, role, content }
  const [chatLoading, setChatLoading] = useState(false);

  // Active selection inside an assistant message: { selectedText, sourceMessageText, rect }
  const [selection, setSelection] = useState(null);

  // The action modal: null when closed, else { label, selectedText, status, text, error }
  const [modal, setModal] = useState(null);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Detect a text selection that lands inside an assistant message.
  useEffect(() => {
    function onMouseUp(e) {
      if (e.target.closest?.("[data-selection-popup]")) return; // ignore popup clicks

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
      setSelection({ selectedText: text, sourceMessageText: source.content, rect });
    }
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, []);

  const handleSend = useCallback(async (prompt) => {
    const userMsg = { id: ++nextId, role: "user", content: prompt };
    const assistantId = ++nextId;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setChatLoading(true);

    const history = [...messagesRef.current, userMsg].map(({ role, content }) => ({
      role,
      content,
    }));
    try {
      await streamChat(history, (chunk) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + chunk } : m
          )
        );
      });
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: `⚠️ ${err.message}` } : m
        )
      );
    } finally {
      setChatLoading(false);
    }
  }, []);

  const handleAction = useCallback(
    async ({ action, custom, label }) => {
      if (!selection) return;
      const { selectedText, sourceMessageText } = selection;
      setModal({ label, selectedText, status: "loading", text: "", error: "" });
      setSelection(null);
      window.getSelection()?.removeAllRanges();
      try {
        await streamAction({ action, custom, selectedText, sourceMessageText }, (chunk) => {
          setModal((m) =>
            m ? { ...m, status: "streaming", text: m.text + chunk } : m
          );
        });
        setModal((m) => (m ? { ...m, status: "done" } : m));
      } catch (err) {
        setModal((m) => (m ? { ...m, status: "error", error: err.message } : m));
      }
    },
    [selection]
  );

  return (
    <div className="app">
      <header className="app-header">
        <h1>select-to-ask</h1>
        <span className="hint">highlight any part of a reply to ask about it →</span>
      </header>
      <ChatView messages={messages} loading={chatLoading} onSend={handleSend} />
      {selection && <SelectionPopup rect={selection.rect} onAction={handleAction} />}
      {modal && <ActionModal modal={modal} onClose={() => setModal(null)} />}
    </div>
  );
}
