import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

// Curated set of emojis that commonly map to habits. Grouped for scannability
// but rendered as one flat grid — keeps it compact. ~70 emojis total.
const HABIT_EMOJIS: string[] = [
  // Health / movement
  '💪', '🏃', '🚶', '🧘', '🏋️', '🚴', '🤸', '⛹️', '🏊', '⛷️',
  // Food / drink
  '💧', '🥗', '🍎', '🥦', '☕', '🫖', '🍵', '🥛', '🍲', '🥑',
  // Sleep / rest
  '😴', '🛌', '🌙', '☀️', '🌅', '🧖',
  // Mind / focus
  '🧠', '📚', '📖', '✍️', '📝', '💭', '🎯', '🧩', '🖋️', '📓',
  // Work / productivity
  '💻', '🖥️', '⌨️', '📊', '📈', '🗂️', '✅', '⏰', '🔔', '📅',
  // Creativity / hobbies
  '🎨', '🎵', '🎸', '🎹', '🎧', '🎬', '📷', '🎮', '♟️', '🧶',
  // Connection / care
  '❤️', '🙏', '🫶', '👨‍👩‍👧', '💌', '📞', '🫂', '🌱', '🌳', '🐶',
  // Home / life
  '🧹', '🧼', '🧺', '🛁', '🪥', '💊', '💰', '📿', '🕯️', '🌿',
];

type Props = {
  value: string;
  onChange: (emoji: string) => void;
  size?: 'sm' | 'md';
  align?: 'left' | 'right';
  ariaLabel?: string;
};

/**
 * Compact emoji picker for habits. Click the current emoji → popover opens
 * with a curated palette + a free-text "custom" input as a fallback.
 */
export function EmojiPickerPopover({
  value,
  onChange,
  size = 'md',
  align = 'left',
  ariaLabel = 'Pick an emoji',
}: Props) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(emoji: string) {
    onChange(emoji);
    setOpen(false);
  }

  function submitCustom(e: React.FormEvent) {
    e.preventDefault();
    const t = custom.trim();
    if (!t) return;
    // Cap to a reasonable length — most emoji are 1-2 code points, flags/ZWJ
    // sequences can be longer but backend enforces 8 chars.
    onChange(t.slice(0, 8));
    setCustom('');
    setOpen(false);
  }

  const btnSize =
    size === 'sm'
      ? 'w-8 h-8 text-base'
      : 'w-11 h-11 text-xl';

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-expanded={open}
        className={cn(
          'rounded-md bg-ink-900 border border-ink-800 hover:border-accent/40 transition-colors flex items-center justify-center leading-none',
          btnSize,
        )}
      >
        {value || '✅'}
      </button>
      {open && (
        <div
          role="dialog"
          className={cn(
            'absolute z-20 mt-1 w-64 rounded-lg border border-ink-800 bg-ink-950 shadow-xl p-2',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          <div className="grid grid-cols-8 gap-0.5 max-h-52 overflow-y-auto pr-1">
            {HABIT_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => pick(e)}
                className={cn(
                  'w-7 h-7 rounded-md flex items-center justify-center text-base leading-none hover:bg-ink-900',
                  e === value && 'bg-accent/15 ring-1 ring-accent/40',
                )}
                aria-label={`Select ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
          {/* Not a <form> — nesting forms inside another form is invalid HTML
              and causes the outer form to submit when "Use" is clicked. */}
          <div className="mt-2 flex items-center gap-1">
            <input
              value={custom}
              onChange={(ev) => setCustom(ev.target.value)}
              onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); submitCustom(ev as unknown as React.FormEvent); } }}
              placeholder="Custom emoji…"
              maxLength={8}
              className="flex-1 bg-ink-900 border border-ink-800 rounded-md px-2 py-1 text-xs outline-none focus:border-accent/60"
            />
            <button
              type="button"
              onClick={() => { const t = custom.trim(); if (!t) return; onChange(t.slice(0, 8)); setCustom(''); setOpen(false); }}
              disabled={!custom.trim()}
              className="rounded-md bg-accent/20 border border-accent/40 px-2 py-1 text-xs text-accent disabled:opacity-40"
            >
              Use
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
