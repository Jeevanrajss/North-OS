import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, MessageSquare, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

type Message = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  'Where am I lagging this week?',
  'What was the last time I felt sick?',
  'Which habit has the worst completion rate?',
  'How much am I spending on entertainment?',
];

export function DashAIChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mut = useMutation({
    mutationFn: (msgs: Message[]) => api.ai.chat(msgs),
    onSuccess: (res) => {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: res.response },
      ]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, mut.isPending]);

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
    // Auto-grow textarea
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  }

  const offline = mut.isError && (mut.error as Error).message.includes('503');

  return (
    <div className="card flex flex-col" style={{ minHeight: '400px' }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <MessageSquare className="w-4 h-4 text-accent" />
        <div className="card-title !mb-0">Ask Your Data</div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => { setMessages([]); mut.reset(); }}
            className="ml-auto text-[11px] text-ink-400 hover:text-ink-400 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-3 min-h-0 pr-0.5" style={{ maxHeight: '320px' }}>
        {messages.length === 0 && !mut.isPending && (
          <div className="space-y-2">
            <p className="text-xs text-ink-500">
              Ask anything about your habits, journal, or spending.
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="text-left text-xs text-ink-400 hover:text-accent rounded-md px-2.5 py-1.5 hover:border-accent/40 transition-colors"
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
              'max-w-[88%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
              m.role === 'user'
                ? 'bg-accent/15 border border-accent/25 text-ink-100'
                : 'text-ink-300',
            )}>
              {m.content}
            </div>
          </div>
        ))}

        {mut.isPending && (
          <div className="flex justify-start">
            <div className="rounded-lg px-3 py-2.5 flex items-center gap-2">
              <Loader2 className="w-3 h-3 text-ink-500 animate-spin" />
              <span className="text-xs text-ink-400">Thinking…</span>
            </div>
          </div>
        )}

        {offline && (
          <p className="text-xs text-amber-400 mt-1">LM Studio is offline.</p>
        )}
        {mut.isError && !offline && (
          <p className="text-xs text-red-400 mt-1">{(mut.error as Error).message}</p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="flex items-end gap-2 border-t border-ink-800 pt-3 shrink-0">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={onInput}
          onKeyDown={onKeyDown}
          placeholder="Ask about your habits, journal, spending…"
          rows={1}
          className="flex-1 resize-none overflow-hidden rounded-md px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 outline-none focus:border-accent/60 leading-relaxed"
          style={{ minHeight: '38px' }}
        />
        <button
          type="button"
          onClick={() => send()}
          disabled={!input.trim() || mut.isPending}
          className="p-2 rounded-md bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {mut.isPending
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Send className="w-4 h-4" />
          }
        </button>
      </div>
    </div>
  );
}
