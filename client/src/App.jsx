import { useCallback, useEffect, useRef, useState } from "react";
import ChatView from "./components/ChatView.jsx";
import SelectionPopup from "./components/SelectionPopup.jsx";
import ActionModal from "./components/ActionModal.jsx";
import SessionPanel from "./components/SessionPanel.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import ModelSelector from "./components/ModelSelector.jsx";
import {
  streamChat,
  streamAction,
  fetchModels,
  fetchChats,
  createChat,
  fetchChat,
  deleteChat,
  saveSession,
  deleteSessionApi,
} from "./api.js";

// Seeded from the clock so ids never collide with ones persisted by an
// earlier page load (plain ++ from 0 would repeat after a reload).
let nextId = Date.now();

// Stable key for a variant: custom:<text>, or the action instruction.
const variantKey = ({ action, custom }) =>
  custom ? `custom:${custom}` : action;

// Build a fresh variant object for a given payload.
const makeVariant = ({ action, custom, label }) => {
  const key = variantKey({ action, custom });
  return {
    key,
    kind: custom ? "custom" : "action",
    action,
    custom,
    label: label || custom || action,
    status: "loading",
    text: "",
    error: "",
    // Follow-up chat continuing THIS lens's answer — persists per-variant, so
    // switching chips and coming back keeps the thread where it was left.
    followUps: [], // { id, question, answer, status, error }
  };
};

// Short title for the saved-sessions panel.
const shorten = (text, n = 44) => {
  const t = (text || "").trim().replace(/\s+/g, " ");
  return t.length > n ? t.slice(0, n) + "…" : t;
};

// Intersect a viewport rect with a clipping element's box. Our selection
// highlight is position:fixed at the document root, so without clipping it to
// the scroll container it lives in, a tall selection paints blocks outside
// that container (e.g. below the modal). Returns null when there's no overlap.
const clipRectToEl = (r, clipEl) => {
  if (!clipEl) return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom };
  const c = clipEl.getBoundingClientRect();
  const top = Math.max(r.top, c.top);
  const left = Math.max(r.left, c.left);
  const right = Math.min(r.right, c.right);
  const bottom = Math.min(r.bottom, c.bottom);
  if (right <= left || bottom <= top) return null;
  return { top, left, width: right - left, height: bottom - top, bottom };
};
const clipRectsToEl = (rects, clipEl) =>
  rects.map((r) => clipRectToEl(r, clipEl)).filter(Boolean);

export default function App() {
  const [messages, setMessages] = useState([]); // { id, role, content }
  const [chatLoading, setChatLoading] = useState(false);

  // Stored chats (left rail). `chatId` is the open chat's DB id; null means a
  // fresh chat that gets created in the DB on the first send.
  const [chats, setChats] = useState([]);
  const [chatId, setChatId] = useState(null);
  const [chatPanelCollapsed, setChatPanelCollapsed] = useState(true);
  const chatIdRef = useRef(chatId);
  chatIdRef.current = chatId;

  // Active selection: { selectedText, sourceMessageText, rect, origin }
  const [selection, setSelection] = useState(null);

  // Bumped whenever the composer should grab focus (new chat, chat open, "/").
  const [focusToken, setFocusToken] = useState(0);
  const focusComposer = useCallback(() => setFocusToken((t) => t + 1), []);

  // Saved modal sessions for the OPEN chat (persisted to SQLite, scoped per chat).
  //   session = { id, chatId, title, label, createdAt, frames, index }
  //   frame   = { id, selectedText, sourceMessageText, variants, order, activeKey }
  //   variant = { key, kind, action, custom, label, status, text, error }
  // A session is one thing you selected in chat; frames are drill-down depth
  // (breadcrumbs); variants are different lenses on the same snippet.
  const [sessions, setSessions] = useState([]);
  // Which session is open in the modal (null = modal closed).
  const [activeId, setActiveId] = useState(null);
  const [panelCollapsed, setPanelCollapsed] = useState(true);

  // Model + reasoning picker (header). Loaded from the server's curated
  // allowlist; resets to the server default on reload, same as everything else.
  const [modelOptions, setModelOptions] = useState({ models: [], reasoningLevels: [] });
  const [model, setModel] = useState("");
  const [reasoning, setReasoning] = useState("");
  const llmOptsRef = useRef({ model: "", reasoning: "" });
  llmOptsRef.current = { model, reasoning };

  useEffect(() => {
    fetchModels()
      .then(({ models, reasoningLevels, defaultModel, defaultReasoning }) => {
        setModelOptions({ models, reasoningLevels });
        const savedModel = localStorage.getItem("skillmaxx:model");
        const savedReasoning = localStorage.getItem("skillmaxx:reasoning");
        setModel(models.some((m) => m.id === savedModel) ? savedModel : defaultModel);
        setReasoning(
          reasoningLevels.some((r) => r.id === savedReasoning) ? savedReasoning : defaultReasoning
        );
      })
      .catch(() => {}); // dropdown just stays hidden if this fails
  }, []);

  // Load the stored-chats list once on mount.
  useEffect(() => {
    fetchChats()
      .then(({ chats }) => setChats(chats))
      .catch(() => {}); // rail just stays empty if the server is down
  }, []);

  // Persist the user's picks so they survive a reload.
  const handleModelChange = useCallback((id) => {
    setModel(id);
    localStorage.setItem("skillmaxx:model", id);
  }, []);
  const handleReasoningChange = useCallback((id) => {
    setReasoning(id);
    localStorage.setItem("skillmaxx:reasoning", id);
  }, []);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const abortRef = useRef(null); // chat stream
  const actionAbortRef = useRef(null); // modal action stream

  const activeSession = sessions.find((s) => s.id === activeId) || null;
  const activeChatTitle = chats.find((c) => c.id === chatId)?.title || "";

  // Keep the browser tab in sync with the open chat.
  useEffect(() => {
    document.title = activeChatTitle ? `${activeChatTitle} — skillmaxx` : "skillmaxx";
  }, [activeChatTitle]);

  // Update one frame's variant within a session (fn receives the prev variant).
  const updateFrameVariant = useCallback((sessionId, frameId, key, fn) => {
    setSessions((ss) =>
      ss.map((s) =>
        s.id !== sessionId
          ? s
          : {
              ...s,
              frames: s.frames.map((f) =>
                f.id !== frameId
                  ? f
                  : {
                      ...f,
                      variants: { ...f.variants, [key]: fn(f.variants[key]) },
                    }
              ),
            }
      )
    );
  }, []);

  const patchFrameVariant = useCallback(
    (sessionId, frameId, key, patch) =>
      updateFrameVariant(sessionId, frameId, key, (v) => ({ ...v, ...patch })),
    [updateFrameVariant]
  );

  // Detect a text selection inside an assistant message OR the modal body.
  useEffect(() => {
    // Any press outside the popup dismisses it immediately — don't wait for
    // mouseup to notice the selection is gone.
    function onMouseDown(e) {
      if (e.target.closest?.("[data-selection-popup]")) return;
      setSelection(null);
    }

    function onMouseUp(e) {
      if (e.target.closest?.("[data-selection-popup]")) return;
      // Defer one tick: clicking ON highlighted text collapses the selection
      // only AFTER mouseup fires, so reading it synchronously here would still
      // see the old selection and resurrect the popup we just dismissed.
      setTimeout(() => handleSelectionSettled(), 0);
    }

    function handleSelectionSettled() {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (!text || sel.isCollapsed) {
        setSelection(null);
        return;
      }
      const anchorEl =
        sel.anchorNode?.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
      const range = sel.getRangeAt(0);
      const rawRect = range.getBoundingClientRect();
      // Per-line rects for our own highlight overlay — the native highlight
      // stops being painted once focus moves into the popup's input.
      const rawHighlightRects = Array.from(range.getClientRects());

      // Inside the modal: source is the explanation currently shown (drill-down).
      const modalBody = anchorEl?.closest?.("[data-modal-body]");
      if (modalBody) {
        const s = sessionsRef.current.find((x) => x.id === activeIdRef.current);
        if (s) {
          const frame = s.frames[s.index];
          const v = frame.variants[frame.activeKey];
          // Clip to the scroll container so a tall selection (e.g. selecting a
          // whole code block) doesn't paint highlight blocks outside the modal.
          setSelection({
            selectedText: text,
            sourceMessageText: v?.text || "",
            rect: clipRectToEl(rawRect, modalBody) || rawRect,
            highlightRects: clipRectsToEl(rawHighlightRects, modalBody),
            origin: "modal",
          });
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
      const messagesEl = msgEl.closest(".messages");
      setSelection({
        selectedText: text,
        sourceMessageText: source.content,
        rect: clipRectToEl(rawRect, messagesEl) || rawRect,
        highlightRects: clipRectsToEl(rawHighlightRects, messagesEl),
        origin: "chat",
      });
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mouseup", onMouseUp);
    };
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

    // First message of a fresh chat: create the DB row so the server can
    // persist the exchange. If this fails the chat just stays unsaved.
    let currentChatId = chatIdRef.current;
    if (currentChatId == null) {
      try {
        const chat = await createChat(shorten(prompt, 60));
        currentChatId = chat.id;
        setChatId(chat.id);
        setChats((cs) => [chat, ...cs]);
      } catch {
        currentChatId = null;
      }
    }

    const history = [...messagesRef.current, userMsg].map(({ role, content }) => ({
      role,
      content,
    }));
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamChat(
        history,
        currentChatId,
        llmOptsRef.current,
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
      // Refresh the rail so titles/ordering reflect the latest activity.
      fetchChats().then(({ chats }) => setChats(chats)).catch(() => {});
    }
  }, []);

  const handleStop = useCallback(() => abortRef.current?.abort(), []);

  // ---- stored chats (left rail) ----

  const resetToFreshChat = useCallback(() => {
    abortRef.current?.abort();
    actionAbortRef.current?.abort();
    setMessages([]);
    setSessions([]);
    setActiveId(null);
    setChatId(null);
    focusComposer();
  }, [focusComposer]);

  const handleOpenChat = useCallback(
    async (id) => {
      if (id === chatIdRef.current) return;
      abortRef.current?.abort();
      actionAbortRef.current?.abort();
      try {
        const chat = await fetchChat(id);
        setMessages(chat.messages);
        setSessions(chat.sessions);
        setActiveId(null);
        setChatId(id);
        focusComposer();
      } catch (err) {
        console.error("failed to open chat:", err);
      }
    },
    [focusComposer]
  );

  const handleDeleteChat = useCallback(
    (id) => {
      // DB cascade removes the chat's sessions along with it.
      deleteChat(id).catch(() => {});
      setChats((cs) => cs.filter((c) => c.id !== id));
      if (id === chatIdRef.current) resetToFreshChat();
    },
    [resetToFreshChat]
  );

  // Esc dismisses the selection popup — at the CAPTURE phase, with
  // stopPropagation, so it always wins over whatever's underneath it (e.g.
  // the modal's own Esc-to-close). Capture always runs before bubble-phase
  // listeners regardless of when each was attached, so this can't lose a
  // race against the modal's handler depending on mount/subscribe timing.
  useEffect(() => {
    function onKeyCapture(e) {
      if (e.key !== "Escape") return;
      if (!document.querySelector("[data-selection-popup]")) return;
      e.stopPropagation();
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    }
    document.addEventListener("keydown", onKeyCapture, true);
    return () => document.removeEventListener("keydown", onKeyCapture, true);
  }, []);

  // Global shortcuts: cmd/ctrl+shift+O starts a new chat; "/" focuses the
  // composer. With the modal open, "/" is left to the modal's own handler
  // (it opens the floating follow-up box there).
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        resetToFreshChat();
        return;
      }
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        // Selection popup showing → its "ask your own…" box wins.
        const popupInput = document.querySelector("[data-selection-popup] input");
        if (popupInput) {
          e.preventDefault();
          popupInput.focus();
          return;
        }
        if (activeIdRef.current != null) return; // modal open — its handler owns "/"
        e.preventDefault();
        focusComposer();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [resetToFreshChat, focusComposer]);

  // Stream an action result into a specific session/frame variant.
  const streamIntoVariant = useCallback(
    async (sessionId, frameId, key, payload) => {
      const controller = new AbortController();
      actionAbortRef.current = controller;
      try {
        await streamAction(
          payload,
          llmOptsRef.current,
          (chunk) =>
            updateFrameVariant(sessionId, frameId, key, (v) => ({
              ...v,
              status: "streaming",
              text: v.text + chunk,
            })),
          controller.signal
        );
        patchFrameVariant(sessionId, frameId, key, { status: "done" });
      } catch (err) {
        if (err.name === "AbortError") {
          updateFrameVariant(sessionId, frameId, key, (v) => ({
            ...v,
            status: "done",
            text: v.text || "*(stopped)*",
          }));
        } else {
          patchFrameVariant(sessionId, frameId, key, {
            status: "error",
            error: err.message,
          });
        }
      } finally {
        if (actionAbortRef.current === controller) actionAbortRef.current = null;
      }
    },
    [updateFrameVariant, patchFrameVariant]
  );

  // Kick off the streamed backend call for a variant.
  const runVariant = useCallback(
    (sessionId, frameId, payload, snippet) => {
      const key = variantKey(payload);
      return streamIntoVariant(sessionId, frameId, key, { ...payload, ...snippet });
    },
    [streamIntoVariant]
  );

  // From a selection: start a NEW session (chat origin) or push a drill-down
  // frame onto the active session (modal origin).
  const handleAction = useCallback(
    async (payload) => {
      if (!selection) return;
      const { selectedText, sourceMessageText, origin } = selection;
      const frameId = ++nextId;
      const variant = makeVariant(payload);
      const key = variant.key;
      const frame = {
        id: frameId,
        selectedText,
        sourceMessageText,
        variants: { [key]: variant },
        order: [key],
        selectedOrder: [key], // chip display order, most-recently-clicked first
        activeKey: key,
      };

      let sessionId;
      if (origin === "modal" && activeIdRef.current != null) {
        // Drill-down: insert the new frame right after the current breadcrumb,
        // never truncating what's already there — re-drilling from an earlier
        // breadcrumb must not discard whatever was already generated past that
        // point, it just shifts further down the trail. parentId records which
        // frame this was drilled from (not shown in the breadcrumb row today,
        // but kept so that relationship isn't lost).
        sessionId = activeIdRef.current;
        setSessions((ss) =>
          ss.map((s) => {
            if (s.id !== sessionId) return s;
            const parentId = s.frames[s.index].id;
            const insertAt = s.index + 1;
            return {
              ...s,
              frames: [
                ...s.frames.slice(0, insertAt),
                { ...frame, parentId },
                ...s.frames.slice(insertAt),
              ],
              index: insertAt,
            };
          })
        );
      } else {
        // New session, appended so the latest sits at the bottom of the panel.
        sessionId = ++nextId;
        const session = {
          id: sessionId,
          chatId: chatIdRef.current, // owning chat; scopes the right rail + DB row
          title: shorten(selectedText),
          label: variant.label,
          createdAt: Date.now(),
          frames: [frame],
          index: 0,
        };
        setSessions((ss) => [...ss, session]);
        setActiveId(sessionId);
      }

      setSelection(null);
      window.getSelection()?.removeAllRanges();
      await runVariant(sessionId, frameId, payload, { selectedText, sourceMessageText });
    },
    [selection, runVariant]
  );

  // Apply a different lens (action chip or "ask your own") to the CURRENT
  // frame's snippet. Each lens opens as its OWN tab inserted right after the
  // current one — like opening a link in a new browser tab — rather than
  // swapping the current tab's body in place. Clicking the lens the current
  // tab already shows is a no-op.
  const handleVariant = useCallback(
    async (payload) => {
      const sessionId = activeIdRef.current;
      const s = sessionsRef.current.find((x) => x.id === sessionId);
      if (!s) return;
      const currentFrame = s.frames[s.index];
      const key = variantKey(payload);

      // Already looking at this lens in the current tab — nothing to do.
      if (currentFrame.activeKey === key) return;

      const frameId = ++nextId;
      const variant = makeVariant(payload);
      const newFrame = {
        id: frameId,
        parentId: currentFrame.id,
        // Same snippet as the source tab — the lens is a new view of it, so
        // further drill-downs and follow-ups still operate on this text.
        selectedText: currentFrame.selectedText,
        sourceMessageText: currentFrame.sourceMessageText,
        // The breadcrumb shows the lens (action/prompt), not the snippet, so
        // sibling lens-tabs on the same snippet stay distinguishable.
        tabLabel: variant.label,
        variants: { [key]: variant },
        order: [key],
        selectedOrder: [key],
        activeKey: key,
      };
      const insertAt = s.index + 1;
      setSessions((ss) =>
        ss.map((x) =>
          x.id !== sessionId
            ? x
            : {
                ...x,
                frames: [
                  ...x.frames.slice(0, insertAt),
                  newFrame,
                  ...x.frames.slice(insertAt),
                ],
                index: insertAt,
              }
        )
      );
      await runVariant(sessionId, frameId, payload, {
        selectedText: currentFrame.selectedText,
        sourceMessageText: currentFrame.sourceMessageText,
      });
    },
    [runVariant]
  );

  const handleNavigate = useCallback((index) => {
    const sessionId = activeIdRef.current;
    setSessions((ss) => ss.map((s) => (s.id === sessionId ? { ...s, index } : s)));
  }, []);

  // Remove a single breadcrumb (never the first). Only that frame goes away —
  // any frames drilled from it are left in place, just now parented to a
  // frame that no longer exists in the trail.
  const handleCloseFrame = useCallback((removeIndex) => {
    if (removeIndex === 0) return;
    const sessionId = activeIdRef.current;
    setSessions((ss) =>
      ss.map((s) => {
        if (s.id !== sessionId) return s;
        const frames = s.frames.filter((_, i) => i !== removeIndex);
        const index =
          s.index === removeIndex
            ? removeIndex - 1
            : s.index > removeIndex
            ? s.index - 1
            : s.index;
        return { ...s, frames, index };
      })
    );
  }, []);

  // Continue the CURRENT lens's chat with a follow-up question. Unlike a
  // chip (a fresh lens with no memory), this sends the full prior exchange —
  // the lens's own answer plus every completed follow-up — so the model
  // remembers what was already said.
  const handleAskFollowUp = useCallback(
    async (text) => {
      const sessionId = activeIdRef.current;
      const s = sessionsRef.current.find((x) => x.id === sessionId);
      if (!s) return;
      const frame = s.frames[s.index];
      const key = frame.activeKey;
      const variant = frame.variants[key];
      if (!variant) return;

      const followUpId = ++nextId;
      const history = [
        { role: "assistant", content: variant.text },
        ...variant.followUps
          .filter((f) => f.status === "done")
          .flatMap((f) => [
            { role: "user", content: f.question },
            { role: "assistant", content: f.answer },
          ]),
      ];

      updateFrameVariant(sessionId, frame.id, key, (v) => ({
        ...v,
        followUps: [...v.followUps, { id: followUpId, question: text, answer: "", status: "loading", error: "" }],
      }));

      const setFollowUp = (patch) =>
        updateFrameVariant(sessionId, frame.id, key, (v) => ({
          ...v,
          followUps: v.followUps.map((f) => (f.id === followUpId ? { ...f, ...patch } : f)),
        }));

      const controller = new AbortController();
      actionAbortRef.current = controller;
      try {
        await streamAction(
          {
            action: variant.action,
            custom: variant.custom,
            selectedText: frame.selectedText,
            sourceMessageText: frame.sourceMessageText,
            history,
            question: text,
          },
          llmOptsRef.current,
          (chunk) =>
            updateFrameVariant(sessionId, frame.id, key, (v) => ({
              ...v,
              followUps: v.followUps.map((f) =>
                f.id === followUpId ? { ...f, status: "streaming", answer: f.answer + chunk } : f
              ),
            })),
          controller.signal
        );
        setFollowUp({ status: "done" });
      } catch (err) {
        if (err.name === "AbortError") {
          updateFrameVariant(sessionId, frame.id, key, (v) => ({
            ...v,
            followUps: v.followUps.map((f) =>
              f.id === followUpId ? { ...f, status: "done", answer: f.answer || "*(stopped)*" } : f
            ),
          }));
        } else {
          setFollowUp({ status: "error", error: err.message });
        }
      } finally {
        if (actionAbortRef.current === controller) actionAbortRef.current = null;
      }
    },
    [updateFrameVariant]
  );

  const handleStopAction = useCallback(() => actionAbortRef.current?.abort(), []);

  // ---- session persistence (write-through, debounced) ----
  // Saves each session whenever it settles: skipped while anything inside is
  // still streaming (the status flip to done/error re-triggers the effect).
  const lastSavedRef = useRef(new Map()); // session.id -> last serialized form
  useEffect(() => {
    const t = setTimeout(() => {
      for (const s of sessions) {
        if (!s.chatId) continue; // chat row never got created; nothing to attach to
        const busy = s.frames.some((f) =>
          Object.values(f.variants).some(
            (v) =>
              v.status === "loading" ||
              v.status === "streaming" ||
              v.followUps?.some((fu) => fu.status === "loading" || fu.status === "streaming")
          )
        );
        if (busy) continue;
        const serialized = JSON.stringify(s);
        if (lastSavedRef.current.get(s.id) === serialized) continue;
        lastSavedRef.current.set(s.id, serialized);
        saveSession(s).catch(() => lastSavedRef.current.delete(s.id)); // retry on next change
      }
    }, 600);
    return () => clearTimeout(t);
  }, [sessions]);

  // Close the modal but keep the session in the panel.
  const handleCloseModal = useCallback(() => {
    actionAbortRef.current?.abort();
    setActiveId(null);
  }, []);

  const handleOpenSession = useCallback((id) => setActiveId(id), []);

  const handleDeleteSession = useCallback((id) => {
    if (id === activeIdRef.current) actionAbortRef.current?.abort();
    setSessions((ss) => ss.filter((s) => s.id !== id));
    setActiveId((cur) => (cur === id ? null : cur));
    lastSavedRef.current.delete(id);
    deleteSessionApi(id).catch(() => {});
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>skillmaxx</h1>
        {activeChatTitle && (
          <span className="header-chat-title" title={activeChatTitle}>
            {activeChatTitle}
          </span>
        )}
        <ModelSelector
          models={modelOptions.models}
          reasoningLevels={modelOptions.reasoningLevels}
          model={model}
          reasoning={reasoning}
          onModelChange={handleModelChange}
          onReasoningChange={handleReasoningChange}
        />
      </header>
      <div className="app-main">
        <ChatPanel
          chats={chats}
          activeId={chatId}
          collapsed={chatPanelCollapsed}
          onExpand={() => setChatPanelCollapsed(false)}
          onCollapse={() => setChatPanelCollapsed(true)}
          onNewChat={resetToFreshChat}
          onOpen={handleOpenChat}
          onDelete={handleDeleteChat}
        />
        <ChatView
          messages={messages}
          loading={chatLoading}
          onSend={handleSend}
          onStop={handleStop}
          focusToken={focusToken}
        />
        <SessionPanel
          sessions={sessions}
          activeId={activeId}
          collapsed={panelCollapsed}
          onExpand={() => setPanelCollapsed(false)}
          onCollapse={() => setPanelCollapsed(true)}
          onOpen={handleOpenSession}
          onDelete={handleDeleteSession}
        />
      </div>
      {selection && (
        <>
          {/* Our own copy of the highlight, so it survives focus moving into
              the popup's input (the native one stops painting then). */}
          <div className="selection-highlight" aria-hidden="true">
            {selection.highlightRects?.map((r, i) => (
              <div
                key={i}
                className="selection-highlight-rect"
                style={{ top: r.top, left: r.left, width: r.width, height: r.height }}
              />
            ))}
          </div>
          <SelectionPopup rect={selection.rect} onAction={handleAction} />
        </>
      )}
      {activeSession && (
        <ActionModal
          modal={activeSession}
          onClose={handleCloseModal}
          onNavigate={handleNavigate}
          onVariant={handleVariant}
          onAskFollowUp={handleAskFollowUp}
          onStop={handleStopAction}
          onCloseFrame={handleCloseFrame}
        />
      )}
    </div>
  );
}
