import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { api, type Day, type HabitsTodayResponse, type SubscriptionStatsResponse } from '@/lib/api';
import { cn } from '@/lib/cn';

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

const SYSTEM = `You are a concise, warm personal assistant giving someone their morning briefing.
Read the provided data about their day — habits scheduled, journal status, upcoming subscriptions —
and write a short, grounded 2–3 sentence briefing.
Focus on what's actionable today. Be direct. No lists. End with one motivating thought.
Never say "Based on the data" or similar meta-phrases.`;

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
        (names.length ? ` Still to do: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}.` : ' All complete!')
      );
    }
  }

  if (journal) {
    const hasEntry = journal.entries.length > 0;
    const hasMood = journal.mood_codes.length > 0;
    lines.push(
      hasEntry
        ? `Journal: ${journal.entries.length} ${journal.entries.length === 1 ? 'entry' : 'entries'} written today${hasMood ? `, mood: ${journal.mood_codes.join(', ')}` : ''}.`
        : 'Journal: no entry written yet today.'
    );
  }

  if (subs) {
    const due = subs.upcoming_30d.filter((u) => u.days_until <= 7);
    if (due.length > 0) {
      lines.push(
        `Subscriptions: ${due.length} renewal${due.length > 1 ? 's' : ''} due this week — ${
          due.slice(0, 2).map((u) => u.subscription.name).join(', ')
        }${due.length > 2 ? '…' : ''}.`
      );
    }
  }

  lines.push('\nWrite the briefing now:');
  return lines.join('\n');
}

export function DashAIBriefing() {
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const cached = useMemo(() => {
    const c = getCached();
    return c?.date === todayISO ? c.text : null;
  }, [todayISO]);

  const [briefing, setBriefing] = useState<string | null>(cached);

  const { data: habits } = useQuery<HabitsTodayResponse>({
    queryKey: ['habits-today', todayISO],
    queryFn: () => api.habits.today(todayISO),
    staleTime: 1000 * 60,
  });

  const { data: journal } = useQuery<Day>({
    queryKey: ['journal-day', todayISO],
    queryFn: () => api.journal.getDay(todayISO),
    staleTime: 1000 * 60,
  });

  const { data: subs } = useQuery<SubscriptionStatsResponse>({
    queryKey: ['subscription-stats'],
    queryFn: () => api.subscriptions.stats(),
    staleTime: 1000 * 60,
  });

  const mut = useMutation({
    mutationFn: async () => {
      const prompt = composePrompt(todayISO, habits, journal, subs);
      const res = await api.aiPing(prompt, {
        purpose: 'chat',
        system: SYSTEM,
        temperature: 0.6,
        max_tokens: 600,
      });
      return res.response.trim();
    },
    onSuccess: (text) => {
      setBriefing(text);
      setCache(todayISO, text);
    },
  });

  const offline = mut.isError && (mut.error as Error).message.includes('503');

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <div className="card-title !mb-0">Morning Briefing</div>
        </div>
        <button
          type="button"
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          title={briefing ? 'Regenerate briefing' : 'Generate briefing'}
          className={cn(
            'p-1 rounded-md border border-transparent text-ink-500',
            'hover:text-accent hover:border-ink-800 disabled:opacity-40 transition-colors',
          )}
        >
          {mut.isPending
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5" />
          }
        </button>
      </div>

      {mut.isPending && !briefing && (
        <div className="space-y-1.5 mt-1">
          {[90, 75, 60].map((w, i) => (
            <div key={i} className="h-3.5 bg-ink-900 rounded animate-pulse" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}

      {offline && (
        <p className="text-xs text-amber-400 mt-1">
          LM Studio is offline — start it to generate a briefing.
        </p>
      )}

      {mut.isError && !offline && (
        <p className="text-xs text-red-400 mt-1">{(mut.error as Error).message}</p>
      )}

      {briefing ? (
        <div className={cn('text-sm text-ink-300 leading-relaxed', mut.isPending && 'opacity-50')}>
          {briefing}
        </div>
      ) : !mut.isPending && !mut.isError ? (
        <div className="flex items-center gap-2">
          <p className="text-xs text-ink-500">
            Click ↻ for an AI summary of your day.
          </p>
          <button
            type="button"
            onClick={() => mut.mutate()}
            className="text-xs text-accent hover:underline shrink-0"
          >
            Generate
          </button>
        </div>
      ) : null}
    </div>
  );
}
