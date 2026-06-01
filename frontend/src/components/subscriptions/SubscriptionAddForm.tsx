import { useState } from 'react';
import { type BillingCycle, type PaymentType, type SubscriptionIn } from '@/lib/api';
import { cn } from '@/lib/cn';
import { EmojiPickerPopover } from '@/components/habits/EmojiPickerPopover';
import {
  CATEGORIES,
  CURRENCY_OPTS,
  CYCLE_OPTS,
  PAYMENT_TYPE_OPTS,
} from './subUtils';
import { AccountSelect, ACCOUNT_TO_PAYMENT_TYPE } from './AccountSelect';

type Mode = 'subscription' | 'trial';

type Props = {
  onCreate: (payload: SubscriptionIn) => Promise<void>;
  onCancel?: () => void;
  disabled?: boolean;
};

const today = new Date().toISOString().slice(0, 10);

export function SubscriptionAddForm({ onCreate, onCancel, disabled }: Props) {
  const [mode, setMode] = useState<Mode>('subscription');

  // Shared fields
  const [emoji, setEmoji] = useState('💳');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [paymentType, setPaymentType] = useState<PaymentType | ''>('');
  const [accountName, setAccountName] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [url, setUrl] = useState('');

  // Subscription-mode fields
  const [amount, setAmount] = useState('');
  const [nextDate, setNextDate] = useState(today);

  // Trial-mode fields  (trial_end_date === next_billing_date)
  const [billingStartDate, setBillingStartDate] = useState('');
  const [postTrialAmount, setPostTrialAmount] = useState('');

  const [isAutopay, setIsAutopay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setEmoji('💳'); setName(''); setCurrency('INR'); setCycle('monthly');
    setPaymentType(''); setAccountName(''); setCategory('');
    setNotes(''); setUrl('');
    setAmount(''); setNextDate(today);
    setBillingStartDate(''); setPostTrialAmount('');
    setIsAutopay(false);
    setError(null);
  }

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Name is required.'); return; }

    setSaving(true);
    setError(null);
    try {
      if (mode === 'trial') {
        if (!billingStartDate) { setError('Billing start date is required.'); setSaving(false); return; }
        const pta = postTrialAmount ? parseFloat(postTrialAmount) : null;
        if (pta !== null && (isNaN(pta) || pta < 0)) {
          setError('Enter a valid post-trial price.'); setSaving(false); return;
        }
        await onCreate({
          name: trimmedName, emoji,
          amount: 0,
          currency,
          billing_cycle: cycle,
          next_billing_date: billingStartDate,
          trial_end_date: billingStartDate,
          post_trial_amount: pta,
          payment_type: paymentType || null,
          account_name: accountName.trim() || null,
          category: category.trim() || null,
          notes: notes.trim() || null,
          url: url.trim() || null,
          is_autopay: isAutopay,
        });
      } else {
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) { setError('Enter a valid amount.'); setSaving(false); return; }
        if (!nextDate) { setError('Next billing date is required.'); setSaving(false); return; }
        await onCreate({
          name: trimmedName, emoji,
          amount: parsedAmount,
          currency,
          billing_cycle: cycle,
          next_billing_date: nextDate,
          trial_end_date: null,
          post_trial_amount: null,
          payment_type: paymentType || null,
          account_name: accountName.trim() || null,
          category: category.trim() || null,
          notes: notes.trim() || null,
          url: url.trim() || null,
          is_autopay: isAutopay,
        });
      }
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = !saving && !disabled && !!name.trim() && (
    mode === 'trial' ? !!billingStartDate : (amount !== '' && parseFloat(amount) > 0)
  );

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">

      {/* Mode toggle */}
      <div className="flex rounded-md border border-ink-800 overflow-hidden w-fit text-xs">
        <button
          type="button"
          onClick={() => switchMode('subscription')}
          className={cn(
            'px-3 py-1.5 transition-colors',
            mode === 'subscription'
              ? 'bg-accent/20 text-accent border-r border-ink-800'
              : 'bg-ink-900 text-ink-500 hover:text-ink-300 border-r border-ink-800',
          )}
        >
          Subscription
        </button>
        <button
          type="button"
          onClick={() => switchMode('trial')}
          className={cn(
            'px-3 py-1.5 transition-colors',
            mode === 'trial'
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-ink-900 text-ink-500 hover:text-ink-300',
          )}
        >
          Free / Trial
        </button>
      </div>

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
          className="flex-1 min-w-0 rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 placeholder:text-ink-400"
        />
      </div>

      {/* ── SUBSCRIPTION MODE ── */}
      {mode === 'subscription' && (
        <>
          {/* Amount + currency (row 1) */}
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              min="0.01"
              step="0.01"
              className="flex-1 rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 placeholder:text-ink-400"
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-24 rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 text-ink-200"
            >
              {CURRENCY_OPTS.map((o) => (
                <option key={o.value} value={o.value}>{o.value}</option>
              ))}
            </select>
          </div>
          {/* Billing cycle (row 2) */}
          <select
            value={cycle}
            onChange={(e) => setCycle(e.target.value as BillingCycle)}
            className="w-full rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 text-ink-200"
          >
            {CYCLE_OPTS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Next billing date + category */}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-ink-500 uppercase tracking-wide mb-0.5 block">Next billing</label>
              <input
                type="date"
                value={nextDate}
                onChange={(e) => setNextDate(e.target.value)}
                className="w-full rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 text-ink-200 [color-scheme:dark]"
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
                className="w-full rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 placeholder:text-ink-400"
              />
              <datalist id="sub-categories-add">
                {CATEGORIES.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>
        </>
      )}

      {/* ── FREE TRIAL MODE ── */}
      {mode === 'trial' && (
        <>
          {/* Billing starts on date (= trial_end_date = next_billing_date) + post-trial price */}
          <div className="rounded-md bg-emerald-500/5 border border-emerald-500/20 px-3 py-2.5 space-y-2.5">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-emerald-500/80 uppercase tracking-wide mb-0.5 block">
                  Billing starts on
                </label>
                <input
                  type="date"
                  value={billingStartDate}
                  onChange={(e) => setBillingStartDate(e.target.value)}
                  className="w-full border border-emerald-500/30 rounded-md px-2 py-1.5 text-sm outline-none focus:border-emerald-500/60 text-ink-200 [color-scheme:dark]"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-emerald-500/80 uppercase tracking-wide mb-0.5 block">
                  Price after trial
                </label>
                <input
                  type="number"
                  value={postTrialAmount}
                  onChange={(e) => setPostTrialAmount(e.target.value)}
                  placeholder="e.g. 399"
                  min="0"
                  step="0.01"
                  className="w-full border border-emerald-500/30 rounded-md px-2 py-1.5 text-sm outline-none focus:border-emerald-500/60 placeholder:text-ink-400"
                />
              </div>
            </div>

            {/* Currency + cycle row (stacked to avoid overflow in drawer) */}
            <div className="flex items-center gap-2">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-24 rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 text-ink-200"
              >
                {CURRENCY_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>{o.value}</option>
                ))}
              </select>
              <select
                value={cycle}
                onChange={(e) => setCycle(e.target.value as BillingCycle)}
                className="flex-1 rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 text-ink-200"
              >
                {CYCLE_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {/* Category on its own row */}
            <input
              list="sub-categories-trial"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Category (optional)"
              maxLength={40}
              className="w-full rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 placeholder:text-ink-400"
            />
            <datalist id="sub-categories-trial">
              {CATEGORIES.map((c) => <option key={c} value={c} />)}
            </datalist>

            <p className="text-[10px] text-emerald-600">
              Currently free — tracked in Trial Tracker. Countdown to first charge.
            </p>
          </div>
        </>
      )}

      {/* Account + payment type (shared) */}
      <div className="flex items-center gap-2">
        <AccountSelect
          value={accountName}
          onChange={setAccountName}
          onAccountPicked={(acc) => {
            if (acc) {
              const pt = ACCOUNT_TO_PAYMENT_TYPE[acc.type];
              if (pt) setPaymentType(pt);
            }
          }}
          className="flex-1 rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 text-ink-200 placeholder:text-ink-400"
        />
        <select
          value={paymentType}
          onChange={(e) => setPaymentType(e.target.value as PaymentType | '')}
          className="flex-1 rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 text-ink-200"
        >
          <option value="">Payment type</option>
          {PAYMENT_TYPE_OPTS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* URL + notes (shared) */}
      <div className="space-y-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="URL (optional)"
          type="url"
          className="w-full rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 placeholder:text-ink-400"
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          maxLength={500}
          className="w-full rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 placeholder:text-ink-400 resize-none"
        />
      </div>

      {/* Autopay toggle */}
      <button
        type="button"
        onClick={() => setIsAutopay((v) => !v)}
        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md border transition-colors"
        style={{
          background: isAutopay ? 'rgba(139,124,255,0.08)' : 'transparent',
          borderColor: isAutopay ? 'rgba(139,124,255,0.35)' : 'var(--border-default)',
        }}
      >
        {/* pill toggle */}
        <span
          style={{
            width: 32, height: 18, borderRadius: 999, flexShrink: 0,
            background: isAutopay ? 'var(--primary-500)' : 'var(--surface-hover)',
            position: 'relative', transition: 'background 180ms',
          }}
        >
          <span style={{
            position: 'absolute', top: 2, left: isAutopay ? 16 : 2,
            width: 14, height: 14, borderRadius: 999,
            background: 'white', transition: 'left 180ms',
          }} />
        </span>
        <span style={{ fontSize: 12, fontWeight: 500, color: isAutopay ? 'var(--primary-300)' : 'var(--fg-4)' }}>
          {isAutopay ? '⚡ Autopay — card charged automatically' : 'Manual — I pay this myself each cycle'}
        </span>
      </button>

      {error && <div className="text-[11px] text-red-400">{error}</div>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
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
