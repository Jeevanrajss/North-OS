import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Minus, Plus, UserPlus } from 'lucide-react';
import { RightDrawer } from '@/components/ui/RightDrawer';
import { useToast } from '@/contexts/ToastContext';
import { api, type Transaction } from '@/lib/api';
import { inr, inrExact, shareOf } from '@/lib/money';

/**
 * Split a transaction by shares. Everyone — you included — takes a number of
 * shares; one share is the amount ÷ all shares, and each person owes their
 * shares × one share. Dinner ₹1,000 over 10 shares → Asha (2) owes ₹200.
 */
export function SplitDrawer({ txn, onClose }: { txn: Transaction | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [selfCount, setSelfCount] = useState(1);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [newName, setNewName] = useState('');

  // Fresh form for every transaction opened.
  useEffect(() => {
    setSelfCount(1);
    setCounts({});
    setNotes('');
    setNewName('');
  }, [txn?.id]);

  const contactsQ = useQuery({ queryKey: ['contacts'], queryFn: api.contacts.list, enabled: !!txn });
  const contacts = contactsQ.data ?? [];

  const totalShares = selfCount + Object.values(counts).reduce((a, b) => a + b, 0);
  const amount = txn?.amount ?? 0;
  const owed = useMemo(
    () => Object.values(counts).reduce((a, n) => a + shareOf(amount, n, totalShares), 0),
    [counts, amount, totalShares],
  );
  const picked = Object.keys(counts).length;

  const setCount = (id: string, n: number) =>
    setCounts((c) => {
      const next = { ...c };
      if (n <= 0) delete next[id];
      else next[id] = Math.min(n, 100);
      return next;
    });

  const addPerson = useMutation({
    mutationFn: (name: string) => api.contacts.create(name),
    onSuccess: (c) => {
      qc.setQueryData(['contacts'], [...contacts, c]);
      setCount(c.id, 1); // added from here = in this split
      setNewName('');
    },
    onError: () => toast.error('Could not add that person'),
  });

  const save = useMutation({
    mutationFn: () =>
      api.splits.batch({
        transaction_id: txn!.id,
        self_count: selfCount,
        shares: Object.entries(counts).map(([contact_id, count]) => ({ contact_id, count })),
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['splits'] });
      toast.success(`Split saved · ${inrExact(owed)} owed by ${picked} ${picked === 1 ? 'person' : 'people'}`);
      onClose();
    },
    onError: () => toast.error('Could not save the split'),
  });

  return (
    <RightDrawer open={!!txn} onClose={onClose} title="Split transaction" width={460}>
      {txn && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div style={{ font: '600 17px/1.3 var(--font-display)', color: 'var(--fg-1)' }}>
              {txn.payee || txn.category || 'Transaction'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-3)' }}>
              {inr(txn.amount)} · {new Date(`${txn.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </div>
          </div>

          {/* Live result — visible while adjusting counts */}
          <div
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 16px', borderRadius: 12, background: 'var(--surface-elev)', border: '1px solid var(--border-default)',
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>{totalShares} {totalShares === 1 ? 'share' : 'shares'}</div>
              <div style={{ font: '600 15px/1.4 var(--font-sans)', color: 'var(--fg-1)' }}>{inrExact(shareOf(amount, 1, totalShares))} each</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>Owed to you</div>
              <div data-testid="owed-total" style={{ font: '600 18px/1.4 var(--font-sans)', color: 'var(--accent-amber)', fontVariantNumeric: 'tabular-nums' }}>
                {inrExact(owed)}
              </div>
            </div>
          </div>

          <div>
            <ShareRow
              name="You"
              caption={selfCount === 0 ? 'Not paying a share' : `Your share ${inrExact(shareOf(amount, selfCount, totalShares))}`}
              count={selfCount}
              onChange={(n) => setSelfCount(Math.max(0, Math.min(n, 100)))}
            />
            <div style={{ height: 1, background: 'var(--border-default)', margin: '4px 0' }} />
            {contactsQ.isLoading && <div style={{ padding: 16, color: 'var(--fg-4)', fontSize: 13 }}>Loading people…</div>}
            {/* Fixed order — rows never jump under the pointer while clicking +. */}
            {contacts.map((c) => (
              <ShareRow
                key={c.id}
                name={c.name}
                owes={counts[c.id] ? shareOf(amount, counts[c.id], totalShares) : null}
                caption="Not in this split"
                count={counts[c.id] ?? 0}
                onChange={(n) => setCount(c.id, n)}
              />
            ))}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); if (newName.trim()) addPerson.mutate(newName.trim()); }}
            style={{ display: 'flex', gap: 8 }}
          >
            <input
              className="input"
              placeholder="Add a person"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              aria-label="New person's name"
            />
            <button type="submit" className="btn-ghost" disabled={!newName.trim() || addPerson.isPending}>
              <UserPlus style={{ width: 15, height: 15 }} /> Add
            </button>
          </form>

          <div>
            <label className="input-label" htmlFor="split-note">Note (optional)</label>
            <input id="split-note" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Goa trip dinner" />
          </div>

          <button
            type="button"
            className="btn-primary"
            style={{ justifyContent: 'center', height: 42 }}
            disabled={picked === 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : picked === 0 ? 'Add shares for who owes you' : `Save split · ${inrExact(owed)} owed to you`}
          </button>
        </div>
      )}
    </RightDrawer>
  );
}

function ShareRow({
  name, caption, owes = null, count, onChange,
}: { name: string; caption: string; owes?: number | null; count: number; onChange: (n: number) => void }) {
  const active = count > 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: active ? 'var(--fg-1)' : 'var(--fg-3)' }}>{name}</div>
        {owes !== null
          ? <div style={{ fontSize: 12, color: 'var(--accent-amber)' }}>owes {inrExact(owes)}</div>
          : <div style={{ fontSize: 12, color: 'var(--fg-4)' }}>{caption}</div>}
      </div>
      <StepButton label={`One share less for ${name}`} disabled={count <= 0} onClick={() => onChange(count - 1)}>
        <Minus style={{ width: 14, height: 14 }} />
      </StepButton>
      <span style={{ width: 28, textAlign: 'center', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: active ? 'var(--fg-1)' : 'var(--fg-4)' }}>
        {count}
      </span>
      <StepButton label={`One share more for ${name}`} disabled={count >= 100} onClick={() => onChange(count + 1)}>
        <Plus style={{ width: 14, height: 14 }} />
      </StepButton>
    </div>
  );
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="split-step"
    >
      {children}
    </button>
  );
}
