import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';
import { api, type MonthlySummary } from '@/lib/api';
import { cn } from '@/lib/cn';

function fmt(amount: number, currency = 'INR') {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)}`;
  }
}

function prevMonth(year: number, month: number): [number, number] {
  return month === 1 ? [year - 1, 12] : [year, month - 1];
}

export function DashFinanceCard() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const [py, pm] = prevMonth(y, m);

  const { data: curr, isLoading } = useQuery<MonthlySummary>({
    queryKey: ['finance-summary', y, m],
    queryFn: () => api.finance.summary(y, m),
    staleTime: 1000 * 60 * 5,
  });

  const { data: prev } = useQuery<MonthlySummary>({
    queryKey: ['finance-summary', py, pm],
    queryFn: () => api.finance.summary(py, pm),
    staleTime: 1000 * 60 * 5,
  });

  // Nothing to show if no transactions
  if (!isLoading && (curr?.transaction_count ?? 0) === 0 && (prev?.transaction_count ?? 0) === 0) {
    return null;
  }

  const expense = curr?.total_expense ?? 0;
  const prevExpense = prev?.total_expense ?? 0;
  const delta = prevExpense > 0 ? ((expense - prevExpense) / prevExpense) * 100 : null;
  const up = delta !== null && delta > 0;
  const down = delta !== null && delta < 0;

  // Top categories (max 4)
  const topCats = (curr?.by_category ?? []).slice(0, 4);
  const maxCat = Math.max(1, ...topCats.map((c) => c.total));

  const currency = localStorage.getItem('sub_display_currency') ?? 'INR';

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="card-title mb-0">Finance</div>
        <Link to="/finance" className="flex items-center gap-1 text-[11px] text-ink-500 hover:text-accent transition-colors">
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[80, 55, 65].map((w, i) => (
            <div key={i} className="h-3 bg-ink-900 rounded animate-pulse" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : (
        <>
          {/* Total + delta */}
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-xl font-semibold tabular-nums text-ink-100">
              {fmt(expense, currency)}
            </span>
            <span className="text-[11px] text-ink-500">this month</span>
            {delta !== null && (
              <span className={cn(
                'ml-auto flex items-center gap-0.5 text-[11px] font-medium tabular-nums',
                up ? 'text-red-400' : down ? 'text-emerald-400' : 'text-ink-500',
              )}>
                {up
                  ? <TrendingUp className="w-3 h-3" />
                  : down
                    ? <TrendingDown className="w-3 h-3" />
                    : null}
                {up ? '+' : ''}{delta.toFixed(0)}% vs last month
              </span>
            )}
          </div>

          {/* Category bars */}
          {topCats.length > 0 ? (
            <ul className="space-y-2">
              {topCats.map((cat) => (
                <li key={cat.category} className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-ink-400 truncate max-w-[60%]">{cat.category}</span>
                    <span className="text-[11px] text-ink-500 tabular-nums">{fmt(cat.total, currency)}</span>
                  </div>
                  <div className="h-1 bg-ink-900 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent/50 rounded-full"
                      style={{ width: `${(cat.total / maxCat) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink-600 text-center py-2">No expenses recorded this month.</p>
          )}

          {/* Budget progress if set */}
          {curr?.budget_overall && curr.budget_overall.budget > 0 && (
            <div className="mt-3 pt-3 border-t border-ink-900 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-ink-600 uppercase tracking-wide">Budget</span>
                <span className={cn(
                  'text-[11px] tabular-nums font-medium',
                  curr.budget_overall.pct > 100 ? 'text-red-400' :
                  curr.budget_overall.pct > 80 ? 'text-amber-400' : 'text-emerald-400',
                )}>
                  {curr.budget_overall.pct.toFixed(0)}% used
                </span>
              </div>
              <div className="h-1 bg-ink-900 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    curr.budget_overall.pct > 100 ? 'bg-red-500' :
                    curr.budget_overall.pct > 80 ? 'bg-amber-400' : 'bg-emerald-500',
                  )}
                  style={{ width: `${Math.min(curr.budget_overall.pct, 100)}%` }}
                />
              </div>
              <div className="text-[10px] text-ink-600">
                {fmt(curr.budget_overall.spent, currency)} of {fmt(curr.budget_overall.budget, currency)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
