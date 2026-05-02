import { useEffect, useRef, useState } from 'react';
import type { DayPatch } from '@/lib/api';

type SummaryKey =
  | 'summary_highlights'
  | 'summary_wins'
  | 'summary_learnings'
  | 'summary_gratitude';

type Props = {
  values: Pick<DayPatch, SummaryKey>;
  onPatch: (patch: Pick<DayPatch, SummaryKey>) => Promise<void> | void;
  disabled?: boolean;
};

const FIELDS: { key: SummaryKey; label: string; placeholder: string }[] = [
  { key: 'summary_highlights', label: 'Highlights', placeholder: "Biggest moments of the day…" },
  { key: 'summary_wins', label: 'Wins', placeholder: 'What went well?' },
  { key: 'summary_learnings', label: 'Learnings', placeholder: 'What did you learn?' },
  { key: 'summary_gratitude', label: 'Gratitude', placeholder: "What are you grateful for?" },
];

/** Debounced per-field save. We send a minimal patch (one key) per flush. */
export function SummaryFields({ values, onPatch, disabled }: Props) {
  const [local, setLocal] = useState<Record<SummaryKey, string>>({
    summary_highlights: values.summary_highlights ?? '',
    summary_wins: values.summary_wins ?? '',
    summary_learnings: values.summary_learnings ?? '',
    summary_gratitude: values.summary_gratitude ?? '',
  });
  const timers = useRef<Partial<Record<SummaryKey, number>>>({});
  const initialKey = useRef<string>('');

  // When the selected day changes upstream, hydrate local state.
  useEffect(() => {
    const key = JSON.stringify(values);
    if (key === initialKey.current) return;
    initialKey.current = key;
    setLocal({
      summary_highlights: values.summary_highlights ?? '',
      summary_wins: values.summary_wins ?? '',
      summary_learnings: values.summary_learnings ?? '',
      summary_gratitude: values.summary_gratitude ?? '',
    });
  }, [values]);

  function update(key: SummaryKey, val: string) {
    setLocal((s) => ({ ...s, [key]: val }));
    if (timers.current[key]) window.clearTimeout(timers.current[key]);
    timers.current[key] = window.setTimeout(() => {
      const nextVal = val.trim() === '' ? null : val;
      void onPatch({ [key]: nextVal } as Pick<DayPatch, SummaryKey>);
    }, 600);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {FIELDS.map((f) => (
        <label key={f.key} className="block">
          <div className="text-xs uppercase tracking-wider text-ink-400 mb-1">{f.label}</div>
          <textarea
            value={local[f.key]}
            onChange={(e) => update(f.key, e.target.value)}
            disabled={disabled}
            placeholder={f.placeholder}
            rows={3}
            className="w-full resize-y rounded-md border border-ink-800 bg-ink-950 px-3 py-2 text-sm
                       placeholder:text-ink-600 focus:outline-none focus:border-accent/60 disabled:opacity-50"
          />
        </label>
      ))}
    </div>
  );
}
