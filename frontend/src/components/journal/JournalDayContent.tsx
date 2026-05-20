/**
 * JournalDayContent
 * Full day editing area: Mood+Tags (left) | Reflect AI (right),
 * Daily Summary (full-width), Entries (full-width).
 * Replaces the old DayView + ReflectToday layout.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Sparkles, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, type Day, type DayPatch, type MoodCode } from '@/lib/api';
import { toISODate } from '@/lib/date';
import { cn } from '@/lib/cn';
import { renderBold } from '@/lib/renderBold';
import { useAIContent } from '@/contexts/AIContentContext';
import { MoodPicker } from './MoodPicker';
import { TagChips } from './TagChips';
import { SuggestedTags } from './SuggestedTags';
import { SummaryFields } from './SummaryFields';
import { EntryList } from './EntryList';

/* ────────────────────────────────────────────────────────────────────────────
   Reflect card (right column) — gradient purple, AI reflection
   ────────────────────────────────────────────────────────────────────────── */
const REFLECT_SYSTEM =
  "You are a thoughtful, warm journal companion. You read a person's day log and reflect back with honesty and care. " +
  'Prefer concrete observations over generic advice. Use short paragraphs (no lists). Keep it under ~180 words. ' +
  'Speak directly to the writer in second person. If the day log is sparse, acknowledge that gently and suggest one small prompt they could sit with. ' +
  'Use **bold** on 1–3 key observations, emotions, or themes so the writer can see what stands out at a glance.';

function composePrompt(day: Day, moods: MoodCode[] | undefined): string {
  const moodLabel = (code: string) => moods?.find((x) => x.code === code)
    ? `${moods!.find((x) => x.code === code)!.emoji} ${moods!.find((x) => x.code === code)!.label}`
    : code;

  const lines = [
    `Date: ${day.date}`,
    day.mood_codes.length ? `Moods: ${day.mood_codes.map(moodLabel).join(', ')}` : 'Moods: (none)',
    day.tags.length ? `Tags: ${day.tags.join(', ')}` : 'Tags: (none)',
    day.summary_highlights ? `Highlights: ${day.summary_highlights}` : '',
    day.summary_wins ? `Wins: ${day.summary_wins}` : '',
    day.summary_learnings ? `Learnings: ${day.summary_learnings}` : '',
    day.summary_gratitude ? `Gratitude: ${day.summary_gratitude}` : '',
    day.entries.length
      ? `Entries (${day.entries.length}):\n${day.entries.map((e, i) => `--- ${i + 1} ---\n${e.content_text.trim().slice(0, 600)}`).join('\n')}`
      : 'Entries: (none)',
    '',
    'Please reflect on this day. What stands out? What pattern do you notice? End with one gentle question I could sit with.',
  ].filter((l) => l !== undefined);
  return lines.join('\n');
}

function ReflectCard({ iso, day }: { iso: string; day: Day | undefined }) {
  const slotKey = `journal-reflect-${iso}`;
  const { getSlot, run } = useAIContent();
  const slot = getSlot(slotKey);

  const { data: moods } = useQuery({
    queryKey: ['moods'],
    queryFn: api.journal.listMoods,
    staleTime: 1000 * 60 * 60,
  });

  function handleReflect() {
    if (!day) return;
    run(slotKey, async () => {
      const result = await api.aiPing(composePrompt(day, moods), {
        purpose: 'chat',
        system: REFLECT_SYSTEM,
        temperature: 0.7,
        max_tokens: 512,
      });
      return result.response.trim();
    });
  }

  const emptyish = useMemo(() => {
    if (!day) return true;
    return (
      day.mood_codes.length === 0 &&
      day.tags.length === 0 &&
      !day.summary_highlights &&
      !day.summary_wins &&
      !day.summary_learnings &&
      !day.summary_gratitude &&
      day.entries.length === 0
    );
  }, [day]);

  return (
    <div
      className="flex flex-col gap-4 relative overflow-hidden"
      style={{
        borderRadius: 20,
        padding: 28,
        background: [
          'radial-gradient(360px 240px at 80% 0%, rgba(139,124,255,0.22), transparent 60%)',
          'radial-gradient(280px 200px at 10% 100%, rgba(62,190,255,0.16), transparent 60%)',
          'linear-gradient(135deg, rgba(139,124,255,0.08), rgba(139,124,255,0.02))',
          '#151827',
        ].join(', '),
        border: '1px solid rgba(139,124,255,0.28)',
        boxShadow: '0 0 40px rgba(139,124,255,0.15)',
      }}
    >
      {/* Corner orb */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: -40, right: -40, width: 180, height: 180, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,124,255,0.4) 0%, transparent 70%)',
          filter: 'blur(8px)',
        }}
      />

      {/* Header */}
      <div className="flex items-center gap-1.5 relative z-10">
        <Zap className="w-3 h-3" style={{ color: '#B8A5FF' }} />
        <span
          style={{
            fontSize: 11, fontWeight: 500, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: '#B8A5FF',
          }}
        >
          Reflect with North AI
        </span>
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1">
        <h3
          className="text-white leading-tight mb-2"
          style={{ font: '500 24px/1.2 "Clash Grotesk", Inter, sans-serif', letterSpacing: '-0.01em', marginTop: 12 }}
        >
          Ask anything about today.
        </h3>
        <p style={{ color: '#A0A9BC', fontSize: 13.5, lineHeight: '22px', margin: '0 0 20px' }}>
          Gemma reads this day's moods, tags, summary, and entries — and reflects back.
          Runs locally via Ollama; no data leaves your machine.
        </p>
      </div>

      {/* CTA */}
      <div className="relative z-10 space-y-2" style={{ marginTop: 'auto' }}>
        <button
          type="button"
          disabled={!day || slot.isPending}
          onClick={handleReflect}
          className="btn-ghost inline-flex items-center gap-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.16)',
          }}
        >
          {slot.isPending
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…</>
            : <><Sparkles className="w-3.5 h-3.5" /> {slot.text ? 'Reflect again' : 'Reflect on today'}</>
          }
        </button>

        {emptyish && !slot.text && !slot.isPending && (
          <p className="text-[11px] text-purple-300/50">
            Day looks light — a gentle nudge to start writing.
          </p>
        )}
      </div>

      {/* Error */}
      {slot.error && (
        <div className="relative z-10 rounded-xl p-3 bg-red-900/30 border border-red-500/20 text-xs space-y-1">
          <p className="text-red-300">
            {slot.errorKind === 'unreachable' ? '📡 AI not reachable' :
             slot.errorKind === 'auth' ? '🔑 API key rejected' : '⚠️ AI error'}
          </p>
          <p className="text-purple-300/60">
            <Link to="/app/settings" className="underline underline-offset-2 text-purple-300">
              Check Settings → AI Provider
            </Link>
          </p>
        </div>
      )}

      {/* Reflection output */}
      {slot.text && (
        <div className="relative z-10 rounded-xl p-3 text-sm text-white/90 leading-relaxed"
          style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {renderBold(slot.text)}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Main component
   ────────────────────────────────────────────────────────────────────────── */
type Props = { date: Date };

export function JournalDayContent({ date }: Props) {
  const qc = useQueryClient();
  const iso = toISODate(date);
  const [composingEntry, setComposingEntry] = useState(false);

  const { data: day, isLoading, error } = useQuery({
    queryKey: ['day', iso],
    queryFn: () => api.journal.getDay(iso),
  });

  const patchMut = useMutation({
    mutationFn: (patch: DayPatch) => api.journal.patchDay(iso, patch),
    onSuccess: (next) => {
      qc.setQueryData<Day>(['day', iso], next);
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
  });

  const summarizeMut = useMutation({
    mutationFn: () => api.journal.summarize(iso),
    onSuccess: (next) => {
      qc.setQueryData<Day>(['day', iso], next);
      qc.invalidateQueries({ queryKey: ['journal-day', iso] });
    },
  });

  const createEntryMut = useMutation({
    mutationFn: (p: { content_json: string; content_text: string }) =>
      api.journal.createEntry(iso, p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['day', iso] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
  });

  const updateEntryMut = useMutation({
    mutationFn: (a: { entryId: string; content_json: string; content_text: string }) =>
      api.journal.updateEntry(a.entryId, { content_json: a.content_json, content_text: a.content_text }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['day', iso] }),
  });

  const deleteEntryMut = useMutation({
    mutationFn: (id: string) => api.journal.deleteEntry(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['day', iso] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
  });

  async function onPatch(patch: DayPatch) {
    await patchMut.mutateAsync(patch);
  }

  async function onAcceptTag(tag: string) {
    if (!day || day.tags.includes(tag)) return;
    await onPatch({ tags: [...day.tags, tag] });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-ink-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
      </div>
    );
  }
  if (error || !day) {
    return <div className="card text-sm text-red-400">Failed to load day data.</div>;
  }

  const isSaving = patchMut.isPending;

  return (
    <div className="space-y-5">

      {/* ── Row 1: Mood + Tags (left) | Reflect AI (right) ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-6">

        {/* Left: Mood + Tags — day-card style */}
        <div
          className="relative overflow-hidden"
          style={{
            borderRadius: 20,
            background: [
              'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))',
              '#151827',
            ].join(', '),
            border: '1px solid rgba(255,255,255,0.08)',
            padding: '28px 32px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {/* Subtle top-right glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(420px 280px at 100% -10%, rgba(139,124,255,0.10), transparent 60%)',
            }}
          />
          {/* Mood */}
          <section className="relative z-10">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ font: '500 12px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)' }}>Mood</div>
              {isSaving && <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--fg-4)' }} />}
            </div>
            <MoodPicker
              selected={day.mood_codes}
              onChange={(codes) => void onPatch({ mood_codes: codes })}
            />
          </section>

          {/* Tags */}
          <section className="relative z-10">
            <div style={{ font: '500 12px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 10 }}>Tags</div>
            <TagChips
              tags={day.tags}
              onChange={(tags) => void onPatch({ tags })}
            />
            <SuggestedTags date={iso} existingTags={day.tags} onAccept={onAcceptTag} />
          </section>
        </div>

        {/* Right: Reflect AI card */}
        <ReflectCard iso={iso} day={day} />
      </div>

      {/* ── Row 2: Entries ───────────────────────────────────────────────── */}
      <div
        style={{
          borderRadius: 20,
          background: 'var(--surface)',
          border: '1px solid var(--border-default)',
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3
              style={{
                margin: 0,
                font: '500 16px/1.2 var(--font-display)',
                letterSpacing: '-0.01em',
                color: 'var(--fg-1)',
              }}
            >
              Entries
            </h3>
            <span
              style={{
                fontSize: 11, fontWeight: 500,
                color: 'var(--fg-4)',
                background: 'var(--surface-hover)',
                padding: '2px 7px', borderRadius: 6,
                fontVariantNumeric: 'tabular-nums',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {day.entries.length}
            </span>
          </div>
          {!composingEntry && (
            <button
              type="button"
              onClick={() => setComposingEntry(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 26, padding: '0 10px', borderRadius: 8,
                font: '500 11.5px/1 var(--font-sans)',
                color: 'var(--primary-300)',
                background: 'rgba(139,124,255,0.10)',
                border: '1px solid rgba(139,124,255,0.22)',
                cursor: 'pointer',
              }}
            >
              <Plus className="w-3 h-3" /> Add entry
            </button>
          )}
        </div>

        {day.entries.length === 0 && !composingEntry ? (
          <EntriesEmptyState onStart={() => setComposingEntry(true)} />
        ) : null}

        <EntryList
          entries={day.entries}
          composing={composingEntry}
          onSetComposing={setComposingEntry}
          onCreate={(json, text) =>
            createEntryMut.mutateAsync({ content_json: json, content_text: text }).then(() => undefined)
          }
          onUpdate={(id, json, text) =>
            updateEntryMut.mutateAsync({ entryId: id, content_json: json, content_text: text }).then(() => undefined)
          }
          onDelete={(id) => deleteEntryMut.mutateAsync(id).then(() => undefined)}
        />
      </div>

      {/* ── Row 3: Daily Summary ──────────────────────────────────────────── */}
      <div
        style={{
          borderRadius: 20,
          background: 'var(--surface)',
          border: '1px solid var(--border-default)',
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3
            style={{
              margin: 0,
              font: '500 16px/1.2 var(--font-display)',
              letterSpacing: '-0.01em',
              color: 'var(--fg-1)',
            }}
          >
            Daily summary
          </h3>
          <button
            type="button"
            onClick={() => summarizeMut.mutate()}
            disabled={summarizeMut.isPending || day.entries.length === 0}
            title={day.entries.length === 0 ? 'Write an entry first' : 'AI auto-fill from today\'s entries'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg text-xs font-medium transition-colors',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
            style={{
              height: 26, padding: '0 10px',
              color: '#B8A5FF',
              background: 'rgba(139,124,255,0.10)',
              border: '1px solid rgba(139,124,255,0.22)',
            }}
          >
            {summarizeMut.isPending
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Thinking…</>
              : <><Sparkles className="w-3 h-3" /> AI auto-fill</>
            }
          </button>
        </div>
        {summarizeMut.isError && (
          <p className="text-xs text-red-400 mb-3">{(summarizeMut.error as Error).message}</p>
        )}
        <SummaryFields
          values={{
            summary_highlights: day.summary_highlights,
            summary_wins: day.summary_wins,
            summary_learnings: day.summary_learnings,
            summary_gratitude: day.summary_gratitude,
          }}
          onPatch={onPatch}
          disabled={summarizeMut.isPending}
        />
      </div>
    </div>
  );
}

function EntriesEmptyState({ onStart }: { onStart: () => void }) {
  return (
    <button
      type="button"
      onClick={onStart}
      style={{
        width: '100%', textAlign: 'center',
        border: '1px dashed var(--border-default)',
        borderRadius: 12,
        padding: 32,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        background: 'repeating-linear-gradient(135deg, transparent 0, transparent 12px, rgba(255,255,255,0.012) 12px, rgba(255,255,255,0.012) 24px)',
        cursor: 'pointer',
        transition: 'border-color 200ms, background 200ms',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(139,124,255,0.40)';
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,124,255,0.04)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)';
        (e.currentTarget as HTMLButtonElement).style.background =
          'repeating-linear-gradient(135deg, transparent 0, transparent 12px, rgba(255,255,255,0.012) 12px, rgba(255,255,255,0.012) 24px)';
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 12,
        display: 'grid', placeItems: 'center',
        background: 'rgba(139,124,255,0.10)',
        border: '1px solid rgba(139,124,255,0.22)',
        color: 'var(--primary-300)',
      }}>
        <Pencil style={{ width: 16, height: 16 }} />
      </div>
      <div style={{ font: '500 15px/1.3 var(--font-display)', color: 'var(--fg-1)' }}>
        Start a thread.
      </div>
      <div style={{ color: 'var(--fg-4)', fontSize: 12.5 }}>
        Short notes stack here — timestamped, searchable, AI-grounded.
      </div>
    </button>
  );
}
