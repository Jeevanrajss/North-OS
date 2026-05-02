import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Flame, Loader2, Percent, Target, TrendingUp } from 'lucide-react';
import { api, type HabitDetailResponse } from '@/lib/api';
import { cn } from '@/lib/cn';
import { HabitHeatmap } from '@/components/habits/HabitHeatmap';
import { HabitDowChart } from '@/components/habits/HabitDowChart';
import { HabitMonthlyTrend } from '@/components/habits/HabitMonthlyTrend';
import { HabitNotesFeed } from '@/components/habits/HabitNotesFeed';
import { describeSchedule } from '@/components/habits/WeekdayChips';

type Window = 30 | 90 | 365;

/**
 * /habits/:id — per-habit exploration.
 *
 *   ← Back
 *   [emoji] Name                       schedule label
 *
 *   [Window: 30 / 90 / 365]
 *   ┌ streak ┐ ┌ longest ┐ ┌ done ┐ ┌ rate ┐
 *   Heatmap (GitHub-style, window-sized)
 *   [Day-of-week]   [Monthly trend]
 *   [Recent notes]
 */
export function HabitDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const [windowDays, setWindowDays] = useState<Window>(90);

  const { data, isLoading, error } = useQuery<HabitDetailResponse>({
    queryKey: ['habit-detail', id, windowDays],
    queryFn: () => api.habits.detail(id, windowDays),
    enabled: Boolean(id),
    staleTime: 1000 * 20,
  });

  return (
    <>
      <div className="mb-4">
        <Link
          to="/habits"
          className="inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-100"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Habits
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-ink-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : error || !data ? (
        <div className="text-sm text-red-400">Failed to load this habit.</div>
      ) : (
        <DetailBody
          data={data}
          windowDays={windowDays}
          onChangeWindow={setWindowDays}
        />
      )}
    </>
  );
}

function DetailBody({
  data,
  windowDays,
  onChangeWindow,
}: {
  data: HabitDetailResponse;
  windowDays: Window;
  onChangeWindow: (w: Window) => void;
}) {
  const { habit, stats, daily, dow, monthly, recent_notes: recent } = data;
  const scheduleLabel = describeSchedule(habit.frequency_kind as 'daily' | 'weekly', habit.weekdays);

  return (
    <>
      {/* Hero */}
      <header className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-4xl leading-none">{habit.emoji}</span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-50">
              {habit.name}
            </h1>
            <p className="text-xs text-ink-500 mt-1">
              {scheduleLabel}
              {habit.archived_at ? ' · archived' : ''}
            </p>
          </div>
        </div>
        <WindowToggle value={windowDays} onChange={onChangeWindow} />
      </header>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={<Flame className="w-4 h-4" />}
          label="Current streak"
          value={stats.current_streak}
          unit="days"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label={`Longest (${windowDays}d)`}
          value={stats.longest_streak_in_window}
          unit="days"
        />
        <StatCard
          icon={<Target className="w-4 h-4" />}
          label="Days ticked"
          value={stats.done_count}
          unit={`of ${windowDays}`}
        />
        <StatCard
          icon={<Percent className="w-4 h-4" />}
          label="Completion"
          value={Math.round(stats.completion_rate * 100)}
          unit="%"
        />
      </div>

      {/* Heatmap */}
      <div className="card mb-6">
        <div className="card-title">Activity</div>
        <HabitHeatmap daily={daily} scheduledDays={habit.weekdays} />
      </div>

      {/* DoW + monthly trend side-by-side on wide screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <HabitDowChart dow={dow} />
        <HabitMonthlyTrend monthly={monthly} />
      </div>

      {/* Notes */}
      <HabitNotesFeed notes={recent} />
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  unit,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  unit?: string;
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ink-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold text-ink-50 tabular-nums">{value}</span>
        {unit && <span className="text-xs text-ink-500">{unit}</span>}
      </div>
    </div>
  );
}

function WindowToggle({
  value,
  onChange,
}: {
  value: Window;
  onChange: (w: Window) => void;
}) {
  const opts: Window[] = [30, 90, 365];
  return (
    <div className="inline-flex rounded-md border border-ink-800 overflow-hidden text-xs">
      {opts.map((w, i) => (
        <button
          key={w}
          type="button"
          onClick={() => onChange(w)}
          className={cn(
            'px-3 py-1.5',
            i > 0 && 'border-l border-ink-800',
            value === w ? 'bg-accent/15 text-accent' : 'bg-ink-900 text-ink-400 hover:text-ink-200',
          )}
        >
          {w}d
        </button>
      ))}
    </div>
  );
}
