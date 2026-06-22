// Build the prompt for a selection action.
// `sourceMessageText` is the full message the selection came from (context),
// `selectedText` is the highlighted span, `instruction` is what to do with it.
export function buildActionPrompt({ sourceMessageText, selectedText, instruction }) {
  return [
    "Context:",
    '"""',
    sourceMessageText,
    '"""',
    "",
    "Selected text:",
    '"""',
    selectedText,
    '"""',
    "",
    instruction,
  ].join("\n");
}

// The instruction is whatever the user asked for verbatim: the free-text
// custom string if provided, otherwise the action word itself (e.g. "simplify").
export function resolveInstruction({ action, custom }) {
  if (custom && custom.trim()) return custom.trim();
  return action || "explain";
}
