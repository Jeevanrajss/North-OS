import type { AnalyticsSnapshot } from '@/lib/api';

type Props = { data: AnalyticsSnapshot[] };

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function completionColor(pct: number | null): string {
  if (pct == null) return 'var(--surface-elev)';
  if (pct >= 0.85) return 'rgba(61,255,152,0.70)';
  if (pct >= 0.60) return 'rgba(61,255,152,0.40)';
  if (pct >= 0.35) return 'rgba(255,184,107,0.50)';
  if (pct >  0)    return 'rgba(255,91,110,0.40)';
  return 'rgba(255,255,255,0.06)';
}

export function WeekdayHeatmap({ data }: Props) {
  // Average completion per weekday (0=Mon … 6=Sun)
  const totals: number[] = Array(7).fill(0);
  const counts: number[] = Array(7).fill(0);

  data.forEach((s) => {
    if (s.habit_completion_rate == null) return;
    const dow = new Date(s.date).getDay(); // 0=Sun … 6=Sat
    const mon = (dow + 6) % 7;            // convert to Mon=0
    totals[mon] += s.habit_completion_rate;
    counts[mon]++;
  });

  const averages = totals.map((t, i) => (counts[i] > 0 ? t / counts[i] : null));

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
        {DAYS.map((day, i) => {
          const avg = averages[i];
          const pct = avg != null ? Math.round(avg * 100) : null;
          return (
            <div key={day} style={{ textAlign: 'center' }}>
              {/* Bar */}
              <div
                style={{
                  height: 90,
                  borderRadius: 10,
                  background: 'var(--surface-hover)',
                  position: 'relative',
                  overflow: 'hidden',
                  marginBottom: 6,
                }}
              >
                {avg != null && avg > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0, right: 0, bottom: 0,
                      height: `${Math.max(avg * 100, 4)}%`,
                      background: completionColor(avg),
                      borderRadius: 10,
                      transition: 'height 400ms ease',
                    }}
                  />
                )}
              </div>
              {/* Day label */}
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--fg-4)', marginBottom: 2 }}>
                {day}
              </div>
              {/* Pct */}
              <div style={{ fontSize: 11, fontWeight: 600, color: avg != null ? 'var(--fg-2)' : 'var(--fg-4)' }}>
                {pct != null ? `${pct}%` : '—'}
              </div>
              <div style={{ fontSize: 9, color: 'var(--fg-4)' }}>
                {counts[i] > 0 ? `${counts[i]}d` : ''}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
        {[
          { color: completionColor(0.9), label: '≥85%' },
          { color: completionColor(0.7), label: '60–84%' },
          { color: completionColor(0.5), label: '35–59%' },
          { color: completionColor(0.1), label: '>0%' },
          { color: completionColor(0),   label: '0%' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--fg-4)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: 'inline-block' }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
