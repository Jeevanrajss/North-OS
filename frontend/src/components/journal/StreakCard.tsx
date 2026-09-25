import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function StreakCard() {
  const { data } = useQuery({
    queryKey: ['stats', 30],
    queryFn: () => api.journal.stats(30),
    staleTime: 1000 * 60,
  });

  const last7         = data?.daily_valence.slice(-7) ?? [];
  const currentStreak = data?.current_streak ?? 0;
  const longestStreak = data?.longest_streak_in_window ?? 0;
  const totalEntries  = data?.total_entries ?? 0;

  const firstDay = last7[0]
    ? new Date(last7[0].date + 'T00:00:00').toLocaleDateString('en', { weekday: 'short' }).toUpperCase()
    : 'MON';

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* Header */}
      <h3 style={{ margin: '0 0 14px', font: '500 12px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Streak
        <span style={{ color: 'var(--fg-3)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'none', fontWeight: 400 }}>7 days</span>
      </h3>

      {/* KPI: current streak */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ font: '500 12px/1 var(--font-sans)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 4 }}>
          Current streak
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ font: '500 36px/1 var(--font-display)', letterSpacing: '-0.02em', color: 'var(--fg-1)' }}>
            {currentStreak}
          </span>
          <span style={{ color: 'var(--fg-3)', fontSize: 13 }}>days</span>
        </div>
      </div>

      {/* 7-day bars */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginTop: 10 }}>
        {(last7.length > 0 ? last7 : Array(7).fill({ entry_count: 0, date: '' })).map((p, i) => (
          <div
            key={p.date || i}
            style={{
              height: 28, borderRadius: 4,
              background: p.entry_count > 0
                ? 'linear-gradient(180deg, var(--primary-500), var(--primary-700, var(--primary-500)))'
                : 'var(--surface-hover)',
              boxShadow: p.entry_count > 0 ? '0 0 10px rgb(var(--primary-rgb) / 0.30)' : 'none',
            }}
            title={p.date ? `${p.date}: ${p.entry_count} entr${p.entry_count === 1 ? 'y' : 'ies'}` : ''}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--fg-4)', marginTop: 10, fontFamily: 'var(--font-mono)' }}>
        <span>{firstDay}</span>
        <span>TODAY</span>
      </div>

      {/* Stats footer */}
      <div style={{ display: 'flex', gap: 24, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
        <div>
          <div style={{ font: '500 12px/1 var(--font-sans)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 4 }}>Longest</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ font: '500 22px/1 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>{longestStreak}</span>
            <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>d</span>
          </div>
        </div>
        <div>
          <div style={{ font: '500 12px/1 var(--font-sans)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 4 }}>This month</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ font: '500 22px/1 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>{totalEntries}</span>
            <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>entries</span>
          </div>
        </div>
      </div>
    </div>
  );
}
