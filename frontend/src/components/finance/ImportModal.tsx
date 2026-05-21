/**
 * Bank / Credit-Card Statement Import Wizard
 *
 * Step 1 — Upload: pick account, drag-drop or browse CSV, optionally choose bank/CC
 * Step 2 — Map columns (only when format not auto-detected)
 * Step 3 — Review: editable table, AI-suggested categories, duplicate warnings
 * Step 4 — Done: success summary
 */
import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  X, Upload, ChevronRight, AlertTriangle, CheckCircle2,
  Loader2, CreditCard, Building2,
} from 'lucide-react';
import {
  api,
  type Account,
  type ColumnMapping,
  type ConfirmRow,
  type FinanceMeta,
  type ImportPreviewResponse,
  type ImportPreviewRow,
} from '@/lib/api';
import { cn } from '@/lib/cn';

// ── Types ────────────────────────────────────────────────────────────────────

type Step = 'upload' | 'map' | 'review' | 'done';

interface Props {
  accounts: Account[];
  meta: FinanceMeta;
  onClose: () => void;
  onImported: () => void;
}

// ── Shared input style matching the rest of the app ──────────────────────────

const inputCls =
  'w-full rounded-lg px-3 py-2 text-sm text-[var(--fg-2)] outline-none transition-colors ' +
  'bg-[var(--surface-elev)] border border-[rgba(255,255,255,0.07)] focus:border-[rgba(139,124,255,0.50)]';

const selectCls =
  'w-full rounded-lg px-3 py-2 text-sm text-[var(--fg-2)] outline-none transition-colors ' +
  'bg-[var(--surface-elev)] border border-[rgba(255,255,255,0.07)] focus:border-[rgba(139,124,255,0.50)]';

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
      {children}
    </label>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function ImportModal({ accounts, meta, onClose, onImported }: Props) {
  const ALL_CATEGORIES = Array.from(new Set([...(meta.expense_categories ?? []), ...(meta.income_categories ?? [])]));

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [bankKey, setBankKey] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  const [availableCols, setAvailableCols] = useState<string[]>([]);
  const [colMap, setColMap] = useState<Partial<ColumnMapping>>({});

  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [rows, setRows] = useState<(ConfirmRow & { is_duplicate: boolean })[]>([]);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  const { data: banksData } = useQuery({
    queryKey: ['import-banks'],
    queryFn: api.finance.importBanks,
  });

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const accountName = selectedAccount
    ? (selectedAccount.nickname || selectedAccount.name)
    : accountId;

  // ── Drag & drop handlers ──────────────────────────────────────────────────

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setDragging(false), []);

  const ACCEPTED_EXTS = ['.csv', '.xls', '.xlsx', '.pdf'];

  function isAcceptedFile(f: File) {
    return ACCEPTED_EXTS.some((ext) => f.name.toLowerCase().endsWith(ext));
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && isAcceptedFile(dropped)) {
      setFile(dropped);
    }
  }, []);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const previewMut = useMutation({
    mutationFn: async (extraMapping?: ColumnMapping) => {
      if (!file || !accountId) throw new Error('Select an account and file first.');
      const form = new FormData();
      form.append('file', file);
      form.append('account_id', accountId);
      if (bankKey) form.append('bank_key', bankKey);
      if (extraMapping) form.append('column_mapping', JSON.stringify(extraMapping));
      return api.finance.importPreview(form);
    },
    onSuccess: (data) => {
      setPreview(data);
      if (data.needs_column_mapping) {
        setAvailableCols(data.available_columns);
        setStep('map');
        return;
      }
      const editableRows = data.rows.map(
        (r: ImportPreviewRow): ConfirmRow & { is_duplicate: boolean } => ({
          row_index: r.row_index,
          date: r.date,
          description: r.description,
          amount: r.amount,
          tx_type: r.tx_type,
          category: r.suggested_category,
          notes: r.description,
          include: !r.is_duplicate,
          is_duplicate: r.is_duplicate,
        }),
      );
      setRows(editableRows);
      setStep('review');
    },
  });

  const confirmMut = useMutation({
    mutationFn: () =>
      api.finance.importConfirm({
        account_id: accountId,
        account_name: accountName,
        rows: rows.map(({ is_duplicate: _d, ...r }) => r),
      }),
    onSuccess: (data) => {
      setResult(data);
      setStep('done');
      onImported();
    },
  });

  function updateRow(idx: number, patch: Partial<ConfirmRow>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  const includedCount = rows.filter((r) => r.include).length;
  const dupCount = preview?.duplicate_count ?? 0;

  // Separate bank account vs credit card banks for the picker
  const allBanks = banksData?.banks ?? [];
  const ccBanks = allBanks.filter((b) => b.key.endsWith('_cc'));
  const savingsBanks = allBanks.filter((b) => !b.key.endsWith('_cc'));

  // ── Step indicator ────────────────────────────────────────────────────────

  const STEPS: { id: Step; label: string }[] = [
    { id: 'upload', label: 'Upload' },
    { id: 'map', label: 'Map cols' },
    { id: 'review', label: 'Review' },
    { id: 'done', label: 'Done' },
  ];
  const stepIdx = STEPS.findIndex((s) => s.id === step);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
      <div style={{
        position: 'relative', width: '100%', maxWidth: 780, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        background: 'var(--surface)', borderRadius: 20,
        border: '1px solid var(--border-default)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, font: '500 16px/1 var(--font-display)', color: 'var(--fg-1)' }}>
              Import Statement
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--fg-4)' }}>
              {step === 'upload' && 'Upload a CSV, Excel, or PDF statement from your bank'}
              {step === 'map' && 'Map CSV columns to the right fields'}
              {step === 'review' && `Review ${rows.length} transactions — AI has suggested categories`}
              {step === 'done' && 'Import complete'}
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ color: 'var(--fg-4)', background: 'none', border: 0, cursor: 'pointer', padding: 4, borderRadius: 6 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Step pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '12px 24px 0', flexShrink: 0 }}>
          {STEPS.map(({ id, label }, i) => {
            const isDone = stepIdx > i;
            const isActive = step === id;
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700,
                    background: isActive ? 'var(--primary-500)' : isDone ? 'var(--accent-green)' : 'var(--surface-elev)',
                    color: (isActive || isDone) ? 'white' : 'var(--fg-4)',
                    border: `1px solid ${isActive ? 'var(--primary-500)' : isDone ? 'var(--accent-green)' : 'var(--border-default)'}`,
                    flexShrink: 0,
                  }}>
                    {isDone ? '✓' : i + 1}
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 500, color: isActive ? 'var(--primary-300)' : isDone ? 'var(--accent-green)' : 'var(--fg-4)' }}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <ChevronRight style={{ width: 12, height: 12, color: 'var(--fg-disabled)', margin: '0 8px' }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* ── Step 1: Upload ── */}
          {step === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Account */}
              <div>
                <FieldLabel>Account *</FieldLabel>
                <select className={selectCls} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nickname || a.name}{a.last4 ? ` ••••${a.last4}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Bank / CC picker */}
              <div>
                <FieldLabel>Bank or card (optional — helps auto-detect format)</FieldLabel>
                <select className={selectCls} value={bankKey} onChange={(e) => setBankKey(e.target.value)}>
                  <option value="">Auto-detect</option>
                  {savingsBanks.length > 0 && (
                    <optgroup label="── Bank Accounts ──">
                      {savingsBanks.map((b) => (
                        <option key={b.key} value={b.key}>{b.name}</option>
                      ))}
                    </optgroup>
                  )}
                  {ccBanks.length > 0 && (
                    <optgroup label="── Credit Cards ──">
                      {ccBanks.map((b) => (
                        <option key={b.key} value={b.key}>{b.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Drag-and-drop file zone */}
              <div>
                <FieldLabel>Statement File *</FieldLabel>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xls,.xlsx,.pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 10, borderRadius: 12, padding: '32px 20px',
                    border: `2px dashed ${dragging ? 'var(--primary-400)' : file ? 'var(--accent-green)' : 'var(--border-default)'}`,
                    background: dragging ? 'rgba(139,124,255,0.06)' : file ? 'rgba(61,255,152,0.04)' : 'var(--surface-elev)',
                    cursor: 'pointer', transition: 'all 200ms',
                  }}
                >
                  {file ? (
                    <>
                      <CheckCircle2 style={{ width: 28, height: 28, color: 'var(--accent-green)' }} />
                      <div style={{ textAlign: 'center' }}>
                        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500, color: 'var(--fg-1)' }}>{file.name}</p>
                        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--fg-4)' }}>
                          {(file.size / 1024).toFixed(1)} KB · click to change
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload style={{ width: 28, height: 28, color: 'var(--fg-4)' }} />
                      <div style={{ textAlign: 'center' }}>
                        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500, color: 'var(--fg-2)' }}>
                          Drop your statement here, or <span style={{ color: 'var(--primary-300)', textDecoration: 'underline' }}>browse</span>
                        </p>
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--fg-4)' }}>
                          CSV · Excel (.xls, .xlsx) · PDF
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Supported formats hint */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-elev)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <Building2 style={{ width: 12, height: 12, color: 'var(--fg-4)' }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Bank accounts</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 11.5, color: 'var(--fg-3)', lineHeight: '17px' }}>
                    HDFC, ICICI, SBI, Axis, Kotak, Yes Bank, IDFC First
                  </p>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-elev)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <CreditCard style={{ width: 12, height: 12, color: 'var(--fg-4)' }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Credit cards</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 11.5, color: 'var(--fg-3)', lineHeight: '17px' }}>
                    HDFC CC, ICICI CC, Axis CC, SBI CC, Kotak CC, Amex
                  </p>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--fg-4)', lineHeight: '17px' }}>
                Don't see your bank? Upload anyway — you'll map columns manually.
                Export CSV, XLS, or PDF from your bank's NetBanking or mobile app.
              </p>

              {previewMut.isError && (
                <p style={{ fontSize: 12, color: 'var(--accent-red)', margin: 0 }}>{String(previewMut.error)}</p>
              )}
            </div>
          )}

          {/* ── Step 2: Column mapping ── */}
          {step === 'map' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-3)', lineHeight: '20px' }}>
                Couldn't auto-detect your bank format. Map the CSV columns below:
              </p>

              {(['date', 'description'] as const).map((field) => (
                <div key={field}>
                  <FieldLabel>{field} column *</FieldLabel>
                  <select
                    className={selectCls}
                    value={colMap[field] ?? ''}
                    onChange={(e) => setColMap((m) => ({ ...m, [field]: e.target.value }))}
                  >
                    <option value="">— select —</option>
                    {availableCols.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ))}

              <div>
                <FieldLabel>Amount style</FieldLabel>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { label: 'Separate Debit / Credit', mode: 'split' },
                    { label: 'Single signed Amount', mode: 'single' },
                  ].map(({ label, mode }) => {
                    const active = mode === 'single' ? colMap.amount !== undefined : colMap.amount === undefined;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          if (mode === 'single') {
                            setColMap((m) => ({ ...m, debit: undefined, credit: undefined, amount: '' }));
                          } else {
                            setColMap((m) => ({ ...m, amount: undefined, debit: '', credit: '' }));
                          }
                        }}
                        style={{
                          flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12.5,
                          cursor: 'pointer', transition: 'all 200ms', fontWeight: active ? 500 : 400,
                          background: active ? 'rgba(139,124,255,0.15)' : 'var(--surface-elev)',
                          border: `1px solid ${active ? 'rgba(139,124,255,0.50)' : 'var(--border-default)'}`,
                          color: active ? 'var(--primary-300)' : 'var(--fg-3)',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {colMap.amount !== undefined ? (
                <div>
                  <FieldLabel>Amount column *</FieldLabel>
                  <select className={selectCls} value={colMap.amount ?? ''} onChange={(e) => setColMap((m) => ({ ...m, amount: e.target.value }))}>
                    <option value="">— select —</option>
                    {availableCols.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ) : (
                <>
                  {(['debit', 'credit'] as const).map((field) => (
                    <div key={field}>
                      <FieldLabel>{field} column *</FieldLabel>
                      <select className={selectCls} value={colMap[field] ?? ''} onChange={(e) => setColMap((m) => ({ ...m, [field]: e.target.value }))}>
                        <option value="">— select —</option>
                        {availableCols.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  ))}
                </>
              )}

              {previewMut.isError && (
                <p style={{ fontSize: 12, color: 'var(--accent-red)', margin: 0 }}>{String(previewMut.error)}</p>
              )}
            </div>
          )}

          {/* ── Step 3: Review ── */}
          {step === 'review' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Summary bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--fg-4)' }}>
                {preview?.bank_detected && (
                  <span style={{ padding: '2px 10px', borderRadius: 999, background: 'rgba(139,124,255,0.14)', border: '1px solid rgba(139,124,255,0.30)', color: 'var(--primary-300)', fontWeight: 500, fontSize: 12 }}>
                    {preview.bank_detected}
                  </span>
                )}
                <span>{rows.length} rows parsed</span>
                {dupCount > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent-yellow)' }}>
                    <AlertTriangle style={{ width: 12, height: 12 }} /> {dupCount} possible duplicate{dupCount > 1 ? 's' : ''}
                  </span>
                )}
                <span style={{ marginLeft: 'auto', fontWeight: 500, color: 'var(--fg-2)' }}>
                  {includedCount} will be imported
                </span>
              </div>

              {/* Bulk actions */}
              <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                {[
                  { label: 'Select all', fn: () => setRows((rs) => rs.map((r) => ({ ...r, include: true }))) },
                  { label: 'Deselect all', fn: () => setRows((rs) => rs.map((r) => ({ ...r, include: false }))) },
                  { label: 'Skip duplicates', fn: () => setRows((rs) => rs.map((r) => ({ ...r, include: !r.is_duplicate }))) },
                ].map(({ label, fn }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={fn}
                    style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--primary-300)', padding: 0, textDecoration: 'underline', textUnderlineOffset: 2, fontSize: 12 }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border-default)' }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-elev)', borderBottom: '1px solid var(--border-default)' }}>
                      {['', 'Date', 'Description', 'Amount', 'Type', 'Category'].map((h) => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Amount' ? 'right' : 'left', fontSize: 11, color: 'var(--fg-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr
                        key={row.row_index}
                        style={{
                          borderBottom: '1px solid var(--border-subtle)',
                          opacity: row.include ? 1 : 0.35,
                          background: row.is_duplicate && row.include ? 'rgba(245,158,11,0.06)' : 'transparent',
                          transition: 'opacity 150ms',
                        }}
                      >
                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={row.include}
                            onChange={(e) => updateRow(i, { include: e.target.checked })}
                            style={{ accentColor: 'var(--primary-500)', width: 13, height: 13 }}
                          />
                        </td>
                        <td style={{ padding: '7px 10px', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--fg-4)', whiteSpace: 'nowrap' }}>
                          {row.date}
                        </td>
                        <td style={{ padding: '7px 10px', color: 'var(--fg-3)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.is_duplicate && (
                            <span title="Possible duplicate" style={{ marginRight: 4, color: 'var(--accent-yellow)' }}>⚠</span>
                          )}
                          {row.description}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 500, color: row.tx_type === 'income' ? 'var(--accent-green)' : 'var(--fg-2)', whiteSpace: 'nowrap' }}>
                          {row.tx_type === 'income' ? '+' : '−'}₹{row.amount.toLocaleString('en-IN')}
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          <select
                            value={row.tx_type}
                            onChange={(e) => updateRow(i, { tx_type: e.target.value as 'income' | 'expense' })}
                            style={{ fontSize: 11.5, padding: '2px 4px', borderRadius: 5, background: 'var(--surface-elev)', border: '1px solid var(--border-default)', color: 'var(--fg-2)', outline: 'none', width: '100%' }}
                          >
                            <option value="expense">Expense</option>
                            <option value="income">Income</option>
                          </select>
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          <select
                            value={row.category}
                            onChange={(e) => updateRow(i, { category: e.target.value })}
                            style={{ fontSize: 11.5, padding: '2px 4px', borderRadius: 5, background: 'var(--surface-elev)', border: '1px solid var(--border-default)', color: 'var(--fg-2)', outline: 'none', width: '100%' }}
                          >
                            {ALL_CATEGORIES.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {confirmMut.isError && (
                <p style={{ fontSize: 12, color: 'var(--accent-red)', margin: 0 }}>{String(confirmMut.error)}</p>
              )}
            </div>
          )}

          {/* ── Step 4: Done ── */}
          {step === 'done' && result && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 16 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(61,255,152,0.12)', border: '2px solid var(--accent-green)', display: 'grid', placeItems: 'center' }}>
                <CheckCircle2 style={{ width: 32, height: 32, color: 'var(--accent-green)' }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, font: '500 20px/1.2 var(--font-display)', color: 'var(--fg-1)' }}>
                  Import complete
                </p>
                <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--fg-3)' }}>
                  <strong style={{ color: 'var(--accent-green)' }}>{result.imported}</strong> transaction{result.imported !== 1 ? 's' : ''} imported
                  {result.skipped > 0 && (
                    <>, <strong style={{ color: 'var(--accent-yellow)' }}>{result.skipped}</strong> skipped as duplicates</>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                style={{
                  marginTop: 8, height: 38, padding: '0 24px', borderRadius: 10,
                  font: '500 13px/1 var(--font-sans)', color: 'white',
                  background: 'var(--grad-primary)', border: 'none', cursor: 'pointer',
                  boxShadow: 'var(--elev-glow)',
                }}
              >
                Done
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'done' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => {
                if (step === 'upload') onClose();
                else if (step === 'map' || step === 'review') setStep('upload');
              }}
              style={{ height: 34, padding: '0 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', background: 'var(--surface-elev)', border: '1px solid var(--border-default)', color: 'var(--fg-3)' }}
            >
              {step === 'upload' ? 'Cancel' : '← Back'}
            </button>

            {step === 'upload' && (
              <button
                type="button"
                disabled={!file || !accountId || previewMut.isPending}
                onClick={() => previewMut.mutate(undefined)}
                style={{
                  height: 34, padding: '0 18px', borderRadius: 8,
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  font: '500 13px/1 var(--font-sans)', color: 'white',
                  background: 'var(--grad-primary)', border: 'none', cursor: 'pointer',
                  opacity: (!file || !accountId || previewMut.isPending) ? 0.4 : 1,
                  transition: 'opacity 200ms',
                }}
              >
                {previewMut.isPending
                  ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Analysing…</>
                  : <>Parse & Categorise <ChevronRight style={{ width: 14, height: 14 }} /></>
                }
              </button>
            )}

            {step === 'map' && (
              <button
                type="button"
                disabled={
                  !colMap.date || !colMap.description ||
                  (colMap.amount === undefined && (!colMap.debit || !colMap.credit)) ||
                  previewMut.isPending
                }
                onClick={() => previewMut.mutate(colMap as ColumnMapping)}
                style={{
                  height: 34, padding: '0 18px', borderRadius: 8,
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  font: '500 13px/1 var(--font-sans)', color: 'white',
                  background: 'var(--grad-primary)', border: 'none', cursor: 'pointer',
                  opacity: previewMut.isPending ? 0.4 : 1,
                }}
              >
                {previewMut.isPending
                  ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Analysing…</>
                  : <>Preview <ChevronRight style={{ width: 14, height: 14 }} /></>
                }
              </button>
            )}

            {step === 'review' && (
              <button
                type="button"
                disabled={includedCount === 0 || confirmMut.isPending}
                onClick={() => confirmMut.mutate()}
                style={{
                  height: 34, padding: '0 18px', borderRadius: 8,
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  font: '500 13px/1 var(--font-sans)', color: 'white',
                  background: 'var(--grad-primary)', border: 'none', cursor: 'pointer',
                  opacity: (includedCount === 0 || confirmMut.isPending) ? 0.4 : 1,
                }}
              >
                {confirmMut.isPending
                  ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Importing…</>
                  : <>Import {includedCount} transaction{includedCount !== 1 ? 's' : ''}</>
                }
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
