import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type SubscriptionStatsResponse } from '@/lib/api';
import { formatAmount } from '@/components/subscriptions/subUtils';

function fmtMonthly(amount: number): string {
  try {
    const currency = localStorage.getItem('sub_display_currency') ?? 'INR';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toFixed(0)}`;
  }
}

function fmtYearly(amount: number): string {
  try {
    const currency = localStorage.getItem('sub_display_currency') ?? 'INR';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toFixed(0)}`;
  }
}

function describeDue(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

export function DashSubsCard() {
  const { data, isLoading } = useQuery<SubscriptionStatsResponse>({
    queryKey: ['subscription-stats'],
    queryFn: () => api.subscriptions.stats(),
    staleTime: 1000 * 30,
  });

  const allUpcoming  = data?.upcoming_30d ?? [];
  const paidUpcoming = allUpcoming.filter((u) => u.subscription.amount > 0 && u.subscription.paused_at === null).slice(0, 3);
  const soonCount    = allUpcoming.filter((u) => u.days_until >= 0 && u.days_until <= 7 && u.subscription.amount > 0).length;

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }}>
        <h3 style={{ margin: 0, font: '500 16px/1.2 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>
          Subscriptions
        </h3>
        <Link
          to="/app/subscriptions"
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
          All →
        </Link>
      </div>

      {/* Total row */}
      {data && (
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          paddingBottom: 16, marginTop: 14, marginBottom: 6,
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div>
            <div style={{ font: '500 28px/1 var(--font-display)', letterSpacing: '-0.02em', color: 'var(--fg-1)' }}>
              {fmtMonthly(data.monthly_total)}
              <small style={{ fontSize: 12, color: 'var(--fg-3)', fontWeight: 400, marginLeft: 6 }}>/mo</small>
            </div>
            <div style={{ color: 'var(--fg-4)', fontSize: 11, marginTop: 6 }}>
              {data.active_count} active · {fmtYearly(data.yearly_total)} / year
            </div>
          </div>
          {soonCount > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontSize: 10, fontWeight: 500, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 4,
              }}>
                Upcoming
              </div>
              <div style={{ font: '500 13px/1 var(--font-display)', color: 'var(--accent-yellow)' }}>
                {soonCount} in 7 days
              </div>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div style={{ color: 'var(--fg-4)', fontSize: 13, padding: '12px 0', textAlign: 'center' }}>Loading…</div>
      ) : paidUpcoming.length === 0 ? (
        <div style={{ color: 'var(--fg-4)', fontSize: 12, padding: '12px 0', textAlign: 'center' }}>Nothing due soon.</div>
      ) : (
        <div>
          {paidUpcoming.map(({ subscription: s, days_until }, idx) => (
            <div
              key={s.id}
              style={{
                display: 'grid', gridTemplateColumns: 'auto 1fr auto',
                gap: 12, alignItems: 'center',
                padding: '12px 0',
                borderTop: idx === 0 ? 'none' : '1px solid var(--border-subtle)',
                paddingTop: idx === 0 ? 6 : 12,
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: getSubGradient(s.name),
                display: 'grid', placeItems: 'center',
                fontSize: 14, color: 'white', fontWeight: 500,
                fontFamily: 'var(--font-display)',
                flexShrink: 0,
              }}>
                {s.emoji || s.name.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--fg-1)' }}>{s.name}</div>
                <div style={{ color: 'var(--fg-4)', fontSize: 11, fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  {s.billing_cycle === 'monthly' ? 'Monthly' : s.billing_cycle === 'yearly' ? 'Annual' : 'Recurring'} · Auto-renew
                </div>
              </div>

              {/* Due */}
              <div>
                <div style={{
                  color: days_until <= 7 ? 'var(--accent-yellow)' : 'var(--fg-3)',
                  fontSize: 12, fontWeight: 500, textAlign: 'right',
                }}>
                  {describeDue(days_until)}
                </div>
                <div style={{ color: 'var(--fg-4)', fontSize: 11, fontFamily: 'var(--font-mono)', marginTop: 2, textAlign: 'right' }}>
                  {formatAmount(s.amount, s.currency)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Brand gradient mapping */
function getSubGradient(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('netflix'))  return 'linear-gradient(135deg, #E50914, #831010)';
  if (n.includes('claude'))   return 'linear-gradient(135deg, #FFA0A0, #D4756E)';
  if (n.includes('spotify'))  return 'linear-gradient(135deg, #1DB954, #15803D)';
  if (n.includes('apple') || n.includes('icloud')) return 'linear-gradient(135deg, #3EBEFF, #0F7AB8)';
  if (n.includes('cursor'))   return 'linear-gradient(135deg, #232734, #0E1018)';
  if (n.includes('gym'))      return 'linear-gradient(135deg, #FFB86B, #B56A00)';
  if (n.includes('youtube'))  return 'linear-gradient(135deg, #FF0000, #8B0000)';
  if (n.includes('amazon') || n.includes('prime')) return 'linear-gradient(135deg, #00A8E1, #00486B)';
  if (n.includes('chatgpt') || n.includes('openai')) return 'linear-gradient(135deg, #74AA9C, #3D8C85)';
  // Default: primary gradient
  return 'linear-gradient(135deg, var(--primary-500), #6352DB)';
}
