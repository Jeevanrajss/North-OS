import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

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
      const ratio = t.count / max;
      // size bucket: 1 = small, 2 = medium, 3 = large
      const size = ratio > 0.75 ? 3 : ratio > 0.5 ? 2 : 1;
      return { ...t, size };
    });
  }, [data]);

  const total     = sized.reduce((s, t) => s + t.count, 0);
  const uniqueCnt = sized.length;

  function chipStyle(size: number) {
    if (size === 3) return {
      fontSize: 14,
      background: 'rgba(184,165,255,0.14)',
      color: 'var(--fg-1)',
      border: '1px solid rgba(184,165,255,0.32)',
    };
    if (size === 2) return {
      fontSize: 13,
      background: 'rgba(184,165,255,0.08)',
      color: 'var(--primary-300)',
      border: '1px solid rgba(184,165,255,0.18)',
    };
    return {
      fontSize: 12,
      background: 'var(--glass-bg)',
      color: 'var(--fg-2)',
      border: '1px solid var(--border-default)',
    };
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* Header */}
      <h3 style={{ margin: '0 0 14px', font: '500 12px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Top tags
        <span style={{ color: 'var(--fg-3)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'none', fontWeight: 400 }}>30 days</span>
      </h3>

      {sized.length === 0 ? (
        <div style={{ color: 'var(--fg-4)', fontSize: 13 }}>No tags yet in the window.</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sized.map((t) => (
              <span
                key={t.name}
                title={`${t.count} day${t.count === 1 ? '' : 's'}`}
                style={{
                  ...chipStyle(t.size),
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 10px', borderRadius: 8,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 500,
                  transition: 'border-color var(--dur) var(--ease)',
                }}
              >
                {t.name}
                <span style={{ color: 'var(--fg-4)', fontSize: 11 }}>{t.count}</span>
              </span>
            ))}
          </div>

          {/* Footer */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--fg-4)' }}>
            <span>{total} total · {uniqueCnt} unique</span>
          </div>
        </>
      )}
    </div>
  );
}
