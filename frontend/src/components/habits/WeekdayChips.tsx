import { cn } from '@/lib/cn';

// ISO: 0 = Mon … 6 = Sun. Matches the backend.
const LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type Props = {
  value: number[];
  onChange: (next: number[]) => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
};

/** Seven-chip Mon–Sun multi-select. */
export function WeekdayChips({ value, onChange, size = 'md', disabled }: Props) {
  const selected = new Set(value);

  function toggle(d: number) {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    onChange([...next].sort((a, b) => a - b));
  }

  const box =
    size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-xs';

  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label="Weekdays">
      {LABELS.map((l, d) => {
        const active = selected.has(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => toggle(d)}
            disabled={disabled}
            aria-label={FULL[d]}
            aria-pressed={active}
            title={FULL[d]}
            className={cn(
              'rounded-md border flex items-center justify-center font-medium transition-colors',
              box,
              active
                ? 'bg-accent/20 border-accent/50 text-accent'
                : 'bg-ink-900 border-ink-800 text-ink-500 hover:text-ink-200',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

/** "Daily", "Mon, Fri", or "4 days/wk" style summary. */
export function describeSchedule(
  frequencyKind: 'daily' | 'weekly',
  weekdays: number[],
): string {
  if (frequencyKind === 'daily') return 'Daily';
  if (weekdays.length === 0) return 'Weekly';
  if (weekdays.length === 7) return 'Daily';
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return weekdays.map((d) => labels[d]).join(', ');
}
