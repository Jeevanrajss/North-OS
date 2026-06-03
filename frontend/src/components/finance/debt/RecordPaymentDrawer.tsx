import { useState } from 'react';
import { RightDrawer } from '@/components/ui/RightDrawer';
import { api } from '@/lib/api';

type Debt = { id: string; name: string; emoji: string; emi_amount: number; currency: string };

type Props = {
  open: boolean;
  onClose: () => void;
  debt: Debt | null;
  onSuccess: () => void;
};

const TODAY = new Date().toISOString().slice(0, 10);

export function RecordPaymentDrawer({ open, onClose, debt, onSuccess }: Props) {
  const [amount,  setAmount]  = useState('');
  const [payDate, setPayDate] = useState(TODAY);
  const [notes,   setNotes]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Reset when opened for a new debt
  const key = debt?.id ?? 'none';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount.'); return; }
    if (!debt) return;
    setSaving(true); setError(null);
    try {
      await api.debt.payment(debt.id, { amount: amt, payment_date: payDate, notes: notes.trim() || null });
      setAmount(''); setNotes('');
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <RightDrawer open={open} onClose={onClose} title="Record EMI Payment">
      {debt && (
        <form key={key} onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {/* Debt indicator */}
          <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-elev)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>{debt.emoji}</span>
            <span style={{ font: '500 14px/1 var(--font-display)', color: 'var(--fg-1)' }}>{debt.name}</span>
          </div>

          <div>
            <label className="text-[10px] text-ink-500 uppercase tracking-wide mb-1 block">
              Amount {debt.emi_amount > 0 ? `(EMI: ₹${Math.round(debt.emi_amount).toLocaleString('en-IN')})` : ''}
            </label>
            <input
              autoFocus
              type="number" value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder={String(debt.emi_amount || '0.00')}
              min="0.01" step="0.01"
              className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
          </div>

          <div>
            <label className="text-[10px] text-ink-500 uppercase tracking-wide mb-1 block">Payment date</label>
            <input
              type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
              className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60 text-ink-200 [color-scheme:dark]"
            />
          </div>

          <div>
            <label className="text-[10px] text-ink-500 uppercase tracking-wide mb-1 block">Notes (optional)</label>
            <input
              type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Paid via HDFC net banking"
              maxLength={200}
              className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
          </div>

          {error && <div className="text-xs text-red-400">{error}</div>}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving || !amount}
              className="flex-1 rounded-md bg-accent/20 border border-accent/40 py-2 text-sm font-medium text-accent hover:bg-accent/30 disabled:opacity-40">
              {saving ? 'Saving…' : 'Record Payment'}
            </button>
            <button type="button" onClick={onClose}
              className="rounded-md border border-ink-800 bg-ink-900 px-4 py-2 text-sm text-ink-400 hover:text-ink-200">
              Cancel
            </button>
          </div>
        </form>
      )}
    </RightDrawer>
  );
}
