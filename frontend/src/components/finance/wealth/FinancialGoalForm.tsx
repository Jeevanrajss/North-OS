import { useState } from 'react';
import { EmojiPickerPopover } from '@/components/habits/EmojiPickerPopover';
import { api } from '@/lib/api';

type FinancialGoal = {
  id: string; title: string; emoji: string; goal_type: string; timeline: string;
  target_amount: number; current_amount: number; target_date: string | null;
  priority: number; notes: string | null;
};

type Props = {
  initial?: FinancialGoal | null;
  onSave: () => void;
  onCancel: () => void;
};

const GOAL_TYPES = [
  { value: 'emergency_fund', label: '🛡️ Emergency Fund' },
  { value: 'purchase',       label: '🛍️ Purchase' },
  { value: 'education',      label: '🎓 Education' },
  { value: 'retirement',     label: '🧓 Retirement' },
  { value: 'travel',         label: '✈️ Travel' },
  { value: 'wedding',        label: '💍 Wedding' },
  { value: 'other',          label: '🎯 Other' },
];

const TIMELINES = [
  { value: 'short',  label: 'Short term  (<1 year)' },
  { value: 'medium', label: 'Medium term (1–5 years)' },
  { value: 'long',   label: 'Long term   (>5 years)' },
];

const L = ({ children }: { children: React.ReactNode }) => (
  <label className="text-[10px] text-ink-500 uppercase tracking-wide mb-1 block">{children}</label>
);

export function FinancialGoalForm({ initial, onSave, onCancel }: Props) {
  const [emoji,    setEmoji]    = useState(initial?.emoji ?? '🎯');
  const [title,    setTitle]    = useState(initial?.title ?? '');
  const [goalType, setGoalType] = useState(initial?.goal_type ?? 'purchase');
  const [timeline, setTimeline] = useState(initial?.timeline ?? 'medium');
  const [target,   setTarget]   = useState(String(initial?.target_amount ?? ''));
  const [current,  setCurrent]  = useState(String(initial?.current_amount ?? ''));
  const [date,     setDate]     = useState(initial?.target_date ?? '');
  const [priority, setPriority] = useState(String(initial?.priority ?? '2'));
  const [notes,    setNotes]    = useState(initial?.notes ?? '');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const progressPct = target && current
    ? Math.min(100, Math.round((parseFloat(current) / parseFloat(target)) * 100))
    : 0;

  // Monthly needed estimate
  const monthlyNeeded = (() => {
    if (!date || !target) return null;
    const gap = parseFloat(target) - parseFloat(current || '0');
    if (gap <= 0) return 0;
    const months = Math.max(1, Math.round(
      (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)
    ));
    return Math.ceil(gap / months);
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required.'); return; }
    const tgt = parseFloat(target);
    if (!tgt || tgt <= 0) { setError('Target amount is required.'); return; }
    const payload = {
      emoji,
      title: title.trim(),
      goal_type: goalType,
      timeline,
      target_amount: tgt,
      current_amount: parseFloat(current) || 0,
      target_date: date || null,
      priority: parseInt(priority) || 2,
      notes: notes.trim() || null,
    };
    setSaving(true); setError(null);
    try {
      if (initial) {
        await api.financialGoals.update(initial.id, payload);
      } else {
        await api.financialGoals.create(payload);
      }
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      {/* Emoji + title */}
      <div className="flex items-center gap-2">
        <EmojiPickerPopover value={emoji} onChange={setEmoji} size="sm" />
        <input
          autoFocus value={title} onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Emergency Fund"
          maxLength={200}
          className="flex-1 min-w-0 rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60"
        />
      </div>

      {/* Goal type + timeline */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <L>Goal type</L>
          <select value={goalType} onChange={e => setGoalType(e.target.value)}
            className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60 text-ink-200">
            {GOAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <L>Timeline</L>
          <select value={timeline} onChange={e => setTimeline(e.target.value)}
            className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60 text-ink-200">
            {TIMELINES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Target + current */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <L>Target amount (₹) *</L>
          <input type="number" value={target} onChange={e => setTarget(e.target.value)}
            placeholder="e.g. 500000" min="0"
            className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60" />
        </div>
        <div>
          <L>Amount saved so far (₹)</L>
          <input type="number" value={current} onChange={e => setCurrent(e.target.value)}
            placeholder="e.g. 75000" min="0"
            className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60" />
        </div>
      </div>

      {/* Progress preview */}
      {parseFloat(target) > 0 && (
        <div>
          <div style={{ height: 6, background: 'var(--surface-elev)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progressPct}%`, background: progressPct >= 100 ? 'var(--accent-green)' : 'var(--grad-primary)', borderRadius: 999, transition: 'width 300ms ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-4)' }}>{progressPct}% saved</span>
            {monthlyNeeded !== null && monthlyNeeded > 0 && (
              <span style={{ fontSize: 11, color: 'var(--primary-300)' }}>₹{monthlyNeeded.toLocaleString('en-IN')}/mo needed</span>
            )}
            {monthlyNeeded === 0 && <span style={{ fontSize: 11, color: 'var(--accent-green)' }}>✓ Goal reached!</span>}
          </div>
        </div>
      )}

      {/* Target date */}
      <div>
        <L>Target date (optional)</L>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60 text-ink-200 [color-scheme:dark]" />
      </div>

      {/* Priority */}
      <div>
        <L>Priority</L>
        <div style={{ display: 'flex', gap: 8 }}>
          {[{ v: '1', l: '🔴 High' }, { v: '2', l: '🟡 Medium' }, { v: '3', l: '🟢 Low' }].map(p => (
            <button key={p.v} type="button" onClick={() => setPriority(p.v)}
              style={{
                flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                background: priority === p.v ? 'rgba(139,124,255,0.15)' : 'var(--surface-elev)',
                border: priority === p.v ? '1px solid rgba(139,124,255,0.40)' : '1px solid var(--border-default)',
                color: priority === p.v ? 'var(--primary-300)' : 'var(--fg-3)',
              }}>
              {p.l}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <L>Notes (optional)</L>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          rows={2} maxLength={500} placeholder="e.g. For house down payment"
          className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60 resize-none" />
      </div>

      {error && <div className="text-xs text-red-400">{error}</div>}

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving || !title.trim() || !target}
          className="flex-1 rounded-md bg-accent/20 border border-accent/40 py-2 text-sm font-medium text-accent hover:bg-accent/30 disabled:opacity-40">
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Add Goal'}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-md border border-ink-800 bg-ink-900 px-4 py-2 text-sm text-ink-400 hover:text-ink-200">
          Cancel
        </button>
      </div>
    </form>
  );
}
