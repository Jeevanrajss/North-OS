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
          'flex flex-wrap items-center gap-1.5 rounded-md border border-ink-800 bg-ink-950 px-2 py-1.5 min-h-[38px]',
          'focus-within:border-accent/60',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-accent/15 border border-accent/30 px-2 py-0.5 text-xs text-accent"
          >
            {t}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(t);
                }}
                className="hover:text-ink-50"
                aria-label={`Remove ${t}`}
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
          className="flex-1 min-w-[8ch] bg-transparent text-sm outline-none placeholder:text-ink-600"
          placeholder={tags.length === 0 ? placeholder ?? 'Add tags…' : ''}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {suggestions.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => addTag(s.name)}
              className="inline-flex items-center gap-1 rounded-full border border-ink-800 bg-ink-900 px-2 py-0.5 text-xs text-ink-400 hover:border-accent/40 hover:text-accent"
            >
              <Plus className="w-3 h-3" /> {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
