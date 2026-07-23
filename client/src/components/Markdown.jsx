import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

// The code-block header (language label + copy/select buttons) can't be caught
// in a text selection: the label is rendered as CSS generated content and the
// buttons are user-select:none, so neither becomes selectable text. The one
// remaining artifact — the app's own highlight overlay drawing a mirror rect
// across the header row when a triple-click on the heading above extends into
// the block — is filtered out where the overlay is built (see dropHeaderRects
// in App.jsx).

// Code block with hover buttons (top-right corner): "select" and "copy".
function Pre(props) {
  const preRef = useRef(null);
  const [copied, setCopied] = useState(false);

  // Language label, pulled from the `language-xxx` class rehype-highlight leaves
  // on the inner <code> (present only for fenced blocks with a declared lang).
  const codeClass = props.children?.props?.className || "";
  const lang = (/language-(\w+)/.exec(codeClass) || [])[1] || "";

  // Select the whole code block, then let the app's global selection handler
  // (it listens on mouseup) show the same action popup a manual highlight does.
  function selectCode() {
    const codeEl = preRef.current?.querySelector("code");
    if (!codeEl) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(codeEl);
    sel.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  }

  async function copy() {
    const code = preRef.current?.querySelector("code")?.innerText || "";
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Clipboard API needs focus/permission; fall back to a hidden textarea.
      const tmp = document.createElement("textarea");
      tmp.value = code;
      tmp.style.position = "fixed";
      tmp.style.opacity = "0";
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand("copy");
      tmp.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="codeblock">
      {/* Header strip: language on the left, action buttons on the right, code
          below. Sitting the buttons in a header (ahead of the code in DOM
          order, and physically outside the scrolling <pre>) means a code
          selection — even a triple-click that extends to the container edge —
          can never reach them, so no button ever paints as "selected". */}
      <div className="codeblock-header">
      {/* Rendered via CSS `content` (see .codeblock-lang::before) rather than as
          a text node, so a selection dragged across the block can never
          highlight or copy the language label. */}
      <span className="codeblock-lang" data-lang={lang || "code"} aria-hidden="true" />
      <div className="codeblock-actions">
      <button
        type="button"
        className="codeblock-select"
        onClick={selectCode}
        aria-label="Select code"
        title="Select code to ask AI"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
        </svg>
      </button>
      <button
        type="button"
        className={`codeblock-copy${copied ? " copied" : ""}`}
        onClick={copy}
        aria-label="Copy code"
        title={copied ? "Copied" : "Copy code"}
      >
        {copied ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
      </div>
      </div>
      <div className="codeblock-body">
        <pre ref={preRef} {...props} />
      </div>
    </div>
  );
}

// Renders markdown text. Used for assistant replies and action-card bodies.
export default function Markdown({ children }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={{ pre: Pre }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
