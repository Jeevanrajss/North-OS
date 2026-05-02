import { useMemo } from 'react';
import type { HabitDayBit } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fromISODate } from '@/lib/date';

type Props = {
  /** Oldest → newest. Length = end - start + 1. */
  daily: HabitDayBit[];
  /** Which days are scheduled (ISO 0=Mon..6=Sun). Empty = all days. */
  scheduledDays: number[];
};

/**
 * GitHub-contributions-style heatmap.
 *
 * Layout: rows = weekdays (Mon..Sun), columns = ISO weeks, oldest → newest.
 * The first column may be partial (leading empty cells for days before the
 * window starts). The last column is likewise partial (trailing empty cells
 * for days after today).
 *
 * Cells encode three states:
 *   - off-schedule + not done → faint dashed outline
 *   - on-schedule + not done  → solid empty square
 *   - done                    → accent fill
 */
export function HabitHeatmap({ daily, scheduledDays }: Props) {
  const hasSchedule = scheduledDays.length > 0;
  const scheduleSet = useMemo(() => new Set(scheduledDays), [scheduledDays]);

  // Group days into weeks (Mon-anchored columns). Each column is length 7,
  // indexed by ISO weekday (0=Mon..6=Sun). Missing days are `null`.
  const { weeks, monthTicks } = useMemo(() => {
    if (daily.length === 0) return { weeks: [], monthTicks: [] };
    const columns: Array<Array<HabitDayBit | null>> = [];
    let current: Array<HabitDayBit | null> = new Array(7).fill(null);

    // Pad the leading column so we start from Monday.
    const firstDate = fromISODate(daily[0].date);
    const firstIsoWd = (firstDate.getDay() + 6) % 7; // 0=Mon..6=Sun
    for (let i = 0; i < firstIsoWd; i += 1) current[i] = null;

    daily.forEach((bit) => {
      const d = fromISODate(bit.date);
      const iso = (d.getDay() + 6) % 7;
      current[iso] = bit;
      if (iso === 6) {
        columns.push(current);
        current = new Array(7).fill(null);
      }
    });
    // Flush last partial column if any real data landed in it.
    if (current.some((c) => c !== null)) columns.push(current);

    // Month tick positions — first column whose Monday is in a new month.
    const ticks: Array<{ col: number; label: string }> = [];
    let lastMonth = -1;
    columns.forEach((col, idx) => {
      const anchor = col.find((c) => c !== null);
      if (!anchor) return;
      const m = fromISODate(anchor.date).getMonth();
      if (m !== lastMonth) {
        ticks.push({
          col: idx,
          label: fromISODate(anchor.date).toLocaleDateString('en-US', { month: 'short' }),
        });
        lastMonth = m;
      }
    });

    return { weeks: columns, monthTicks: ticks };
  }, [daily]);

  if (daily.length === 0) {
    return (
      <div className="text-xs text-ink-500 py-6 text-center">No data in this window.</div>
    );
  }

  // Cell size scales a bit with week count: small window → roomier cells.
  const cellSize =
    weeks.length <= 8 ? 'w-4 h-4' : weeks.length <= 20 ? 'w-3 h-3' : 'w-2.5 h-2.5';
  const gap = weeks.length <= 20 ? 'gap-1' : 'gap-0.5';

  // Row labels — thin Mon..Sun on the left.
  const rowLabels = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-max">
        {/* Month row */}
        <div className={cn('flex', gap, 'ml-7 mb-1 text-[10px] text-ink-500')}>
          {weeks.map((_, idx) => {
            const tick = monthTicks.find((t) => t.col === idx);
            return (
              <div
                key={idx}
                className={cn(cellSize, 'flex items-center justify-start')}
                style={{ width: cellSize.includes('w-4') ? 16 : cellSize.includes('w-3') ? 12 : 10 }}
              >
                {tick ? <span className="whitespace-nowrap">{tick.label}</span> : null}
              </div>
            );
          })}
        </div>
        {/* Grid body */}
        <div className="flex items-start">
          <div className={cn('flex flex-col mr-1', gap, 'text-[10px] text-ink-500 pt-[1px]')}>
            {rowLabels.map((l, i) => (
              <div key={i} className={cn(cellSize, 'flex items-center')}>
                {l}
              </div>
            ))}
          </div>
          <div className={cn('flex', gap)}>
            {weeks.map((col, colIdx) => (
              <div key={colIdx} className={cn('flex flex-col', gap)}>
                {col.map((bit, wd) => {
                  if (bit === null) {
                    return <div key={wd} className={cn(cellSize, 'opacity-0')} />;
                  }
                  const scheduled = !hasSchedule || scheduleSet.has(wd);
                  const label =
                    fromISODate(bit.date).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    }) +
                    (bit.done ? ' · done' : ' · skipped') +
                    (!scheduled ? ' · off-schedule' : '') +
                    (bit.note_preview ? ` — ${bit.note_preview}` : '');
                  return (
                    <div
                      key={wd}
                      title={label}
                      className={cn(
                        cellSize,
                        'rounded-sm border transition-colors',
                        bit.done
                          ? 'bg-accent/80 border-accent/60'
                          : scheduled
                            ? 'bg-ink-900 border-ink-800'
                            : 'bg-transparent border-dashed border-ink-800',
                      )}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {/* Legend */}
        <div className="mt-3 flex items-center gap-2 text-[10px] text-ink-500">
          <span>Less</span>
          <span className={cn(cellSize, 'rounded-sm bg-ink-900 border border-ink-800')} />
          <span className={cn(cellSize, 'rounded-sm bg-accent/30 border border-accent/30')} />
          <span className={cn(cellSize, 'rounded-sm bg-accent/60 border border-accent/50')} />
          <span className={cn(cellSize, 'rounded-sm bg-accent/80 border border-accent/60')} />
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
