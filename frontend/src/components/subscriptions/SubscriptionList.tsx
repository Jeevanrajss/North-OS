import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, Check, ChevronDown, Pause, Pencil, Play, Plus, Trash2, X, ExternalLink } from 'lucide-react';
import {
  api,
  CYCLE_LABELS,
  type BillingCycle,
  type PaymentType,
  type Subscription,
  type SubscriptionIn,
  type SubscriptionPatch,
} from '@/lib/api';
import { cn } from '@/lib/cn';
import { EmojiPickerPopover } from '@/components/habits/EmojiPickerPopover';
import { SubscriptionAddForm } from './SubscriptionAddForm';
import {
  ACCOUNT_SUGGESTIONS,
  CATEGORIES,
  CURRENCY_OPTS,
  CYCLE_OPTS,
  PAYMENT_TYPE_LABELS,
  PAYMENT_TYPE_OPTS,
  describeDaysUntil,
  daysUntil,
  formatAmount,
  urgencyClass,
} from './subUtils';

type Filter = 'active' | 'paused' | 'cancelled' | 'all';

export function SubscriptionList() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('active');
  const [addOpen, setAddOpen] = useState(false);

  const { data: allSubs = [], isLoading } = useQuery<Subscription[]>({
    queryKey: ['subscriptions', 'all'],
    queryFn: () => api.subscriptions.list(true),
    staleTime: 1000 * 30,
  });

  const subs = useMemo(() => {
    if (filter === 'active') return allSubs.filter((s) => s.cancelled_at === null && s.paused_at === null);
    if (filter === 'paused') return allSubs.filter((s) => s.cancelled_at === null && s.paused_at !== null);
    if (filter === 'cancelled') return allSubs.filter((s) => s.cancelled_at !== null);
    return allSubs;
  }, [allSubs, filter]);

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ['subscriptions'] });
    qc.invalidateQueries({ queryKey: ['subscription-stats'] });
  }

  const createMut = useMutation({
    mutationFn: (payload: SubscriptionIn) => api.subscriptions.create(payload),
    onSuccess: () => invalidateAll(),
  });

  const patchMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SubscriptionPatch }) =>
      api.subscriptions.patch(id, patch),
    onSuccess: () => invalidateAll(),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => api.subscriptions.cancel(id),
    onSuccess: () => invalidateAll(),
  });

  const restoreMut = useMutation({
    mutationFn: (id: string) => api.subscriptions.restore(id),
    onSuccess: () => invalidateAll(),
  });

  const pauseMut = useMutation({
    mutationFn: (id: string) => api.subscriptions.pause(id),
    onSuccess: () => invalidateAll(),
  });

  const unpauseMut = useMutation({
    mutationFn: (id: string) => api.subscriptions.unpause(id),
    onSuccess: () => invalidateAll(),
  });

  const activeCount = allSubs.filter((s) => s.cancelled_at === null && s.paused_at === null).length;
  const pausedCount = allSubs.filter((s) => s.cancelled_at === null && s.paused_at !== null).length;
  const cancelledCount = allSubs.filter((s) => s.cancelled_at !== null).length;

  return (
    <div className="card">
      {/* Card header */}
      <div className="flex items-center justify-between mb-3">
        <div className="card-title mb-0">Subscriptions</div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              className="appearance-none bg-ink-900 border border-ink-800 rounded-md pl-2 pr-6 py-1 text-xs text-ink-300 outline-none focus:border-accent/60 cursor-pointer"
            >
              <option value="active">Active{activeCount > 0 ? ` (${activeCount})` : ''}</option>
              <option value="paused">Paused{pausedCount > 0 ? ` (${pausedCount})` : ''}</option>
              <option value="cancelled">Cancelled{cancelledCount > 0 ? ` (${cancelledCount})` : ''}</option>
              <option value="all">All ({allSubs.length})</option>
            </select>
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-500 pointer-events-none" />
          </div>

          <button
            type="button"
            onClick={() => setAddOpen((o) => !o)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-accent/15 border border-accent/30 text-xs text-accent hover:bg-accent/25 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>
      </div>

      {addOpen && (
        <div className="mb-3 pb-3 border-b border-ink-800">
          <SubscriptionAddForm
            onCreate={async (payload) => {
              await createMut.mutateAsync(payload);
              setAddOpen(false);
            }}
            onCancel={() => setAddOpen(false)}
          />
        </div>
      )}

      {isLoading ? (
        <div className="text-xs text-ink-500 py-6 text-center">Loading…</div>
      ) : subs.length === 0 ? (
        <div className="text-xs text-ink-500 py-6 text-center">
          {filter === 'active' && 'No active subscriptions.'}
          {filter === 'paused' && 'No paused subscriptions.'}
          {filter === 'cancelled' && 'No cancelled subscriptions.'}
          {filter === 'all' && 'No subscriptions yet.'}
        </div>
      ) : (
        <ul className="space-y-0.5">
          {subs.map((s) =>
            s.cancelled_at !== null ? (
              <CancelledRow
                key={s.id}
                sub={s}
                onRestore={() => restoreMut.mutateAsync(s.id).then(() => undefined)}
              />
            ) : (
              <SubscriptionRow
                key={s.id}
                sub={s}
                onSave={(patch) => patchMut.mutateAsync({ id: s.id, patch })}
                onPause={() => pauseMut.mutateAsync(s.id).then(() => undefined)}
                onResume={() => unpauseMut.mutateAsync(s.id).then(() => undefined)}
                onCancel={() => cancelMut.mutateAsync(s.id).then(() => undefined)}
              />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active / paused subscription row
// ---------------------------------------------------------------------------
type RowProps = {
  sub: Subscription;
  onSave: (patch: SubscriptionPatch) => Promise<Subscription>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onCancel: () => Promise<void>;
};

function SubscriptionRow({ sub, onSave, onPause, onResume, onCancel }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [emoji, setEmoji] = useState(sub.emoji);
  const [name, setName] = useState(sub.name);
  const [amount, setAmount] = useState(String(sub.amount));
  const [currency, setCurrency] = useState(sub.currency);
  const [cycle, setCycle] = useState<BillingCycle>(sub.billing_cycle);
  const [nextDate, setNextDate] = useState(sub.next_billing_date);
  const [trialEndDate, setTrialEndDate] = useState(sub.trial_end_date ?? '');
  const [postTrialAmount, setPostTrialAmount] = useState(
    sub.post_trial_amount != null ? String(sub.post_trial_amount) : '',
  );
  const [paymentType, setPaymentType] = useState<PaymentType | ''>(sub.payment_type ?? '');
  const [accountName, setAccountName] = useState(sub.account_name ?? '');
  const [category, setCategory] = useState(sub.category ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const isPaused = sub.paused_at !== null;
  const days = daysUntil(sub.next_billing_date);

  function beginEdit() {
    setEmoji(sub.emoji); setName(sub.name); setAmount(String(sub.amount));
    setCurrency(sub.currency); setCycle(sub.billing_cycle); setNextDate(sub.next_billing_date);
    setTrialEndDate(sub.trial_end_date ?? '');
    setPostTrialAmount(sub.post_trial_amount != null ? String(sub.post_trial_amount) : '');
    setPaymentType(sub.payment_type ?? ''); setAccountName(sub.account_name ?? '');
    setCategory(sub.category ?? ''); setError(null); setEditing(true);
  }

  async function save() {
    const trimmed = name.trim();
    const parsedAmount = parseFloat(amount);
    const parsedPTA = postTrialAmount ? parseFloat(postTrialAmount) : null;
    if (!trimmed) return;
    if (isNaN(parsedAmount) || parsedAmount < 0) { setError('Enter a valid amount (0 for free).'); return; }
    if (parsedPTA !== null && (isNaN(parsedPTA) || parsedPTA < 0)) {
      setError('Enter a valid post-trial price.'); return;
    }

    const patch: SubscriptionPatch = {};
    if (trimmed !== sub.name) patch.name = trimmed;
    if (emoji !== sub.emoji) patch.emoji = emoji;
    if (parsedAmount !== sub.amount) patch.amount = parsedAmount;
    if (currency !== sub.currency) patch.currency = currency;
    if (cycle !== sub.billing_cycle) patch.billing_cycle = cycle;
    if (nextDate !== sub.next_billing_date) patch.next_billing_date = nextDate;
    const ted = trialEndDate || null;
    if (ted !== sub.trial_end_date) patch.trial_end_date = ted;
    if (parsedPTA !== sub.post_trial_amount) patch.post_trial_amount = parsedPTA;
    const pt = paymentType || null;
    if (pt !== sub.payment_type) patch.payment_type = pt;
    const an = accountName.trim() || null;
    if (an !== sub.account_name) patch.account_name = an;
    const cat = category.trim() || null;
    if (cat !== sub.category) patch.category = cat;

    if (Object.keys(patch).length === 0) { setEditing(false); return; }

    setSaving(true); setError(null);
    try {
      await onSave(patch);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <li className="rounded-md bg-ink-950 border border-ink-800 px-2 py-2 space-y-2">
        <div className="flex items-center gap-2">
          <EmojiPickerPopover value={emoji} onChange={setEmoji} size="sm" />
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80}
            className="flex-1 min-w-0 bg-ink-900 border border-ink-800 rounded-md px-2 py-1 text-sm outline-none focus:border-accent/60" />
          <button type="button" onClick={() => void save()} disabled={saving || !name.trim()}
            className="p-1.5 rounded-md bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30 disabled:opacity-40">
            <Check className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => setEditing(false)}
            className="p-1.5 rounded-md border border-ink-800 bg-ink-900 text-ink-400 hover:text-ink-200">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min="0" step="0.01"
            className="w-20 bg-ink-900 border border-ink-800 rounded-md px-2 py-1 text-sm outline-none focus:border-accent/60" />
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}
            className="w-20 bg-ink-900 border border-ink-800 rounded-md px-2 py-1 text-sm outline-none focus:border-accent/60 text-ink-200">
            {CURRENCY_OPTS.map((o) => <option key={o.value} value={o.value}>{o.value}</option>)}
          </select>
          <select value={cycle} onChange={(e) => setCycle(e.target.value as BillingCycle)}
            className="flex-1 bg-ink-900 border border-ink-800 rounded-md px-2 py-1 text-sm outline-none focus:border-accent/60 text-ink-200">
            {CYCLE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType | '')}
            className="flex-1 bg-ink-900 border border-ink-800 rounded-md px-2 py-1 text-sm outline-none focus:border-accent/60 text-ink-200">
            <option value="">Payment type</option>
            {PAYMENT_TYPE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input list="account-suggestions-edit" value={accountName} onChange={(e) => setAccountName(e.target.value)}
            placeholder="Account (e.g. HDFC)" maxLength={60}
            className="flex-1 bg-ink-900 border border-ink-800 rounded-md px-2 py-1 text-sm outline-none focus:border-accent/60 placeholder:text-ink-600" />
          <datalist id="account-suggestions-edit">
            {ACCOUNT_SUGGESTIONS.map((a) => <option key={a} value={a} />)}
          </datalist>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)}
            className="flex-1 bg-ink-900 border border-ink-800 rounded-md px-2 py-1 text-sm outline-none focus:border-accent/60 text-ink-200 [color-scheme:dark]" />
          <input list="sub-categories-edit" value={category} onChange={(e) => setCategory(e.target.value)}
            placeholder="Category" maxLength={40}
            className="flex-1 bg-ink-900 border border-ink-800 rounded-md px-2 py-1 text-sm outline-none focus:border-accent/60 placeholder:text-ink-600" />
          <datalist id="sub-categories-edit">
            {CATEGORIES.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-ink-600 shrink-0 w-16">Trial end:</label>
          <input type="date" value={trialEndDate} onChange={(e) => setTrialEndDate(e.target.value)}
            className="flex-1 bg-ink-900 border border-ink-800 rounded-md px-2 py-1 text-sm outline-none focus:border-accent/60 text-ink-200 [color-scheme:dark]" />
          {trialEndDate && (
            <>
              <label className="text-[10px] text-ink-600 shrink-0">Then:</label>
              <input type="number" value={postTrialAmount} onChange={(e) => setPostTrialAmount(e.target.value)}
                placeholder="price after" min="0" step="0.01"
                className="w-24 bg-ink-900 border border-ink-800 rounded-md px-2 py-1 text-sm outline-none focus:border-accent/60 placeholder:text-ink-700" />
            </>
          )}
        </div>
        {error && <div className="text-[11px] text-red-400 pl-1">{error}</div>}
      </li>
    );
  }

  return (
    <li className={cn(
      'group flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-ink-950',
      isPaused && 'opacity-60',
    )}>
      <span className="w-6 text-center text-base leading-none shrink-0">{sub.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-ink-100 truncate">{sub.name}</span>
          {sub.amount === 0 && (
            <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
              FREE
            </span>
          )}
          {isPaused && (
            <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25">
              Paused
            </span>
          )}
          {sub.url && (
            <a href={sub.url} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()} className="text-ink-600 hover:text-accent shrink-0">
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
        <div className="text-[10px] text-ink-500 truncate">
          {sub.payment_type && (
            <span className="mr-1.5">
              {PAYMENT_TYPE_LABELS[sub.payment_type]}
              {sub.account_name && ` · ${sub.account_name}`}
            </span>
          )}
          {!sub.payment_type && sub.account_name && <span className="mr-1.5">{sub.account_name}</span>}
          {sub.category && <span className="mr-1.5 text-ink-600">{sub.category}</span>}
          {sub.amount === 0
            ? (sub.post_trial_amount
                ? <span>Free → {formatAmount(sub.post_trial_amount, sub.currency)} {CYCLE_LABELS[sub.billing_cycle]}</span>
                : <span>Free</span>)
            : <>{formatAmount(sub.amount, sub.currency)} {CYCLE_LABELS[sub.billing_cycle]}</>
          }
        </div>
      </div>
      {!isPaused && (
        <div className="text-right shrink-0">
          <div className={cn('text-[11px] font-medium tabular-nums', urgencyClass(days))}>
            {describeDaysUntil(days)}
          </div>
          <div className="text-[10px] text-ink-600">{sub.next_billing_date}</div>
        </div>
      )}
      <div className={cn(
        'flex items-center gap-0.5 transition-opacity',
        confirmCancel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
      )}>
        {confirmCancel ? (
          <>
            <button type="button" onClick={() => void onCancel()}
              className="px-1.5 py-0.5 rounded-md bg-red-500/20 border border-red-500/40 text-[10px] text-red-300 hover:bg-red-500/30">
              Cancel?
            </button>
            <button type="button" onClick={() => setConfirmCancel(false)}
              className="p-1 rounded-md border border-ink-800 bg-ink-900 text-ink-400 hover:text-ink-200">
              <X className="w-3 h-3" />
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={beginEdit} aria-label={`Edit ${sub.name}`}
              className="p-1 rounded-md border border-transparent text-ink-500 hover:text-ink-200 hover:border-ink-800">
              <Pencil className="w-3 h-3" />
            </button>
            {isPaused ? (
              <button type="button" onClick={() => void onResume()} aria-label={`Resume ${sub.name}`}
                title="Resume billing"
                className="p-1 rounded-md border border-transparent text-amber-500 hover:text-amber-300 hover:border-ink-800">
                <Play className="w-3 h-3" />
              </button>
            ) : (
              <button type="button" onClick={() => void onPause()} aria-label={`Pause ${sub.name}`}
                title="Pause billing"
                className="p-1 rounded-md border border-transparent text-ink-500 hover:text-amber-400 hover:border-ink-800">
                <Pause className="w-3 h-3" />
              </button>
            )}
            <button type="button" onClick={() => setConfirmCancel(true)} aria-label={`Cancel ${sub.name}`}
              className="p-1 rounded-md border border-transparent text-ink-500 hover:text-red-300 hover:border-ink-800">
              <Trash2 className="w-3 h-3" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Cancelled subscription row
// ---------------------------------------------------------------------------
function CancelledRow({ sub, onRestore }: { sub: Subscription; onRestore: () => Promise<void> }) {
  const [restoring, setRestoring] = useState(false);

  async function doRestore() {
    setRestoring(true);
    try { await onRestore(); } finally { setRestoring(false); }
  }

  return (
    <li className="flex items-center gap-2 rounded-md px-1.5 py-1.5 opacity-50 hover:opacity-75 transition-opacity">
      <span className="w-6 text-center text-base leading-none grayscale">{sub.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink-400 truncate line-through">{sub.name}</div>
        <div className="text-[10px] text-ink-600">
          cancelled {sub.cancelled_at?.slice(0, 10)} ·{' '}
          {formatAmount(sub.amount, sub.currency)} {CYCLE_LABELS[sub.billing_cycle]}
        </div>
      </div>
      <button type="button" onClick={() => void doRestore()} disabled={restoring}
        aria-label={`Restore ${sub.name}`} title="Restore"
        className="p-1 rounded-md border border-transparent text-ink-500 hover:text-accent hover:border-ink-800 disabled:opacity-40 transition-colors">
        <ArchiveRestore className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}
