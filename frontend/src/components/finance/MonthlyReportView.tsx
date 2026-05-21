/**
 * Monthly Report View
 * Shows summary cards, category breakdown (bar chart), budget vs actual,
 * filterable transaction table, CSV/PDF export buttons.
 * Styled entirely with CSS variables to match the app theme.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { api, type MonthlyReport, type ReportCategoryStat } from '@/lib/api';

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
  icon, label, value, sub, valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  valueColor: string;
}) {
  return (
    <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-4)', marginBottom: 3 }}>
          {label}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: valueColor }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: 10, color: 'var(--fg-4)', marginTop: 2 }}>{sub}</div>}
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
      <span style={{ width: 120, color: 'var(--fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>
        {stat.category}
      </span>
      <div style={{ flex: 1, height: 18, background: 'var(--surface-elev)', borderRadius: 999, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%', borderRadius: 999,
            background: 'var(--primary-500)',
            width: `${pct}%`,
            transition: 'width 400ms ease',
            opacity: 0.85,
          }}
        />
      </div>
      <span style={{ width: 96, fontSize: 11.5, fontWeight: 500, color: 'var(--fg-3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
        {fmt(stat.total)}
      </span>
      <span style={{ width: 28, fontSize: 11, color: 'var(--fg-4)', textAlign: 'right', flexShrink: 0 }}>
        {stat.count}
      </span>
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
  const barColor = over ? 'var(--accent-red)' : warn ? 'var(--accent-yellow)' : 'var(--accent-green)';
  const textColor = over ? 'var(--accent-red)' : warn ? 'var(--accent-yellow)' : 'var(--fg-3)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ fontWeight: 500, color: 'var(--fg-2)' }}>{label}</span>
        <span style={{ fontWeight: 500, color: textColor, fontVariantNumeric: 'tabular-nums' }}>
          {fmt(spent)} / {fmt(budget)} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div style={{ height: 6, background: 'var(--surface-elev)', borderRadius: 999, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%', borderRadius: 999,
            background: barColor,
            width: `${Math.min(pct, 100)}%`,
            transition: 'width 400ms ease',
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared select style
// ---------------------------------------------------------------------------
const selectStyle: React.CSSProperties = {
  fontSize: 12,
  padding: '5px 10px',
  borderRadius: 8,
  background: 'var(--surface-elev)',
  border: '1px solid var(--border-default)',
  color: 'var(--fg-2)',
  outline: 'none',
  cursor: 'pointer',
};

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
  const [exportError, setExportError] = useState<string | null>(null);

  const { data: report, isLoading, isError } = useQuery<MonthlyReport>({
    queryKey: ['finance-report', year, month],
    queryFn: () => api.finance.report(year, month),
    staleTime: 30_000,
  });

  async function downloadExport(format: 'csv' | 'pdf') {
    setExporting(format);
    setExportError(null);
    try {
      const url = api.finance.reportExportUrl(year, month, format);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Export failed (${resp.status})`);
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `report_${MONTH_NAMES[month]}_${year}.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(null);
    }
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', color: 'var(--fg-4)', fontSize: 13 }}>
        Loading report…
      </div>
    );
  }

  if (isError || !report) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', color: 'var(--accent-red)', fontSize: 13 }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header with export buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, font: '600 16px/1 var(--font-display)', color: 'var(--fg-1)' }}>
          {MONTH_NAMES[month]} {year} Report
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => downloadExport('csv')}
            disabled={exporting !== null}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
              background: 'var(--surface-elev)',
              border: '1px solid var(--border-default)',
              color: 'var(--fg-3)', cursor: 'pointer',
              opacity: exporting ? 0.5 : 1, transition: 'opacity 150ms',
            }}
          >
            <FileText style={{ width: 13, height: 13 }} />
            {exporting === 'csv' ? 'Exporting…' : 'CSV'}
          </button>
          <button
            type="button"
            onClick={() => downloadExport('pdf')}
            disabled={exporting !== null}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
              background: 'rgba(139,124,255,0.12)',
              border: '1px solid rgba(139,124,255,0.35)',
              color: 'var(--primary-300)', cursor: 'pointer',
              opacity: exporting ? 0.5 : 1, transition: 'opacity 150ms',
            }}
          >
            <Download style={{ width: 13, height: 13 }} />
            {exporting === 'pdf' ? 'Exporting…' : 'PDF'}
          </button>
        </div>
      </div>

      {exportError && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, fontSize: 12,
          background: 'rgba(255,91,110,0.08)', border: '1px solid rgba(255,91,110,0.25)',
          color: 'var(--accent-red)',
        }}>
          {exportError}
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}
        className="sm:grid-cols-4">
        <SummaryCard
          icon={<TrendingUp style={{ width: 16, height: 16, color: 'var(--accent-green)' }} />}
          label="Income"
          value={fmt(report.total_income)}
          valueColor="var(--accent-green)"
        />
        <SummaryCard
          icon={<TrendingDown style={{ width: 16, height: 16, color: 'var(--accent-red)' }} />}
          label="Expenses"
          value={fmt(report.total_expense)}
          valueColor="var(--accent-red)"
        />
        <SummaryCard
          icon={<Wallet style={{ width: 16, height: 16, color: 'var(--primary-300)' }} />}
          label="Net Savings"
          value={fmt(report.net)}
          valueColor={report.net >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
        />
        <SummaryCard
          icon={<span style={{ fontSize: 16 }}>📊</span>}
          label="Savings Rate"
          value={`${report.savings_rate}%`}
          sub={`${report.transaction_count} transactions`}
          valueColor={report.savings_rate >= 20 ? 'var(--accent-green)' : report.savings_rate >= 0 ? 'var(--accent-yellow)' : 'var(--accent-red)'}
        />
      </div>

      {/* Two-column: chart + budget */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}
        className="grid-cols-1 lg:grid-cols-2">

        {/* Category breakdown */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ margin: 0, font: '500 13px/1 var(--font-display)', color: 'var(--fg-1)' }}>
              By Category
            </h3>
            <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--fg-4)', letterSpacing: '0.05em' }}>
              <span>Amount</span>
              <span>Txns</span>
            </div>
          </div>
          {report.by_category.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--fg-4)', padding: '16px 0', textAlign: 'center' }}>No expense data</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {report.by_category.map((cs) => (
                <CategoryBar key={cs.category} stat={cs} maxAmount={maxCatAmount} />
              ))}
            </div>
          )}
        </div>

        {/* Budget vs actual */}
        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ margin: '0 0 14px', font: '500 13px/1 var(--font-display)', color: 'var(--fg-1)' }}>
            Budget vs Actual
          </h3>
          {!hasBudgets ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 0', color: 'var(--fg-4)', fontSize: 12, gap: 8 }}>
              <span style={{ fontSize: 24 }}>📋</span>
              <span>No budgets set for this month.</span>
              <span style={{ color: 'var(--fg-4)' }}>Go to the Budgets tab to set limits.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
      <div className="card" style={{ padding: 18 }}>

        {/* Filters header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, font: '500 13px/1 var(--font-display)', color: 'var(--fg-1)', flexShrink: 0 }}>
            Transactions
          </h3>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <select style={selectStyle} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}>
              <option value="all">All types</option>
              <option value="expense">Expenses only</option>
              <option value="income">Income only</option>
            </select>
            <select style={selectStyle} value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c!} value={c!}>{c}</option>)}
            </select>
          </div>
        </div>

        {filteredTxns.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--fg-4)', padding: '24px 0', textAlign: 'center' }}>
            No transactions match the filter.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                  {['Date', 'Description', 'Category', 'Account', 'Amount'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '6px 10px 8px',
                        textAlign: h === 'Amount' ? 'right' : 'left',
                        fontSize: 10.5,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: 'var(--fg-4)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTxns.map((t) => (
                  <tr
                    key={t.id}
                    style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 120ms' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-hover)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
                  >
                    <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--fg-4)', whiteSpace: 'nowrap' }}>
                      {t.date}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--fg-3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.payee || t.notes || '—'}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      {t.category ? (
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px', borderRadius: 999,
                          background: 'var(--surface-elev)',
                          border: '1px solid var(--border-default)',
                          color: 'var(--fg-3)', fontSize: 11,
                          whiteSpace: 'nowrap',
                        }}>
                          {t.category}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--fg-4)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--fg-4)', whiteSpace: 'nowrap' }}>
                      {t.account || '—'}
                    </td>
                    <td style={{
                      padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)',
                      fontWeight: 500, whiteSpace: 'nowrap',
                      color: t.type === 'income' ? 'var(--accent-green)' : 'var(--fg-2)',
                    }}>
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
