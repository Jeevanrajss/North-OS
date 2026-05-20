import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type HabitsTodayResponse, type HabitStatsResponse } from '@/lib/api';

export function DashHabitsCard() {
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const { data, isLoading } = useQuery<HabitsTodayResponse>({
    queryKey: ['habits-today', todayISO],
    queryFn: () => api.habits.today(todayISO),
    staleTime: 1000 * 30,
  });

  const { data: statsData } = useQuery<HabitStatsResponse>({
    queryKey: ['habits-stats', 30],
    queryFn: () => api.habits.stats(30),
    staleTime: 1000 * 60,
  });

  const habits     = data?.habits ?? [];
  const doneCount  = habits.filter((h) => h.done).length;
  const total      = habits.length;
  const pct        = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const allDone    = total > 0 && doneCount === total;

  // Map habit_id → current_streak for the flame badges
  const streakMap = useMemo(() => {
    const m: Record<string, number> = {};
    statsData?.per_habit.forEach((r) => { m[r.habit_id] = r.current_streak; });
    return m;
  }, [statsData]);

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0, font: '500 16px/1.2 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>
          Today's habits
        </h3>
        <Link
          to="/app/habits"
          style={{
            height: 30, padding: '0 12px', borderRadius: 8,
            display: 'inline-flex', alignItems: 'center',
            font: '500 12px/1 var(--font-sans)',
            color: 'var(--fg-2)', border: '1px solid var(--border-default)',
            background: 'var(--glass-bg)', textDecoration: 'none', transition: 'var(--transition)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border-strong)'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--fg-1)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border-default)'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--fg-2)'; }}
        >
          Manage habits
        </Link>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--fg-4)', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>Loading…</div>
      ) : habits.length === 0 ? (
        <div style={{ color: 'var(--fg-4)', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>No habits scheduled today.</div>
      ) : (
        <>
          {/* Progress headline */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
            <span style={{ font: '500 32px/1 var(--font-display)', letterSpacing: '-0.02em', color: 'var(--fg-1)' }}>
              {doneCount}<span style={{ color: 'var(--fg-3)', fontSize: 18 }}>/{total}</span>
            </span>
            <span style={{ color: 'var(--fg-3)', fontSize: 14 }}>done</span>
            <span style={{ color: 'var(--accent-green)', fontSize: 12.5, fontWeight: 500, marginLeft: 'auto' }}>
              {pct}% · {allDone ? 'all done!' : 'keep going'}
            </span>
          </div>

          {/* Progress bar */}
          <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-hover)', overflow: 'hidden', marginBottom: 20 }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: allDone
                ? 'linear-gradient(90deg, var(--accent-green), #34d399)'
                : 'linear-gradient(90deg, var(--primary-500), var(--secondary-500))',
              borderRadius: 999,
              boxShadow: '0 0 12px rgba(139,124,255,0.4)',
              transition: 'width 500ms',
            }} />
          </div>

          {/* Habit bubbles */}
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
            {habits.map(({ habit, done }, i) => {
              const streak = streakMap[habit.id] ?? 0;
              return (
                <div
                  key={habit.id}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0 }}
                  title={habit.name + (streak > 0 ? ` · 🔥 ${streak}d streak` : '')}
                >
                  {/* Circle */}
                  <div style={{
                    width: 58, height: 58, borderRadius: '50%',
                    background: done ? 'rgba(61,255,152,0.06)' : 'var(--surface-elev)',
                    display: 'grid', placeItems: 'center',
                    fontSize: 26,
                    border: done
                      ? '2px solid var(--accent-green)'
                      : '1.5px solid var(--border-default)',
                    boxShadow: done
                      ? '0 0 16px rgba(61,255,152,0.28), inset 0 0 8px rgba(61,255,152,0.06)'
                      : 'none',
                    transition: 'border-color 300ms, box-shadow 300ms',
                    filter: done ? 'none' : 'grayscale(0.5) opacity(0.7)',
                    cursor: 'default',
                  }}>
                    {habit.emoji}
                  </div>
                  {/* Label */}
                  <span style={{
                    fontSize: 10.5, fontFamily: 'var(--font-mono)',
                    color: done ? 'var(--accent-green)' : 'var(--fg-4)',
                    fontWeight: done ? 600 : 400,
                    display: 'flex', alignItems: 'center', gap: 2,
                  }}>
                    {streak > 0 ? <>🔥{streak}</> : i + 1}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
