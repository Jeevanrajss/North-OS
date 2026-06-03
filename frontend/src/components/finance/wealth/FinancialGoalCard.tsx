type FinancialGoal = {
  id: string; title: string; emoji: string; goal_type: string; timeline: string;
  target_amount: number; current_amount: number; target_date: string | null;
  priority: number; currency: string; progress_pct: number;
  days_remaining: number | null; monthly_needed: number | null; is_on_track: boolean;
};

type Props = { goal: FinancialGoal };

const TIMELINE_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  short:  { bg: 'rgba(61,190,255,0.12)',  color: '#3EBEFF',           border: 'rgba(61,190,255,0.25)' },
  medium: { bg: 'rgba(255,184,107,0.12)', color: 'var(--accent-yellow)', border: 'rgba(255,184,107,0.25)' },
  long:   { bg: 'rgba(61,255,152,0.10)',  color: 'var(--accent-green)',  border: 'rgba(61,255,152,0.22)' },
};

export function FinancialGoalCard({ goal }: Props) {
  const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  const tStyle = TIMELINE_STYLE[goal.timeline] ?? TIMELINE_STYLE.medium;
  const pct = Math.min(100, goal.progress_pct);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: '18px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>{goal.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '500 14px/1.2 var(--font-display)', color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {goal.title}
          </div>
        </div>
        <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono)', background: tStyle.bg, color: tStyle.color, border: `1px solid ${tStyle.border}`, flexShrink: 0 }}>
          {goal.timeline} term
        </span>
      </div>

      {/* Amounts */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
        <span style={{ font: '500 24px/1 var(--font-display)', letterSpacing: '-0.02em', color: 'var(--fg-1)' }}>
          {fmt(goal.current_amount)}
        </span>
        <span style={{ fontSize: 13, color: 'var(--fg-4)' }}>of {fmt(goal.target_amount)}</span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 5, background: 'var(--surface-hover)', borderRadius: 999, marginBottom: 8, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? 'var(--accent-green)' : 'var(--grad-primary)', borderRadius: 999, transition: 'width 600ms ease' }} />
      </div>

      {/* Footer chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {goal.days_remaining !== null && (
          <span style={{ fontSize: 11, color: goal.days_remaining <= 30 ? 'var(--accent-yellow)' : 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>
            {goal.days_remaining === 0 ? 'Due today' : `${goal.days_remaining}d left`}
          </span>
        )}
        {goal.monthly_needed !== null && goal.monthly_needed > 0 && (
          <span style={{ fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>
            · {fmt(goal.monthly_needed)}/mo needed
          </span>
        )}
        <span style={{ marginLeft: 'auto' }} />
        <span style={{
          padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono)',
          ...(goal.is_on_track
            ? { background: 'rgba(61,255,152,0.10)', color: 'var(--accent-green)',  border: '1px solid rgba(61,255,152,0.22)' }
            : { background: 'rgba(255,91,110,0.10)', color: 'var(--accent-red)',    border: '1px solid rgba(255,91,110,0.22)' }),
        }}>
          {goal.is_on_track ? 'On track' : 'Behind'}
        </span>
      </div>
    </div>
  );
}
