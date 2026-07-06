import Markdown from "./Markdown.jsx";
import Dots from "./Dots.jsx";

// A single chat message. Assistant messages carry data attributes so the
// global selection handler in App can resolve which message a selection belongs to,
// and render markdown. User messages stay plain text. An empty assistant message
// (before the first streamed chunk arrives) shows bouncing dots; while chunks
// stream in, a blinking caret rides the end of the text (via CSS).
export default function Message({ message, streaming }) {
  const { role, content, id } = message;
  const isAssistant = role === "assistant";

  if (isAssistant) {
    return (
      <div
        className={`message assistant${streaming && content ? " streaming" : ""}`}
        data-message-id={id}
      >
        {content ? <Markdown>{content}</Markdown> : <Dots />}
      </div>
    );
  }
  return (
    <div className="message user">
      <span className="user-bubble">{content}</span>
    </div>
  );
}
