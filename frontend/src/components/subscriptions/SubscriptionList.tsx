import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, Check, LayoutGrid, List, Pause, Pencil, Play, Trash2, X, ExternalLink } from 'lucide-react';
import { RightDrawer } from '@/components/ui/RightDrawer';
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
import { AccountSelect, ACCOUNT_TO_PAYMENT_TYPE } from './AccountSelect';
import {
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

/** Brand gradient for the top accent bar (3px) */
function getSubAccentGrad(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('netflix'))              return 'linear-gradient(90deg, #E50914, #FF5B6E)';
  if (n.includes('claude') || n.includes('anthropic')) return 'linear-gradient(90deg, #D4756E, #FFA0A0)';
  if (n.includes('spotify'))              return 'linear-gradient(90deg, #1DB954, #3DFF98)';
  if (n.includes('apple') || n.includes('icloud')) return 'linear-gradient(90deg, #3EBEFF, #7FDBFF)';
  if (n.includes('cursor'))               return 'linear-gradient(90deg, #8B7CFF, #B8A5FF)';
  if (n.includes('gym') || n.includes('fitness'))   return 'linear-gradient(90deg, #FFB86B, #FFD76A)';
  if (n.includes('youtube'))              return 'linear-gradient(90deg, #FF0000, #FF7070)';
  if (n.includes('openai') || n.includes('chatgpt')) return 'linear-gradient(90deg, #10a37f, #3DFF98)';
  if (n.includes('notion'))               return 'linear-gradient(90deg, #ffffff, #cccccc)';
  if (n.includes('figma'))                return 'linear-gradient(90deg, #F24E1E, #FF7262)';
  if (n.includes('github'))               return 'linear-gradient(90deg, #6e5494, #8B7CFF)';
  if (n.includes('amazon') || n.includes('prime')) return 'linear-gradient(90deg, #FF9900, #FFD76A)';
  return 'linear-gradient(90deg, var(--primary-500), var(--secondary-500))';
}

/** Brand gradient for the logo box (44×44) */
function getSubLogoGrad(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('netflix'))              return 'linear-gradient(135deg, #E50914, #831010)';
  if (n.includes('claude') || n.includes('anthropic')) return 'linear-gradient(135deg, #FFA0A0, #D4756E)';
  if (n.includes('spotify'))              return 'linear-gradient(135deg, #1DB954, #15803D)';
  if (n.includes('apple') || n.includes('icloud')) return 'linear-gradient(135deg, #3EBEFF, #0F7AB8)';
  if (n.includes('cursor'))               return 'linear-gradient(135deg, #232734, #0E1018)';
  if (n.includes('gym') || n.includes('fitness'))   return 'linear-gradient(135deg, #FFB86B, #B56A00)';
  if (n.includes('youtube'))              return 'linear-gradient(135deg, #FF0000, #8B0000)';
  if (n.includes('openai') || n.includes('chatgpt')) return 'linear-gradient(135deg, #10a37f, #065F46)';
  if (n.includes('notion'))               return 'linear-gradient(135deg, #2d2d2d, #1a1a1a)';
  if (n.includes('figma'))                return 'linear-gradient(135deg, #F24E1E, #A52A00)';
  if (n.includes('github'))               return 'linear-gradient(135deg, #6e5494, #3d2b6e)';
  if (n.includes('amazon') || n.includes('prime')) return 'linear-gradient(135deg, #FF9900, #B36B00)';
  return 'linear-gradient(135deg, var(--primary-500), #6352DB)';
}

type SubscriptionListProps = {
  /** Controlled from parent (Subscriptions.tsx) so the Add button can live in PageHeader */
  addOpen?: boolean;
  setAddOpen?: (open: boolean) => void;
};

export function SubscriptionList({ addOpen: extAddOpen, setAddOpen: extSetAddOpen }: SubscriptionListProps = {}) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('active');
  const [internalAddOpen, setInternalAddOpen] = useState(false);
  const addOpen    = extAddOpen    ?? internalAddOpen;
  const setAddOpen = extSetAddOpen ?? setInternalAddOpen;
  const [view, setView] = useState<'grid' | 'list'>('grid');

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

  const renewMut = useMutation({
    mutationFn: (id: string) => api.subscriptions.renew(id),
    onSuccess: () => {
      invalidateAll();
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const activeCount = allSubs.filter((s) => s.cancelled_at === null && s.paused_at === null).length;
  const pausedCount = allSubs.filter((s) => s.cancelled_at === null && s.paused_at !== null).length;
  const cancelledCount = allSubs.filter((s) => s.cancelled_at !== null).length;

  return (
    <div>
      {/* Right-side drawer for adding a new subscription */}
      <RightDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="New Subscription"
        width={500}
      >
        <SubscriptionAddForm
          onCreate={async (payload) => {
            await createMut.mutateAsync(payload);
            setAddOpen(false);
          }}
          onCancel={() => setAddOpen(false)}
        />
      </RightDrawer>

      {/* Toolbar: filter seg + view toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        {/* Filter segmented control */}
        <div style={{ display: 'inline-flex', background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 10, padding: 3, marginRight: 'auto' }}>
          {(['active', 'paused', 'cancelled', 'all'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                height: 28, padding: '0 12px', borderRadius: 8,
                font: '500 12px/1 var(--font-sans)',
                color: filter === f ? 'var(--fg-1)' : 'var(--fg-3)',
                background: filter === f ? 'var(--surface-elev)' : 'transparent',
                border: 0, cursor: 'pointer',
                transition: 'var(--transition)',
              }}
            >
              {f === 'active' ? `Active${activeCount > 0 ? ` (${activeCount})` : ''}`
               : f === 'paused' ? `Paused${pausedCount > 0 ? ` (${pausedCount})` : ''}`
               : f === 'cancelled' ? `Cancelled${cancelledCount > 0 ? ` (${cancelledCount})` : ''}`
               : `All (${allSubs.length})`}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div style={{ display: 'inline-flex', background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 10, padding: 3 }}>
          {(['grid', 'list'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              title={v === 'grid' ? 'Card grid' : 'List view'}
              style={{
                width: 30, height: 28, borderRadius: 8,
                display: 'grid', placeItems: 'center',
                color: view === v ? 'var(--fg-1)' : 'var(--fg-4)',
                background: view === v ? 'var(--surface-elev)' : 'transparent',
                border: 0, cursor: 'pointer',
                transition: 'var(--transition)',
              }}
            >
              {v === 'grid'
                ? <LayoutGrid style={{ width: 14, height: 14 }} />
                : <List style={{ width: 14, height: 14 }} />
              }
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--fg-4)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>Loading…</div>
      ) : subs.length === 0 ? (
        <div style={{ color: 'var(--fg-4)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
          {filter === 'active' ? 'No active subscriptions — add one above.' :
           filter === 'paused' ? 'No paused subscriptions.' :
           filter === 'cancelled' ? 'No cancelled subscriptions.' :
           'No subscriptions yet — add one above.'}
        </div>
      ) : (
        <ul
          style={
            view === 'grid'
              ? { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, margin: 0, padding: 0 }
              : { display: 'flex', flexDirection: 'column', gap: 6, margin: 0, padding: 0 }
          }
        >
          {subs.map((s) =>
            s.cancelled_at !== null ? (
              <CancelledRow
                key={s.id}
                sub={s}
                displayMode={view}
                onRestore={() => restoreMut.mutateAsync(s.id).then(() => undefined)}
              />
            ) : (
              <SubscriptionRow
                key={s.id}
                sub={s}
                displayMode={view}
                onSave={(patch) => patchMut.mutateAsync({ id: s.id, patch })}
                onPause={() => pauseMut.mutateAsync(s.id).then(() => undefined)}
                onResume={() => unpauseMut.mutateAsync(s.id).then(() => undefined)}
                onCancel={() => cancelMut.mutateAsync(s.id).then(() => undefined)}
                onRenew={() => renewMut.mutateAsync(s.id).then(() => undefined)}
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
  displayMode?: 'grid' | 'list';
  onSave: (patch: SubscriptionPatch) => Promise<Subscription>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onCancel: () => Promise<void>;
  onRenew: () => Promise<void>;
};

function SubscriptionRow({ sub, displayMode = 'grid', onSave, onPause, onResume, onCancel, onRenew }: RowProps) {
  const isTrial = sub.amount === 0 && sub.trial_end_date !== null;

  const [editing, setEditing] = useState(false);
  const [editMode, setEditMode] = useState<'subscription' | 'trial'>(isTrial ? 'trial' : 'subscription');

  // Shared edit fields
  const [emoji, setEmoji] = useState(sub.emoji);
  const [name, setName] = useState(sub.name);
  const [currency, setCurrency] = useState(sub.currency);
  const [cycle, setCycle] = useState<BillingCycle>(sub.billing_cycle);
  const [paymentType, setPaymentType] = useState<PaymentType | ''>(sub.payment_type ?? '');
  const [accountName, setAccountName] = useState(sub.account_name ?? '');
  const [category, setCategory] = useState(sub.category ?? '');

  // Subscription-mode fields
  const [amount, setAmount] = useState(String(sub.amount));
  const [nextDate, setNextDate] = useState(sub.next_billing_date);

  // Trial-mode fields
  const [billingStartDate, setBillingStartDate] = useState(
    sub.trial_end_date ?? sub.next_billing_date,
  );
  const [postTrialAmount, setPostTrialAmount] = useState(
    sub.post_trial_amount != null ? String(sub.post_trial_amount) : '',
  );
  const [isAutopay, setIsAutopay] = useState(sub.is_autopay ?? false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const isPaused = sub.paused_at !== null;
  const days = daysUntil(sub.next_billing_date);

  // Renewal status for non-autopay subs
  const [renewing, setRenewing] = useState(false);
  const needsRenewal = !sub.is_autopay && !isPaused && days <= 3;
  const isOverdue = days < 0;

  async function handleRenew() {
    setRenewing(true);
    try { await onRenew(); } finally { setRenewing(false); }
  }

  function beginEdit() {
    const trialMode = sub.amount === 0 && sub.trial_end_date !== null;
    setEditMode(trialMode ? 'trial' : 'subscription');
    setEmoji(sub.emoji); setName(sub.name);
    setCurrency(sub.currency); setCycle(sub.billing_cycle);
    setPaymentType(sub.payment_type ?? ''); setAccountName(sub.account_name ?? '');
    setCategory(sub.category ?? '');
    setAmount(String(sub.amount)); setNextDate(sub.next_billing_date);
    setBillingStartDate(sub.trial_end_date ?? sub.next_billing_date);
    setPostTrialAmount(sub.post_trial_amount != null ? String(sub.post_trial_amount) : '');
    setIsAutopay(sub.is_autopay ?? false);
    setError(null); setEditing(true);
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) { setError('Name is required.'); return; }

    const patch: SubscriptionPatch = {};
    if (trimmed !== sub.name) patch.name = trimmed;
    if (emoji !== sub.emoji) patch.emoji = emoji;
    if (currency !== sub.currency) patch.currency = currency;
    if (cycle !== sub.billing_cycle) patch.billing_cycle = cycle;
    const pt = paymentType || null;
    if (pt !== sub.payment_type) patch.payment_type = pt;
    const an = accountName.trim() || null;
    if (an !== sub.account_name) patch.account_name = an;
    const cat = category.trim() || null;
    if (cat !== sub.category) patch.category = cat;
    if (isAutopay !== sub.is_autopay) patch.is_autopay = isAutopay;

    if (editMode === 'trial') {
      if (!billingStartDate) { setError('Billing start date is required.'); return; }
      const pta = postTrialAmount ? parseFloat(postTrialAmount) : null;
      if (pta !== null && (isNaN(pta) || pta < 0)) { setError('Enter a valid post-trial price.'); return; }
      if (0 !== sub.amount) patch.amount = 0;
      if (billingStartDate !== sub.next_billing_date) patch.next_billing_date = billingStartDate;
      if (billingStartDate !== sub.trial_end_date) patch.trial_end_date = billingStartDate;
      if (pta !== sub.post_trial_amount) patch.post_trial_amount = pta;
    } else {
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) { setError('Enter a valid amount.'); return; }
      if (parsedAmount !== sub.amount) patch.amount = parsedAmount;
      if (nextDate !== sub.next_billing_date) patch.next_billing_date = nextDate;
      if (sub.trial_end_date !== null) patch.trial_end_date = null;
      if (sub.post_trial_amount !== null) patch.post_trial_amount = null;
    }

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

  const L = ({ children }: { children: React.ReactNode }) => (
    <label className="text-[10px] text-ink-500 uppercase tracking-wide mb-0.5 block">{children}</label>
  );

  if (editing) {
    return (
      <li className="rounded-md px-3 py-2.5 space-y-2.5">

        {/* Mode toggle */}
        <div className="flex rounded-md border border-ink-800 overflow-hidden w-fit text-xs">
          <button
            type="button"
            onClick={() => setEditMode('subscription')}
            className={cn(
              'px-3 py-1 transition-colors border-r border-ink-800',
              editMode === 'subscription'
                ? 'bg-accent/20 text-accent'
                : 'bg-ink-900 text-ink-500 hover:text-ink-300',
            )}
          >
            Subscription
          </button>
          <button
            type="button"
            onClick={() => setEditMode('trial')}
            className={cn(
              'px-3 py-1 transition-colors',
              editMode === 'trial'
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-ink-900 text-ink-500 hover:text-ink-300',
            )}
          >
            Free / Trial
          </button>
        </div>

        {/* Name row */}
        <div className="flex items-center gap-2">
          <EmojiPickerPopover value={emoji} onChange={setEmoji} size="sm" />
          <div className="flex-1 min-w-0">
            <L>Name</L>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80}
              className="w-full rounded-md px-2 py-1 text-sm outline-none focus:border-accent/60" />
          </div>
          <div className="flex items-center gap-1 self-end pb-0.5">
            <button type="button" onClick={() => void save()} disabled={saving || !name.trim()}
              className="p-1.5 rounded-md bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30 disabled:opacity-40">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => setEditing(false)}
              className="p-1.5 rounded-md border border-ink-800 bg-ink-900 text-ink-400 hover:text-ink-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── SUBSCRIPTION MODE ── */}
        {editMode === 'subscription' && (
          <>
            <div className="flex items-end gap-2">
              <div>
                <L>Amount</L>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min="0.01" step="0.01"
                  className="w-24 rounded-md px-2 py-1 text-sm outline-none focus:border-accent/60" />
              </div>
              <div>
                <L>Currency</L>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                  className="w-20 rounded-md px-2 py-1 text-sm outline-none focus:border-accent/60 text-ink-200">
                  {CURRENCY_OPTS.map((o) => <option key={o.value} value={o.value}>{o.value}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <L>Billing cycle</L>
                <select value={cycle} onChange={(e) => setCycle(e.target.value as BillingCycle)}
                  className="w-full rounded-md px-2 py-1 text-sm outline-none focus:border-accent/60 text-ink-200">
                  {CYCLE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <L>Next billing</L>
                <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)}
                  className="w-full rounded-md px-2 py-1 text-sm outline-none focus:border-accent/60 text-ink-200 [color-scheme:dark]" />
              </div>
              <div className="flex-1">
                <L>Category</L>
                <input list="sub-categories-edit" value={category} onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Streaming" maxLength={40}
                  className="w-full rounded-md px-2 py-1 text-sm outline-none focus:border-accent/60 placeholder:text-ink-400" />
                <datalist id="sub-categories-edit">
                  {CATEGORIES.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>
          </>
        )}

        {/* ── FREE TRIAL MODE ── */}
        {editMode === 'trial' && (
          <div className="rounded-md bg-emerald-500/5 border border-emerald-500/20 px-3 py-2.5 space-y-2.5">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-emerald-500/80 uppercase tracking-wide mb-0.5 block">Billing starts on</label>
                <input type="date" value={billingStartDate} onChange={(e) => setBillingStartDate(e.target.value)}
                  className="w-full border border-emerald-500/30 rounded-md px-2 py-1 text-sm outline-none focus:border-emerald-500/60 text-ink-200 [color-scheme:dark]" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-emerald-500/80 uppercase tracking-wide mb-0.5 block">Price after trial</label>
                <input type="number" value={postTrialAmount} onChange={(e) => setPostTrialAmount(e.target.value)}
                  placeholder="e.g. 399" min="0" step="0.01"
                  className="w-full border border-emerald-500/30 rounded-md px-2 py-1 text-sm outline-none focus:border-emerald-500/60 placeholder:text-ink-400" />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div>
                <L>Currency</L>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                  className="w-20 rounded-md px-2 py-1 text-sm outline-none focus:border-accent/60 text-ink-200">
                  {CURRENCY_OPTS.map((o) => <option key={o.value} value={o.value}>{o.value}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <L>Billing cycle</L>
                <select value={cycle} onChange={(e) => setCycle(e.target.value as BillingCycle)}
                  className="w-full rounded-md px-2 py-1 text-sm outline-none focus:border-accent/60 text-ink-200">
                  {CYCLE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <L>Category</L>
                <input list="sub-categories-edit-trial" value={category} onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. AI Tools" maxLength={40}
                  className="w-full rounded-md px-2 py-1 text-sm outline-none focus:border-accent/60 placeholder:text-ink-400" />
                <datalist id="sub-categories-edit-trial">
                  {CATEGORIES.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>
          </div>
        )}

        {/* Account + payment type (shared) */}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <L>Account</L>
            <AccountSelect
              value={accountName}
              onChange={setAccountName}
              onAccountPicked={(acc) => {
                if (acc) {
                  const pt = ACCOUNT_TO_PAYMENT_TYPE[acc.type];
                  if (pt) setPaymentType(pt);
                }
              }}
              className="w-full rounded-md px-2 py-1 text-sm outline-none focus:border-accent/60 text-ink-200 placeholder:text-ink-400"
            />
          </div>
          <div className="flex-1">
            <L>Payment type</L>
            <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType | '')}
              className="w-full rounded-md px-2 py-1 text-sm outline-none focus:border-accent/60 text-ink-200">
              <option value="">— none —</option>
              {PAYMENT_TYPE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
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
          <span style={{
            width: 28, height: 16, borderRadius: 999, flexShrink: 0,
            background: isAutopay ? 'var(--primary-500)' : 'var(--surface-hover)',
            position: 'relative', transition: 'background 180ms',
          }}>
            <span style={{
              position: 'absolute', top: 2, left: isAutopay ? 13 : 2,
              width: 12, height: 12, borderRadius: 999,
              background: 'white', transition: 'left 180ms',
            }} />
          </span>
          <span style={{ fontSize: 11, fontWeight: 500, color: isAutopay ? 'var(--primary-300)' : 'var(--fg-4)' }}>
            {isAutopay ? '⚡ Autopay — charged automatically' : 'Manual — I pay this myself each cycle'}
          </span>
        </button>

        {error && <div className="text-[11px] text-red-400">{error}</div>}
      </li>
    );
  }

  const accentGrad = getSubAccentGrad(sub.name);
  const logoGrad   = getSubLogoGrad(sub.name);

  // ── List view row ────────────────────────────────────────────────────────
  if (displayMode === 'list') {
    return (
      <li
        className="group"
        style={{
          display: 'grid',
          gridTemplateColumns: '4px 40px 1fr auto auto auto',
          gap: 0,
          alignItems: 'center',
          background: 'var(--surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 12,
          overflow: 'hidden',
          listStyle: 'none',
          transition: 'var(--transition)',
          opacity: isPaused ? 0.65 : 1,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLLIElement).style.borderColor = 'var(--border-strong)';
          (e.currentTarget as HTMLLIElement).style.background = 'var(--surface-hover)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLLIElement).style.borderColor = 'var(--border-default)';
          (e.currentTarget as HTMLLIElement).style.background = 'var(--surface)';
        }}
      >
        {/* Left accent stripe */}
        <div style={{ width: 4, alignSelf: 'stretch', background: accentGrad }} />

        {/* Logo */}
        <div style={{
          width: 40, height: 40, borderRadius: 10, margin: '10px 0 10px 12px',
          background: logoGrad, flexShrink: 0,
          display: 'grid', placeItems: 'center',
          font: '500 16px/1 var(--font-display)', color: 'white',
        }}>
          {sub.emoji || sub.name.charAt(0).toUpperCase()}
        </div>

        {/* Name + meta */}
        <div style={{ padding: '10px 20px 10px 18px', minWidth: 0 }}>
          <div style={{ font: '500 15.5px/1.2 var(--font-display)', color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sub.name}
          </div>
          <div style={{ color: 'var(--fg-4)', fontSize: 11, marginTop: 1, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>{CYCLE_LABELS[sub.billing_cycle]}</span>
            {sub.account_name && <><span style={{ opacity: 0.5 }}>·</span><span>{sub.account_name}</span></>}
            {sub.category && (
              <span style={{
                padding: '2px 7px', borderRadius: 999,
                font: '500 10px/1 var(--font-mono)',
                background: 'var(--glass-bg)', color: 'var(--fg-3)', border: '1px solid var(--border-default)',
              }}>
                {sub.category}
              </span>
            )}
            {/* Autopay badge */}
            {sub.is_autopay && (
              <span style={{
                padding: '2px 7px', borderRadius: 999,
                font: '500 10px/1 var(--font-mono)',
                background: 'rgba(139,124,255,0.12)', color: 'var(--primary-300)',
                border: '1px solid rgba(139,124,255,0.25)',
              }}>
                ⚡ Autopay
              </span>
            )}
          </div>
        </div>

        {/* Next billing */}
        {!isPaused && (
          <div style={{ padding: '0 14px', textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: days <= 7 ? 'var(--accent-yellow)' : 'var(--fg-2)', fontFamily: 'var(--font-mono)' }}>
              {isOverdue ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days}d`}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--fg-4)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
              {sub.next_billing_date}
            </div>
          </div>
        )}
        {isPaused && (
          <div style={{ padding: '0 14px' }}>
            <span style={{
              padding: '3px 8px', borderRadius: 999,
              font: '500 10px/1 var(--font-mono)',
              background: 'var(--glass-bg)', color: 'var(--fg-4)', border: '1px solid var(--border-default)',
            }}>paused</span>
          </div>
        )}

        {/* Price */}
        <div style={{ padding: '0 14px', textAlign: 'right', flexShrink: 0 }}>
          <span style={{ font: '500 18px/1 var(--font-display)', letterSpacing: '-0.02em', color: 'var(--fg-1)' }}>
            {sub.amount === 0
              ? (sub.post_trial_amount ? formatAmount(sub.post_trial_amount, sub.currency) : 'Free')
              : formatAmount(sub.amount, sub.currency)}
          </span>
          <span style={{ color: 'var(--fg-4)', fontSize: 11, marginLeft: 3 }}>
            {sub.billing_cycle === 'monthly' ? '/mo' : sub.billing_cycle === 'yearly' ? '/yr' : ''}
          </span>
        </div>

        {/* Actions (visible on hover) */}
        <div
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 12px 0 4px' }}
        >
          {/* Mark Renewed — only for non-autopay subs due soon */}
          {needsRenewal && (
            <button
              type="button"
              onClick={() => void handleRenew()}
              disabled={renewing}
              title="Mark as renewed/paid"
              style={{
                padding: '3px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                background: isOverdue ? 'rgba(255,91,110,0.12)' : 'rgba(61,255,152,0.10)',
                border: isOverdue ? '1px solid rgba(255,91,110,0.30)' : '1px solid rgba(61,255,152,0.25)',
                color: isOverdue ? 'var(--accent-red)' : 'var(--accent-green)',
                opacity: renewing ? 0.5 : 1,
              }}
            >
              {renewing ? '…' : isOverdue ? 'Overdue — Paid?' : '✓ Mark Paid'}
            </button>
          )}
          <button type="button" onClick={beginEdit} title="Edit"
            style={{ padding: 5, borderRadius: 8, color: 'var(--fg-4)', background: 'transparent', border: '1px solid transparent', cursor: 'pointer' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-elev)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-2)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)'; }}
          >
            <Pencil style={{ width: 12, height: 12 }} />
          </button>
          {isPaused ? (
            <button type="button" onClick={() => void onResume()} title="Resume"
              style={{ padding: 5, borderRadius: 8, color: 'var(--accent-green)', background: 'transparent', border: '1px solid transparent', cursor: 'pointer' }}>
              <Play style={{ width: 12, height: 12 }} />
            </button>
          ) : (
            <button type="button" onClick={() => void onPause()} title="Pause"
              style={{ padding: 5, borderRadius: 8, color: 'var(--fg-4)', background: 'transparent', border: '1px solid transparent', cursor: 'pointer' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-yellow)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)'; }}
            >
              <Pause style={{ width: 12, height: 12 }} />
            </button>
          )}
          {confirmCancel ? (
            <>
              <button type="button" onClick={() => void onCancel()}
                style={{ padding: '3px 7px', borderRadius: 8, fontSize: 10, background: 'rgba(255,91,110,0.12)', border: '1px solid rgba(255,91,110,0.30)', color: 'var(--accent-red)', cursor: 'pointer' }}>
                Confirm
              </button>
              <button type="button" onClick={() => setConfirmCancel(false)}
                style={{ padding: 5, borderRadius: 8, color: 'var(--fg-4)', background: 'transparent', border: '1px solid transparent', cursor: 'pointer' }}>
                <X style={{ width: 11, height: 11 }} />
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmCancel(true)} title="Cancel subscription"
              style={{ padding: 5, borderRadius: 8, color: 'var(--fg-4)', background: 'transparent', border: '1px solid transparent', cursor: 'pointer' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-red)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)'; }}
            >
              <Trash2 style={{ width: 12, height: 12 }} />
            </button>
          )}
        </div>
      </li>
    );
  }

  // ── Card (grid) view ─────────────────────────────────────────────────────
  return (
    <li
      className="group"
      style={{
        position: 'relative',
        background: 'var(--surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 18,
        padding: 20,
        overflow: 'hidden',
        listStyle: 'none',
        transition: 'var(--transition)',
        opacity: isPaused ? 0.7 : 1,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLLIElement).style.borderColor = 'var(--border-strong)';
        (e.currentTarget as HTMLLIElement).style.transform = 'translateY(-2px)';
        (e.currentTarget as HTMLLIElement).style.boxShadow = 'var(--elev-2)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLLIElement).style.borderColor = 'var(--border-default)';
        (e.currentTarget as HTMLLIElement).style.transform = '';
        (e.currentTarget as HTMLLIElement).style.boxShadow = '';
      }}
    >
      {/* Top accent bar */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, background: accentGrad }} />

      {/* Header: logo + name + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, marginTop: 4 }}>
        {/* Logo */}
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: logoGrad,
          display: 'grid', placeItems: 'center',
          font: '500 18px/1 var(--font-display)', color: 'white',
        }}>
          {sub.emoji || sub.name.charAt(0).toUpperCase()}
        </div>

        {/* Name stack */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '500 16px/1.2 var(--font-display)', letterSpacing: '-0.005em', color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sub.name}
          </div>
          <div style={{ color: 'var(--fg-4)', fontSize: 11.5, marginTop: 3, fontFamily: 'var(--font-mono)' }}>
            {CYCLE_LABELS[sub.billing_cycle]}
            {sub.account_name ? ` · ${sub.account_name}` : ''}
          </div>
        </div>

        {/* More / actions */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ display: 'flex', gap: 2 }}>
          <button type="button" onClick={beginEdit}
            style={{ padding: 4, borderRadius: 8, color: 'var(--fg-4)', background: 'transparent', border: '1px solid transparent', cursor: 'pointer' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-2)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)'; }}
          >
            <Pencil style={{ width: 13, height: 13 }} />
          </button>
          {isPaused ? (
            <button type="button" onClick={() => void onResume()} title="Resume billing"
              style={{ padding: 4, borderRadius: 8, color: 'var(--accent-yellow)', background: 'transparent', border: '1px solid transparent', cursor: 'pointer' }}>
              <Play style={{ width: 13, height: 13 }} />
            </button>
          ) : (
            <button type="button" onClick={() => void onPause()} title="Pause billing"
              style={{ padding: 4, borderRadius: 8, color: 'var(--fg-4)', background: 'transparent', border: '1px solid transparent', cursor: 'pointer' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-yellow)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)'; }}
            >
              <Pause style={{ width: 13, height: 13 }} />
            </button>
          )}
          {confirmCancel ? (
            <>
              <button type="button" onClick={() => void onCancel()}
                style={{ padding: '3px 8px', borderRadius: 8, fontSize: 10.5, background: 'rgba(255,91,110,0.12)', border: '1px solid rgba(255,91,110,0.30)', color: 'var(--accent-red)', cursor: 'pointer' }}>
                Cancel?
              </button>
              <button type="button" onClick={() => setConfirmCancel(false)}
                style={{ padding: 4, borderRadius: 8, color: 'var(--fg-4)', background: 'transparent', border: '1px solid var(--border-default)', cursor: 'pointer' }}>
                <X style={{ width: 12, height: 12 }} />
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmCancel(true)}
              style={{ padding: 4, borderRadius: 8, color: 'var(--fg-4)', background: 'transparent', border: '1px solid transparent', cursor: 'pointer' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-red)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)'; }}
            >
              <Trash2 style={{ width: 13, height: 13 }} />
            </button>
          )}
        </div>
      </div>

      {/* Price */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ font: '500 30px/1 var(--font-display)', letterSpacing: '-0.02em', color: 'var(--fg-1)' }}>
            {sub.amount === 0
              ? (sub.post_trial_amount ? formatAmount(sub.post_trial_amount, sub.currency) : 'Free')
              : formatAmount(sub.amount, sub.currency)}
          </span>
          <span style={{ color: 'var(--fg-3)', fontSize: 13 }}>
            {sub.billing_cycle === 'monthly' ? '/mo' : sub.billing_cycle === 'yearly' ? '/yr' : ''}
          </span>
        </div>
        {sub.billing_cycle === 'monthly' && sub.amount > 0 && (
          <div style={{ color: 'var(--fg-4)', fontSize: 11, marginTop: 3, fontFamily: 'var(--font-mono)' }}>
            {formatAmount(sub.amount * 12, sub.currency)} / yr
          </div>
        )}
      </div>

      {/* Next billing */}
      {!isPaused && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center',
          padding: 12, borderRadius: 12,
          background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)',
          marginBottom: 12,
        }}>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--surface-elev)', display: 'grid', placeItems: 'center', color: 'var(--fg-3)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--fg-1)' }}>
              {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days} days`}
            </div>
            <div style={{ color: 'var(--fg-4)', fontSize: 11, fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {sub.next_billing_date}
            </div>
          </div>
          <span style={{
            padding: '4px 9px', borderRadius: 999,
            font: '500 10.5px/1 var(--font-mono)', letterSpacing: '0.06em',
            ...(days <= 7
              ? { background: 'rgba(255,184,107,0.14)', color: 'var(--accent-yellow)', border: '1px solid rgba(255,184,107,0.24)' }
              : { background: 'rgba(255,255,255,0.04)', color: 'var(--fg-4)', border: '1px solid var(--border-default)' }),
          }}>
            {days === 0 ? 'Today' : days <= 3 ? 'Soon' : days <= 7 ? 'This week' : 'OK'}
          </span>
        </div>
      )}

      {/* Mark Paid button — card view, visible (not hover-only) */}
      {needsRenewal && (
        <div style={{ marginBottom: 10 }}>
          <button
            type="button"
            onClick={() => void handleRenew()}
            disabled={renewing}
            style={{
              width: '100%', padding: '6px 0', borderRadius: 10, fontSize: 11, fontWeight: 600,
              cursor: renewing ? 'default' : 'pointer',
              background: isOverdue ? 'rgba(255,91,110,0.12)' : 'rgba(61,255,152,0.10)',
              border: isOverdue ? '1px solid rgba(255,91,110,0.30)' : '1px solid rgba(61,255,152,0.25)',
              color: isOverdue ? 'var(--accent-red)' : 'var(--accent-green)',
              transition: 'opacity 150ms',
              opacity: renewing ? 0.6 : 1,
            }}
          >
            {renewing ? '…' : isOverdue ? '⚠ Overdue — Mark as Paid' : '✓ Mark as Paid'}
          </button>
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          padding: '3px 8px', borderRadius: 999,
          font: '500 10.5px/1 var(--font-mono)',
          ...(isPaused
            ? { background: 'var(--glass-bg)', color: 'var(--fg-4)', border: '1px solid var(--border-default)' }
            : sub.amount === 0
            ? { background: 'rgba(61,255,152,0.08)', color: 'var(--accent-green)', border: '1px solid rgba(61,255,152,0.24)' }
            : { background: 'rgba(61,255,152,0.08)', color: 'var(--accent-green)', border: '1px solid rgba(61,255,152,0.24)' }),
        }}>
          {isPaused ? 'paused' : sub.amount === 0 ? 'trial' : 'active'}
        </span>
        {sub.is_autopay && (
          <span style={{ padding: '2px 7px', borderRadius: 999, font: '500 10px/1 var(--font-mono)', background: 'rgba(139,124,255,0.12)', color: 'var(--primary-300)', border: '1px solid rgba(139,124,255,0.25)' }}>
            ⚡ Autopay
          </span>
        )}
        {sub.category && (
          <span style={{ padding: '3px 8px', borderRadius: 999, font: '500 10.5px/1 var(--font-mono)', background: 'var(--glass-bg)', color: 'var(--fg-3)', border: '1px solid var(--border-default)' }}>
            {sub.category}
          </span>
        )}
        {sub.url && (
          <a href={sub.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            style={{ marginLeft: 'auto', color: 'var(--fg-4)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--primary-300)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--fg-4)'; }}
          >
            <ExternalLink style={{ width: 12, height: 12 }} />
          </a>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Cancelled subscription row
// ---------------------------------------------------------------------------
function CancelledRow({ sub, displayMode = 'grid', onRestore }: { sub: Subscription; displayMode?: 'grid' | 'list'; onRestore: () => Promise<void> }) {
  const [restoring, setRestoring] = useState(false);

  async function doRestore() {
    setRestoring(true);
    try { await onRestore(); } finally { setRestoring(false); }
  }

  // ── List view ──────────────────────────────────────────────────────────
  if (displayMode === 'list') {
    return (
      <li
        style={{
          display: 'grid',
          gridTemplateColumns: '4px 40px 1fr auto auto auto',
          gap: 0,
          alignItems: 'center',
          background: 'var(--surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 12,
          overflow: 'hidden',
          listStyle: 'none',
          opacity: 0.45,
          transition: 'var(--transition)',
        }}
      >
        {/* Left stripe */}
        <div style={{ width: 4, alignSelf: 'stretch', background: 'linear-gradient(180deg, var(--fg-4), var(--border-default))' }} />
        {/* Logo */}
        <div style={{
          width: 40, height: 40, borderRadius: 10, margin: '10px 0 10px 12px',
          background: 'var(--surface-elev)', display: 'grid', placeItems: 'center',
          font: '500 16px/1 var(--font-display)', color: 'var(--fg-4)', filter: 'grayscale(1)',
        }}>
          {sub.emoji || sub.name.charAt(0).toUpperCase()}
        </div>
        {/* Name */}
        <div style={{ padding: '10px 14px', minWidth: 0 }}>
          <div style={{ font: '500 14px/1.2 var(--font-display)', color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'line-through' }}>
            {sub.name}
          </div>
          <div style={{ color: 'var(--fg-4)', fontSize: 11, marginTop: 3, fontFamily: 'var(--font-mono)' }}>
            {CYCLE_LABELS[sub.billing_cycle]} · cancelled {sub.cancelled_at?.slice(0, 10)}
          </div>
        </div>
        {/* Cancelled badge */}
        <div style={{ padding: '0 14px' }}>
          <span style={{
            padding: '3px 8px', borderRadius: 999,
            font: '500 10px/1 var(--font-mono)',
            background: 'var(--glass-bg)', color: 'var(--fg-4)', border: '1px solid var(--border-default)',
          }}>cancelled</span>
        </div>
        {/* Price */}
        <div style={{ padding: '0 14px', textAlign: 'right' }}>
          <span style={{ font: '500 16px/1 var(--font-display)', letterSpacing: '-0.02em', color: 'var(--fg-3)' }}>
            {formatAmount(sub.amount, sub.currency)}
          </span>
          <span style={{ color: 'var(--fg-4)', fontSize: 11, marginLeft: 3 }}>
            {sub.billing_cycle === 'monthly' ? '/mo' : sub.billing_cycle === 'yearly' ? '/yr' : ''}
          </span>
        </div>
        {/* Restore */}
        <div style={{ padding: '0 12px' }}>
          <button type="button" onClick={() => void doRestore()} disabled={restoring} title="Restore"
            style={{ padding: 5, borderRadius: 8, color: 'var(--fg-4)', background: 'transparent', border: '1px solid var(--border-default)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-green)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(61,255,152,0.30)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)'; }}
          >
            <ArchiveRestore style={{ width: 12, height: 12 }} />
          </button>
        </div>
      </li>
    );
  }

  // ── Card (grid) view ──────────────────────────────────────────────────
  return (
    <li
      style={{
        position: 'relative',
        background: 'var(--surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 18,
        padding: 20,
        overflow: 'hidden',
        listStyle: 'none',
        opacity: 0.5,
        transition: 'var(--transition)',
      }}
    >
      {/* Top accent bar — greyed out */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, background: 'linear-gradient(90deg, var(--fg-4), var(--border-default))' }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, marginTop: 4 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: 'var(--surface-elev)',
          display: 'grid', placeItems: 'center',
          font: '500 18px/1 var(--font-display)', color: 'var(--fg-4)',
          filter: 'grayscale(1)',
        }}>
          {sub.emoji || sub.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '500 16px/1.2 var(--font-display)', color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'line-through' }}>
            {sub.name}
          </div>
          <div style={{ color: 'var(--fg-4)', fontSize: 11.5, marginTop: 3, fontFamily: 'var(--font-mono)' }}>
            {CYCLE_LABELS[sub.billing_cycle]} · cancelled {sub.cancelled_at?.slice(0, 10)}
          </div>
        </div>
        <button type="button" onClick={() => void doRestore()} disabled={restoring}
          title="Restore subscription"
          style={{ padding: 6, borderRadius: 8, color: 'var(--fg-4)', background: 'var(--surface-elev)', border: '1px solid var(--border-default)', cursor: 'pointer' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-green)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)'; }}
        >
          <ArchiveRestore style={{ width: 13, height: 13 }} />
        </button>
      </div>

      {/* Price */}
      <div style={{ font: '500 28px/1 var(--font-display)', letterSpacing: '-0.02em', color: 'var(--fg-3)', marginBottom: 14 }}>
        {formatAmount(sub.amount, sub.currency)}
        <span style={{ color: 'var(--fg-4)', fontSize: 13, fontWeight: 400 }}>
          {' '}{sub.billing_cycle === 'monthly' ? '/mo' : sub.billing_cycle === 'yearly' ? '/yr' : ''}
        </span>
      </div>

      {/* Footer */}
      <span style={{
        padding: '3px 8px', borderRadius: 999,
        font: '500 10.5px/1 var(--font-mono)',
        background: 'var(--glass-bg)', color: 'var(--fg-4)', border: '1px solid var(--border-default)',
      }}>
        cancelled
      </span>
    </li>
  );
}
