import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CheckSquare, BarChart3, Loader2, Flame, TrendingUp, CalendarCheck, Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { RightDrawer } from '@/components/ui/RightDrawer';
import { HabitTodayStrip } from '@/components/habits/HabitTodayStrip';
import { HabitAddForm } from '@/components/habits/HabitAddForm';
import { HabitWeekTable } from '@/components/habits/HabitWeekTable';
import { HabitStreakCard } from '@/components/habits/HabitStreakCard';
import { HabitList } from '@/components/habits/HabitList';
import { HabitInsightsCard } from '@/components/habits/HabitInsightsCard';
import { HabitWeekChart } from '@/components/habits/HabitWeekChart';
import { api, type HabitIn, type HabitStatsResponse } from '@/lib/api';
import {
  addDays,
  formatWeekRange,
  startOfWeek,
  toISODate,
} from '@/lib/date';

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

  const [addOpen, setAddOpen] = useState(false);
  const [habitFormKey, setHabitFormKey] = useState(0);
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const [tab, setTab] = useState<Tab>('log');

  // Current week Mon–Sun for hero section
  const thisWeekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const thisWeekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(thisWeekStart, i)),
    [thisWeekStart],
  );
  const thisWeekFrom = useMemo(() => toISODate(thisWeekStart), [thisWeekStart]);
  const thisWeekTo   = useMemo(() => toISODate(addDays(thisWeekStart, 6)), [thisWeekStart]);

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

  const habitStatsQ = useQuery<HabitStatsResponse>({
    queryKey: ['habits-stats', 30],
    queryFn: () => api.habits.stats(30),
    staleTime: 1000 * 60,
  });

  // Per-habit checkins for this week (for the hero bar chart)
  const weekCheckinQueries = useQueries({
    queries: (habitsQ.data ?? []).map((h) => ({
      queryKey: ['habit-checkins', h.id, thisWeekFrom, thisWeekTo],
      queryFn: () => api.habits.listCheckins(h.id, thisWeekFrom, thisWeekTo),
      staleTime: 1000 * 30,
    })),
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

  // Compute per-day completion for the hero week glance
  const weekBarData = useMemo(() => {
    const totalHabits = (habitsQ.data ?? []).length;
    if (totalHabits === 0) return thisWeekDays.map((d) => ({ date: d, pct: 0, doneCount: 0 }));
    return thisWeekDays.map((d) => {
      const iso = toISODate(d);
      let doneCount = 0;
      weekCheckinQueries.forEach((q) => {
        if ((q.data as import('@/lib/api').HabitCheckin[] | undefined)?.some((c) => c.day_date === iso)) doneCount++;
      });
      return { date: d, pct: totalHabits > 0 ? doneCount / totalHabits : 0, doneCount };
    });
  }, [habitsQ.data, weekCheckinQueries, thisWeekDays]);

  // Hero KPI values
  const habitStats = habitStatsQ.data;
  const todayDone  = todayRows.filter((r) => r.done).length;
  const todayTotal = todayRows.length;
  const streak     = habitStats?.overall_current_streak ?? 0;
  const rate30     = habitStats
    ? Math.round(
        (habitStats.per_habit.reduce((s, r) => s + r.completion_rate, 0) /
          Math.max(habitStats.per_habit.length, 1)) * 100,
      )
    : 0;

  // Week completion for glance header
  const weekTotal  = weekBarData.reduce((s, d) => s + d.pct, 0);
  const weekPct    = Math.round((weekTotal / 7) * 100);

  // Week range eyebrow
  const weekLabel = useMemo(() => {
    const tz = localStorage.getItem('user_timezone') ?? undefined;
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', ...(tz ? { timeZone: tz } : {}) };
    const from = thisWeekStart.toLocaleDateString('en', opts);
    const to   = addDays(thisWeekStart, 6).toLocaleDateString('en', opts);
    const wn   = getISOWeekNumber(thisWeekStart);
    return `Week ${wn} · ${from} — ${to}`;
  }, [thisWeekStart]);

  return (
    <>
      <PageHeader
        title="Habits"
        eyebrow="HABITS · TRACKER"
        subtitle="Build consistency, one rep at a time. Small actions compounded daily."
        action={
          <button
            type="button"
            onClick={() => { setHabitFormKey(k => k + 1); setAddOpen(true); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              height: 36, padding: '0 16px', borderRadius: 10,
              font: '500 13px/1 var(--font-sans)', color: 'white',
              background: 'var(--grad-primary)',
              boxShadow: 'var(--elev-1), var(--elev-glow)',
              border: 'none', cursor: 'pointer',
            }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            Add habit
          </button>
        }
      />

      <RightDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="New Habit"
      >
        <HabitAddForm
          key={habitFormKey}
          alwaysExpanded
          onCreate={async (payload) => {
            await createMut.mutateAsync(payload);
            setAddOpen(false);
          }}
          onCancel={() => setAddOpen(false)}
        />
      </RightDrawer>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden mb-6"
        style={{
          borderRadius: 24,
          padding: '32px 36px',
          background: `
            radial-gradient(420px 280px at 100% -10%, rgba(255,184,107,0.14), transparent 60%),
            radial-gradient(280px 200px at 0% 110%, rgba(139,124,255,0.10), transparent 60%),
            var(--surface)
          `,
          border: '1px solid var(--border-default)',
          display: 'grid',
          gridTemplateColumns: '1.3fr 1fr',
          gap: 32,
          alignItems: 'center',
        }}
      >
        {/* Left: streak headline + KPI tiles */}
        <div>
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--fg-4)' }}>
            {weekLabel}
          </p>
          <h1
            className="m-0"
            style={{ font: '500 56px/1.02 var(--font-display)', letterSpacing: '-0.025em', color: 'var(--fg-1)' }}
          >
            You're on a{' '}
            <span style={{
              background: 'linear-gradient(135deg, #FFB86B 0%, #FFD76A 50%, #FF7AD9 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              {streak > 0 ? `${streak}-day flame.` : 'a fresh start.'}
            </span>
          </h1>
          <p className="mt-4 text-[14px]" style={{ color: 'var(--fg-3)', maxWidth: 480 }}>
            {todayTotal > 0
              ? `${todayDone} of ${todayTotal} habits done today. ${todayDone >= todayTotal ? 'Full day!' : 'Keep going.'}`
              : 'No habits yet — add your first one.'}
          </p>

          {/* 3 KPI tiles */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            <HeroKpi
              iconBg="rgba(255,184,107,0.12)" iconColor="var(--accent-yellow)"
              icon={<Flame className="w-[18px] h-[18px]" />}
              label="Current streak"
              value={streak > 0 ? String(streak) : '—'}
              unit={streak !== 1 ? 'days' : 'day'}
            />
            <HeroKpi
              iconBg="rgba(139,124,255,0.12)" iconColor="var(--primary-300)"
              icon={<CalendarCheck className="w-[18px] h-[18px]" />}
              label="Today"
              value={todayTotal > 0 ? String(todayDone) : '—'}
              unit={todayTotal > 0 ? `/ ${todayTotal} done` : undefined}
            />
            <HeroKpi
              iconBg="rgba(61,255,152,0.10)" iconColor="var(--accent-green)"
              icon={<TrendingUp className="w-[18px] h-[18px]" />}
              label="30-day rate"
              value={habitStats ? String(rate30) : '—'}
              unit="%"
            />
          </div>
        </div>

        {/* Right: 7-bar week glance */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div>
              <div style={{ font: '500 12px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)' }}>
                This Week
              </div>
              <div style={{ font: '500 22px/1.1 var(--font-display)', letterSpacing: '-0.01em', marginTop: 8 }}>
                {weekBarData.reduce((s, d) => s + d.doneCount, 0)} of {7 * (habits.length || todayTotal)} checks
              </div>
            </div>
            <div style={{ font: '500 36px/1 var(--font-display)', letterSpacing: '-0.02em', color: 'var(--accent-green)' }}>
              {weekPct}%
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {weekBarData.map(({ date, pct }, i) => {
              const isToday = toISODate(date) === toISODate(new Date());
              const dayLabel = ['M','T','W','T','F','S','S'][i];
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div
                    style={{
                      width: '100%', height: 80, borderRadius: 10,
                      background: 'var(--surface-hover)',
                      position: 'relative', overflow: 'hidden',
                      boxShadow: isToday ? 'inset 0 0 0 1.5px var(--primary-500)' : undefined,
                    }}
                  >
                    {pct > 0 && (
                      <div
                        style={{
                          position: 'absolute', left: 0, right: 0, bottom: 0,
                          height: `${Math.max(pct * 100, 4)}%`,
                          background: 'linear-gradient(180deg, var(--primary-400), #6352DB)',
                          borderRadius: 10,
                          boxShadow: '0 0 10px rgba(139,124,255,0.3)',
                        }}
                      />
                    )}
                  </div>
                  <div style={{
                    font: '500 10px/1 var(--font-mono)', letterSpacing: '0.04em',
                    color: isToday ? 'var(--primary-300)' : 'var(--fg-4)',
                  }}>
                    {dayLabel}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Main grid ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-6">
        {/* Left — main content */}
        <div className="space-y-6">
          {/* Today strip */}
          <div>
            <HabitTodayStrip
            rows={todayRows}
            loading={todayQ.isLoading}
            onToggle={handleTodayToggle}
          />
          </div>

          {/* Week Overview */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              {/* Section heading with hairline */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flex: 1, minWidth: 0 }}>
                <span style={{ font: '500 16px/1.2 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)', flexShrink: 0 }}>
                  Week Overview
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                <span style={{ font: '500 11px/1 var(--font-mono)', color: 'var(--fg-4)', flexShrink: 0 }}>
                  {formatWeekRange(weekStart, weekEnd)}
                </span>
              </div>

              {/* Week stepper */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 16 }}>
                <button
                  type="button"
                  onClick={prevWeek}
                  style={{ padding: 6, borderRadius: 8, color: 'var(--fg-4)', background: 'transparent', border: '1px solid var(--border-default)', cursor: 'pointer', display: 'flex' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-1)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                  aria-label="Previous week"
                >
                  <ChevronLeft style={{ width: 14, height: 14 }} />
                </button>
                {!isThisWeek && (
                  <button
                    type="button"
                    onClick={goToThisWeek}
                    style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border-default)', fontSize: 11, fontWeight: 500, color: 'var(--fg-3)', background: 'transparent', cursor: 'pointer' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-1)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-strong)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-3)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)'; }}
                  >
                    Today
                  </button>
                )}
                <button
                  type="button"
                  onClick={nextWeek}
                  style={{ padding: 6, borderRadius: 8, color: 'var(--fg-4)', background: 'transparent', border: '1px solid var(--border-default)', cursor: 'pointer', display: 'flex' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-1)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                  aria-label="Next week"
                >
                  <ChevronRight style={{ width: 14, height: 14 }} />
                </button>
              </div>
            </div>

            {/* Pill tab switcher */}
            <div
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 2,
                padding: 3, borderRadius: 8, marginBottom: 16,
                background: 'var(--surface)', border: '1px solid var(--border-default)',
              }}
            >
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
                Weekly Chart
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
              habitsQ.isLoading ? (
                <div className="flex items-center justify-center py-10 text-ink-500">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading habits…
                </div>
              ) : (
                <HabitWeekChart habits={habits} weekStart={weekStart} />
              )
            )}
          </div>
        </div>

        {/* Right — streak + insights + list */}
        <aside className="space-y-5">
          <HabitStreakCard />
          <HabitInsightsCard />
          <HabitList
            habits={habits}
            loading={habitsQ.isLoading}
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
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        height: 28, padding: '0 12px', borderRadius: 7,
        font: '500 12px/1 var(--font-sans)',
        color: active ? 'var(--fg-1)' : 'var(--fg-3)',
        background: active ? 'var(--surface-elev)' : 'transparent',
        border: 0, cursor: 'pointer',
        transition: 'var(--transition)',
      }}
    >
      {icon}
      {children}
    </button>
  );
}

/** Small KPI tile for the hero section */
function HeroKpi({
  icon, iconBg, iconColor, label, value, unit,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div
      className="flex items-center gap-3 overflow-hidden"
      style={{
        padding: '16px 18px',
        background: 'rgba(8,9,16,0.45)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 16,
      }}
    >
      <div
        className="shrink-0 rounded-xl flex items-center justify-center"
        style={{ width: 36, height: 36, background: iconBg, color: iconColor }}
      >
        {icon}
      </div>
      <div>
        <div style={{ font: '500 12px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)' }}>
          {label}
        </div>
        <div className="mt-1 tabular-nums" style={{ font: '500 20px/1.1 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>
          {value}
          {unit && <span className="font-normal ml-0.5" style={{ fontSize: 12, color: 'var(--fg-3)' }}>{unit}</span>}
        </div>
      </div>
    </div>
  );
}

/** ISO week number helper */
function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
