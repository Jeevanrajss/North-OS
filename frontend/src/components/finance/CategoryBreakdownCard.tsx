import { type BudgetProgress, type CategoryStat, type FinanceMeta } from '@/lib/api';

/** Maps category → gradient for the bar fill */
const CAT_BAR_GRADS: Record<string, string> = {
  subscriptions: 'linear-gradient(90deg, var(--primary-500), var(--accent-pink))',
  streaming:     'linear-gradient(90deg, var(--primary-500), var(--accent-pink))',
  food:          'linear-gradient(90deg, var(--accent-orange), var(--accent-yellow))',
  dining:        'linear-gradient(90deg, var(--accent-orange), var(--accent-yellow))',
  transport:     'linear-gradient(90deg, var(--secondary-500), var(--primary-500))',
  travel:        'linear-gradient(90deg, var(--secondary-500), var(--primary-500))',
  shopping:      'linear-gradient(90deg, var(--accent-pink), var(--primary-500))',
  retail:        'linear-gradient(90deg, var(--accent-pink), var(--primary-500))',
  bills:         'linear-gradient(90deg, var(--accent-red), var(--accent-orange))',
  utilities:     'linear-gradient(90deg, var(--accent-red), var(--accent-orange))',
  health:        'linear-gradient(90deg, #FF7AD9, var(--accent-pink))',
  medical:       'linear-gradient(90deg, #FF7AD9, var(--accent-pink))',
};

function getCatBarGrad(category: string): string {
  const c = category.toLowerCase();
  for (const [key, grad] of Object.entries(CAT_BAR_GRADS)) {
    if (c.includes(key)) return grad;
  }
  return 'linear-gradient(90deg, var(--primary-500), var(--secondary-500))';
}

function getCatDotColor(category: string): string {
  const c = category.toLowerCase();
  if (c.includes('sub') || c.includes('stream')) return 'var(--primary-500)';
  if (c.includes('food') || c.includes('dining')) return 'var(--accent-orange)';
  if (c.includes('transport') || c.includes('travel')) return 'var(--secondary-500)';
  if (c.includes('shop') || c.includes('retail')) return 'var(--accent-pink)';
  if (c.includes('bill') || c.includes('util')) return 'var(--accent-red)';
  if (c.includes('health') || c.includes('medical')) return 'var(--accent-pink)';
  return 'var(--fg-4)';
}

type Props = {
  stats: CategoryStat[];
  meta: FinanceMeta;
  currency: string;
  budgetByCategory?: BudgetProgress[];
};

function fmt(n: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${Math.round(n)}`;
  }
}

export function CategoryBreakdownCard({ stats, meta, currency, budgetByCategory = [] }: Props) {
  if (stats.length === 0) {
    return (
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, font: '500 16px/1.2 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>
            Top Categories
          </h3>
          <span style={{ color: 'var(--fg-4)', fontSize: 11 }}>This month</span>
        </div>
        <p style={{ textAlign: 'center', padding: '24px 0', color: 'var(--fg-4)', fontSize: 13 }}>No expenses this month.</p>
      </div>
    );
  }

  const budgetMap = Object.fromEntries(budgetByCategory.map((b) => [b.category, b]));
  const max = Math.max(...stats.map((s) => s.total), 1);
  const top = stats.slice(0, 7);

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* Card head */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0, font: '500 16px/1.2 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>
          Top Categories
        </h3>
        <span style={{ color: 'var(--fg-4)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
          {new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
        </span>
      </div>

      {/* Category rows */}
      {top.map((s) => {
        const pct = (s.total / max) * 100;
        const bp = budgetMap[s.category];
        const over = bp ? s.total > bp.budget : false;
        const emoji = meta.category_emoji[s.category] ?? '📌';
        const dotColor = getCatDotColor(s.category);
        const barGrad = over ? 'linear-gradient(90deg, var(--accent-red), var(--accent-orange))' : getCatBarGrad(s.category);

        return (
          <div
            key={s.category}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 4,
              marginBottom: 16,
            }}
          >
            {/* Row: label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: 'var(--fg-1)' }}>
              <i style={{ width: 8, height: 8, borderRadius: 999, background: dotColor, flexShrink: 0, display: 'inline-block' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {emoji} {s.category}
              </span>
            </div>

            {/* Row: value */}
            <div style={{ color: over ? 'var(--accent-red)' : 'var(--fg-2)', fontFamily: 'var(--font-mono)', fontSize: 12.5, textAlign: 'right', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{fmt(s.total, currency)}</span>
              {bp && (
                <span style={{
                  fontSize: 10.5, padding: '2px 6px', borderRadius: 6,
                  background: over ? 'rgba(255,91,110,0.12)' : bp.pct > 80 ? 'rgba(255,184,107,0.12)' : 'var(--surface-hover)',
                  color: over ? 'var(--accent-red)' : bp.pct > 80 ? 'var(--accent-yellow)' : 'var(--fg-4)',
                }}>
                  {over ? '⚠ ' : ''}{bp.pct.toFixed(0)}%
                </span>
              )}
            </div>

            {/* Bar (full width) */}
            <div style={{ gridColumn: '1 / -1', height: 4, borderRadius: 999, background: 'var(--surface-hover)', overflow: 'hidden', marginTop: 8, position: 'relative' }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: barGrad, transition: 'width 500ms ease' }} />
              {bp && bp.budget > 0 && (
                <div style={{ position: 'absolute', top: 0, height: '100%', width: 1, background: 'rgba(255,255,255,0.30)', left: `${Math.min((bp.budget / max) * 100, 100)}%` }} />
              )}
            </div>

            {/* Meta (full width) */}
            <div style={{ gridColumn: '1 / -1', color: 'var(--fg-4)', fontSize: 11, fontFamily: 'var(--font-mono)', marginTop: 4 }}>
              {s.count} transaction{s.count !== 1 ? 's' : ''}
              {bp ? ` · of ${fmt(bp.budget, currency)} budget` : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}
