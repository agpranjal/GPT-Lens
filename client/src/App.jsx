import { useCallback, useEffect, useRef, useState } from "react";
import ChatView from "./components/ChatView.jsx";
import SelectionPopup from "./components/SelectionPopup.jsx";
import ActionModal from "./components/ActionModal.jsx";
import SessionPanel from "./components/SessionPanel.jsx";
import ModelSelector from "./components/ModelSelector.jsx";
import { streamChat, streamAction, fetchQuestions, fetchModels } from "./api.js";
import { QUESTIONS_KEY } from "./actions.js";

let nextId = 0;

// Stable key for a variant: questions, custom:<text>, or the action instruction.
const variantKey = ({ action, custom, questions }) =>
  questions ? QUESTIONS_KEY : custom ? `custom:${custom}` : action;

// Build a fresh variant object for a given payload.
const makeVariant = ({ action, custom, label, questions }) => {
  const key = variantKey({ action, custom, questions });
  return {
    key,
    kind: questions ? "questions" : custom ? "custom" : "action",
    action,
    custom,
    label: label || custom || action || "Questions",
    status: "loading",
    text: "",
    error: "",
    questions: [],
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

export default function App() {
  const [messages, setMessages] = useState([]); // { id, role, content }
  const [chatLoading, setChatLoading] = useState(false);

  // Active selection: { selectedText, sourceMessageText, rect, origin }
  const [selection, setSelection] = useState(null);

  // Saved modal sessions (in-memory only — a reload clears everything).
  //   session = { id, title, label, createdAt, frames, index }
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
        setModel(defaultModel);
        setReasoning(defaultReasoning);
      })
      .catch(() => {}); // dropdown just stays hidden if this fails
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

      // Inside the modal: source is the explanation currently shown (drill-down).
      if (anchorEl?.closest?.("[data-modal-body]")) {
        const s = sessionsRef.current.find((x) => x.id === activeIdRef.current);
        if (s) {
          const frame = s.frames[s.index];
          const v = frame.variants[frame.activeKey];
          setSelection({
            selectedText: text,
            sourceMessageText: v?.text || "",
            rect,
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
      setSelection({
        selectedText: text,
        sourceMessageText: source.content,
        rect,
        origin: "chat",
      });
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
    }
  }, []);

  const handleStop = useCallback(() => abortRef.current?.abort(), []);

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

  // Fetch suggested questions into a frame's questions-variant (non-streaming).
  const runQuestions = useCallback(
    async (sessionId, frameId, key, payload) => {
      try {
        const { questions } = await fetchQuestions(payload, llmOptsRef.current);
        patchFrameVariant(sessionId, frameId, key, {
          status: "done",
          questions: questions || [],
        });
      } catch (err) {
        patchFrameVariant(sessionId, frameId, key, {
          status: "error",
          error: err.message,
        });
      }
    },
    [patchFrameVariant]
  );

  // Kick off the right backend call for a variant (questions vs streamed action).
  const runVariant = useCallback(
    (sessionId, frameId, payload, snippet) => {
      const key = variantKey(payload);
      if (payload.questions)
        return runQuestions(sessionId, frameId, key, snippet);
      return streamIntoVariant(sessionId, frameId, key, { ...payload, ...snippet });
    },
    [runQuestions, streamIntoVariant]
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
        // Drill-down: append a frame to the active session (truncating any
        // forward frames from the current position).
        sessionId = activeIdRef.current;
        setSessions((ss) =>
          ss.map((s) => {
            if (s.id !== sessionId) return s;
            const kept = s.frames.slice(0, s.index + 1);
            return { ...s, frames: [...kept, frame], index: kept.length };
          })
        );
      } else {
        // New session, appended so the latest sits at the bottom of the panel.
        sessionId = ++nextId;
        const session = {
          id: sessionId,
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

  // Run a different action on the CURRENT frame's snippet (same-snippet lens).
  // If that variant already exists, just switch to it (cached, instant).
  const handleVariant = useCallback(
    async (payload) => {
      const sessionId = activeIdRef.current;
      const s = sessionsRef.current.find((x) => x.id === sessionId);
      if (!s) return;
      const frame = s.frames[s.index];
      const key = variantKey(payload);

      if (frame.variants[key]) {
        setSessions((ss) =>
          ss.map((x) =>
            x.id !== sessionId
              ? x
              : {
                  ...x,
                  frames: x.frames.map((f) =>
                    f.id !== frame.id
                      ? f
                      : {
                          ...f,
                          activeKey: key,
                          selectedOrder: [
                            key,
                            ...f.selectedOrder.filter((k) => k !== key),
                          ],
                        }
                  ),
                }
          )
        );
        return;
      }

      const variant = makeVariant(payload);
      setSessions((ss) =>
        ss.map((x) =>
          x.id !== sessionId
            ? x
            : {
                ...x,
                frames: x.frames.map((f) =>
                  f.id !== frame.id
                    ? f
                    : {
                        ...f,
                        variants: { ...f.variants, [key]: variant },
                        order: [...f.order, key],
                        selectedOrder: [
                          key,
                          ...f.selectedOrder.filter((k) => k !== key),
                        ],
                        activeKey: key,
                      }
                ),
              }
        )
      );
      await runVariant(sessionId, frame.id, payload, {
        selectedText: frame.selectedText,
        sourceMessageText: frame.sourceMessageText,
      });
    },
    [runVariant]
  );

  const handleNavigate = useCallback((index) => {
    const sessionId = activeIdRef.current;
    setSessions((ss) => ss.map((s) => (s.id === sessionId ? { ...s, index } : s)));
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
      if (!variant || variant.kind === "questions") return;

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
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>skillmaxx</h1>
        <ModelSelector
          models={modelOptions.models}
          reasoningLevels={modelOptions.reasoningLevels}
          model={model}
          reasoning={reasoning}
          onModelChange={setModel}
          onReasoningChange={setReasoning}
        />
      </header>
      <div className="app-main">
        <SessionPanel
          sessions={sessions}
          activeId={activeId}
          collapsed={panelCollapsed}
          onExpand={() => setPanelCollapsed(false)}
          onCollapse={() => setPanelCollapsed(true)}
          onOpen={handleOpenSession}
          onDelete={handleDeleteSession}
        />
        <ChatView
          messages={messages}
          loading={chatLoading}
          onSend={handleSend}
          onStop={handleStop}
        />
      </div>
      {selection && <SelectionPopup rect={selection.rect} onAction={handleAction} />}
      {activeSession && (
        <ActionModal
          modal={activeSession}
          onClose={handleCloseModal}
          onNavigate={handleNavigate}
          onVariant={handleVariant}
          onAskFollowUp={handleAskFollowUp}
          onStop={handleStopAction}
        />
      )}
    </div>
  );
}
