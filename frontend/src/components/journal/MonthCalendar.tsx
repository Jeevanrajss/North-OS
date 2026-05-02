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

/**
 * Translate avg mood valence (-2..+2) to a background color class.
 * null / no-data = neutral ink surface.
 */
function valenceBg(v: number | null, selected: boolean): string {
  if (selected) return 'ring-2 ring-accent ring-offset-2 ring-offset-ink-900';
  if (v == null) return '';
  if (v >= 1.5) return 'bg-emerald-500/35';
  if (v >= 0.5) return 'bg-emerald-500/20';
  if (v > -0.5) return 'bg-ink-800';
  if (v > -1.5) return 'bg-amber-500/20';
  return 'bg-rose-500/25';
}

export function MonthCalendar({
  anchorMonth,
  onAnchorChange,
  selectedDate,
  onSelect,
}: Props) {
  const grid = useMemo(() => monthGrid(anchorMonth, 1), [anchorMonth]);
  const start = toISODate(grid[0]);
  const end = toISODate(grid[grid.length - 1]);

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

  const weekdays = weekdayLabels(1);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => onAnchorChange(subMonths(anchorMonth, 1))}
          className="p-1.5 rounded-md text-ink-400 hover:text-ink-100 hover:bg-ink-800"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-sm font-medium text-ink-100">{formatMonthLabel(anchorMonth)}</div>
        <button
          type="button"
          onClick={() => onAnchorChange(addMonths(anchorMonth, 1))}
          className="p-1.5 rounded-md text-ink-400 hover:text-ink-100 hover:bg-ink-800"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-[11px] uppercase tracking-wider text-ink-600 mb-1">
        {weekdays.map((w) => (
          <div key={w} className="text-center py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.map((d) => {
          const iso = toISODate(d);
          const cell = cellMap.get(iso);
          const inMonth = isSameMonth(d, anchorMonth);
          const selected = isSameDay(d, selectedDate);
          const today = isToday(d);
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect(d)}
              className={cn(
                'relative aspect-square rounded-md border border-ink-800 p-1 text-xs flex flex-col items-start justify-between transition-colors',
                valenceBg(cell?.valence_avg ?? null, selected),
                !inMonth && 'opacity-40',
                !selected && 'hover:border-ink-600',
              )}
            >
              <span
                className={cn(
                  'font-medium',
                  today ? 'text-accent' : 'text-ink-100',
                  !inMonth && 'text-ink-500',
                )}
              >
                {d.getDate()}
              </span>
              <div className="flex items-center gap-1">
                {cell?.entry_count ? (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-ink-400" title={`${cell.entry_count} entries`} />
                ) : null}
                {cell?.has_summary ? (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent" title="Has summary" />
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 space-y-1.5 text-[11px] text-ink-600">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500/35" /> positive</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-ink-800" /> neutral</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-500/25" /> negative</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-ink-400" /> has entries</span>
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-accent" /> has summary</span>
        </div>
      </div>
    </div>
  );
}
