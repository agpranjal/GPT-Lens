import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders markdown text. Used for assistant replies and action-card bodies.
export default function Markdown({ children }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
