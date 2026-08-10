// Curated OpenRouter models for this app — an allowlist, not the full catalog.
// Keeps the UI dropdown meaningful and stops the client from ever pointing
// the server at an arbitrary (possibly very expensive) model string.
export const MODELS = [
  // Flagship — best explanation quality, priced accordingly.
  { id: "anthropic/claude-opus-4.8", label: "Claude Opus 4.8", tier: "Flagship", price: "$5 / $25 per M" },
  { id: "openai/gpt-5.2", label: "GPT-5.2", tier: "Flagship", price: "$1.75 / $14 per M" },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", tier: "Flagship", price: "$2 / $12 per M" },
  { id: "x-ai/grok-4.3", label: "Grok 4.3", tier: "Flagship", price: "$1.25 / $2.50 per M" },

  // Balanced — near-flagship quality, meaningfully cheaper.
  { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5", tier: "Balanced", price: "$2 / $10 per M" },
  { id: "openai/gpt-5.1", label: "GPT-5.1", tier: "Balanced", price: "$1.25 / $10 per M" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "Balanced", price: "$1.25 / $10 per M" },
  { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro", tier: "Balanced", price: "$0.43 / $0.87 per M" },
  { id: "minimax/minimax-m3", label: "MiniMax M3", tier: "Balanced", price: "$0.30 / $1.20 per M" },

  // Fast & cheap — still solid for short explanations.
  { id: "openai/gpt-5.6-luna", label: "GPT-5.6 Luna", tier: "Fast & cheap", price: "$0.50 / $3 per M" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "Fast & cheap", price: "$0.30 / $2.50 per M" },
  { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5", tier: "Fast & cheap", price: "$1 / $5 per M" },
  { id: "openai/gpt-5-mini", label: "GPT-5 Mini", tier: "Fast & cheap", price: "$0.25 / $2 per M" },
  { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", tier: "Fast & cheap", price: "$0.10 / $0.20 per M" },
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", tier: "Fast & cheap", price: "$0.03 / $0.15 per M" },
  { id: "minimax/minimax-m2.5", label: "MiniMax M2.5", tier: "Fast & cheap", price: "$0.12 / $0.48 per M" },
];

// Reasoning-token budget presets (mapped to OpenRouter's unified `reasoning`
// param). Non-reasoning models ignore this field harmlessly.
export const REASONING_LEVELS = [
  { id: "off", label: "Off", maxTokens: 0 },
  { id: "minimal", label: "Minimal", maxTokens: 64 },
  { id: "low", label: "Low", maxTokens: 128 },
  { id: "medium", label: "Medium", maxTokens: 512 },
  { id: "high", label: "High", maxTokens: 2048 },
  { id: "xhigh", label: "Extra high", maxTokens: 4096 },
  { id: "max", label: "Max", maxTokens: 4096 },
];

const MODEL_METADATA_URL = "https://openrouter.ai/api/v1/models";
const METADATA_TTL_MS = 60 * 60 * 1000;
let reasoningMetadata = new Map();
let metadataFetchedAt = 0;

// OpenRouter publishes the reasoning controls each model actually accepts.
// Cache them so the UI and request validation use the same live capabilities.
export async function refreshReasoningMetadata() {
  if (Date.now() - metadataFetchedAt < METADATA_TTL_MS && reasoningMetadata.size) return;
  try {
    const response = await fetch(MODEL_METADATA_URL);
    if (!response.ok) throw new Error(`OpenRouter metadata request failed (${response.status})`);
    const { data } = await response.json();
    reasoningMetadata = new Map(
      data.filter((model) => model.reasoning).map((model) => [model.id, model.reasoning])
    );
    metadataFetchedAt = Date.now();
  } catch (error) {
    // Keep serving the last successful metadata snapshot during an outage.
    if (!reasoningMetadata.size) console.warn("reasoning metadata unavailable:", error.message);
  }
}

export async function modelsWithReasoning() {
  await refreshReasoningMetadata();
  return MODELS.map((model) => ({ ...model, reasoning: reasoningMetadata.get(model.id) || null }));
}

export async function reasoningForRequest(modelId, levelId) {
  await refreshReasoningMetadata();
  const capability = reasoningMetadata.get(modelId);
  if (!capability) return undefined;

  const supported = capability.supported_efforts;
  if (!supported?.length) {
    // Reasoning may be fixed/mandatory, but there is no adjustable control.
    return undefined;
  }

  const effort = levelId === "off" ? "none" : levelId;
  if (!supported.includes(effort)) {
    throw new Error(`${modelId} does not support reasoning effort ${levelId}`);
  }
  return { effort, exclude: true };
}

export const DEFAULT_MODEL = MODELS.some((m) => m.id === process.env.OPENROUTER_MODEL)
  ? process.env.OPENROUTER_MODEL
  : "openai/gpt-oss-120b";

export const DEFAULT_REASONING = REASONING_LEVELS.some((r) => r.id === process.env.OPENROUTER_REASONING)
  ? process.env.OPENROUTER_REASONING
  : "high";

export function isValidModel(id) {
  return MODELS.some((m) => m.id === id);
}
