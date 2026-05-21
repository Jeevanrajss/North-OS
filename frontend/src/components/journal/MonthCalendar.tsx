import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type CalendarCell } from '@/lib/api';
import {
  addMonths,
  formatMonthLabel,
  isSameDay,
  isSameMonth,
  isToday,
  monthGrid,
  subMonths,
  toISODate,
  weekdayLabels,
} from '@/lib/date';
import { cn } from '@/lib/cn';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Props = {
  anchorMonth: Date;
  onAnchorChange: (next: Date) => void;
  selectedDate: Date;
  onSelect: (next: Date) => void;
};

function valenceStyle(v: number | null): { bg: string; color: string } {
  if (v == null) return { bg: 'transparent', color: '' };
  if (v >= 0.5)  return { bg: 'rgba(61,255,152,0.10)',  color: 'var(--accent-green)' };
  if (v > -0.5)  return { bg: 'rgba(255,184,77,0.10)',  color: 'var(--accent-yellow)' };
  return           { bg: 'rgba(255,91,110,0.12)',        color: 'var(--accent-red)' };
}

export function MonthCalendar({
  anchorMonth,
  onAnchorChange,
  selectedDate,
  onSelect,
}: Props) {
  const grid = useMemo(() => monthGrid(anchorMonth, 1), [anchorMonth]);
  const start = toISODate(grid[0]);
  const end   = toISODate(grid[grid.length - 1]);

  const { data } = useQuery({
    queryKey: ['calendar', start, end],
    queryFn: () => api.journal.calendar(start, end),
    staleTime: 1000 * 30,
  });

  const cellMap = useMemo(() => {
    const m = new Map<string, CalendarCell>();
    data?.cells.forEach((c) => m.set(c.date, c));
    return m;
  }, [data]);

  // Count entries in the anchor month only
  const entriesThisMonth = useMemo(() => {
    let n = 0;
    grid.forEach((d) => {
      if (isSameMonth(d, anchorMonth)) {
        n += cellMap.get(toISODate(d))?.entry_count ?? 0;
      }
    });
    return n;
  }, [grid, anchorMonth, cellMap]);

  const weekdays = weekdayLabels(1); // Mon-first

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* ── Header ── */}
      <h3 style={{ margin: '0 0 10px', font: '500 12px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Calendar
        <span style={{ color: 'var(--fg-3)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'none', fontWeight: 400 }}>
          {formatMonthLabel(anchorMonth)}
        </span>
      </h3>

      {/* Month head: entry count + nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ font: '500 14px/1 var(--font-display)', letterSpacing: '-0.005em', color: 'var(--fg-1)' }}>
          {entriesThisMonth} entr{entriesThisMonth === 1 ? 'y' : 'ies'} this month
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button
            type="button"
            onClick={() => onAnchorChange(subMonths(anchorMonth, 1))}
            style={{ width: 24, height: 24, borderRadius: 6, display: 'grid', placeItems: 'center', color: 'var(--fg-3)', background: 'transparent', border: 0, cursor: 'pointer' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-1)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-3)'; }}
            aria-label="Previous month"
          >
            <ChevronLeft style={{ width: 12, height: 12 }} />
          </button>
          <button
            type="button"
            onClick={() => onAnchorChange(addMonths(anchorMonth, 1))}
            style={{ width: 24, height: 24, borderRadius: 6, display: 'grid', placeItems: 'center', color: 'var(--fg-3)', background: 'transparent', border: 0, cursor: 'pointer' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-1)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-3)'; }}
            aria-label="Next month"
          >
            <ChevronRight style={{ width: 12, height: 12 }} />
          </button>
        </div>
      </div>

      {/* ── Weekday labels ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {weekdays.map((w) => (
          <div key={w} style={{ textAlign: 'center', font: '500 9.5px/1 var(--font-sans)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-4)', padding: '4px 0' }}>
            {w}
          </div>
        ))}
      </div>

      {/* ── Day grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {grid.map((d) => {
          const iso      = toISODate(d);
          const cell     = cellMap.get(iso);
          const inMonth  = isSameMonth(d, anchorMonth);
          const selected = isSameDay(d, selectedDate);
          const today    = isToday(d);
          const { bg, color } = valenceStyle(cell?.valence_avg ?? null);

          let boxStyle: React.CSSProperties = {
            background: bg || 'transparent',
            borderRadius: 6,
            aspectRatio: '1',
            display: 'grid',
            placeItems: 'center',
            position: 'relative',
            fontSize: 12,
            fontWeight: 500,
            color: !inMonth
              ? 'var(--fg-disabled)'
              : color || (today ? 'white' : 'var(--fg-3)'),
            transition: 'var(--transition)',
            cursor: 'pointer',
            border: 'none',
            padding: 0,
          };

          if (today) {
            boxStyle = {
              ...boxStyle,
              background: 'var(--surface-elev)',
              color: 'white',
              boxShadow: 'inset 0 0 0 1.5px var(--primary-500), 0 0 12px rgba(139,124,255,0.40)',
            };
          }
          if (selected && !today) {
            boxStyle = {
              ...boxStyle,
              boxShadow: 'inset 0 0 0 1.5px rgba(139,124,255,0.85)',
            };
          }

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect(d)}
              className={cn(!inMonth && 'opacity-[0.35]')}
              style={boxStyle}
              onMouseEnter={(e) => { if (!today && !bg) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-1)'; }}
              onMouseLeave={(e) => {
                if (!today && !bg) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = !inMonth ? 'var(--fg-disabled)' : color || (today ? 'white' : 'var(--fg-3)');
              }}
            >
              {d.getDate()}
              {/* Entry dot */}
              {cell?.entry_count ? (
                <span style={{
                  position: 'absolute', bottom: 3,
                  width: 3, height: 3, borderRadius: 999,
                  background: 'var(--primary-400)',
                }} />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* ── Legend ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12, fontSize: 10.5, color: 'var(--fg-4)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <i style={{ width: 8, height: 8, borderRadius: 3, background: 'rgba(61,255,152,0.4)', display: 'inline-block' }} />
          Positive
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <i style={{ width: 8, height: 8, borderRadius: 3, background: 'rgba(255,184,77,0.4)', display: 'inline-block' }} />
          Neutral
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <i style={{ width: 8, height: 8, borderRadius: 3, background: 'rgba(255,91,110,0.5)', display: 'inline-block' }} />
          Low
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
          <i style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--primary-400)', display: 'inline-block' }} />
          Has entries
        </span>
      </div>
    </div>
  );
}
