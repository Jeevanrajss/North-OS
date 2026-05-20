import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type MonthlySummary } from '@/lib/api';

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

// Category → colored dot
const CAT_COLORS: Record<string, string> = {
  subscriptions:  'var(--primary-500)',
  food:           'var(--secondary-500)',
  dining:         'var(--secondary-500)',
  transport:      'var(--accent-yellow)',
  travel:         'var(--accent-yellow)',
  shopping:       'var(--accent-green)',
  entertainment:  'var(--accent-pink)',
  health:         'var(--accent-pink)',
  utilities:      'var(--secondary-500)',
};

function catColor(name: string): string {
  const k = name.toLowerCase();
  for (const [key, color] of Object.entries(CAT_COLORS)) {
    if (k.includes(key)) return color;
  }
  // Rotate through palette based on hash
  const palette = ['var(--primary-500)', 'var(--secondary-500)', 'var(--accent-yellow)', 'var(--accent-green)', 'var(--accent-pink)'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function DashFinanceCard() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const [py, pm] = prevMonth(y, m);
  const monthName = MONTH_NAMES[m - 1];

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

  if (!isLoading && (curr?.transaction_count ?? 0) === 0 && (prev?.transaction_count ?? 0) === 0) {
    return null;
  }

  const currency   = localStorage.getItem('sub_display_currency') ?? 'INR';
  const expense    = curr?.total_expense  ?? 0;
  const prevExpense = prev?.total_expense ?? 0;
  const delta      = prevExpense > 0 ? expense - prevExpense : null;
  const topCats    = (curr?.by_category ?? []).slice(0, 4);
  const maxCat     = Math.max(1, ...topCats.map((c) => c.total));
  const budget     = curr?.budget_overall;

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0, font: '500 16px/1.2 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>
          This month · {monthName}
        </h3>
        <Link
          to="/app/finance"
          style={{
            height: 30, padding: '0 12px', borderRadius: 8,
            display: 'inline-flex', alignItems: 'center',
            font: '500 12px/1 var(--font-sans)',
            color: 'var(--fg-2)', border: '1px solid var(--border-default)',
            background: 'var(--glass-bg)', textDecoration: 'none', transition: 'var(--transition)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border-strong)'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--fg-1)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border-default)'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--fg-2)'; }}
        >
          Open →
        </Link>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[80, 55, 65].map((w, i) => (
            <div key={i} style={{ height: 12, background: 'var(--surface-hover)', borderRadius: 6, width: `${w}%`, animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : (
        <>
          {/* Big amount + delta */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
            <div>
              <div style={{ font: '500 36px/1 var(--font-display)', letterSpacing: '-0.02em', color: 'var(--fg-1)' }}>
                {fmt(expense, currency)}
                <small style={{ fontSize: 13, color: 'var(--fg-3)', fontWeight: 400, marginLeft: 8 }}>spent</small>
              </div>
              {budget && budget.budget > 0 && (
                <div style={{ color: 'var(--fg-4)', fontSize: 11.5, marginTop: 6 }}>
                  Budget {fmt(budget.budget, currency)} · {budget.pct.toFixed(1)}%
                </div>
              )}
            </div>
            {delta !== null && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                color: delta < 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                fontSize: 12, fontWeight: 500,
              }}>
                {delta < 0 ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="19 12 12 19 5 12" /><line x1="12" y1="5" x2="12" y2="19" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="19 12 12 5 5 12" /><line x1="12" y1="19" x2="12" y2="5" />
                  </svg>
                )}
                {fmt(Math.abs(delta), currency)} vs last
              </div>
            )}
          </div>

          {/* Category rows */}
          {topCats.length > 0 ? (
            <div style={{ display: 'grid', gap: 14 }}>
              {topCats.map((cat) => {
                const color = catColor(cat.category);
                const barPct = (cat.total / maxCat) * 100;
                return (
                  <div key={cat.category} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: 'var(--fg-1)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, display: 'inline-block', flexShrink: 0 }} />
                      {cat.category}
                    </div>
                    <div style={{ color: 'var(--fg-3)', fontSize: 12.5, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
                      {fmt(cat.total, currency)}
                    </div>
                    <div style={{ gridColumn: '1 / -1', height: 4, borderRadius: 999, background: 'var(--surface-hover)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${barPct}%`,
                        background: `linear-gradient(90deg, ${color}, ${color}88)`,
                        borderRadius: 999, transition: 'width 500ms',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--fg-4)', textAlign: 'center', padding: '8px 0' }}>
              No expenses this month.
            </p>
          )}
        </>
      )}
    </div>
  );
}
