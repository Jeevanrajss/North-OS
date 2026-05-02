import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Day, type DayPatch } from '@/lib/api';
import { formatDayHeader, fromISODate, toISODate } from '@/lib/date';
import { MoodPicker } from './MoodPicker';
import { TagChips } from './TagChips';
import { SuggestedTags } from './SuggestedTags';
import { SummaryFields } from './SummaryFields';
import { EntryList } from './EntryList';
import { ChevronDown, ChevronRight, Loader2, Sparkles } from 'lucide-react';

const DAY_CARD_STORAGE_KEY = 'journal.dayCard.open';

type Props = {
  date: Date;
};

export function DayView({ date }: Props) {
  const qc = useQueryClient();
  const iso = toISODate(date);

  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const raw = window.localStorage.getItem(DAY_CARD_STORAGE_KEY);
    return raw === null ? true : raw === '1';
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(DAY_CARD_STORAGE_KEY, open ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [open]);

  const { data: day, isLoading, error } = useQuery({
    queryKey: ['day', iso],
    queryFn: () => api.journal.getDay(iso),
  });

  const patchMut = useMutation({
    mutationFn: (patch: DayPatch) => api.journal.patchDay(iso, patch),
    onSuccess: (next) => {
      qc.setQueryData<Day>(['day', iso], next);
      // calendar range queries — naive invalidate
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
    mutationFn: (payload: { content_json: string; content_text: string }) =>
      api.journal.createEntry(iso, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['day', iso] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
  });

  const updateEntryMut = useMutation({
    mutationFn: (args: { entryId: string; content_json: string; content_text: string }) =>
      api.journal.updateEntry(args.entryId, {
        content_json: args.content_json,
        content_text: args.content_text,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['day', iso] });
    },
  });

  const deleteEntryMut = useMutation({
    mutationFn: (entryId: string) => api.journal.deleteEntry(entryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['day', iso] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
  });

  async function onPatch(patch: DayPatch) {
    await patchMut.mutateAsync(patch);
  }

  async function onAcceptTag(tag: string) {
    if (!day) return;
    if (day.tags.includes(tag)) return;
    await onPatch({ tags: [...day.tags, tag] });
  }

  if (isLoading || !day) {
    return (
      <div className="card flex items-center justify-center py-10 text-ink-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading day…
      </div>
    );
  }
  if (error) {
    return <div className="card text-sm text-red-400">Failed to load day.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="card">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between text-left -m-1 p-1 rounded hover:bg-ink-900/40 transition-colors"
          aria-expanded={open}
          aria-controls="day-card-body"
        >
          <div className="flex items-baseline gap-2 min-w-0">
            <h2 className="text-lg font-semibold text-ink-50 truncate">
              {formatDayHeader(fromISODate(day.date))}
            </h2>
            {!open && (
              <span className="text-[11px] text-ink-500 truncate">
                {day.mood_codes.length} mood{day.mood_codes.length === 1 ? '' : 's'} ·{' '}
                {day.tags.length} tag{day.tags.length === 1 ? '' : 's'}
                {day.has_summary ? ' · summary' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {patchMut.isPending && (
              <span className="text-xs text-ink-500 inline-flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Saving…
              </span>
            )}
            <span className="text-ink-500">
              {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </span>
          </div>
        </button>

        {open && (
          <div id="day-card-body" className="mt-3 space-y-4">
            <section>
              <div className="card-title">Mood</div>
              <MoodPicker
                selected={day.mood_codes}
                onChange={(codes) => void onPatch({ mood_codes: codes })}
              />
            </section>

            <section>
              <div className="card-title">Tags</div>
              <TagChips tags={day.tags} onChange={(tags) => void onPatch({ tags })} />
              <SuggestedTags
                date={iso}
                existingTags={day.tags}
                onAccept={onAcceptTag}
              />
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <div className="card-title !mb-0">Daily Summary</div>
                <button
                  type="button"
                  onClick={() => summarizeMut.mutate()}
                  disabled={summarizeMut.isPending || day.entries.length === 0}
                  title={day.entries.length === 0 ? 'Write an entry first' : 'AI auto-fill from today\'s entries'}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px]
                             border border-accent/30 bg-accent/10 text-accent
                             hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {summarizeMut.isPending
                    ? <><Loader2 className="w-3 h-3 animate-spin" /> Thinking…</>
                    : <><Sparkles className="w-3 h-3" /> AI Auto-fill</>
                  }
                </button>
              </div>
              {summarizeMut.isError && (
                <p className="text-[11px] text-red-400 mb-2">
                  {(summarizeMut.error as Error).message}
                </p>
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
            </section>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Entries</div>
        <EntryList
          entries={day.entries}
          onCreate={(json, text) =>
            createEntryMut.mutateAsync({ content_json: json, content_text: text }).then(() => undefined)
          }
          onUpdate={(entryId, json, text) =>
            updateEntryMut.mutateAsync({ entryId, content_json: json, content_text: text }).then(() => undefined)
          }
          onDelete={(entryId) => deleteEntryMut.mutateAsync(entryId).then(() => undefined)}
        />
      </div>
    </div>
  );
}
