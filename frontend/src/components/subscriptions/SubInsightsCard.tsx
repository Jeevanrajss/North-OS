import { Loader2, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { renderBold } from '@/lib/renderBold';
import { useAIContent } from '@/contexts/AIContentContext';

const KEY = 'sub-insights';

const STAR = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z" />
  </svg>
);

export function SubInsightsCard() {
  const { getSlot, run } = useAIContent();
  const slot = getSlot(KEY);

  const insights: string[] = slot.text ? (JSON.parse(slot.text) as string[]) : [];
  const generated = slot.text !== null;

  function handleGenerate() {
    run(KEY, async () => {
      const data = await api.ai.subscriptionInsights();
      return JSON.stringify(data.insights);
    });
  }

  return (
    <div style={{
      position: 'relative',
      borderRadius: 16,
      padding: '18px 20px',
      background: `
        radial-gradient(360px 200px at 90% 0%, rgba(139,124,255,0.14), transparent 60%),
        linear-gradient(135deg, rgba(139,124,255,0.04), rgba(139,124,255,0.01)),
        var(--surface)
      `,
      border: '1px solid rgba(139,124,255,0.20)',
      overflow: 'hidden',
    }}>
      {/* AI tag */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        color: 'var(--primary-300)',
        font: '500 12px/1 var(--font-sans)',
        letterSpacing: '0.12em', textTransform: 'uppercase',
        marginBottom: 10,
      }}>
        {STAR}
        North AI · subscriptions
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <h3 style={{ margin: 0, font: '500 15px/1.3 var(--font-display)', color: 'var(--fg-1)' }}>
          Subscription Insights
        </h3>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={slot.isPending}
          title={generated ? 'Refresh' : 'Generate insights'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 8,
            font: '500 12px/1 var(--font-sans)',
            color: 'var(--primary-300)',
            background: 'rgba(139,124,255,0.10)',
            border: '1px solid rgba(139,124,255,0.22)',
            cursor: 'pointer', flexShrink: 0,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,124,255,0.20)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,124,255,0.10)'; }}
        >
          {slot.isPending
            ? <><Loader2 style={{ width: 11, height: 11 }} className="animate-spin" /> Analysing…</>
            : <><RefreshCw style={{ width: 11, height: 11 }} /> {generated ? 'Refresh' : 'Generate'}</>
          }
        </button>
      </div>

      {!generated && !slot.isPending && !slot.error && (
        <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--fg-3)', lineHeight: '19px' }}>
          AI-powered insights about your recurring spend — what to cancel, negotiate, or optimise.
        </p>
      )}

      {slot.isPending && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {[90, 75, 60].map((w, i) => (
            <div key={i} className="animate-pulse" style={{ height: 12, borderRadius: 6, background: 'rgba(139,124,255,0.12)', width: `${w}%` }} />
          ))}
        </div>
      )}

      {slot.error && (
        <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.18)' }}>
          <p style={{ margin: '0 0 2px', fontSize: 12, color: '#fca5a5', fontWeight: 500 }}>
            {slot.errorKind === 'unreachable' ? '📡 AI not reachable' :
             slot.errorKind === 'auth' ? '🔑 API key rejected' :
             slot.errorKind === 'model' ? '🤔 Model not found' : '⚠️ AI error'}
          </p>
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--fg-4)' }}>
            <Link to="/app/settings" style={{ color: 'var(--primary-300)', textDecoration: 'underline' }}>
              Check Settings → AI Provider
            </Link>
          </p>
        </div>
      )}

      {generated && insights.length === 0 && !slot.isPending && (
        <p style={{ fontSize: 12.5, color: 'var(--fg-3)', lineHeight: '19px', marginTop: 8 }}>
          Not enough subscription data yet — add your subscriptions first.
        </p>
      )}

      {insights.length > 0 && (
        <ul style={{ margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {insights.map((insight, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{
                flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
                background: 'rgba(139,124,255,0.15)', border: '1px solid rgba(139,124,255,0.30)',
                color: 'var(--primary-300)',
                fontSize: 10, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: 1,
              }}>
                {i + 1}
              </span>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--fg-3)', lineHeight: '19px' }}>
                {renderBold(insight)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
