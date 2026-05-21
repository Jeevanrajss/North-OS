import { useMemo, useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { Check, MessageSquare } from 'lucide-react';
import { api, type Habit, type HabitCheckin } from '@/lib/api';
import { addDays, isSameDay, toISODate } from '@/lib/date';
import { cn } from '@/lib/cn';

type Props = {
  habits: Habit[];
  weekStart: Date; // Monday (local)
};

/**
 * Week grid: 7 rows (Mon..Sun) × N habit columns + Date + Progress% + Notes.
 *
 * Right-click any habit×day cell to open a note popover (pre-filled if a note
 * already exists). Saving calls PUT /checkins/{date} with { note }, which also
 * ticks the habit if not yet done. A small amber dot on the cell indicates
 * an existing note. The Notes column shows a count of how many habits on that
 * day have notes.
 */
export function HabitWeekTable({ habits, weekStart }: Props) {
  const qc = useQueryClient();

  const [notePopover, setNotePopover] = useState<{
    habitId: string;
    date: string;
    x: number;
    y: number;
    initialNote: string;
  } | null>(null);

  const days = useMemo<Date[]>(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const fromISO = toISODate(days[0]);
  const toISO = toISODate(days[6]);
  const today = new Date();

  // Per-habit weekly check-ins. `useQueries` fires them in parallel.
  const queries = useQueries({
    queries: habits.map((h) => ({
      queryKey: ['habit-checkins', h.id, fromISO, toISO],
      queryFn: () => api.habits.listCheckins(h.id, fromISO, toISO),
      staleTime: 1000 * 10,
    })),
  });

  // habit_id -> date -> HabitCheckin (full objects so we can read notes)
  const checkinByHabit = useMemo<Record<string, Record<string, HabitCheckin>>>(() => {
    const out: Record<string, Record<string, HabitCheckin>> = {};
    habits.forEach((h, i) => {
      const data = queries[i]?.data as HabitCheckin[] | undefined;
      out[h.id] = {};
      (data ?? []).forEach((c) => {
        out[h.id][c.day_date] = c;
      });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits, queries.map((q) => q.dataUpdatedAt).join('|')]);

  const tickMut = useMutation({
    mutationFn: ({ habitId, date }: { habitId: string; date: string }) =>
      api.habits.tick(habitId, date),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['habit-checkins', vars.habitId] });
      qc.invalidateQueries({ queryKey: ['habits-today'] });
      qc.invalidateQueries({ queryKey: ['habits-stats'] });
    },
  });

  const untickMut = useMutation({
    mutationFn: ({ habitId, date }: { habitId: string; date: string }) =>
      api.habits.untick(habitId, date),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['habit-checkins', vars.habitId] });
      qc.invalidateQueries({ queryKey: ['habits-today'] });
      qc.invalidateQueries({ queryKey: ['habits-stats'] });
    },
  });

  const noteMut = useMutation({
    mutationFn: ({ habitId, date, note }: { habitId: string; date: string; note: string }) =>
      api.habits.tick(habitId, date, { note }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['habit-checkins', vars.habitId] });
      qc.invalidateQueries({ queryKey: ['habits-today'] });
      qc.invalidateQueries({ queryKey: ['habits-stats'] });
    },
  });

  function toggle(habitId: string, date: string, currentlyDone: boolean) {
    if (currentlyDone) {
      untickMut.mutate({ habitId, date });
    } else {
      tickMut.mutate({ habitId, date });
    }
  }

  function openNotePopover(e: React.MouseEvent, habitId: string, date: string) {
    e.preventDefault();
    const initialNote = checkinByHabit[habitId]?.[date]?.note ?? '';
    setNotePopover({ habitId, date, x: e.clientX, y: e.clientY, initialNote });
  }

  function dayProgressPct(date: Date): number {
    if (habits.length === 0) return 0;
    const iso = toISODate(date);
    let done = 0;
    habits.forEach((h) => {
      if (checkinByHabit[h.id]?.[iso]) done += 1;
    });
    return Math.round((done / habits.length) * 100);
  }

  function habitAvgPct(habitId: string): number {
    const dateMap = checkinByHabit[habitId];
    if (!dateMap) return 0;
    let count = 0;
    days.forEach((d) => {
      if (dateMap[toISODate(d)]) count += 1;
    });
    return Math.round((count / 7) * 100);
  }

  if (habits.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-ink-800 px-5 py-10 text-center text-sm text-ink-500">
        No habits yet. Add one above to start tracking.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="py-2 pr-3 font-medium w-[8.5rem]">Date</th>
              <th className="py-2 pr-3 font-medium w-28">Progress</th>
              {habits.map((h) => (
                <th
                  key={h.id}
                  title={`${h.name} — open details`}
                  className="py-2 px-2 font-medium text-center w-10"
                >
                  <Link
                    to={`/habits/${h.id}`}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-ink-900 transition-colors"
                    aria-label={`View ${h.name} details`}
                  >
                    <span className="text-base leading-none">{h.emoji}</span>
                  </Link>
                </th>
              ))}
              <th className="py-2 pl-3 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const iso = toISODate(d);
              const pct = dayProgressPct(d);
              const isToday = isSameDay(d, today);
              const dayNoteCount = habits.reduce(
                (n, h) => n + (checkinByHabit[h.id]?.[iso]?.note ? 1 : 0),
                0,
              );
              return (
                <tr
                  key={iso}
                  className={cn(
                    'border-t border-ink-800',
                    isToday && 'bg-ink-900/40',
                  )}
                >
                  <td className="py-2 pr-3 border-t border-ink-800 whitespace-nowrap">
                    <span className={cn('text-ink-200', isToday && 'text-accent font-medium')}>
                      {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      <span
                        className={cn(
                          'ml-1.5 text-[11px]',
                          isToday ? 'text-accent/80' : 'text-ink-500',
                        )}
                      >
                        {d.toLocaleDateString('en-US', { weekday: 'short' })}
                      </span>
                      {isToday && <span className="ml-1 text-[10px] uppercase">Today</span>}
                    </span>
                  </td>
                  <td className="py-2 pr-3 border-t border-ink-800">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-ink-800 overflow-hidden">
                        <div
                          className="h-full bg-accent/70"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-ink-500 tabular-nums w-9">{pct}%</span>
                    </div>
                  </td>
                  {habits.map((h) => {
                    const checkin = checkinByHabit[h.id]?.[iso];
                    const done = !!checkin;
                    const hasNote = !!checkin?.note;
                    const isoWeekday = (d.getDay() + 6) % 7;
                    const offSchedule =
                      h.frequency_kind === 'weekly' && !h.weekdays.includes(isoWeekday);
                    return (
                      <td key={h.id} className="py-2 px-2 border-t border-ink-800 text-center">
                        <div className="relative inline-flex items-center justify-center">
                          <button
                            type="button"
                            onClick={() => toggle(h.id, iso, done)}
                            onContextMenu={(e) => openNotePopover(e, h.id, iso)}
                            aria-label={
                              `${done ? 'Untick' : 'Tick'} ${h.name} on ${iso}` +
                              (offSchedule ? ' (off schedule)' : '')
                            }
                            aria-pressed={done}
                            title={
                              hasNote
                                ? `Note: ${checkin?.note} — right-click to edit`
                                : 'Right-click to add note'
                            }
                            className={cn(
                              'inline-flex items-center justify-center w-6 h-6 rounded-md border transition-colors',
                              done
                                ? 'bg-accent/20 border-accent/50 text-accent'
                                : offSchedule
                                  ? 'border-dashed border-ink-800 bg-transparent text-transparent opacity-40 hover:opacity-80 hover:border-accent/40'
                                  : 'border-ink-700 bg-ink-950 text-transparent hover:border-accent/40',
                              offSchedule && done && 'border-dashed',
                            )}
                          >
                            {done && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                          </button>
                          {hasNote && (
                            <span
                              className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 pointer-events-none"
                              aria-label="Has note"
                            />
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td className="py-2 pl-3 border-t border-ink-800 text-xs">
                    {dayNoteCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-ink-400">
                        <MessageSquare className="w-3 h-3" />
                        {dayNoteCount}
                      </span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="text-[11px] uppercase tracking-wider text-ink-500">
              <td className="py-2 pr-3 pt-3 border-t border-ink-800">Average</td>
              <td className="py-2 pr-3 pt-3 border-t border-ink-800" />
              {habits.map((h) => (
                <td
                  key={h.id}
                  className="py-2 px-2 pt-3 border-t border-ink-800 text-center tabular-nums text-ink-400"
                >
                  {habitAvgPct(h.id)}%
                </td>
              ))}
              <td className="py-2 pl-3 pt-3 border-t border-ink-800" />
            </tr>
          </tfoot>
        </table>
      </div>

      {notePopover && (
        <NotePopover
          date={notePopover.date}
          initialNote={notePopover.initialNote}
          x={notePopover.x}
          y={notePopover.y}
          onSave={(note) => {
            noteMut.mutate({ habitId: notePopover.habitId, date: notePopover.date, note });
            setNotePopover(null);
          }}
          onClose={() => setNotePopover(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Note popover — fixed-position textarea for adding/editing a checkin note.
// Closes on Escape or outside click. Cmd/Ctrl+Enter submits.
// ---------------------------------------------------------------------------
type NotePopoverProps = {
  date: string;
  initialNote: string;
  x: number;
  y: number;
  onSave: (note: string) => void;
  onClose: () => void;
};

function NotePopover({ date, initialNote, x, y, onSave, onClose }: NotePopoverProps) {
  const [text, setText] = useState(initialNote);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - 260);
  const top = Math.min(y, window.innerHeight - 190);

  return (
    <div
      ref={ref}
      style={{ left, top }}
      className="fixed z-50 w-60 rounded-lg shadow-xl p-3 space-y-2"
    >
      <div className="text-[11px] text-ink-400">{date}</div>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave(text);
        }}
        maxLength={280}
        rows={3}
        placeholder="Add a note…"
        className="w-full rounded-md px-2 py-1.5 text-xs text-ink-100 placeholder:text-ink-500 resize-none outline-none focus:border-accent/60"
      />
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onClose}
          className="px-2.5 py-1 rounded-md border border-ink-800 bg-ink-900 text-xs text-ink-400 hover:text-ink-200"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(text)}
          className="px-2.5 py-1 rounded-md bg-accent/20 border border-accent/40 text-xs text-accent hover:bg-accent/30"
        >
          Save
        </button>
      </div>
    </div>
  );
}
