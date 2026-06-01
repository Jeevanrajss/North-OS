import { useState } from 'react';
import { CheckCircle, XCircle, Pencil, MoreHorizontal, AlertTriangle } from 'lucide-react';
import { GoalProgressRing } from './GoalProgressRing';
import type { Goal } from '@/lib/api';

type Props = {
  goal: Goal;
  onEdit: () => void;
  onComplete: () => Promise<void>;
  onAbandon: () => Promise<void>;
  onDelete: () => Promise<void>;
};

function ringColor(pct: number | null, overdue: boolean): string {
  if (overdue) return 'var(--accent-red)';
  if (pct == null) return 'var(--fg-4)';
  if (pct >= 80) return 'var(--accent-green)';
  if (pct >= 50) return 'var(--primary-500)';
  return 'var(--accent-yellow)';
}

function daysChipStyle(days: number | null, overdue: boolean) {
  if (overdue) return { bg: 'rgba(255,91,110,0.12)', border: 'rgba(255,91,110,0.25)', color: 'var(--accent-red)' };
  if (days == null) return null;
  if (days <= 7)  return { bg: 'rgba(255,184,107,0.12)', border: 'rgba(255,184,107,0.25)', color: 'var(--accent-yellow)' };
  if (days <= 14) return { bg: 'rgba(255,255,255,0.05)', border: 'var(--border-default)', color: 'var(--fg-3)' };
  return { bg: 'rgba(61,255,152,0.08)', border: 'rgba(61,255,152,0.20)', color: 'var(--accent-green)' };
}

function typeLabel(goal: Goal): string {
  if (goal.goal_type === 'habit_streak') return `${goal.linked_label ?? 'Habit'} — streak`;
  if (goal.goal_type === 'habit_rate')   return `${goal.linked_label ?? 'Habit'} — ${goal.target_period_days ?? 30}d rate`;
  if (goal.goal_type === 'finance_save') return `Save ${goal.currency} ${goal.target_value?.toLocaleString('en-IN') ?? '—'}`;
  if (goal.goal_type === 'finance_spend') return `Spend ≤${goal.currency} ${goal.target_value?.toLocaleString('en-IN') ?? '—'} / mo`;
  return 'Custom goal';
}

function currentLabel(goal: Goal): string {
  if (!goal.computed_current) return '—';
  if (goal.goal_type === 'habit_streak') return `${Math.round(goal.computed_current)}d streak`;
  if (goal.goal_type === 'habit_rate')   return `${goal.computed_current.toFixed(1)}% completion`;
  if (goal.goal_type === 'finance_save') return `₹${Math.round(goal.computed_current).toLocaleString('en-IN')} saved`;
  if (goal.goal_type === 'finance_spend') return `₹${Math.round(goal.computed_current).toLocaleString('en-IN')} spent`;
  if (goal.current_value != null && goal.target_value)
    return `${goal.current_value} / ${goal.target_value}`;
  return '—';
}

export function GoalCard({ goal, onEdit, onComplete, onAbandon, onDelete }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setMenuOpen(false);
    try { await fn(); } finally { setBusy(false); }
  }

  const pct = goal.progress_pct ?? 0;
  const color = ringColor(goal.progress_pct, goal.overdue);
  const dStyle = daysChipStyle(goal.days_remaining, goal.overdue);
  const isCompleted = goal.status === 'completed';
  const isPaused    = goal.status === 'paused';

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: `1px solid ${goal.overdue ? 'rgba(255,91,110,0.30)' : 'var(--border-default)'}`,
        borderRadius: 16,
        padding: '18px 20px',
        opacity: isCompleted || isPaused ? 0.7 : 1,
        position: 'relative',
      }}
    >
      {/* Top row: ring + info + menu */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <GoalProgressRing pct={isCompleted ? 100 : pct} color={isCompleted ? 'var(--accent-green)' : color} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 16 }}>{goal.emoji}</span>
            <span style={{ font: '500 15px/1.2 var(--font-display)', color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {goal.title}
            </span>
            {isCompleted && <span style={{ fontSize: 13 }}>✅</span>}
            {goal.overdue && <AlertTriangle style={{ width: 13, height: 13, color: 'var(--accent-red)', flexShrink: 0 }} />}
          </div>

          {/* Type sub-label */}
          <div style={{ fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
            {typeLabel(goal)}
          </div>

          {/* Progress bar */}
          <div style={{ height: 5, background: 'var(--surface-hover)', borderRadius: 999, marginBottom: 6, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, isCompleted ? 100 : pct)}%`,
              background: isCompleted ? 'var(--accent-green)' : color,
              borderRadius: 999,
              transition: 'width 600ms ease',
            }} />
          </div>

          {/* Current / target + days */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
              {currentLabel(goal)}
              {goal.target_value && goal.goal_type !== 'finance_save' && goal.goal_type !== 'finance_spend'
                ? ` / ${goal.target_value}${goal.goal_type === 'habit_rate' ? '%' : goal.goal_type === 'habit_streak' ? 'd' : ''}`
                : ''}
            </span>

            {goal.linked_missing && (
              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: 'rgba(255,184,107,0.12)', color: 'var(--accent-yellow)', border: '1px solid rgba(255,184,107,0.25)' }}>
                linked habit deleted
              </span>
            )}

            {dStyle && (
              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: dStyle.bg, color: dStyle.color, border: `1px solid ${dStyle.border}`, fontFamily: 'var(--font-mono)' }}>
                {goal.overdue ? 'overdue' : goal.days_remaining === 0 ? 'due today' : `${goal.days_remaining}d left`}
              </span>
            )}
          </div>
        </div>

        {/* Actions menu */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={busy}
            style={{ padding: 6, borderRadius: 8, color: 'var(--fg-4)', background: 'transparent', border: '1px solid transparent', cursor: 'pointer' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; }}
          >
            <MoreHorizontal style={{ width: 15, height: 15 }} />
          </button>

          {menuOpen && (
            <div
              style={{
                position: 'absolute', top: '100%', right: 0, zIndex: 20,
                background: 'var(--surface-elev)', border: '1px solid var(--border-default)',
                borderRadius: 10, padding: 4, minWidth: 160,
                boxShadow: 'var(--elev-2)',
              }}
            >
              {[
                { icon: Pencil, label: 'Edit', onClick: () => { setMenuOpen(false); onEdit(); }, color: 'var(--fg-2)' },
                { icon: CheckCircle, label: 'Mark complete', onClick: () => act(onComplete), color: 'var(--accent-green)' },
                { icon: XCircle, label: 'Abandon', onClick: () => act(onAbandon), color: 'var(--accent-yellow)' },
                { icon: XCircle, label: 'Delete', onClick: () => act(onDelete), color: 'var(--accent-red)' },
              ].map(({ icon: Icon, label, onClick, color: c }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '7px 10px', borderRadius: 7, fontSize: 12, fontWeight: 500,
                    color: c, background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <Icon style={{ width: 13, height: 13 }} />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {goal.description && (
        <div style={{ fontSize: 12, color: 'var(--fg-4)', marginTop: 10, lineHeight: 1.5 }}>
          {goal.description}
        </div>
      )}
    </div>
  );
}
