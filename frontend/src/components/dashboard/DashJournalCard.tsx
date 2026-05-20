import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type Day } from '@/lib/api';

export function DashJournalCard() {
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const { data: day, isLoading } = useQuery<Day>({
    queryKey: ['journal-day', todayISO],
    queryFn: () => api.journal.getDay(todayISO),
    staleTime: 1000 * 60,
  });

  const hasEntry  = (day?.entries?.length ?? 0) > 0;
  const hasMood   = (day?.mood_codes?.length ?? 0) > 0;
  const hasTags   = (day?.tags?.length ?? 0) > 0;

  const entryPreview = useMemo(() => {
    if (!day?.entries?.length) return null;
    const text = day.entries[day.entries.length - 1].content_text?.trim();
    if (!text) return null;
    return text.length > 120 ? text.slice(0, 120) + '…' : text;
  }, [day]);

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0, font: '500 16px/1.2 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>
          Journal
        </h3>
        <Link
          to="/app/journal"
          style={{
            height: 30, padding: '0 12px', borderRadius: 8,
            display: 'inline-flex', alignItems: 'center',
            font: '500 12px/1 var(--font-sans)',
            color: 'var(--fg-2)', border: '1px solid var(--border-default)',
            background: 'var(--glass-bg)', textDecoration: 'none', transition: 'var(--transition)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border-strong)'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--fg-1)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border-default)'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--fg-2)'; }}
        >
          {hasEntry ? 'Open journal →' : 'Open journal →'}
        </Link>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--fg-4)', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>Loading…</div>
      ) : hasEntry ? (
        /* ── Has entry ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(hasMood || hasTags) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {day!.mood_codes.map((code) => (
                <span key={code} style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 999,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)',
                  color: 'var(--fg-3)', textTransform: 'capitalize',
                }}>
                  {code}
                </span>
              ))}
              {day!.tags.slice(0, 4).map((tag) => (
                <span key={tag} style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 999,
                  background: 'rgba(139,124,255,0.10)', border: '1px solid rgba(139,124,255,0.22)',
                  color: 'var(--primary-300)',
                }}>
                  #{tag}
                </span>
              ))}
              {day!.tags.length > 4 && (
                <span style={{ fontSize: 10, color: 'var(--fg-4)' }}>+{day!.tags.length - 4} more</span>
              )}
            </div>
          )}
          {entryPreview && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-3)', lineHeight: 1.55 }}>{entryPreview}</p>
          )}
          <div style={{ fontSize: 11, color: 'var(--fg-4)' }}>
            {day!.entries.length === 1 ? '1 entry today' : `${day!.entries.length} entries today`}
          </div>
        </div>
      ) : (
        /* ── Empty state with diagonal stripe bg ── */
        <div style={{
          border: '1px dashed var(--border-default)',
          borderRadius: 12,
          padding: '28px 20px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          textAlign: 'center',
          background: 'repeating-linear-gradient(135deg, transparent 0, transparent 12px, rgba(255,255,255,0.012) 12px, rgba(255,255,255,0.012) 24px)',
        }}>
          {/* Pencil icon in purple box */}
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(139,124,255,0.10)',
            border: '1px solid rgba(139,124,255,0.22)',
            color: 'var(--primary-300)',
            display: 'grid', placeItems: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </div>
          <div style={{ font: '500 14px/1.3 var(--font-display)', color: 'var(--fg-1)' }}>
            No entry for today yet.
          </div>
          <div style={{ color: 'var(--fg-4)', fontSize: 12, maxWidth: 320, lineHeight: 1.5 }}>
            Capture a mood, drop a few tags, write one line — North AI will help summarize what mattered.
          </div>
          <Link
            to="/app/journal"
            style={{
              marginTop: 6,
              height: 30, padding: '0 14px', borderRadius: 8,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              font: '500 12px/1 var(--font-sans)', color: 'white',
              background: 'var(--grad-primary)',
              boxShadow: 'var(--elev-1), var(--elev-glow)',
              textDecoration: 'none', transition: 'var(--transition)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Start writing
          </Link>
        </div>
      )}
    </div>
  );
}
