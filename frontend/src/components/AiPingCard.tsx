import { useState } from 'react';
import { api } from '@/lib/api';
import { Send, Loader2 } from 'lucide-react';

export function AiPingCard() {
  const [prompt, setPrompt] = useState('Give me a one-sentence motivational line for today.');
  const [response, setResponse] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setLoading(true);
    setError(null);
    setResponse('');
    try {
      const res = await api.aiPing(prompt);
      setResponse(res.response);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title">AI ping</div>
      <div className="flex gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !loading && send()}
          className="flex-1 rounded-md px-3 py-2 text-sm
                     focus:outline-none focus:border-accent/60"
          placeholder="Ask anything…"
        />
        <button
          onClick={send}
          disabled={loading}
          className="px-4 py-2 rounded-md bg-accent/20 border border-accent/40 text-accent
                     hover:bg-accent/30 disabled:opacity-50 flex items-center gap-2 text-sm"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send
        </button>
      </div>
      {response && (
        <div className="mt-4 text-sm text-ink-100 rounded-md p-3 whitespace-pre-wrap">
          {response}
        </div>
      )}
      {error && (
        <div className="mt-4 text-sm text-red-400 bg-red-950/30 border border-red-900/50 rounded-md p-3">
          {error}
        </div>
      )}
    </div>
  );
}
