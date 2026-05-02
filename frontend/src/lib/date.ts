// Small date helpers built on date-fns. Keep the library usage isolated here
// so routes/components stay tidy.
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday as _isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';

/** Format a Date to YYYY-MM-DD for API calls. */
export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** Parse a YYYY-MM-DD string into a Date (at local midnight). */
export function fromISODate(s: string): Date {
  return parseISO(s);
}

/** Today's date as YYYY-MM-DD (local tz). */
export function todayISO(): string {
  return toISODate(new Date());
}

/**
 * Build a 6-row x 7-col month grid anchored on the given month's first day.
 * Week starts on Monday (common for journals — swap to 0 for Sunday-start).
 */
export function monthGrid(anchor: Date, weekStartsOn: 0 | 1 = 1): Date[] {
  const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn });
  const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn });
  const cells: Date[] = [];
  let cur = gridStart;
  while (cur <= gridEnd) {
    cells.push(cur);
    cur = addDays(cur, 1);
  }
  // Always pad to 42 (6 rows) so the grid height is stable.
  while (cells.length < 42) {
    cells.push(addDays(cells[cells.length - 1], 1));
  }
  return cells.slice(0, 42);
}

/** Human-readable label, e.g. "April 2026". */
export function formatMonthLabel(d: Date): string {
  return format(d, 'LLLL yyyy');
}

/** Short weekday labels starting on Monday by default. */
export function weekdayLabels(weekStartsOn: 0 | 1 = 1): string[] {
  const base = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  if (weekStartsOn === 1) {
    return [...base.slice(1), base[0]];
  }
  return base;
}

/** "Friday, April 18" — used in the day-view header. */
export function formatDayHeader(d: Date): string {
  return format(d, 'EEEE, MMMM d');
}

/**
 * Parse a backend timestamp. Our FastAPI/SQLite stack returns naive UTC
 * datetimes ("2026-04-18T07:47:00") with no timezone indicator. JS parseISO
 * interprets such strings as LOCAL time — so without normalization we'd show
 * timestamps offset by the user's tz. This helper forces UTC interpretation
 * by appending "Z" when no tz marker is present. Strings that already carry
 * a Z or +hh:mm offset are passed through unchanged.
 */
export function parseBackendTimestamp(s: string): Date {
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
  return parseISO(hasTz ? s : `${s}Z`);
}

/** Format a backend timestamp in the user's local timezone. */
export function formatLocalTime(s: string, fmt = 'h:mm a'): string {
  try {
    return format(parseBackendTimestamp(s), fmt);
  } catch {
    return '';
  }
}

export const isToday = _isToday;
export { addDays, addMonths, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths, endOfMonth, endOfWeek };

/** "Apr 13 – Apr 19, 2026" or "Mar 30 – Apr 5, 2026" when week spans months. */
export function formatWeekRange(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${format(start, 'MMM d')} – ${format(end, 'd, yyyy')}`;
  }
  if (sameYear) {
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  }
  return `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`;
}
