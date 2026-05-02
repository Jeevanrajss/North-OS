import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { FrequencyKind, HabitIn } from '@/lib/api';
import { EmojiPickerPopover } from './EmojiPickerPopover';
import { WeekdayChips } from './WeekdayChips';

type Props = {
  onCreate: (payload: HabitIn) => Promise<void>;
  disabled?: boolean;
};

const DEFAULT_EMOJI = '✅';

/**
 * Inline "Add habit" form. Collapsed into a button until clicked, then expands
 * into a row: emoji + name + daily/weekly toggle + weekday chips (weekly only).
 * Weekly is specific-days-only; `frequency_target` is derived server-side from
 * the number of selected weekdays.
 */
export function HabitAddForm({ onCreate, disabled }: Props) {
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
      reset();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create habit.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
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

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-center gap-2 rounded-md border border-ink-800 bg-ink-950 p-2"
    >
      <EmojiPickerPopover value={emoji} onChange={setEmoji} ariaLabel="Habit emoji" />
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Habit name (e.g. Meditate)"
        maxLength={80}
        className="flex-1 min-w-[12ch] bg-ink-900 border border-ink-800 rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60"
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
