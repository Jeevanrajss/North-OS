import { useQuery } from '@tanstack/react-query';
import { api, MAX_MOODS_PER_DAY, type MoodCode } from '@/lib/api';
import { cn } from '@/lib/cn';

type Props = {
  selected: string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
};

/**
 * Color a mood tile by its valence. Negative = warm red/amber, positive =
 * green, neutral = ink gray. Uses inline tailwind classes, no magic numbers.
 */
function valenceClasses(valence: number, active: boolean): string {
  if (active) {
    if (valence >= 2) return 'bg-emerald-500/30 border-emerald-400 text-emerald-50';
    if (valence === 1) return 'bg-emerald-500/20 border-emerald-500/60 text-emerald-100';
    if (valence === -1) return 'bg-amber-500/20 border-amber-500/60 text-amber-100';
    if (valence <= -2) return 'bg-rose-500/25 border-rose-400 text-rose-50';
    return 'bg-ink-800 border-ink-600 text-ink-50';
  }
  // inactive
  return 'bg-ink-950 border-ink-800 text-ink-400 hover:border-ink-600 hover:text-ink-100';
}

export function MoodPicker({ selected, onChange, disabled }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['moods'],
    queryFn: api.journal.listMoods,
    staleTime: 1000 * 60 * 60, // 1h — reference data, rarely changes
  });

  function toggle(code: string) {
    if (disabled) return;
    const isOn = selected.includes(code);
    if (isOn) {
      onChange(selected.filter((c) => c !== code));
      return;
    }
    if (selected.length >= MAX_MOODS_PER_DAY) {
      // Replace the oldest — feels nicer than silently refusing.
      onChange([...selected.slice(1), code]);
      return;
    }
    onChange([...selected, code]);
  }

  if (isLoading) {
    return <div className="text-sm text-ink-400">Loading moods…</div>;
  }
  if (error || !data) {
    return <div className="text-sm text-red-400">Couldn't load moods.</div>;
  }

  const sorted: MoodCode[] = [...data].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {sorted.map((m) => {
          const active = selected.includes(m.code);
          return (
            <button
              key={m.code}
              type="button"
              onClick={() => toggle(m.code)}
              disabled={disabled}
              className={cn(
                'flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-xs transition-colors',
                valenceClasses(m.valence, active),
                disabled && 'opacity-50 cursor-not-allowed',
              )}
              aria-pressed={active}
            >
              <span className="text-lg leading-none">{m.emoji}</span>
              <span className="font-medium">{m.label}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 text-xs text-ink-600">
        Up to {MAX_MOODS_PER_DAY} moods per day.
        {selected.length > 0 && (
          <span className="ml-1 text-ink-400">
            {selected.length}/{MAX_MOODS_PER_DAY} selected
          </span>
        )}
      </div>
    </div>
  );
}
