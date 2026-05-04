/**
 * Monthly Report View
 * Shows summary cards, category breakdown (bar chart), budget vs actual,
 * filterable transaction table, CSV/PDF export buttons.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { api, type MonthlyReport, type ReportCategoryStat } from '@/lib/api';
import { cn } from '@/lib/cn';

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(n);
}

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------
function SummaryCard({
  icon, label, value, sub, color,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <span className="shrink-0">{icon}</span>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-ink-500">{label}</div>
        <div className={cn('text-base font-bold tabular-nums', color)}>{value}</div>
        {sub && <div className="text-[10px] text-ink-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bar chart row
// ---------------------------------------------------------------------------
function CategoryBar({ stat, maxAmount }: { stat: ReportCategoryStat; maxAmount: number }) {
  const pct = maxAmount > 0 ? Math.min((stat.total / maxAmount) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-32 text-xs text-ink-600 dark:text-ink-400 truncate text-right shrink-0">
        {stat.category}
      </span>
      <div className="flex-1 h-5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-violet-500/80 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-24 text-xs font-medium text-ink-700 dark:text-ink-300 text-right tabular-nums shrink-0">
        {fmt(stat.total)}
      </span>
      <span className="w-8 text-[11px] text-ink-400 text-right shrink-0">{stat.count}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Budget vs actual row
// ---------------------------------------------------------------------------
function BudgetRow({
  label, budget, spent, pct,
}: {
  label: string; budget: number; spent: number; pct: number;
}) {
  const over = pct > 100;
  const warn = pct > 80;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium text-ink-700 dark:text-ink-300">{label}</span>
        <span className={cn('font-medium', over ? 'text-red-500' : warn ? 'text-amber-500' : 'text-ink-500')}>
          {fmt(spent)} / {fmt(budget)} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', over ? 'bg-red-500' : warn ? 'bg-amber-400' : 'bg-emerald-500')}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface Props {
  year: number;
  month: number;
}

export function MonthlyReportView({ year, month }: Props) {
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [catFilter, setCatFilter] = useState('');
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);

  const { data: report, isLoading, isError } = useQuery<MonthlyReport>({
    queryKey: ['finance-report', year, month],
    queryFn: () => api.finance.report(year, month),
    staleTime: 30_000,
  });

  async function downloadExport(format: 'csv' | 'pdf') {
    setExporting(format);
    try {
      const url = api.finance.reportExportUrl(year, month, format);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Export failed');
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `report_${MONTH_NAMES[month]}_${year}.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-ink-400 text-sm">
        Loading report…
      </div>
    );
  }

  if (isError || !report) {
    return (
      <div className="flex items-center justify-center py-20 text-rose-400 text-sm">
        Failed to load report.
      </div>
    );
  }

  const maxCatAmount = Math.max(...(report.by_category.map((c) => c.total)), 1);
  const categories = [...new Set(report.transactions.map((t) => t.category).filter(Boolean))];
  const filteredTxns = report.transactions.filter((t) => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (catFilter && t.category !== catFilter) return false;
    return true;
  });

  const hasBudgets = !!report.budget_overall || report.budget_by_category.length > 0;

  return (
    <div className="space-y-5">
      {/* Header with export buttons */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink-700 dark:text-ink-200">
          {MONTH_NAMES[month]} {year} Report
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => downloadExport('csv')}
            disabled={exporting !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 text-xs font-medium text-ink-600 dark:text-ink-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5" />
            {exporting === 'csv' ? 'Exporting…' : 'CSV'}
          </button>
          <button
            type="button"
            onClick={() => downloadExport('pdf')}
            disabled={exporting !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-400 bg-violet-50 dark:bg-violet-900/30 dark:border-violet-700 text-xs font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting === 'pdf' ? 'Exporting…' : 'PDF'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
          label="Income"
          value={fmt(report.total_income)}
          color="text-emerald-500"
        />
        <SummaryCard
          icon={<TrendingDown className="w-4 h-4 text-red-400" />}
          label="Expenses"
          value={fmt(report.total_expense)}
          color="text-red-400"
        />
        <SummaryCard
          icon={<Wallet className="w-4 h-4 text-violet-500" />}
          label="Net Savings"
          value={fmt(report.net)}
          color={report.net >= 0 ? 'text-emerald-500' : 'text-red-400'}
        />
        <SummaryCard
          icon={<span className="text-lg">📊</span>}
          label="Savings Rate"
          value={`${report.savings_rate}%`}
          sub={`${report.transaction_count} transactions`}
          color={report.savings_rate >= 20 ? 'text-emerald-500' : report.savings_rate >= 0 ? 'text-amber-500' : 'text-red-400'}
        />
      </div>

      {/* Two-column: chart + budget */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Category breakdown */}
        <div className="card p-4 space-y-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm text-ink-700 dark:text-ink-200">By Category</h3>
            <div className="flex gap-2 text-[10px] text-ink-400">
              <span>Amount</span>
              <span>Txns</span>
            </div>
          </div>
          {report.by_category.length === 0 ? (
            <p className="text-xs text-ink-400 py-4 text-center">No expense data</p>
          ) : (
            <div className="space-y-2">
              {report.by_category.map((cs) => (
                <CategoryBar key={cs.category} stat={cs} maxAmount={maxCatAmount} />
              ))}
            </div>
          )}
        </div>

        {/* Budget vs actual */}
        <div className="card p-4">
          <h3 className="font-semibold text-sm text-ink-700 dark:text-ink-200 mb-3">
            Budget vs Actual
          </h3>
          {!hasBudgets ? (
            <div className="flex flex-col items-center justify-center py-8 text-ink-400 text-xs gap-2">
              <span className="text-2xl">📋</span>
              No budgets set for this month.
              <span>Go to the Budgets tab to set limits.</span>
            </div>
          ) : (
            <div className="space-y-4">
              {report.budget_overall && (
                <BudgetRow
                  label="Overall"
                  budget={report.budget_overall.budget}
                  spent={report.budget_overall.spent}
                  pct={report.budget_overall.pct}
                />
              )}
              {report.budget_by_category.map((b) => (
                <BudgetRow
                  key={b.category}
                  label={b.category ?? 'Overall'}
                  budget={b.budget}
                  spent={b.spent}
                  pct={b.pct}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Transaction list */}
      <div className="card p-4">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <h3 className="font-semibold text-sm text-ink-700 dark:text-ink-200 shrink-0">
            Transactions
          </h3>
          <div className="flex gap-2 ml-auto flex-wrap">
            <select
              className="text-xs border border-zinc-200 dark:border-zinc-600 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-800"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            >
              <option value="all">All types</option>
              <option value="expense">Expenses only</option>
              <option value="income">Income only</option>
            </select>
            <select
              className="text-xs border border-zinc-200 dark:border-zinc-600 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-800"
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((c) => <option key={c!} value={c!}>{c}</option>)}
            </select>
          </div>
        </div>

        {filteredTxns.length === 0 ? (
          <p className="text-xs text-ink-400 py-6 text-center">No transactions match the filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 text-ink-400">
                  <th className="text-left py-2 pr-3 font-medium">Date</th>
                  <th className="text-left py-2 pr-3 font-medium">Description</th>
                  <th className="text-left py-2 pr-3 font-medium">Category</th>
                  <th className="text-left py-2 pr-3 font-medium">Account</th>
                  <th className="text-right py-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                {filteredTxns.map((t) => (
                  <tr key={t.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                    <td className="py-1.5 pr-3 font-mono text-ink-500 whitespace-nowrap">{t.date}</td>
                    <td className="py-1.5 pr-3 text-ink-700 dark:text-ink-300 max-w-[200px] truncate">
                      {t.payee || t.notes || '—'}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className="px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-ink-600 dark:text-ink-400">
                        {t.category || '—'}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-ink-500">{t.account || '—'}</td>
                    <td className={cn(
                      'py-1.5 text-right font-medium tabular-nums',
                      t.type === 'income' ? 'text-emerald-600' : 'text-ink-700 dark:text-ink-300',
                    )}>
                      {t.type === 'income' ? '+' : '−'}₹{t.amount.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
