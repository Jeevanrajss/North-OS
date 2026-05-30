import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { SubscriptionList } from '@/components/subscriptions/SubscriptionList';
import { SpendingByCategoryCard } from '@/components/subscriptions/SpendingByCategoryCard';
import { UpcomingRenewals } from '@/components/subscriptions/UpcomingRenewals';
import { TrialTrackerCard } from '@/components/subscriptions/TrialTrackerCard';
import { SubForecastCard } from '@/components/subscriptions/SubForecastCard';
import { SubInsightsCard } from '@/components/subscriptions/SubInsightsCard';
import { api, type SubscriptionStatsResponse } from '@/lib/api';

function fmtCurrency(amount: number, currency = 'INR'): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return String(Math.round(amount));
  }
}

export function Subscriptions() {
  const [addOpen, setAddOpen] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState(
    () => localStorage.getItem('sub_display_currency') ?? 'INR',
  );

  const { data: subStats } = useQuery<SubscriptionStatsResponse>({
    queryKey: ['subscription-stats'],
    queryFn: () => api.subscriptions.stats(),
    staleTime: 1000 * 30,
  });

  // Paused count: subscriptions from upcoming_30d where amount === 0 can't determine paused
  // Use list to count paused
  const { data: allSubs } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => api.subscriptions.list(),
    staleTime: 1000 * 30,
  });

  const pausedCount = useMemo(
    () => (allSubs ?? []).filter((s) => s.paused_at !== null && s.cancelled_at === null).length,
    [allSubs],
  );

  const dueIn14 = useMemo(
    () =>
      (subStats?.upcoming_30d ?? []).filter(
        (u) => u.days_until >= 0 && u.days_until <= 14 && u.subscription.amount > 0 && u.subscription.paused_at === null,
      ).length,
    [subStats],
  );

  const monthlyTotal = subStats?.monthly_total ?? 0;
  const yearlyTotal  = subStats?.yearly_total  ?? 0;
  const activeCount  = subStats?.active_count  ?? 0;

  // Ring SVG: circumference of r=40 circle ≈ 251.3
  // Show active arcs proportional to subscriptions; fallback to full gradient ring
  const circ = 2 * Math.PI * 40; // ~251.3

  return (
    <>
      <PageHeader
        title="Subscriptions"
        eyebrow="SUBSCRIPTIONS · RECURRING"
        subtitle="Track recurring spend. Never miss a renewal."
        action={
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              height: 36, padding: '0 16px', borderRadius: 10,
              font: '500 13px/1 var(--font-sans)', color: 'white',
              background: 'var(--grad-primary)',
              boxShadow: 'var(--elev-1), var(--elev-glow)',
              border: 'none', cursor: 'pointer',
            }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            Add subscription
          </button>
        }
      />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden mb-6"
        style={{
          borderRadius: 24,
          padding: '32px 36px',
          background: `
            radial-gradient(420px 280px at 100% -10%, rgba(139,124,255,0.16), transparent 60%),
            radial-gradient(280px 200px at 0% 110%, rgba(255,184,107,0.10), transparent 60%),
            var(--surface)
          `,
          border: '1px solid var(--border-default)',
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          gap: 32,
          alignItems: 'center',
        }}
      >
        {/* Left */}
        <div className="relative">
          <p className="mb-3.5 text-[11px] font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--fg-4)' }}>
            {`Recurring · ${new Date().toLocaleString('en', { month: 'long', year: 'numeric' })}`}
          </p>
          <h1
            className="m-0"
            style={{
              font: '500 64px/1 var(--font-display)',
              letterSpacing: '-0.03em',
              background: 'linear-gradient(135deg, #FFFFFF 30%, #B8A5FF 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {fmtCurrency(monthlyTotal, displayCurrency)}
          </h1>
          <p className="mt-4 text-[14px]" style={{ color: 'var(--fg-3)', maxWidth: 460 }}>
            {activeCount > 0
              ? `${activeCount} active subscription${activeCount !== 1 ? 's' : ''}${dueIn14 > 0 ? `, ${dueIn14} due in the next 14 days` : ''}.`
              : 'No active subscriptions yet. Add your first one.'}
          </p>

          {/* Pills */}
          <div className="flex gap-2.5 mt-5 flex-wrap">
            <HeroPill dotColor="var(--accent-green)">
              <b>{activeCount}</b> active
            </HeroPill>
            {pausedCount > 0 && (
              <HeroPill dotColor="var(--fg-disabled)">
                <b>{pausedCount}</b> paused
              </HeroPill>
            )}
            {dueIn14 > 0 && (
              <HeroPill dotColor="var(--accent-yellow)">
                <b>{dueIn14}</b> due in 14 days
              </HeroPill>
            )}
            <HeroPill>
              <b>{fmtCurrency(yearlyTotal, displayCurrency)}</b> / yr projected
            </HeroPill>
          </div>
        </div>

        {/* Right: SVG donut ring */}
        <div style={{ position: 'relative', aspectRatio: '1', maxWidth: 280, marginLeft: 'auto' }}>
          <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
            <defs>
              <linearGradient id="sub-ring-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%"   stopColor="#8B7CFF" />
                <stop offset="50%"  stopColor="#FF7AD9" />
                <stop offset="100%" stopColor="#3EBEFF" />
              </linearGradient>
            </defs>
            {/* Track */}
            <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
            {/* Filled arc */}
            <circle
              cx="50" cy="50" r="40" fill="none"
              stroke="url(#sub-ring-grad)" strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={activeCount > 0 ? `${circ * 0.85} ${circ * 0.15}` : `0 ${circ}`}
              strokeDashoffset="0"
            />
          </svg>
          {/* Center text */}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'grid', placeItems: 'center', textAlign: 'center',
          }}>
            <div>
              <div style={{ font: '500 12px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)' }}>
                Monthly
              </div>
              <div style={{
                font: '500 38px/1 var(--font-display)', letterSpacing: '-0.02em', marginTop: 8,
                background: 'linear-gradient(135deg, #FFFFFF 30%, #B8A5FF 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
                {fmtCurrency(monthlyTotal, displayCurrency)}
              </div>
              <div style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 10, fontFamily: 'var(--font-mono)' }}>
                ≈ {fmtCurrency(Math.round(monthlyTotal / 30), displayCurrency)} / day
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
        <div>
          <SubscriptionList addOpen={addOpen} setAddOpen={setAddOpen} />
        </div>
        <aside className="space-y-5">
          <SubInsightsCard />
          <SpendingByCategoryCard displayCurrency={displayCurrency} />
          <UpcomingRenewals />
          <SubForecastCard />
          <TrialTrackerCard />
        </aside>
      </div>
    </>
  );
}

function HeroPill({ dotColor, children }: { dotColor?: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'baseline', gap: 6,
        padding: '8px 14px', borderRadius: 999,
        background: 'var(--glass-bg)', border: '1px solid var(--border-default)',
        fontSize: 12.5, color: 'var(--fg-3)',
      }}
    >
      {dotColor && (
        <span style={{
          width: 6, height: 6, borderRadius: 999,
          background: dotColor, alignSelf: 'center', marginRight: 2, flexShrink: 0,
          display: 'inline-block',
        }} />
      )}
      {children}
    </span>
  );
}
