import { useQuery } from '@tanstack/react-query';
import { api, type SubscriptionStatsResponse } from '@/lib/api';
import { formatAmount } from './subUtils';

/** Brand logo gradient for the timeline logo box */
function getLogoGrad(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('netflix'))              return 'linear-gradient(135deg, #E50914, #831010)';
  if (n.includes('claude') || n.includes('anthropic')) return 'linear-gradient(135deg, #FFA0A0, #D4756E)';
  if (n.includes('spotify'))              return 'linear-gradient(135deg, #1DB954, #15803D)';
  if (n.includes('apple') || n.includes('icloud')) return 'linear-gradient(135deg, #3EBEFF, #0F7AB8)';
  if (n.includes('cursor'))               return 'linear-gradient(135deg, #232734, #0E1018)';
  if (n.includes('gym') || n.includes('fitness'))   return 'linear-gradient(135deg, #FFB86B, #B56A00)';
  if (n.includes('youtube'))              return 'linear-gradient(135deg, #FF0000, #8B0000)';
  if (n.includes('openai') || n.includes('chatgpt')) return 'linear-gradient(135deg, #10a37f, #065F46)';
  if (n.includes('notion'))               return 'linear-gradient(135deg, #2d2d2d, #1a1a1a)';
  return 'linear-gradient(135deg, var(--primary-500), #6352DB)';
}

function fmtBillingDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function UpcomingRenewals() {
  const { data, isLoading } = useQuery<SubscriptionStatsResponse>({
    queryKey: ['subscription-stats'],
    queryFn: () => api.subscriptions.stats(),
    staleTime: 1000 * 30,
  });

  const upcoming = data?.upcoming_30d ?? [];
  const total = upcoming.reduce((s, u) => s + (u.subscription.amount || 0), 0);
  const currency = upcoming[0]?.subscription.currency ?? 'INR';

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* Card head */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0, font: '500 16px/1.2 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>
          Upcoming · 30 days
        </h3>
        {upcoming.length > 0 && (
          <span style={{ color: 'var(--fg-4)', fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>
            {upcoming.length} charge{upcoming.length !== 1 ? 's' : ''} · {formatAmount(total, currency)}
          </span>
        )}
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--fg-4)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>Loading…</div>
      ) : upcoming.length === 0 ? (
        <div style={{ color: 'var(--fg-4)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>Nothing due in 30 days.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {upcoming.map(({ subscription: s, days_until }) => {
            const isAlert = days_until <= 7;
            const logoGrad = getLogoGrad(s.name);
            const isCursor = s.name.toLowerCase().includes('cursor');

            return (
              <div
                key={s.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '70px auto 1fr auto',
                  gap: 12, alignItems: 'center',
                  padding: '12px 10px',
                  borderRadius: 12,
                  transition: 'background var(--dur) var(--ease)',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-hover)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ''; }}
              >
                {/* Date */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span style={{
                    font: '500 14px/1 var(--font-display)', letterSpacing: '-0.01em',
                    color: isAlert ? 'var(--accent-yellow)' : 'var(--fg-1)',
                  }}>
                    {fmtBillingDate(s.next_billing_date)}
                  </span>
                  <span style={{ color: 'var(--fg-4)', font: '500 10px/1 var(--font-mono)', marginTop: 5, letterSpacing: '0.04em' }}>
                    {days_until === 0 ? 'TODAY' : days_until === 1 ? 'TOMORROW' : `IN ${days_until} DAYS`}
                  </span>
                </div>

                {/* Logo */}
                <div style={{
                  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                  background: logoGrad,
                  border: isCursor ? '1px solid var(--border-strong)' : 'none',
                  display: 'grid', placeItems: 'center',
                  font: '500 13px/1 var(--font-display)', color: 'white',
                }}>
                  {s.emoji || s.name.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.name}
                  </div>
                  {s.account_name && (
                    <div style={{ color: 'var(--fg-4)', fontSize: 11, fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                      {s.account_name}
                    </div>
                  )}
                </div>

                {/* Amount */}
                <div style={{
                  font: '500 13.5px/1 var(--font-display)', letterSpacing: '-0.01em',
                  textAlign: 'right',
                  color: isAlert ? 'var(--accent-yellow)' : 'var(--fg-1)',
                }}>
                  {formatAmount(s.amount, s.currency)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
