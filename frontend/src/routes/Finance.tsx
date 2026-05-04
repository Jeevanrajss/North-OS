import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CreditCard, FileBarChart2, LayoutDashboard, Plus, TrendingDown, TrendingUp, Upload, Wallet, X } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { AccountsCard } from '@/components/finance/AccountsCard';
import { BudgetCard } from '@/components/finance/BudgetCard';
import { CategoryBreakdownCard } from '@/components/finance/CategoryBreakdownCard';
import { FinanceInsightsCard } from '@/components/finance/FinanceInsightsCard';
import { ImportModal } from '@/components/finance/ImportModal';
import { MonthlyReportView } from '@/components/finance/MonthlyReportView';
import { TransactionForm } from '@/components/finance/TransactionForm';
import { TransactionList } from '@/components/finance/TransactionList';
import { api, type Account, type FinanceMeta, type MonthlySummary, type Transaction, type TransactionIn } from '@/lib/api';
import { cn } from '@/lib/cn';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type Tab = 'overview' | 'accounts' | 'budgets' | 'report';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',  label: 'Overview',  icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
  { id: 'accounts',  label: 'Accounts',  icon: <CreditCard className="w-3.5 h-3.5" /> },
  { id: 'budgets',   label: 'Budgets',   icon: <Wallet className="w-3.5 h-3.5" /> },
  { id: 'report',    label: 'Report',    icon: <FileBarChart2 className="w-3.5 h-3.5" /> },
];

function fmtMoney(n: number, currency = 'INR') {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency} ${Math.round(n)}`;
  }
}

export function Finance() {
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-based
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [cardTip, setCardTip] = useState<string | null>(null);

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }
  function goToday() { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); }

  const txnKey = useMemo(() => ['finance-txns', year, month], [year, month]);

  const metaQ = useQuery<FinanceMeta>({
    queryKey: ['finance-meta'],
    queryFn: () => api.finance.meta(),
    staleTime: Infinity,
  });

  const accountsQ = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => api.accounts.list(),
    staleTime: 60_000,
  });

  const txnQ = useQuery<Transaction[]>({
    queryKey: txnKey,
    queryFn: () => api.finance.list(year, month),
    staleTime: 1000 * 30,
  });

  const summaryQ = useQuery<MonthlySummary>({
    queryKey: ['finance-summary', year, month],
    queryFn: () => api.finance.summary(year, month),
    staleTime: 1000 * 30,
  });

  const createMut = useMutation({
    mutationFn: (payload: TransactionIn) => api.finance.create(payload),
    onSuccess: async (newTxn, payload) => {
      qc.invalidateQueries({ queryKey: txnKey });
      qc.invalidateQueries({ queryKey: ['finance-summary'] });
      setShowForm(false);
      // Fire card-tip check for expense transactions with a category
      if (payload.type === 'expense' && payload.category && payload.account) {
        try {
          const tip = await api.accounts.cardTip({
            category: payload.category,
            account: payload.account,
            amount: payload.amount,
          });
          if (tip.tip) {
            setCardTip(tip.tip);
            setTimeout(() => setCardTip(null), 12000);
          }
        } catch {
          // card-tip is best-effort; never block the UX
        }
      }
    },
  });

  const meta = metaQ.data;
  const summary = summaryQ.data;
  const transactions = txnQ.data ?? [];
  const currency = transactions[0]?.currency ?? 'INR';

  const netColor = !summary
    ? 'text-ink-400'
    : summary.net >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <>
      <PageHeader title="Finance" subtitle="Track income, expenses, and spending patterns." />

      {/* Month navigation + tabs */}
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={prevMonth}
          className="p-1.5 rounded-md border border-ink-800 bg-ink-900 text-ink-400 hover:text-ink-100 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-ink-100 w-36 text-center">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="p-1.5 rounded-md border border-ink-800 bg-ink-900 text-ink-400 hover:text-ink-100 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        {!isCurrentMonth && (
          <button
            type="button"
            onClick={goToday}
            className="px-2.5 py-1.5 rounded-md border border-ink-800 bg-ink-900 text-xs text-ink-400 hover:text-ink-100 transition-colors"
          >
            This month
          </button>
        )}

        {/* Tab switcher */}
        <div className="ml-auto flex items-center gap-1 p-1 bg-ink-950 rounded-lg border border-ink-800">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                tab === t.id
                  ? 'bg-ink-800 text-ink-100'
                  : 'text-ink-500 hover:text-ink-300',
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Import button — overview only */}
        {tab === 'overview' && (
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-ink-700 bg-ink-900 text-ink-400 hover:text-ink-100 text-sm font-medium transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
        )}

        {/* Add transaction button — overview only */}
        {tab === 'overview' && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors',
              showForm
                ? 'border-ink-700 bg-ink-900 text-ink-400'
                : 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20',
            )}
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? 'Cancel' : 'Add Transaction'}
          </button>
        )}
      </div>

      {/* Card tip banner */}
      {cardTip && (
        <div className="flex items-start gap-3 mb-4 px-4 py-3 rounded-lg border border-accent/30 bg-accent/5 text-sm text-ink-200">
          <span className="flex-1">{cardTip}</span>
          <button type="button" onClick={() => setCardTip(null)} className="text-ink-500 hover:text-ink-300 shrink-0 mt-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Overview tab ─────────────────────────────────────── */}
      {tab === 'overview' && (
        <>
          {/* Stats chips */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <StatChip
              icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
              label="Income"
              value={summary ? fmtMoney(summary.total_income, currency) : '—'}
              color="text-emerald-400"
              sub={summary?.budget_overall
                ? `${summary.budget_overall.pct.toFixed(0)}% of budget used`
                : undefined}
            />
            <StatChip
              icon={<TrendingDown className="w-4 h-4 text-red-400" />}
              label="Expenses"
              value={summary ? fmtMoney(summary.total_expense, currency) : '—'}
              color="text-red-400"
            />
            <StatChip
              icon={<Wallet className="w-4 h-4 text-ink-400" />}
              label="Net"
              value={summary ? fmtMoney(summary.net, currency) : '—'}
              color={netColor}
              sub={summary?.budget_overall && summary.budget_overall.pct > 80
                ? summary.budget_overall.pct > 100
                  ? '⚠ Over budget'
                  : `${(100 - summary.budget_overall.pct).toFixed(0)}% budget left`
                : undefined}
            />
          </div>

          {/* Main grid */}
          <div className="grid grid-cols-1 lg:grid-cols-10 gap-5">
            {/* Left — charts + AI */}
            <div className="lg:col-span-4 space-y-5">
              <CategoryBreakdownCard
                stats={summary?.by_category ?? []}
                meta={meta ?? { expense_categories: [], income_categories: [], account_suggestions: [], credit_card_options: [], category_emoji: {} }}
                currency={currency}
                budgetByCategory={summary?.budget_by_category}
              />
              <FinanceInsightsCard />
            </div>

            {/* Right — add form + transaction list */}
            <div className="lg:col-span-6 space-y-4">
              {showForm && meta && (
                <div className="card">
                  <div className="card-title">New Transaction</div>
                  <TransactionForm
                    meta={meta}
                    onSubmit={async (payload) => { await createMut.mutateAsync(payload); }}
                    onCancel={() => setShowForm(false)}
                  />
                </div>
              )}

              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div className="card-title !mb-0">Transactions</div>
                  {summary && summary.transaction_count > 0 && (
                    <span className="text-[11px] text-ink-600">{summary.transaction_count} total</span>
                  )}
                </div>
                {txnQ.isLoading ? (
                  <div className="py-8 text-center text-xs text-ink-500">Loading…</div>
                ) : !meta ? (
                  <div className="py-8 text-center text-xs text-ink-500">Loading metadata…</div>
                ) : (
                  <TransactionList
                    transactions={transactions}
                    meta={meta}
                    queryKey={txnKey}
                  />
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Accounts tab ─────────────────────────────────────── */}
      {tab === 'accounts' && (
        <div className="max-w-2xl">
          <div className="card mb-4">
            <div className="card-title">Your Accounts & Cards</div>
            <p className="text-xs text-ink-500 mb-5">
              Register your bank accounts and credit cards. For credit cards, saving benefits
              lets the AI suggest the best card for each purchase — e.g. "use your HDFC card for
              dining to earn 5% cashback instead of 1% on your current card."
            </p>
            <AccountsCard />
          </div>
        </div>
      )}

      {/* ── Budgets tab ─────────────────────────────────────── */}
      {tab === 'budgets' && (
        <div className="max-w-2xl">
          <BudgetCard
            year={year}
            month={month}
            summary={summary}
            meta={meta}
            currency={currency}
          />
        </div>
      )}

      {/* ── Report tab ─────────────────────────────────────── */}
      {tab === 'report' && (
        <MonthlyReportView year={year} month={month} />
      )}

      {/* ── Import modal ──────────────────────────────────── */}
      {showImport && (
        <ImportModal
          accounts={accountsQ.data ?? []}
          onClose={() => setShowImport(false)}
          onImported={() => {
            qc.invalidateQueries({ queryKey: txnKey });
            qc.invalidateQueries({ queryKey: ['finance-summary'] });
            qc.invalidateQueries({ queryKey: ['finance-report'] });
            setShowImport(false);
          }}
        />
      )}
    </>
  );
}

function StatChip({ icon, label, value, color, sub }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  sub?: string;
}) {
  return (
    <div className="card flex items-center gap-3">
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] text-ink-500 uppercase tracking-wide">{label}</div>
        <div className={cn('text-sm font-semibold tabular-nums truncate', color)}>{value}</div>
        {sub && <div className="text-[10px] text-ink-600 truncate">{sub}</div>}
      </div>
    </div>
  );
}
