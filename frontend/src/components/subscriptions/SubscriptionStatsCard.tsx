import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, TrendingUp, Zap, Calendar, PauseCircle } from 'lucide-react';
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
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="card-title mb-0">Overview</div>
        <div className="flex items-center gap-1.5">
          {ratesFetching && <RefreshCw className="w-3 h-3 text-ink-500 animate-spin" />}
          {ratesError && (
            <span className="text-[10px] text-red-400" title="Could not fetch exchange rates">
              rates offline
            </span>
          )}
          <select
            value={displayCurrency}
            onChange={(e) => onCurrencyChange(e.target.value)}
            className="bg-ink-900 border border-ink-800 rounded-md px-1.5 py-0.5 text-xs text-ink-300 outline-none focus:border-accent/60"
          >
            {CURRENCY_OPTS.map((o) => (
              <option key={o.value} value={o.value}>{o.value}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 2×2 stat grid */}
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Active" value={String(activeSubs.length)} />
        <Stat label="Per Day" value={fmtStat(perDay, displayCurrency)} approx={approx} />
        <Stat label="Monthly" value={fmtStat(monthly, displayCurrency)} approx={approx} />
        <Stat label="Yearly" value={fmtStat(yearly, displayCurrency)} approx={approx} />
      </div>

      {approx && (
        <p className="mt-1.5 text-[10px] text-ink-600 text-center">
          ~ some currencies excluded (rates unavailable)
        </p>
      )}

      {/* Insights */}
      {activeSubs.length > 0 && (
        <div className="mt-3 pt-3 border-t border-ink-800 space-y-1.5">
          <div className="text-[10px] font-medium text-ink-500 uppercase tracking-wide mb-2">Insights</div>

          {biggestSub && (
            <InsightRow icon={<TrendingUp className="w-3 h-3 text-accent/70" />}>
              <span className="text-ink-400">Biggest:</span>{' '}
              <span className="text-ink-200">{biggestSub.name}</span>{' '}
              <span className="text-ink-400 tabular-nums">
                {fmtStat(toDisplay(biggestSub), displayCurrency)}/mo
              </span>
            </InsightRow>
          )}

          {dueThisWeek > 0 && (
            <InsightRow icon={<Calendar className="w-3 h-3 text-amber-400/70" />}>
              <span className="text-amber-400 font-medium">{dueThisWeek}</span>{' '}
              <span className="text-ink-400">
                {dueThisWeek === 1 ? 'subscription' : 'subscriptions'} due this week
              </span>
            </InsightRow>
          )}

          {pausedSubs.length > 0 && (
            <InsightRow icon={<PauseCircle className="w-3 h-3 text-amber-500/70" />}>
              <span className="text-ink-400">Paused:</span>{' '}
              <span className="text-ink-200">{pausedSubs.length}</span>{' '}
              <span className="text-ink-500">
                ({fmtStat(pausedMonthly, displayCurrency)}/mo frozen)
              </span>
            </InsightRow>
          )}

          {activeSubs.length >= 2 && (
            <InsightRow icon={<Zap className="w-3 h-3 text-ink-500" />}>
              <span className="text-ink-400">Avg per sub:</span>{' '}
              <span className="text-ink-200 tabular-nums">
                {fmtStat(monthly / activeSubs.length, displayCurrency)}/mo
              </span>
            </InsightRow>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, approx }: { label: string; value: string; approx?: boolean }) {
  return (
    <div className="rounded-md bg-ink-950 border border-ink-800 px-2 py-2 text-center min-w-0">
      <div className="text-[10px] text-ink-500 uppercase tracking-wide mb-1">{label}</div>
      <div
        className="text-sm font-semibold text-ink-100 tabular-nums truncate"
        title={value}
      >
        {approx ? '~' : ''}{value}
      </div>
    </div>
  );
}

function InsightRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="shrink-0">{icon}</span>
      <span>{children}</span>
    </div>
  );
}
