import { useState } from 'react';
import { MoreHorizontal, Plus, Pencil } from 'lucide-react';

type Investment = {
  id: string; name: string; emoji: string; investment_type: string;
  total_invested: number; sip_amount: number | null; target_amount: number | null;
  currency: string; status: string; progress_pct: number | null;
};

type Props = {
  investment: Investment;
  onEdit: () => void;
  onAddEntry: () => void;
  onRedeem: () => Promise<void>;
};

const TYPE_LABELS: Record<string, string> = {
  mutual_fund: 'Mutual Fund', fd: 'Fixed Deposit', ppf: 'PPF',
  nps: 'NPS', gold: 'Gold', rd: 'RD', savings_account: 'Savings', stocks: 'Stocks', other: 'Other',
};

export function InvestmentCard({ investment: inv, onEdit, onAddEntry, onRedeem }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  async function doRedeem() {
    setRedeeming(true); setMenuOpen(false);
    try { await onRedeem(); } finally { setRedeeming(false); }
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: '18px 20px', position: 'relative', opacity: inv.status === 'redeemed' ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--surface-elev)', display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0 }}>
          {inv.emoji}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '500 14px/1.2 var(--font-display)', color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.name}</div>
          <span style={{ marginTop: 3, display: 'inline-block', padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 500, fontFamily: 'var(--font-mono)', background: 'rgba(139,124,255,0.10)', color: 'var(--primary-300)', border: '1px solid rgba(139,124,255,0.20)' }}>
            {TYPE_LABELS[inv.investment_type] ?? inv.investment_type}
          </span>
        </div>
        {/* Actions */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button type="button" onClick={onAddEntry} title="Add entry"
            style={{ padding: 5, borderRadius: 8, color: 'var(--primary-300)', background: 'rgba(139,124,255,0.10)', border: '1px solid rgba(139,124,255,0.20)', cursor: 'pointer' }}>
            <Plus style={{ width: 13, height: 13 }} />
          </button>
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setMenuOpen(v => !v)} disabled={redeeming}
              style={{ padding: 5, borderRadius: 8, color: 'var(--fg-4)', background: 'transparent', border: '1px solid transparent', cursor: 'pointer' }}>
              <MoreHorizontal style={{ width: 15, height: 15 }} />
            </button>
            {menuOpen && (
              <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 20, background: 'var(--surface-elev)', border: '1px solid var(--border-default)', borderRadius: 10, padding: 4, minWidth: 140, boxShadow: 'var(--elev-2)' }}>
                {[
                  { label: 'Edit', onClick: () => { setMenuOpen(false); onEdit(); }, color: 'var(--fg-2)' },
                  { label: 'Mark Redeemed', onClick: doRedeem, color: 'var(--accent-yellow)' },
                ].map(({ label, onClick, color: c }) => (
                  <button key={label} type="button" onClick={onClick}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, fontSize: 12, fontWeight: 500, color: c, background: 'transparent', border: 0, cursor: 'pointer' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Total invested */}
      <div style={{ font: '500 28px/1 var(--font-display)', letterSpacing: '-0.02em', color: 'var(--fg-1)', marginBottom: 10 }}>
        {fmt(inv.total_invested)}
      </div>

      {/* Progress bar toward target */}
      {inv.target_amount && inv.target_amount > 0 && (
        <>
          <div style={{ height: 4, background: 'var(--surface-hover)', borderRadius: 999, marginBottom: 6, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, inv.progress_pct ?? 0)}%`, background: 'linear-gradient(90deg, var(--primary-500), var(--accent-green))', borderRadius: 999 }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>
            {fmt(inv.total_invested)} / {fmt(inv.target_amount)} target
          </div>
        </>
      )}

      {/* SIP chip */}
      {inv.sip_amount && (
        <div style={{ marginTop: 8 }}>
          <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono)', background: 'rgba(61,255,152,0.10)', color: 'var(--accent-green)', border: '1px solid rgba(61,255,152,0.20)' }}>
            SIP {fmt(inv.sip_amount)}/mo
          </span>
        </div>
      )}
    </div>
  );
}
