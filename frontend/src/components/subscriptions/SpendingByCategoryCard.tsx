import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Subscription } from '@/lib/api';

type Props = {
  displayCurrency: string;
};

function fmtCompact(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: amount >= 100_000 ? 'compact' : 'standard',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toFixed(0)} ${currency}`;
  }
}

// Distinct palette so bars don't all look the same.
const BAR_COLORS = [
  'bg-accent/70',
  'bg-violet-500/60',
  'bg-sky-500/60',
  'bg-emerald-500/60',
  'bg-rose-500/60',
  'bg-amber-500/60',
  'bg-fuchsia-500/60',
  'bg-teal-500/60',
];

export function SpendingByCategoryCard({ displayCurrency }: Props) {
  const { data: allSubs = [] } = useQuery<Subscription[]>({
    queryKey: ['subscriptions', 'all'],
    queryFn: () => api.subscriptions.list(true),
    staleTime: 1000 * 30,
  });

  const activeSubs = allSubs.filter((s) => s.cancelled_at === null && s.paused_at === null);
  const uniqueCurrencies = [...new Set(activeSubs.map((s) => s.currency))].filter(
    (c) => c !== displayCurrency,
  );

  // Same query key + queryFn as SubscriptionStatsCard — React Query deduplicates
  // the network request so there's no double fetch when both cards are mounted.
  const { data: rates } = useQuery<Record<string, number>>({
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
    return rate ? sub.monthly_equivalent / rate : sub.monthly_equivalent;
  }

  const categories = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const sub of activeSubs) {
      const key = sub.category?.trim() || 'Uncategorized';
      totals[key] = (totals[key] ?? 0) + toDisplay(sub);
    }
    const sorted = Object.entries(totals)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
    const max = sorted[0]?.total ?? 1;
    return sorted.map((c) => ({ ...c, pct: (c.total / max) * 100 }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSubs, rates, displayCurrency]);

  if (categories.length === 0) return null;

  return (
    <div className="card">
      <div className="card-title">Spending by Category</div>
      <div className="space-y-2.5 mt-1">
        {categories.map(({ name, total, pct }, i) => (
          <div key={name}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-ink-300 truncate max-w-[60%]">{name}</span>
              <span className="text-[11px] text-ink-400 tabular-nums shrink-0">
                {fmtCompact(total, displayCurrency)}/mo
              </span>
            </div>
            <div className="h-1.5 bg-ink-900 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${BAR_COLORS[i % BAR_COLORS.length]}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {categories.length === 1 && categories[0].name === 'Uncategorized' && (
        <p className="mt-3 text-[10px] text-ink-600 text-center">
          Add categories to subscriptions to see a breakdown.
        </p>
      )}
    </div>
  );
}
