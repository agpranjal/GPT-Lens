import { useEffect, useRef, useState } from "react";

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
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (!models.length) return null;

  const tiers = [...new Set(models.map((m) => m.tier))];
  const selected = models.find((m) => m.id === model);
  const capability = selected?.reasoning;
  const supported = capability?.supported_efforts || [];
  const adjustableLevels = reasoningLevels.filter((level) =>
    supported.includes(level.id === "off" ? "none" : level.id)
  );
  const fixedReasoning = capability?.mandatory && adjustableLevels.length === 0;
  const selectedLevel = adjustableLevels.find((level) => level.id === reasoning);
  const reasoningLabel = fixedReasoning
    ? "Always on"
    : adjustableLevels.length === 0
      ? "Fixed"
      : selectedLevel?.label || "Choose";

  return (
    <div className="model-selector" ref={rootRef}>
      <button
        type="button"
        className="model-settings-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="model-settings-panel"
      >
        <span className="model-settings-model">{selected?.label}</span>
        <span className="model-settings-divider" aria-hidden="true">·</span>
        <span className="model-settings-reasoning">{reasoningLabel}</span>
        <span className="model-settings-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="model-settings-panel" id="model-settings-panel">
          <label className="model-settings-field">
            <span>Model</span>
            <select
              value={model}
              onChange={(event) => {
                onModelChange(event.target.value);
                event.currentTarget.blur();
              }}
            >
              {tiers.map((tier) => (
                <optgroup key={tier} label={tier}>
                  {models
                    .filter((item) => item.tier === tier)
                    .map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>

          <div className="model-settings-meta">
            <span>{selected?.tier}</span>
            <span>{selected?.price}</span>
          </div>

          <div className="model-settings-field">
            <span>Reasoning</span>
            {adjustableLevels.length > 0 ? (
              <div className="reasoning-options">
                {adjustableLevels.map((level) => (
                  <button
                    type="button"
                    key={level.id}
                    className={level.id === reasoning ? "active" : ""}
                    onClick={() => onReasoningChange(level.id)}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="reasoning-fixed">
                {fixedReasoning ? "Always on for this model" : "Not adjustable for this model"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
