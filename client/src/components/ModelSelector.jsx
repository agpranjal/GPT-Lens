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
  const capability = selected?.reasoning;
  const supported = capability?.supported_efforts || [];
  const adjustableLevels = reasoningLevels.filter((level) =>
    supported.includes(level.id === "off" ? "none" : level.id)
  );
  const fixedReasoning = capability?.mandatory && adjustableLevels.length === 0;
  const reasoningTitle = fixedReasoning
    ? "Reasoning is always on for this model and cannot be adjusted"
    : adjustableLevels.length === 0
      ? "This model does not expose an adjustable reasoning control"
      : "Reasoning depth";

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
        value={adjustableLevels.some((level) => level.id === reasoning) ? reasoning : ""}
        onChange={(e) => onReasoningChange(e.target.value)}
        title={reasoningTitle}
        aria-label={reasoningTitle}
        disabled={fixedReasoning || adjustableLevels.length === 0}
      >
        {(fixedReasoning || adjustableLevels.length === 0) && (
          <option value="">{fixedReasoning ? "Reasoning · Always on" : "Reasoning · Fixed"}</option>
        )}
        {adjustableLevels.map((r) => (
          <option key={r.id} value={r.id}>
            Reasoning · {r.label}
          </option>
        ))}
      </select>
    </div>
  );
}
