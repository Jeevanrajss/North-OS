import { useState } from 'react';
import { api, type TagSuggestionReason } from '@/lib/api';
import { Loader2, Sparkles, Check, X } from 'lucide-react';

type Props = {
  /** ISO date (YYYY-MM-DD) — the day to get suggestions for. */
  date: string;
  /** Tags already applied to the day — used to filter stale suggestions. */
  existingTags: string[];
  /** Called with the tag the user accepted. Parent merges into day.tags. */
  onAccept: (tag: string) => void;
};

const REASON_COPY: Record<TagSuggestionReason, string> = {
  ok: '',
  too_short:
    "Not enough written yet for AI tagging — log a mood or jot down an entry first.",
  llm_error: 'AI model is unreachable. Check LM Studio is running.',
  parse_failed:
    "Model's response couldn't be parsed as a tag list. Click 'show raw' to see what it said.",
  all_existing: 'All AI suggestions are already on this day.',
  empty_response: 'Model returned an empty response.',
};

export function SuggestedTags({ date, existingTags, onAccept }: Props) {
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<TagSuggestionReason | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [model, setModel] = useState<string>('');
  const [showRaw, setShowRaw] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    setReason(null);
    setRaw(null);
    try {
      const res = await api.journal.suggestDayTags(date);
      const fresh = res.suggestions.filter((t) => !existingTags.includes(t));
      setSuggestions(fresh);
      setModel(res.model);
      setReason(res.reason);
      setRaw(res.raw);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suggestion failed');
    } finally {
      setLoading(false);
    }
  }

  function accept(tag: string) {
    onAccept(tag);
    setSuggestions((s) => (s ? s.filter((t) => t !== tag) : s));
  }

  function reject(tag: string) {
    setSuggestions((s) => (s ? s.filter((t) => t !== tag) : s));
  }

  const reasonMsg = reason && reason !== 'ok' ? REASON_COPY[reason] : '';

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-800 bg-ink-900 px-2.5 py-1 text-xs text-ink-300 hover:border-accent/40 hover:text-accent disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3" />
          )}
          {suggestions === null ? 'Suggest tags' : 'Suggest again'}
        </button>
        {model && <span className="text-[11px] text-ink-600 font-mono">{model}</span>}
        {raw && (
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="text-[11px] text-ink-600 hover:text-ink-400 underline"
          >
            {showRaw ? 'hide raw' : 'show raw'}
          </button>
        )}
      </div>

      {error && <div className="mt-2 text-xs text-red-400">{error}</div>}

      {reasonMsg && <div className="mt-2 text-xs text-amber-400/80">{reasonMsg}</div>}

      {suggestions && suggestions.length === 0 && !loading && reason === 'ok' && (
        <div className="mt-2 text-xs text-ink-600">No new suggestions.</div>
      )}

      {suggestions && suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-accent/40 bg-accent/10 px-2 py-0.5 text-xs text-accent"
            >
              {t}
              <button
                type="button"
                onClick={() => accept(t)}
                className="rounded hover:bg-accent/20 p-0.5"
                aria-label={`Accept ${t}`}
                title="Accept"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => reject(t)}
                className="rounded hover:bg-ink-800 p-0.5 text-ink-400"
                aria-label={`Reject ${t}`}
                title="Reject"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {showRaw && raw && (
        <pre className="mt-2 max-h-40 overflow-auto rounded border border-ink-800 bg-ink-950 p-2 text-[11px] text-ink-400 whitespace-pre-wrap font-mono">
          {raw}
        </pre>
      )}
    </div>
  );
}
