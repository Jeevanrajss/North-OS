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
  { key: 'summary_highlights', dot: '#FFD76A', label: 'Highlights', placeholder: 'Biggest moments of the day…' },
  { key: 'summary_wins',       dot: '#3DFF98', label: 'Wins',       placeholder: 'What went well?' },
  { key: 'summary_learnings',  dot: '#3EBEFF', label: 'Learnings',  placeholder: 'What did you learn?' },
  { key: 'summary_gratitude',  dot: '#FF7AD9', label: 'Gratitude',  placeholder: 'What are you grateful for?' },
];

export function SummaryFields({ values, onPatch, disabled }: Props) {
  const [local, setLocal] = useState<Record<SummaryKey, string>>({
    summary_highlights: values.summary_highlights ?? '',
    summary_wins:       values.summary_wins       ?? '',
    summary_learnings:  values.summary_learnings  ?? '',
    summary_gratitude:  values.summary_gratitude  ?? '',
  });
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

  return (
    /* gap:1px + border-subtle bg = hairline dividers between cells */
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 1,
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {FIELDS.map((f) => (
        <div
          key={f.key}
          className="group"
          style={{
            background: '#0E1018',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            transition: 'background 250ms ease',
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.background = '#232734')}
          onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = '#0E1018')}
          onFocusCapture={e => {
            const el = e.currentTarget as HTMLDivElement;
            el.style.background = '#232734';
          }}
          onBlurCapture={e => {
            const el = e.currentTarget as HTMLDivElement;
            el.style.background = '#0E1018';
          }}
        >
          <div className="flex items-center gap-2 mb-2.5">
            <span
              style={{
                width: 6, height: 6, borderRadius: 999, flexShrink: 0,
                background: f.dot,
              }}
            />
            <span
              style={{
                fontSize: '10.5px', fontWeight: 500,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                color: '#7B8498',
              }}
            >
              {f.label}
            </span>
          </div>
          <textarea
            value={local[f.key]}
            onChange={(e) => update(f.key, e.target.value)}
            disabled={disabled}
            placeholder={f.placeholder}
            rows={3}
            style={{
              width: '100%',
              resize: 'none',
              background: 'transparent',
              border: 0,
              outline: 'none',
              color: 'white',
              font: '400 14px/22px Inter, system-ui, sans-serif',
              minHeight: 72,
              opacity: disabled ? 0.5 : 1,
            }}
            className="placeholder:text-ink-500"
          />
        </div>
      ))}
    </div>
  );
}
