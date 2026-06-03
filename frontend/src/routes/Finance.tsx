import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CreditCard, Eye, EyeOff, FileBarChart2, LayoutDashboard, Plus, Sparkles, TrendingDown, TrendingUp, Upload, Wallet, X, Landmark, BarChart2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { RightDrawer } from '@/components/ui/RightDrawer';
import { AccountsCard } from '@/components/finance/AccountsCard';
import { BudgetCard } from '@/components/finance/BudgetCard';
import { CategoryBreakdownCard } from '@/components/finance/CategoryBreakdownCard';
import { FinanceInsightsCard } from '@/components/finance/FinanceInsightsCard';
import { ImportModal } from '@/components/finance/ImportModal';
import { MonthlyReportView } from '@/components/finance/MonthlyReportView';
import { SmsInbox } from '@/components/finance/SmsInbox';
import { TransactionForm } from '@/components/finance/TransactionForm';
import { TransactionList } from '@/components/finance/TransactionList';
import { DebtCard } from '@/components/finance/debt/DebtCard';
import { DebtForm } from '@/components/finance/debt/DebtForm';
import { PayoffStrategyCard } from '@/components/finance/debt/PayoffStrategyCard';
import { RecordPaymentDrawer } from '@/components/finance/debt/RecordPaymentDrawer';
import { InvestmentNote } from '@/components/finance/wealth/InvestmentNote';
import { InvestmentCard } from '@/components/finance/wealth/InvestmentCard';
import { InvestmentForm } from '@/components/finance/wealth/InvestmentForm';
import { FinancialGoalCard } from '@/components/finance/wealth/FinancialGoalCard';
import { FinancialGoalForm } from '@/components/finance/wealth/FinancialGoalForm';
import { AddInvestmentEntryDrawer } from '@/components/finance/wealth/AddInvestmentEntryDrawer';
import { api, type Account, type FinanceMeta, type MonthlySummary, type Transaction, type TransactionIn } from '@/lib/api';
import { cn } from '@/lib/cn';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type Tab = 'overview' | 'budgets' | 'debt' | 'wealth' | 'advisor' | 'accounts' | 'report';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview',  icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
  { id: 'budgets',  label: 'Budget',    icon: <Wallet className="w-3.5 h-3.5" /> },
  { id: 'debt',     label: 'Debt & EMI',icon: <CreditCard className="w-3.5 h-3.5" /> },
  { id: 'wealth',   label: 'My Wealth', icon: <BarChart2 className="w-3.5 h-3.5" /> },
  { id: 'advisor',  label: 'Advisor',   icon: <Sparkles className="w-3.5 h-3.5" /> },
  { id: 'accounts', label: 'Accounts',  icon: <Landmark className="w-3.5 h-3.5" /> },
  { id: 'report',   label: 'Report',    icon: <FileBarChart2 className="w-3.5 h-3.5" /> },
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
  const [showValues, setShowValues] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [cardTip, setCardTip] = useState<string | null>(null);

  // Debt & EMI drawer state
  const [debtDrawerOpen,  setDebtDrawerOpen]  = useState(false);
  const [editingDebt,     setEditingDebt]     = useState<any | null>(null);
  const [paymentDebt,     setPaymentDebt]     = useState<any | null>(null);
  const [showPaymentDrawer, setShowPaymentDrawer] = useState(false);

  // Investment drawer state
  const [invDrawerOpen,   setInvDrawerOpen]   = useState(false);
  const [editingInv,      setEditingInv]      = useState<any | null>(null);
  const [entryInvestment, setEntryInvestment] = useState<any | null>(null);
  const [showEntryDrawer, setShowEntryDrawer] = useState(false);

  // Financial goal drawer state
  const [goalDrawerOpen,  setGoalDrawerOpen]  = useState(false);
  const [editingGoal,     setEditingGoal]     = useState<any | null>(null);

  // Advisor state
  const [advisorAdvice,   setAdvisorAdvice]   = useState<string | null>(null);
  const [advisorDate,     setAdvisorDate]     = useState<string | null>(null);
  const [advisorLoading,  setAdvisorLoading]  = useState(false);
  const [advisorError,    setAdvisorError]    = useState<string | null>(null);

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

  // Phase 7 queries — always active so invalidation always triggers a refetch.
  // staleTime keeps them from hammering the backend on every tab switch.
  const debtsQ = useQuery({
    queryKey: ['debts'],
    queryFn: () => api.debt.list(),
    staleTime: 60_000,
    refetchOnMount: true,
  });
  const investmentsQ = useQuery({
    queryKey: ['investments'],
    queryFn: () => api.investments.list(),
    staleTime: 60_000,
    refetchOnMount: true,
  });
  const financialGoalsQ = useQuery({
    queryKey: ['financial-goals'],
    queryFn: () => api.financialGoals.list(),
    staleTime: 60_000,
    refetchOnMount: true,
  });

  async function generateAdvisor() {
    setAdvisorLoading(true); setAdvisorError(null);
    try {
      const res = await api.advisor.generate();
      setAdvisorAdvice(res.advice);
      setAdvisorDate(res.generated_at);
    } catch (err) {
      setAdvisorError(err instanceof Error ? err.message : 'AI unavailable.');
    } finally {
      setAdvisorLoading(false);
    }
  }

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
      <PageHeader
        title="Finance"
        eyebrow={`FINANCE · ${MONTH_NAMES[month - 1].toUpperCase()} ${year}`}
        subtitle="Income, expenses, budgets — one place. Locally tracked, privately analyzed."
        action={
          <div className="flex items-center gap-2">
            {tab === 'overview' && (
              <>
                <button
                  type="button"
                  onClick={() => setShowImport(true)}
                  className="btn-ghost h-9 px-3.5 text-[13px]"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import statement
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="inline-flex items-center gap-2 h-9 px-3.5 rounded-[10px] text-[13px] font-medium btn-primary"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add transaction
                </button>
              </>
            )}
          </div>
        }
      />

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3 mb-0">
        {/* Show/hide values toggle */}
        <button
          type="button"
          onClick={() => setShowValues((v) => !v)}
          className="p-1.5 rounded-lg transition-all"
          style={{ border: '1px solid var(--border-subtle)', color: showValues ? 'var(--fg-4)' : 'var(--primary-300)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)'; (e.currentTarget as HTMLButtonElement).style.background = ''; }}
          title={showValues ? 'Hide values' : 'Show values'}
        >
          {showValues ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>

        {/* Month stepper */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={prevMonth}
            className="p-1.5 rounded-lg text-ink-400 hover:text-ink-100 transition-all"
            style={{ border: '1px solid var(--border-subtle)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)'; (e.currentTarget as HTMLButtonElement).style.background = ''; }}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-sm font-semibold text-ink-100 w-36 text-center tabular-nums">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            className="p-1.5 rounded-lg text-ink-400 hover:text-ink-100 transition-all"
            style={{ border: '1px solid var(--border-subtle)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)'; (e.currentTarget as HTMLButtonElement).style.background = ''; }}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={goToday}
              className="px-2.5 py-1 rounded-lg text-[11px] text-ink-400 hover:text-ink-100 transition-all"
              style={{ border: '1px solid var(--border-subtle)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)'; (e.currentTarget as HTMLButtonElement).style.background = ''; }}
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* ── Underline Tab strip — matches HTML reference ── */}
      <div
        className="flex items-center gap-1.5 mb-6 mt-4"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'relative inline-flex items-center gap-2 h-10 px-3.5 text-[13px] font-medium transition-all',
              tab === t.id ? 'text-white' : 'text-ink-500 hover:text-white',
            )}
          >
            {t.icon}
            {t.label}
            {tab === t.id && (
              <span
                className="absolute left-0 right-0 bottom-[-1px] h-0.5 rounded-sm"
                style={{
                  background: 'var(--grad-primary)',
                  boxShadow: '0 0 12px rgba(139,124,255,0.4)',
                }}
              />
            )}
          </button>
        ))}
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
          {/* KPI row — 4 cols matching HTML reference */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatChip
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              iconBg="rgba(61,255,152,0.10)"
              label="Total Income"
              value={summary ? fmtMoney(summary.total_income, currency) : '—'}
              valueGradient="linear-gradient(135deg, #3DFF98, #B4F5CB)"
              sub={summary?.budget_overall
                ? `${summary.budget_overall.pct.toFixed(0)}% of budget used`
                : undefined}
              showValues={showValues}
            />
            <StatChip
              icon={<TrendingDown className="w-3.5 h-3.5" />}
              iconBg="rgba(255,91,110,0.10)"
              label="Total Expenses"
              value={summary ? fmtMoney(summary.total_expense, currency) : '—'}
              valueGradient="linear-gradient(135deg, #FF7AD9, #FFB86B)"
              showValues={showValues}
            />
            <StatChip
              icon={<Wallet className="w-3.5 h-3.5" />}
              iconBg="rgba(139,124,255,0.12)"
              label="Net Balance"
              value={summary ? fmtMoney(summary.net, currency) : '—'}
              valueGradient={summary && summary.net >= 0
                ? 'linear-gradient(135deg, #8B7CFF, #3EBEFF)'
                : 'linear-gradient(135deg, #FF5B6E, #FFB86B)'}
              sub={summary?.budget_overall && summary.budget_overall.pct > 80
                ? summary.budget_overall.pct > 100
                  ? '⚠ Over budget'
                  : `${(100 - summary.budget_overall.pct).toFixed(0)}% budget left`
                : undefined}
              showValues={showValues}
            />
            <StatChip
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              iconBg="rgba(255,215,106,0.12)"
              label="Savings Rate"
              value={summary && summary.total_income > 0
                ? `${Math.max(0, Math.round((summary.net / summary.total_income) * 100))}%`
                : '—'}
              valueGradient={undefined}
              sub={summary?.budget_overall
                ? summary.budget_overall.pct < 40 ? 'Goal 40% · crushing it' : `${(100 - summary.budget_overall.pct).toFixed(0)}% left`
                : undefined}
              savingsStyle
              showValues={showValues}
            />
          </div>

          {/* Right-side drawer for adding a transaction */}
          <RightDrawer
            open={showForm}
            onClose={() => setShowForm(false)}
            title="New Transaction"
          >
            {meta && (
              <TransactionForm
                meta={meta}
                onSubmit={async (payload) => { await createMut.mutateAsync(payload); }}
                onCancel={() => setShowForm(false)}
              />
            )}
          </RightDrawer>

          {/* Main grid — 1.4fr left (transactions), 1fr right (categories + AI) */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
            {/* Left — SMS inbox + transaction list */}
            <div className="space-y-4">
              <SmsInbox queryKey={txnKey} />

              <div className="card" style={{ padding: 22 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, font: '500 16px/1.2 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>
                    {tab === 'overview' ? 'Recent Transactions' : 'All Transactions'}
                  </h3>
                  {summary && summary.transaction_count > 0 && (
                    <span style={{ color: 'var(--fg-4)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                      {summary.transaction_count} total
                    </span>
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

            {/* Right — categories + AI insights */}
            <div className="space-y-5">
              <CategoryBreakdownCard
                stats={summary?.by_category ?? []}
                meta={meta ?? { expense_categories: [], income_categories: [], account_suggestions: [], credit_card_options: [], category_emoji: {} }}
                currency={currency}
                budgetByCategory={summary?.budget_by_category}
              />
              <FinanceInsightsCard />
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

      {/* ── Debt & EMI tab ──────────────────────────────── */}
      {tab === 'debt' && (
        <div className="space-y-5">
          {/* Add/Edit debt drawer */}
          <RightDrawer
            open={debtDrawerOpen}
            onClose={() => { setDebtDrawerOpen(false); setEditingDebt(null); }}
            title={editingDebt ? 'Edit Loan' : 'Add Loan'}
            width={500}
          >
            <DebtForm
              initial={editingDebt}
              onSave={() => {
                void debtsQ.refetch();
                qc.invalidateQueries({ queryKey: ['debt-payoff-strategy'] });
                qc.invalidateQueries({ queryKey: ['debt-summary-dash'] });
                setDebtDrawerOpen(false); setEditingDebt(null);
              }}
              onCancel={() => { setDebtDrawerOpen(false); setEditingDebt(null); }}
            />
          </RightDrawer>

          {/* Record payment drawer */}
          <RecordPaymentDrawer
            open={showPaymentDrawer}
            onClose={() => setShowPaymentDrawer(false)}
            debt={paymentDebt}
            onSuccess={() => {
              qc.invalidateQueries({ queryKey: ['debts'] });
              qc.invalidateQueries({ queryKey: ['debt-payoff-strategy'] });
              qc.invalidateQueries({ queryKey: ['debt-summary-dash'] });
              qc.invalidateQueries({ queryKey: txnKey });
              qc.invalidateQueries({ queryKey: ['finance-summary'] });
            }}
          />

          {/* Header row with Add button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ font: '500 15px/1 var(--font-display)', color: 'var(--fg-1)' }}>
              Loans & EMIs
            </div>
            <button
              type="button"
              onClick={() => { setEditingDebt(null); setDebtDrawerOpen(true); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 32, padding: '0 14px', borderRadius: 8,
                font: '500 12px/1 var(--font-sans)', color: 'white',
                background: 'var(--grad-primary)', border: 'none', cursor: 'pointer',
              }}
            >
              <Plus style={{ width: 13, height: 13 }} /> Add loan
            </button>
          </div>

          {debtsQ.isLoading ? (
            <div style={{ color: 'var(--fg-4)', textAlign: 'center', padding: '40px 0' }}>Loading…</div>
          ) : (debtsQ.data ?? []).filter((d: any) => d.status === 'active').length === 0 ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: '40px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>💳</div>
              <div style={{ font: '500 18px/1.3 var(--font-display)', color: 'var(--fg-1)', marginBottom: 8 }}>No active loans</div>
              <p style={{ fontSize: 14, color: 'var(--fg-3)', marginBottom: 20 }}>Track home loans, personal loans, no-cost EMIs — see exactly when each clears.</p>
              <button type="button" onClick={() => setDebtDrawerOpen(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 18px', borderRadius: 10, font: '500 13px/1 var(--font-sans)', color: 'white', background: 'var(--grad-primary)', border: 'none', cursor: 'pointer' }}>
                <Plus style={{ width: 14, height: 14 }} /> Add your first loan
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                {(debtsQ.data ?? []).filter((d: any) => d.status === 'active').map((debt: any) => (
                  <DebtCard
                    key={debt.id} debt={debt}
                    onEdit={() => { setEditingDebt(debt); setDebtDrawerOpen(true); }}
                    onRecordPayment={() => { setPaymentDebt(debt); setShowPaymentDrawer(true); }}
                    onClose={async () => {
                      await api.debt.delete(debt.id);
                      qc.invalidateQueries({ queryKey: ['debts'] });
                      qc.invalidateQueries({ queryKey: ['debt-summary-dash'] });
                    }}
                  />
                ))}
              </div>
              <PayoffStrategyCard />
            </>
          )}
        </div>
      )}

      {/* ── My Wealth tab ───────────────────────────────── */}
      {tab === 'wealth' && (
        <div className="space-y-6">
          {/* Add/Edit investment drawer */}
          <RightDrawer
            open={invDrawerOpen}
            onClose={() => { setInvDrawerOpen(false); setEditingInv(null); }}
            title={editingInv ? 'Edit Investment' : 'Add Investment'}
            width={480}
          >
            <InvestmentForm
              initial={editingInv}
              onSave={() => {
                void investmentsQ.refetch();
                qc.invalidateQueries({ queryKey: ['inv-summary-dash'] });
                setInvDrawerOpen(false); setEditingInv(null);
              }}
              onCancel={() => { setInvDrawerOpen(false); setEditingInv(null); }}
            />
          </RightDrawer>

          {/* Add/Edit financial goal drawer */}
          <RightDrawer
            open={goalDrawerOpen}
            onClose={() => { setGoalDrawerOpen(false); setEditingGoal(null); }}
            title={editingGoal ? 'Edit Goal' : 'Add Financial Goal'}
            width={480}
          >
            <FinancialGoalForm
              initial={editingGoal}
              onSave={() => {
                void financialGoalsQ.refetch();
                setGoalDrawerOpen(false); setEditingGoal(null);
              }}
              onCancel={() => { setGoalDrawerOpen(false); setEditingGoal(null); }}
            />
          </RightDrawer>

          {/* Entry drawer */}
          <AddInvestmentEntryDrawer
            open={showEntryDrawer}
            onClose={() => setShowEntryDrawer(false)}
            investment={entryInvestment}
            onSuccess={() => {
              qc.invalidateQueries({ queryKey: ['investments'] });
              qc.invalidateQueries({ queryKey: ['financial-goals'] });
              qc.invalidateQueries({ queryKey: ['inv-summary-dash'] });
            }}
          />

          <InvestmentNote />

          {/* ── Investments ─────────────────────────────────── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ font: '500 15px/1 var(--font-display)', color: 'var(--fg-1)' }}>Investments</div>
              <button type="button"
                onClick={() => { setEditingInv(null); setInvDrawerOpen(true); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 8, font: '500 12px/1 var(--font-sans)', color: 'white', background: 'var(--grad-primary)', border: 'none', cursor: 'pointer' }}>
                <Plus style={{ width: 13, height: 13 }} /> Add investment
              </button>
            </div>
            {investmentsQ.isLoading ? (
              <div style={{ color: 'var(--fg-4)', fontSize: 13 }}>Loading…</div>
            ) : (investmentsQ.data ?? []).length === 0 ? (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 14, padding: '28px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📈</div>
                <div style={{ font: '500 15px/1.3 var(--font-display)', color: 'var(--fg-2)', marginBottom: 6 }}>No investments yet</div>
                <p style={{ fontSize: 13, color: 'var(--fg-4)', marginBottom: 16 }}>Track MFs, FDs, PPF, gold — see your total invested amount at a glance.</p>
                <button type="button" onClick={() => setInvDrawerOpen(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 34, padding: '0 16px', borderRadius: 8, font: '500 12px/1 var(--font-sans)', color: 'white', background: 'var(--grad-primary)', border: 'none', cursor: 'pointer' }}>
                  <Plus style={{ width: 13, height: 13 }} /> Add investment
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {(investmentsQ.data ?? []).map((inv: any) => (
                  <InvestmentCard
                    key={inv.id} investment={inv}
                    onEdit={() => { setEditingInv(inv); setInvDrawerOpen(true); }}
                    onAddEntry={() => { setEntryInvestment(inv); setShowEntryDrawer(true); }}
                    onRedeem={async () => {
                      await api.investments.delete(inv.id);
                      qc.invalidateQueries({ queryKey: ['investments'] });
                      qc.invalidateQueries({ queryKey: ['inv-summary-dash'] });
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Financial Goals ──────────────────────────────── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ font: '500 15px/1 var(--font-display)', color: 'var(--fg-1)' }}>Financial Goals</div>
              <button type="button"
                onClick={() => { setEditingGoal(null); setGoalDrawerOpen(true); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 8, font: '500 12px/1 var(--font-sans)', color: 'white', background: 'var(--grad-primary)', border: 'none', cursor: 'pointer' }}>
                <Plus style={{ width: 13, height: 13 }} /> Add goal
              </button>
            </div>
            {financialGoalsQ.isLoading ? (
              <div style={{ color: 'var(--fg-4)', fontSize: 13 }}>Loading…</div>
            ) : (financialGoalsQ.data ?? []).length === 0 ? (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 14, padding: '28px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🎯</div>
                <div style={{ font: '500 15px/1.3 var(--font-display)', color: 'var(--fg-2)', marginBottom: 6 }}>No financial goals yet</div>
                <p style={{ fontSize: 13, color: 'var(--fg-4)', marginBottom: 16 }}>Set a target, link investments, see how far you are and how much you need per month.</p>
                <button type="button" onClick={() => setGoalDrawerOpen(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 34, padding: '0 16px', borderRadius: 8, font: '500 12px/1 var(--font-sans)', color: 'white', background: 'var(--grad-primary)', border: 'none', cursor: 'pointer' }}>
                  <Plus style={{ width: 13, height: 13 }} /> Add goal
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {(financialGoalsQ.data ?? []).map((goal: any) => (
                  <div key={goal.id} style={{ position: 'relative' }}>
                    <FinancialGoalCard goal={goal} />
                    {/* Edit/delete overlay actions */}
                    <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 4 }}>
                      <button type="button" onClick={() => { setEditingGoal(goal); setGoalDrawerOpen(true); }}
                        style={{ padding: 5, borderRadius: 7, color: 'var(--fg-4)', background: 'var(--surface-elev)', border: '1px solid var(--border-default)', cursor: 'pointer' }}
                        title="Edit">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button type="button"
                        onClick={async () => {
                          await api.financialGoals.delete(goal.id);
                          qc.invalidateQueries({ queryKey: ['financial-goals'] });
                        }}
                        style={{ padding: 5, borderRadius: 7, color: 'var(--accent-red)', background: 'var(--surface-elev)', border: '1px solid var(--border-default)', cursor: 'pointer' }}
                        title="Delete">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Advisor tab ──────────────────────────────────── */}
      {tab === 'advisor' && (
        <div style={{ maxWidth: 680 }}>
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ font: '500 16px/1.2 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)', marginBottom: 4 }}>
                  Finance Advisor
                </div>
                <div style={{ fontSize: 12, color: 'var(--fg-4)' }}>
                  AI analysis of your cash flow, debt, savings, and goals. No investment recommendations.
                </div>
              </div>
              <button
                type="button"
                onClick={() => void generateAdvisor()}
                disabled={advisorLoading}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  height: 36, padding: '0 16px', borderRadius: 10,
                  font: '500 13px/1 var(--font-sans)', color: 'white',
                  background: advisorLoading ? 'var(--surface-hover)' : 'var(--grad-primary)',
                  border: 'none', cursor: advisorLoading ? 'default' : 'pointer',
                  opacity: advisorLoading ? 0.7 : 1,
                }}
              >
                <Sparkles style={{ width: 14, height: 14 }} />
                {advisorLoading ? 'Analysing…' : advisorAdvice ? 'Refresh' : 'Generate analysis'}
              </button>
            </div>

            {advisorError && (
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,91,110,0.08)', border: '1px solid rgba(255,91,110,0.20)', fontSize: 13, color: 'var(--accent-red)', marginBottom: 16 }}>
                {advisorError}
              </div>
            )}

            {advisorAdvice ? (
              <>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.7, margin: 0 }}>
                  {advisorAdvice}
                </pre>
                {advisorDate && (
                  <div style={{ marginTop: 16, fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>
                    Generated {advisorDate}
                  </div>
                )}
              </>
            ) : !advisorLoading && !advisorError ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>💰</div>
                <div style={{ font: '500 16px/1.3 var(--font-display)', color: 'var(--fg-2)', marginBottom: 8 }}>
                  Your personalised finance check-in
                </div>
                <p style={{ fontSize: 13, color: 'var(--fg-4)', maxWidth: 380, margin: '0 auto' }}>
                  Analyses your cash flow, debt burden, savings pace, and goal progress — then gives one clear action.
                  Runs locally on your AI model.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ── Import modal ──────────────────────────────────── */}
      {showImport && meta && (
        <ImportModal
          accounts={accountsQ.data ?? []}
          meta={meta}
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

/** KPI card — matches HTML reference exactly */
function StatChip({
  icon, iconBg, label, value, valueGradient, sub, savingsStyle, showValues = true,
}: {
  icon: React.ReactNode;
  iconBg?: string;
  label: string;
  value: string;
  valueGradient?: string;
  valueColor?: string;
  sub?: string;
  savingsStyle?: boolean;
  showValues?: boolean;
}) {
  const haloBg = savingsStyle ? 'var(--accent-yellow)'
    : valueGradient?.includes('3DFF98') ? 'var(--accent-green)'
    : valueGradient?.includes('FF7AD9') ? 'var(--accent-red)'
    : 'var(--primary-500)';

  const iconColor = savingsStyle ? 'var(--accent-yellow)'
    : valueGradient?.includes('3DFF98') ? '#3DFF98'
    : valueGradient?.includes('FF7AD9') ? '#FF5B6E'
    : '#B8A5FF';

  return (
    <div
      className="relative overflow-hidden"
      style={{ borderRadius: 16, padding: 20, background: 'var(--surface)', border: '1px solid var(--border-default)' }}
    >
      {/* Corner halo */}
      <span
        className="pointer-events-none absolute rounded-full"
        style={{ right: -30, top: -30, width: 120, height: 120, background: haloBg, opacity: 0.10 }}
      />
      {/* Icon badge */}
      {icon && (
        <span
          className="absolute flex items-center justify-center"
          style={{ top: 18, right: 18, width: 32, height: 32, borderRadius: 10, background: iconBg, color: iconColor }}
        >
          {icon}
        </span>
      )}
      {/* Label */}
      <div style={{ font: '500 12px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)' }}>
        {label}
      </div>
      {/* Value — always use gradient-text mode with a stable set of CSS keys.
          Chips without a gradient get a solid-colour "gradient" so the style
          object shape never changes between renders, eliminating the React
          "don't mix shorthand background with backgroundClip" warning. */}
      <div style={{ marginTop: 10, overflow: 'hidden' }}>
        <span
          className="tabular-nums"
          style={{
            display: 'inline-block',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            font: '500 36px/1.05 var(--font-display)',
            letterSpacing: '-0.02em',
            transition: 'filter 0.2s ease',
            // Always gradient-text mode — same keys every render, values only change.
            backgroundImage: valueGradient ?? 'linear-gradient(135deg, var(--fg-1), var(--fg-1))',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            ...(showValues ? {} : { filter: 'blur(10px)', userSelect: 'none', pointerEvents: 'none' }),
          }}
        >
          {value}
        </span>
      </div>
      {sub && (
        <div style={{ color: 'var(--fg-4)', fontSize: 11.5, marginTop: 6 }}>{sub}</div>
      )}
    </div>
  );
}
