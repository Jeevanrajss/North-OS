import { useEffect, useMemo, useState } from 'react';
import { EmojiPickerPopover } from '@/components/habits/EmojiPickerPopover';
import { api } from '@/lib/api';

type Debt = {
  id: string; name: string; emoji: string; debt_type: string;
  lender: string | null; account_last4: string | null;
  principal: number; outstanding: number; interest_rate: number;
  emi_amount: number; emi_due_day: number | null;
  currency: string; notes: string | null;
};

type Props = {
  initial?: Debt | null;
  onSave: () => void;
  onCancel: () => void;
};

const DEBT_TYPES = [
  { value: 'personal_loan',    label: 'Personal Loan' },
  { value: 'home_loan',        label: 'Home Loan' },
  { value: 'car_loan',         label: 'Car Loan' },
  { value: 'two_wheeler_loan', label: 'Two-Wheeler Loan' },
  { value: 'education_loan',   label: 'Education Loan' },
  { value: 'credit_card',      label: 'Credit Card' },
  { value: 'no_cost_emi',      label: 'No-Cost EMI' },
  { value: 'other',            label: 'Other' },
];

function monthsToPayoff(outstanding: number, emi: number, annualRate: number): number {
  if (outstanding <= 0) return 0;
  if (annualRate === 0) return emi > 0 ? Math.ceil(outstanding / emi) : 999;
  const r = annualRate / 12 / 100;
  if (emi <= outstanding * r) return 999;
  try {
    return Math.ceil(-Math.log(1 - (outstanding * r) / emi) / Math.log(1 + r));
  } catch { return 999; }
}

const L = ({ children }: { children: React.ReactNode }) => (
  <label className="text-[10px] text-ink-500 uppercase tracking-wide mb-1 block">{children}</label>
);

export function DebtForm({ initial, onSave, onCancel }: Props) {
  const [emoji,       setEmoji]       = useState(initial?.emoji ?? '💳');
  const [name,        setName]        = useState(initial?.name ?? '');
  const [debtType,    setDebtType]    = useState(initial?.debt_type ?? 'personal_loan');
  const [lender,      setLender]      = useState(initial?.lender ?? '');
  const [last4,       setLast4]       = useState(initial?.account_last4 ?? '');
  const [principal,   setPrincipal]   = useState(String(initial?.principal ?? ''));
  const [outstanding, setOutstanding] = useState(String(initial?.outstanding ?? ''));
  const [rate,        setRate]        = useState(String(initial?.interest_rate ?? ''));
  const [emi,         setEmi]         = useState(String(initial?.emi_amount ?? ''));
  const [dueDay,      setDueDay]      = useState(String(initial?.emi_due_day ?? ''));
  const [notes,       setNotes]       = useState(initial?.notes ?? '');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  // Live payoff calculation
  const calc = useMemo(() => {
    const os  = parseFloat(outstanding) || 0;
    const rt  = parseFloat(rate) || 0;
    const em  = parseFloat(emi) || 0;
    if (os <= 0 || em <= 0) return null;
    const months = monthsToPayoff(os, em, rt);
    const totalInt = Math.max(0, em * months - os);
    return { months, totalInt };
  }, [outstanding, rate, emi]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    const os = parseFloat(outstanding);
    const em = parseFloat(emi);
    if (!os || os <= 0) { setError('Outstanding balance is required.'); return; }
    if (!em || em <= 0) { setError('EMI amount is required.'); return; }

    const payload = {
      emoji,
      name: name.trim(),
      debt_type: debtType,
      lender: lender.trim() || null,
      account_last4: last4.trim() || null,
      principal: parseFloat(principal) || os,
      outstanding: os,
      interest_rate: parseFloat(rate) || 0,
      emi_amount: em,
      emi_due_day: parseInt(dueDay) || null,
      currency: 'INR',
      notes: notes.trim() || null,
    };

    setSaving(true); setError(null);
    try {
      if (initial) {
        await api.debt.update(initial.id, payload);
      } else {
        await api.debt.create(payload);
      }
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      {/* Emoji + name */}
      <div className="flex items-center gap-2">
        <EmojiPickerPopover value={emoji} onChange={setEmoji} size="sm" />
        <input
          autoFocus value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g. HDFC Personal Loan"
          maxLength={200}
          className="flex-1 min-w-0 rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60"
        />
      </div>

      {/* Debt type */}
      <div>
        <L>Loan type</L>
        <select value={debtType} onChange={e => setDebtType(e.target.value)}
          className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60 text-ink-200">
          {DEBT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Lender + account last4 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <L>Lender (optional)</L>
          <input value={lender} onChange={e => setLender(e.target.value)}
            placeholder="e.g. HDFC Bank"
            className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60" />
        </div>
        <div>
          <L>Account last 4 digits</L>
          <input value={last4} onChange={e => setLast4(e.target.value.slice(0, 10))}
            placeholder="e.g. 4242"
            className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60" />
        </div>
      </div>

      {/* Principal + Outstanding */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <L>Original loan amount (₹)</L>
          <input type="number" value={principal} onChange={e => setPrincipal(e.target.value)}
            placeholder="e.g. 500000" min="0"
            className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60" />
        </div>
        <div>
          <L>Outstanding balance (₹) *</L>
          <input type="number" value={outstanding} onChange={e => setOutstanding(e.target.value)}
            placeholder="e.g. 320000" min="0"
            className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60" />
        </div>
      </div>

      {/* Interest rate + EMI */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <L>Interest rate (% per year)</L>
          <input type="number" value={rate} onChange={e => setRate(e.target.value)}
            placeholder="0 for no-cost EMI" min="0" max="100" step="0.01"
            className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60" />
        </div>
        <div>
          <L>Monthly EMI (₹) *</L>
          <input type="number" value={emi} onChange={e => setEmi(e.target.value)}
            placeholder="e.g. 12500" min="0"
            className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60" />
        </div>
      </div>

      {/* Live payoff preview */}
      {calc && (
        <div style={{
          padding: '12px 14px', borderRadius: 12,
          background: calc.months < 999 ? 'rgba(139,124,255,0.08)' : 'rgba(255,91,110,0.08)',
          border: `1px solid ${calc.months < 999 ? 'rgba(139,124,255,0.25)' : 'rgba(255,91,110,0.25)'}`,
        }}>
          <div style={{ fontSize: 11, color: 'var(--fg-4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Payoff estimate
          </div>
          {calc.months < 999 ? (
            <div style={{ display: 'flex', gap: 20 }}>
              <div>
                <div style={{ font: '500 22px/1 var(--font-display)', color: 'var(--primary-300)' }}>{calc.months}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-4)', marginTop: 3 }}>months to clear</div>
              </div>
              {calc.totalInt > 0 && (
                <div>
                  <div style={{ font: '500 22px/1 var(--font-display)', color: 'var(--accent-red)' }}>
                    ₹{Math.round(calc.totalInt).toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-4)', marginTop: 3 }}>total interest</div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--accent-red)' }}>
              ⚠ EMI is less than monthly interest — loan won't be paid off at this rate.
            </div>
          )}
        </div>
      )}

      {/* EMI due day */}
      <div>
        <L>EMI due day of month (optional)</L>
        <input type="number" value={dueDay} onChange={e => setDueDay(e.target.value)}
          placeholder="e.g. 5" min="1" max="31"
          className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60" />
      </div>

      {/* Notes */}
      <div>
        <L>Notes (optional)</L>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          rows={2} maxLength={500} placeholder="e.g. Pre-closure penalty applies"
          className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60 resize-none" />
      </div>

      {error && <div className="text-xs text-red-400">{error}</div>}

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving || !name.trim()}
          className="flex-1 rounded-md bg-accent/20 border border-accent/40 py-2 text-sm font-medium text-accent hover:bg-accent/30 disabled:opacity-40">
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Add Loan'}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-md border border-ink-800 bg-ink-900 px-4 py-2 text-sm text-ink-400 hover:text-ink-200">
          Cancel
        </button>
      </div>
    </form>
  );
}
