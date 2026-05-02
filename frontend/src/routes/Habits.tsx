import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CheckSquare, BarChart3, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { HabitTodayStrip } from '@/components/habits/HabitTodayStrip';
import { HabitWeekTable } from '@/components/habits/HabitWeekTable';
import { HabitStreakCard } from '@/components/habits/HabitStreakCard';
import { HabitList } from '@/components/habits/HabitList';
import { HabitInsightsCard } from '@/components/habits/HabitInsightsCard';
import { api, type HabitIn } from '@/lib/api';
import {
  addDays,
  formatWeekRange,
  startOfWeek,
  toISODate,
} from '@/lib/date';
import { cn } from '@/lib/cn';

type Tab = 'log' | 'chart';

/**
 * /habits — standalone page. Journal stays journal; all habit UX lives here.
 *
 * Layout (≥lg):
 *   Left column (70%): Today strip + Week Overview card
 *   Right column (30%): Streak card + Habit List (edit/archive/add)
 *
 * On smaller screens the columns stack.
 */
export function Habits() {
  const qc = useQueryClient();

  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const [tab, setTab] = useState<Tab>('log');

  const habitsQ = useQuery({
    queryKey: ['habits'],
    queryFn: () => api.habits.list(false),
    staleTime: 1000 * 30,
  });

  const todayQ = useQuery({
    queryKey: ['habits-today'],
    queryFn: () => api.habits.today(),
    staleTime: 1000 * 10,
  });

  const createMut = useMutation({
    mutationFn: (payload: HabitIn) => api.habits.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['habits'] });
      qc.invalidateQueries({ queryKey: ['habits-today'] });
      qc.invalidateQueries({ queryKey: ['habits-stats'] });
    },
  });

  const todayISO = useMemo(() => toISODate(new Date()), []);

  const tickTodayMut = useMutation({
    mutationFn: ({ habitId }: { habitId: string }) => api.habits.tick(habitId, todayISO),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['habits-today'] });
      qc.invalidateQueries({ queryKey: ['habits-stats'] });
      qc.invalidateQueries({ queryKey: ['habit-checkins'] });
    },
  });

  const untickTodayMut = useMutation({
    mutationFn: ({ habitId }: { habitId: string }) => api.habits.untick(habitId, todayISO),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['habits-today'] });
      qc.invalidateQueries({ queryKey: ['habits-stats'] });
      qc.invalidateQueries({ queryKey: ['habit-checkins'] });
    },
  });

  const habits = habitsQ.data ?? [];
  const todayRows = todayQ.data?.habits ?? [];

  // Keyboard shortcuts: digits 1–9 toggle the Nth habit in the Today strip.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9) {
        const row = todayRows[n - 1];
        if (!row) return;
        if (row.done) {
          untickTodayMut.mutate({ habitId: row.habit.id });
        } else {
          tickTodayMut.mutate({ habitId: row.habit.id });
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [todayRows, tickTodayMut, untickTodayMut]);

  function handleTodayToggle(habitId: string, done: boolean) {
    if (done) {
      untickTodayMut.mutate({ habitId });
    } else {
      tickTodayMut.mutate({ habitId });
    }
  }

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  function prevWeek() {
    setWeekStart((d) => addDays(d, -7));
  }
  function nextWeek() {
    setWeekStart((d) => addDays(d, 7));
  }
  function goToThisWeek() {
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  }

  const isThisWeek = useMemo(() => {
    const cur = startOfWeek(new Date(), { weekStartsOn: 1 });
    return toISODate(cur) === toISODate(weekStart);
  }, [weekStart]);

  const handleCreate = (payload: HabitIn) =>
    createMut.mutateAsync(payload).then(() => undefined);

  return (
    <>
      <PageHeader title="Habits" subtitle="Small reps, compounded daily." />

      {/* 70:30 split on large screens; stacks on smaller. */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
        {/* Left — main content */}
        <div className="lg:col-span-7 space-y-6">
          {/* Today strip */}
          <div>
            <HabitTodayStrip
            rows={todayRows}
            loading={todayQ.isLoading}
            onToggle={handleTodayToggle}
          />
          </div>

          {/* Week Overview */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-ink-100">Week Overview</h2>
                <span className="text-xs text-ink-500">
                  · {formatWeekRange(weekStart, weekEnd)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={prevWeek}
                  className="p-1.5 rounded-md border border-ink-800 bg-ink-900 text-ink-400 hover:text-ink-100"
                  aria-label="Previous week"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={goToThisWeek}
                  disabled={isThisWeek}
                  className={cn(
                    'px-2.5 py-1.5 rounded-md border text-xs',
                    isThisWeek
                      ? 'border-ink-800 bg-ink-900 text-ink-600 cursor-not-allowed'
                      : 'border-ink-800 bg-ink-900 text-ink-300 hover:text-ink-100',
                  )}
                >
                  This week
                </button>
                <button
                  type="button"
                  onClick={nextWeek}
                  className="p-1.5 rounded-md border border-ink-800 bg-ink-900 text-ink-400 hover:text-ink-100"
                  aria-label="Next week"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 mb-4 border-b border-ink-800">
              <TabButton
                active={tab === 'log'}
                onClick={() => setTab('log')}
                icon={<CheckSquare className="w-3.5 h-3.5" />}
              >
                Log Habits
              </TabButton>
              <TabButton
                active={tab === 'chart'}
                onClick={() => setTab('chart')}
                icon={<BarChart3 className="w-3.5 h-3.5" />}
              >
                Weekly Progress Chart
              </TabButton>
            </div>

            {tab === 'log' ? (
              habitsQ.isLoading ? (
                <div className="flex items-center justify-center py-10 text-ink-500">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading habits…
                </div>
              ) : habitsQ.error ? (
                <div className="text-sm text-red-400">Failed to load habits.</div>
              ) : (
                <HabitWeekTable habits={habits} weekStart={weekStart} />
              )
            ) : (
              <div className="py-10 text-center text-sm text-ink-500">
                Weekly progress chart coming soon.
              </div>
            )}
          </div>
        </div>

        {/* Right — streak + insights + list */}
        <aside className="lg:col-span-3 space-y-5">
          <HabitStreakCard />
          <HabitInsightsCard />
          <HabitList
            habits={habits}
            loading={habitsQ.isLoading}
            onCreate={handleCreate}
          />
        </aside>
      </div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-2 -mb-px text-xs border-b-2 transition-colors',
        active
          ? 'border-accent text-accent'
          : 'border-transparent text-ink-400 hover:text-ink-200',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
