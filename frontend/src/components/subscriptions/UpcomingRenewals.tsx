import { useQuery } from '@tanstack/react-query';
import { api, type SubscriptionStatsResponse, CYCLE_LABELS } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatAmount, urgencyClass, describeDaysUntil } from './subUtils';

export function UpcomingRenewals() {
  const { data, isLoading } = useQuery<SubscriptionStatsResponse>({
    queryKey: ['subscription-stats'],
    queryFn: () => api.subscriptions.stats(),
    staleTime: 1000 * 30,
  });

  const upcoming = data?.upcoming_30d ?? [];

  return (
    <div className="card">
      <div className="card-title">Upcoming (30 days)</div>
      {isLoading ? (
        <div className="text-xs text-ink-500 text-center py-4">Loading…</div>
      ) : upcoming.length === 0 ? (
        <div className="text-xs text-ink-500 text-center py-4">Nothing due in 30 days.</div>
      ) : (
        <ul className="space-y-1.5 mt-1">
          {upcoming.map(({ subscription: s, days_until }) => (
            <li key={s.id} className="flex items-center gap-2">
              <span className="text-base w-6 text-center leading-none">{s.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink-200 truncate">{s.name}</div>
                <div className="text-[10px] text-ink-500">
                  {formatAmount(s.amount, s.currency)} {CYCLE_LABELS[s.billing_cycle]}
                </div>
              </div>
              <span className={cn('text-[11px] tabular-nums font-medium shrink-0', urgencyClass(days_until))}>
                {describeDaysUntil(days_until)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
