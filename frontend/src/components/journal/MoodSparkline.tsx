import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { format, parseISO } from 'date-fns';

/**
 * 30-day mood sparkline. Plots valence_avg (-2..+2) as an area chart with
 * the baseline at 0. Gaps (days with no mood logged) are skipped — the path
 * breaks so you can see missing data.
 */
export function MoodSparkline() {
  const { data } = useQuery({
    queryKey: ['stats', 30],
    queryFn: () => api.journal.stats(30),
    staleTime: 1000 * 60,
  });

  const { path, dots, avg, maxDay } = useMemo(() => {
    const points = data?.daily_valence ?? [];
    const W = 280;
    const H = 56;
    const PAD = 4;
    if (points.length === 0) {
      return { path: '', dots: [], avg: null as number | null, maxDay: null as string | null };
    }
    const xs = points.map((_, i) => PAD + (i * (W - 2 * PAD)) / Math.max(1, points.length - 1));
    // valence domain -2..+2 → y flipped (H is bottom)
    const toY = (v: number) => PAD + ((2 - v) / 4) * (H - 2 * PAD);
    const segs: string[] = [];
    let open = false;
    points.forEach((p, i) => {
      if (p.valence_avg == null) {
        open = false;
        return;
      }
      const x = xs[i];
      const y = toY(p.valence_avg);
      segs.push(`${open ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
      open = true;
    });
    const dots = points
      .map((p, i) => (p.valence_avg != null ? { x: xs[i], y: toY(p.valence_avg), v: p.valence_avg, date: p.date } : null))
      .filter((d): d is { x: number; y: number; v: number; date: string } => d !== null);
    const withVal = points.filter((p) => p.valence_avg != null);
    const avg =
      withVal.length > 0
        ? withVal.reduce((acc, p) => acc + (p.valence_avg ?? 0), 0) / withVal.length
        : null;
    const peak = withVal.reduce<{ v: number; date: string } | null>(
      (best, p) => (best == null || (p.valence_avg ?? -99) > best.v ? { v: p.valence_avg ?? 0, date: p.date } : best),
      null,
    );
    return { path: segs.join(' '), dots, avg, maxDay: peak?.date ?? null };
  }, [data]);

  const W = 280;
  const H = 56;

  return (
    <div className="card">
      <div className="card-title">Mood — last 30 days</div>
      <svg width={W} height={H} className="block w-full">
        {/* baseline at valence 0 */}
        <line
          x1="0"
          x2={W}
          y1={H / 2}
          y2={H / 2}
          stroke="currentColor"
          className="text-ink-800"
          strokeDasharray="2 3"
        />
        {path && (
          <path d={path} fill="none" stroke="currentColor" className="text-accent" strokeWidth="1.5" />
        )}
        {dots.map((d) => (
          <circle
            key={d.date}
            cx={d.x}
            cy={d.y}
            r={1.75}
            className={
              d.v >= 0.5
                ? 'fill-emerald-400'
                : d.v <= -0.5
                ? 'fill-rose-400'
                : 'fill-ink-400'
            }
          />
        ))}
      </svg>
      <div className="mt-1 flex items-center justify-between text-[11px] text-ink-600">
        <span>
          Avg:{' '}
          <span className="text-ink-400">
            {avg == null ? '—' : avg.toFixed(2)}
          </span>
        </span>
        <span>
          Peak:{' '}
          <span className="text-ink-400">
            {maxDay ? format(parseISO(maxDay), 'MMM d') : '—'}
          </span>
        </span>
      </div>
    </div>
  );
}
