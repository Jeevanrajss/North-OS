import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Eye, EyeOff, Loader2, RefreshCw, Trash2, Wifi } from 'lucide-react';
import {
  getLockHash, setLockHash, clearLockHash, hashLock,
  getBiometricCredId, setBiometricCredId, clearBiometricCredId,
  isBiometricAvailable, registerBiometric,
} from '@/components/LockScreen';
import { PageHeader } from '@/components/PageHeader';
import { api, type LLMHealthResult, ProviderPreset, LLMTestResult, type FinanceCategoryOut, type FinanceCategoryIn, type FinanceCategoryType, type SmsDebugResult } from '@/lib/api';
import { cn } from '@/lib/cn';
import { CURRENCY_OPTS } from '@/components/subscriptions/subUtils';
import { MODULE_CONFIGS } from '@/lib/modules';
import { useModules } from '@/contexts/ModulesContext';

// ── Connection status pill ───────────────────────────────────────────────────

function ConnectionStatusPill({ result, isLoading }: { result?: LLMHealthResult; isLoading: boolean }) {
  if (isLoading) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--fg-4)' }}>
        <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" /> Checking…
      </span>
    );
  }
  if (!result) return null;

  // ok === null means "not applicable" (e.g. Anthropic)
  if (result.ok === null) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--fg-4)' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--fg-disabled)', display: 'inline-block' }} />
        Use "Test connection" to verify
      </span>
    );
  }
  if (result.ok) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--accent-green)' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-green)', boxShadow: '0 0 6px var(--accent-green)', display: 'inline-block' }} />
        Connected · {result.models.length} model{result.models.length !== 1 ? 's' : ''} loaded
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--accent-red)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-red)', display: 'inline-block' }} />
      Not reachable
    </span>
  );
}

// ---------------------------------------------------------------------------
// Shared input / button styles (match the rest of the app)
// ---------------------------------------------------------------------------
const inputCls =
  'w-full rounded-lg px-3 py-2 text-sm text-ink-200 outline-none placeholder:text-ink-500 disabled:opacity-50 transition-colors'
  + ' focus:border-[rgba(139,124,255,0.50)]';

const selectCls =
  'w-full rounded-lg px-3 py-2 text-sm text-ink-200 outline-none transition-colors'
  + ' focus:border-[rgba(139,124,255,0.50)]';

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[12px] text-ink-500 uppercase tracking-wide mb-0.5">
      {children}
    </label>
  );
}

function SectionHead({ title, desc }: { title: string; desc?: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ margin: 0, font: '500 26px/1.15 var(--font-display)', letterSpacing: '-0.02em', color: 'var(--fg-1)' }}>
        {title}
      </h2>
      {desc && <p style={{ margin: '6px 0 0', color: 'var(--fg-4)', fontSize: 13 }}>{desc}</p>}
    </div>
  );
}

/** Deprecated: kept for backward compat */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 mb-5">
      <h2 className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-500 shrink-0">
        {children}
      </h2>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
    </div>
  );
}

function BtnPrimary({
  onClick, disabled, children,
}: { onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 rounded-lg text-xs font-medium text-accent border border-accent/40 bg-accent/10 hover:bg-accent/20 active:scale-[0.97] active:opacity-80 disabled:opacity-40 disabled:pointer-events-none transition-colors"
    >
      {children}
    </button>
  );
}

function BtnSecondary({
  onClick, disabled, children,
}: { onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 rounded-lg text-xs font-medium text-ink-400 hover:text-ink-200 border border-[rgba(255,255,255,0.08)] hover:bg-white/5 active:scale-[0.97] active:opacity-80 disabled:opacity-40 disabled:pointer-events-none transition-colors"
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Timezone picker
// ---------------------------------------------------------------------------
const ALL_TIMEZONES: string[] =
  typeof (Intl as any).supportedValuesOf === 'function'
    ? (Intl as any).supportedValuesOf('timeZone')
    : [
        'UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo',
        'Asia/Shanghai', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
        'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
        'America/Sao_Paulo', 'Australia/Sydney', 'Pacific/Auckland',
      ];

function tzOffsetLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: tz, timeZoneName: 'shortOffset',
    }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

function TimezoneField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>Timezone</Label>
      <select
        className={inputCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {ALL_TIMEZONES.map((tz) => (
          <option key={tz} value={tz}>
            {tz}  {tzOffsetLabel(tz)}
          </option>
        ))}
      </select>
      <p className="text-[10px] text-ink-400 mt-0.5">
        Used for date display and time-aware greetings.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider tile order
// ---------------------------------------------------------------------------
const PROVIDER_ORDER = [
  'local', 'openai', 'anthropic', 'google',
  'groq', 'together', 'mistral', 'custom',
] as const;
type ProviderId = (typeof PROVIDER_ORDER)[number];

// ---------------------------------------------------------------------------
// Model input with live suggestions dropdown
// ---------------------------------------------------------------------------
function ModelField({
  label, value, onChange, suggestions, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  suggestions: string[]; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref}>
      <Label>{label}</Label>
      <div className="relative">
        <input
          className={inputCls}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? 'model-id'}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
        />
        {suggestions.length > 0 && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-300 text-xs"
            onClick={() => setOpen((o) => !o)}
          >
            ▾
          </button>
        )}
        {open && suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full bg-ink-900 border border-ink-700 rounded-md shadow-xl max-h-48 overflow-auto">
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-xs text-ink-300 hover:bg-ink-800 hover:text-ink-100"
                  onClick={() => { onChange(s); setOpen(false); }}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Finance Categories panel
// ---------------------------------------------------------------------------
const EMOJI_SUGGESTIONS = ['💸','🍽️','🚗','🛒','🏥','🎬','🏠','💡','📚','💪','✈️','💳','🤝','💼','💰','📈','🎁','💵','🎮','🎵','📱','🏋️','🌮','☕','🎨','🏪','🧴','🐾','💊','🚀','🎓','🏦'];

function FinanceCategoriesPanel() {
  const qc = useQueryClient();
  const { data: cats = [], isLoading } = useQuery({
    queryKey: ['finance-categories'],
    queryFn: api.finance.listCategories,
  });

  const [tab, setTab] = useState<'expense' | 'income'>('expense');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [addName, setAddName] = useState('');
  const [addEmoji, setAddEmoji] = useState('💸');
  const [addType, setAddType] = useState<'expense' | 'income' | 'both'>('expense');
  const [showAdd, setShowAdd] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['finance-categories'] });
    qc.invalidateQueries({ queryKey: ['finance-meta'] });
  };

  const createMut = useMutation({
    mutationFn: (payload: FinanceCategoryIn) => api.finance.createCategory(payload),
    onSuccess: () => { invalidate(); setAddName(''); setAddEmoji('💸'); setShowAdd(false); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<FinanceCategoryIn> }) =>
      api.finance.updateCategory(id, patch),
    onSuccess: () => { invalidate(); setEditId(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.finance.deleteCategory(id),
    onSuccess: invalidate,
  });

  const visibleCats = (cats as FinanceCategoryOut[]).filter(c =>
    tab === 'expense' ? c.type === 'expense' || c.type === 'both'
                      : c.type === 'income'  || c.type === 'both'
  );

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)' }}>
        {(['expense', 'income'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '11px 0', fontSize: 13, fontWeight: 500,
              background: 'none', border: 'none', cursor: 'pointer',
              color: tab === t ? 'var(--fg-1)' : 'var(--fg-4)',
              borderBottom: tab === t ? '2px solid var(--primary-500)' : '2px solid transparent',
              marginBottom: -1, transition: 'color 150ms',
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Category list */}
      <div style={{ minHeight: 80 }}>
        {isLoading && (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--fg-4)', fontSize: 13 }}>Loading…</div>
        )}
        {visibleCats.map(cat => (
          <div key={cat.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            {editId === cat.id ? (
              /* Inline edit row */
              <>
                <input
                  value={editEmoji}
                  onChange={e => setEditEmoji(e.target.value)}
                  style={{ width: 36, textAlign: 'center', fontSize: 18, background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 6, padding: '2px 0' }}
                  maxLength={2}
                />
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') updateMut.mutate({ id: cat.id, patch: { name: editName, emoji: editEmoji } });
                    if (e.key === 'Escape') setEditId(null);
                  }}
                  style={{ flex: 1, fontSize: 13, background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 6, padding: '4px 8px', color: 'var(--fg-1)', outline: 'none' }}
                />
                <button
                  onClick={() => updateMut.mutate({ id: cat.id, patch: { name: editName, emoji: editEmoji } })}
                  disabled={!editName.trim() || updateMut.isPending}
                  style={{ fontSize: 11.5, padding: '3px 10px', borderRadius: 6, background: 'var(--primary-500)', border: 'none', color: 'white', cursor: 'pointer', fontWeight: 500 }}
                >
                  Save
                </button>
                <button
                  onClick={() => setEditId(null)}
                  style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--fg-3)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </>
            ) : (
              /* View row */
              <>
                <span style={{ fontSize: 18, width: 24, textAlign: 'center', flexShrink: 0 }}>{cat.emoji}</span>
                <span style={{ flex: 1, fontSize: 13.5, color: 'var(--fg-1)', fontWeight: 500 }}>{cat.name}</span>
                {cat.type === 'both' && (
                  <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 999, background: 'rgba(139,124,255,0.15)', color: 'var(--primary-300)', border: '1px solid rgba(139,124,255,0.25)', fontWeight: 500 }}>both</span>
                )}
                {cat.is_system && (
                  <span title="System category — cannot be deleted" style={{ fontSize: 11, color: 'var(--fg-disabled)' }}>🔒</span>
                )}
                <button
                  onClick={() => { setEditId(cat.id); setEditName(cat.name); setEditEmoji(cat.emoji); }}
                  style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 6, background: 'none', border: '1px solid var(--border-default)', color: 'var(--fg-3)', cursor: 'pointer' }}
                >
                  Edit
                </button>
                {!cat.is_system && (
                  <button
                    onClick={() => { if (confirm(`Delete "${cat.name}"?`)) deleteMut.mutate(cat.id); }}
                    style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 6, background: 'none', border: '1px solid rgba(248,113,113,0.35)', color: 'var(--accent-red)', cursor: 'pointer' }}
                  >
                    Delete
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add category row */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)' }}>
        {!showAdd ? (
          <button
            onClick={() => { setShowAdd(true); setAddType(tab); }}
            style={{ fontSize: 13, color: 'var(--primary-300)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <span style={{ fontSize: 16 }}>+</span> Add category
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={addEmoji}
                onChange={e => setAddEmoji(e.target.value)}
                style={{ width: 40, textAlign: 'center', fontSize: 18, background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 6, padding: '4px 0' }}
                maxLength={2}
                placeholder="💸"
              />
              <input
                autoFocus
                value={addName}
                onChange={e => setAddName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && addName.trim()) createMut.mutate({ name: addName.trim(), emoji: addEmoji || '💸', type: addType }); }}
                placeholder="Category name"
                style={{ flex: 1, fontSize: 13, background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 6, padding: '6px 10px', color: 'var(--fg-1)', outline: 'none' }}
              />
            </div>
            {/* Emoji quick-picks */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {EMOJI_SUGGESTIONS.map(e => (
                <button key={e} onClick={() => setAddEmoji(e)} style={{ fontSize: 16, background: addEmoji === e ? 'rgba(139,124,255,0.20)' : 'var(--surface-elev)', border: `1px solid ${addEmoji === e ? 'rgba(139,124,255,0.40)' : 'var(--border-subtle)'}`, borderRadius: 6, padding: '2px 4px', cursor: 'pointer' }}>{e}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--fg-4)', marginRight: 2 }}>Appears in:</span>
              {(['expense', 'income', 'both'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setAddType(t)}
                  style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: addType === t ? 600 : 400, background: addType === t ? 'rgba(139,124,255,0.15)' : 'var(--surface-elev)', border: `1px solid ${addType === t ? 'rgba(139,124,255,0.40)' : 'var(--border-default)'}`, color: addType === t ? 'var(--primary-300)' : 'var(--fg-3)' }}
                >
                  {t}
                </button>
              ))}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button
                  onClick={() => { setShowAdd(false); setAddName(''); setAddEmoji('💸'); }}
                  style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--fg-3)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  disabled={!addName.trim() || createMut.isPending}
                  onClick={() => createMut.mutate({ name: addName.trim(), emoji: addEmoji || '💸', type: addType })}
                  style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, background: 'var(--primary-500)', border: 'none', color: 'white', cursor: 'pointer', fontWeight: 500, opacity: !addName.trim() ? 0.4 : 1 }}
                >
                  {createMut.isPending ? 'Adding…' : 'Add'}
                </button>
              </div>
            </div>
            {createMut.isError && (
              <p style={{ fontSize: 12, color: 'var(--accent-red)', margin: 0 }}>{String(createMut.error)}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modules panel
// ---------------------------------------------------------------------------

function ModulesPanel() {
  const { isEnabled, setEnabled } = useModules();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
      {/* Dashboard — always on, locked */}
      <div
        className="card"
        style={{ padding: 20 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🏠</span>
            <span style={{ font: '500 14px/1.2 var(--font-sans)', color: 'var(--fg-1)' }}>Dashboard</span>
          </div>
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
            padding: '2px 8px', borderRadius: 999,
            background: 'rgba(139,124,255,0.12)', color: 'var(--primary-300)',
            border: '1px solid rgba(139,124,255,0.25)',
          }}>
            Always on
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-4)', lineHeight: 1.5 }}>
          Your personal OS home screen — stats, AI briefing, and quick links.
        </p>
      </div>

      {MODULE_CONFIGS.map((mod) => {
        const on = isEnabled(mod.id);
        return (
          <div
            key={mod.id}
            className="card"
            style={{
              padding: 20,
              opacity: on ? 1 : 0.55,
              transition: 'opacity 150ms',
              cursor: 'pointer',
            }}
            onClick={() => setEnabled(mod.id, !on)}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{mod.icon}</span>
                <span style={{ font: '500 14px/1.2 var(--font-sans)', color: 'var(--fg-1)' }}>{mod.label}</span>
              </div>
              {/* Toggle pill */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setEnabled(mod.id, !on); }}
                aria-label={on ? `Disable ${mod.label}` : `Enable ${mod.label}`}
                style={{
                  width: 42, height: 24, borderRadius: 12, flexShrink: 0,
                  background: on ? 'var(--primary-500)' : 'rgba(255,255,255,0.12)',
                  border: 'none', cursor: 'pointer', position: 'relative',
                  transition: 'background 200ms',
                }}
              >
                <span style={{
                  display: 'block', width: 18, height: 18, borderRadius: '50%',
                  background: 'white', position: 'absolute', top: 3,
                  left: on ? 21 : 3, transition: 'left 200ms',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }} />
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-4)', lineHeight: 1.5 }}>
              {mod.description}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Settings page
// ---------------------------------------------------------------------------
// ── SMS Setup Panel ─────────────────────────────────────────────────────────

function SmsSetupPanel() {
  const qc = useQueryClient();

  const statusQ = useQuery({
    queryKey: ['sms-status'],
    queryFn: () => api.sms.status(),
    staleTime: 30_000,
  });

  // API key state — load from backend settings
  const settingsQ = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.getAll(),
    staleTime: Infinity,
  });

  const [apiKey, setApiKey] = useState('');
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [debugData, setDebugData] = useState<SmsDebugResult | null>(null);
  const [debugging, setDebugging] = useState(false);

  // Encryption key state
  const [encKey, setEncKey] = useState('');
  const [encKeyDirty, setEncKeyDirty] = useState(false);
  const [savingEncKey, setSavingEncKey] = useState(false);
  const [encKeySaved, setEncKeySaved] = useState(false);
  const [showEncKey, setShowEncKey] = useState(false);

  // Populate inputs when settings load
  useEffect(() => {
    const stored = settingsQ.data?.http_sms_api_key ?? '';
    if (stored && !apiKeyDirty) setApiKey(stored);
    const storedEnc = settingsQ.data?.http_sms_encryption_key ?? '';
    if (storedEnc && !encKeyDirty) setEncKey(storedEnc);
  }, [settingsQ.data, apiKeyDirty, encKeyDirty]);

  async function saveApiKey() {
    setSavingKey(true);
    try {
      await api.settings.update({ http_sms_api_key: apiKey.trim() });
      setApiKeyDirty(false);
      setKeySaved(true);
      setTimeout(() => setKeySaved(false), 2000);
      qc.invalidateQueries({ queryKey: ['sms-status'] });
      qc.invalidateQueries({ queryKey: ['settings'] });
    } finally {
      setSavingKey(false);
    }
  }

  async function saveEncKey() {
    setSavingEncKey(true);
    try {
      await api.settings.update({ http_sms_encryption_key: encKey.trim() });
      setEncKeyDirty(false);
      setEncKeySaved(true);
      setTimeout(() => setEncKeySaved(false), 2000);
      qc.invalidateQueries({ queryKey: ['sms-status'] });
      qc.invalidateQueries({ queryKey: ['settings'] });
    } finally {
      setSavingEncKey(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await api.sms.syncHttpSms();
      const checked = res.messages_checked ?? 0;
      setSyncMsg(res.new_transactions > 0
        ? `✓ ${res.new_transactions} new transaction${res.new_transactions > 1 ? 's' : ''} found (${checked} messages scanned).`
        : `✓ Scanned ${checked} messages — no new transactions.`);
      qc.invalidateQueries({ queryKey: ['sms-pending'] });
      await qc.refetchQueries({ queryKey: ['sms-status'] }); // force immediate refetch, bypass stale time
    } catch (e: unknown) {
      setSyncMsg(e instanceof Error ? e.message : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleDebug() {
    setDebugging(true);
    setDebugData(null);
    try {
      const res = await api.sms.debug();
      setDebugData(res);
    } catch (e: unknown) {
      setDebugData({ error: e instanceof Error ? e.message : 'Debug failed' });
    } finally {
      setDebugging(false);
    }
  }

  const status = statusQ.data;
  const imAvail = status?.imessage_available ?? false;
  const httpSmsConfigured = status?.httpsms_configured ?? false;
  const encryptionEnabled = status?.httpsms_encryption_enabled ?? false;
  const lastSync = status?.httpsms_last_sync;

  function fmtLastSync(iso: string | null | undefined) {
    if (!iso) return null;
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  const codeSty: React.CSSProperties = {
    display: 'block', padding: '10px 14px', borderRadius: 9,
    background: 'var(--input-bg)', border: '1px solid var(--input-border)',
    color: 'var(--fg-2)', fontSize: 12, fontFamily: 'var(--font-mono)',
    wordBreak: 'break-all', userSelect: 'all' as const,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── HTTP SMS card ── */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 18 }}>📱</span>
          <h4 style={{ margin: 0, font: '500 15px/1.2 var(--font-display)', color: 'var(--fg-1)' }}>
            HTTP SMS (Android)
          </h4>
          {httpSmsConfigured && (
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '2px 7px', borderRadius: 999,
              background: 'rgba(61,255,152,0.12)', color: 'var(--accent-green)',
              border: '1px solid rgba(61,255,152,0.25)',
            }}>Connected</span>
          )}
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--fg-4)', lineHeight: 1.6 }}>
          You've installed <strong style={{ color: 'var(--fg-2)' }}>HTTP SMS</strong> — great. No forwarding rules needed.
          The app automatically sends all SMS to their cloud. Paste your API key below and click <em>Sync</em> to pull bank transactions in.
        </p>

        {/* API key input row */}
        <Label>HTTP SMS API Key</Label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="password"
              value={apiKey}
              placeholder="Paste your API key from httpsms.com/keys"
              onChange={(e) => { setApiKey(e.target.value); setApiKeyDirty(true); }}
              className={inputCls}
              style={{ paddingRight: apiKey ? 32 : undefined }}
            />
          </div>
          <button
            type="button"
            onClick={saveApiKey}
            disabled={!apiKey.trim() || savingKey}
            className="px-4 py-2 rounded-lg text-xs font-medium text-accent border border-accent/40 bg-accent/10 hover:bg-accent/20 disabled:opacity-40 transition-all"
          >
            {savingKey ? 'Saving…' : keySaved ? '✓ Saved' : 'Save'}
          </button>
        </div>

        {/* Sync button + last sync */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={handleSync}
            disabled={!httpSmsConfigured || syncing}
            className="px-4 py-2 rounded-lg text-xs font-medium text-accent border border-accent/40 bg-accent/10 hover:bg-accent/20 disabled:opacity-40 transition-all"
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          {lastSync && !syncMsg && (
            <span style={{ fontSize: 11.5, color: 'var(--fg-disabled)' }}>
              Last sync: {fmtLastSync(lastSync)}
            </span>
          )}
          {syncMsg && (
            <span style={{ fontSize: 12, color: syncMsg.startsWith('✓') ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              {syncMsg}
            </span>
          )}
        </div>

        <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--fg-disabled)', lineHeight: 1.5 }}>
          Get your key at <strong>httpsms.com → API Keys</strong>. The app will filter for bank senders automatically (HDFCBK, ICICIB, SBI, Axis, etc.).
        </p>

        {/* ── E2E Encryption ── */}
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 13 }}>🔒</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-2)' }}>End-to-End Encryption</span>
            {encryptionEnabled && (
              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                padding: '2px 7px', borderRadius: 999,
                background: 'rgba(61,255,152,0.12)', color: 'var(--accent-green)',
                border: '1px solid rgba(61,255,152,0.25)',
              }}>Enabled</span>
            )}
          </div>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--fg-4)', lineHeight: 1.6 }}>
            If you've set an encryption key in the HTTP SMS Android app (Settings → Encryption Key),
            paste the same passphrase here. Messages will be AES-256 decrypted before being parsed.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type={showEncKey ? 'text' : 'password'}
                value={encKey}
                placeholder="Passphrase from HTTP SMS Android app"
                onChange={(e) => { setEncKey(e.target.value); setEncKeyDirty(true); }}
                className={inputCls}
                style={{ paddingRight: 32 }}
              />
              <button
                type="button"
                onClick={() => setShowEncKey((v) => !v)}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                  color: 'var(--fg-4)',
                }}
              >
                {showEncKey
                  ? <EyeOff style={{ width: 14, height: 14 }} />
                  : <Eye style={{ width: 14, height: 14 }} />
                }
              </button>
            </div>
            <button
              type="button"
              onClick={saveEncKey}
              disabled={!encKey.trim() || savingEncKey}
              className="px-4 py-2 rounded-lg text-xs font-medium text-accent border border-accent/40 bg-accent/10 hover:bg-accent/20 disabled:opacity-40 transition-all"
            >
              {savingEncKey ? 'Saving…' : encKeySaved ? '✓ Saved' : 'Save'}
            </button>
          </div>
        </div>

        {/* Debug section */}
        {httpSmsConfigured && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={handleDebug}
                disabled={debugging}
                style={{
                  padding: '5px 12px', borderRadius: 7, fontSize: 11.5, fontWeight: 500,
                  background: 'var(--input-bg)', border: '1px solid var(--input-border)',
                  color: 'var(--fg-4)', cursor: debugging ? 'default' : 'pointer',
                  opacity: debugging ? 0.6 : 1,
                }}
              >
                {debugging ? 'Running…' : '🔍 Diagnose'}
              </button>
              <span style={{ fontSize: 11.5, color: 'var(--fg-disabled)' }}>
                Shows what threads &amp; messages the API returns
              </span>
            </div>

            {debugData && (
              <div style={{ marginTop: 10 }}>
                {/* Threads summary */}
                {Array.isArray(debugData.threads) && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--fg-4)', marginBottom: 6 }}>
                      <strong style={{ color: 'var(--fg-2)' }}>{debugData.threads.length}</strong> threads found
                      {' · '}<strong style={{ color: 'var(--accent-green)' }}>
                        {debugData.threads.filter((t) => t.is_bank).length}
                      </strong> matched as bank senders
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {debugData.threads.map((t, i) => (
                        <span key={i} style={{
                          fontSize: 11, padding: '3px 8px', borderRadius: 6,
                          background: t.is_bank ? 'rgba(61,255,152,0.10)' : 'var(--surface-elev)',
                          border: `1px solid ${t.is_bank ? 'rgba(61,255,152,0.25)' : 'var(--border-subtle)'}`,
                          color: t.is_bank ? 'var(--accent-green)' : 'var(--fg-4)',
                        }}>
                          {t.contact}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Parse samples */}
                {Array.isArray(debugData.parse_samples) && debugData.parse_samples.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--fg-4)', marginBottom: 6 }}>Sample message parse results:</div>
                    {debugData.parse_samples.map((s, i) => (
                      <div key={i} style={{
                        padding: '8px 10px', borderRadius: 8, marginBottom: 6,
                        background: 'var(--surface-elev)', border: '1px solid var(--border-subtle)',
                        fontSize: 11.5,
                      }}>
                        <div style={{ color: 'var(--fg-3)', marginBottom: 3, fontFamily: 'var(--font-mono)' }}>
                          [{s.sender}] {s.body_preview}
                        </div>
                        <div style={{ color: s.parsed_ok ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                          {s.parsed_ok
                            ? `✓ Parsed — ${s.parsed_type} ₹${s.parsed_amount}`
                            : '✗ Not recognised as a transaction'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Always show full raw JSON — essential when threads=0 */}
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 11.5, color: 'var(--fg-4)', cursor: 'pointer' }}>
                    Raw API response
                  </summary>
                  <pre style={{
                    ...codeSty,
                    marginTop: 6, maxHeight: 400, overflow: 'auto',
                    fontSize: 10.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  }}>
                    {JSON.stringify(debugData, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── iMessage card ── */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 18 }}>💻</span>
          <h4 style={{ margin: 0, font: '500 15px/1.2 var(--font-display)', color: 'var(--fg-1)' }}>
            macOS iMessage Relay
          </h4>
          {imAvail != null && (
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '2px 7px', borderRadius: 999,
              background: imAvail ? 'rgba(61,255,152,0.12)' : 'rgba(255,255,255,0.05)',
              color: imAvail ? 'var(--accent-green)' : 'var(--fg-4)',
              border: `1px solid ${imAvail ? 'rgba(61,255,152,0.25)' : 'rgba(255,255,255,0.08)'}`,
            }}>
              {imAvail ? '✓ Available' : 'Not detected'}
            </span>
          )}
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--fg-4)', lineHeight: 1.6 }}>
          {imAvail
            ? 'Messages.db found. Use the "Scan iMessage" button in Finance to pull recent bank SMS directly from your Mac.'
            : 'Enable iPhone → Settings → Messages → Text Message Forwarding → this Mac. Then SMS sync to Mac Messages and we can read them locally.'}
        </p>
      </div>

    </div>
  );
}

// ── App Lock Panel ──────────────────────────────────────────────────────────

function AppLockPanel() {
  const [isSet, setIsSet]           = useState(() => !!getLockHash());
  const [mode, setMode]             = useState<'idle' | 'set' | 'change' | 'remove'>('idle');
  const [newPin, setNewPin]         = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [error, setError]           = useState('');
  const [saved, setSaved]           = useState(false);
  const [busy, setBusy]             = useState(false);

  // Biometric
  const [bioAvail, setBioAvail]       = useState(false);
  const [bioEnabled, setBioEnabled]   = useState(() => !!getBiometricCredId());
  const [bioLoading, setBioLoading]   = useState(false);
  const [bioError, setBioError]       = useState('');
  const [bioDisabling, setBioDisabling] = useState(false); // show inline PIN form
  const [bioPin, setBioPin]           = useState('');
  const [bioBusy, setBioBusy]         = useState(false);

  useEffect(() => { isBiometricAvailable().then(setBioAvail); }, []);

  function reset() {
    setMode('idle');
    setNewPin(''); setConfirmPin(''); setCurrentPin('');
    setError(''); setBusy(false);
  }

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleSet() {
    if (newPin.length < 4) { setError('Minimum 4 characters'); return; }
    if (newPin !== confirmPin) { setError("Passwords don't match"); return; }
    setBusy(true);
    setLockHash(await hashLock(newPin));
    setIsSet(true);
    reset();
    flashSaved();
  }

  async function handleChange() {
    setBusy(true);
    if ((await hashLock(currentPin)) !== getLockHash()) {
      setError('Current PIN is incorrect'); setBusy(false); return;
    }
    if (newPin.length < 4) { setError('Minimum 4 characters'); setBusy(false); return; }
    if (newPin !== confirmPin) { setError("Passwords don't match"); setBusy(false); return; }
    setLockHash(await hashLock(newPin));
    reset();
    flashSaved();
  }

  async function handleRemove() {
    setBusy(true);
    if ((await hashLock(currentPin)) !== getLockHash()) {
      setError('Wrong PIN or password'); setBusy(false); return;
    }
    clearLockHash();
    clearBiometricCredId();
    setBioEnabled(false);
    setIsSet(false);
    reset();
  }

  async function handleEnableBiometric() {
    setBioError(''); setBioLoading(true);
    try {
      const credId = await registerBiometric();
      setBiometricCredId(credId);
      setBioEnabled(true);
    } catch {
      setBioError('Biometric setup was cancelled or not supported on this device.');
    } finally {
      setBioLoading(false);
    }
  }

  async function handleDisableBiometric() {
    setBioBusy(true);
    setBioError('');
    if ((await hashLock(bioPin)) !== getLockHash()) {
      setBioError('Wrong PIN or password'); setBioBusy(false); return;
    }
    clearBiometricCredId();
    setBioEnabled(false);
    setBioDisabling(false);
    setBioPin('');
    setBioBusy(false);
  }

  const errorBox = (msg: string) => (
    <p style={{ margin: 0, fontSize: 12, color: 'var(--accent-red)', padding: '6px 10px', background: 'rgba(255,91,110,0.08)', borderRadius: 6 }}>
      {msg}
    </p>
  );

  const pinInput = (label: string, val: string, set: (v: string) => void, opts?: { autoFocus?: boolean; hasError?: boolean; onEnter?: () => void; disabled?: boolean }) => (
    <div>
      <label style={{ display: 'block', fontSize: 11.5, color: 'var(--fg-4)', marginBottom: 5 }}>{label}</label>
      <input
        type="password"
        value={val}
        autoFocus={opts?.autoFocus}
        autoComplete="new-password"
        placeholder="••••••"
        disabled={opts?.disabled ?? busy}
        onKeyDown={(e) => { if (e.key === 'Enter' && opts?.onEnter) opts.onEnter(); }}
        onChange={(e) => { set(e.target.value); setError(''); }}
        style={{
          width: '100%', padding: '9px 12px', borderRadius: 9,
          background: 'var(--surface-elev)',
          border: `1px solid ${opts?.hasError ? 'rgba(255,91,110,0.4)' : 'rgba(255,255,255,0.08)'}`,
          color: 'var(--fg-1)', fontSize: 14,
          letterSpacing: '0.15em', outline: 'none', boxSizing: 'border-box',
          opacity: (opts?.disabled ?? busy) ? 0.6 : 1,
        }}
      />
    </div>
  );

  const showBioCard = isSet && (bioAvail || bioEnabled);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── PIN / password card ── */}
      <div className="card" style={{ padding: 20 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: mode !== 'idle' ? 20 : 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 16 }}>{isSet ? '🔐' : '🔓'}</span>
              <h4 style={{ margin: 0, font: '500 15px/1.2 var(--font-display)', color: 'var(--fg-1)' }}>App Lock</h4>
              {isSet && (
                <span style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                  padding: '2px 7px', borderRadius: 999,
                  background: 'rgba(61,255,152,0.12)', color: 'var(--accent-green)',
                  border: '1px solid rgba(61,255,152,0.25)',
                }}>ON</span>
              )}
              {saved && (
                <span style={{ fontSize: 11, color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Check style={{ width: 11, height: 11 }} /> Saved
                </span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--fg-4)', lineHeight: 1.5 }}>
              {isSet
                ? 'A PIN or password is required every time the app starts.'
                : 'Require a PIN or password whenever the app is opened.'}
            </p>
          </div>

          {mode === 'idle' && (
            <div style={{ display: 'flex', gap: 6, marginLeft: 16, flexShrink: 0 }}>
              {isSet ? (
                <>
                  <BtnSecondary onClick={() => setMode('change')}>Change PIN</BtnSecondary>
                  <button
                    type="button"
                    onClick={() => { setMode('remove'); setCurrentPin(''); setError(''); }}
                    style={{
                      padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                      background: 'rgba(255,91,110,0.08)', border: '1px solid rgba(255,91,110,0.30)',
                      color: 'var(--accent-red)', transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,91,110,0.18)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,91,110,0.08)')}
                  >
                    Remove
                  </button>
                </>
              ) : (
                <BtnPrimary onClick={() => setMode('set')}>Set PIN / Password</BtnPrimary>
              )}
            </div>
          )}
        </div>

        {/* ── Set form ── */}
        {mode === 'set' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pinInput('New PIN or password', newPin, setNewPin, { autoFocus: true, hasError: !!error, onEnter: handleSet })}
            {pinInput('Confirm', confirmPin, setConfirmPin, { hasError: !!error, onEnter: handleSet })}
            {error && errorBox(error)}
            <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
              <BtnPrimary onClick={handleSet} disabled={busy}>{busy ? 'Saving…' : 'Save'}</BtnPrimary>
              <BtnSecondary onClick={reset} disabled={busy}>Cancel</BtnSecondary>
            </div>
          </div>
        )}

        {/* ── Change form ── */}
        {mode === 'change' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pinInput('Current PIN or password', currentPin, setCurrentPin, { autoFocus: true, hasError: !!error, onEnter: handleChange })}
            {pinInput('New PIN or password', newPin, setNewPin, { hasError: !!error, onEnter: handleChange })}
            {pinInput('Confirm new', confirmPin, setConfirmPin, { hasError: !!error, onEnter: handleChange })}
            {error && errorBox(error)}
            <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
              <BtnPrimary onClick={handleChange} disabled={busy}>{busy ? 'Updating…' : 'Update PIN'}</BtnPrimary>
              <BtnSecondary onClick={reset} disabled={busy}>Cancel</BtnSecondary>
            </div>
          </div>
        )}

        {/* ── Remove form ── */}
        {mode === 'remove' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--fg-3)' }}>
              Enter your current PIN or password to remove the lock.
            </p>
            {pinInput('Current PIN or password', currentPin, setCurrentPin, { autoFocus: true, hasError: !!error, onEnter: handleRemove })}
            {error && errorBox(error)}
            <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
              <button
                type="button"
                onClick={handleRemove}
                disabled={busy || !currentPin}
                style={{
                  padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                  cursor: busy || !currentPin ? 'default' : 'pointer',
                  background: 'rgba(255,91,110,0.12)', border: '1px solid rgba(255,91,110,0.35)',
                  color: 'var(--accent-red)', transition: 'background 0.12s',
                  opacity: busy || !currentPin ? 0.5 : 1,
                }}
              >
                {busy ? 'Verifying…' : 'Remove lock'}
              </button>
              <BtnSecondary onClick={reset} disabled={busy}>Cancel</BtnSecondary>
            </div>
          </div>
        )}
      </div>

      {/* ── Biometric card ── */}
      {showBioCard && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 16 }}>🫆</span>
                <h4 style={{ margin: 0, font: '500 15px/1.2 var(--font-display)', color: 'var(--fg-1)' }}>
                  Fingerprint / Face ID
                </h4>
                {bioEnabled && (
                  <span style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                    padding: '2px 7px', borderRadius: 999,
                    background: 'rgba(61,255,152,0.12)', color: 'var(--accent-green)',
                    border: '1px solid rgba(61,255,152,0.25)',
                  }}>ON</span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--fg-4)', lineHeight: 1.5 }}>
                {bioEnabled
                  ? 'Biometric unlock is active. PIN still works as a fallback.'
                  : bioAvail
                    ? 'Skip the PIN prompt — use Touch ID / Face ID to unlock instantly.'
                    : 'Biometric was registered but may not be available right now.'}
              </p>
            </div>

            <div style={{ marginLeft: 16, flexShrink: 0 }}>
              {bioEnabled && !bioDisabling ? (
                <button
                  type="button"
                  onClick={() => { setBioDisabling(true); setBioPin(''); setBioError(''); }}
                  style={{
                    padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    background: 'rgba(255,91,110,0.08)', border: '1px solid rgba(255,91,110,0.30)',
                    color: 'var(--accent-red)', transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,91,110,0.18)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,91,110,0.08)')}
                >
                  Disable
                </button>
              ) : !bioEnabled ? (
                <BtnPrimary onClick={handleEnableBiometric} disabled={bioLoading || !bioAvail}>
                  {bioLoading ? 'Setting up…' : 'Enable'}
                </BtnPrimary>
              ) : null}
            </div>
          </div>

          {/* ── Inline PIN form when disabling biometric ── */}
          {bioDisabling && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--fg-3)' }}>
                Enter your PIN or password to confirm.
              </p>
              <input
                type="password"
                value={bioPin}
                autoFocus
                autoComplete="current-password"
                placeholder="••••••"
                disabled={bioBusy}
                onKeyDown={(e) => { if (e.key === 'Enter') handleDisableBiometric(); }}
                onChange={(e) => { setBioPin(e.target.value); setBioError(''); }}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 9,
                  background: 'var(--surface-elev)',
                  border: `1px solid ${bioError ? 'rgba(255,91,110,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  color: 'var(--fg-1)', fontSize: 14,
                  letterSpacing: '0.15em', outline: 'none', boxSizing: 'border-box',
                  opacity: bioBusy ? 0.6 : 1,
                }}
              />
              {bioError && (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--accent-red)', padding: '6px 10px', background: 'rgba(255,91,110,0.08)', borderRadius: 6 }}>
                  {bioError}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleDisableBiometric}
                  disabled={bioBusy || !bioPin}
                  style={{
                    padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                    cursor: bioBusy || !bioPin ? 'default' : 'pointer',
                    background: 'rgba(255,91,110,0.12)', border: '1px solid rgba(255,91,110,0.35)',
                    color: 'var(--accent-red)', transition: 'background 0.12s',
                    opacity: bioBusy || !bioPin ? 0.5 : 1,
                  }}
                >
                  {bioBusy ? 'Verifying…' : 'Confirm disable'}
                </button>
                <BtnSecondary onClick={() => { setBioDisabling(false); setBioPin(''); setBioError(''); }} disabled={bioBusy}>
                  Cancel
                </BtnSecondary>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

// ── Notification settings panel ──────────────────────────────────────────────

/** Reusable toggle pill */
function NotifToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      style={{
        width: 46, height: 26, borderRadius: 13, flexShrink: 0,
        background: on ? 'var(--primary-500)' : 'rgba(255,255,255,0.12)',
        border: 'none', cursor: 'pointer', position: 'relative',
        transition: 'background 200ms',
      }}
    >
      <span style={{
        display: 'block', width: 20, height: 20, borderRadius: '50%',
        background: 'white', position: 'absolute', top: 3,
        left: on ? 23 : 3, transition: 'left 200ms',
        boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
      }} />
    </button>
  );
}

/** Convert 24h "HH:MM" to "H:MMam/pm" */
function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

const timeInputCls =
  'rounded-lg px-3 py-1.5 text-sm tabular-nums text-ink-200 outline-none '
  + 'bg-[var(--surface-elev)] border border-[rgba(255,255,255,0.08)] '
  + 'focus:border-[rgba(139,124,255,0.50)]';

function NotificationSettingsPanel() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.getAll(),
    staleTime: Infinity,
  });

  // State for every row
  const [briefingEnabled, setBriefingEnabled] = useState(true);
  const [briefingTime,    setBriefingTime]    = useState('08:30');
  const [habitEnabled,    setHabitEnabled]    = useState(true);
  const [habitTime,       setHabitTime]       = useState('21:00');
  const [subEnabled,      setSubEnabled]      = useState(true);
  const [subDays,         setSubDays]         = useState('3');
  const [budgetEnabled,   setBudgetEnabled]   = useState(false);
  const [quietStart,      setQuietStart]      = useState('22:00');
  const [quietEnd,        setQuietEnd]        = useState('07:00');
  // Sound is a local device preference — stored in localStorage, not synced to backend
  const [soundEnabled,    setSoundEnabled]    = useState(() =>
    localStorage.getItem('notif.sound_enabled') !== 'false',
  );

  const [saved,      setSaved]      = useState(false);
  const [testing,    setTesting]    = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const [browserPermission, setBrowserPermission] = useState<string>(() =>
    'Notification' in window ? Notification.permission : 'not-supported',
  );

  const initialised = useRef(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!settings || initialised.current) return;
    initialised.current = true;
    setBriefingEnabled((settings['notif.morning_briefing_enabled'] as string) !== 'false');
    setBriefingTime((settings['notif.morning_briefing_time'] as string) || '08:30');
    setHabitEnabled((settings['notif.habit_reminder_enabled'] as string) !== 'false');
    setHabitTime((settings['notif.habit_reminder_time'] as string) || '21:00');
    setSubEnabled((settings['notif.sub_alert_enabled'] as string) !== 'false');
    setSubDays((settings['notif.sub_alert_days_before'] as string) || '3');
    setBudgetEnabled((settings['notif.budget_warning_enabled'] as string) === 'true');
    setQuietStart((settings['notif.quiet_start'] as string) || '22:00');
    setQuietEnd((settings['notif.quiet_end'] as string) || '07:00');
  }, [settings]);

  // Auto-save 600ms after any toggle/time change (skip the initial load)
  useEffect(() => {
    if (!initialised.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { handleSave(); }, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefingEnabled, briefingTime, habitEnabled, habitTime, subEnabled, subDays, budgetEnabled, quietStart, quietEnd]);

  async function handleSave() {
    await api.settings.update({
      'notif.morning_briefing_enabled': briefingEnabled ? 'true' : 'false',
      'notif.morning_briefing_time':    briefingTime,
      'notif.habit_reminder_enabled':   habitEnabled ? 'true' : 'false',
      'notif.habit_reminder_time':      habitTime,
      'notif.sub_alert_enabled':        subEnabled ? 'true' : 'false',
      'notif.sub_alert_days_before':    subDays,
      'notif.budget_warning_enabled':   budgetEnabled ? 'true' : 'false',
      'notif.quiet_start':              quietStart,
      'notif.quiet_end':                quietEnd,
    });
    try { await fetch('/api/v1/notifications/reschedule', { method: 'POST' }); } catch {}
    qc.invalidateQueries({ queryKey: ['settings'] });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function handleSoundToggle(v: boolean) {
    setSoundEnabled(v);
    localStorage.setItem('notif.sound_enabled', v ? 'true' : 'false');
  }

  async function requestPermission() {
    if (!('Notification' in window)) return;
    setBrowserPermission(await Notification.requestPermission());
  }

  async function handleTest(type: string) {
    setTesting(type);
    setTestResult(null);
    try {
      let res: { created: number };
      if (type === 'briefing') res = await api.notifications.triggerMorningBriefing();
      else if (type === 'habit') res = await api.notifications.triggerHabitCheck();
      else if (type === 'sub')   res = await api.notifications.triggerSubCheck();
      else                       res = await api.notifications.triggerBudgetCheck();
      setTestResult(res.created > 0
        ? `✓ ${res.created} notification${res.created !== 1 ? 's' : ''} created`
        : '— Nothing pending right now');
      qc.invalidateQueries({ queryKey: ['notif-count'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    } catch (e: unknown) {
      setTestResult(`Error: ${e instanceof Error ? e.message : 'failed'}`);
    } finally {
      setTesting(null);
    }
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)',
  };
  const lastRowStyle: React.CSSProperties = { ...rowStyle, borderBottom: 'none' };

  const permGranted = browserPermission === 'granted';
  const permDenied  = browserPermission === 'denied';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Browser permission banner — only shown when not yet granted */}
      {!permGranted && (
        <div
          className="card"
          style={{
            padding: '14px 20px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 16,
            background: permDenied ? 'rgba(255,91,110,0.06)' : 'rgba(139,124,255,0.06)',
            border: `1px solid ${permDenied ? 'rgba(255,91,110,0.20)' : 'rgba(139,124,255,0.20)'}`,
          }}
        >
          <div>
            <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--fg-1)' }}>
              {permDenied ? '🚫 Notifications blocked' : '🔔 Enable desktop notifications'}
            </span>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--fg-4)' }}>
              {permDenied
                ? 'Unblock in your browser site settings to receive alerts.'
                : 'Get OS-level popups when new alerts arrive — even in background.'}
            </p>
          </div>
          {!permDenied && (
            <button
              type="button"
              onClick={requestPermission}
              className="px-4 py-2 rounded-lg text-xs font-medium text-accent border border-accent/40 bg-accent/10 hover:bg-accent/20 transition-colors shrink-0"
            >
              Allow
            </button>
          )}
        </div>
      )}

      {/* Main settings card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>

        {/* ── Morning briefing ── */}
        <div style={rowStyle}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--fg-1)', marginBottom: 4 }}>
              Morning briefing
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-4)' }}>
              A short summary of habits, journal and finance at the start of the day.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 24, flexShrink: 0 }}>
            <input
              type="time"
              value={briefingTime}
              disabled={!briefingEnabled}
              onChange={(e) => setBriefingTime(e.target.value)}
              className={timeInputCls}
              style={{ opacity: briefingEnabled ? 1 : 0.4 }}
            />
            <NotifToggle on={briefingEnabled} onChange={setBriefingEnabled} />
          </div>
        </div>

        {/* ── Habit reminders ── */}
        <div style={rowStyle}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--fg-1)', marginBottom: 4 }}>
              Habit reminders
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-4)' }}>
              One ping per day if there are still unchecked habits at {fmt12(habitTime)}.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 24, flexShrink: 0 }}>
            <input
              type="time"
              value={habitTime}
              disabled={!habitEnabled}
              onChange={(e) => setHabitTime(e.target.value)}
              className={timeInputCls}
              style={{ opacity: habitEnabled ? 1 : 0.4 }}
            />
            <NotifToggle on={habitEnabled} onChange={setHabitEnabled} />
          </div>
        </div>

        {/* ── Subscription alerts ── */}
        <div style={rowStyle}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--fg-1)', marginBottom: 4 }}>
              Subscription alerts
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-4)' }}>
              Warn{' '}
              <select
                value={subDays}
                onChange={(e) => setSubDays(e.target.value)}
                style={{
                  fontSize: 13, color: 'var(--fg-2)', background: 'var(--surface-elev)',
                  border: '1px solid var(--border-default)', borderRadius: 6,
                  padding: '1px 4px', cursor: 'pointer', outline: 'none',
                }}
              >
                {['1', '2', '3', '5', '7'].map((d) => (
                  <option key={d} value={d}>{d} day{d !== '1' ? 's' : ''}</option>
                ))}
              </select>
              {' '}before any renewal.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 24, flexShrink: 0 }}>
            <NotifToggle on={subEnabled} onChange={setSubEnabled} />
          </div>
        </div>

        {/* ── Budget warnings ── */}
        <div style={rowStyle}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--fg-1)', marginBottom: 4 }}>
              Budget warnings
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-4)' }}>
              Notify when any category crosses 80% of its monthly budget.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 24, flexShrink: 0 }}>
            <NotifToggle on={budgetEnabled} onChange={setBudgetEnabled} />
          </div>
        </div>

        {/* ── Notification sound ── */}
        <div style={rowStyle}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--fg-1)', marginBottom: 4 }}>
              Notification sound
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-4)' }}>
              Play a sound when a new notification arrives.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 24, flexShrink: 0 }}>
            <NotifToggle on={soundEnabled} onChange={handleSoundToggle} />
          </div>
        </div>

        {/* ── Quiet hours ── */}
        <div style={lastRowStyle}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--fg-1)', marginBottom: 4 }}>
              Quiet hours
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-4)' }}>
              No pings during these hours.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 24, flexShrink: 0 }}>
            <input
              type="time"
              value={quietStart}
              onChange={(e) => setQuietStart(e.target.value)}
              className={timeInputCls}
            />
            <span style={{ fontSize: 12, color: 'var(--fg-4)' }}>to</span>
            <input
              type="time"
              value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value)}
              className={timeInputCls}
            />
          </div>
        </div>

      </div>

      {/* Test row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: 'var(--fg-4)', marginRight: 4 }}>Test now:</span>
        {([
          { key: 'briefing', label: '☀️ Briefing',    enabled: briefingEnabled },
          { key: 'habit',    label: '🔥 Habits',      enabled: habitEnabled },
          { key: 'sub',      label: '🔄 Subs',        enabled: subEnabled },
          { key: 'budget',   label: '💰 Budget',      enabled: budgetEnabled },
        ] as const).map(({ key, label, enabled }) => (
          <button
            key={key}
            type="button"
            disabled={!enabled || !!testing}
            onClick={() => handleTest(key)}
            style={{
              fontSize: 11.5, padding: '4px 10px', borderRadius: 6,
              background: 'var(--input-bg)', border: '1px solid var(--input-border)',
              color: 'var(--fg-3)', cursor: !enabled || !!testing ? 'default' : 'pointer',
              opacity: !enabled || !!testing ? 0.35 : 1,
              transition: 'opacity 150ms',
            }}
          >
            {testing === key ? '…' : label}
          </button>
        ))}
        {testResult && (
          <span style={{
            fontSize: 12, marginLeft: 6,
            color: testResult.startsWith('✓') ? 'var(--accent-green)' : 'var(--fg-3)',
          }}>
            {testResult}
          </span>
        )}
      </div>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-2 rounded-lg text-xs font-medium text-accent border border-accent/40 bg-accent/10 hover:bg-accent/20 transition-colors"
        >
          Save settings
        </button>
        {saved && (
          <span style={{ fontSize: 11, color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Check style={{ width: 11, height: 11 }} /> Saved
          </span>
        )}
      </div>

    </div>
  );
}

// ── Update checker button ─────────────────────────────────────────────────────

function UpdateChecker() {
  const [status, setStatus] = useState<'idle' | 'checking' | 'done' | 'error'>('idle');

  async function handleCheck() {
    setStatus('checking');
    try {
      // @ts-ignore — window.electronAPI injected by Electron preload (if available)
      const ipc = (window as any).electronAPI;
      if (ipc?.checkForUpdates) {
        await ipc.checkForUpdates();
        setStatus('done');
      } else {
        // Running in browser/dev — no Electron IPC
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
    setTimeout(() => setStatus('idle'), 4000);
  }

  const label =
    status === 'checking' ? 'Checking…' :
    status === 'done'     ? 'Check sent ✓' :
    status === 'error'    ? 'Not available' :
    'Check for updates';

  return (
    <button
      type="button"
      onClick={handleCheck}
      disabled={status === 'checking'}
      style={{
        height: 28, padding: '0 12px', borderRadius: 8,
        fontSize: 11.5, fontWeight: 500,
        color: status === 'done' ? 'var(--accent-green)' : status === 'error' ? 'var(--fg-4)' : 'var(--fg-3)',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'transparent',
        cursor: status === 'checking' ? 'default' : 'pointer',
        transition: 'color 200ms',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

// ── Settings page ────────────────────────────────────────────────────────────

export function Settings() {
  const qc = useQueryClient();

  // ── App version ────────────────────────────────────────────────────
  const { data: versionData } = useQuery({
    queryKey: ['app-version'],
    queryFn: api.appVersion,
    staleTime: Infinity,
  });
  const appVersion = versionData?.version ?? '—';

  // ── Remote data ────────────────────────────────────────────────────
  const { data: providers = {} } = useQuery({
    queryKey: ['settings-providers'],
    queryFn: api.settings.getProviders,
  });

  const { data: savedSettings, isLoading: loadingSettings } = useQuery({
    queryKey: ['settings-all'],
    queryFn: api.settings.getAll,
  });

  const { data: liveModelsResp } = useQuery({
    queryKey: ['settings-models'],
    queryFn: api.settings.listModels,
    retry: false,
    staleTime: 60_000,
  });
  const liveModels = liveModelsResp?.models ?? [];

  // Quick health probe — runs on mount and after saving AI settings
  const { data: healthResult, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ['settings-health'],
    queryFn: api.settings.llmHealth,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // ── Profile form state ─────────────────────────────────────────────
  const [profileName, setProfileName] = useState('');
  const [profileCurrency, setProfileCurrency] = useState('INR');
  const [profileTimezone, setProfileTimezone] = useState(
    () => localStorage.getItem('user_timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [profileDirty, setProfileDirty] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // ── AI form state ──────────────────────────────────────────────────
  const [provider, setProvider] = useState<ProviderId>('local');
  const [apiBase, setApiBase] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [chatModel, setChatModel] = useState('');
  const [fastModel, setFastModel] = useState('');
  const [embedModel, setEmbedModel] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [aiDirty, setAiDirty] = useState(false);
  const [testResult, setTestResult] = useState<LLMTestResult | null>(null);

  // Populate forms once settings load (run once only)
  const initialised = useRef(false);
  useEffect(() => {
    if (!savedSettings || initialised.current) return;
    initialised.current = true;

    // Profile — prefer backend value, fall back to localStorage
    const backendName = (savedSettings['profile.name'] as string) || '';
    const backendCurrency = (savedSettings['profile.currency'] as string) || '';
    const lsName = localStorage.getItem('user_name') ?? '';
    const lsCurrency = localStorage.getItem('sub_display_currency') ?? 'INR';

    const backendTimezone = (savedSettings['profile.timezone'] as string) || '';
    const lsTimezone = localStorage.getItem('user_timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone;

    const name = backendName || lsName;
    const currency = backendCurrency || lsCurrency;
    const timezone = backendTimezone || lsTimezone;
    setProfileName(name);
    setProfileCurrency(currency);
    setProfileTimezone(timezone);
    // Sync localStorage from backend values
    if (name) localStorage.setItem('user_name', name);
    if (currency) localStorage.setItem('sub_display_currency', currency);
    if (timezone) localStorage.setItem('user_timezone', timezone);

    // AI
    setProvider((savedSettings['ai.provider'] as ProviderId) || 'local');
    setApiBase((savedSettings['ai.api_base'] as string) || '');
    setApiKey((savedSettings['ai.api_key'] as string) || '');
    setChatModel((savedSettings['ai.chat_model'] as string) || '');
    setFastModel((savedSettings['ai.fast_model'] as string) || '');
    setEmbedModel((savedSettings['ai.embed_model'] as string) || '');
  }, [savedSettings]);

  // ── Provider tile selection ────────────────────────────────────────
  function selectProvider(pid: ProviderId) {
    const preset: ProviderPreset | undefined = providers[pid];
    const switching = pid !== provider;   // only reset fields when actually changing provider
    setProvider(pid);
    if (switching && preset?.api_base) setApiBase(preset.api_base);
    if (switching) setChatModel(preset?.suggested_chat?.[0] ?? '');
    if (switching) setFastModel(preset?.suggested_chat?.[1] ?? preset?.suggested_chat?.[0] ?? '');
    if (switching) setEmbedModel(preset?.embed_supported !== false ? (preset?.suggested_embed ?? '') : '');
    setAiDirty(true);
    setTestResult(null);
  }

  // ── Mutations ──────────────────────────────────────────────────────
  const profileMut = useMutation({
    mutationFn: () =>
      api.settings.update({
        'profile.name': profileName.trim(),
        'profile.currency': profileCurrency,
        'profile.timezone': profileTimezone,
      }),
    onSuccess: () => {
      localStorage.setItem('user_name', profileName.trim());
      localStorage.setItem('sub_display_currency', profileCurrency);
      localStorage.setItem('user_timezone', profileTimezone);
      setProfileDirty(false);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
      qc.invalidateQueries({ queryKey: ['settings-all'] });
    },
  });

  const aiSaveMut = useMutation({
    mutationFn: () =>
      api.settings.update({
        'ai.provider': provider,
        'ai.api_base': apiBase,
        'ai.api_key': apiKey,
        'ai.chat_model': chatModel,
        'ai.fast_model': fastModel,
        'ai.embed_model': embedModel,
        'ai.is_anthropic': String(providers[provider]?.is_anthropic ?? false),
      }),
    onSuccess: () => {
      setAiDirty(false);
      qc.invalidateQueries({ queryKey: ['settings-all'] });
      qc.invalidateQueries({ queryKey: ['settings-models'] });
      refetchHealth();
    },
  });

  const testMut = useMutation({
    mutationFn: async () => {
      await api.settings.update({
        'ai.provider': provider,
        'ai.api_base': apiBase,
        'ai.api_key': apiKey,
        'ai.chat_model': chatModel,
        'ai.fast_model': fastModel,
        'ai.embed_model': embedModel,
        'ai.is_anthropic': String(providers[provider]?.is_anthropic ?? false),
      });
      qc.invalidateQueries({ queryKey: ['settings-all'] });
      qc.invalidateQueries({ queryKey: ['settings-models'] });
      return api.settings.testLLM();
    },
    onSuccess: (result) => {
      setTestResult(result);
      setAiDirty(false);
      refetchHealth();
    },
    onError: (e: Error) => {
      setTestResult({ ok: false, provider, model: chatModel, response: null, error: e.message });
    },
  });

  // ── Wipe data state ────────────────────────────────────────────────
  const [wipeStep, setWipeStep] = useState(0); // 0=closed,1=warn,2=effects,3=confirm
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [wipeSuccess, setWipeSuccess] = useState(false);

  const wipeMut = useMutation({
    mutationFn: api.data.wipe,
    onSuccess: () => {
      qc.invalidateQueries(); // clear all cached query data
      setWipeStep(0);
      setWipeConfirmText('');
      setWipeSuccess(true);
      setTimeout(() => setWipeSuccess(false), 4000);
    },
  });

  // Close modal on Escape (but not while the request is in-flight)
  useEffect(() => {
    if (wipeStep === 0) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !wipeMut.isPending) {
        wipeMut.reset();
        setWipeStep(0);
        setWipeConfirmText('');
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [wipeStep, wipeMut.isPending]); // eslint-disable-line react-hooks/exhaustive-deps

  const preset: ProviderPreset | undefined = providers[provider];
  const suggestedChat = [
    ...(preset?.suggested_chat ?? []),
    ...liveModels,
  ].filter((v, i, a) => a.indexOf(v) === i);
  const embedSupported = preset?.embed_supported !== false;

  const keyLinks: Record<string, string> = {
    openai: 'https://platform.openai.com/api-keys',
    anthropic: 'https://console.anthropic.com/keys',
    google: 'https://aistudio.google.com/app/apikey',
    groq: 'https://console.groq.com/keys',
    together: 'https://api.together.xyz/settings/api-keys',
    mistral: 'https://console.mistral.ai/api-keys/',
  };

  if (loadingSettings) {
    return (
      <>
        <PageHeader title="Settings" eyebrow="SETTINGS" subtitle="Profile, preferences, and AI configuration." />
        <div className="flex items-center justify-center py-20 text-ink-500 text-sm">Loading…</div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Settings" eyebrow="SETTINGS" subtitle="Profile, preferences, and AI configuration." />

      {/* Settings grid: left sticky nav + right content */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 40, alignItems: 'flex-start' }}>

        {/* ── Left: sticky section nav ─────────────────────────────── */}
        <nav style={{ position: 'sticky', top: 88, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {([
            { id: 'profile',       label: 'Profile',       icon: '👤' },
            { id: 'ai',            label: 'AI Provider',   icon: '🤖' },
            { id: 'notifications', label: 'Notifications', icon: '🔔' },
            { id: 'sms',           label: 'SMS Config',    icon: '💬' },
            { id: 'modules',       label: 'Modules',       icon: '🧩' },
            { id: 'finance',       label: 'Finance',       icon: '💰' },
            { id: 'privacy',       label: 'Privacy',       icon: '🔒' },
            { id: 'danger',        label: 'Danger Zone',   icon: '⚠️' },
          ] as const).map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 10,
                color: 'var(--fg-3)', fontSize: 13, fontWeight: 500,
                background: 'none', border: 0, cursor: 'pointer',
                textAlign: 'left', width: '100%',
                transition: 'var(--transition)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-1)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = '';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-3)';
              }}
            >
              <span style={{ fontSize: 14, color: 'var(--fg-4)' }}>{icon}</span>
              {label}
            </button>
          ))}
        </nav>

      {/* ── Right: content sections ──────────────────────────────── */}
      <div className="space-y-6">

        {/* ── Profile ───────────────────────────────────────────── */}
        <section id="sec-profile" style={{ scrollMarginTop: 88, marginBottom: 56 }}>
          <SectionHead title="Profile" desc="How you appear across the app." />
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>

            {/* Setting rows */}
            {([
              {
                label: 'Display name',
                desc: 'Shown in headers, greeting and exports.',
                control: (
                  <input
                    className={inputCls}
                    value={profileName}
                    onChange={(e) => { setProfileName(e.target.value); setProfileDirty(true); }}
                    placeholder="e.g. Jeevan"
                    maxLength={60}
                    style={{ minWidth: 220 }}
                  />
                ),
              },
              {
                label: 'Display currency',
                desc: 'Used in finance, budgets and subscription totals.',
                control: (
                  <select
                    className={selectCls}
                    value={profileCurrency}
                    onChange={(e) => { setProfileCurrency(e.target.value); setProfileDirty(true); }}
                    style={{ minWidth: 180 }}
                  >
                    {CURRENCY_OPTS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ),
              },
            ] as const).map(({ label, desc, control }, i) => (
              <div
                key={label}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr auto',
                  gap: 24, alignItems: 'center',
                  padding: '18px 22px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <div style={{ font: '500 14px/1.3 var(--font-sans)', color: 'var(--fg-1)' }}>{label}</div>
                  <div style={{ color: 'var(--fg-4)', fontSize: 12.5, marginTop: 4 }}>{desc}</div>
                </div>
                <div>{control}</div>
              </div>
            ))}

            {/* Timezone row */}
            <div style={{ padding: '18px 22px', borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'center' }}>
                <div>
                  <div style={{ font: '500 14px/1.3 var(--font-sans)', color: 'var(--fg-1)' }}>Timezone</div>
                  <div style={{ color: 'var(--fg-4)', fontSize: 12.5, marginTop: 4 }}>Used for streaks, journal anchors and "today" boundaries.</div>
                </div>
                <div>
                  <TimezoneField
                    value={profileTimezone}
                    onChange={(tz) => { setProfileTimezone(tz); setProfileDirty(true); }}
                  />
                </div>
              </div>
            </div>

            {/* Save row */}
            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <BtnPrimary
                onClick={() => profileMut.mutate()}
                disabled={!profileDirty || profileMut.isPending}
              >
                {profileMut.isPending ? 'Saving…' : 'Save profile'}
              </BtnPrimary>
              {profileSaved && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--accent-green)' }}>
                  <Check className="w-3 h-3" /> Saved
                </span>
              )}
              {profileMut.isError && (
                <span style={{ fontSize: 11, color: 'var(--accent-red)' }}>
                  {(profileMut.error as Error).message}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ── AI Provider ───────────────────────────────────────── */}
        <section id="sec-ai" style={{ scrollMarginTop: 88, marginBottom: 56 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
            <SectionHead title="AI Provider" desc="Connect a local model or any cloud API — OpenAI, Claude, Gemini, and more." />
            <div style={{ paddingTop: 6, flexShrink: 0 }}>
              <ConnectionStatusPill result={healthResult} isLoading={healthLoading} />
            </div>
          </div>
          <div className="card" style={{ padding: 20 }}>

          {/* Unreachable banner */}
          {healthResult?.ok === false && (
            <div style={{
              marginBottom: 16, padding: '10px 14px', borderRadius: 10,
              background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.22)',
            }}>
              <p style={{ margin: '0 0 3px', fontSize: 12.5, fontWeight: 500, color: 'rgba(255,91,110,0.75)' }}>
                📡 AI server not reachable
              </p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-4)', lineHeight: '18px' }}>
                {healthResult.error}
              </p>
            </div>
          )}

          {/* Anthropic notice */}
          {healthResult?.ok === null && healthResult.note && (
            <div style={{
              marginBottom: 16, padding: '10px 14px', borderRadius: 10,
              background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.22)',
            }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--accent-yellow)' }}>ℹ️ {healthResult.note}</p>
            </div>
          )}

          <div className="grid grid-cols-4 gap-2 mb-5">
            {PROVIDER_ORDER.map((pid) => {
              const p: ProviderPreset | undefined = providers[pid];
              const active = provider === pid;
              return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => selectProvider(pid)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border py-3 px-2 text-center transition-all',
                    active
                      ? 'border-accent/50 bg-accent/10'
                      : 'border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.14)] hover:bg-white/4',
                  )}
                  style={!active ? { background: 'rgba(255,255,255,0.02)' } : {}}
                >
                  <span className="text-xl">{p?.emoji ?? '🔧'}</span>
                  <span className={cn(
                    'text-[10px] font-medium leading-tight',
                    active ? 'text-accent' : 'text-ink-400',
                  )}>
                    {p?.label ?? pid}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Connection */}
          <div className="space-y-3 mb-5">
            <div>
              <Label>API base URL</Label>
              <input
                className={cn(inputCls, 'font-mono text-xs')}
                value={apiBase}
                onChange={(e) => { setApiBase(e.target.value); setAiDirty(true); }}
                placeholder="http://127.0.0.1:1234/v1"
              />
            </div>

            {provider !== 'local' && (
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <Label>
                    API key{preset?.needs_key && <span className="ml-1 text-red-400 normal-case">required</span>}
                  </Label>
                  {keyLinks[provider] && (
                    <a
                      href={keyLinks[provider]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-accent hover:underline"
                    >
                      Get key ↗
                    </a>
                  )}
                </div>
                <div className="relative">
                  <input
                    className={cn(inputCls, 'pr-9 font-mono text-xs')}
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => { setApiKey(e.target.value); setAiDirty(true); }}
                    placeholder={preset?.needs_key ? 'sk-…' : 'optional'}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-300"
                    onClick={() => setShowKey((v) => !v)}
                  >
                    {showKey
                      ? <EyeOff className="w-3.5 h-3.5" />
                      : <Eye className="w-3.5 h-3.5" />
                    }
                  </button>
                </div>
                {apiKey && /^•+$/.test(apiKey) && (
                  <p className="text-[10px] text-ink-400 mt-0.5">
                    Key saved — type a new one to replace it.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Models */}
          <div className="space-y-3 mb-5">
            <Label>Models</Label>

            <ModelField
              label="Chat / main model"
              value={chatModel}
              onChange={(v) => { setChatModel(v); setAiDirty(true); }}
              suggestions={suggestedChat}
              placeholder="e.g. gpt-4o"
            />

            <ModelField
              label="Fast model (quick tasks, categorisation)"
              value={fastModel}
              onChange={(v) => { setFastModel(v); setAiDirty(true); }}
              suggestions={suggestedChat}
              placeholder="e.g. gpt-4o-mini"
            />

            {embedSupported ? (
              <ModelField
                label="Embedding model (semantic search)"
                value={embedModel}
                onChange={(v) => { setEmbedModel(v); setAiDirty(true); }}
                suggestions={preset?.suggested_embed ? [preset.suggested_embed] : []}
                placeholder="e.g. nomic-embed-text-v1.5"
              />
            ) : (
              <div className="rounded-md bg-amber-500/10 border border-amber-500/25 px-3 py-2 text-xs text-amber-400">
                {preset?.label ?? provider} does not support embeddings — semantic search will be disabled.
              </div>
            )}
          </div>

          {/* Test result */}
          {testResult && (
            <div className={cn(
              'rounded-md px-3 py-2.5 text-sm flex items-start gap-2.5 mb-4',
              testResult.ok
                ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-300'
                : 'bg-red-500/10 border border-red-500/25 text-red-300',
            )}>
              <span className="text-base shrink-0">{testResult.ok ? '✅' : '❌'}</span>
              <div className="flex-1 min-w-0">
                {testResult.ok ? (
                  <>
                    <p className="font-medium text-xs">
                      Connected · {testResult.provider} · {testResult.model}
                    </p>
                    {testResult.response && (
                      <p className="text-[11px] text-emerald-500 mt-0.5 italic">"{testResult.response}"</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="font-medium text-xs">Connection failed</p>
                    <p className="text-[11px] text-red-400 mt-0.5">{testResult.error}</p>
                  </>
                )}
              </div>
              <button
                type="button"
                className="text-ink-500 hover:text-ink-300 shrink-0"
                onClick={() => setTestResult(null)}
              >
                ✕
              </button>
            </div>
          )}

          {/* AI action buttons */}
          <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
            <BtnPrimary
              onClick={() => aiSaveMut.mutate()}
              disabled={!aiDirty || aiSaveMut.isPending}
            >
              {aiSaveMut.isPending ? 'Saving…' : 'Save AI settings'}
            </BtnPrimary>
            <BtnSecondary
              onClick={() => testMut.mutate()}
              disabled={testMut.isPending}
            >
              {testMut.isPending
                ? <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Testing…</span>
                : <span className="flex items-center gap-1"><Wifi className="w-3 h-3" /> Test connection</span>
              }
            </BtnSecondary>
            {aiSaveMut.isSuccess && !aiDirty && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--accent-green)' }}>
                <Check className="w-3 h-3" /> Saved
              </span>
            )}
            {aiSaveMut.isError && (
              <span style={{ fontSize: 11, color: 'var(--accent-red)' }}>
                {(aiSaveMut.error as Error).message}
              </span>
            )}
          </div>
          </div>{/* end AI card */}
        </section>

        {/* ── Notifications ─────────────────────────────────────── */}
        <section id="sec-notifications" style={{ scrollMarginTop: 88, marginBottom: 56 }}>
          <SectionHead title="Notifications" desc="Gentle nudges, not a fire-hose." />
          <NotificationSettingsPanel />
        </section>

        {/* ── SMS Import ────────────────────────────────────────── */}
        <section id="sec-sms" style={{ scrollMarginTop: 88, marginBottom: 56 }}>
          <SectionHead title="SMS Config" desc="Automatically detect transactions from bank SMS messages." />
          <SmsSetupPanel />
        </section>

        {/* ── Modules ───────────────────────────────────────────── */}
        <section id="sec-modules" style={{ scrollMarginTop: 88, marginBottom: 56 }}>
          <SectionHead title="Modules" desc="Choose which features are active. Dashboard is always on for everyone." />
          <ModulesPanel />
        </section>

        {/* ── Finance Categories ──────────────────────────────── */}
        <section id="sec-finance" style={{ scrollMarginTop: 88, marginBottom: 56 }}>
          <SectionHead title="Finance Categories" desc="Manage the categories used to tag your transactions." />
          <FinanceCategoriesPanel />
        </section>

        {/* ── Privacy notes ─────────────────────────────────────── */}
        <section id="sec-privacy" style={{ scrollMarginTop: 88, marginBottom: 56 }}>
          <SectionHead title="Privacy" desc="Your data stays on your device." />

          {/* App lock */}
          <div style={{ marginBottom: 20 }}>
            <AppLockPanel />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 18 }}>🔒</span>
                <h4 style={{ margin: 0, font: '500 15px/1.2 var(--font-display)', color: 'var(--fg-1)' }}>Local encryption</h4>
              </div>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--fg-4)', lineHeight: 1.6 }}>
                Your API key is stored only in the local SQLite database on your machine.
                It is never sent to any third party.
              </p>
            </div>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 18 }}>🌐</span>
                <h4 style={{ margin: 0, font: '500 15px/1.2 var(--font-display)', color: 'var(--fg-1)' }}>Local vs Cloud</h4>
              </div>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--fg-4)', lineHeight: 1.6 }}>
                Cloud providers (OpenAI, Anthropic…) send prompts to their servers.
                Local (LM Studio, Ollama) runs entirely on your device.
              </p>
            </div>
          </div>
        </section>

        {/* ── App version + update check ────────────────────────────────── */}
        <section style={{ marginTop: 32 }}>
          <div
            className="flex items-center gap-3"
            style={{
              padding: '12px 16px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <span style={{ fontSize: 16 }}>🏷️</span>
            <div style={{ flex: 1 }}>
              <span style={{ font: '500 13px/1.2 var(--font-sans)', color: 'var(--fg-2)' }}>
                North OS
              </span>
              <span style={{ color: 'var(--fg-4)', fontSize: 12.5, marginLeft: 8 }}>
                v{appVersion}
              </span>
            </div>
            <UpdateChecker />
          </div>
        </section>

        {/* ── Danger Zone ──────────────────────────────────────────────── */}
        <section id="sec-danger" style={{ scrollMarginTop: 88, marginBottom: 56 }}>
          <SectionHead title="Danger Zone" desc="Irreversible actions. Read carefully before proceeding." />

          <div style={{
            border: '1px solid rgba(239,68,68,0.35)',
            borderRadius: 12,
            overflow: 'hidden',
          }}>
            {/* Row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '18px 22px',
            }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, font: '500 14px/1.2 var(--font-sans)', color: 'var(--fg-1)' }}>
                  Wipe all data
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--fg-4)', lineHeight: 1.55 }}>
                  Once you wipe your data, there is no going back. Please be certain.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { wipeMut.reset(); setWipeStep(1); }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '7px 16px', borderRadius: 8,
                  font: '500 13px/1 var(--font-sans)',
                  color: 'rgba(255,91,110,0.75)',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.18)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)'; }}
              >
                <Trash2 style={{ width: 13, height: 13 }} />
                Wipe all data
              </button>
            </div>
          </div>

          {/* Success banner */}
          {wipeSuccess && (
            <div style={{
              marginTop: 12, padding: '10px 16px', borderRadius: 8,
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 13, color: 'var(--accent-green)',
            }}>
              <Check style={{ width: 14, height: 14, flexShrink: 0 }} />
              All data wiped successfully. Your settings have been preserved.
            </div>
          )}
        </section>

        {/* ── Wipe data modal (3-step) ──────────────────────────────────── */}
        {wipeStep > 0 && (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 9000,
              background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 24,
            }}
            onClick={() => { if (wipeMut.isPending) return; wipeMut.reset(); setWipeStep(0); setWipeConfirmText(''); }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 480,
                background: 'var(--surface-base)',
                border: '1px solid rgba(239,68,68,0.35)',
                borderRadius: 16, overflow: 'hidden',
              }}
            >
              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '18px 22px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                <AlertTriangle style={{ width: 18, height: 18, color: 'var(--accent-red)', flexShrink: 0 }} />
                <span style={{ font: '600 15px/1.2 var(--font-display)', color: 'var(--fg-1)' }}>
                  {wipeStep === 1 && 'Are you sure?'}
                  {wipeStep === 2 && 'Understand what will be deleted'}
                  {wipeStep === 3 && 'Confirm deletion'}
                </span>
                {/* Step indicator */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
                  {[1, 2, 3].map(s => (
                    <div key={s} style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: s <= wipeStep ? 'var(--accent-red)' : 'rgba(255,255,255,0.15)',
                      transition: 'background 0.2s',
                    }} />
                  ))}
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: '20px 22px 22px' }}>
                {wipeStep === 1 && (
                  <>
                    <p style={{ margin: '0 0 18px', fontSize: 13.5, color: 'var(--fg-3)', lineHeight: 1.65 }}>
                      You are about to permanently delete <strong style={{ color: 'var(--fg-1)' }}>all your data</strong> from North&nbsp;OS.
                      This action <strong style={{ color: 'var(--accent-red)' }}>cannot be undone</strong> — there is no recovery option.
                    </p>
                    <p style={{ margin: '0 0 22px', fontSize: 13, color: 'var(--fg-4)', lineHeight: 1.6 }}>
                      Your AI provider settings and app preferences will be preserved.
                      Everything else — transactions, habits, journal, subscriptions — will be gone.
                    </p>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => { wipeMut.reset(); setWipeStep(0); setWipeConfirmText(''); }}
                        style={{
                          padding: '8px 18px', borderRadius: 8, fontSize: 13,
                          color: 'var(--fg-3)', background: 'transparent',
                          border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => setWipeStep(2)}
                        style={{
                          padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                          color: 'rgba(255,91,110,0.75)', background: 'rgba(239,68,68,0.12)',
                          border: '1px solid rgba(239,68,68,0.4)', cursor: 'pointer',
                        }}
                      >
                        I want to delete all data →
                      </button>
                    </div>
                  </>
                )}

                {wipeStep === 2 && (
                  <>
                    <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--fg-4)' }}>
                      The following data will be <strong style={{ color: 'var(--accent-red)' }}>permanently deleted</strong>:
                    </p>
                    <ul style={{ margin: '0 0 20px', padding: '0 0 0 18px', fontSize: 13, color: 'var(--fg-3)', lineHeight: 2 }}>
                      <li>All transactions, budgets, and bank accounts</li>
                      <li>All habits and check-in history</li>
                      <li>All journal entries and daily summaries</li>
                      <li>All subscriptions</li>
                      <li>All SMS-parsed transactions</li>
                      <li>All notifications</li>
                      <li>All AI-generated embeddings and vector data</li>
                    </ul>
                    <div style={{
                      padding: '10px 14px', borderRadius: 8, marginBottom: 20,
                      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                      fontSize: 12.5, color: 'rgba(255,91,110,0.75)', lineHeight: 1.6,
                    }}>
                      ✓ Kept: your AI provider settings, profile preferences, and app configuration.
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => { wipeMut.reset(); setWipeStep(0); setWipeConfirmText(''); }}
                        style={{
                          padding: '8px 18px', borderRadius: 8, fontSize: 13,
                          color: 'var(--fg-3)', background: 'transparent',
                          border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => setWipeStep(3)}
                        style={{
                          padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                          color: 'rgba(255,91,110,0.75)', background: 'rgba(239,68,68,0.12)',
                          border: '1px solid rgba(239,68,68,0.4)', cursor: 'pointer',
                        }}
                      >
                        I have read and understand these effects →
                      </button>
                    </div>
                  </>
                )}

                {wipeStep === 3 && (
                  <>
                    <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--fg-3)', lineHeight: 1.65 }}>
                      To confirm, type <strong style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-mono)' }}>delete my data</strong> in the box below.
                    </p>
                    <input
                      type="text"
                      autoFocus
                      value={wipeConfirmText}
                      onChange={e => setWipeConfirmText(e.target.value)}
                      placeholder="delete my data"
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        padding: '9px 13px', borderRadius: 8, fontSize: 13,
                        background: 'var(--surface-elev)',
                        border: wipeConfirmText === 'delete my data'
                          ? '1px solid rgba(239,68,68,0.6)'
                          : '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--fg-1)', outline: 'none',
                        marginBottom: 20,
                        fontFamily: 'var(--font-mono)',
                        transition: 'border 0.15s',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => { wipeMut.reset(); setWipeStep(0); setWipeConfirmText(''); }}
                        style={{
                          padding: '8px 18px', borderRadius: 8, fontSize: 13,
                          color: 'var(--fg-3)', background: 'transparent',
                          border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={wipeConfirmText !== 'delete my data' || wipeMut.isPending}
                        onClick={() => wipeMut.mutate()}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 7,
                          padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                          color: wipeConfirmText === 'delete my data' ? '#fff' : 'var(--accent-red)',
                          background: wipeConfirmText === 'delete my data'
                            ? 'rgba(239,68,68,0.8)' : 'rgba(239,68,68,0.12)',
                          border: '1px solid rgba(239,68,68,0.5)',
                          cursor: (wipeConfirmText !== 'delete my data' || wipeMut.isPending) ? 'not-allowed' : 'pointer',
                          opacity: (wipeConfirmText !== 'delete my data' || wipeMut.isPending) ? 0.6 : 1,
                          transition: 'all 0.15s',
                        }}
                      >
                        {wipeMut.isPending
                          ? <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> Wiping…</>
                          : <><Trash2 style={{ width: 13, height: 13 }} /> Delete all data</>
                        }
                      </button>
                    </div>
                    {wipeMut.isError && (
                      <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--accent-red)' }}>
                        Something went wrong. Please try again.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

      </div>{/* end right content */}
      </div>{/* end settings-grid */}
    </>
  );
}
