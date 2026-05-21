import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { X, Plus } from 'lucide-react';

type Props = {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
};

const TAG_REGEX = /[^a-z0-9-]+/g;

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(TAG_REGEX, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export function TagChips({ tags, onChange, placeholder, disabled }: Props) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: allTags } = useQuery({
    queryKey: ['tags'],
    queryFn: api.journal.listTags,
    staleTime: 1000 * 30,
  });

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q || !allTags) return [];
    return allTags
      .filter((t) => t.name.includes(q) && !tags.includes(t.name))
      .slice(0, 6);
  }, [input, allTags, tags]);

  function addTag(raw: string) {
    const name = normalize(raw);
    if (!name) return;
    if (tags.includes(name)) {
      setInput('');
      return;
    }
    onChange([...tags, name]);
    setInput('');
  }

  function removeTag(name: string) {
    onChange(tags.filter((t) => t !== name));
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div>
      <div
        className={cn(
          'flex flex-wrap items-center gap-1.5 rounded-xl px-2 py-1.5 min-h-[38px] transition-all',
          'focus-within:ring-1 focus-within:ring-accent/40',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
        style={{ background: 'rgba(0,0,0,0.30)', border: '1px solid rgba(255,255,255,0.09)' }}
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1"
            style={{
              height: 24, padding: '0 10px',
              borderRadius: 999,
              background: 'rgba(184,165,255,0.10)',
              border: '1px solid rgba(184,165,255,0.18)',
              color: 'var(--primary-300)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11.5px',
              fontWeight: 500,
            }}
          >
            {t}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(t);
                }}
                className="hover:text-white ml-0.5"
                aria-label={`Remove ${t}`}
                style={{ color: 'rgba(184,165,255,0.60)' }}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          disabled={disabled}
          className="flex-1 min-w-[8ch] bg-transparent text-sm outline-none placeholder:text-ink-500"
          style={{ color: 'white' }}
          placeholder={tags.length === 0 ? placeholder ?? 'Add tags…' : ''}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {suggestions.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => addTag(s.name)}
              className="inline-flex items-center gap-1 transition-colors"
              style={{
                height: 22, padding: '0 9px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border-default)',
                color: 'var(--fg-4)',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(184,165,255,0.30)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--primary-300)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)';
              }}
            >
              <Plus className="w-3 h-3" /> {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
