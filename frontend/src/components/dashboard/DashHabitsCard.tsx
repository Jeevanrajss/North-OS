import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import { api, type HabitsTodayResponse } from '@/lib/api';
import { cn } from '@/lib/cn';

export function DashHabitsCard() {
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const { data, isLoading } = useQuery<HabitsTodayResponse>({
    queryKey: ['habits-today', todayISO],
    queryFn: () => api.habits.today(todayISO),
    staleTime: 1000 * 30,
  });

  const habits = data?.habits ?? [];
  const doneCount = habits.filter((h) => h.done).length;
  const total = habits.length;
  const allDone = total > 0 && doneCount === total;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="card-title mb-0">Today's Habits</div>
          {total > 0 && (
            <div className={cn(
              'text-[11px] mt-0.5',
              allDone ? 'text-emerald-400' : 'text-ink-500',
            )}>
              {allDone ? 'All done!' : `${doneCount} / ${total} done`}
            </div>
          )}
        </div>
        <Link to="/habits" className="flex items-center gap-1 text-[11px] text-ink-500 hover:text-accent transition-colors">
          Manage <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {isLoading ? (
        <div className="text-xs text-ink-500 py-4 text-center">Loading…</div>
      ) : habits.length === 0 ? (
        <div className="text-xs text-ink-500 py-4 text-center">No habits scheduled today.</div>
      ) : (
        <ul className="space-y-1">
          {habits.map(({ habit, done }) => (
            <li key={habit.id} className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5">
              <span className={cn('shrink-0', done ? 'text-emerald-400' : 'text-ink-700')}>
                {done ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
              </span>
              <span className="text-base leading-none w-5 text-center shrink-0">{habit.emoji}</span>
              <span className={cn(
                'text-sm flex-1 truncate',
                done ? 'text-ink-500 line-through' : 'text-ink-200',
              )}>
                {habit.name}
              </span>
            </li>
          ))}
        </ul>
      )}

      {total > 0 && (
        <div className="mt-3 h-1 bg-ink-900 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', allDone ? 'bg-emerald-500' : 'bg-accent/60')}
            style={{ width: `${(doneCount / total) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
