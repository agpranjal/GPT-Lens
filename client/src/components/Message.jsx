import Markdown from "./Markdown.jsx";

// A single chat message. Assistant messages carry data attributes so the
// global selection handler in App can resolve which message a selection belongs to,
// and render markdown. User messages stay plain text. An empty assistant message
// (before the first streamed chunk arrives) shows a blinking caret.
export default function Message({ message }) {
  const { role, content, id } = message;
  const isAssistant = role === "assistant";

  if (isAssistant) {
    return (
      <div className="message assistant" data-message-id={id}>
        {content ? <Markdown>{content}</Markdown> : <span className="caret">▍</span>}
      </div>
    );
  }
  return (
    <div className="message user">
      <span className="user-bubble">{content}</span>
    </div>
  );
}
