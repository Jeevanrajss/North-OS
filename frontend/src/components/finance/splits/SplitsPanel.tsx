import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, Check, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { api, type Split, type SplitPerson } from '@/lib/api';
import { inr, inrExact } from '@/lib/money';

const shortDate = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null;

/** Finance → Splits: who owes you, per person, across every split. */
export function SplitsPanel() {
  const [view, setView] = useState<'pending' | 'settled'>('pending');
  const peopleQ = useQuery({ queryKey: ['splits', 'people'], queryFn: api.splits.people, enabled: view === 'pending' });
  const settledQ = useQuery({ queryKey: ['splits', 'settled'], queryFn: () => api.splits.list('settled'), enabled: view === 'settled' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div role="tablist" aria-label="Splits view" className="segmented">
        {(['pending', 'settled'] as const).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} type="button" onClick={() => setView(v)}>
            {v === 'pending' ? 'To receive' : 'Paid back'}
          </button>
        ))}
      </div>

      {view === 'pending' ? (
        peopleQ.isLoading ? <Muted>Loading…</Muted>
          : peopleQ.isError ? <Muted>Couldn't load splits.</Muted>
          : <Pending data={peopleQ.data!} />
      ) : settledQ.isLoading ? <Muted>Loading…</Muted> : <PaidBack rows={settledQ.data ?? []} />}
    </div>
  );
}

function Pending({ data }: { data: { total_pending: number; people: SplitPerson[] } }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (data.people.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <Users style={{ width: 28, height: 28, color: 'var(--primary-500)', margin: '0 auto 12px' }} />
        <div style={{ font: '600 16px/1.4 var(--font-display)', color: 'var(--fg-1)' }}>No one owes you</div>
        <div style={{ fontSize: 13, color: 'var(--fg-3)', marginTop: 4 }}>
          Hover a transaction and choose <strong>Split</strong>, or tick “Split with friends” when adding an expense.
        </div>
      </div>
    );
  }
  const splitCount = data.people.reduce((a, p) => a + p.splits.length, 0);
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });

  return (
    <>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 24 }}>
        <div style={{ flex: 1 }}>
          <div className="stat-label">You will receive</div>
          <div data-testid="splits-total" style={{ font: '600 34px/1.2 var(--font-display)', color: 'var(--accent-amber)', marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
            {inrExact(data.total_pending)}
          </div>
          <div style={{ fontSize: 13, color: 'var(--fg-3)', marginTop: 4 }}>
            from {data.people.length} {data.people.length === 1 ? 'person' : 'people'} · {splitCount} {splitCount === 1 ? 'split' : 'splits'}
          </div>
        </div>
        <span className="icon-tile" style={{ color: 'var(--accent-amber)' }}>
          <ArrowDownLeft style={{ width: 22, height: 22 }} />
        </span>
      </div>

      <div>
        <h3 style={{ font: '600 15px/1.4 var(--font-sans)', color: 'var(--fg-1)', margin: '0 0 10px' }}>By person</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12, alignItems: 'start' }}>
          {data.people.map((p) => (
            <PersonCard key={p.contact_id} person={p} expanded={open.has(p.contact_id)} onToggle={() => toggle(p.contact_id)} />
          ))}
        </div>
      </div>
    </>
  );
}

function PersonCard({ person, expanded, onToggle }: { person: SplitPerson; expanded: boolean; onToggle: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => qc.invalidateQueries({ queryKey: ['splits'] });
  const n = person.splits.length;

  const settleOne = useMutation({
    mutationFn: (s: Split) => api.splits.settle(s.id),
    onSuccess: () => { toast.success('Marked as paid'); refresh(); },
    onError: () => toast.error('Could not update'),
  });
  const settleAll = useMutation({
    mutationFn: () => api.splits.settlePerson(person.contact_id),
    onSuccess: () => { toast.success(`${person.contact_name} is all settled`); refresh(); },
    onError: () => toast.error('Could not update'),
  });

  return (
    <div className="card" style={{ padding: 0 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: 16, background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left' }}
      >
        <span className="avatar">{person.contact_name.charAt(0).toUpperCase() || '?'}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 600, color: 'var(--fg-1)' }}>{person.contact_name}</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--fg-3)' }}>{n} {n === 1 ? 'split' : 'splits'}</span>
        </span>
        <span style={{ fontWeight: 600, fontSize: 16, color: 'var(--accent-amber)', fontVariantNumeric: 'tabular-nums' }}>{inrExact(person.total)}</span>
        {expanded ? <ChevronUp style={{ width: 16, color: 'var(--fg-3)' }} /> : <ChevronDown style={{ width: 16, color: 'var(--fg-3)' }} />}
      </button>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border-default)', padding: '6px 16px 16px' }}>
          {person.splits.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.transaction_label ?? 'Split'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--fg-4)' }}>
                  {[shortDate(s.transaction_date),
                    s.share_count ? `${s.share_count} ${s.share_count === 1 ? 'share' : 'shares'}` : null,
                    s.transaction_amount ? `of ${inr(s.transaction_amount)}` : null].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--fg-1)' }}>{inrExact(s.split_amount)}</span>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Mark ${s.transaction_label ?? 'this split'} paid`}
                title="Mark this one paid"
                disabled={settleOne.isPending}
                onClick={() => { if (confirm(`${person.contact_name} paid you ${inrExact(s.split_amount)}?`)) settleOne.mutate(s); }}
              >
                <Check style={{ width: 15, height: 15 }} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost"
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
            disabled={settleAll.isPending}
            onClick={() => {
              if (confirm(`Mark ${n === 1 ? 'their split' : n === 2 ? 'both of their splits' : `all ${n} of their splits`} (${inrExact(person.total)}) as paid?`)) settleAll.mutate();
            }}
          >
            {person.contact_name} paid all {inrExact(person.total)}
          </button>
        </div>
      )}
    </div>
  );
}

function PaidBack({ rows }: { rows: Split[] }) {
  if (rows.length === 0) return <Muted>Nothing paid back yet.</Muted>;
  return (
    <div className="card" style={{ padding: 8 }}>
      {rows.map((s) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px' }}>
          <Check style={{ width: 16, height: 16, color: 'var(--accent-green)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, color: 'var(--fg-1)' }}>{s.contact_name} · {inrExact(s.split_amount)}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-4)' }}>{[s.transaction_label, shortDate(s.transaction_date)].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

const Muted = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: 32, textAlign: 'center', color: 'var(--fg-3)', fontSize: 13 }}>{children}</div>
);
