import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock } from 'lucide-react';
import { api, type SubscriptionStatsResponse, CYCLE_LABELS } from '@/lib/api';
import { cn } from '@/lib/cn';
import { describeDaysUntil, formatAmount, urgencyClass } from '@/components/subscriptions/subUtils';

function fmtMonthly(amount: number): string {
  try {
    const currency = localStorage.getItem('sub_display_currency') ?? 'INR';
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toFixed(0)}`;
  }
}

export function DashSubsCard() {
  const { data, isLoading } = useQuery<SubscriptionStatsResponse>({
    queryKey: ['subscription-stats'],
    queryFn: () => api.subscriptions.stats(),
    staleTime: 1000 * 30,
  });

  // Split upcoming into paid renewals vs free trial expirations
  const allUpcoming = data?.upcoming_30d ?? [];
  const paidUpcoming = allUpcoming.filter((u) => u.subscription.amount > 0).slice(0, 4);
  const trialUpcoming = allUpcoming.filter((u) => u.subscription.amount === 0);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <div className="card-title mb-0">Subscriptions</div>
        <Link to="/subscriptions" className="flex items-center gap-1 text-[11px] text-ink-500 hover:text-accent transition-colors">
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Monthly total */}
      {data && (
        <div className="mb-3">
          <span className="text-lg font-semibold tabular-nums text-ink-100">
            {fmtMonthly(data.monthly_total)}
          </span>
          <span className="text-[11px] text-ink-500 ml-1">/mo · {data.active_count} active</span>
        </div>
      )}

      {isLoading ? (
        <div className="text-xs text-ink-500 py-3 text-center">Loading…</div>
      ) : (
        <>
          {/* Paid upcoming renewals */}
          {paidUpcoming.length > 0 && (
            <>
              <div className="text-[10px] text-ink-600 uppercase tracking-wide mb-1.5">Upcoming renewals</div>
              <ul className="space-y-1.5 mb-3">
                {paidUpcoming.map(({ subscription: s, days_until }) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className="text-base w-5 text-center leading-none shrink-0">{s.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink-200 truncate">{s.name}</div>
                      <div className="text-[10px] text-ink-600">
                        {formatAmount(s.amount, s.currency)} {CYCLE_LABELS[s.billing_cycle]}
                      </div>
                    </div>
                    <span className={cn('text-[11px] font-medium tabular-nums shrink-0', urgencyClass(days_until))}>
                      {describeDaysUntil(days_until)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Free trial expirations */}
          {trialUpcoming.length > 0 && (
            <>
              <div className="text-[10px] text-emerald-600 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Trials ending
              </div>
              <ul className="space-y-1.5">
                {trialUpcoming.map(({ subscription: s, days_until }) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className="text-base w-5 text-center leading-none shrink-0">{s.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink-200 truncate">{s.name}</div>
                      <div className="text-[10px] text-ink-600">
                        {s.post_trial_amount
                          ? <>Free → {formatAmount(s.post_trial_amount, s.currency)} {CYCLE_LABELS[s.billing_cycle]}</>
                          : 'Free trial'}
                      </div>
                    </div>
                    <span className={cn('text-[11px] font-medium tabular-nums shrink-0', urgencyClass(days_until))}>
                      {describeDaysUntil(days_until)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {paidUpcoming.length === 0 && trialUpcoming.length === 0 && (
            <div className="text-xs text-ink-500 text-center py-2">Nothing due in 30 days.</div>
          )}
        </>
      )}
    </div>
  );
}
