/**
 * Generic background AI state.
 *
 * Solves: AI calls cancelled when user navigates away.
 * Pattern: `run(key, asyncFn)` fires the call at context level (above routes),
 * so navigation never unmounts the caller. State survives until page refresh;
 * localStorage provides resilience across refreshes (keyed by today's date).
 *
 * Each "slot" is identified by a string key, e.g.:
 *   'habit-insights'
 *   'finance-insights'
 *   'journal-reflect-2026-05-14'
 */
import { todayISO } from '@/lib/date';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { classifyLLMError, type ErrorKind } from './BriefingContext';

// ── Slot type ────────────────────────────────────────────────────────────────

export interface AISlot {
  /** Serialised text — plain string or JSON string for array payloads. */
  text: string | null;
  isPending: boolean;
  error: string | null;
  errorKind: ErrorKind | null;
}

export const EMPTY_SLOT: AISlot = { text: null, isPending: false, error: null, errorKind: null };

// ── localStorage helpers (keyed by today's date so stale cache is ignored) ──

const _today = todayISO();
const _PREFIX = 'aiSlot';

export function readAICache(key: string): string | null {
  try { return localStorage.getItem(`${_PREFIX}.${_today}.${key}`); } catch { return null; }
}

function writeAICache(key: string, text: string) {
  try { localStorage.setItem(`${_PREFIX}.${_today}.${key}`, text); } catch { /* quota / private mode */ }
}

// ── Context ──────────────────────────────────────────────────────────────────

interface AIContentContextValue {
  /**
   * Returns the current slot state. Falls back to a same-day localStorage
   * entry transparently so cached results appear on first render without
   * requiring an extra effect.
   */
  getSlot: (key: string) => AISlot;
  /**
   * Fire an async function that returns the text to store.
   * Guards against duplicate in-flight calls for the same key.
   * Persists the result to state + localStorage on success.
   */
  run: (key: string, fn: () => Promise<string>) => void;
}

const AIContentContext = createContext<AIContentContextValue | null>(null);

export function AIContentProvider({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<Record<string, AISlot>>({});
  // Per-key in-flight guard — prevents duplicate calls for the same slot
  const runningRef = useRef<Record<string, boolean>>({});

  const getSlot = useCallback((key: string): AISlot => {
    const slot = slots[key];
    // Active in-memory state takes priority (pending / error / completed text)
    if (slot && (slot.isPending || slot.error || slot.text !== null)) return slot;
    // Transparent localStorage fallback (same-day cache)
    const cached = readAICache(key);
    if (cached) return { text: cached, isPending: false, error: null, errorKind: null };
    return EMPTY_SLOT;
  }, [slots]);

  const run = useCallback((key: string, fn: () => Promise<string>) => {
    if (runningRef.current[key]) return; // already in flight
    runningRef.current[key] = true;

    // Mark slot as pending (keep any existing text so UI stays visible while regenerating)
    setSlots(prev => ({
      ...prev,
      [key]: { text: prev[key]?.text ?? null, isPending: true, error: null, errorKind: null },
    }));

    fn()
      .then((text) => {
        writeAICache(key, text);
        setSlots(prev => ({ ...prev, [key]: { text, isPending: false, error: null, errorKind: null } }));
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setSlots(prev => ({
          ...prev,
          [key]: { ...(prev[key] ?? EMPTY_SLOT), isPending: false, error: msg, errorKind: classifyLLMError(msg) },
        }));
      })
      .finally(() => { runningRef.current[key] = false; });
  }, []);

  return (
    <AIContentContext.Provider value={{ getSlot, run }}>
      {children}
    </AIContentContext.Provider>
  );
}

export function useAIContent(): AIContentContextValue {
  const ctx = useContext(AIContentContext);
  if (!ctx) throw new Error('useAIContent must be used within <AIContentProvider>');
  return ctx;
}
