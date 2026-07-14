// The standard actions. `action` is the instruction sent to the model verbatim;
// `label` is the short text shown on the button/chip. Used by the selection
// popup and the modal's variant chips so they never drift.
export const ACTIONS = [
  { action: "Nah explain better", label: "Explain better" },
  { action: "Go deeper", label: "Go deeper" },
  { action: "Explain step by step", label: "Step by Step" },
  { action: "Explain w/ code", label: "Code" },
  { action: "WTF is this — assume I know nothing, start from scratch", label: "WTF" },
  { action: "How", label: "How" },
  { action: "Why", label: "Why" },
];

// export const ACTIONS = [
//   {
//     action: "Teach this like you're explaining it to a curious beginner. Start simple, then gradually increase the depth.",
//     label: "Explain better",
//   },
//   {
//     action: "Go much deeper. Cover the internal mechanics, trade-offs, common misconceptions, edge cases, and implementation details.",
//     label: "Go deeper",
//   },
//   {
//     action: "Explain this step by step, with each step building on the previous one.",
//     label: "Step by Step",
//   },
//   {
//     action: "Show practical code examples, explain them line by line, and describe why each part is necessary.",
//     label: "Code",
//   },
//   {
//     action: "Assume I know absolutely nothing about this topic. Explain it from scratch in the simplest possible way.",
//     label: "WTF",
//   },
//   {
//     action: "Explain exactly how this works internally, from input to output.",
//     label: "How",
//   },
//   {
//     action: "Explain why this exists, what problem it solves, why it's designed this way, and what alternatives exist.",
//     label: "Why",
//   },
// ];
