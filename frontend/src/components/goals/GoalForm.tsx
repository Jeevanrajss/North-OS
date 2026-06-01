import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmojiPickerPopover } from '@/components/habits/EmojiPickerPopover';
import { api, type Goal, type GoalIn, type GoalType } from '@/lib/api';

type Props = {
  initial?: Goal | null;
  onSave: (payload: GoalIn) => Promise<void>;
  onCancel: () => void;
};

const TYPE_OPTIONS: { value: GoalType; label: string; description: string }[] = [
  { value: 'custom',        label: 'Custom',        description: 'Track anything manually' },
  { value: 'habit_streak',  label: 'Habit streak',  description: 'Hit a streak on a specific habit' },
  { value: 'habit_rate',    label: 'Habit rate',    description: 'Completion % over a period' },
  { value: 'finance_save',  label: 'Save money',    description: 'Accumulate income by a date' },
  { value: 'finance_spend', label: 'Limit spending','description': 'Stay under a monthly cap' },
];

export function GoalForm({ initial, onSave, onCancel }: Props) {
  const [emoji, setEmoji]           = useState(initial?.emoji ?? '🎯');
  const [title, setTitle]           = useState(initial?.title ?? '');
  const [description, setDesc]      = useState(initial?.description ?? '');
  const [goalType, setGoalType]     = useState<GoalType>(initial?.goal_type ?? 'custom');
  const [linkedId, setLinkedId]     = useState(initial?.linked_id ?? '');
  const [targetValue, setTarget]    = useState(String(initial?.target_value ?? ''));
  const [periodDays, setPeriod]     = useState(String(initial?.target_period_days ?? '30'));
  const [currentValue, setCurrent]  = useState(String(initial?.current_value ?? ''));
  const [targetDate, setTargetDate] = useState(initial?.target_date ?? '');
  const [spendCategory, setSpendCat]= useState(initial?.linked_id ?? '');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const habitsQ = useQuery({
    queryKey: ['habits'],
    queryFn: () => api.habits.list(false),
    enabled: goalType === 'habit_streak' || goalType === 'habit_rate',
  });

  const metaQ = useQuery({
    queryKey: ['finance-meta'],
    queryFn: () => api.finance.meta(),
    enabled: goalType === 'finance_spend',
  });

  // Reset linked fields when type changes
  useEffect(() => {
    setLinkedId('');
    setSpendCat('');
  }, [goalType]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required.'); return; }

    const tv = targetValue ? parseFloat(targetValue) : null;
    if ((goalType !== 'custom') && (!tv || tv <= 0)) {
      setError('Target value is required for linked goals.'); return;
    }

    const payload: GoalIn = {
      emoji,
      title: title.trim(),
      description: description.trim() || null,
      goal_type: goalType,
      target_value: tv,
      target_date: targetDate || null,
    };

    if (goalType === 'habit_streak' || goalType === 'habit_rate') {
      const habit = (habitsQ.data ?? []).find((h) => h.id === linkedId);
      payload.linked_id = linkedId || null;
      payload.linked_label = habit?.name ?? null;
      if (goalType === 'habit_rate') payload.target_period_days = parseInt(periodDays, 10) || 30;
    }

    if (goalType === 'finance_spend') {
      payload.linked_id = spendCategory || null;
      payload.linked_label = spendCategory || null;
    }

    if (goalType === 'custom' && currentValue) {
      payload.current_value = parseFloat(currentValue) || null;
    }

    setSaving(true); setError(null);
    try {
      await onSave(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  const L = ({ children }: { children: React.ReactNode }) => (
    <label className="text-[10px] text-ink-500 uppercase tracking-wide mb-1 block">{children}</label>
  );

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      {/* Emoji + title */}
      <div className="flex items-center gap-2">
        <EmojiPickerPopover value={emoji} onChange={setEmoji} size="sm" />
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Goal title"
          maxLength={200}
          className="flex-1 min-w-0 rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60"
        />
      </div>

      {/* Goal type */}
      <div>
        <L>Goal type</L>
        <div className="space-y-1.5">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setGoalType(opt.value)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '8px 12px', borderRadius: 10, textAlign: 'left',
                background: goalType === opt.value ? 'rgba(139,124,255,0.10)' : 'var(--surface-elev)',
                border: goalType === opt.value ? '1px solid rgba(139,124,255,0.35)' : '1px solid var(--border-default)',
                cursor: 'pointer',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: goalType === opt.value ? 'var(--primary-300)' : 'var(--fg-2)' }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-4)', marginTop: 1 }}>{opt.description}</div>
              </div>
              {goalType === opt.value && (
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary-500)', flexShrink: 0 }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Habit selector for habit_streak / habit_rate */}
      {(goalType === 'habit_streak' || goalType === 'habit_rate') && (
        <div>
          <L>Habit</L>
          {habitsQ.isLoading ? (
            <div className="text-xs text-ink-500">Loading habits…</div>
          ) : (
            <select
              value={linkedId}
              onChange={(e) => setLinkedId(e.target.value)}
              className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60 text-ink-200"
            >
              <option value="">— Select a habit —</option>
              {(habitsQ.data ?? []).map((h) => (
                <option key={h.id} value={h.id}>{h.emoji} {h.name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Period days for habit_rate */}
      {goalType === 'habit_rate' && (
        <div>
          <L>Measure over (days)</L>
          <input
            type="number" value={periodDays}
            onChange={(e) => setPeriod(e.target.value)}
            min="7" max="365"
            className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </div>
      )}

      {/* Category for finance_spend */}
      {goalType === 'finance_spend' && (
        <div>
          <L>Spending category</L>
          {metaQ.isLoading ? (
            <div className="text-xs text-ink-500">Loading categories…</div>
          ) : (
            <select
              value={spendCategory}
              onChange={(e) => setSpendCat(e.target.value)}
              className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60 text-ink-200"
            >
              <option value="">— All expenses —</option>
              {(metaQ.data?.expense_categories ?? []).map((c: string) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Target value */}
      <div>
        <L>
          {goalType === 'habit_streak'  ? 'Target streak (days)' :
           goalType === 'habit_rate'    ? 'Target completion (%)' :
           goalType === 'finance_save'  ? 'Target savings (₹)' :
           goalType === 'finance_spend' ? 'Monthly spend limit (₹)' :
           'Target value (optional)'}
        </L>
        <input
          type="number"
          value={targetValue}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={goalType === 'habit_rate' ? 'e.g. 80' : goalType === 'habit_streak' ? 'e.g. 30' : 'e.g. 50000'}
          min="0"
          className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60"
        />
      </div>

      {/* Current value for custom */}
      {goalType === 'custom' && (
        <div>
          <L>Current value (optional)</L>
          <input
            type="number" value={currentValue}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="e.g. 15"
            min="0"
            className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </div>
      )}

      {/* Deadline */}
      <div>
        <L>Deadline (optional)</L>
        <input
          type="date" value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60 text-ink-200 [color-scheme:dark]"
        />
      </div>

      {/* Description */}
      <div>
        <L>Description (optional)</L>
        <textarea
          value={description}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Why does this goal matter?"
          rows={3}
          maxLength={500}
          className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60 resize-none"
        />
      </div>

      {error && <div className="text-xs text-red-400">{error}</div>}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="flex-1 rounded-md bg-accent/20 border border-accent/40 py-2 text-sm font-medium text-accent hover:bg-accent/30 disabled:opacity-40"
        >
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Add Goal'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-ink-800 bg-ink-900 px-4 py-2 text-sm text-ink-400 hover:text-ink-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
