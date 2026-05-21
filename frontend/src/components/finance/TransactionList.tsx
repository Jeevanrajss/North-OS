import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { api, type FinanceMeta, type Transaction, type TransactionIn } from '@/lib/api';
import { TransactionForm } from './TransactionForm';

const PAGE_SIZE = 20;

type Props = {
  transactions: Transaction[];
  meta: FinanceMeta;
  queryKey: unknown[];
};

function fmtAmount(t: Transaction): string {
  const sym = t.currency === 'INR' ? '₹' : t.currency === 'USD' ? '$' : t.currency === 'EUR' ? '€' : `${t.currency} `;
  return `${sym}${t.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function fmtDateLabel(d: string): string {
  const date = new Date(d + 'T00:00:00');
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isToday = d === today.toISOString().slice(0, 10);
  const isYesterday = d === yesterday.toISOString().slice(0, 10);
  const fmt = date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  if (isToday) return `Today · ${fmt}`;
  if (isYesterday) return `Yesterday · ${fmt}`;
  return fmt;
}

function groupByDate(txns: Transaction[]): { date: string; items: Transaction[]; net: number }[] {
  const map = new Map<string, Transaction[]>();
  for (const t of txns) {
    const existing = map.get(t.date) ?? [];
    existing.push(t);
    map.set(t.date, existing);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, items]) => ({
      date,
      items,
      net: items.reduce((s, t) => s + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0),
    }));
}

/** Category → icon background color */
function getIconStyle(category: string | null | undefined, type: string): { bg: string; color: string } {
  const c = (category ?? '').toLowerCase();
  if (type === 'income') return { bg: 'rgba(61,255,152,0.14)', color: 'var(--accent-green)' };
  if (c.includes('sub') || c.includes('streaming')) return { bg: 'rgba(139,124,255,0.14)', color: 'var(--primary-300)' };
  if (c.includes('food') || c.includes('dining') || c.includes('restaurant')) return { bg: 'rgba(255,184,107,0.14)', color: 'var(--accent-orange)' };
  if (c.includes('transport') || c.includes('travel') || c.includes('cab')) return { bg: 'rgba(62,190,255,0.14)', color: 'var(--secondary-500)' };
  if (c.includes('shop') || c.includes('retail')) return { bg: 'rgba(255,122,217,0.14)', color: 'var(--accent-pink)' };
  if (c.includes('bill') || c.includes('util')) return { bg: 'rgba(255,91,110,0.14)', color: 'var(--accent-red)' };
  if (c.includes('health') || c.includes('medical')) return { bg: 'rgba(255,122,217,0.14)', color: 'var(--accent-pink)' };
  return { bg: 'rgba(255,255,255,0.06)', color: 'var(--fg-3)' };
}

/** Category → dot color */
function getCatDotColor(category: string | null | undefined, type: string): string {
  if (type === 'income') return 'var(--accent-green)';
  const c = (category ?? '').toLowerCase();
  if (c.includes('sub') || c.includes('streaming')) return 'var(--primary-500)';
  if (c.includes('food') || c.includes('dining')) return 'var(--accent-orange)';
  if (c.includes('transport') || c.includes('travel')) return 'var(--secondary-500)';
  if (c.includes('shop') || c.includes('retail')) return 'var(--accent-pink)';
  if (c.includes('bill') || c.includes('util')) return 'var(--accent-red)';
  return 'var(--fg-4)';
}

export function TransactionList({ transactions, meta, queryKey }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Reset to first page whenever the transaction list changes (e.g. month switch)
  useEffect(() => { setPage(0); }, [transactions]);

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.finance.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ['finance-summary'] });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<TransactionIn> }) =>
      api.finance.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ['finance-summary'] });
      setEditing(null);
    },
  });

  if (transactions.length === 0) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--fg-4)', fontSize: 13 }}>
        No transactions this month. Add your first one above.
      </div>
    );
  }

  const totalPages = Math.ceil(transactions.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, transactions.length);
  const pageSlice = transactions.slice(start, end);
  const groups = groupByDate(pageSlice);

  return (
    <div>
      {groups.map(({ date, items, net }, gi) => (
        <div key={date}>
          {/* Group header */}
          <div
            style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
              padding: '14px 4px 8px',
              borderBottom: '1px solid var(--border-subtle)',
              marginTop: gi === 0 ? 0 : 8,
            }}
          >
            <div style={{ font: '500 12.5px/1 var(--font-display)', color: 'var(--fg-2)' }}>
              {fmtDateLabel(date)}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 11.5,
                color: net >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
              }}
            >
              {net >= 0 ? '+' : '−'} {items[0]?.currency === 'INR' ? '₹' : ''}{Math.abs(net).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
          </div>

          {/* Rows */}
          {items.map((t) => (
            <div key={t.id}>
              {editing === t.id ? (
                <div style={{ background: 'var(--surface-hover)', borderRadius: 10, padding: 16, margin: '4px 0' }}>
                  <TransactionForm
                    meta={meta}
                    initial={t}
                    onSubmit={async (patch) => { await updateMut.mutateAsync({ id: t.id, patch }); }}
                    onCancel={() => setEditing(null)}
                  />
                </div>
              ) : (
                <div
                  className="group"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '36px 1fr auto auto',
                    gap: 12, alignItems: 'center',
                    padding: '12px 8px',
                    borderRadius: 10,
                    transition: 'background var(--dur) var(--ease)',
                    cursor: 'default',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ''; }}
                >
                  {/* Category icon box */}
                  {(() => {
                    const { bg, color } = getIconStyle(t.category, t.type);
                    const emoji = meta.category_emoji[t.category ?? '']
                      ?? (t.type === 'income' ? '💰' : '💸');
                    return (
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        background: bg, color,
                        display: 'grid', placeItems: 'center',
                        fontSize: 14,
                      }}>
                        {emoji}
                      </div>
                    );
                  })()}

                  {/* Name + meta */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.payee || t.category || (t.type === 'income' ? 'Income' : t.type === 'transfer' ? 'Transfer' : 'Expense')}
                    </div>
                    <div style={{ color: 'var(--fg-4)', fontSize: 11.5, fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                      {[t.account].filter(Boolean).join(' · ')}
                    </div>
                  </div>

                  {/* Category chip */}
                  {t.category && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 8px', borderRadius: 999,
                      background: 'var(--glass-bg)', border: '1px solid var(--border-default)',
                      color: 'var(--fg-3)', fontSize: 11, whiteSpace: 'nowrap',
                    }}>
                      <i style={{
                        width: 6, height: 6, borderRadius: 999, flexShrink: 0,
                        background: getCatDotColor(t.category, t.type),
                        display: 'inline-block',
                      }} />
                      {t.category}
                    </span>
                  )}
                  {!t.category && <span />}

                  {/* Amount + actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      font: '500 14px/1 var(--font-display)',
                      letterSpacing: '-0.01em',
                      textAlign: 'right',
                      minWidth: 80,
                      color: t.type === 'income' ? 'var(--accent-green)' : t.type === 'transfer' ? 'var(--primary-300)' : 'var(--accent-red)',
                    }}>
                      {t.type === 'income' ? '+' : t.type === 'transfer' ? '↔ ' : '−'}{fmtAmount(t)}
                    </span>

                    {/* Hover actions */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(t.id)}
                        style={{ padding: 4, borderRadius: 6, color: 'var(--fg-4)', background: 'transparent', border: 0, cursor: 'pointer' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-2)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                      >
                        <Pencil style={{ width: 13, height: 13 }} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { if (confirm('Delete this transaction?')) deleteMut.mutate(t.id); }}
                        style={{ padding: 4, borderRadius: 6, color: 'var(--fg-4)', background: 'transparent', border: 0, cursor: 'pointer' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-red)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                      >
                        <Trash2 style={{ width: 13, height: 13 }} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Pagination footer */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 4px 2px',
          borderTop: '1px solid var(--border-subtle)',
          marginTop: 8,
        }}>
          {/* Count label */}
          <span style={{ fontSize: 12, color: 'var(--fg-4)' }}>
            {start + 1}–{end} of {transactions.length} transactions
          </span>

          {/* Page controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page === 0}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                cursor: page === 0 ? 'default' : 'pointer',
                background: 'var(--surface-elev)',
                border: '1px solid var(--border-default)',
                color: page === 0 ? 'var(--fg-disabled)' : 'var(--fg-2)',
                transition: 'opacity 150ms',
              }}
            >
              <ChevronLeft style={{ width: 13, height: 13 }} /> Prev
            </button>

            {/* Page number pills — show up to 7, collapse middle pages with … */}
            {(() => {
              const pills: (number | '…')[] = [];
              if (totalPages <= 7) {
                for (let i = 0; i < totalPages; i++) pills.push(i);
              } else {
                pills.push(0);
                if (page > 2) pills.push('…');
                for (let i = Math.max(1, page - 1); i <= Math.min(totalPages - 2, page + 1); i++) pills.push(i);
                if (page < totalPages - 3) pills.push('…');
                pills.push(totalPages - 1);
              }
              return pills.map((p, idx) =>
                p === '…' ? (
                  <span key={`ellipsis-${idx}`} style={{ fontSize: 12, color: 'var(--fg-4)', padding: '0 2px' }}>…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    style={{
                      width: 28, height: 28, borderRadius: 8, fontSize: 12, fontWeight: 500,
                      cursor: 'pointer',
                      background: p === page ? 'var(--primary-500)' : 'var(--surface-elev)',
                      border: `1px solid ${p === page ? 'var(--primary-500)' : 'var(--border-default)'}`,
                      color: p === page ? 'white' : 'var(--fg-3)',
                      transition: 'all 150ms',
                    }}
                  >
                    {p + 1}
                  </button>
                )
              );
            })()}

            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages - 1}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                background: 'var(--surface-elev)',
                border: '1px solid var(--border-default)',
                color: page >= totalPages - 1 ? 'var(--fg-disabled)' : 'var(--fg-2)',
                transition: 'opacity 150ms',
              }}
            >
              Next <ChevronRight style={{ width: 13, height: 13 }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
