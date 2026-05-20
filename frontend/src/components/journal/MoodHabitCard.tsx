import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';

export function MoodHabitCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['journal-mood-habits'],
    queryFn: () => api.journal.moodHabits(90),
    staleTime: 1000 * 60 * 5,
  });

  const meaningful = (data?.correlations ?? []).filter(
    (c) => c.days_done >= 5 && c.mood_lift !== null,
  );

  const maxLift = Math.max(0.01, ...meaningful.map((c) => Math.abs(c.mood_lift ?? 0)));

  return (
    <div className="card" style={{ padding: 20, marginBottom: 0 }}>
      {/* Head */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <h2 style={{ margin: 0, font: '500 22px/1.2 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>
            Habits &amp; mood
          </h2>
          <div style={{ color: 'var(--fg-4)', fontSize: 12.5, marginTop: 4 }}>
            How each habit correlates with your mood — {data?.window_days ?? 90}-day window.
          </div>
        </div>
        <div style={{ color: 'var(--fg-4)', fontSize: 11.5 }}>
          {meaningful.length} habit{meaningful.length !== 1 ? 's' : ''} · ±2.0 scale
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--fg-4)', fontSize: 13 }}>Loading…</div>
      ) : meaningful.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--fg-4)', fontSize: 12.5 }}>
          Not enough data yet. Log moods and habits for a few weeks to see correlations.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 14 }}>
            {meaningful.map((c) => {
              const lift = c.mood_lift ?? 0;
              const positive = lift > 0;
              const barWidth = Math.round((Math.abs(lift) / maxLift) * 100);

              return (
                <div
                  key={c.habit_id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    columnGap: 16,
                    rowGap: 8,
                    alignItems: 'center',
                    padding: '14px 16px',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.015)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {/* Habit name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fg-1)', fontWeight: 500, fontSize: 14 }}>
                    <Link
                      to={`/habits/${c.habit_id}`}
                      style={{
                        width: 28, height: 28, borderRadius: 8,
                        background: 'var(--surface-elev)',
                        display: 'grid', placeItems: 'center',
                        fontSize: 14, textDecoration: 'none',
                        flexShrink: 0,
                      }}
                      aria-label={`View ${c.habit_name} details`}
                    >
                      {c.habit_emoji}
                    </Link>
                    {c.habit_name}
                    <span style={{ color: 'var(--fg-4)', fontSize: 11.5, fontWeight: 400, marginLeft: 6 }}>
                      {c.days_done} days done
                    </span>
                  </div>

                  {/* Delta */}
                  <div style={{
                    font: '500 16px/1 var(--font-display)', letterSpacing: '-0.01em',
                    color: positive ? 'var(--accent-green)' : 'var(--accent-red)',
                  }}>
                    {lift > 0 ? '+' : ''}{lift.toFixed(2)}
                  </div>

                  {/* Bar (full width) */}
                  <div style={{
                    gridColumn: '1 / -1',
                    position: 'relative',
                    height: 5, borderRadius: 999,
                    background: 'var(--surface-hover)',
                    overflow: 'visible',
                  }}>
                    {/* Center marker */}
                    <div style={{ position: 'absolute', left: '50%', top: 0, height: '100%', width: 1, background: 'var(--border-strong)' }} />
                    <div style={{
                      position: 'absolute',
                      top: 0, height: '100%', borderRadius: 999,
                      background: positive
                        ? 'linear-gradient(90deg, var(--accent-green), rgba(61,255,152,0.5))'
                        : 'linear-gradient(90deg, rgba(255,91,110,0.5), var(--accent-red))',
                      left: positive ? '50%' : `${50 - barWidth / 2}%`,
                      width: `${barWidth / 2}%`,
                    }} />
                  </div>

                  {/* Detail */}
                  <div style={{ gridColumn: '1 / -1', color: 'var(--fg-4)', fontSize: 10.5, fontFamily: 'var(--font-mono)' }}>
                    {c.avg_mood_with !== null
                      ? `mood ${c.avg_mood_with > 0 ? '+' : ''}${c.avg_mood_with.toFixed(1)} on done days · ${c.avg_mood_without !== null ? `${c.avg_mood_without > 0 ? '+' : ''}${c.avg_mood_without.toFixed(1)}` : '—'} on missed days`
                      : ''}
                  </div>
                </div>
              );
            })}
          </div>

          <p style={{ fontSize: 10.5, color: 'var(--fg-4)', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
            Correlation ≠ causation. Based on mood logged on the same day as check-in.
          </p>
        </>
      )}
    </div>
  );
}
