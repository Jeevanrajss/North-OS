import { useState } from 'react';
import { EmojiPickerPopover } from '@/components/habits/EmojiPickerPopover';
import { useToast } from '@/contexts/ToastContext';
import { api } from '@/lib/api';

type Investment = {
  id: string; name: string; emoji: string; investment_type: string;
  sip_amount: number | null; sip_date: number | null;
  target_amount: number | null; notes: string | null;
};

type Props = {
  initial?: Investment | null;
  onSave: () => void;
  onCancel: () => void;
};

const TYPES = [
  { value: 'mutual_fund',      label: '📊 Mutual Fund' },
  { value: 'fd',               label: '🏦 Fixed Deposit' },
  { value: 'ppf',              label: '🏛️ PPF' },
  { value: 'nps',              label: '🧓 NPS' },
  { value: 'gold',             label: '🥇 Gold' },
  { value: 'rd',               label: '📅 Recurring Deposit' },
  { value: 'savings_account',  label: '💰 Savings Account' },
  { value: 'stocks',           label: '📈 Stocks' },
  { value: 'other',            label: '🗂️ Other' },
];

const L = ({ children }: { children: React.ReactNode }) => (
  <label className="text-[10px] text-ink-500 uppercase tracking-wide mb-1 block">{children}</label>
);

export function InvestmentForm({ initial, onSave, onCancel }: Props) {
  const toast = useToast();
  const [emoji,     setEmoji]     = useState(initial?.emoji ?? '📈');
  const [name,      setName]      = useState(initial?.name ?? '');
  const [invType,   setInvType]   = useState(initial?.investment_type ?? 'mutual_fund');
  const [sipAmt,    setSipAmt]    = useState(String(initial?.sip_amount ?? ''));
  const [sipDate,   setSipDate]   = useState(String(initial?.sip_date ?? ''));
  const [target,    setTarget]    = useState(String(initial?.target_amount ?? ''));
  const [notes,     setNotes]     = useState(initial?.notes ?? '');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    const payload = {
      emoji,
      name: name.trim(),
      investment_type: invType,
      sip_amount: parseFloat(sipAmt) || null,
      sip_date:   parseInt(sipDate)  || null,
      target_amount: parseFloat(target) || null,
      notes: notes.trim() || null,
    };
    setSaving(true); setError(null);
    try {
      if (initial) {
        await api.investments.update(initial.id, payload);
        toast.success(`📈 "${name.trim()}" updated`);
      } else {
        await api.investments.create(payload);
        toast.success(`📈 "${name.trim()}" added`);
      }
      onSave();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const hasSip = ['mutual_fund', 'rd', 'stocks'].includes(invType);

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      {/* Emoji + name */}
      <div className="flex items-center gap-2">
        <EmojiPickerPopover value={emoji} onChange={setEmoji} size="sm" />
        <input
          autoFocus value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g. Axis Bluechip Fund"
          maxLength={200}
          className="flex-1 min-w-0 rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60"
        />
      </div>

      {/* Type */}
      <div>
        <L>Investment type</L>
        <select value={invType} onChange={e => setInvType(e.target.value)}
          className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60 text-ink-200">
          {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* SIP fields */}
      {hasSip && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <L>Monthly SIP amount (₹)</L>
            <input type="number" value={sipAmt} onChange={e => setSipAmt(e.target.value)}
              placeholder="e.g. 5000" min="0"
              className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60" />
          </div>
          <div>
            <L>SIP debit day</L>
            <input type="number" value={sipDate} onChange={e => setSipDate(e.target.value)}
              placeholder="e.g. 10" min="1" max="31"
              className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60" />
          </div>
        </div>
      )}

      {/* Target corpus */}
      <div>
        <L>Target corpus (₹, optional)</L>
        <input type="number" value={target} onChange={e => setTarget(e.target.value)}
          placeholder="e.g. 1000000" min="0"
          className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60" />
        {target && sipAmt && parseFloat(sipAmt) > 0 && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--primary-300)' }}>
            At ₹{parseFloat(sipAmt).toLocaleString('en-IN')}/mo → reaches target in ~{Math.ceil(parseFloat(target) / parseFloat(sipAmt))} months
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <L>Notes (optional)</L>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          rows={2} maxLength={500} placeholder="e.g. Folio No. 12345678"
          className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60 resize-none" />
      </div>

      {error && <div className="text-xs text-red-400">{error}</div>}

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving || !name.trim()}
          className="flex-1 rounded-md bg-accent/20 border border-accent/40 py-2 text-sm font-medium text-accent hover:bg-accent/30 disabled:opacity-40">
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Add Investment'}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-md border border-ink-800 bg-ink-900 px-4 py-2 text-sm text-ink-400 hover:text-ink-200">
          Cancel
        </button>
      </div>
    </form>
  );
}
