// One look for every Recharts chart. Colours are CSS variables, which SVG
// attributes resolve live — charts re-theme instantly with light/dark.

export const chartGrid = {
  strokeDasharray: '3 3',
  stroke: 'var(--chart-grid)',
  vertical: false,
} as const;

/** Axis labels: 11px (smaller is hard to read), muted, no tick marks or axis line. */
export const chartAxis = {
  tick: { fill: 'var(--chart-axis)', fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export const chartTooltip = {
  contentStyle: {
    background: 'var(--surface)',
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    boxShadow: 'var(--elev-3)',
    fontSize: 12,
    color: 'var(--fg-1)',
    padding: '8px 10px',
  },
  labelStyle: { color: 'var(--fg-3)', marginBottom: 4, fontSize: 11 },
  itemStyle: { color: 'var(--fg-1)', padding: 0 },
  cursor: { fill: 'rgb(var(--overlay-rgb) / 0.04)', stroke: 'var(--border-strong)' },
} as const;

/** Series colours, in order. */
export const chartSeries = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];
