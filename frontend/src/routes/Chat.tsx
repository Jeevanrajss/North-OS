import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Trash2, Bot, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

/* ── types ─────────────────────────────────────────────────────────── */
type Role = 'user' | 'assistant';

interface Message {
  id: string;
  role: Role;
  content: string;
  ts: Date;
}

/* ── suggested prompts ─────────────────────────────────────────────── */
const SUGGESTIONS = [
  '📊 How did I do on my habits this week?',
  "💸 What's my biggest expense category this month?",
  '😌 What mood have I been in lately?',
  '🔁 Which subscriptions are renewing soon?',
  '📓 Summarise my last few journal entries',
  '💰 Am I spending more or less than last month?',
  "🏆 What's my longest habit streak right now?",
  '🎯 Where should I focus my energy this week?',
];

/* ── helpers ───────────────────────────────────────────────────────── */
function uid() {
  return Math.random().toString(36).slice(2);
}

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ── typing dots ───────────────────────────────────────────────────── */
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-ink-500 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

/* ── message bubble ────────────────────────────────────────────────── */
function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={cn('flex gap-3 group', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      {!isUser && (
        <div className="w-7 h-7 shrink-0 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center mt-0.5">
          <img src="/favicon.png" alt="AI" className="w-4 h-4 rounded-sm" />
        </div>
      )}

      <div className={cn('flex flex-col gap-1 max-w-[78%]', isUser && 'items-end')}>
        <div className={cn(
          'px-4 py-3 rounded-2xl text-sm leading-relaxed',
          isUser
            ? 'bg-accent text-white rounded-tr-sm'
            : 'bg-ink-900 border border-ink-800 text-ink-100 rounded-tl-sm',
        )}>
          {isUser ? (
            <p className="whitespace-pre-wrap">{msg.content}</p>
          ) : (
            <div className="prose prose-sm prose-invert max-w-none
              prose-p:my-1 prose-p:leading-relaxed
              prose-headings:text-white prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1
              prose-ul:my-1 prose-ul:pl-4 prose-li:my-0.5
              prose-ol:my-1 prose-ol:pl-4
              prose-strong:text-white prose-strong:font-semibold
              prose-code:text-accent prose-code:bg-ink-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
              prose-pre:bg-ink-800 prose-pre:border prose-pre:border-ink-700">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          )}
        </div>
        <span className="text-xs text-ink-600 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {formatTime(msg.ts)}
        </span>
      </div>
    </div>
  );
}

/* ── empty state ───────────────────────────────────────────────────── */
function EmptyState({ onSuggest }: { onSuggest: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-8">
      {/* Icon */}
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
          <img src="/favicon.png" alt="North OS AI" className="w-9 h-9 rounded-lg" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-ink-100 mb-1">Your personal AI</h2>
          <p className="text-sm text-ink-500 max-w-xs leading-relaxed">
            Ask anything about your habits, journal, finances, or subscriptions.
            It knows your data — just ask.
          </p>
        </div>
      </div>

      {/* Suggestion chips */}
      <div className="flex flex-wrap gap-2 justify-center max-w-xl">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={i}
            onClick={() => onSuggest(s.replace(/^[\p{Emoji}\s]+/u, '').trim())}
            className="px-3 py-2 rounded-xl text-xs text-ink-400 bg-ink-900 border border-ink-800
              hover:border-accent/40 hover:text-ink-200 hover:bg-ink-800 transition-all text-left"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── main chat page ────────────────────────────────────────────────── */
export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /* Auto-scroll to bottom on new messages */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  /* Auto-resize textarea */
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setError(null);
    setInput('');

    const userMsg: Message = { id: uid(), role: 'user', content: trimmed, ts: new Date() };
    const next = [...messages, userMsg];
    setMessages(next);
    setLoading(true);

    try {
      const history = next.map(m => ({ role: m.role, content: m.content }));
      const { response } = await api.ai.chat(history);
      const aiMsg: Message = { id: uid(), role: 'assistant', content: response, ts: new Date() };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong';
      setError(msg.includes('503') || msg.includes('LLM')
        ? 'AI is not connected. Go to Settings and configure your AI provider.'
        : 'Failed to get a response. Please try again.');
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [messages, loading]);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  function clearChat() {
    setMessages([]);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  return (
    <div className="flex flex-col h-full -mx-8 -my-8">

      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-ink-900 bg-ink-950">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-accent" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-ink-100">AI Chat</h1>
            <p className="text-xs text-ink-600">Knows your habits, journal, finance & subscriptions</p>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-ink-500
              hover:text-ink-300 hover:bg-ink-800 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* ── Messages area ── */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 ? (
            <EmptyState onSuggest={text => send(text)} />
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map(msg => (
                <Bubble key={msg.id} msg={msg} />
              ))}

              {/* Typing indicator */}
              {loading && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 shrink-0 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center mt-0.5">
                    <img src="/favicon.png" alt="AI" className="w-4 h-4 rounded-sm" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-ink-900 border border-ink-800">
                    <TypingDots />
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex justify-center">
                  <div className="px-4 py-3 rounded-xl bg-red-950/40 border border-red-900/40 text-xs text-red-400 max-w-md text-center leading-relaxed">
                    {error}
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>

      {/* ── Input bar ── */}
      <div className="shrink-0 border-t border-ink-900 bg-ink-950 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-3 bg-ink-900 border border-ink-800 rounded-2xl px-4 py-3
            focus-within:border-accent/40 transition-colors">
            <textarea
              ref={inputRef}
              rows={1}
              placeholder="Ask anything about your data…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={loading}
              className="flex-1 bg-transparent resize-none outline-none text-sm text-ink-100
                placeholder:text-ink-600 leading-relaxed disabled:opacity-50
                scrollbar-thin scrollbar-thumb-ink-700"
              style={{ maxHeight: '160px' }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              className="shrink-0 w-8 h-8 rounded-xl bg-accent flex items-center justify-center
                hover:bg-accent/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed mb-0.5"
            >
              {loading
                ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                : <Send className="w-3.5 h-3.5 text-white" />
              }
            </button>
          </div>
          <p className="text-xs text-ink-700 text-center mt-2">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>

    </div>
  );
}
