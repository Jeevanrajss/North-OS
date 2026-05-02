import { useQuery } from '@tanstack/react-query';
import { Flame } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

/**
 * Overall habit streak — "any habit done" semantics.
 *
 * Mirrors the Journal StreakCard visual. Reads from /habits/stats which
 * returns overall_current_streak and a 7-day any-done sparkline.
 */
export function HabitStreakCard() {
  const { data } = useQuery({
    queryKey: ['habits-stats', 30],
    queryFn: () => api.habits.stats(30),
    staleTime: 1000 * 30,
  });

  const last7 = data?.daily_any_done ?? [];
  const current = data?.overall_current_streak ?? 0;
  const longest = data?.overall_longest_streak_in_window ?? 0;

  return (
    <div className="card">
      <div className="card-title">Streak</div>
      <div className="flex items-baseline gap-2">
        <Flame className={cn('w-5 h-5', current > 0 ? 'text-amber-400' : 'text-ink-600')} />
        <div className="text-2xl font-semibold text-ink-50">{current}</div>
        <div className="text-sm text-ink-400">day{current === 1 ? '' : 's'}</div>
      </div>
      <div className="mt-3 flex items-center gap-1">
        {last7.map((p) => (
          <div
            key={p.date}
            title={`${p.date}: ${p.done_count} habit${p.done_count === 1 ? '' : 's'} done`}
            className={cn(
              'flex-1 h-5 rounded-sm border',
              p.any_done
                ? 'bg-amber-400/60 border-amber-400/80'
                : 'bg-ink-950 border-ink-800',
            )}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-600">
        <span>7 days</span>
        <span>
          Longest (30d): <span className="text-ink-400">{longest}</span>
        </span>
      </div>
    </div>
  );
}
