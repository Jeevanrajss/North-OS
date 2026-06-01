type Props = {
  pct: number;       // 0–100
  size?: number;     // diameter px
  stroke?: number;   // stroke width
  color?: string;
};

export function GoalProgressRing({ pct, size = 52, stroke = 5, color = 'var(--primary-500)' }: Props) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(100, Math.max(0, pct)) / 100 * circ;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      {/* Track */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke="rgba(255,255,255,0.07)"
        strokeWidth={stroke}
      />
      {/* Progress arc */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}   /* rotate so arc starts at top */
        style={{ transition: 'stroke-dasharray 600ms ease' }}
      />
      {/* Centre pct text */}
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="central"
        fill="var(--fg-1)"
        style={{ font: `500 ${size * 0.22}px var(--font-mono)`, letterSpacing: '-0.02em' }}
      >
        {Math.round(pct)}%
      </text>
    </svg>
  );
}
