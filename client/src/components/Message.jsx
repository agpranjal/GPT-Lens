// A single chat message. Assistant messages carry data attributes so the
// global selection handler in App can resolve which message a selection belongs to.
export default function Message({ message }) {
  const { role, content, id } = message;
  return (
    <div
      className={`message ${role}`}
      data-message-id={role === "assistant" ? id : undefined}
    >
      {content}
    </div>
  );
}
