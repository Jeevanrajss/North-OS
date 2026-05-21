import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CreditCard, Eye, EyeOff, FileBarChart2, LayoutDashboard, Plus, TrendingDown, TrendingUp, Upload, Wallet, X } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { AccountsCard } from '@/components/finance/AccountsCard';
import { BudgetCard } from '@/components/finance/BudgetCard';
import { CategoryBreakdownCard } from '@/components/finance/CategoryBreakdownCard';
import { FinanceInsightsCard } from '@/components/finance/FinanceInsightsCard';
import { ImportModal } from '@/components/finance/ImportModal';
import { MonthlyReportView } from '@/components/finance/MonthlyReportView';
import { SmsInbox } from '@/components/finance/SmsInbox';
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
  const [showValues, setShowValues] = useState(true);
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
                  onClick={() => setShowForm((v) => !v)}
                  className={cn(
                    'inline-flex items-center gap-2 h-9 px-3.5 rounded-[10px] text-[13px] font-medium transition-all',
                    showForm
                      ? 'btn-ghost'
                      : 'btn-primary',
                  )}
                >
                  {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  {showForm ? 'Cancel' : 'Add transaction'}
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

          {/* Main grid — 1.4fr left (transactions), 1fr right (categories + AI) */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
            {/* Left — add form + SMS inbox + transaction list */}
            <div className="space-y-4">
              <SmsInbox queryKey={txnKey} />

              {showForm && meta && (
                <div className="card" style={{ padding: 22 }}>
                  <h3 style={{ margin: '0 0 16px', font: '500 16px/1.2 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>
                    New Transaction
                  </h3>
                  <TransactionForm
                    meta={meta}
                    onSubmit={async (payload) => { await createMut.mutateAsync(payload); }}
                    onCancel={() => setShowForm(false)}
                  />
                </div>
              )}

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
      {/* Value — use inline-block span so background-clip:text clips to text shape, not full block width */}
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
            ...(showValues ? {} : { filter: 'blur(10px)', userSelect: 'none', pointerEvents: 'none' }),
            ...(valueGradient
              ? { background: valueGradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }
              : { color: savingsStyle ? 'var(--fg-1)' : 'var(--fg-1)' }),
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
