import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: number;
};

/**
 * Notion-style right-side panel that slides in over the main content.
 * Renders via a portal so it escapes any stacking-context constraints.
 * Sits below the 56px topbar so navigation stays accessible.
 */
export function RightDrawer({ open, onClose, title, children, width = 480 }: Props) {
  // ESC key to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          top: 56, // below the topbar
          zIndex: 49,
          background: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 220ms ease',
        }}
      />

      {/* Panel */}
      <aside
        style={{
          position: 'fixed',
          top: 56, // below the topbar
          right: 0,
          bottom: 0,
          width,
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border-default)',
          boxShadow: '-12px 0 60px rgba(0, 0, 0, 0.55)',
          transform: open ? 'translateX(0)' : `translateX(${width}px)`,
          transition: 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            height: 52,
            flexShrink: 0,
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <span
            style={{
              font: '500 15px/1 var(--font-display)',
              letterSpacing: '-0.01em',
              color: 'var(--fg-1)',
            }}
          >
            {title}
          </span>

          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 28,
              height: 28,
              borderRadius: 8,
              color: 'var(--fg-4)',
              background: 'transparent',
              border: '1px solid transparent',
              cursor: 'pointer',
              transition: 'var(--transition)',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.color = 'var(--fg-1)';
              el.style.background = 'var(--surface-hover)';
              el.style.borderColor = 'var(--border-default)';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.color = 'var(--fg-4)';
              el.style.background = 'transparent';
              el.style.borderColor = 'transparent';
            }}
          >
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Scrollable body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 20px',
          }}
        >
          {children}
        </div>
      </aside>
    </>,
    document.body,
  );
}
