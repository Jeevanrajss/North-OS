import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Lightweight tag cloud — top N tags in the last 30 days sized by frequency.
 * Not interactive for v1 (no filter), purely a reflection surface.
 */
export function TagCloud() {
  const { data } = useQuery({
    queryKey: ['stats', 30],
    queryFn: () => api.journal.stats(30),
    staleTime: 1000 * 60,
  });

  const sized = useMemo(() => {
    const tags = data?.top_tags ?? [];
    if (tags.length === 0) return [];
    const max = Math.max(...tags.map((t) => t.count));
    return tags.map((t) => {
      // Map count → size bucket (4 steps).
      const ratio = t.count / max;
      let sizeClass = 'text-[11px]';
      if (ratio > 0.75) sizeClass = 'text-base';
      else if (ratio > 0.5) sizeClass = 'text-sm';
      else if (ratio > 0.25) sizeClass = 'text-xs';
      return { ...t, sizeClass };
    });
  }, [data]);

  return (
    <div className="card">
      <div className="card-title">Tags — last 30 days</div>
      {sized.length === 0 ? (
        <div className="text-xs text-ink-600">No tags yet in the window.</div>
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {sized.map((t) => (
            <span
              key={t.name}
              title={`${t.count} day${t.count === 1 ? '' : 's'}`}
              className={`${t.sizeClass} text-ink-400 hover:text-accent transition-colors`}
            >
              {t.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
