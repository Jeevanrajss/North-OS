import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronRight, Loader2 } from 'lucide-react';
import { api, type Account, type AccountIn, type AccountType, type CardVariant } from '@/lib/api';
import { cn } from '@/lib/cn';

// ── types / constants ────────────────────────────────────────────────────────

const TYPE_OPTIONS: { value: AccountType; label: string; emoji: string; desc: string }[] = [
  { value: 'credit_card', label: 'Credit Card', emoji: '💳', desc: 'Earn cashback & rewards' },
  { value: 'savings',     label: 'Savings',     emoji: '🏦', desc: 'Bank savings account' },
  { value: 'debit_card',  label: 'Debit Card',  emoji: '🪪', desc: 'Linked to bank account' },
  { value: 'upi',         label: 'UPI / Wallet', emoji: '📱', desc: 'PhonePe, GPay, Paytm…' },
  { value: 'cash',        label: 'Cash',        emoji: '💵', desc: 'Physical cash' },
];

const COLOR_OPTIONS = [
  { value: 'violet',  cls: 'bg-violet-500' },
  { value: 'sky',     cls: 'bg-sky-500' },
  { value: 'emerald', cls: 'bg-emerald-500' },
  { value: 'amber',   cls: 'bg-amber-500' },
  { value: 'rose',    cls: 'bg-rose-500' },
  { value: 'indigo',  cls: 'bg-indigo-500' },
  { value: 'teal',    cls: 'bg-teal-500' },
  { value: 'orange',  cls: 'bg-orange-500' },
];

type Step = 'type' | 'bank' | 'variant' | 'details';

type Props = {
  initial?: Account | null;
  onSubmit: (payload: AccountIn) => Promise<void>;
  onCancel: () => void;
};

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtFee(fee: number) {
  if (fee === 0) return 'Lifetime free';
  return `₹${fee.toLocaleString('en-IN')}/yr`;
}

// ── main component ────────────────────────────────────────────────────────────

export function AccountForm({ initial, onSubmit, onCancel }: Props) {
  // ── state ─────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(initial ? 'details' : 'type');
  const [type, setType] = useState<AccountType>(initial?.type ?? 'credit_card');
  const [bank, setBank] = useState<string>(initial?.bank ?? '');
  const [cardVariant, setCardVariant] = useState<string>(initial?.card_variant ?? '');
  const [selectedVariantData, setSelectedVariantData] = useState<CardVariant | null>(null);
  const [nickname, setNickname] = useState(initial?.nickname ?? '');
  const [last4, setLast4] = useState(initial?.last4 ?? '');
  const [creditLimit, setCreditLimit] = useState(
    initial?.credit_limit ? String(initial.credit_limit) : '',
  );
  const [color, setColor] = useState(initial?.color ?? 'violet');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── data fetching ─────────────────────────────────────────────────────────
  const banksQ = useQuery({
    queryKey: ['account-banks'],
    queryFn: () => api.accounts.banks(),
    staleTime: Infinity,
  });

  const bankCatalogQ = useQuery({
    queryKey: ['account-catalog', bank],
    queryFn: () => api.accounts.bankCatalog(bank),
    enabled: !!bank && (type === 'credit_card' || type === 'debit_card'),
    staleTime: Infinity,
  });

  // ── derived ───────────────────────────────────────────────────────────────
  const bankList = useMemo(() => {
    return type === 'upi'
      ? (banksQ.data?.wallets ?? [])
      : (banksQ.data?.banks ?? []);
  }, [banksQ.data, type]);

  const cardVariants: CardVariant[] = useMemo(() => {
    if (!bankCatalogQ.data) return [];
    return type === 'credit_card'
      ? (bankCatalogQ.data.credit ?? [])
      : (bankCatalogQ.data.debit ?? []);
  }, [bankCatalogQ.data, type]);

  // Resolve variant data when editing
  useEffect(() => {
    if (initial?.card_variant && cardVariants.length > 0) {
      const v = cardVariants.find((c) => c.variant === initial.card_variant) ?? null;
      setSelectedVariantData(v);
    }
  }, [initial, cardVariants]);

  // ── navigation ────────────────────────────────────────────────────────────
  function goNext() {
    if (step === 'type') {
      if (type === 'cash') { setStep('details'); return; }
      setStep('bank');
    } else if (step === 'bank') {
      if (type === 'credit_card' || type === 'debit_card') {
        setStep('variant');
      } else {
        setStep('details');
      }
    } else if (step === 'variant') {
      setStep('details');
    }
  }

  function goBack() {
    if (step === 'bank') setStep('type');
    else if (step === 'variant') setStep('bank');
    else if (step === 'details') {
      if (type === 'credit_card' || type === 'debit_card') setStep('variant');
      else if (type === 'cash') setStep('type');
      else setStep('bank');
    }
  }

  function canProceedFromBank() {
    return bank.trim().length > 0;
  }

  // ── submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onSubmit({
        type,
        bank: bank || null,
        card_variant: cardVariant || null,
        nickname: nickname.trim() || null,
        last4: last4.trim() || null,
        credit_limit: creditLimit ? parseFloat(creditLimit) : null,
        benefits_json: selectedVariantData
          ? JSON.stringify({
              perks: selectedVariantData.perks,
              cashback: selectedVariantData.cashback,
              annual_fee: selectedVariantData.annual_fee,
              highlights: selectedVariantData.highlights,
            })
          : null,
        color,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  }

  // ── render steps ──────────────────────────────────────────────────────────

  // Step 1: account type
  if (step === 'type') {
    return (
      <div className="space-y-4">
        <StepHeader title="What type of account?" step={1} total={3} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TYPE_OPTIONS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => { setType(t.value); }}
              className={cn(
                'flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-left',
                type === t.value
                  ? 'border-accent/60 bg-accent/10 ring-1 ring-accent/30'
                  : 'border-ink-800 bg-ink-900 hover:border-ink-700',
              )}
            >
              <span className="text-2xl">{t.emoji}</span>
              <span className="text-xs font-medium text-ink-100">{t.label}</span>
              <span className="text-[10px] text-ink-500 text-center leading-snug">{t.desc}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-ink-500 hover:text-ink-300 transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={goNext}
            className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-md bg-accent/15 border border-accent/30 text-accent text-sm font-medium hover:bg-accent/25 transition-colors"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Step 2: bank / provider
  if (step === 'bank') {
    return (
      <div className="space-y-3">
        <StepHeader title={type === 'upi' ? 'Select UPI / Wallet' : 'Select your bank'} step={2} total={3} />
        <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
          {bankList.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => { setBank(b); }}
              className={cn(
                'text-left px-3 py-2 rounded-lg border text-sm transition-all',
                bank === b
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-ink-800 bg-ink-900 text-ink-300 hover:border-ink-700',
              )}
            >
              {b}
            </button>
          ))}
          {bankList.length === 0 && (
            <p className="col-span-2 text-xs text-ink-400 text-center py-4">No matches.</p>
          )}
        </div>
        <NavButtons
          onBack={goBack}
          onNext={goNext}
          canNext={canProceedFromBank()}
          nextLabel={type === 'credit_card' || type === 'debit_card' ? 'Choose card' : 'Details'}
        />
      </div>
    );
  }

  // Step 3: card variant
  if (step === 'variant') {
    return (
      <div className="space-y-3">
        <StepHeader
          title={`Choose your ${bank} ${type === 'credit_card' ? 'credit' : 'debit'} card`}
          step={3} total={3}
        />
        {bankCatalogQ.isLoading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-xs text-ink-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading cards…
          </div>
        ) : cardVariants.length === 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-ink-500 py-4 text-center">
              No card data for {bank} yet — you can still add the account and fill benefits manually.
            </p>
            <NavButtons onBack={goBack} onNext={goNext} canNext nextLabel="Skip → Details" />
          </div>
        ) : (
          <>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {cardVariants.map((v) => {
                const isSelected = cardVariant === v.variant;
                return (
                  <button
                    key={v.variant}
                    type="button"
                    onClick={() => {
                      setCardVariant(v.variant);
                      setSelectedVariantData(v);
                    }}
                    className={cn(
                      'w-full text-left p-3 rounded-xl border transition-all',
                      isSelected
                        ? 'border-accent/50 bg-accent/10'
                        : 'border-ink-800 bg-ink-900 hover:border-ink-700',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-ink-100">{v.variant}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {v.highlights.map((h, i) => (
                            <span key={i} className="text-[10px] text-ink-500 bg-ink-800 rounded-full px-2 py-0.5 leading-tight">
                              {h}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className={cn(
                          'text-[10px] font-medium px-1.5 py-0.5 rounded',
                          v.annual_fee === 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-ink-800 text-ink-500',
                        )}>
                          {fmtFee(v.annual_fee)}
                        </span>
                      </div>
                    </div>

                    {/* Cashback preview */}
                    {isSelected && Object.keys(v.cashback).length > 0 && (
                      <div className="mt-2.5 pt-2.5 border-t border-ink-800">
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(v.cashback).map(([cat, pct]) => (
                            <span key={cat} className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full px-2 py-0.5">
                              {cat}: {pct}%
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <NavButtons
              onBack={goBack}
              onNext={goNext}
              canNext={!!cardVariant}
              nextLabel="Details"
            />
          </>
        )}
      </div>
    );
  }

  // Step 4: optional details
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!initial && <StepHeader title="Optional details" step={4} total={4} />}

      {/* Summary chip */}
      {!initial && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ink-900 border border-ink-800">
          <span className="text-base">{TYPE_OPTIONS.find((t) => t.value === type)?.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-ink-100">
              {bank && cardVariant ? `${bank} ${cardVariant}` : bank || type}
            </div>
            {selectedVariantData && (
              <div className="text-[11px] text-ink-500 truncate">
                {selectedVariantData.highlights.slice(0, 2).join(' · ')}
              </div>
            )}
          </div>
          {!initial && (
            <button type="button" onClick={() => setStep('type')} className="text-[10px] text-accent hover:underline shrink-0">
              Change
            </button>
          )}
        </div>
      )}

      {/* Nickname */}
      <div>
        <label className="block text-[11px] text-ink-500 uppercase tracking-wide mb-1">
          Nickname <span className="text-ink-400 normal-case">(optional)</span>
        </label>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder={
            bank && cardVariant
              ? `e.g. My ${cardVariant} card`
              : bank
              ? `e.g. My ${bank} account`
              : 'e.g. Daily expenses card'
          }
          maxLength={100}
          className="w-full bg-ink-900 border border-ink-800 rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60 placeholder:text-ink-500"
        />
      </div>

      {/* Last 4 + credit limit */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-ink-500 uppercase tracking-wide mb-1">
            Last 4 digits <span className="text-ink-400 normal-case">(optional)</span>
          </label>
          <input
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="4321"
            maxLength={4}
            className="w-full bg-ink-900 border border-ink-800 rounded-md px-3 py-2 text-sm outline-none focus:border-accent/60 placeholder:text-ink-500"
          />
        </div>
        {type === 'credit_card' && (
          <div>
            <label className="block text-[11px] text-ink-500 uppercase tracking-wide mb-1">
              Credit limit <span className="text-ink-400 normal-case">(optional)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-500">₹</span>
              <input
                type="number"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                placeholder="100000"
                min="0"
                className="w-full pl-7 pr-3 py-2 bg-ink-900 border border-ink-800 rounded-md text-sm outline-none focus:border-accent/60 [appearance:textfield]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Color */}
      <div>
        <label className="block text-[11px] text-ink-500 uppercase tracking-wide mb-1.5">Card color</label>
        <div className="flex gap-2">
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              className={cn(
                'w-6 h-6 rounded-full transition-all',
                c.cls,
                color === c.value
                  ? 'ring-2 ring-offset-2 ring-offset-ink-950 ring-white scale-110'
                  : 'opacity-50 hover:opacity-100',
              )}
            />
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2 pt-1">
        {!initial && (
          <button
            type="button"
            onClick={goBack}
            className="flex items-center gap-1 px-3 py-2 rounded-md border border-ink-800 text-sm text-ink-400 hover:text-ink-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        )}
        {initial && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-md border border-ink-800 text-sm text-ink-400 hover:text-ink-200 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-2 rounded-md text-sm font-medium bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 disabled:opacity-50 transition-colors"
        >
          {loading
            ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            : initial
            ? 'Save Changes'
            : `Add ${TYPE_OPTIONS.find((t) => t.value === type)?.label ?? 'Account'}`}
        </button>
      </div>
    </form>
  );
}

// ── sub-components ────────────────────────────────────────────────────────────

function StepHeader({ title, step, total }: { title: string; step: number; total: number }) {
  return (
    <div className="flex items-center gap-3 mb-1">
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1 rounded-full transition-all',
              i < step ? 'bg-accent w-6' : 'bg-ink-800 w-3',
            )}
          />
        ))}
      </div>
      <h3 className="text-sm font-semibold text-ink-100">{title}</h3>
    </div>
  );
}

function NavButtons({
  onBack,
  onNext,
  canNext,
  nextLabel = 'Next',
}: {
  onBack: () => void;
  onNext: () => void;
  canNext: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="flex gap-2 pt-1">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 px-3 py-2 rounded-md border border-ink-800 text-sm text-ink-400 hover:text-ink-200 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-md bg-accent/15 border border-accent/30 text-accent text-sm font-medium hover:bg-accent/25 disabled:opacity-40 transition-colors"
      >
        {nextLabel} <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
