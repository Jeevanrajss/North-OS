import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, type Day, type MoodCode } from '@/lib/api';
import { toISODate, formatDayHeader, fromISODate } from '@/lib/date';
import { ChevronDown, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';

type Props = {
  date: Date;
};

const STORAGE_KEY = 'journal.reflect.open';

const SYSTEM_PROMPT =
  "You are a thoughtful, warm journal companion. You read a person's day log and reflect back with honesty and care. " +
  'Prefer concrete observations over generic advice. Use short paragraphs (no lists). Keep it under ~180 words. ' +
  'Speak directly to the writer in second person. If the day log is sparse, acknowledge that gently and suggest one small prompt they could write about.';

function moodLabel(code: string, moods: MoodCode[] | undefined): string {
  const m = moods?.find((x) => x.code === code);
  if (!m) return code;
  return `${m.emoji} ${m.label}`;
}

function composePrompt(day: Day, moods: MoodCode[] | undefined): string {
  const header = `Date: ${formatDayHeader(fromISODate(day.date))}`;
  const moodLine = day.mood_codes.length
    ? `Moods: ${day.mood_codes.map((c) => moodLabel(c, moods)).join(', ')}`
    : 'Moods: (none logged)';
  const tagLine = day.tags.length ? `Tags: ${day.tags.join(', ')}` : 'Tags: (none)';

  const summaryParts: string[] = [];
  if (day.summary_highlights) summaryParts.push(`Highlights: ${day.summary_highlights}`);
  if (day.summary_wins) summaryParts.push(`Wins: ${day.summary_wins}`);
  if (day.summary_learnings) summaryParts.push(`Learnings: ${day.summary_learnings}`);
  if (day.summary_gratitude) summaryParts.push(`Gratitude: ${day.summary_gratitude}`);
  const summaryBlock = summaryParts.length
    ? `Daily summary:\n${summaryParts.join('\n')}`
    : 'Daily summary: (empty)';

  const entriesBlock = day.entries.length
    ? `Entries (${day.entries.length}):\n` +
      day.entries
        .map((e, i) => {
          const trimmed = e.content_text.trim().slice(0, 800);
          return `--- Entry ${i + 1} ---\n${trimmed}`;
        })
        .join('\n')
    : 'Entries: (none written)';

  return [
    header,
    moodLine,
    tagLine,
    summaryBlock,
    entriesBlock,
    '',
    'Please reflect on this day. What stands out? What pattern do you notice? End with one gentle question I could sit with.',
  ].join('\n');
}

export function ReflectToday({ date }: Props) {
  const iso = toISODate(date);

  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === '1';
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
    } catch {
      /* quota / private mode — ignore */
    }
  }, [open]);

  const { data: day } = useQuery({
    queryKey: ['day', iso],
    queryFn: () => api.journal.getDay(iso),
  });

  const { data: moods } = useQuery({
    queryKey: ['moods'],
    queryFn: api.journal.listMoods,
    staleTime: 1000 * 60 * 60,
  });

  const reflectMut = useMutation({
    mutationFn: async () => {
      if (!day) throw new Error('Day not loaded yet');
      const prompt = composePrompt(day, moods);
      return api.aiPing(prompt, {
        purpose: 'chat',
        system: SYSTEM_PROMPT,
        temperature: 0.7,
        max_tokens: 512,
      });
    },
  });

  // Reset the reflection when the selected day changes — stale reflection for
  // yesterday doesn't help you think about today.
  useEffect(() => {
    reflectMut.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso]);

  const emptyish = useMemo(() => {
    if (!day) return true;
    const anySummary =
      day.summary_highlights ||
      day.summary_wins ||
      day.summary_learnings ||
      day.summary_gratitude;
    return (
      day.mood_codes.length === 0 &&
      day.tags.length === 0 &&
      !anySummary &&
      day.entries.length === 0
    );
  }, [day]);

  return (
    <div className="card">
      <button
        type="button"
        className="w-full flex items-center justify-between text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <div className="card-title !mb-0">Reflect on today</div>
        </div>
        <div className="text-ink-500">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="text-xs text-ink-500">
            Ask Gemma to read this day's moods, tags, summary, and entries, and reflect back.
            Runs locally via Ollama — no data leaves your machine.
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!day || reflectMut.isPending}
              onClick={() => reflectMut.mutate()}
              className={cn(
                'inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm',
                'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {reflectMut.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…
                </>
              ) : reflectMut.data ? (
                <>
                  <Sparkles className="w-3.5 h-3.5" /> Reflect again
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" /> Reflect on today
                </>
              )}
            </button>
            {emptyish && !reflectMut.data && (
              <span className="text-[11px] text-ink-500">
                Day looks empty — you'll get a gentle nudge to start writing.
              </span>
            )}
          </div>

          {reflectMut.error && (
            <div className="text-xs text-red-400 border border-red-900/60 bg-red-950/30 rounded p-2">
              {(reflectMut.error as Error).message}
            </div>
          )}

          {reflectMut.data && (
            <div className="rounded-md border border-ink-800 bg-ink-950/60 p-3">
              <div className="whitespace-pre-wrap text-sm text-ink-100 leading-relaxed">
                {reflectMut.data.response.trim()}
              </div>
              <div className="mt-2 text-[10px] text-ink-600">
                model: {reflectMut.data.model}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
