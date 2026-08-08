// The standard actions. `action` is the instruction sent to the model verbatim;
// `label` is the short text shown on the button/chip. Used by the selection
// popup and the modal's variant chips so they never drift.
// Previous action prompts — kept temporarily for easy comparison/reversion.
// export const ACTIONS = [
//   { action: "Give a better, simpler explanation (with example)", label: "Explain" },
//   { action: "Give Example", label: "Example" },
//   { action: "Go deeper on this - while keeping explanation simple (with example)", label: "Go Deeper" },
//   { action: "Explain step by step", label: "Step by Step" },
//   { action: "Explain with code", label: "Code" },
//   { action: "WTF is this", label: "What?" }
// ];

export const ACTIONS = [
  {
    action:
      "Explain the selected passage in plain language. Start with its core meaning, then give one concrete example.",
    label: "Explain",
  },
  {
    action:
      "Give one realistic, concrete example of the selected idea. Explain exactly how the example demonstrates it.",
    label: "Example",
  },
  {
    action:
      "Explain the selected idea's underlying mechanics, why it works, important trade-offs, and one relevant edge case. Assume the reader understands the basics.",
    label: "Go Deeper",
  },
  {
    action:
      "Break the process or reasoning into numbered steps. For each step, explain its input, what happens, and its result.",
    label: "Step by Step",
  },
  {
    action:
      "Show the smallest practical code example that demonstrates the selected idea. Use the language implied by the context; otherwise choose an appropriate language and name it. Explain the important lines and expected result.",
    label: "Code",
  },
  {
    action:
      "Assume the reader is unfamiliar with the terminology. Define the key terms first, then explain what the selected passage means and why it matters.",
    label: "What?",
  },
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
