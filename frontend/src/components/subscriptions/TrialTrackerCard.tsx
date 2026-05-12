import { useQuery } from '@tanstack/react-query';
import { api, type Subscription } from '@/lib/api';
import { cn } from '@/lib/cn';
import { AlertTriangle, Clock } from 'lucide-react';

/**
 * Shows active subscriptions that have a trial_end_date set.
 * Colour-coded by urgency:
 *   red  — trial ends in ≤3 days
 *   amber — trial ends in ≤7 days
 *   green — trial ends in >7 days
 *
 * Returns null when no trials are tracked.
 */
export function TrialTrackerCard() {
  const { data: allSubs = [] } = useQuery<Subscription[]>({
    queryKey: ['subscriptions', 'all'],
    queryFn: () => api.subscriptions.list(true),
    staleTime: 1000 * 30,
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const trials = allSubs
    .filter((s) => s.cancelled_at === null && s.trial_end_date !== null)
    .map((s) => {
      const end = new Date(s.trial_end_date!);
      end.setHours(0, 0, 0, 0);
      const daysLeft = Math.round((end.getTime() - today.getTime()) / 86_400_000);
      return { sub: s, daysLeft };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

  if (trials.length === 0) return null;

  return (
    <div className="card">
      <div className="card-title">Free Trials</div>
      <ul className="space-y-2 mt-1">
        {trials.map(({ sub, daysLeft }) => {
          const expired = daysLeft < 0;
          const urgent = daysLeft <= 3;
          const warn = daysLeft <= 7 && !urgent;

          return (
            <li key={sub.id} className="flex items-start gap-2.5">
              <span className="text-base w-6 text-center leading-none shrink-0 mt-0.5">
                {sub.emoji}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink-200 truncate">{sub.name}</div>
                <div className="text-[10px] text-ink-500">
                  Trial ends {sub.trial_end_date}
                </div>
                {sub.post_trial_amount != null && sub.post_trial_amount > 0 && (
                  <div className="text-[10px] text-ink-600 mt-0.5">
                    Then {sub.currency} {sub.post_trial_amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    {' '}
                    <span className="text-ink-700">
                      {sub.billing_cycle === 'monthly' ? '/ mo'
                        : sub.billing_cycle === 'yearly' ? '/ yr'
                        : sub.billing_cycle === 'quarterly' ? '/ qtr'
                        : '/ wk'}
                    </span>
                  </div>
                )}
              </div>
              <div className={cn(
                'flex items-center gap-1 shrink-0 text-[11px] font-medium tabular-nums mt-0.5',
                expired ? 'text-ink-600' : urgent ? 'text-red-400' : warn ? 'text-amber-400' : 'text-emerald-400',
              )}>
                {!expired && (urgent || warn) && (
                  <AlertTriangle className="w-3 h-3" />
                )}
                {!expired && !urgent && !warn && (
                  <Clock className="w-3 h-3" />
                )}
                {expired
                  ? 'Expired'
                  : daysLeft === 0
                    ? 'Today!'
                    : daysLeft === 1
                      ? '1 day left'
                      : `${daysLeft}d left`}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[10px] text-ink-700 border-t border-ink-900 pt-2">
        Set a trial end date when adding/editing a subscription to track it here.
      </p>
    </div>
  );
}
