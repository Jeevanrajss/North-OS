import { useQuery } from '@tanstack/react-query';
import { api, type Subscription } from '@/lib/api';
import { AlertTriangle, Clock } from 'lucide-react';

export function TrialTrackerCard() {
  const { data: allSubs = [] } = useQuery<Subscription[]>({
    queryKey: ['subscriptions', 'all'],
    queryFn: () => api.subscriptions.list(true),
    staleTime: 1000 * 30,
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const trials = allSubs
    .filter((s) => s.cancelled_at === null && s.trial_end_date !== null)
    .map((s) => {
      const end = new Date(s.trial_end_date!);
      end.setHours(0, 0, 0, 0);
      const daysLeft = Math.round((end.getTime() - today.getTime()) / 86_400_000);
      return { sub: s, daysLeft };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

  if (trials.length === 0) return null;

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ margin: 0, font: '500 16px/1.2 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>
          Free Trials
        </h3>
        <span style={{ font: '500 10.5px/1 var(--font-mono)', padding: '3px 8px', borderRadius: 999, background: 'rgba(61,255,152,0.08)', color: 'var(--accent-green)', border: '1px solid rgba(61,255,152,0.24)' }}>
          {trials.length} active
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {trials.map(({ sub, daysLeft }) => {
          const expired = daysLeft < 0;
          const urgent  = daysLeft <= 3 && !expired;
          const warn    = daysLeft <= 7 && !urgent && !expired;
          const ok      = !expired && !urgent && !warn;

          const statusColor = expired
            ? 'var(--fg-4)'
            : urgent ? 'var(--accent-red)'
            : warn ? 'var(--accent-yellow)'
            : 'var(--accent-green)';

          return (
            <div
              key={sub.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                gap: 10, alignItems: 'center',
                padding: '12px 14px',
                borderRadius: 12,
                background: urgent ? 'rgba(255,91,110,0.04)' : warn ? 'rgba(255,184,107,0.04)' : 'var(--surface-elev)',
                border: urgent ? '1px solid rgba(255,91,110,0.14)' : warn ? '1px solid rgba(255,184,107,0.14)' : '1px solid var(--border-default)',
              }}
            >
              {/* Logo */}
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: 'var(--surface-hover)',
                display: 'grid', placeItems: 'center',
                font: '500 16px/1', color: 'var(--fg-2)',
              }}>
                {sub.emoji || sub.name.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sub.name}
                </div>
                <div style={{ color: 'var(--fg-4)', fontSize: 11, fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                  Ends {sub.trial_end_date}
                  {sub.post_trial_amount != null && sub.post_trial_amount > 0 && (
                    <span style={{ color: 'var(--fg-4)' }}>
                      {' '}· then {sub.currency} {sub.post_trial_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  )}
                </div>
              </div>

              {/* Days pill */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                font: '500 11.5px/1 var(--font-mono)',
                color: statusColor,
                padding: '4px 8px', borderRadius: 999,
                background: urgent ? 'rgba(255,91,110,0.10)' : warn ? 'rgba(255,184,107,0.10)' : ok ? 'rgba(61,255,152,0.06)' : 'var(--glass-bg)',
                border: `1px solid ${urgent ? 'rgba(255,91,110,0.20)' : warn ? 'rgba(255,184,107,0.20)' : ok ? 'rgba(61,255,152,0.20)' : 'var(--border-default)'}`,
                flexShrink: 0,
              }}>
                {urgent && <AlertTriangle style={{ width: 11, height: 11 }} />}
                {(ok && !expired) && <Clock style={{ width: 11, height: 11 }} />}
                {expired ? 'Expired'
                  : daysLeft === 0 ? 'Today!'
                  : daysLeft === 1 ? '1d left'
                  : `${daysLeft}d`}
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 10.5, color: 'var(--fg-4)', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
        Set a trial end date when adding/editing a subscription to track it here.
      </p>
    </div>
  );
}
