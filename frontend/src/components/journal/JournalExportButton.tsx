import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '@/lib/api';
import { toISODate } from '@/lib/date';

const PRESETS: { label: string; days?: number; year?: boolean }[] = [
  { label: 'Last 7d',   days: 7 },
  { label: 'Last 30d',  days: 30 },
  { label: 'Last 90d',  days: 90 },
  { label: 'This year', year: true },
];

export function JournalExportButton() {
  const [open, setOpen]               = useState(false);
  const [activePreset, setActivePreset] = useState<string>('Last 30d');
  const [loading, setLoading]         = useState(false);
  const containerRef                  = useRef<HTMLDivElement>(null);

  const today = toISODate(new Date());

  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return toISODate(d);
  });
  const [end, setEnd] = useState(today);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function applyPreset(label: string, days?: number, year?: boolean) {
    const e = new Date();
    setEnd(toISODate(e));
    if (year) {
      setStart(`${e.getFullYear()}-01-01`);
    } else {
      const s = new Date(e);
      s.setDate(s.getDate() - (days! - 1));
      setStart(toISODate(s));
    }
    setActivePreset(label);
  }

  function handleExport() {
    if (!start || !end || start > end) return;
    setLoading(true);
    try {
      api.journal.export(start, end);
    } finally {
      setTimeout(() => setLoading(false), 800);
    }
    setOpen(false);
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-ink-800
          bg-ink-900 text-xs text-ink-400 hover:text-ink-100 hover:border-ink-700 transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        Export
      </button>

      {/* Popover */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            zIndex: 60,
            width: 300,
            background: '#13151f',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 16,
            padding: '20px',
            boxShadow: '0 12px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          {/* Quick presets */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {PRESETS.map(({ label, days, year }) => {
              const active = activePreset === label;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => applyPreset(label, days, year)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 8,
                    fontSize: 11.5,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 150ms',
                    background: active ? 'rgba(139,124,255,0.18)' : 'rgba(255,255,255,0.05)',
                    border: active ? '1px solid rgba(139,124,255,0.45)' : '1px solid rgba(255,255,255,0.08)',
                    color: active ? '#C4B5FF' : '#7B8498',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Date inputs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#566175', marginBottom: 5 }}>From</label>
              <input
                type="date"
                value={start}
                max={end}
                onChange={(e) => { setStart(e.target.value); setActivePreset(''); }}
                className="w-full rounded-md px-2.5 py-1.5 text-sm outline-none [color-scheme:dark]"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#C9D0E0', fontSize: 12 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#566175', marginBottom: 5 }}>To</label>
              <input
                type="date"
                value={end}
                min={start}
                max={today}
                onChange={(e) => { setEnd(e.target.value); setActivePreset(''); }}
                className="w-full rounded-md px-2.5 py-1.5 text-sm outline-none [color-scheme:dark]"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#C9D0E0', fontSize: 12 }}
              />
            </div>
          </div>

          <p style={{ fontSize: 11, color: '#566175', marginBottom: 16, lineHeight: 1.5 }}>
            Exports as Markdown (.md) — includes mood, tags, daily summary, and all entries.
          </p>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 9, fontSize: 12.5, fontWeight: 500,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#7B8498', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={!start || !end || start > end || loading}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 9, fontSize: 12.5, fontWeight: 500,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: 'rgba(139,124,255,0.18)', border: '1px solid rgba(139,124,255,0.40)',
                color: '#C4B5FF', cursor: 'pointer',
                opacity: (!start || !end || start > end || loading) ? 0.45 : 1,
              }}
            >
              <Download style={{ width: 13, height: 13 }} />
              {loading ? 'Exporting…' : 'Download .md'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
