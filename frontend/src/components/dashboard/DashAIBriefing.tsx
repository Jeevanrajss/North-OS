import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, type Day, type HabitsTodayResponse, type SubscriptionStatsResponse } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useBriefing, type ErrorKind } from '@/contexts/BriefingContext';
import { renderBold } from '@/lib/renderBold';

// ── Actionable error banner ──────────────────────────────────────────────────

const ERROR_COPY: Record<NonNullable<ErrorKind>, { icon: string; title: string; hint: string }> = {
  unreachable: {
    icon: '📡',
    title: 'AI server not reachable',
    hint: 'Check that LM Studio / Ollama is running, or switch to a cloud provider in',
  },
  auth: {
    icon: '🔑',
    title: 'API key rejected',
    hint: 'Your API key is invalid or expired. Update it in',
  },
  model: {
    icon: '🤔',
    title: 'Model not found',
    hint: 'The configured model doesn\'t exist on this server. Pick a different one in',
  },
  server: {
    icon: '⏳',
    title: 'Server is busy',
    hint: 'The LLM is still loading or overloaded. Try again in a moment, or check',
  },
  unknown: {
    icon: '⚠️',
    title: 'AI error',
    hint: 'Something went wrong. Check your AI configuration in',
  },
};

function BriefingError({ kind, message }: { kind: ErrorKind | null; message: string }) {
  const copy = ERROR_COPY[kind ?? 'unknown'];
  return (
    <div style={{
      marginTop: 8, padding: '10px 12px', borderRadius: 10,
      background: 'rgba(255,100,80,0.07)', border: '1px solid rgba(255,100,80,0.18)',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--fg-2)', fontWeight: 500 }}>
        {copy.icon} {copy.title}
      </p>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-4)', lineHeight: '18px' }}>
        {copy.hint}{' '}
        <Link
          to="/app/settings"
          style={{ color: 'var(--primary-300)', textDecoration: 'underline', textUnderlineOffset: 2 }}
        >
          Settings → AI Provider
        </Link>
        .
      </p>
    </div>
  );
}

export function DashAIBriefing() {
  const qc = useQueryClient();
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

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

  const { text: briefing, isPending, error, errorKind, generate } = useBriefing();

  // Detect if the briefing used pattern data (Phase 4 upgrade)
  const isPatternAware = !!briefing && briefing.toLowerCase().includes('pattern');

  async function handleGenerate() {
    // Trigger the server-side pattern-aware briefing (stores as notification),
    // then also run the local generation so the card shows content immediately.
    try {
      await fetch('/api/v1/notifications/trigger/morning-briefing', { method: 'POST' });
      qc.invalidateQueries({ queryKey: ['notif-count'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    } catch {
      // non-fatal — fall through to local generation
    }
    generate(habits, journal, subs);
  }

  return (
    <div style={{
      position: 'relative', borderRadius: 16, padding: '18px 20px',
      background: `
        radial-gradient(360px 200px at 90% 0%, rgba(139,124,255,0.20), transparent 60%),
        linear-gradient(135deg, rgba(139,124,255,0.06), rgba(139,124,255,0.01)),
        var(--surface)
      `,
      border: '1px solid rgba(139,124,255,0.24)',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        {/* AI tag + Pattern-aware badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: 'var(--primary-300)',
            font: '500 12px/1 var(--font-sans)',
            letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>
            <Sparkles style={{ width: 12, height: 12 }} />
            Morning Briefing
          </div>
          {isPatternAware && (
            <span style={{
              fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '2px 7px', borderRadius: 999,
              background: 'rgba(61,255,152,0.10)', color: 'var(--accent-green)',
              border: '1px solid rgba(61,255,152,0.22)',
            }}>
              Pattern-aware
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={isPending}
          title={briefing ? 'Regenerate briefing' : 'Generate briefing'}
          className={cn(
            'p-1 rounded-md border border-transparent',
            'disabled:opacity-40 transition-colors',
          )}
          style={{ color: 'var(--fg-4)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--primary-300)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)'; }}
        >
          {isPending
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5" />
          }
        </button>
      </div>

      {isPending && !briefing && (
        <div className="space-y-1.5 mt-1">
          {[90, 75, 60].map((w, i) => (
            <div key={i} className="h-3.5 bg-ink-900 rounded animate-pulse" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}

      {error && <BriefingError kind={errorKind} message={error} />}

      {briefing ? (
        <pre style={{
          fontSize: 13, color: 'var(--fg-3)', lineHeight: '20px',
          opacity: isPending ? 0.5 : 1,
          whiteSpace: 'pre-wrap', fontFamily: 'var(--font-sans)', margin: 0,
        }}>
          {renderBold(briefing)}
        </pre>
      ) : !isPending && !error ? (
        <div>
          <h3 style={{ margin: '14px 0 6px', font: '500 18px/1.2 var(--font-display)', letterSpacing: '-0.005em', color: 'var(--fg-1)' }}>
            Here's what matters today.
          </h3>
          <p style={{ margin: '0 0 16px', color: 'var(--fg-3)', fontSize: 13, lineHeight: '20px' }}>
            North AI scans your journal, habits, finance and calendar — then reflects back one short briefing for the day ahead. Runs locally via Ollama.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              style={{
                height: 36, padding: '0 14px', borderRadius: 10,
                display: 'inline-flex', alignItems: 'center', gap: 8,
                font: '500 13px/1 var(--font-sans)', color: 'white',
                background: 'var(--grad-primary)',
                boxShadow: 'var(--elev-1), var(--elev-glow)',
                border: 'none', cursor: 'pointer', transition: 'var(--transition)',
              }}
            >
              <Sparkles style={{ width: 14, height: 14 }} />
              Generate briefing
            </button>
            <span style={{ color: 'var(--fg-4)', fontSize: 11.5 }}>~30 sec</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
