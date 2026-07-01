// Stable key for the experimental "Questions" variant.
export const QUESTIONS_KEY = "__questions__";

// The standard actions. `action` is the instruction sent to the model verbatim;
// `label` is the short text shown on the button/chip. Used by the selection
// popup and the modal's variant chips so they never drift.
export const ACTIONS = [
  { action: "Nah explain better", label: "Explain better" },
  { action: "Explain with real world example", label: "Explain w/ example" },
  { action: "Go deeper", label: "Go deeper" },
  { action: "Explain step by step", label: "Explain step by step" },
  { action: "Explain w/ code", label: "Explain w/ code" },
  { action: "WTF is this", label: "WTF is this" },
  { action: "How", label: "How" },
  { action: "Why", label: "Why" },
];
