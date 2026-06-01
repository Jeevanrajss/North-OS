import type { AnalyticsCorrelations } from '@/lib/api';

type Props = { data: AnalyticsCorrelations };

// ─────────────────────────────────────────────────────────────────────────────
// Summary chip — top row KPIs
// ─────────────────────────────────────────────────────────────────────────────
function Chip({
  label, value, sub, color,
}: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -20, right: -20, width: 90, height: 90, borderRadius: '50%', background: color, opacity: 0.10 }} />
      <div style={{ font: '500 11px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ font: '500 28px/1 var(--font-display)', letterSpacing: '-0.02em', color: 'var(--fg-1)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--fg-4)', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Insight card — correlation with plain-English headline
// ─────────────────────────────────────────────────────────────────────────────
function InsightCard({
  label,
  insight,       // plain English sentence, e.g. "Mood is 1.0 pts higher on productive days"
  insightColor,  // 'green' | 'red' | 'neutral'
  leftLabel, leftVal,
  rightLabel, rightVal,
  diffLabel,     // e.g. "+1.0 pts", "₹409 more", "+16%"
}: {
  label: string;
  insight: string;
  insightColor: 'green' | 'red' | 'neutral';
  leftLabel: string; leftVal: string;
  rightLabel: string; rightVal: string;
  diffLabel: string;
}) {
  const badgeColor = {
    green:   { bg: 'rgba(61,255,152,0.12)',  border: 'rgba(61,255,152,0.25)',  text: 'var(--accent-green)' },
    red:     { bg: 'rgba(255,91,110,0.12)',  border: 'rgba(255,91,110,0.25)',  text: 'var(--accent-red)' },
    neutral: { bg: 'rgba(255,255,255,0.05)', border: 'var(--border-default)',  text: 'var(--fg-3)' },
  }[insightColor];

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: '18px 20px' }}>
      {/* Header label */}
      <div style={{ font: '500 11px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 10 }}>
        {label}
      </div>

      {/* Plain-English insight */}
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-2)', lineHeight: 1.4, marginBottom: 14 }}>
        {insight}
      </div>

      {/* Two comparison boxes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8 }}>
        <div style={{ background: 'var(--surface-elev)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--fg-4)', marginBottom: 4 }}>{leftLabel}</div>
          <div style={{ font: '500 20px/1 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>{leftVal}</div>
        </div>

        {/* Diff badge */}
        <div style={{
          padding: '5px 10px', borderRadius: 999, flexShrink: 0,
          font: '600 12px/1 var(--font-mono)',
          background: badgeColor.bg, border: `1px solid ${badgeColor.border}`, color: badgeColor.text,
        }}>
          {diffLabel}
        </div>

        <div style={{ background: 'var(--surface-elev)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--fg-4)', marginBottom: 4 }}>{rightLabel}</div>
          <div style={{ font: '500 20px/1 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>{rightVal}</div>
        </div>
      </div>
    </div>
  );
}

function NoDataCard({ label }: { label: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: '18px 20px' }}>
      <div style={{ font: '500 11px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: 'var(--fg-4)' }}>Not enough data yet</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────
export function CorrelationCards({ data }: Props) {
  const mhc = data.mood_vs_habit_completion;
  const evm = data.expense_vs_mood;
  const jhc = data.journal_habit_correlation;

  return (
    <div className="space-y-4">
      {/* ── Summary KPI row ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <Chip
          label="Avg Mood Score"
          value={data.avg_mood_score != null ? `${data.avg_mood_score.toFixed(1)} / 5` : '—'}
          sub={`${data.high_mood_days} high days · ${data.low_mood_days} low days`}
          color="var(--primary-500)"
        />
        <Chip
          label="Avg Habit Completion"
          value={data.avg_habit_completion != null ? `${Math.round(data.avg_habit_completion * 100)}%` : '—'}
          sub={`${data.perfect_habit_days} perfect · ${data.zero_habit_days} zero days`}
          color="var(--accent-green)"
        />
        <Chip
          label="Avg Daily Spend"
          value={data.avg_daily_expense != null
            ? `₹${Math.round(data.avg_daily_expense).toLocaleString('en-IN')}`
            : '—'}
          sub={`over ${data.days_analysed} days`}
          color="var(--accent-yellow)"
        />

        {/* Best / Worst day */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: '18px 20px' }}>
          <div style={{ font: '500 11px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 10 }}>
            Best & Worst Day
          </div>
          {data.best_day_of_week && data.worst_day_of_week ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--fg-4)', marginBottom: 4 }}>Best</div>
                <div style={{ font: '500 22px/1 var(--font-display)', color: 'var(--accent-green)' }}>
                  {data.best_day_of_week.day}
                </div>
                <div style={{ fontSize: 10, color: 'var(--fg-4)', marginTop: 2 }}>
                  {Math.round(data.best_day_of_week.avg_completion * 100)}%
                </div>
              </div>
              <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-subtle)' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--fg-4)', marginBottom: 4 }}>Worst</div>
                <div style={{ font: '500 22px/1 var(--font-display)', color: 'var(--accent-red)' }}>
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

      {/* ── Correlation insight row ──────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>

        {/* 1. Mood vs Habit completion */}
        {mhc ? (() => {
          const high = mhc.mood_on_high_completion_days;
          const low  = mhc.mood_on_low_completion_days;
          const diff = Math.abs(high - low);
          const better = high > low;
          return (
            <InsightCard
              label="Mood vs Habit Days"
              insight={
                better
                  ? `Mood is ${diff.toFixed(1)} pts higher on days you complete ≥75% of habits.`
                  : `Mood is similar regardless of habit completion — keep tracking.`
              }
              insightColor={diff >= 0.3 ? 'green' : 'neutral'}
              leftLabel={`High ≥75% · ${mhc.sample_high} days`}
              leftVal={`${high.toFixed(1)} / 5`}
              rightLabel={`Low <50% · ${mhc.sample_low} days`}
              rightVal={`${low.toFixed(1)} / 5`}
              diffLabel={`+${diff.toFixed(1)} pts`}
            />
          );
        })() : <NoDataCard label="Mood vs Habit Days" />}

        {/* 2. Spending vs Mood */}
        {evm ? (() => {
          const highSpend = Math.round(evm.avg_spend_high_mood);
          const lowSpend  = Math.round(evm.avg_spend_low_mood);
          const extra     = Math.abs(lowSpend - highSpend);
          const moreOnBadDays = lowSpend > highSpend;
          return (
            <InsightCard
              label="Spending vs Mood"
              insight={
                moreOnBadDays
                  ? `You spend ₹${extra.toLocaleString('en-IN')} more on low-mood days.`
                  : `Spending is similar regardless of mood — no emotional spending detected.`
              }
              insightColor={extra > 100 ? 'red' : 'neutral'}
              leftLabel="Good mood days"
              leftVal={`₹${highSpend.toLocaleString('en-IN')}`}
              rightLabel="Bad mood days"
              rightVal={`₹${lowSpend.toLocaleString('en-IN')}`}
              diffLabel={moreOnBadDays ? `₹${extra.toLocaleString('en-IN')} more` : `≈ same`}
            />
          );
        })() : <NoDataCard label="Spending vs Mood" />}

        {/* 3. Journal vs Habit completion */}
        {jhc ? (() => {
          const withJ    = Math.round(jhc.habit_rate_with_journal * 100);
          const withoutJ = Math.round(jhc.habit_rate_without_journal * 100);
          const diff     = Math.abs(withJ - withoutJ);
          const better   = withJ > withoutJ;
          return (
            <InsightCard
              label="Journal vs Habits"
              insight={
                better
                  ? `Habit completion is ${diff}% higher on days you write in your journal.`
                  : `No clear link between journaling and habits yet — keep tracking.`
              }
              insightColor={diff >= 5 ? 'green' : 'neutral'}
              leftLabel="Journal written"
              leftVal={`${withJ}%`}
              rightLabel="No journal"
              rightVal={`${withoutJ}%`}
              diffLabel={better ? `+${diff}%` : `${diff}%`}
            />
          );
        })() : <NoDataCard label="Journal vs Habits" />}

      </div>
    </div>
  );
}
