import type { HabitDowBucket } from '@/lib/api';
import { cn } from '@/lib/cn';

type Props = {
  /** Length 7, ISO Mon..Sun. */
  dow: HabitDowBucket[];
};

const LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * CSS-only horizontal bars of per-weekday completion rate. Shows
 * done/opportunities to the right of each bar. Weekdays with zero
 * opportunities render as a faint dashed row.
 */
export function HabitDowChart({ dow }: Props) {
  const maxRate = Math.max(0.01, ...dow.map((d) => d.completion_rate));

  return (
    <div className="card">
      <div className="card-title">Day of week</div>
      <div className="space-y-1.5 mt-1">
        {LABELS.map((label, i) => {
          const bucket = dow[i] ?? {
            weekday: i,
            done_count: 0,
            opportunities: 0,
            completion_rate: 0,
          };
          const empty = bucket.opportunities === 0;
          const pctOfMax = empty ? 0 : (bucket.completion_rate / maxRate) * 100;
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span
                className={cn(
                  'w-8 tabular-nums',
                  empty ? 'text-ink-600' : 'text-ink-400',
                )}
              >
                {label}
              </span>
              <div
                className={cn(
                  'relative h-2 flex-1 rounded-full overflow-hidden border',
                  empty ? 'border-dashed border-ink-800 bg-transparent' : 'border-ink-800 bg-ink-900',
                )}
              >
                <div
                  className="absolute inset-y-0 left-0 bg-accent/70"
                  style={{ width: `${pctOfMax}%` }}
                />
              </div>
              <span
                className={cn(
                  'w-20 text-right tabular-nums',
                  empty ? 'text-ink-600' : 'text-ink-400',
                )}
              >
                {empty
                  ? '—'
                  : `${bucket.done_count}/${bucket.opportunities} · ${Math.round(
                      bucket.completion_rate * 100,
                    )}%`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
