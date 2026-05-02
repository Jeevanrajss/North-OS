import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Search, X } from 'lucide-react';
import { api, type JournalSearchResult } from '@/lib/api';
import { cn } from '@/lib/cn';

export function JournalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<JournalSearchResult[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const mut = useMutation({
    mutationFn: (q: string) => api.journal.search(q, 6),
    onSuccess: (data) => setResults(data),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    mut.mutate(q);
  }

  function clear() {
    setQuery('');
    setResults(null);
    mut.reset();
    inputRef.current?.focus();
  }

  const offline = mut.isError && (mut.error as Error).message.includes('503');

  return (
    <div className="card">
      <div className="card-title">Semantic Search</div>

      <form onSubmit={submit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-600 pointer-events-none" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your journal by meaning…"
            className="w-full pl-8 pr-8 py-1.5 bg-ink-900 border border-ink-800 rounded-md text-sm
                       placeholder:text-ink-600 outline-none focus:border-accent/60"
          />
          {query && (
            <button type="button" onClick={clear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-600 hover:text-ink-300">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={!query.trim() || mut.isPending}
          className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/30 text-xs text-accent
                     hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {mut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Search'}
        </button>
      </form>

      {offline && (
        <p className="mt-2 text-xs text-amber-400">
          LM Studio is offline — semantic search requires the embed model.
        </p>
      )}
      {mut.isError && !offline && (
        <p className="mt-2 text-xs text-red-400">{(mut.error as Error).message}</p>
      )}

      {results !== null && (
        <div className="mt-3">
          {results.length === 0 ? (
            <p className="text-xs text-ink-500 text-center py-3">
              No matching entries found.
            </p>
          ) : (
            <ul className="space-y-2">
              {results.map((r) => (
                <li key={r.entry_id}
                  className="rounded-md border border-ink-800 bg-ink-950 px-3 py-2.5 hover:border-ink-700 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <Link
                      to="/journal"
                      state={{ date: r.day_date }}
                      className="text-[11px] font-medium text-accent hover:underline"
                    >
                      {r.day_date}
                    </Link>
                    <span className={cn(
                      'text-[10px] tabular-nums',
                      r.score > 0.85 ? 'text-emerald-400' : r.score > 0.7 ? 'text-yellow-400/80' : 'text-ink-600',
                    )}>
                      {Math.round(r.score * 100)}% match
                    </span>
                  </div>
                  <p className="text-xs text-ink-400 leading-relaxed line-clamp-3">{r.snippet}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
