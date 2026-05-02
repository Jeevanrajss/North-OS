import type { HabitMonthlyPoint } from '@/lib/api';
import { cn } from '@/lib/cn';

type Props = {
  monthly: HabitMonthlyPoint[]; // oldest → newest, expected length ~12
};

/**
 * Vertical bar chart of completion rate per month (last 12 months).
 * Bars use CSS heights; 100% = maximum observed rate (never taller than
 * the chart). Label shows the short month name; tooltip shows done/opps.
 */
export function HabitMonthlyTrend({ monthly }: Props) {
  const maxRate = Math.max(0.01, ...monthly.map((m) => m.completion_rate));

  return (
    <div className="card">
      <div className="card-title">Last 12 months</div>
      {monthly.length === 0 ? (
        <div className="text-xs text-ink-500 py-6 text-center">No data yet.</div>
      ) : (
        <div className="mt-2">
          <div className="flex items-end gap-1 h-28">
            {monthly.map((m) => {
              const empty = m.opportunities === 0;
              const h = empty ? 2 : Math.max(3, (m.completion_rate / maxRate) * 100);
              return (
                <div
                  key={m.year_month}
                  className="flex-1 flex flex-col items-center justify-end h-full"
                  title={
                    empty
                      ? `${m.year_month}: no data`
                      : `${m.year_month}: ${m.done_count}/${m.opportunities} · ${Math.round(
                          m.completion_rate * 100,
                        )}%`
                  }
                >
                  <div
                    className={cn(
                      'w-full rounded-sm transition-colors',
                      empty ? 'bg-ink-900 border border-dashed border-ink-800' : 'bg-accent/60 hover:bg-accent/80',
                    )}
                    style={{ height: `${h}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex gap-1 mt-1.5 text-[10px] text-ink-500">
            {monthly.map((m) => (
              <div key={m.year_month} className="flex-1 text-center truncate">
                {m.year_month.slice(5)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
