import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api, type Day } from '@/lib/api';
import { cn } from '@/lib/cn';

export function DashJournalCard() {
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const { data: day, isLoading } = useQuery<Day>({
    queryKey: ['journal-day', todayISO],
    queryFn: () => api.journal.getDay(todayISO),
    staleTime: 1000 * 60,
  });

  const hasEntry = (day?.entries?.length ?? 0) > 0;
  const entryPreview = useMemo(() => {
    if (!day?.entries?.length) return null;
    const latest = day.entries[day.entries.length - 1];
    const text = latest.content_text?.trim();
    if (!text) return null;
    return text.length > 120 ? text.slice(0, 120) + '…' : text;
  }, [day]);

  const hasMood = (day?.mood_codes?.length ?? 0) > 0;
  const hasTags = (day?.tags?.length ?? 0) > 0;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="card-title mb-0">Today's Journal</div>
        <Link to="/journal" className="flex items-center gap-1 text-[11px] text-ink-500 hover:text-accent transition-colors">
          {hasEntry ? 'Open' : 'Write'} <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {isLoading ? (
        <div className="text-xs text-ink-500 py-4 text-center">Loading…</div>
      ) : hasEntry ? (
        <div className="space-y-2.5">
          {/* Mood + tags row */}
          {(hasMood || hasTags) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {day!.mood_codes.map((code) => (
                <span key={code}
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-ink-900 border border-ink-800 text-ink-300 capitalize">
                  {code}
                </span>
              ))}
              {day!.tags.slice(0, 4).map((tag) => (
                <span key={tag}
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-accent/80">
                  #{tag}
                </span>
              ))}
              {day!.tags.length > 4 && (
                <span className="text-[10px] text-ink-600">+{day!.tags.length - 4} more</span>
              )}
            </div>
          )}

          {/* Entry preview */}
          {entryPreview && (
            <p className="text-sm text-ink-400 leading-relaxed">{entryPreview}</p>
          )}

          <div className={cn(
            'text-[11px]',
            day!.entries.length > 1 ? 'text-ink-500' : 'text-ink-600',
          )}>
            {day!.entries.length === 1
              ? '1 entry today'
              : `${day!.entries.length} entries today`}
          </div>
        </div>
      ) : (
        <p className="text-xs text-ink-600 py-4 text-center">Nothing written yet today.</p>
      )}
    </div>
  );
}
