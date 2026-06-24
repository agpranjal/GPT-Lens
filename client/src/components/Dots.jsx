// Three dots bouncing up and down — the "waiting for the model" indicator.
export default function Dots() {
  return (
    <span className="dots" role="status" aria-label="loading">
      <span />
      <span />
      <span />
    </span>
  );
}
