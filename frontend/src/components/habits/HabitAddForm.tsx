import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useToast } from '@/contexts/ToastContext';
import type { FrequencyKind, HabitIn } from '@/lib/api';
import { EmojiPickerPopover } from './EmojiPickerPopover';
import { WeekdayChips } from './WeekdayChips';

type Props = {
  onCreate: (payload: HabitIn) => Promise<void>;
  disabled?: boolean;
  /** When true the form is always visible — no collapsed button state. Used inside drawers. */
  alwaysExpanded?: boolean;
  onCancel?: () => void;
};

const DEFAULT_EMOJI = '✅';

/**
 * Inline "Add habit" form. Collapsed into a button until clicked, then expands
 * into a row: emoji + name + daily/weekly toggle + weekday chips (weekly only).
 * Weekly is specific-days-only; `frequency_target` is derived server-side from
 * the number of selected weekdays.
 */
export function HabitAddForm({ onCreate, disabled, alwaysExpanded, onCancel }: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(DEFAULT_EMOJI);
  const [kind, setKind] = useState<FrequencyKind>('daily');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setEmoji(DEFAULT_EMOJI);
    setKind('daily');
    setWeekdays([]);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required.');
      return;
    }
    if (kind === 'weekly' && weekdays.length === 0) {
      setError('Pick at least one day for weekly habits.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onCreate({
        name: trimmed,
        emoji: emoji.trim() || DEFAULT_EMOJI,
        frequency_kind: kind,
        weekdays: kind === 'weekly' ? weekdays : [],
      });
      toast.success(`✅ "${trimmed}" habit added`);
      reset();
      setOpen(false);
      onCancel?.(); // close drawer if provided
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create habit.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const isExpanded = alwaysExpanded || open;

  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-ink-800 bg-ink-900 px-3 py-1.5 text-xs text-ink-300 hover:border-accent/40 hover:text-accent',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <Plus className="w-3.5 h-3.5" /> Add habit
      </button>
    );
  }

  // Drawer mode — vertical stacked layout
  if (alwaysExpanded) {
    return (
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        {/* Emoji + name */}
        <div className="flex items-center gap-2">
          <EmojiPickerPopover value={emoji} onChange={setEmoji} ariaLabel="Habit emoji" />
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Habit name (e.g. Meditate)"
            maxLength={80}
            className="flex-1 min-w-0 rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </div>

        {/* Frequency toggle */}
        <div>
          <label className="text-[10px] text-ink-500 uppercase tracking-wide mb-1.5 block">Frequency</label>
          <div className="inline-flex rounded-md border border-ink-800 overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setKind('daily')}
              className={cn('px-4 py-2', kind === 'daily' ? 'bg-accent/15 text-accent' : 'bg-ink-900 text-ink-400')}
            >
              Daily
            </button>
            <button
              type="button"
              onClick={() => setKind('weekly')}
              className={cn('px-4 py-2 border-l border-ink-800', kind === 'weekly' ? 'bg-accent/15 text-accent' : 'bg-ink-900 text-ink-400')}
            >
              Weekly
            </button>
          </div>
        </div>

        {/* Weekday chips — only for weekly */}
        {kind === 'weekly' && (
          <div>
            <label className="text-[10px] text-ink-500 uppercase tracking-wide mb-1.5 block">Days</label>
            <WeekdayChips value={weekdays} onChange={setWeekdays} />
          </div>
        )}

        {error && <div className="text-xs text-red-400">{error}</div>}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="flex-1 rounded-md bg-accent/20 border border-accent/40 py-2 text-sm font-medium text-accent hover:bg-accent/30 disabled:opacity-40"
          >
            {saving ? 'Adding…' : 'Add Habit'}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={() => { reset(); onCancel(); }}
              className="rounded-md border border-ink-800 bg-ink-900 px-4 py-2 text-sm text-ink-400 hover:text-ink-200"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    );
  }

  // Inline mode — horizontal compact layout (used in HabitList)
  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="flex flex-wrap items-center gap-2 rounded-md p-2"
    >
      <EmojiPickerPopover value={emoji} onChange={setEmoji} ariaLabel="Habit emoji" />
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Habit name (e.g. Meditate)"
        maxLength={80}
        className="flex-1 min-w-[12ch] rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60"
      />
      <div className="inline-flex rounded-md border border-ink-800 overflow-hidden text-xs">
        <button
          type="button"
          onClick={() => setKind('daily')}
          className={cn(
            'px-2.5 py-1.5',
            kind === 'daily' ? 'bg-accent/15 text-accent' : 'bg-ink-900 text-ink-400',
          )}
        >
          Daily
        </button>
        <button
          type="button"
          onClick={() => setKind('weekly')}
          className={cn(
            'px-2.5 py-1.5 border-l border-ink-800',
            kind === 'weekly' ? 'bg-accent/15 text-accent' : 'bg-ink-900 text-ink-400',
          )}
        >
          Weekly
        </button>
      </div>
      {kind === 'weekly' && (
        <WeekdayChips value={weekdays} onChange={setWeekdays} />
      )}
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-accent/20 border border-accent/40 px-3 py-1.5 text-xs text-accent hover:bg-accent/30 disabled:opacity-50"
      >
        {saving ? 'Adding…' : 'Add'}
      </button>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(false);
          onCancel?.();
        }}
        className="rounded-md border border-ink-800 bg-ink-900 px-2 py-1.5 text-ink-400 hover:text-ink-200"
        aria-label="Cancel"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      {error && <div className="basis-full text-xs text-red-400">{error}</div>}
    </form>
  );
}
