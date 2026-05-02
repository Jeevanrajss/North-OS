import type { HabitCheckin } from '@/lib/api';
import { fromISODate } from '@/lib/date';

type Props = {
  notes: HabitCheckin[]; // newest first
};

/**
 * Read-only list of check-ins that carry a note. Shows up to 10.
 * Note-adding UI is intentionally deferred — add it via a right-click or
 * long-press affordance on the Week Overview cells later.
 */
export function HabitNotesFeed({ notes }: Props) {
  return (
    <div className="card">
      <div className="card-title">Recent notes</div>
      {notes.length === 0 ? (
        <div className="text-xs text-ink-500 py-6 text-center">
          No notes yet.
        </div>
      ) : (
        <ul className="mt-1 divide-y divide-ink-800">
          {notes.map((n) => (
            <li key={n.id} className="py-2 flex items-start gap-3">
              <span className="shrink-0 text-[11px] text-ink-500 tabular-nums w-16 pt-0.5">
                {fromISODate(n.day_date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
              <p className="text-sm text-ink-200 whitespace-pre-wrap break-words">
                {n.note}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
