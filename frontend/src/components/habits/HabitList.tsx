import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, Check, ChevronDown, ChevronRight, Flame, Pencil, Trash2, X } from 'lucide-react';
import {
  api,
  type FrequencyKind,
  type Habit,
  type HabitIn,
  type HabitPatch,
  type HabitStatsResponse,
} from '@/lib/api';
import { cn } from '@/lib/cn';
import { EmojiPickerPopover } from './EmojiPickerPopover';
import { HabitAddForm } from './HabitAddForm';
import { WeekdayChips, describeSchedule } from './WeekdayChips';

type Props = {
  habits: Habit[];
  loading?: boolean;
  onCreate: (payload: HabitIn) => Promise<void>;
};

/**
 * Right-column habit list. Each row: emoji + name + 🔥streak (per-habit).
 * Hover reveals pencil + trash. Clicking pencil turns the row into an inline
 * editor (emoji picker + name input + frequency toggle + weekday chips +
 * save / cancel). Trash archives the habit (soft-delete — history survives).
 */
export function HabitList({ habits, loading, onCreate }: Props) {
  const qc = useQueryClient();
  const [archivedOpen, setArchivedOpen] = useState(false);

  const { data: stats } = useQuery<HabitStatsResponse>({
    queryKey: ['habits-stats', 30],
    queryFn: () => api.habits.stats(30),
    staleTime: 1000 * 30,
  });

  const streakByHabit = useMemo(() => {
    const out: Record<string, number> = {};
    (stats?.per_habit ?? []).forEach((row) => {
      out[row.habit_id] = row.current_streak;
    });
    return out;
  }, [stats]);

  const { data: allWithArchived, isFetching: archivedLoading } = useQuery<Habit[]>({
    queryKey: ['habits', 'archived'],
    queryFn: () => api.habits.list(true),
    enabled: archivedOpen,
    staleTime: 1000 * 30,
  });

  const archivedHabits = useMemo(
    () => (allWithArchived ?? []).filter((h) => h.archived_at !== null),
    [allWithArchived],
  );

  const patchMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: HabitPatch }) =>
      api.habits.patch(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['habits'] });
      qc.invalidateQueries({ queryKey: ['habits-today'] });
      qc.invalidateQueries({ queryKey: ['habits-stats'] });
    },
  });

  const archiveMut = useMutation({
    mutationFn: (id: string) => api.habits.archive(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['habits'] });
      qc.invalidateQueries({ queryKey: ['habits-today'] });
      qc.invalidateQueries({ queryKey: ['habits-stats'] });
      qc.invalidateQueries({ queryKey: ['habit-checkins'] });
    },
  });

  const restoreMut = useMutation({
    mutationFn: (id: string) => api.habits.restore(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['habits'] });
      qc.invalidateQueries({ queryKey: ['habits', 'archived'] });
      qc.invalidateQueries({ queryKey: ['habits-today'] });
      qc.invalidateQueries({ queryKey: ['habits-stats'] });
    },
  });

  function savePatch(id: string, patch: HabitPatch) {
    return patchMut.mutateAsync({ id, patch });
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0, font: '500 16px/1.2 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>
          All habits
        </h3>
        <span style={{ color: 'var(--fg-4)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
          {habits.length} total
        </span>
      </div>

      {loading ? (
        <div style={{ color: 'var(--fg-4)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Loading…</div>
      ) : habits.length === 0 ? (
        <div style={{ color: 'var(--fg-4)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
          No habits yet — add your first one below.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {habits.map((h) => (
            <HabitListRow
              key={h.id}
              habit={h}
              streak={streakByHabit[h.id] ?? 0}
              onSave={(patch) => savePatch(h.id, patch)}
              onArchive={() => archiveMut.mutateAsync(h.id).then(() => undefined)}
            />
          ))}
        </ul>
      )}

      {/* Archived section */}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
        <button
          type="button"
          onClick={() => setArchivedOpen((o) => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--fg-4)', background: 'none', border: 0, cursor: 'pointer', width: '100%' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-2)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)'; }}
        >
          {archivedOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Archived{archivedHabits.length > 0 ? ` (${archivedHabits.length})` : ''}
        </button>
        {archivedOpen && (
          <div style={{ marginTop: 8 }}>
            {archivedLoading ? (
              <div style={{ color: 'var(--fg-4)', fontSize: 12, textAlign: 'center', padding: '8px 0' }}>Loading…</div>
            ) : archivedHabits.length === 0 ? (
              <div style={{ color: 'var(--fg-4)', fontSize: 12, textAlign: 'center', padding: '8px 0' }}>No archived habits.</div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {archivedHabits.map((h) => (
                  <ArchivedHabitRow
                    key={h.id}
                    habit={h}
                    onRestore={() => restoreMut.mutateAsync(h.id).then(() => undefined)}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Add form */}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
        <HabitAddForm onCreate={onCreate} disabled={loading} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Archived row
// ---------------------------------------------------------------------------
type ArchivedRowProps = {
  habit: Habit;
  onRestore: () => Promise<void>;
};

function ArchivedHabitRow({ habit, onRestore }: ArchivedRowProps) {
  const [restoring, setRestoring] = useState(false);

  async function doRestore() {
    setRestoring(true);
    try {
      await onRestore();
    } finally {
      setRestoring(false);
    }
  }

  const archivedDate = habit.archived_at ? habit.archived_at.slice(0, 10) : '';

  return (
    <li className="flex items-center gap-2 rounded-md px-1.5 py-1.5 opacity-50 hover:opacity-75 transition-opacity">
      <span className="w-6 text-center text-base leading-none grayscale">{habit.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink-400 truncate line-through">{habit.name}</div>
        <div className="text-[10px] text-ink-400 truncate">archived {archivedDate}</div>
      </div>
      <button
        type="button"
        onClick={() => void doRestore()}
        disabled={restoring}
        aria-label={`Restore ${habit.name}`}
        title="Restore"
        className="p-1 rounded-md border border-transparent text-ink-500 hover:text-accent hover:border-ink-800 disabled:opacity-40 transition-colors"
      >
        <ArchiveRestore className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// One row
// ---------------------------------------------------------------------------
type RowProps = {
  habit: Habit;
  streak: number;
  onSave: (patch: HabitPatch) => Promise<Habit>;
  onArchive: () => Promise<void>;
};

function HabitListRow({ habit, streak, onSave, onArchive }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [emoji, setEmoji] = useState(habit.emoji);
  const [name, setName] = useState(habit.name);
  const [kind, setKind] = useState<FrequencyKind>(habit.frequency_kind);
  const [weekdays, setWeekdays] = useState<number[]>(habit.weekdays);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  function beginEdit() {
    setEmoji(habit.emoji);
    setName(habit.name);
    setKind(habit.frequency_kind);
    setWeekdays(habit.weekdays);
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEmoji(habit.emoji);
    setName(habit.name);
    setKind(habit.frequency_kind);
    setWeekdays(habit.weekdays);
    setError(null);
  }

  function sameWeekdays(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (kind === 'weekly' && weekdays.length === 0) {
      setError('Pick at least one day.');
      return;
    }

    const patch: HabitPatch = {};
    if (trimmed !== habit.name) patch.name = trimmed;
    if (emoji !== habit.emoji) patch.emoji = emoji;
    if (kind !== habit.frequency_kind) patch.frequency_kind = kind;
    // Weekdays: send when switching to weekly, or when the list actually changed
    // while already weekly. When switching to daily, backend auto-clears.
    const nextDays = kind === 'weekly' ? weekdays : [];
    const currDays = habit.frequency_kind === 'weekly' ? habit.weekdays : [];
    if (kind === 'weekly' && !sameWeekdays(nextDays, currDays)) {
      patch.weekdays = nextDays;
    }

    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(patch);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  async function doArchive() {
    await onArchive();
  }

  if (editing) {
    return (
      <li className="rounded-md bg-ink-950 border border-ink-800 px-1.5 py-1.5 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <EmojiPickerPopover value={emoji} onChange={setEmoji} size="sm" />
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void save();
              } else if (e.key === 'Escape') {
                cancelEdit();
              }
            }}
            maxLength={80}
            className="flex-1 min-w-0 rounded-md px-2 py-1 text-sm outline-none focus:border-accent/60"
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !name.trim()}
            aria-label="Save"
            className="p-1.5 rounded-md bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30 disabled:opacity-40"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            aria-label="Cancel"
            className="p-1.5 rounded-md border border-ink-800 bg-ink-900 text-ink-400 hover:text-ink-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2 pl-1">
          <div className="inline-flex rounded-md border border-ink-800 overflow-hidden text-[11px]">
            <button
              type="button"
              onClick={() => setKind('daily')}
              className={cn(
                'px-2 py-0.5',
                kind === 'daily' ? 'bg-accent/15 text-accent' : 'bg-ink-900 text-ink-400',
              )}
            >
              Daily
            </button>
            <button
              type="button"
              onClick={() => setKind('weekly')}
              className={cn(
                'px-2 py-0.5 border-l border-ink-800',
                kind === 'weekly' ? 'bg-accent/15 text-accent' : 'bg-ink-900 text-ink-400',
              )}
            >
              Weekly
            </button>
          </div>
          {kind === 'weekly' && (
            <WeekdayChips value={weekdays} onChange={setWeekdays} size="sm" />
          )}
        </div>
        {error && <div className="pl-1 text-[11px] text-red-400">{error}</div>}
      </li>
    );
  }

  const scheduleLabel = describeSchedule(habit.frequency_kind, habit.weekdays);

  return (
    <li
      className="group"
      style={{
        display: 'grid',
        gridTemplateColumns: '32px 1fr auto auto',
        gap: 12, alignItems: 'center',
        padding: '12px 12px',
        borderRadius: 12,
        transition: 'background var(--dur) var(--ease)',
        cursor: 'default',
        border: '1px solid transparent',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLLIElement).style.background = 'var(--surface-hover)';
        (e.currentTarget as HTMLLIElement).style.borderColor = 'var(--border-subtle)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLLIElement).style.background = '';
        (e.currentTarget as HTMLLIElement).style.borderColor = 'transparent';
      }}
    >
      {/* Emoji box */}
      <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--surface-elev)', display: 'grid', placeItems: 'center', fontSize: 15, flexShrink: 0 }}>
        {habit.emoji}
      </div>

      {/* Name + schedule */}
      <Link
        to={`/habits/${habit.id}`}
        style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}
        title={`View ${habit.name} details`}
      >
        <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {habit.name}
        </div>
        <div style={{ color: 'var(--fg-4)', fontSize: 11, fontFamily: 'var(--font-mono)', marginTop: 2 }}>{scheduleLabel}</div>
      </Link>

      {/* Streak badge */}
      {streak > 0 ? (
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', borderRadius: 999,
            background: 'rgba(255,184,107,0.10)', border: '1px solid rgba(255,184,107,0.20)',
            color: 'var(--accent-orange)',
            font: '500 11.5px/1 var(--font-mono)',
            whiteSpace: 'nowrap',
          }}
          title={`${streak}-day streak`}
        >
          🔥 {streak}d
        </span>
      ) : (
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', borderRadius: 999,
            background: 'var(--glass-bg)', border: '1px solid var(--border-default)',
            color: 'var(--fg-4)',
            font: '500 11.5px/1 var(--font-mono)',
            whiteSpace: 'nowrap',
          }}
        >
          — 0d
        </span>
      )}

      {/* Actions — visible on hover */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
        className={confirmArchive ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity'}
      >
        {confirmArchive ? (
          <>
            <button
              type="button"
              onClick={() => void doArchive()}
              style={{ padding: '3px 10px', borderRadius: 8, background: 'rgba(255,91,110,0.12)', border: '1px solid rgba(255,91,110,0.30)', color: 'var(--accent-red)', fontSize: 11, cursor: 'pointer' }}
            >
              Archive?
            </button>
            <button
              type="button"
              onClick={() => setConfirmArchive(false)}
              aria-label="Cancel"
              style={{ padding: 4, borderRadius: 6, background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--fg-4)', cursor: 'pointer' }}
            >
              <X className="w-3 h-3" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={beginEdit}
              aria-label={`Edit ${habit.name}`}
              style={{ padding: 4, borderRadius: 6, color: 'var(--fg-4)', background: 'transparent', border: '1px solid transparent', cursor: 'pointer' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-2)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; }}
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              aria-label={`Archive ${habit.name}`}
              style={{ padding: 4, borderRadius: 6, color: 'var(--fg-4)', background: 'transparent', border: '1px solid transparent', cursor: 'pointer' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-red)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; }}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}
