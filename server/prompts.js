// Maps an action key (sent by the client) to the instruction the model receives.
// Keeping this on the server means we can tune wording without touching the client.

export const ACTIONS = {
  explain: "Explain the highlighted text more clearly and in more depth.",
  example: "Give a concrete, real-world example that illustrates the highlighted text.",
  simplify: "Rewrite the highlighted text as simply as possible, for a beginner.",
  wtf: "I'm confused by the highlighted text. Explain what it actually means in plain language.",
};

// Build the prompt for a selection action.
// `sourceMessageText` is the full message the selection came from (context),
// `selectedText` is the highlighted span, `instruction` is what to do with it.
export function buildActionPrompt({ sourceMessageText, selectedText, instruction }) {
  return [
    "The user is reading the following text:",
    "",
    '"""',
    sourceMessageText,
    '"""',
    "",
    "Within that text, they highlighted this specific part:",
    "",
    '"""',
    selectedText,
    '"""',
    "",
    `Task: ${instruction}`,
    "",
    "Focus on the highlighted part, but use the surrounding text as context.",
    "Answer directly without restating the task.",
  ].join("\n");
}

// Resolve the instruction: a known action key, or a free-text custom instruction.
export function resolveInstruction({ action, custom }) {
  if (custom && custom.trim()) return custom.trim();
  return ACTIONS[action] || ACTIONS.explain;
}
