import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, MessageSquare, Send, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

type Message = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  'Where am I lagging this week?',
  'Which habit has the worst completion rate?',
  'How much am I spending on entertainment?',
  'What was the last time I felt sick?',
];

export function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const mut = useMutation({
    mutationFn: (msgs: Message[]) => api.ai.chat(msgs),
    onSuccess: (res) => {
      setMessages((prev) => [...prev, { role: 'assistant', content: res.response }]);
    },
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, mut.isPending]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        // Don't close if click is on the toggle button (handled separately)
        const btn = document.getElementById('floating-chat-btn');
        if (btn && btn.contains(e.target as Node)) return;
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || mut.isPending) return;
    const next: Message[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    mut.mutate(next);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function onInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
  }

  const offline = mut.isError && (mut.error as Error).message.includes('503');

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">

      {/* Chat panel */}
      <div
        ref={panelRef}
        className={cn(
          'w-80 bg-ink-950 border border-ink-800 rounded-xl shadow-2xl flex flex-col overflow-hidden',
          'transition-all duration-200 origin-bottom-right',
          open
            ? 'opacity-100 scale-100 pointer-events-auto'
            : 'opacity-0 scale-95 pointer-events-none',
        )}
        style={{ height: '440px' }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-ink-800 shrink-0">
          <MessageSquare className="w-3.5 h-3.5 text-accent" />
          <span className="text-sm font-medium text-ink-200 flex-1">Ask your data</span>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => { setMessages([]); mut.reset(); }}
              className="text-[10px] text-ink-600 hover:text-ink-400 transition-colors mr-1"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-ink-600 hover:text-ink-300 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2.5 min-h-0">
          {messages.length === 0 && !mut.isPending && (
            <div className="space-y-2 pt-1">
              <p className="text-[11px] text-ink-600">
                Ask anything about your habits, journal, or spending.
              </p>
              <div className="flex flex-col gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="text-left text-[11px] text-ink-400 hover:text-accent bg-ink-900 border border-ink-800 rounded-md px-2.5 py-1.5 hover:border-accent/40 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs leading-relaxed whitespace-pre-wrap',
                m.role === 'user'
                  ? 'bg-accent/15 border border-accent/25 text-ink-100'
                  : 'bg-ink-900 border border-ink-800 text-ink-300',
              )}>
                {m.content}
              </div>
            </div>
          ))}

          {mut.isPending && (
            <div className="flex justify-start">
              <div className="bg-ink-900 border border-ink-800 rounded-lg px-2.5 py-2 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 text-ink-500 animate-spin" />
                <span className="text-[11px] text-ink-600">Thinking…</span>
              </div>
            </div>
          )}

          {offline && (
            <p className="text-[11px] text-amber-400">LM Studio is offline.</p>
          )}
          {mut.isError && !offline && (
            <p className="text-[11px] text-red-400">{(mut.error as Error).message}</p>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex items-end gap-2 border-t border-ink-800 px-3 py-2 shrink-0">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={onInput}
            onKeyDown={onKeyDown}
            placeholder="Ask about your data…"
            rows={1}
            className="flex-1 resize-none overflow-hidden bg-ink-900 border border-ink-800 rounded-md px-2.5 py-1.5 text-xs text-ink-100 placeholder:text-ink-600 outline-none focus:border-accent/60 leading-relaxed"
            style={{ minHeight: '34px' }}
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={!input.trim() || mut.isPending}
            className="p-1.5 rounded-md bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 disabled:opacity-40 transition-colors shrink-0"
          >
            {mut.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Send className="w-3.5 h-3.5" />
            }
          </button>
        </div>
      </div>

      {/* Toggle button */}
      <button
        id="floating-chat-btn"
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200',
          'border focus:outline-none',
          open
            ? 'bg-ink-800 border-ink-700 text-ink-300 hover:bg-ink-700'
            : 'bg-accent border-accent/60 text-white hover:bg-accent/90 hover:shadow-accent/30 hover:shadow-xl',
        )}
        aria-label="Open chat"
      >
        {open
          ? <X className="w-5 h-5" />
          : <MessageSquare className="w-5 h-5" />
        }
      </button>
    </div>
  );
}
