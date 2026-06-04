import { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { CorrelationCards } from '@/components/patterns/CorrelationCards';
import { MoodHabitChart } from '@/components/patterns/MoodHabitChart';
import { ExpensePatternChart } from '@/components/patterns/ExpensePatternChart';
import { WeekdayHeatmap } from '@/components/patterns/WeekdayHeatmap';
import { api, type AnalyticsCorrelations, type AnalyticsSnapshot } from '@/lib/api';

const WINDOWS = [
  { label: '30 days', days: 30 },
  { label: '60 days', days: 60 },
  { label: '90 days', days: 90 },
];

function toIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function Patterns() {
  const [windowDays, setWindowDays] = useState(30);

  const fromDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - windowDays);
    return toIso(d);
  }, [windowDays]);

  const toDate = useMemo(() => toIso(new Date()), []);

  const corrQ = useQuery<AnalyticsCorrelations>({
    queryKey: ['analytics-correlations', windowDays],
    queryFn: () => api.analytics.correlations(windowDays),
    staleTime: 1000 * 60 * 10,
  });

  const snapQ = useQuery<AnalyticsSnapshot[]>({
    queryKey: ['analytics-snapshots', fromDate, toDate],
    queryFn: () => api.analytics.snapshots({ from_date: fromDate, to_date: toDate }),
    staleTime: 1000 * 60 * 10,
  });

  const backfillMut = useMutation({
    mutationFn: () => api.analytics.backfill(90),
  });

  const computeTodayMut = useMutation({
    mutationFn: () => api.analytics.computeToday(),
    onSuccess: () => {
      void corrQ.refetch();
      void snapQ.refetch();
    },
  });

  const corr = corrQ.data;
  const snaps = snapQ.data ?? [];
  const insufficient = !corr || corr.days_analysed < 7;

  return (
    <>
      <PageHeader
        title="Patterns"
        eyebrow="PATTERNS · CROSS-MODULE"
        subtitle="Correlations across habits, mood, journal, and spending — computed from your data."
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => computeTodayMut.mutate()}
              disabled={computeTodayMut.isPending}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 34, padding: '0 12px', borderRadius: 9,
                font: '500 12px/1 var(--font-sans)', color: 'var(--fg-3)',
                background: 'var(--surface)', border: '1px solid var(--border-default)',
                cursor: 'pointer', opacity: computeTodayMut.isPending ? 0.6 : 1,
              }}
            >
              <RefreshCw style={{ width: 13, height: 13 }} className={computeTodayMut.isPending ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        }
      />

      {/* Window selector */}
      <div
        className="tab-strip"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 2,
          padding: 3, borderRadius: 10, marginBottom: 24,
          background: 'var(--surface)', border: '1px solid var(--border-default)',
        }}
      >
        {WINDOWS.map((w) => (
          <button
            key={w.days}
            type="button"
            onClick={() => setWindowDays(w.days)}
            style={{
              height: 28, padding: '0 14px', borderRadius: 8,
              font: '500 12px/1 var(--font-sans)',
              color: windowDays === w.days ? 'var(--fg-1)' : 'var(--fg-4)',
              background: windowDays === w.days ? 'var(--surface-elev)' : 'transparent',
              border: 0, cursor: 'pointer', transition: 'var(--transition)',
            }}
          >
            {w.label}
          </button>
        ))}
      </div>

      {/* Insufficient data banner */}
      {insufficient && !corrQ.isLoading && (
        <div
          style={{
            borderRadius: 16, padding: '28px 32px', marginBottom: 24,
            background: 'var(--surface)', border: '1px solid var(--border-default)',
            textAlign: 'center',
          }}
        >
          <div style={{ font: '500 32px/1 var(--font-display)', marginBottom: 12 }}>📊</div>
          <div style={{ font: '500 18px/1.3 var(--font-display)', color: 'var(--fg-1)', marginBottom: 8 }}>
            Not enough data yet
          </div>
          <p style={{ fontSize: 14, color: 'var(--fg-3)', maxWidth: 400, margin: '0 auto 20px' }}>
            Check back after a week of tracking habits and journaling. Correlations need at least 7 days of data to be meaningful.
          </p>
          <button
            type="button"
            onClick={() => backfillMut.mutate()}
            disabled={backfillMut.isPending}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              height: 36, padding: '0 16px', borderRadius: 10,
              font: '500 13px/1 var(--font-sans)', color: 'white',
              background: 'var(--grad-primary)', border: 'none', cursor: 'pointer',
              opacity: backfillMut.isPending ? 0.6 : 1,
            }}
          >
            {backfillMut.isPending ? 'Computing…' : 'Compute last 90 days'}
          </button>
          {backfillMut.isSuccess && (
            <p style={{ marginTop: 12, fontSize: 13, color: 'var(--accent-green)' }}>
              ✓ Done — refresh the page to see your patterns.
            </p>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {corrQ.isLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{ height: 100, borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--border-default)', opacity: 0.5 }}
            />
          ))}
        </div>
      )}

      {/* Correlation cards */}
      {corr && !insufficient && (
        <div style={{ marginBottom: 28 }}>
          <CorrelationCards data={corr} />
        </div>
      )}

      {/* Charts grid */}
      {snaps.length >= 7 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          {/* Mood + Habit line+bar chart */}
          <div className="card" style={{ padding: 22 }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ font: '500 16px/1.2 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)', marginBottom: 4 }}>
                Mood & Habit Completion
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg-4)' }}>
                Orange line = mood score (0–5) · Purple bars = daily habit completion %
              </div>
            </div>
            <MoodHabitChart data={snaps} />
          </div>

          {/* Weekday heatmap */}
          <div className="card" style={{ padding: 22 }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ font: '500 16px/1.2 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)', marginBottom: 4 }}>
                Habit Completion by Day of Week
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg-4)' }}>
                Average completion rate per weekday over the selected window
              </div>
            </div>
            <WeekdayHeatmap data={snaps} />
          </div>

          {/* Expense pattern chart — full width */}
          <div className="card" style={{ padding: 22, gridColumn: '1 / -1' }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ font: '500 16px/1.2 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)', marginBottom: 4 }}>
                Daily Spending Coloured by Mood
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg-4)' }}>
                Bar height = spend amount · Colour = mood level that day
              </div>
            </div>
            <ExpensePatternChart data={snaps} />
          </div>
        </div>
      )}

      {/* API error */}
      {corrQ.isError && (
        <div style={{ color: 'var(--accent-red)', fontSize: 13, marginTop: 12 }}>
          Failed to load analytics data. Is the backend running?
        </div>
      )}
    </>
  );
}
