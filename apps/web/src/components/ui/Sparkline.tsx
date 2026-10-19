export function Sparkline({ values, className }: { values: number[] | undefined; className?: string }) {
  if (!values || values.length < 2) return <span className="text-[11px] text-muted">—</span>;
  const w = 64;
  const h = 20;
  const pad = 1.5;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - pad - ((v - min) / span) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const up = values[values.length - 1]! >= values[0]!;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke={up ? "rgb(0,230,118)" : "rgb(255,107,107)"} strokeWidth="1.5" />
    </svg>
  );
}
