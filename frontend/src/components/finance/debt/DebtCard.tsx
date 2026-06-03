import { useState } from 'react';
import { MoreHorizontal, CreditCard, Pencil, XCircle, CheckCircle } from 'lucide-react';

type Debt = {
  id: string; name: string; emoji: string; debt_type: string;
  lender: string | null; outstanding: number; principal: number;
  interest_rate: number; emi_amount: number; emi_due_day: number | null;
  days_to_emi: number | null; currency: string; status: string;
  progress_pct: number; months_to_payoff: number; total_interest_remaining: number;
};

type Props = {
  debt: Debt;
  onEdit: () => void;
  onRecordPayment: () => void;
  onClose: () => Promise<void>;
};

function interestBadgeStyle(rate: number) {
  if (rate === 0) return { bg: 'rgba(61,255,152,0.12)', color: 'var(--accent-green)', border: 'rgba(61,255,152,0.25)' };
  if (rate >= 15) return { bg: 'rgba(255,91,110,0.12)', color: 'var(--accent-red)', border: 'rgba(255,91,110,0.25)' };
  return { bg: 'rgba(255,184,107,0.12)', color: 'var(--accent-yellow)', border: 'rgba(255,184,107,0.25)' };
}

function emiChipStyle(days: number | null) {
  if (days === null) return null;
  if (days <= 3)  return { color: 'var(--accent-red)',    bg: 'rgba(255,91,110,0.12)',  border: 'rgba(255,91,110,0.25)' };
  if (days <= 7)  return { color: 'var(--accent-yellow)', bg: 'rgba(255,184,107,0.12)', border: 'rgba(255,184,107,0.25)' };
  return { color: 'var(--fg-4)', bg: 'var(--surface-elev)', border: 'var(--border-default)' };
}

export function DebtCard({ debt, onEdit, onRecordPayment, onClose }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const iStyle = interestBadgeStyle(debt.interest_rate);
  const eStyle = emiChipStyle(debt.days_to_emi);
  const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  async function doClose() {
    setClosing(true);
    setMenuOpen(false);
    try { await onClose(); } finally { setClosing(false); }
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: '18px 20px', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--surface-elev)', display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0 }}>
          {debt.emoji}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '500 15px/1.2 var(--font-display)', color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {debt.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {debt.lender ?? debt.debt_type.replace('_', ' ')}
          </div>
        </div>
        {/* Interest badge */}
        <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)', background: iStyle.bg, color: iStyle.color, border: `1px solid ${iStyle.border}`, flexShrink: 0 }}>
          {debt.interest_rate === 0 ? 'No cost' : `${debt.interest_rate}% p.a.`}
        </span>
        {/* Menu */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button type="button" onClick={() => setMenuOpen(v => !v)} disabled={closing}
            style={{ padding: 5, borderRadius: 8, color: 'var(--fg-4)', background: 'transparent', border: '1px solid transparent', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; }}
          >
            <MoreHorizontal style={{ width: 15, height: 15 }} />
          </button>
          {menuOpen && (
            <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 20, background: 'var(--surface-elev)', border: '1px solid var(--border-default)', borderRadius: 10, padding: 4, minWidth: 150, boxShadow: 'var(--elev-2)' }}>
              {[
                { icon: Pencil,      label: 'Edit',           onClick: () => { setMenuOpen(false); onEdit(); },          color: 'var(--fg-2)' },
                { icon: CreditCard,  label: 'Record Payment', onClick: () => { setMenuOpen(false); onRecordPayment(); }, color: 'var(--primary-300)' },
                { icon: CheckCircle, label: 'Mark Closed',    onClick: doClose,                                          color: 'var(--accent-green)' },
              ].map(({ icon: Icon, label, onClick, color: c }) => (
                <button key={label} type="button" onClick={onClick}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, fontSize: 12, fontWeight: 500, color: c, background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <Icon style={{ width: 13, height: 13 }} />{label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Outstanding — large */}
      <div style={{ font: '500 32px/1 var(--font-display)', letterSpacing: '-0.02em', color: 'var(--fg-1)', marginBottom: 10 }}>
        {fmt(debt.outstanding)}
      </div>

      {/* Progress bar: paid off */}
      <div style={{ height: 5, background: 'var(--surface-hover)', borderRadius: 999, marginBottom: 10, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${debt.progress_pct}%`, background: 'linear-gradient(90deg, var(--primary-500), var(--accent-green))', borderRadius: 999, transition: 'width 600ms ease' }} />
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>
          EMI {fmt(debt.emi_amount)}/mo
        </span>
        {debt.months_to_payoff < 999 && (
          <span style={{ fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>
            · {debt.months_to_payoff} months left
          </span>
        )}
        <span style={{ marginLeft: 'auto' }} />
        {eStyle && debt.days_to_emi !== null && (
          <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono)', background: eStyle.bg, color: eStyle.color, border: `1px solid ${eStyle.border}` }}>
            {debt.days_to_emi === 0 ? 'EMI Today' : `EMI in ${debt.days_to_emi}d`}
          </span>
        )}
      </div>
    </div>
  );
}
