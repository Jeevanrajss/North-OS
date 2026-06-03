import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function PayoffStrategyCard() {
  const [showSnowball, setShowSnowball] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['debt-payoff-strategy'],
    queryFn: () => api.debt.payoffStrategy(),
    staleTime: 60_000,
  });

  if (isLoading) return <div className="card" style={{ padding: 20 }}><div style={{ color: 'var(--fg-4)', fontSize: 13 }}>Loading strategy…</div></div>;
  if (!data || (!data.avalanche?.length && !data.snowball?.length)) return null;

  const list = showSnowball ? data.snowball : data.avalanche;
  const s = data.summary;

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ font: '500 15px/1.2 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>
          Payoff Strategy
        </div>
        <div style={{ display: 'inline-flex', background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 8, padding: 2 }}>
          {['Avalanche', 'Snowball'].map((label) => (
            <button key={label} type="button"
              onClick={() => setShowSnowball(label === 'Snowball')}
              style={{ height: 24, padding: '0 10px', borderRadius: 6, fontSize: 11, fontWeight: 500, border: 0, cursor: 'pointer', transition: 'var(--transition)', background: (label === 'Snowball') === showSnowball ? 'var(--surface-elev)' : 'transparent', color: (label === 'Snowball') === showSnowball ? 'var(--fg-1)' : 'var(--fg-4)' }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary strip */}
      {s && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Total outstanding', value: `₹${Math.round(s.total_outstanding).toLocaleString('en-IN')}` },
            { label: 'Total EMI/month',   value: `₹${Math.round(s.total_emi_monthly).toLocaleString('en-IN')}` },
            { label: 'Saved vs snowball', value: s.interest_saved_by_avalanche > 0 ? `₹${Math.round(s.interest_saved_by_avalanche).toLocaleString('en-IN')}` : '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'var(--surface-elev)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--fg-4)', marginBottom: 4 }}>{label}</div>
              <div style={{ font: '500 15px/1 var(--font-display)', color: 'var(--fg-1)' }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Ranked list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list?.map((item: { debt_id?: string; priority: number; name: string; outstanding: number; interest_rate: number; emi_amount: number; months_to_payoff: number; why_first: string }) => (
          <div key={item.debt_id ?? item.name} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 12px', background: 'var(--surface-elev)', borderRadius: 10 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: item.priority === 1 ? 'var(--grad-primary)' : 'var(--surface-hover)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: item.priority === 1 ? 'white' : 'var(--fg-4)', flexShrink: 0 }}>
              {item.priority}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                <span style={{ font: '500 13px/1 var(--font-display)', color: 'var(--fg-1)' }}>{item.name}</span>
                <span style={{ fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>
                  ₹{Math.round(item.outstanding).toLocaleString('en-IN')} · {item.interest_rate}%
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-4)', lineHeight: 1.4 }}>{item.why_first}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-3)' }}>{item.months_to_payoff < 999 ? `${item.months_to_payoff}mo` : '∞'}</div>
            </div>
          </div>
        ))}
      </div>

      {s?.recommendation_reason && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--accent-green)', lineHeight: 1.5 }}>
          ✓ {s.recommendation_reason}
        </div>
      )}

      {/* Method explanation */}
      <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(139,124,255,0.05)', border: '1px solid rgba(139,124,255,0.15)', borderRadius: 10, fontSize: 11, color: 'var(--fg-4)', lineHeight: 1.6 }}>
        <b style={{ color: 'var(--fg-3)' }}>Avalanche</b> targets highest-interest debt first — saves the most money overall.{' '}
        <b style={{ color: 'var(--fg-3)' }}>Snowball</b> targets smallest balance first — builds momentum fastest. Both strategies clear all debt by the same date.
      </div>
    </div>
  );
}
