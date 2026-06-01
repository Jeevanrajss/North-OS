import type { AnalyticsCorrelations } from '@/lib/api';

type Props = { data: AnalyticsCorrelations };

function Chip({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 16,
        padding: '18px 20px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute', top: -20, right: -20, width: 90, height: 90,
          borderRadius: '50%', background: color, opacity: 0.10,
        }}
      />
      <div style={{ font: '500 11px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ font: '500 28px/1 var(--font-display)', letterSpacing: '-0.02em', color: 'var(--fg-1)' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11.5, color: 'var(--fg-4)', marginTop: 6 }}>{sub}</div>
      )}
    </div>
  );
}

function DeltaCard({
  label, leftLabel, leftVal, rightLabel, rightVal, delta, higherIsBetter = true,
}: {
  label: string;
  leftLabel: string; leftVal: string;
  rightLabel: string; rightVal: string;
  delta: number;
  higherIsBetter?: boolean;
}) {
  const positive = higherIsBetter ? delta > 0 : delta < 0;
  const neutral = Math.abs(delta) < 0.1;
  const color = neutral ? 'var(--fg-4)' : positive ? 'var(--accent-green)' : 'var(--accent-red)';

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: '18px 20px' }}>
      <div style={{ font: '500 11px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 12 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, background: 'var(--surface-elev)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--fg-4)', marginBottom: 4 }}>{leftLabel}</div>
          <div style={{ font: '500 18px/1 var(--font-display)', color: 'var(--fg-1)' }}>{leftVal}</div>
        </div>
        <div style={{ font: '500 18px/1 var(--font-display)', color, flexShrink: 0 }}>
          {neutral ? '≈' : delta > 0 ? '+' : ''}{typeof delta === 'number' ? delta.toFixed(1) : '—'}
        </div>
        <div style={{ flex: 1, background: 'var(--surface-elev)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--fg-4)', marginBottom: 4 }}>{rightLabel}</div>
          <div style={{ font: '500 18px/1 var(--font-display)', color: 'var(--fg-1)' }}>{rightVal}</div>
        </div>
      </div>
    </div>
  );
}

export function CorrelationCards({ data }: Props) {
  const mhc = data.mood_vs_habit_completion;
  const evm = data.expense_vs_mood;
  const jhc = data.journal_habit_correlation;

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <Chip
          label="Avg Mood"
          value={data.avg_mood_score != null ? `${data.avg_mood_score.toFixed(1)}/5` : '—'}
          sub={`${data.high_mood_days} high · ${data.low_mood_days} low days`}
          color="var(--primary-500)"
        />
        <Chip
          label="Avg Habit Rate"
          value={data.avg_habit_completion != null ? `${Math.round(data.avg_habit_completion * 100)}%` : '—'}
          sub={`${data.perfect_habit_days} perfect · ${data.zero_habit_days} zero days`}
          color="var(--accent-green)"
        />
        <Chip
          label="Avg Daily Spend"
          value={data.avg_daily_expense != null ? `₹${Math.round(data.avg_daily_expense).toLocaleString('en-IN')}` : '—'}
          sub={`${data.days_analysed} days analysed`}
          color="var(--accent-yellow)"
        />
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: '18px 20px' }}>
          <div style={{ font: '500 11px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 10 }}>
            Best / Worst Day
          </div>
          {data.best_day_of_week && data.worst_day_of_week ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--fg-4)', marginBottom: 4 }}>Best</div>
                <div style={{ font: '500 20px/1 var(--font-display)', color: 'var(--accent-green)' }}>
                  {data.best_day_of_week.day}
                </div>
                <div style={{ fontSize: 10, color: 'var(--fg-4)', marginTop: 2 }}>
                  {Math.round(data.best_day_of_week.avg_completion * 100)}%
                </div>
              </div>
              <div style={{ width: 1, background: 'var(--border-subtle)' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--fg-4)', marginBottom: 4 }}>Worst</div>
                <div style={{ font: '500 20px/1 var(--font-display)', color: 'var(--accent-red)' }}>
                  {data.worst_day_of_week.day}
                </div>
                <div style={{ fontSize: 10, color: 'var(--fg-4)', marginTop: 2 }}>
                  {Math.round(data.worst_day_of_week.avg_completion * 100)}%
                </div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--fg-4)' }}>Not enough data</div>
          )}
        </div>
      </div>

      {/* Correlation deltas row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {mhc ? (
          <DeltaCard
            label="Mood on high vs low habit days"
            leftLabel={`High ≥75% (${mhc.sample_high}d)`}
            leftVal={`${mhc.mood_on_high_completion_days.toFixed(1)}/5`}
            rightLabel={`Low <50% (${mhc.sample_low}d)`}
            rightVal={`${mhc.mood_on_low_completion_days.toFixed(1)}/5`}
            delta={mhc.delta}
            higherIsBetter
          />
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: '18px 20px' }}>
            <div style={{ font: '500 11px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 8 }}>
              Mood vs Habits
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-4)' }}>Not enough data yet</div>
          </div>
        )}

        {evm ? (
          <DeltaCard
            label="Spending: high vs low mood"
            leftLabel="High mood"
            leftVal={`₹${Math.round(evm.avg_spend_high_mood).toLocaleString('en-IN')}`}
            rightLabel="Low mood"
            rightVal={`₹${Math.round(evm.avg_spend_low_mood).toLocaleString('en-IN')}`}
            delta={evm.delta}
            higherIsBetter={false}
          />
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: '18px 20px' }}>
            <div style={{ font: '500 11px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 8 }}>
              Spend vs Mood
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-4)' }}>Not enough data yet</div>
          </div>
        )}

        {jhc ? (
          <DeltaCard
            label="Habit rate: journal vs no journal"
            leftLabel="Journal written"
            leftVal={`${Math.round(jhc.habit_rate_with_journal * 100)}%`}
            rightLabel="No journal"
            rightVal={`${Math.round(jhc.habit_rate_without_journal * 100)}%`}
            delta={jhc.delta * 100}
            higherIsBetter
          />
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: '18px 20px' }}>
            <div style={{ font: '500 11px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 8 }}>
              Journal vs Habits
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-4)' }}>Not enough data yet</div>
          </div>
        )}
      </div>
    </div>
  );
}
