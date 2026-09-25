import { toISODate } from '@/lib/date';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { api, type Day, type HabitsTodayResponse, type SubscriptionStatsResponse } from '@/lib/api';

// ── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_KEY = 'dashboard.ai_briefing';

function getCached(): { date: string; text: string } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { date: string; text: string };
  } catch { return null; }
}

function setCache(date: string, text: string) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ date, text })); } catch { /* ignore */ }
}

// ── Prompt builders ──────────────────────────────────────────────────────────

const SYSTEM = `You are a concise, warm personal assistant giving someone their morning briefing.
Read the provided data about their day — habits scheduled, journal status, upcoming subscriptions —
and write a short, grounded 2–3 sentence briefing.
Focus on what's actionable today. Be direct. No lists. End with one motivating thought.
Never say "Based on the data" or similar meta-phrases.
Use **bold** (markdown double-asterisks) around 2–4 key actionable items or names so the reader can scan at a glance — e.g. habit names, subscription names, time durations.`;

function composePrompt(
  today: string,
  habits: HabitsTodayResponse | undefined,
  journal: Day | undefined,
  subs: SubscriptionStatsResponse | undefined,
): string {
  const lines: string[] = [`Today is ${today}.`];

  if (habits) {
    const total = habits.habits.length;
    const done = habits.habits.filter((h) => h.done).length;
    const names = habits.habits.filter((h) => !h.done).map((h) => h.habit.name);
    if (total === 0) {
      lines.push('No habits scheduled today.');
    } else {
      lines.push(
        `Habits: ${done}/${total} done today.` +
        (names.length ? ` Still to do: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}.` : ' All complete!'),
      );
    }
  }

  if (journal) {
    const hasEntry = journal.entries.length > 0;
    const hasMood = journal.mood_codes.length > 0;
    lines.push(
      hasEntry
        ? `Journal: ${journal.entries.length} ${journal.entries.length === 1 ? 'entry' : 'entries'} written today${hasMood ? `, mood: ${journal.mood_codes.join(', ')}` : ''}.`
        : 'Journal: no entry written yet today.',
    );
  }

  if (subs) {
    const due = subs.upcoming_30d.filter((u) => u.days_until <= 7);
    if (due.length > 0) {
      lines.push(
        `Subscriptions: ${due.length} renewal${due.length > 1 ? 's' : ''} due this week — ${
          due.slice(0, 2).map((u) => u.subscription.name).join(', ')
        }${due.length > 2 ? '…' : ''}.`,
      );
    }
  }

  lines.push('\nWrite the briefing now:');
  return lines.join('\n');
}

// ── Error classification ─────────────────────────────────────────────────────

export type ErrorKind = 'unreachable' | 'auth' | 'model' | 'server' | 'unknown';

export function classifyLLMError(msg: string): ErrorKind {
  const m = msg.toLowerCase();
  if (m.includes('cannot reach') || m.includes('timed out') || m.includes('all connection')) return 'unreachable';
  if (m.includes('401') || m.includes('403') || m.includes('api key') || m.includes('authentication') || m.includes('rejected')) return 'auth';
  if (m.includes('404') || m.includes('not found') || m.includes('model')) return 'model';
  if (m.includes('503') || m.includes('busy') || m.includes('loading')) return 'server';
  return 'unknown';
}

// ── Context types ────────────────────────────────────────────────────────────

interface BriefingState {
  text: string | null;
  isPending: boolean;
  error: string | null;
  errorKind: ErrorKind | null;
}

interface BriefingContextValue extends BriefingState {
  generate: (
    habits: HabitsTodayResponse | undefined,
    journal: Day | undefined,
    subs: SubscriptionStatsResponse | undefined,
  ) => void;
}

// ── Context ──────────────────────────────────────────────────────────────────

const BriefingContext = createContext<BriefingContextValue | null>(null);

export function BriefingProvider({ children }: { children: ReactNode }) {
  const todayISO = toISODate(new Date());

  // Seed from localStorage so the result is available immediately on first render
  const [state, setState] = useState<BriefingState>(() => {
    const cached = getCached();
    return {
      text: cached?.date === todayISO ? cached.text : null,
      isPending: false,
      error: null,
      errorKind: null,
    };
  });

  // Guard against duplicate in-flight calls
  const runningRef = useRef(false);

  const generate = useCallback(
    async (
      habits: HabitsTodayResponse | undefined,
      journal: Day | undefined,
      subs: SubscriptionStatsResponse | undefined,
    ) => {
      if (runningRef.current) return; // already in flight
      runningRef.current = true;

      setState((prev) => ({ ...prev, isPending: true, error: null, errorKind: null }));

      try {
        const prompt = composePrompt(todayISO, habits, journal, subs);
        const res = await api.aiPing(prompt, {
          purpose: 'chat',
          system: SYSTEM,
          temperature: 0.6,
          max_tokens: 600,
        });
        const text = res.response.trim();
        setCache(todayISO, text);
        setState({ text, isPending: false, error: null, errorKind: null });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setState((prev) => ({
          ...prev,
          isPending: false,
          error: msg,
          errorKind: classifyLLMError(msg),
        }));
      } finally {
        runningRef.current = false;
      }
    },
    [todayISO],
  );

  return (
    <BriefingContext.Provider value={{ ...state, generate }}>
      {children}
    </BriefingContext.Provider>
  );
}

export function useBriefing(): BriefingContextValue {
  const ctx = useContext(BriefingContext);
  if (!ctx) throw new Error('useBriefing must be used within <BriefingProvider>');
  return ctx;
}
