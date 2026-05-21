import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { type FinanceMeta, type Transaction, type TransactionIn, type TransactionType } from '@/lib/api';
import { cn } from '@/lib/cn';

type Props = {
  meta: FinanceMeta;
  initial?: Transaction | null;
  defaultType?: TransactionType;
  onSubmit: (payload: TransactionIn) => Promise<void>;
  onCancel: () => void;
};

const CURRENCY_OPTS = ['INR', 'USD', 'EUR', 'GBP', 'SGD', 'AED'];

export function TransactionForm({ meta, initial, defaultType = 'expense', onSubmit, onCancel }: Props) {
  const [type, setType] = useState<TransactionType>(initial?.type ?? defaultType);
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'INR');
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(initial?.category ?? '');
  const [account, setAccount] = useState(initial?.account ?? '');
  const [payee, setPayee] = useState(initial?.payee ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = type === 'income' ? meta.income_categories : meta.expense_categories;

  // Reset category when type changes if current one doesn't belong to new list
  useEffect(() => {
    if (category && !categories.includes(category)) setCategory('');
  }, [type]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }
    setError(null);
    setLoading(true);
    try {
      await onSubmit({
        type,
        amount: amt,
        currency,
        date,
        category: category || null,
        account: account || null,
        payee: payee || null,
        notes: notes || null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type toggle */}
      <div className="flex gap-1 p-1 bg-ink-950 rounded-lg border border-ink-800">
        {(['expense', 'income', 'transfer'] as TransactionType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={cn(
              'flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-colors',
              type === t
                ? t === 'income'
                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                  : t === 'expense'
                  ? 'bg-red-500/20 border border-red-500/40 text-red-400'
                  : 'bg-accent/20 border border-accent/40 text-accent'
                : 'text-ink-500 hover:text-ink-300',
            )}
          >
            {t === 'income' ? '+ Income' : t === 'expense' ? '− Expense' : '↔ Transfer'}
          </button>
        ))}
      </div>

      {/* Amount + currency */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-500">{currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency}</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            step="0.01"
            min="0"
            required
            className="w-full pl-8 pr-3 py-2 rounded-md text-sm outline-none focus:border-accent/60 [appearance:textfield]"
          />
        </div>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="rounded-md px-2 py-2 text-sm outline-none focus:border-accent/60"
        >
          {CURRENCY_OPTS.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Date */}
      <div>
        <label className="block text-[11px] text-ink-500 uppercase tracking-wide mb-1">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60"
        />
      </div>

      {/* Category */}
      {type !== 'transfer' && (
        <div>
          <label className="block text-[11px] text-ink-500 uppercase tracking-wide mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60"
          >
            <option value="">— Select category —</option>
            {categories.map((c) => (
              <option key={c} value={c}>{meta.category_emoji[c] ?? '📌'} {c}</option>
            ))}
          </select>
        </div>
      )}

      {/* Payee + Account side by side */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-ink-500 uppercase tracking-wide mb-1">
            {type === 'income' ? 'From / Source' : 'Payee / Merchant'}
          </label>
          <input
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            placeholder="e.g. Swiggy"
            maxLength={80}
            className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60 placeholder:text-ink-500"
          />
        </div>
        <div>
          <label className="block text-[11px] text-ink-500 uppercase tracking-wide mb-1">Account</label>
          <input
            list="account-list"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="e.g. HDFC"
            maxLength={60}
            className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60 placeholder:text-ink-500"
          />
          <datalist id="account-list">
            {meta.account_suggestions.map((a) => <option key={a} value={a} />)}
          </datalist>
        </div>
      </div>

      {/* Credit card sub-picker — shown when "Credit Card" is selected */}
      {account.toLowerCase() === 'credit card' && (
        <div className="rounded-md border border-accent/20 bg-accent/5 px-3 py-2.5 space-y-2">
          <p className="text-[11px] text-accent uppercase tracking-wide font-medium">Which credit card?</p>
          <div className="grid grid-cols-2 gap-1.5">
            {meta.credit_card_options.map((card) => (
              <button
                key={card}
                type="button"
                onClick={() => setAccount(card)}
                className="text-left text-xs text-ink-300 hover:text-accent hover:border-accent/40 rounded-md px-2.5 py-1.5 transition-colors"
              >
                💳 {card.replace(' Credit Card', '')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-[11px] text-ink-500 uppercase tracking-wide mb-1">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Any extra detail…"
          className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60 placeholder:text-ink-500 resize-none"
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={loading}
          className={cn(
            'flex-1 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50',
            type === 'income'
              ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30'
              : type === 'expense'
              ? 'bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30'
              : 'bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25',
          )}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : initial ? 'Save Changes' : 'Add Transaction'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-md border border-ink-800 text-sm text-ink-400 hover:text-ink-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}
