import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { format, parseISO } from 'date-fns';

const W = 300;
const H = 80;
const PX = 4;
const PY = 8;
const BOTTOM = H - PY;

const LINE_GRAD  = 'mood-line-grad';
const AREA_GRAD  = 'mood-area-grad';

export function MoodSparkline() {
  // 30 days for current period
  const { data: d30 } = useQuery({
    queryKey: ['stats', 30],
    queryFn: () => api.journal.stats(30),
    staleTime: 1000 * 60,
  });

  // 60 days to derive "vs last month" delta
  const { data: d60 } = useQuery({
    queryKey: ['stats', 60],
    queryFn: () => api.journal.stats(60),
    staleTime: 1000 * 60,
  });

  const chart = useMemo(() => {
    const pts = d30?.daily_valence ?? [];
    if (pts.length === 0) {
      return { linePath: '', areaPath: '', lastPt: null, xLabels: [], avg: null, delta: null, peakDay: null, volatility: null };
    }

    const xs = pts.map((_, i) => PX + (i * (W - 2 * PX)) / Math.max(1, pts.length - 1));
    const toY = (v: number) => PY + ((2 - v) / 4) * (H - 2 * PY);

    // Build contiguous segments
    type Pt = { x: number; y: number };
    const segments: Pt[][] = [];
    let seg: Pt[] = [];
    pts.forEach((p, i) => {
      if (p.valence_avg == null) {
        if (seg.length) { segments.push(seg); seg = []; }
      } else {
        seg.push({ x: xs[i], y: toY(p.valence_avg) });
      }
    });
    if (seg.length) segments.push(seg);

    // Line path
    const linePath = segments
      .map((s) => s.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '))
      .join(' ');

    // Area path (each segment closed to bottom)
    const areaPath = segments
      .filter((s) => s.length >= 2)
      .map((s) => {
        const f = s[0], l = s[s.length - 1];
        const line = s.map((p, i) => `${i === 0 ? '' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        return `M${f.x.toFixed(1)},${BOTTOM} L${line} L${l.x.toFixed(1)},${BOTTOM} Z`;
      })
      .join(' ');

    // Last point for endpoint dot
    const lastSeg = segments[segments.length - 1] ?? [];
    const lastPt = lastSeg[lastSeg.length - 1] ?? null;

    // X-axis labels: start, middle, end
    const n = pts.length;
    const labelIdxs = [0, Math.floor(n / 2), n - 1];
    const xLabels = labelIdxs.map((i) => ({
      x: xs[i],
      label: format(parseISO(pts[i].date), 'MMM d'),
      anchor: (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle') as 'start' | 'middle' | 'end',
    }));

    // Avg mood (last 30)
    const valid30 = pts.filter((p) => p.valence_avg != null);
    const avg = valid30.length
      ? valid30.reduce((a, p) => a + (p.valence_avg ?? 0), 0) / valid30.length
      : null;

    // Delta vs previous 30 days
    const prev30 = (d60?.daily_valence ?? []).slice(0, 30).filter((p) => p.valence_avg != null);
    const prevAvg = prev30.length
      ? prev30.reduce((a, p) => a + (p.valence_avg ?? 0), 0) / prev30.length
      : null;
    const delta = avg != null && prevAvg != null ? avg - prevAvg : null;

    // Peak day
    const peak = valid30.reduce<{ v: number; date: string } | null>(
      (best, p) => (!best || (p.valence_avg ?? -99) > best.v ? { v: p.valence_avg!, date: p.date } : best),
      null,
    );
    const peakDay = peak ? format(parseISO(peak.date), 'MMM d') : null;

    // Volatility (std-dev bucketed)
    let volatility: string | null = null;
    if (valid30.length > 1 && avg != null) {
      const variance = valid30.reduce((a, p) => a + Math.pow((p.valence_avg ?? 0) - avg, 2), 0) / valid30.length;
      const sd = Math.sqrt(variance);
      volatility = sd < 0.5 ? 'Low' : sd < 1.0 ? 'Medium' : 'High';
    }

    return { linePath, areaPath, lastPt, xLabels, avg, delta, peakDay, volatility };
  }, [d30, d60]);

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* ── Header ── */}
      <h3 style={{ margin: '0 0 8px', font: '500 12px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Mood Trend
        <span style={{ color: 'var(--fg-3)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'none', fontWeight: 400 }}>30 days</span>
      </h3>

      {/* ── Big avg + delta ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 8 }}>
        <span style={{ font: '500 28px/1 var(--font-display)', letterSpacing: '-0.02em', color: 'var(--fg-1)' }}>
          {chart.avg != null
            ? `${chart.avg >= 0 ? '+' : ''}${chart.avg.toFixed(2)}`
            : '—'}
        </span>
        {chart.delta != null && (
          <span style={{ color: chart.delta >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontSize: 12, fontWeight: 500 }}>
            {chart.delta >= 0 ? '▲' : '▼'} {Math.abs(chart.delta).toFixed(2)} vs last month
          </span>
        )}
        <span style={{ color: 'var(--fg-4)', fontSize: 11, marginLeft: 'auto' }}>30 days</span>
      </div>

      {/* ── Chart ── */}
      <div style={{ position: 'relative', margin: '12px 0 8px', height: 110 }}>
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H + 18}`}
          preserveAspectRatio="none"
          style={{ display: 'block', overflow: 'visible', width: '100%', height: '100%' }}
        >
          <defs>
            <linearGradient id={LINE_GRAD} x1="0" y1="0" x2={W} y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%"   stopColor="var(--secondary-500)" />
              <stop offset="50%"  stopColor="var(--primary-500)" />
              <stop offset="100%" stopColor="var(--accent-pink)" />
            </linearGradient>
            <linearGradient id={AREA_GRAD} x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
              <stop offset="0%"   stopColor="rgba(139,124,255,0.45)" />
              <stop offset="100%" stopColor="rgba(139,124,255,0)" />
            </linearGradient>
          </defs>

          {/* Mid guide line */}
          <line x1="0" y1="55" x2={W} y2="55" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 4" />

          {/* Area fill */}
          {chart.areaPath && (
            <path d={chart.areaPath} fill={`url(#${AREA_GRAD})`} />
          )}

          {/* Gradient line */}
          {chart.linePath && (
            <path
              d={chart.linePath}
              fill="none"
              stroke={`url(#${LINE_GRAD})`}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Endpoint dot */}
          {chart.lastPt && (
            <>
              <circle cx={chart.lastPt.x} cy={chart.lastPt.y} r={6} fill="var(--primary-500)" fillOpacity={0.3} />
              <circle cx={chart.lastPt.x} cy={chart.lastPt.y} r={3.5} fill="white" />
            </>
          )}

          {/* X-axis date labels */}
          {chart.xLabels.map((l, i) => (
            <text
              key={i}
              x={l.x}
              y={H + 15}
              textAnchor={l.anchor}
              fontSize="9"
              fill="var(--fg-4)"
              fontFamily="var(--font-sans)"
            >
              {l.label}
            </text>
          ))}
        </svg>
      </div>

      {/* ── Bottom stats ── */}
      <div style={{ display: 'flex', gap: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
        {[
          { label: 'Avg mood', value: chart.avg != null ? chart.avg.toFixed(2) : '—' },
          { label: 'Peak day', value: chart.peakDay ?? '—' },
          { label: 'Volatility', value: chart.volatility ?? '—' },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ font: '500 12px/1 var(--font-sans)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 4 }}>
              {label}
            </div>
            <div style={{ font: '500 16px/1.2 var(--font-display)', color: 'var(--fg-1)' }}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
