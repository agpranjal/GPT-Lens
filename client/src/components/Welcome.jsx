// The empty-chat screen. It carries the app's only onboarding, so rather than
// describing the selection/drill-down mechanic in a sentence it shows it: a
// mock answer with a phrase highlighted and the real action popup floating
// above it, played once on mount.
const STARTERS = [
  { tag: "Networking", text: "Explain how HTTPS actually works, end to end" },
  { tag: "Databases", text: "What is a database index, and when does it hurt?" },
  { tag: "React", text: "Walk me through how React decides to re-render" },
  { tag: "JavaScript", text: "Explain event loops like I've never seen one" },
];

// The labels here mirror actions.js — kept short so the mock popup stays
// narrow enough to sit over the highlighted phrase at any width.
const DEMO_ACTIONS = ["Explain", "Example", "Go Deeper"];

export default function Welcome({ onSend }) {
  return (
    <div className="welcome">
      <div className="welcome-mark" aria-hidden="true">
        <img src="/lens.svg" width="24" height="24" alt="" />
      </div>

      {/* Decorative: a still of the drill-down flow, not real content. */}
      <div className="welcome-demo" aria-hidden="true">
        {/* The highlighted phrase leads the sentence so it lands on the first
            line — the popup floats upward, and anywhere else it would cover
            the text above it. */}
        <p className="welcome-demo-text">
          <span className="welcome-demo-anchor">
            <mark>The first callback in the queue</mark>
            <span className="welcome-demo-popup">
              {DEMO_ACTIONS.map((a) => (
                <span key={a}>{a}</span>
              ))}
            </span>
          </span>{" "}
          moves onto the call stack the moment it sits empty, and runs there
          until it returns.
        </p>
        <p className="welcome-demo-caption">
          Highlight any part of an answer to explain it, get an example, or go
          deeper — each one opens in its own tab, so you never lose your place.
        </p>
      </div>

      <div className="welcome-starters">
        {STARTERS.map((s) => (
          <button
            key={s.text}
            type="button"
            className="welcome-starter"
            onClick={() => onSend(s.text)}
          >
            <span className="welcome-starter-tag">{s.tag}</span>
            <span className="welcome-starter-text">{s.text}</span>
          </button>
        ))}
      </div>

      <p className="welcome-hint">
        <kbd>/</kbd> jump to the message box
        <span className="welcome-hint-sep">·</span>
        <kbd>⌘⇧O</kbd> new chat
      </p>
    </div>
  );
}
