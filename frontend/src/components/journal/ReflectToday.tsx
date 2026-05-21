import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type Day, type MoodCode } from '@/lib/api';
import { toISODate, formatDayHeader, fromISODate } from '@/lib/date';
import { ChevronDown, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { renderBold } from '@/lib/renderBold';
import { useAIContent } from '@/contexts/AIContentContext';

type Props = {
  date: Date;
};

const STORAGE_KEY = 'journal.reflect.open';

const SYSTEM_PROMPT =
  "You are a thoughtful, warm journal companion. You read a person's day log and reflect back with honesty and care. " +
  'Prefer concrete observations over generic advice. Use short paragraphs (no lists). Keep it under ~180 words. ' +
  'Speak directly to the writer in second person. If the day log is sparse, acknowledge that gently and suggest one small prompt they could write about. ' +
  'Use **bold** on 1–3 key observations, emotions, or themes so the writer can see what stands out at a glance.';

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
    header, moodLine, tagLine, summaryBlock, entriesBlock, '',
    'Please reflect on this day. What stands out? What pattern do you notice? End with one gentle question I could sit with.',
  ].join('\n');
}

export function ReflectToday({ date }: Props) {
  const iso = toISODate(date);
  const slotKey = `journal-reflect-${iso}`;

  const { getSlot, run } = useAIContent();
  const slot = getSlot(slotKey);

  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === '1';
  });

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, open ? '1' : '0'); } catch { /* ignore */ }
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

  const emptyish = useMemo(() => {
    if (!day) return true;
    const anySummary = day.summary_highlights || day.summary_wins || day.summary_learnings || day.summary_gratitude;
    return day.mood_codes.length === 0 && day.tags.length === 0 && !anySummary && day.entries.length === 0;
  }, [day]);

  function handleReflect() {
    if (!day) return;
    run(slotKey, async () => {
      const result = await api.aiPing(composePrompt(day, moods), {
        purpose: 'chat',
        system: SYSTEM_PROMPT,
        temperature: 0.7,
        max_tokens: 512,
      });
      return result.response.trim();
    });
  }

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
            Ask AI to read this day's moods, tags, summary, and entries, and reflect back.
            Runs locally or via your configured provider — nothing leaves your machine unless you use a cloud API.
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!day || slot.isPending}
              onClick={handleReflect}
              className={cn(
                'inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm',
                'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {slot.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…</>
              ) : slot.text ? (
                <><Sparkles className="w-3.5 h-3.5" /> Reflect again</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5" /> Reflect on today</>
              )}
            </button>
            {emptyish && !slot.text && (
              <span className="text-[11px] text-ink-500">
                Day looks empty — you'll get a gentle nudge to start writing.
              </span>
            )}
          </div>

          {slot.error && (
            <div className="text-xs border border-red-900/60 bg-red-950/30 rounded p-2 space-y-1">
              <p className="text-red-400">
                {slot.errorKind === 'unreachable' ? '📡 AI not reachable' :
                 slot.errorKind === 'auth' ? '🔑 API key rejected' : '⚠️ AI error'}
              </p>
              <p className="text-ink-500">
                <Link to="/app/settings" className="text-accent underline underline-offset-2">
                  Check Settings → AI Provider
                </Link>
              </p>
            </div>
          )}

          {slot.text && (
            <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface)] p-3">
              <div className="text-sm text-ink-100 leading-relaxed whitespace-pre-wrap">
                {renderBold(slot.text)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
