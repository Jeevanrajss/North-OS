import { useQuery } from '@tanstack/react-query';
import { api, MAX_MOODS_PER_DAY, type MoodCode } from '@/lib/api';

type Props = {
  selected: string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
};

export function MoodPicker({ selected, onChange, disabled }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['moods'],
    queryFn: api.journal.listMoods,
    staleTime: 1000 * 60 * 60,
  });

  function toggle(code: string) {
    if (disabled) return;
    const isOn = selected.includes(code);
    if (isOn) {
      onChange(selected.filter((c) => c !== code));
      return;
    }
    if (selected.length >= MAX_MOODS_PER_DAY) {
      onChange([...selected.slice(1), code]);
      return;
    }
    onChange([...selected, code]);
  }

  if (isLoading) return <div className="text-xs text-fg-4">Loading moods…</div>;
  if (error || !data) return <div className="text-xs text-red-400">Couldn't load moods.</div>;

  const sorted: MoodCode[] = [...data].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((m) => {
          const active = selected.includes(m.code);
          return (
            <button
              key={m.code}
              type="button"
              onClick={() => toggle(m.code)}
              disabled={disabled}
              aria-pressed={active}
              className="inline-flex items-center gap-1.5 rounded-full text-xs font-medium border transition-all duration-150"
              style={{
                height: 30,
                padding: '0 12px 0 10px',
                ...(active
                  ? {
                      background: 'linear-gradient(135deg, rgb(var(--primary-rgb) / 0.18), rgb(var(--primary-rgb) / 0.08))',
                      borderColor: 'rgb(var(--primary-rgb) / 0.5)',
                      color: 'var(--fg-1)',
                      boxShadow: '0 0 0 3px rgb(var(--primary-rgb) / 0.10)',
                    }
                  : {
                      background: 'rgb(var(--overlay-rgb) / 0.02)',
                      borderColor: 'rgb(var(--overlay-rgb) / 0.08)',
                      color: 'var(--fg-3)',
                    }),
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontSize: '12.5px',
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>{m.emoji}</span>
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2" style={{ fontSize: 11, color: 'rgb(var(--overlay-rgb) / 0.30)' }}>
        Pick up to {MAX_MOODS_PER_DAY}
        {selected.length > 0 && (
          <span style={{ marginLeft: 4, color: 'rgb(var(--overlay-rgb) / 0.50)' }}>
            {selected.length}/{MAX_MOODS_PER_DAY} selected
          </span>
        )}
      </div>
    </div>
  );
}
