import Markdown from "./Markdown.jsx";

// A single chat message. Assistant messages carry data attributes so the
// global selection handler in App can resolve which message a selection belongs to,
// and render markdown. User messages stay plain text.
export default function Message({ message }) {
  const { role, content, id } = message;
  const isAssistant = role === "assistant";
  return (
    <div
      className={`message ${role}`}
      data-message-id={isAssistant ? id : undefined}
    >
      {isAssistant ? <Markdown>{content}</Markdown> : content}
    </div>
  );
}
