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

// Prompt that asks the model to brainstorm questions a learner might have
// about the highlighted text. Returns one question per line.
export function buildQuestionsPrompt({ sourceMessageText, selectedText }) {
  return [
    "Context:",
    '"""',
    sourceMessageText,
    '"""',
    "",
    "The user highlighted this part:",
    '"""',
    selectedText,
    '"""',
    "",
    "Generate 10 specific, non-obvious questions a curious learner would naturally",
    "ask about the highlighted part. Choose whatever angles and depths are genuinely",
    "useful for understanding this specific thing — you decide what's worth asking.",
    "Maximize variety: vary between simple and advanced, and do not ask ten variations",
    "of the same question. Avoid generic restatements like \"What is X?\". Keep each",
    "question short and concrete.",
    "Return ONLY the questions, one per line, with no numbering, bullets, or preamble.",
  ].join("\n");
}
