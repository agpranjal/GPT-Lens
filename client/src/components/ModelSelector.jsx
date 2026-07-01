// Header controls: which model answers, and how much it's allowed to reason.
// Grouped by tier so the dropdown stays scannable as the curated list grows.
export default function ModelSelector({
  models,
  reasoningLevels,
  model,
  reasoning,
  onModelChange,
  onReasoningChange,
}) {
  if (!models.length) return null;

  const tiers = [...new Set(models.map((m) => m.tier))];
  const selected = models.find((m) => m.id === model);

  return (
    <div className="model-selector">
      <select
        className="model-select"
        value={model}
        onChange={(e) => onModelChange(e.target.value)}
        title={selected ? `${selected.label} — ${selected.price}` : undefined}
      >
        {tiers.map((tier) => (
          <optgroup key={tier} label={tier}>
            {models
              .filter((m) => m.tier === tier)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <select
        className="reasoning-select"
        value={reasoning}
        onChange={(e) => onReasoningChange(e.target.value)}
        title="Reasoning depth"
      >
        {reasoningLevels.map((r) => (
          <option key={r.id} value={r.id}>
            Reasoning: {r.label}
          </option>
        ))}
      </select>
    </div>
  );
}
