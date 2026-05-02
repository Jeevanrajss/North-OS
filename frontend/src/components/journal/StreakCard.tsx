import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Flame } from 'lucide-react';
import { cn } from '@/lib/cn';

export function StreakCard() {
  const { data } = useQuery({
    queryKey: ['stats', 30],
    queryFn: () => api.journal.stats(30),
    staleTime: 1000 * 60,
  });

  const last7 = data?.daily_valence.slice(-7) ?? [];

  return (
    <div className="card">
      <div className="card-title">Streak</div>
      <div className="flex items-baseline gap-2">
        <Flame className={cn('w-5 h-5', (data?.current_streak ?? 0) > 0 ? 'text-amber-400' : 'text-ink-600')} />
        <div className="text-2xl font-semibold text-ink-50">{data?.current_streak ?? 0}</div>
        <div className="text-sm text-ink-400">
          day{(data?.current_streak ?? 0) === 1 ? '' : 's'}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1">
        {last7.map((p) => (
          <div
            key={p.date}
            title={`${p.date}: ${p.entry_count} entr${p.entry_count === 1 ? 'y' : 'ies'}`}
            className={cn(
              'flex-1 h-5 rounded-sm border',
              p.entry_count > 0
                ? 'bg-amber-400/60 border-amber-400/80'
                : 'bg-ink-950 border-ink-800',
            )}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-600">
        <span>7 days</span>
        <span>
          Longest (30d): <span className="text-ink-400">{data?.longest_streak_in_window ?? 0}</span>
        </span>
      </div>
    </div>
  );
}
