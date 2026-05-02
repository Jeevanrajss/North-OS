import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Sparkles, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

export function HabitInsightsCard() {
  const [insights, setInsights] = useState<string[]>([]);
  const [generated, setGenerated] = useState(false);

  const mut = useMutation({
    mutationFn: () => api.ai.habitInsights(),
    onSuccess: (data) => {
      setInsights(data.insights);
      setGenerated(true);
    },
  });

  const offline = mut.isError && (mut.error as Error).message.includes('503');

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-accent" />
          <div className="card-title !mb-0">AI Habit Insights</div>
        </div>
        <button
          type="button"
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          className={cn(
            'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px]',
            'border border-accent/30 bg-accent/10 text-accent',
            'hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
          )}
        >
          {mut.isPending
            ? <><Loader2 className="w-3 h-3 animate-spin" /> Analysing…</>
            : <><Sparkles className="w-3 h-3" /> {generated ? 'Refresh' : 'Generate'}</>
          }
        </button>
      </div>

      {!generated && !mut.isPending && (
        <p className="text-xs text-ink-500">
          Click Generate to get AI-powered insights about your habit patterns from the last 30 days.
        </p>
      )}

      {mut.isPending && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 bg-ink-900 rounded animate-pulse" style={{ width: `${70 + i * 8}%` }} />
          ))}
        </div>
      )}

      {offline && (
        <p className="text-xs text-amber-400">
          LM Studio is offline — start it and load a chat model to use AI insights.
        </p>
      )}

      {mut.isError && !offline && (
        <p className="text-xs text-red-400">{(mut.error as Error).message}</p>
      )}

      {generated && insights.length === 0 && !mut.isPending && (
        <p className="text-xs text-ink-500">
          Not enough data yet — keep tracking for a few more days and try again.
        </p>
      )}

      {insights.length > 0 && (
        <ul className="space-y-2.5">
          {insights.map((insight, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="shrink-0 w-5 h-5 rounded-full bg-accent/15 border border-accent/25 text-accent text-[10px] font-semibold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-ink-200 leading-relaxed">{insight}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
