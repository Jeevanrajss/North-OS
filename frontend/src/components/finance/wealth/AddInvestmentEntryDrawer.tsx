import { useState } from 'react';
import { RightDrawer } from '@/components/ui/RightDrawer';
import { api } from '@/lib/api';

type Investment = { id: string; name: string; emoji: string; sip_amount: number | null };

type Props = {
  open: boolean;
  onClose: () => void;
  investment: Investment | null;
  onSuccess: () => void;
};

const TODAY = new Date().toISOString().slice(0, 10);
const TYPES = ['sip', 'lumpsum', 'manual'] as const;

export function AddInvestmentEntryDrawer({ open, onClose, investment, onSuccess }: Props) {
  const [amount,    setAmount]    = useState('');
  const [entryDate, setEntryDate] = useState(TODAY);
  const [entryType, setEntryType] = useState<'sip' | 'lumpsum' | 'manual'>('sip');
  const [notes,     setNotes]     = useState('');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount.'); return; }
    if (!investment) return;
    setSaving(true); setError(null);
    try {
      await api.investments.addEntry(investment.id, { amount: amt, entry_date: entryDate, entry_type: entryType, notes: notes.trim() || null });
      setAmount(''); setNotes('');
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add entry.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <RightDrawer open={open} onClose={onClose} title="Add Investment Entry">
      {investment && (
        <form key={investment.id} onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-elev)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>{investment.emoji}</span>
            <span style={{ font: '500 14px/1 var(--font-display)', color: 'var(--fg-1)' }}>{investment.name}</span>
          </div>

          {/* Entry type */}
          <div>
            <label className="text-[10px] text-ink-500 uppercase tracking-wide mb-1.5 block">Type</label>
            <div style={{ display: 'inline-flex', background: 'var(--surface-elev)', border: '1px solid var(--border-default)', borderRadius: 8, padding: 2, gap: 2 }}>
              {TYPES.map(t => (
                <button key={t} type="button" onClick={() => { setEntryType(t); if (t === 'sip' && investment.sip_amount) setAmount(String(investment.sip_amount)); }}
                  style={{ height: 26, padding: '0 12px', borderRadius: 6, fontSize: 11, fontWeight: 500, border: 0, cursor: 'pointer', background: entryType === t ? 'var(--surface)' : 'transparent', color: entryType === t ? 'var(--fg-1)' : 'var(--fg-4)', transition: 'var(--transition)' }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-ink-500 uppercase tracking-wide mb-1 block">
              Amount {investment.sip_amount && entryType === 'sip' ? `(SIP: ₹${Math.round(investment.sip_amount).toLocaleString('en-IN')})` : ''}
            </label>
            <input autoFocus type="number" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder={investment.sip_amount && entryType === 'sip' ? String(investment.sip_amount) : '0.00'}
              min="0.01" step="0.01"
              className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60" />
          </div>

          <div>
            <label className="text-[10px] text-ink-500 uppercase tracking-wide mb-1 block">Date</label>
            <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)}
              className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60 text-ink-200 [color-scheme:dark]" />
          </div>

          <div>
            <label className="text-[10px] text-ink-500 uppercase tracking-wide mb-1 block">Notes (optional)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Auto-debit from HDFC"
              maxLength={200} className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60" />
          </div>

          {error && <div className="text-xs text-red-400">{error}</div>}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving || !amount}
              className="flex-1 rounded-md bg-accent/20 border border-accent/40 py-2 text-sm font-medium text-accent hover:bg-accent/30 disabled:opacity-40">
              {saving ? 'Saving…' : 'Add Entry'}
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
