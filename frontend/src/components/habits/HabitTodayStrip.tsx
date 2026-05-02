import { cn } from '@/lib/cn';
import type { HabitTodayRow } from '@/lib/api';

type Props = {
  rows: HabitTodayRow[];
  loading?: boolean;
  onToggle?: (habitId: string, done: boolean) => void;
};

/**
 * Today strip — one emoji pill per scheduled habit. Done = accented; pending =
 * muted. Keyboard shortcuts 1–9 toggle the corresponding pill (wired in the
 * parent). Number badges on each pill reflect the shortcut. Pills are
 * clickable when onToggle is provided.
 */
export function HabitTodayStrip({ rows, loading, onToggle }: Props) {
  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-500">Loading today…</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Today's habits">
      {rows.map(({ habit, done }, idx) => {
        const shortcut = idx < 9 ? String(idx + 1) : null;
        return (
          <button
            key={habit.id}
            type="button"
            onClick={onToggle ? () => onToggle(habit.id, done) : undefined}
            disabled={!onToggle}
            title={`${habit.name} — ${done ? 'done' : 'pending'}${shortcut ? ` [${shortcut}]` : ''}`}
            className={cn(
              'relative inline-flex items-center justify-center w-9 h-9 rounded-full border text-lg transition-colors',
              done
                ? 'bg-accent/15 border-accent/40 text-ink-50'
                : 'bg-ink-900 border-ink-800 text-ink-500 opacity-60',
              onToggle && 'hover:border-accent/60 cursor-pointer',
              !onToggle && 'cursor-default',
            )}
          >
            <span className={cn(done ? '' : 'grayscale')}>{habit.emoji}</span>
            {shortcut && (
              <span className="absolute -bottom-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-ink-800 border border-ink-700 text-[9px] text-ink-400 font-mono leading-none pointer-events-none">
                {shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
