import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { api, type Subscription } from '@/lib/api';
import { CURRENCY_OPTS, daysUntil, formatAmount } from './subUtils';

type Props = {
  displayCurrency: string;
  onCurrencyChange: (c: string) => void;
};

function fmtStat(amount: number, currency: string): string {
  try {
    const abs = Math.abs(amount);
    if (abs >= 1_000_000) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1,
      }).format(amount);
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toFixed(0)} ${currency}`;
  }
}

export function SubscriptionStatsCard({ displayCurrency, onCurrencyChange }: Props) {
  const { data: allSubs = [] } = useQuery<Subscription[]>({
    queryKey: ['subscriptions', 'all'],
    queryFn: () => api.subscriptions.list(true),
    staleTime: 1000 * 30,
  });

  const activeSubs = allSubs.filter((s) => s.cancelled_at === null && s.paused_at === null);
  const pausedSubs = allSubs.filter((s) => s.cancelled_at === null && s.paused_at !== null);

  const uniqueCurrencies = [...new Set(activeSubs.map((s) => s.currency))].filter(
    (c) => c !== displayCurrency,
  );

  const {
    data: rates,
    isFetching: ratesFetching,
    isError: ratesError,
  } = useQuery<Record<string, number>>({
    queryKey: ['exchange-rates', displayCurrency],
    queryFn: async () => {
      const curr = displayCurrency.toLowerCase();
      const urls = [
        `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${curr}.json`,
        `https://api.fawazahmed0.com/api/v1/currencies/${curr}.json`,
      ];
      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const json = (await res.json()) as Record<string, Record<string, number>>;
          return json[curr];
        } catch { continue; }
      }
      throw new Error('All rate sources failed');
    },
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: uniqueCurrencies.length > 0,
  });

  function toDisplay(sub: Subscription): number {
    if (sub.currency === displayCurrency) return sub.monthly_equivalent;
    const rate = rates?.[sub.currency.toLowerCase()];
    return rate ? sub.monthly_equivalent / rate : 0;
  }

  const { monthly, yearly, perDay, approx, biggestSub, pausedMonthly, dueThisWeek } = useMemo(() => {
    let monthly = 0;
    let hasApprox = false;
    let biggestSub: Subscription | null = null;
    let biggestAmt = 0;

    for (const sub of activeSubs) {
      const converted = toDisplay(sub);
      if (sub.currency !== displayCurrency && !rates?.[sub.currency.toLowerCase()]) {
        hasApprox = true;
      } else {
        monthly += converted;
        if (converted > biggestAmt) { biggestAmt = converted; biggestSub = sub; }
      }
    }

    const pausedMonthly = pausedSubs.reduce((acc, sub) => acc + toDisplay(sub), 0);
    const dueThisWeek = activeSubs.filter((s) => {
      const d = daysUntil(s.next_billing_date);
      return d >= 0 && d <= 7;
    }).length;

    return {
      monthly,
      yearly: monthly * 12,
      perDay: monthly / 30.44,
      approx: hasApprox,
      biggestSub,
      pausedMonthly,
      dueThisWeek,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubs, pausedSubs, rates, displayCurrency]);

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0, font: '500 16px/1.2 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>
          Overview
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {ratesFetching && <RefreshCw style={{ width: 11, height: 11, color: 'var(--fg-4)' }} className="animate-spin" />}
          {ratesError && (
            <span style={{ fontSize: 10, color: 'var(--accent-red)' }} title="Could not fetch exchange rates">
              rates offline
            </span>
          )}
          <select
            value={displayCurrency}
            onChange={(e) => onCurrencyChange(e.target.value)}
            style={{
              background: 'var(--surface-elev)',
              border: '1px solid var(--border-default)',
              borderRadius: 6,
              padding: '3px 8px',
              fontSize: 11.5,
              color: 'var(--fg-3)',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {CURRENCY_OPTS.map((o) => (
              <option key={o.value} value={o.value}>{o.value}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 2×2 stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        <StatTile label="Active" value={String(activeSubs.length)} />
        <StatTile label="Per Day" value={fmtStat(perDay, displayCurrency)} approx={approx} />
        <StatTile label="Monthly" value={fmtStat(monthly, displayCurrency)} approx={approx} />
        <StatTile label="Yearly" value={fmtStat(yearly, displayCurrency)} approx={approx} />
      </div>

      {approx && (
        <p style={{ margin: '0 0 12px', fontSize: 10, color: 'var(--fg-4)', textAlign: 'center' }}>
          ~ some currencies excluded (rates unavailable)
        </p>
      )}

      {/* Insights section */}
      {activeSubs.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ font: '500 12px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 4 }}>
            Insights
          </div>

          {biggestSub && (
            <InsightRow dot="var(--primary-300)">
              <span style={{ color: 'var(--fg-4)' }}>Biggest:</span>{' '}
              <span style={{ color: 'var(--fg-2)' }}>{biggestSub.name}</span>{' '}
              <span style={{ color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>
                {fmtStat(toDisplay(biggestSub), displayCurrency)}/mo
              </span>
            </InsightRow>
          )}

          {dueThisWeek > 0 && (
            <InsightRow dot="var(--accent-yellow)">
              <span style={{ color: 'var(--accent-yellow)', fontWeight: 500 }}>{dueThisWeek}</span>{' '}
              <span style={{ color: 'var(--fg-4)' }}>
                {dueThisWeek === 1 ? 'subscription' : 'subscriptions'} due this week
              </span>
            </InsightRow>
          )}

          {pausedSubs.length > 0 && (
            <InsightRow dot="var(--fg-disabled)">
              <span style={{ color: 'var(--fg-4)' }}>Paused:</span>{' '}
              <span style={{ color: 'var(--fg-2)' }}>{pausedSubs.length}</span>{' '}
              <span style={{ color: 'var(--fg-4)' }}>
                ({fmtStat(pausedMonthly, displayCurrency)}/mo frozen)
              </span>
            </InsightRow>
          )}

          {activeSubs.length >= 2 && (
            <InsightRow dot="var(--border-strong)">
              <span style={{ color: 'var(--fg-4)' }}>Avg per sub:</span>{' '}
              <span style={{ color: 'var(--fg-2)', fontFamily: 'var(--font-mono)' }}>
                {fmtStat(monthly / activeSubs.length, displayCurrency)}/mo
              </span>
            </InsightRow>
          )}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, approx }: { label: string; value: string; approx?: boolean }) {
  return (
    <div style={{
      background: 'var(--surface-elev)',
      border: '1px solid var(--border-default)',
      borderRadius: 10,
      padding: '10px 12px',
      textAlign: 'center',
      minWidth: 0,
    }}>
      <div style={{ font: '500 12px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ font: '500 14px/1 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {approx ? '~' : ''}{value}
      </div>
    </div>
  );
}

function InsightRow({ dot, children }: { dot: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <i style={{ width: 6, height: 6, borderRadius: 999, background: dot, flexShrink: 0, display: 'inline-block' }} />
      <span>{children}</span>
    </div>
  );
}
