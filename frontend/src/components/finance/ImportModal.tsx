/**
 * CSV Bank-Statement Import Wizard
 *
 * Step 1 — Upload: pick account, upload CSV file, optionally select bank
 * Step 2 — Map columns (only if bank not auto-detected)
 * Step 3 — Review: editable table with AI-suggested categories, duplicate warnings
 * Step 4 — Done: success / error summary
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { X, Upload, ChevronRight, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import {
  api,
  type Account,
  type ColumnMapping,
  type ConfirmRow,
  type ImportPreviewResponse,
  type ImportPreviewRow,
} from '@/lib/api';

const EXPENSE_CATEGORIES = [
  'Food & Dining', 'Transport', 'Shopping', 'Healthcare', 'Entertainment',
  'Housing', 'Utilities', 'Education', 'Fitness', 'Travel', 'Subscriptions', 'Other',
];
const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Investment', 'Gift', 'Other Income'];
const ALL_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

// ---------------------------------------------------------------------------
type Step = 'upload' | 'map' | 'review' | 'done';

interface Props {
  accounts: Account[];
  onClose: () => void;
  onImported: () => void;
}

// ---------------------------------------------------------------------------
export function ImportModal({ accounts, onClose, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step state
  const [step, setStep] = useState<Step>('upload');

  // Upload step
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [bankKey, setBankKey] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);

  // Column mapping step
  const [availableCols, setAvailableCols] = useState<string[]>([]);
  const [colMap, setColMap] = useState<Partial<ColumnMapping>>({});

  // Review step
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [rows, setRows] = useState<(ConfirmRow & { is_duplicate: boolean })[]>([]);

  // Done step
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  // Known banks list
  const { data: banksData } = useQuery({
    queryKey: ['import-banks'],
    queryFn: api.finance.importBanks,
  });

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const accountName = selectedAccount
    ? (selectedAccount.nickname || selectedAccount.name)
    : accountId;

  // ── Preview mutation (upload CSV) ──
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
      // Build editable rows
      const editableRows = data.rows.map(
        (r: ImportPreviewRow): ConfirmRow & { is_duplicate: boolean } => ({
          row_index: r.row_index,
          date: r.date,
          description: r.description,
          amount: r.amount,
          tx_type: r.tx_type,
          category: r.suggested_category,
          notes: r.description,
          include: !r.is_duplicate, // default: skip duplicates
          is_duplicate: r.is_duplicate,
        }),
      );
      setRows(editableRows);
      setStep('review');
    },
  });

  // ── Confirm mutation ──
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

  // ── Helpers ──
  function updateRow(idx: number, patch: Partial<ConfirmRow>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  const includedCount = rows.filter((r) => r.include).length;
  const dupCount = preview?.duplicate_count ?? 0;

  // ---------------------------------------------------------------------------
  // Render steps
  // ---------------------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-700 shrink-0">
          <div>
            <h2 className="font-semibold text-ink-800 dark:text-ink-100">Import Bank Statement</h2>
            <p className="text-xs text-ink-500 mt-0.5">
              {step === 'upload' && 'Upload a CSV from your bank'}
              {step === 'map' && 'Map columns to the right fields'}
              {step === 'review' && `Review ${rows.length} transactions — AI has suggested categories`}
              {step === 'done' && 'Import complete'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 px-6 pt-3 pb-1 shrink-0">
          {(['upload', 'map', 'review', 'done'] as Step[]).map((s, i, arr) => {
            const done = arr.indexOf(step) > i;
            const active = step === s;
            return (
              <div key={s} className="flex items-center gap-0">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold
                  ${active ? 'bg-violet-600 text-white' : done ? 'bg-emerald-500 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400'}`}>
                  {done ? '✓' : i + 1}
                </div>
                <span className={`text-[11px] ml-1 font-medium capitalize
                  ${active ? 'text-violet-600' : done ? 'text-emerald-500' : 'text-zinc-400'}`}>
                  {s === 'map' ? 'Map cols' : s}
                </span>
                {i < arr.length - 1 && <ChevronRight className="w-3 h-3 text-zinc-300 mx-2" />}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* ── Step 1: Upload ── */}
          {step === 'upload' && (
            <div className="space-y-5">
              {/* Account picker */}
              <div>
                <label className="text-xs font-medium text-ink-500 block mb-1">Account *</label>
                <select
                  className="input w-full"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nickname || a.name} {a.last4 ? `••••${a.last4}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Bank picker (optional — helps auto-detect) */}
              <div>
                <label className="text-xs font-medium text-ink-500 block mb-1">
                  Bank (optional — helps auto-detect columns)
                </label>
                <select
                  className="input w-full"
                  value={bankKey}
                  onChange={(e) => setBankKey(e.target.value)}
                >
                  <option value="">Auto-detect</option>
                  {(banksData?.banks ?? []).map((b) => (
                    <option key={b.key} value={b.key}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* File upload */}
              <div>
                <label className="text-xs font-medium text-ink-500 block mb-1">CSV File *</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-600 py-8 hover:border-violet-400 transition-colors"
                >
                  <Upload className="w-8 h-8 text-zinc-400" />
                  {file ? (
                    <span className="text-sm font-medium text-violet-600">{file.name}</span>
                  ) : (
                    <span className="text-sm text-zinc-400">Click to select a .csv file</span>
                  )}
                </button>
              </div>

              {/* Tip */}
              <p className="text-[11px] text-ink-400 leading-relaxed">
                Supported: HDFC, ICICI, SBI, Axis, Kotak, Yes Bank, IDFC First. For other banks,
                you'll map columns manually after upload.
              </p>

              {previewMut.isError && (
                <p className="text-xs text-rose-500">{String(previewMut.error)}</p>
              )}
            </div>
          )}

          {/* ── Step 2: Column mapping ── */}
          {step === 'map' && (
            <div className="space-y-4">
              <p className="text-sm text-ink-600">
                We couldn't auto-detect your bank format. Map the CSV columns to the right fields:
              </p>

              {(['date', 'description'] as const).map((field) => (
                <div key={field}>
                  <label className="text-xs font-medium text-ink-500 block mb-1 capitalize">
                    {field} column *
                  </label>
                  <select
                    className="input w-full"
                    value={colMap[field] ?? ''}
                    onChange={(e) => setColMap((m) => ({ ...m, [field]: e.target.value }))}
                  >
                    <option value="">— select —</option>
                    {availableCols.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ))}

              <div>
                <label className="text-xs font-medium text-ink-500 block mb-1">Amount style</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setColMap((m) => ({ ...m, amount: undefined, debit: '', credit: '' }))}
                    className={`flex-1 rounded-lg border py-2 text-sm ${!colMap.amount ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30' : 'border-zinc-200 dark:border-zinc-700'}`}
                  >
                    Separate Debit / Credit columns
                  </button>
                  <button
                    type="button"
                    onClick={() => setColMap((m) => ({ ...m, debit: undefined, credit: undefined, amount: '' }))}
                    className={`flex-1 rounded-lg border py-2 text-sm ${colMap.amount !== undefined ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30' : 'border-zinc-200 dark:border-zinc-700'}`}
                  >
                    Single signed Amount column
                  </button>
                </div>
              </div>

              {colMap.amount !== undefined ? (
                <div>
                  <label className="text-xs font-medium text-ink-500 block mb-1">Amount column *</label>
                  <select className="input w-full" value={colMap.amount ?? ''} onChange={(e) => setColMap((m) => ({ ...m, amount: e.target.value }))}>
                    <option value="">— select —</option>
                    {availableCols.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ) : (
                <>
                  {(['debit', 'credit'] as const).map((field) => (
                    <div key={field}>
                      <label className="text-xs font-medium text-ink-500 block mb-1 capitalize">{field} column *</label>
                      <select className="input w-full" value={colMap[field] ?? ''} onChange={(e) => setColMap((m) => ({ ...m, [field]: e.target.value }))}>
                        <option value="">— select —</option>
                        {availableCols.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  ))}
                </>
              )}

              {previewMut.isError && (
                <p className="text-xs text-rose-500">{String(previewMut.error)}</p>
              )}
            </div>
          )}

          {/* ── Step 3: Review ── */}
          {step === 'review' && (
            <div className="space-y-3">
              {/* Summary bar */}
              <div className="flex items-center gap-4 text-xs text-ink-500 flex-wrap">
                {preview?.bank_detected && (
                  <span className="px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-medium">
                    {preview.bank_detected}
                  </span>
                )}
                <span>{rows.length} rows parsed</span>
                {dupCount > 0 && (
                  <span className="text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {dupCount} possible duplicate{dupCount > 1 ? 's' : ''}
                  </span>
                )}
                <span className="ml-auto font-medium text-ink-700 dark:text-ink-200">
                  {includedCount} will be imported
                </span>
              </div>

              {/* Bulk actions */}
              <div className="flex gap-2 text-xs">
                <button type="button" className="text-violet-500 hover:underline"
                  onClick={() => setRows((rs) => rs.map((r) => ({ ...r, include: true })))}>
                  Select all
                </button>
                <span className="text-ink-300">·</span>
                <button type="button" className="text-violet-500 hover:underline"
                  onClick={() => setRows((rs) => rs.map((r) => ({ ...r, include: false })))}>
                  Deselect all
                </button>
                <span className="text-ink-300">·</span>
                <button type="button" className="text-violet-500 hover:underline"
                  onClick={() => setRows((rs) => rs.map((r) => ({ ...r, include: !r.is_duplicate })))}>
                  Skip duplicates
                </button>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-800 text-ink-500">
                      <th className="px-2 py-2 text-left w-8">✓</th>
                      <th className="px-2 py-2 text-left w-24">Date</th>
                      <th className="px-2 py-2 text-left">Description</th>
                      <th className="px-2 py-2 text-right w-24">Amount</th>
                      <th className="px-2 py-2 text-left w-32">Type</th>
                      <th className="px-2 py-2 text-left w-40">Category</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {rows.map((row, i) => (
                      <tr
                        key={row.row_index}
                        className={`transition-colors ${
                          !row.include
                            ? 'opacity-40'
                            : row.is_duplicate
                            ? 'bg-amber-50 dark:bg-amber-900/10'
                            : ''
                        }`}
                      >
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={row.include}
                            onChange={(e) => updateRow(i, { include: e.target.checked })}
                            className="rounded"
                          />
                        </td>
                        <td className="px-2 py-1.5 font-mono text-ink-600 dark:text-ink-400 whitespace-nowrap">
                          {row.date}
                        </td>
                        <td className="px-2 py-1.5 text-ink-700 dark:text-ink-300 max-w-[200px] truncate">
                          {row.is_duplicate && (
                            <span title="Possible duplicate" className="mr-1 text-amber-500">⚠</span>
                          )}
                          {row.description}
                        </td>
                        <td className={`px-2 py-1.5 text-right font-medium tabular-nums ${row.tx_type === 'income' ? 'text-emerald-600' : 'text-ink-700 dark:text-ink-300'}`}>
                          {row.tx_type === 'income' ? '+' : '−'}₹{row.amount.toLocaleString('en-IN')}
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            className="text-xs border border-zinc-200 dark:border-zinc-600 rounded px-1 py-0.5 bg-white dark:bg-zinc-800 w-full"
                            value={row.tx_type}
                            onChange={(e) => updateRow(i, { tx_type: e.target.value as 'income' | 'expense' })}
                          >
                            <option value="expense">Expense</option>
                            <option value="income">Income</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            className="text-xs border border-zinc-200 dark:border-zinc-600 rounded px-1 py-0.5 bg-white dark:bg-zinc-800 w-full"
                            value={row.category}
                            onChange={(e) => updateRow(i, { category: e.target.value })}
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
                <p className="text-xs text-rose-500">{String(confirmMut.error)}</p>
              )}
            </div>
          )}

          {/* ── Step 4: Done ── */}
          {step === 'done' && result && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <CheckCircle2 className="w-14 h-14 text-emerald-500" />
              <div className="text-center">
                <p className="text-lg font-semibold text-ink-800 dark:text-ink-100">
                  Import complete!
                </p>
                <p className="text-sm text-ink-500 mt-1">
                  <span className="text-emerald-600 font-semibold">{result.imported}</span> transactions imported
                  {result.skipped > 0 && (
                    <>, <span className="text-amber-600 font-semibold">{result.skipped}</span> skipped</>
                  )}
                </p>
              </div>
              <button type="button" className="btn-primary mt-2" onClick={onClose}>
                Done
              </button>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {step !== 'done' && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-200 dark:border-zinc-700 shrink-0">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (step === 'upload') onClose();
                else if (step === 'map') setStep('upload');
                else if (step === 'review') setStep('upload');
              }}
            >
              {step === 'upload' ? 'Cancel' : '← Back'}
            </button>

            {step === 'upload' && (
              <button
                type="button"
                className="btn-primary flex items-center gap-2"
                disabled={!file || !accountId || previewMut.isPending}
                onClick={() => previewMut.mutate(undefined)}
              >
                {previewMut.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</>
                ) : (
                  <>Parse & Categorise <ChevronRight className="w-4 h-4" /></>
                )}
              </button>
            )}

            {step === 'map' && (
              <button
                type="button"
                className="btn-primary flex items-center gap-2"
                disabled={
                  !colMap.date || !colMap.description ||
                  (colMap.amount === undefined && (!colMap.debit || !colMap.credit)) ||
                  previewMut.isPending
                }
                onClick={() => previewMut.mutate(colMap as ColumnMapping)}
              >
                {previewMut.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</>
                ) : (
                  <>Preview <ChevronRight className="w-4 h-4" /></>
                )}
              </button>
            )}

            {step === 'review' && (
              <button
                type="button"
                className="btn-primary flex items-center gap-2"
                disabled={includedCount === 0 || confirmMut.isPending}
                onClick={() => confirmMut.mutate()}
              >
                {confirmMut.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</>
                ) : (
                  <>Import {includedCount} transaction{includedCount !== 1 ? 's' : ''}</>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
