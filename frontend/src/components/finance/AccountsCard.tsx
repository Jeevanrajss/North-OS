import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, type Account, type AccountIn } from '@/lib/api';
import { cn } from '@/lib/cn';
import { AccountForm } from './AccountForm';

// ── color helpers ─────────────────────────────────────────────────────────────
const COLOR_BADGE: Record<string, string> = {
  violet:  'bg-violet-500/15 border-violet-500/30 text-violet-300',
  sky:     'bg-sky-500/15 border-sky-500/30 text-sky-300',
  emerald: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
  amber:   'bg-amber-500/15 border-amber-500/30 text-amber-300',
  rose:    'bg-rose-500/15 border-rose-500/30 text-rose-300',
  indigo:  'bg-indigo-500/15 border-indigo-500/30 text-indigo-300',
  teal:    'bg-teal-500/15 border-teal-500/30 text-teal-300',
  orange:  'bg-orange-500/15 border-orange-500/30 text-orange-300',
};

const COLOR_DOT: Record<string, string> = {
  violet: 'bg-violet-500', sky: 'bg-sky-500', emerald: 'bg-emerald-500',
  amber: 'bg-amber-500', rose: 'bg-rose-500', indigo: 'bg-indigo-500',
  teal: 'bg-teal-500', orange: 'bg-orange-500',
};

const TYPE_EMOJI: Record<string, string> = {
  savings: '🏦', credit_card: '💳', debit_card: '🪪', wallet: '👛', upi: '📱', cash: '💵',
};

const TYPE_LABEL: Record<string, string> = {
  savings: 'Savings', credit_card: 'Credit Card', debit_card: 'Debit Card',
  wallet: 'Wallet', upi: 'UPI', cash: 'Cash',
};

// ── benefit parser ────────────────────────────────────────────────────────────
function parseBenefits(json: string | null) {
  if (!json) return { perks: [] as string[], cashback: {} as Record<string, number>, highlights: [] as string[], annual_fee: null as number | null };
  try {
    const d = JSON.parse(json);
    return {
      perks: Array.isArray(d.perks) ? d.perks as string[] : [],
      cashback: typeof d.cashback === 'object' && d.cashback ? d.cashback as Record<string, number> : {},
      highlights: Array.isArray(d.highlights) ? d.highlights as string[] : [],
      annual_fee: typeof d.annual_fee === 'number' ? d.annual_fee as number : null,
    };
  } catch {
    return { perks: [], cashback: {}, highlights: [], annual_fee: null };
  }
}

// ── main component ────────────────────────────────────────────────────────────
export function AccountsCard() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const accountsQ = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => api.accounts.list(),
    staleTime: 1000 * 60,
  });

  const createMut = useMutation({
    mutationFn: (p: AccountIn) => api.accounts.create(p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); setShowForm(false); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: AccountIn }) =>
      api.accounts.update(id, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); setEditing(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.accounts.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const accounts = accountsQ.data ?? [];
  const creditCards = accounts.filter((a) => a.type === 'credit_card');
  const others = accounts.filter((a) => a.type !== 'credit_card');

  // ── account row ───────────────────────────────────────────────────────────
  function AccountRow({ acct }: { acct: Account }) {
    const isOpen = expanded === acct.id;
    const b = parseBenefits(acct.benefits_json);
    const colorKey = acct.color ?? 'violet';
    const displayName = acct.nickname || acct.name;
    const subLabel = acct.nickname ? acct.name : null;

    if (editing?.id === acct.id) {
      return (
        <div className="rounded-xl border border-ink-800 bg-ink-900 p-4">
          <AccountForm
            initial={editing}
            onSubmit={async (p) => { await updateMut.mutateAsync({ id: acct.id, patch: p }); }}
            onCancel={() => setEditing(null)}
          />
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-ink-800 bg-ink-900/50 overflow-hidden">
        {/* Header */}
        <div
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 transition-colors',
            acct.type === 'credit_card' ? 'cursor-pointer hover:bg-ink-900' : '',
          )}
          onClick={() => acct.type === 'credit_card' && setExpanded(isOpen ? null : acct.id)}
        >
          {/* Color dot */}
          <div className={cn('w-2 h-2 rounded-full shrink-0', COLOR_DOT[colorKey] ?? 'bg-violet-500')} />
          <span className="text-base shrink-0">{TYPE_EMOJI[acct.type] ?? '🏦'}</span>

          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-ink-100 truncate">{displayName}</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {subLabel && <span className="text-[11px] text-ink-500">{subLabel}</span>}
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded border',
                COLOR_BADGE[colorKey] ?? COLOR_BADGE.violet,
              )}>
                {TYPE_LABEL[acct.type]}
              </span>
              {acct.last4 && <span className="text-[11px] text-ink-600">••••{acct.last4}</span>}
              {acct.credit_limit && (
                <span className="text-[11px] text-ink-600">
                  Limit: ₹{acct.credit_limit.toLocaleString('en-IN')}
                </span>
              )}
              {b.annual_fee !== null && acct.type === 'credit_card' && (
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded',
                  b.annual_fee === 0 ? 'text-emerald-500 bg-emerald-500/10' : 'text-ink-600 bg-ink-800',
                )}>
                  {b.annual_fee === 0 ? 'Free' : `₹${b.annual_fee}/yr`}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div
            className="flex gap-1 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setEditing(acct)}
              className="p-1.5 rounded text-ink-600 hover:text-ink-300 hover:bg-ink-800 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => { if (confirm(`Remove "${displayName}"?`)) deleteMut.mutate(acct.id); }}
              className="p-1.5 rounded text-ink-600 hover:text-red-400 hover:bg-ink-800 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Expanded — benefits panel (credit cards only) */}
        {isOpen && acct.type === 'credit_card' && (
          <div className="border-t border-ink-800 px-4 py-3 space-y-3 bg-ink-950/40">
            {b.highlights.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {b.highlights.map((h, i) => (
                  <span key={i} className="text-[10px] bg-ink-800 text-ink-400 rounded-full px-2 py-0.5">{h}</span>
                ))}
              </div>
            )}
            {Object.keys(b.cashback).length > 0 && (
              <div>
                <p className="text-[10px] text-ink-600 uppercase tracking-wide mb-1.5">Cashback by category</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(b.cashback).map(([cat, pct]) => (
                    <span key={cat} className="text-[11px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full px-2 py-0.5">
                      {cat}: {pct}%
                    </span>
                  ))}
                </div>
              </div>
            )}
            {b.perks.length > 0 && (
              <div>
                <p className="text-[10px] text-ink-600 uppercase tracking-wide mb-1.5">Perks</p>
                <ul className="space-y-1">
                  {b.perks.map((p, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-ink-400">
                      <span className="text-accent mt-px shrink-0">✦</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {b.perks.length === 0 && Object.keys(b.cashback).length === 0 && (
              <p className="text-xs text-ink-600">No benefits saved. Edit the account to add them.</p>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-500">
          {accounts.length === 0
            ? 'Register your accounts so the AI can suggest the best card for each purchase.'
            : `${accounts.length} account${accounts.length !== 1 ? 's' : ''} · ${creditCards.length} credit card${creditCards.length !== 1 ? 's' : ''}`}
        </p>
        <button
          type="button"
          onClick={() => { setShowForm((v) => !v); setEditing(null); }}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors',
            showForm
              ? 'border-ink-700 bg-ink-900 text-ink-400'
              : 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20',
          )}
        >
          <Plus className="w-4 h-4" />
          Add Account
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card">
          <AccountForm
            onSubmit={async (p) => { await createMut.mutateAsync(p); }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {accountsQ.isLoading && (
        <div className="py-8 text-center text-xs text-ink-500">Loading…</div>
      )}

      {/* Credit cards */}
      {creditCards.length > 0 && (
        <div>
          <h3 className="text-[11px] text-ink-500 uppercase tracking-wide mb-2">
            Credit Cards
            <span className="ml-1.5 text-ink-700 normal-case">(tap to view benefits)</span>
          </h3>
          <div className="space-y-2">
            {creditCards.map((a) => <AccountRow key={a.id} acct={a} />)}
          </div>
        </div>
      )}

      {/* Other accounts */}
      {others.length > 0 && (
        <div>
          <h3 className="text-[11px] text-ink-500 uppercase tracking-wide mb-2">Other Accounts</h3>
          <div className="space-y-2">
            {others.map((a) => <AccountRow key={a.id} acct={a} />)}
          </div>
        </div>
      )}

      {accounts.length === 0 && !accountsQ.isLoading && !showForm && (
        <div className="py-10 text-center text-sm text-ink-600 border border-dashed border-ink-800 rounded-xl">
          No accounts yet. Add your first one above.
        </div>
      )}
    </div>
  );
}
