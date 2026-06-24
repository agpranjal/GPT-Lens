import { useCallback, useEffect, useRef, useState } from "react";
import ChatView from "./components/ChatView.jsx";
import SelectionPopup from "./components/SelectionPopup.jsx";
import ActionModal from "./components/ActionModal.jsx";
import { streamChat, streamAction } from "./api.js";

let nextId = 0;

// Stable key for a variant: the action instruction, or "custom:<text>".
const variantKey = ({ action, custom }) => (custom ? `custom:${custom}` : action);

export default function App() {
  const [messages, setMessages] = useState([]); // { id, role, content }
  const [chatLoading, setChatLoading] = useState(false);

  // Active selection: { selectedText, sourceMessageText, rect }
  const [selection, setSelection] = useState(null);

  // The action modal: null when closed, else a navigable stack of frames.
  //   frame = { id, selectedText, sourceMessageText, variants, order, activeKey }
  //   variant = { key, kind, action, custom, label, status, text, error }
  // Breadcrumbs (frames) = drill-down depth; variants = different lenses on the
  // same snippet (toggle between them without re-asking).
  const [modal, setModal] = useState(null);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const modalRef = useRef(modal);
  modalRef.current = modal;

  const abortRef = useRef(null); // chat stream
  const actionAbortRef = useRef(null); // modal action stream

  // Detect a text selection inside an assistant message OR the modal body.
  useEffect(() => {
    function onMouseUp(e) {
      if (e.target.closest?.("[data-selection-popup]")) return;

      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (!text || sel.isCollapsed) {
        setSelection(null);
        return;
      }
      const anchorEl =
        sel.anchorNode?.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
      const rect = sel.getRangeAt(0).getBoundingClientRect();

      // Inside the modal: source is the explanation currently shown.
      if (anchorEl?.closest?.("[data-modal-body]")) {
        const m = modalRef.current;
        if (m) {
          const frame = m.frames[m.index];
          const v = frame.variants[frame.activeKey];
          setSelection({ selectedText: text, sourceMessageText: v?.text || "", rect });
        }
        return;
      }

      // Inside a chat assistant message.
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
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamChat(
        history,
        (chunk) =>
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + chunk } : m
            )
          ),
        controller.signal
      );
    } catch (err) {
      if (err.name === "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId && m.content === ""
              ? { ...m, content: "*(stopped)*" }
              : m
          )
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: `⚠️ ${err.message}` } : m
          )
        );
      }
    } finally {
      setChatLoading(false);
      abortRef.current = null;
    }
  }, []);

  const handleStop = useCallback(() => abortRef.current?.abort(), []);

  // Stream an action result into a specific frame's variant (by frame id + key).
  const streamIntoVariant = useCallback(async (frameId, key, payload) => {
    const setVariant = (patch) =>
      setModal((m) =>
        m
          ? {
              ...m,
              frames: m.frames.map((f) =>
                f.id === frameId
                  ? {
                      ...f,
                      variants: {
                        ...f.variants,
                        [key]: { ...f.variants[key], ...patch },
                      },
                    }
                  : f
              ),
            }
          : m
      );

    const controller = new AbortController();
    actionAbortRef.current = controller;
    try {
      await streamAction(
        payload,
        (chunk) =>
          setModal((m) =>
            m
              ? {
                  ...m,
                  frames: m.frames.map((f) =>
                    f.id === frameId
                      ? {
                          ...f,
                          variants: {
                            ...f.variants,
                            [key]: {
                              ...f.variants[key],
                              status: "streaming",
                              text: f.variants[key].text + chunk,
                            },
                          },
                        }
                      : f
                  ),
                }
              : m
          ),
        controller.signal
      );
      setVariant({ status: "done" });
    } catch (err) {
      if (err.name === "AbortError") {
        setModal((m) =>
          m
            ? {
                ...m,
                frames: m.frames.map((f) =>
                  f.id === frameId
                    ? {
                        ...f,
                        variants: {
                          ...f.variants,
                          [key]: {
                            ...f.variants[key],
                            status: "done",
                            text: f.variants[key].text || "*(stopped)*",
                          },
                        },
                      }
                    : f
                ),
              }
            : m
        );
      } else {
        setVariant({ status: "error", error: err.message });
      }
    } finally {
      if (actionAbortRef.current === controller) actionAbortRef.current = null;
    }
  }, []);

  // From a selection (chat or modal body): push a NEW frame (drill-down).
  const handleAction = useCallback(
    async ({ action, custom, label }) => {
      if (!selection) return;
      const { selectedText, sourceMessageText } = selection;
      const frameId = ++nextId;
      const key = variantKey({ action, custom });
      const variant = {
        key,
        kind: custom ? "custom" : "action",
        action,
        custom,
        label: label || custom || action,
        status: "loading",
        text: "",
        error: "",
      };
      const frame = {
        id: frameId,
        selectedText,
        sourceMessageText,
        variants: { [key]: variant },
        order: [key],
        selectedOrder: [key], // chip display order, most-recently-clicked first
        activeKey: key,
      };
      setModal((m) => {
        if (!m) return { frames: [frame], index: 0 };
        const frames = [...m.frames.slice(0, m.index + 1), frame];
        return { frames, index: frames.length - 1 };
      });
      setSelection(null);
      window.getSelection()?.removeAllRanges();
      await streamIntoVariant(frameId, key, { action, custom, selectedText, sourceMessageText });
    },
    [selection, streamIntoVariant]
  );

  // Run a different action on the CURRENT frame's snippet (same-snippet lens).
  // If that variant already exists, just switch to it (cached, instant).
  const handleVariant = useCallback(
    async ({ action, custom, label }) => {
      const m = modalRef.current;
      if (!m) return;
      const frame = m.frames[m.index];
      const key = variantKey({ action, custom });

      if (frame.variants[key]) {
        setModal((mm) =>
          mm
            ? {
                ...mm,
                frames: mm.frames.map((f) =>
                  f.id === frame.id
                    ? {
                        ...f,
                        activeKey: key,
                        selectedOrder: [key, ...f.selectedOrder.filter((k) => k !== key)],
                      }
                    : f
                ),
              }
            : mm
        );
        return;
      }

      const variant = {
        key,
        kind: custom ? "custom" : "action",
        action,
        custom,
        label: label || custom || action,
        status: "loading",
        text: "",
        error: "",
      };
      setModal((mm) =>
        mm
          ? {
              ...mm,
              frames: mm.frames.map((f) =>
                f.id === frame.id
                  ? {
                      ...f,
                      variants: { ...f.variants, [key]: variant },
                      order: [...f.order, key],
                      selectedOrder: [key, ...f.selectedOrder.filter((k) => k !== key)],
                      activeKey: key,
                    }
                  : f
              ),
            }
          : mm
      );
      await streamIntoVariant(frame.id, key, {
        action,
        custom,
        selectedText: frame.selectedText,
        sourceMessageText: frame.sourceMessageText,
      });
    },
    [streamIntoVariant]
  );

  const handleNavigate = useCallback((index) => {
    setModal((m) => (m ? { ...m, index } : m));
  }, []);

  const handleStopAction = useCallback(() => actionAbortRef.current?.abort(), []);

  const handleCloseModal = useCallback(() => {
    actionAbortRef.current?.abort();
    setModal(null);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>learnmaxx</h1>
        <span className="hint">highlight any part of a reply to ask about it →</span>
      </header>
      <ChatView
        messages={messages}
        loading={chatLoading}
        onSend={handleSend}
        onStop={handleStop}
      />
      {selection && <SelectionPopup rect={selection.rect} onAction={handleAction} />}
      {modal && (
        <ActionModal
          modal={modal}
          onClose={handleCloseModal}
          onNavigate={handleNavigate}
          onVariant={handleVariant}
          onStop={handleStopAction}
        />
      )}
    </div>
  );
}
