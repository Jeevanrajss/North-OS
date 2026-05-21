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

const FIELDS: { key: SummaryKey; dot: string; label: string; placeholder: string }[] = [
  { key: 'summary_highlights', dot: 'var(--accent-yellow)', label: 'Highlights', placeholder: 'Biggest moments of the day…' },
  { key: 'summary_wins',       dot: 'var(--accent-green)',  label: 'Wins',       placeholder: 'What went well?' },
  { key: 'summary_learnings',  dot: 'var(--secondary-500)', label: 'Learnings',  placeholder: 'What did you learn?' },
  { key: 'summary_gratitude',  dot: 'var(--accent-pink)',   label: 'Gratitude',  placeholder: 'What are you grateful for?' },
];

export function SummaryFields({ values, onPatch, disabled }: Props) {
  const [local, setLocal] = useState<Record<SummaryKey, string>>({
    summary_highlights: values.summary_highlights ?? '',
    summary_wins:       values.summary_wins       ?? '',
    summary_learnings:  values.summary_learnings  ?? '',
    summary_gratitude:  values.summary_gratitude  ?? '',
  });
  const [focusedKey, setFocusedKey] = useState<SummaryKey | null>(null);
  const timers = useRef<Partial<Record<SummaryKey, number>>>({});
  const initialKey = useRef<string>('');

  useEffect(() => {
    const key = JSON.stringify(values);
    if (key === initialKey.current) return;
    initialKey.current = key;
    setLocal({
      summary_highlights: values.summary_highlights ?? '',
      summary_wins:       values.summary_wins       ?? '',
      summary_learnings:  values.summary_learnings  ?? '',
      summary_gratitude:  values.summary_gratitude  ?? '',
    });
  }, [values]);

  function update(key: SummaryKey, val: string) {
    setLocal((s) => ({ ...s, [key]: val }));
    if (timers.current[key]) window.clearTimeout(timers.current[key]);
    timers.current[key] = window.setTimeout(() => {
      void onPatch({ [key]: val.trim() === '' ? null : val } as Pick<DayPatch, SummaryKey>);
    }, 600);
  }

  const anyFocused = focusedKey !== null;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 1,
        background: anyFocused ? 'rgba(139,124,255,0.20)' : 'rgba(255,255,255,0.06)',
        borderRadius: 12,
        border: anyFocused
          ? '1px solid rgba(139,124,255,0.40)'
          : '1px solid var(--border-default)',
        overflow: 'hidden',
        transition: 'border-color 200ms, background 200ms',
      }}
    >
      {FIELDS.map((f) => {
        const isFocused = focusedKey === f.key;
        return (
          <div
            key={f.key}
            style={{
              background: isFocused
                ? 'rgba(139,124,255,0.06)'
                : 'rgba(0,0,0,0.22)',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              cursor: 'text',
              transition: 'background 180ms ease',
            }}
            onClick={() => {
              const el = document.getElementById(`summary-${f.key}`);
              el?.focus();
            }}
          >
            <div className="flex items-center gap-2 mb-2.5">
              <span
                style={{
                  width: 6, height: 6, borderRadius: 999, flexShrink: 0,
                  background: f.dot,
                  boxShadow: isFocused ? `0 0 6px ${f.dot}` : 'none',
                  transition: 'box-shadow 180ms',
                }}
              />
              <span
                style={{
                  fontSize: '10.5px', fontWeight: 500,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: isFocused ? 'var(--fg-2)' : 'var(--fg-4)',
                  transition: 'color 180ms',
                }}
              >
                {f.label}
              </span>
            </div>
            <textarea
              id={`summary-${f.key}`}
              value={local[f.key]}
              onChange={(e) => update(f.key, e.target.value)}
              onFocus={() => setFocusedKey(f.key)}
              onBlur={() => setFocusedKey(null)}
              disabled={disabled}
              placeholder={f.placeholder}
              rows={3}
              style={{
                width: '100%',
                resize: 'none',
                background: 'transparent',
                border: 0,
                outline: 'none',
                color: 'var(--fg-1)',
                font: '400 14px/22px var(--font-sans)',
                minHeight: 72,
                opacity: disabled ? 0.5 : 1,
              }}
              className="placeholder:text-ink-500"
            />
          </div>
        );
      })}
    </div>
  );
}
