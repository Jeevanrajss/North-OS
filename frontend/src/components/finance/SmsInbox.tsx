/**
 * SmsInbox — shows pending SMS-detected transactions for review.
 * Each row can be confirmed (→ creates a transaction, with optional category) or dismissed.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Loader2, MessageSquare, RefreshCw, X } from 'lucide-react';
import { api, type FinanceMeta, type SmsTransactionOut, type Transaction } from '@/lib/api';

function fmt(amount: number | null, currency: string | null) {
  if (amount == null) return '—';
  const sym = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : `${currency} `;
  return `${sym}${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function SourceBadge({ source }: { source: string }) {
  const isAndroid = source === 'android';
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
      padding: '2px 7px', borderRadius: 999,
      background: isAndroid ? 'rgba(61,255,152,0.10)' : 'rgba(62,190,255,0.10)',
      color: isAndroid ? 'var(--accent-green)' : 'var(--secondary-500)',
      border: `1px solid ${isAndroid ? 'rgba(61,255,152,0.25)' : 'rgba(62,190,255,0.25)'}`,
    }}>
      {isAndroid ? '📱 Android' : '💻 iMessage'}
    </span>
  );
}

// ── Category picker panel ─────────────────────────────────────────────────────

function CategoryPicker({ txnType, meta, onPick, onSkip, busy }: {
  txnType: string | null;
  meta: FinanceMeta | undefined;
  onPick: (cat: string) => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const cats = txnType === 'income'
    ? (meta?.income_categories ?? [])
    : (meta?.expense_categories ?? []);
  const emoji = meta?.category_emoji ?? {};

  return (
    <div style={{
      padding: '10px 14px 12px',
      borderTop: '1px solid var(--border-subtle)',
      background: 'var(--surface-elev)',
    }}>
      <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--fg-4)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        Pick a category
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {cats.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => onPick(cat)}
            disabled={busy}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 8,
              border: '1px solid var(--border-default)',
              background: 'var(--surface)', color: 'var(--fg-2)',
              fontSize: 12, fontWeight: 500,
              cursor: busy ? 'default' : 'pointer',
              transition: 'all 0.12s',
            }}
            onMouseEnter={(e) => {
              if (!busy) {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,124,255,0.14)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(139,124,255,0.4)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--primary-300)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-2)';
            }}
          >
            {emoji[cat] && <span>{emoji[cat]}</span>}
            {cat}
          </button>
        ))}

        {/* Skip — confirm without category */}
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '5px 10px', borderRadius: 8,
            border: '1px solid var(--border-subtle)',
            background: 'transparent', color: 'var(--fg-4)',
            fontSize: 12, fontWeight: 500,
            cursor: busy ? 'default' : 'pointer',
            transition: 'all 0.12s',
          }}
          onMouseEnter={(e) => { if (!busy) (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-2)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)'; }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}

// ── Single SMS row ────────────────────────────────────────────────────────────

function SmsRow({ row, meta, onConfirm, onDismiss, confirming, dismissing, error }: {
  row: SmsTransactionOut;
  meta: FinanceMeta | undefined;
  onConfirm: (category: string | null) => void;
  onDismiss: () => void;
  confirming: boolean;
  dismissing: boolean;
  error: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [picking, setPicking] = useState(false);   // show category picker
  const busy = confirming || dismissing;

  function handleAddClick() {
    setPicking(true);
    setExpanded(false);
  }

  function handlePick(cat: string) {
    setPicking(false);
    onConfirm(cat);
  }

  function handleSkip() {
    setPicking(false);
    onConfirm(null);
  }

  return (
    <div style={{
      borderRadius: 12,
      border: `1px solid ${error ? 'rgba(255,91,110,0.35)' : picking ? 'rgba(139,124,255,0.35)' : 'var(--border-default)'}`,
      background: 'var(--surface)',
      overflow: 'hidden',
      transition: 'border-color 0.15s',
      opacity: busy ? 0.75 : 1,
    }}>
      {/* Main row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto auto',
        gap: 12,
        alignItems: 'center',
        padding: '12px 14px',
      }}>
        {/* Left: amount + payee */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              font: '600 15px/1 var(--font-display)',
              color: row.txn_type === 'income' ? 'var(--accent-green)' : 'var(--accent-red)',
            }}>
              {row.txn_type === 'income' ? '+' : '−'}{fmt(row.amount, row.currency)}
            </span>
            {row.payee && (
              <span style={{ fontSize: 13, color: 'var(--fg-2)', fontWeight: 500 }}>
                {row.payee}
              </span>
            )}
            {row.account && (
              <span style={{ fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>
                {row.account}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <SourceBadge source={row.source} />
            {row.sender && (
              <span style={{ fontSize: 11, color: 'var(--fg-4)' }}>{row.sender}</span>
            )}
            <span style={{ fontSize: 11, color: 'var(--fg-disabled)' }}>{relTime(row.received_at)}</span>
          </div>
        </div>

        {/* Expand raw SMS */}
        <button
          type="button"
          onClick={() => { setExpanded((v) => !v); setPicking(false); }}
          disabled={busy}
          style={{ background: 'none', border: 'none', cursor: busy ? 'default' : 'pointer', color: 'var(--fg-4)', padding: 4 }}
          title="View raw SMS"
        >
          {expanded ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
        </button>

        {/* Dismiss */}
        <button
          type="button"
          onClick={onDismiss}
          disabled={busy}
          title="Dismiss"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: 8, border: 'none', cursor: busy ? 'default' : 'pointer',
            background: 'transparent', color: 'var(--fg-4)',
            transition: 'all 0.12s',
          }}
          onMouseEnter={(e) => {
            if (!busy) {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,91,110,0.12)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-red)';
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)';
          }}
        >
          {dismissing
            ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
            : <X style={{ width: 14, height: 14 }} />
          }
        </button>

        {/* Add button */}
        <button
          type="button"
          onClick={handleAddClick}
          disabled={busy}
          title="Add to transactions"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 8, border: 'none',
            cursor: busy ? 'default' : 'pointer',
            background: picking ? 'rgba(139,124,255,0.18)' : 'rgba(61,255,152,0.12)',
            color: picking ? 'var(--primary-300)' : 'var(--accent-green)',
            fontSize: 12, fontWeight: 500,
            transition: 'all 0.12s',
          }}
          onMouseEnter={(e) => {
            if (!busy && !picking) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(61,255,152,0.20)';
          }}
          onMouseLeave={(e) => {
            if (!picking) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(61,255,152,0.12)';
          }}
        >
          {confirming
            ? <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} />
            : <CheckCircle2 style={{ width: 13, height: 13 }} />
          }
          {confirming ? 'Adding…' : 'Add'}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          padding: '7px 14px',
          borderTop: '1px solid rgba(255,91,110,0.2)',
          background: 'rgba(255,91,110,0.06)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <AlertCircle style={{ width: 12, height: 12, color: 'var(--accent-red)', flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: 'var(--accent-red)', fontFamily: 'var(--font-mono)' }}>
            {error}
          </span>
        </div>
      )}

      {/* Category picker */}
      {picking && (
        <CategoryPicker
          txnType={row.txn_type}
          meta={meta}
          onPick={handlePick}
          onSkip={handleSkip}
          busy={confirming}
        />
      )}

      {/* Expanded: raw SMS body */}
      {expanded && (
        <div style={{
          padding: '10px 14px 12px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--surface-elev)',
        }}>
          <p style={{
            margin: 0, fontSize: 11.5, color: 'var(--fg-4)',
            fontFamily: 'var(--font-mono)', lineHeight: 1.6,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {row.raw_body}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  queryKey: unknown[];   // finance txn query key — invalidated on confirm
};

export function SmsInbox({ queryKey }: Props) {
  const qc = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  // Per-row error state: smsId → error message
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const statusQ = useQuery({
    queryKey: ['sms-status'],
    queryFn: () => api.sms.status(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const pendingQ = useQuery({
    queryKey: ['sms-pending'],
    queryFn: () => api.sms.pending(),
    refetchInterval: 20_000,
    staleTime: 15_000,
  });

  const metaQ = useQuery<FinanceMeta>({
    queryKey: ['finance-meta'],
    queryFn: () => api.finance.meta(),
    staleTime: Infinity,
  });

  // Auto-sync HTTP SMS every 5 min when configured
  useQuery({
    queryKey: ['sms-auto-sync'],
    queryFn: async () => {
      if (!statusQ.data?.httpsms_configured) return null;
      return api.sms.syncHttpSms();
    },
    enabled: !!statusQ.data?.httpsms_configured,
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
    select: (data) => {
      if (data && data.new_transactions > 0) {
        qc.invalidateQueries({ queryKey: ['sms-pending'] });
      }
      return data;
    },
  });

  const confirmMut = useMutation({
    mutationFn: ({ id, category }: { id: string; category: string | null }) =>
      api.sms.confirm(id, category),
    onSuccess: (data, { id }) => {
      setRowErrors((prev) => { const n = { ...prev }; delete n[id]; return n; });

      // Instantly inject the new transaction into the cache
      if (data.transaction) {
        const txn = data.transaction;
        const [txnYear, txnMonth] = txn.date.split('-').map(Number);
        qc.setQueryData<Transaction[]>(
          ['finance-txns', txnYear, txnMonth],
          (old) => {
            if (!old) return [txn];
            return [txn, ...old.filter((t) => t.id !== txn.id)];
          },
        );
      }

      qc.invalidateQueries({ queryKey: ['sms-pending'] });
      qc.invalidateQueries({ queryKey: ['finance-txns'] });
      qc.invalidateQueries({ queryKey: ['finance-summary'] });
    },
    onError: (err: unknown, { id }) => {
      const msg = err instanceof Error ? err.message : 'Failed to add transaction';
      setRowErrors((prev) => ({ ...prev, [id]: msg }));
    },
  });

  const dismissMut = useMutation({
    mutationFn: (id: string) => api.sms.dismiss(id),
    onSuccess: (_data, id) => {
      setRowErrors((prev) => { const n = { ...prev }; delete n[id]; return n; });
      qc.invalidateQueries({ queryKey: ['sms-pending'] });
    },
    onError: (err: unknown, id) => {
      const msg = err instanceof Error ? err.message : 'Failed to dismiss';
      setRowErrors((prev) => ({ ...prev, [id]: msg }));
    },
  });

  async function handleScanImessage() {
    setScanning(true);
    setScanMsg('');
    try {
      const res = await api.sms.scanImessage(7);
      if (!res.scanned && res.error) {
        // Structured error from backend — show error code prominently
        setScanMsg(`[${res.error_code}] ${res.error}`);
      } else {
        setScanMsg(res.new_transactions > 0
          ? `Found ${res.new_transactions} new transaction${res.new_transactions > 1 ? 's' : ''}.`
          : `No new bank transactions found. (${res.debug?.total_messages_in_window ?? 0} messages scanned, ${res.debug?.bank_sender_matches ?? 0} from bank senders)`);
        qc.invalidateQueries({ queryKey: ['sms-pending'] });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Scan failed.';
      setScanMsg(`[IMSG-ERR] ${msg}`);
    } finally {
      setScanning(false);
    }
  }

  async function handleSyncHttpSms() {
    setSyncing(true);
    setScanMsg('');
    try {
      const res = await api.sms.syncHttpSms();
      setScanMsg(res.new_transactions > 0
        ? `Found ${res.new_transactions} new transaction${res.new_transactions > 1 ? 's' : ''}.`
        : 'No new transactions found.');
      qc.invalidateQueries({ queryKey: ['sms-pending'] });
    } catch (e: unknown) {
      setScanMsg(e instanceof Error ? e.message : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  }

  const pending = pendingQ.data ?? [];
  const imessageAvailable = statusQ.data?.imessage_available ?? false;
  const httpsmsConfigured = statusQ.data?.httpsms_configured ?? false;

  if (pending.length === 0 && !imessageAvailable && !httpsmsConfigured) return null;

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <MessageSquare style={{ width: 15, height: 15, color: 'var(--primary-300)', flexShrink: 0 }} />
          <h3 style={{ margin: 0, font: '500 15px/1.2 var(--font-display)', color: 'var(--fg-1)', whiteSpace: 'nowrap' }}>
            SMS Transactions
          </h3>
          {pending.length > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 600,
              padding: '2px 7px', borderRadius: 999,
              background: 'rgba(139,124,255,0.15)', color: 'var(--primary-300)',
              border: '1px solid rgba(139,124,255,0.30)',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {pending.length} pending
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {scanMsg && (
            <span style={{ fontSize: 12, color: 'var(--fg-4)' }}>{scanMsg}</span>
          )}
          {httpsmsConfigured && (
            <button
              type="button"
              onClick={handleSyncHttpSms}
              disabled={syncing}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                background: 'var(--surface-elev)', border: '1px solid var(--border-default)',
                color: 'var(--fg-3)', cursor: syncing ? 'default' : 'pointer',
                opacity: syncing ? 0.6 : 1, transition: 'all 0.15s',
              }}
            >
              <RefreshCw style={{ width: 12, height: 12, animation: syncing ? 'spin 1s linear infinite' : undefined }} />
              {syncing ? 'Syncing…' : 'Sync HTTP SMS'}
            </button>
          )}
          {imessageAvailable && (
            <button
              type="button"
              onClick={handleScanImessage}
              disabled={scanning}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                background: 'var(--surface-elev)', border: '1px solid var(--border-default)',
                color: 'var(--fg-3)', cursor: scanning ? 'default' : 'pointer',
                opacity: scanning ? 0.6 : 1, transition: 'all 0.15s',
              }}
            >
              <RefreshCw style={{ width: 12, height: 12, animation: scanning ? 'spin 1s linear infinite' : undefined }} />
              {scanning ? 'Scanning…' : 'Scan iMessage'}
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {pending.length === 0 && (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--fg-4)', fontSize: 13 }}>
          {imessageAvailable && httpsmsConfigured
            ? 'No pending transactions. Use "Sync HTTP SMS" or "Scan iMessage" to fetch new ones.'
            : imessageAvailable
              ? 'No pending SMS transactions. Click "Scan iMessage" to check for new ones.'
              : httpsmsConfigured
                ? 'No pending transactions. Click "Sync HTTP SMS" to fetch the latest.'
                : 'Waiting for SMS from your Android device…'}
        </div>
      )}

      {/* Pending rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {pending.map((row) => (
          <SmsRow
            key={row.id}
            row={row}
            meta={metaQ.data}
            confirming={confirmMut.isPending && confirmMut.variables?.id === row.id}
            dismissing={dismissMut.isPending && dismissMut.variables === row.id}
            error={rowErrors[row.id] ?? null}
            onConfirm={(category) => {
              setRowErrors((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
              confirmMut.mutate({ id: row.id, category });
            }}
            onDismiss={() => {
              setRowErrors((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
              dismissMut.mutate(row.id);
            }}
          />
        ))}
      </div>

      {/* Spin keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
