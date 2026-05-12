import { useState } from 'react';
import { type BillingCycle, type PaymentType, type SubscriptionIn } from '@/lib/api';
import { cn } from '@/lib/cn';
import { EmojiPickerPopover } from '@/components/habits/EmojiPickerPopover';
import {
  ACCOUNT_SUGGESTIONS,
  CATEGORIES,
  CURRENCY_OPTS,
  CYCLE_OPTS,
  PAYMENT_TYPE_OPTS,
} from './subUtils';

type Props = {
  onCreate: (payload: SubscriptionIn) => Promise<void>;
  onCancel?: () => void;
  disabled?: boolean;
};

const today = new Date().toISOString().slice(0, 10);

export function SubscriptionAddForm({ onCreate, onCancel, disabled }: Props) {
  const [emoji, setEmoji] = useState('💳');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [nextDate, setNextDate] = useState(today);
  const [trialEndDate, setTrialEndDate] = useState('');
  const [postTrialAmount, setPostTrialAmount] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType | ''>('');
  const [accountName, setAccountName] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setEmoji('💳'); setName(''); setAmount(''); setCurrency('INR');
    setCycle('monthly'); setNextDate(today); setTrialEndDate('');
    setPostTrialAmount('');
    setPaymentType(''); setAccountName(''); setCategory('');
    setNotes(''); setUrl(''); setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const parsedAmount = parseFloat(amount);
    const parsedPostTrialAmount = postTrialAmount ? parseFloat(postTrialAmount) : null;
    if (!trimmedName) { setError('Name is required.'); return; }
    if (isNaN(parsedAmount) || parsedAmount < 0) { setError('Enter a valid amount (0 for free).'); return; }
    if (parsedPostTrialAmount !== null && (isNaN(parsedPostTrialAmount) || parsedPostTrialAmount < 0)) {
      setError('Enter a valid post-trial price.'); return;
    }
    if (!nextDate) { setError('Next billing date is required.'); return; }

    setSaving(true);
    setError(null);
    try {
      await onCreate({
        name: trimmedName, emoji,
        amount: parsedAmount,
        currency,
        billing_cycle: cycle,
        next_billing_date: nextDate,
        trial_end_date: trialEndDate || null,
        post_trial_amount: parsedPostTrialAmount,
        payment_type: paymentType || null,
        account_name: accountName.trim() || null,
        category: category.trim() || null,
        notes: notes.trim() || null,
        url: url.trim() || null,
      });
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
      {/* Emoji + name */}
      <div className="flex items-center gap-2">
        <EmojiPickerPopover value={emoji} onChange={setEmoji} size="sm" />
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Subscription name"
          maxLength={80}
          disabled={disabled}
          className="flex-1 min-w-0 bg-ink-900 border border-ink-800 rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 placeholder:text-ink-600"
        />
      </div>

      {/* Amount + currency + cycle */}
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          min="0"
          step="0.01"
          className="w-24 bg-ink-900 border border-ink-800 rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 placeholder:text-ink-600"
        />
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="w-20 bg-ink-900 border border-ink-800 rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 text-ink-200"
        >
          {CURRENCY_OPTS.map((o) => (
            <option key={o.value} value={o.value}>{o.value}</option>
          ))}
        </select>
        <select
          value={cycle}
          onChange={(e) => setCycle(e.target.value as BillingCycle)}
          className="flex-1 bg-ink-900 border border-ink-800 rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 text-ink-200"
        >
          {CYCLE_OPTS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Payment type + account name */}
      <div className="flex items-center gap-2">
        <select
          value={paymentType}
          onChange={(e) => setPaymentType(e.target.value as PaymentType | '')}
          className="flex-1 bg-ink-900 border border-ink-800 rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 text-ink-200"
        >
          <option value="">Payment type</option>
          {PAYMENT_TYPE_OPTS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="flex-1">
          <input
            list="account-suggestions-add"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="Account (e.g. HDFC)"
            maxLength={60}
            className="w-full bg-ink-900 border border-ink-800 rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 placeholder:text-ink-600"
          />
          <datalist id="account-suggestions-add">
            {ACCOUNT_SUGGESTIONS.map((a) => <option key={a} value={a} />)}
          </datalist>
        </div>
      </div>

      {/* Next billing date + category */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="text-[10px] text-ink-500 uppercase tracking-wide mb-0.5 block">Next billing</label>
          <input
            type="date"
            value={nextDate}
            onChange={(e) => setNextDate(e.target.value)}
            className="w-full bg-ink-900 border border-ink-800 rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 text-ink-200 [color-scheme:dark]"
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-ink-500 uppercase tracking-wide mb-0.5 block">Category</label>
          <input
            list="sub-categories-add"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Streaming"
            maxLength={40}
            className="w-full bg-ink-900 border border-ink-800 rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 placeholder:text-ink-600"
          />
          <datalist id="sub-categories-add">
            {CATEGORIES.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
      </div>

      {/* Trial end date + post-trial price */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-[10px] text-ink-500 uppercase tracking-wide mb-0.5 block">
            Trial / free period ends <span className="normal-case text-ink-700">(optional)</span>
          </label>
          <input
            type="date"
            value={trialEndDate}
            onChange={(e) => setTrialEndDate(e.target.value)}
            className="w-full bg-ink-900 border border-ink-800 rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 text-ink-200 [color-scheme:dark]"
          />
        </div>
        {trialEndDate && (
          <div className="flex-1">
            <label className="text-[10px] text-ink-500 uppercase tracking-wide mb-0.5 block">
              Price after trial
            </label>
            <input
              type="number"
              value={postTrialAmount}
              onChange={(e) => setPostTrialAmount(e.target.value)}
              placeholder="e.g. 399"
              min="0"
              step="0.01"
              className="w-full bg-ink-900 border border-ink-800 rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 placeholder:text-ink-600"
            />
          </div>
        )}
      </div>

      {/* URL + notes */}
      <div className="space-y-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="URL (optional)"
          type="url"
          className="w-full bg-ink-900 border border-ink-800 rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 placeholder:text-ink-600"
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          maxLength={500}
          className="w-full bg-ink-900 border border-ink-800 rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 placeholder:text-ink-600 resize-none"
        />
      </div>

      {error && <div className="text-[11px] text-red-400">{error}</div>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || disabled || !name.trim() || amount === ''}
          className="px-3 py-1.5 rounded-md bg-accent/20 border border-accent/40 text-xs text-accent hover:bg-accent/30 disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Add'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className={cn('text-xs text-ink-500 hover:text-ink-300')}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
