import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type Goal } from '@/lib/api';
import { GoalProgressRing } from '@/components/goals/GoalProgressRing';

function ringColor(pct: number | null, overdue: boolean): string {
  if (overdue) return 'var(--accent-red)';
  if (pct == null) return 'var(--fg-4)';
  if (pct >= 80) return 'var(--accent-green)';
  if (pct >= 50) return 'var(--primary-500)';
  return 'var(--accent-yellow)';
}

export function DashGoalsCard() {
  const { data: goals } = useQuery<Goal[]>({
    queryKey: ['goals', 'active'],
    queryFn: () => api.goals.list('active'),
    staleTime: 60_000,
  });

  const activeGoals = (goals ?? [])
    .filter((g) => g.status === 'active')
    .sort((a, b) => {
      // Sort by proximity to deadline
      if (a.days_remaining != null && b.days_remaining != null)
        return a.days_remaining - b.days_remaining;
      if (a.days_remaining != null) return -1;
      if (b.days_remaining != null) return 1;
      return 0;
    })
    .slice(0, 3);

  if (activeGoals.length === 0) return null;

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 18,
        padding: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0, font: '500 16px/1.2 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>
          Goals
        </h3>
        <Link
          to="/app/goals"
          style={{ fontSize: 12, color: 'var(--primary-300)', textDecoration: 'none' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none'; }}
        >
          View all →
        </Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {activeGoals.map((goal) => {
          const pct = goal.progress_pct ?? 0;
          const color = ringColor(goal.progress_pct, goal.overdue);
          return (
            <div
              key={goal.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', borderRadius: 12,
                background: 'var(--surface-elev)', border: '1px solid var(--border-subtle)',
              }}
            >
              <GoalProgressRing pct={pct} color={color} size={44} stroke={4} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 14 }}>{goal.emoji}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {goal.title}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 3, background: 'var(--surface-hover)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 999 }} />
                  </div>
                  {goal.days_remaining != null ? (
                    <span style={{
                      fontSize: 10, fontFamily: 'var(--font-mono)',
                      color: goal.days_remaining <= 7 ? 'var(--accent-yellow)' : 'var(--fg-4)',
                    }}>
                      {goal.days_remaining === 0 ? 'today' : `${goal.days_remaining}d`}
                    </span>
                  ) : goal.overdue ? (
                    <span style={{ fontSize: 10, color: 'var(--accent-red)', fontFamily: 'var(--font-mono)' }}>overdue</span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
