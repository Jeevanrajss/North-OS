import { createContext, useCallback, useContext, useState } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  success: (msg: string, duration?: number) => void;
  error:   (msg: string, duration?: number) => void;
  info:    (msg: string, duration?: number) => void;
  warning: (msg: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let _idCounter = 0;

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
  warning: '⚠',
};

const COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: 'rgba(61,255,152,0.12)', border: 'rgba(61,255,152,0.30)', icon: 'var(--accent-green)' },
  error:   { bg: 'rgba(255,91,110,0.12)', border: 'rgba(255,91,110,0.30)', icon: 'var(--accent-red)' },
  info:    { bg: 'rgba(139,124,255,0.12)', border: 'rgba(139,124,255,0.30)', icon: 'var(--primary-300)' },
  warning: { bg: 'rgba(255,184,107,0.12)', border: 'rgba(255,184,107,0.30)', icon: 'var(--accent-yellow)' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts(ts => ts.filter(t => t.id !== id));
  }, []);

  const push = useCallback((type: ToastType, message: string, duration = 3500) => {
    const id = ++_idCounter;
    setToasts(ts => [...ts.slice(-4), { id, type, message, duration }]); // max 5 visible
    if (duration > 0) setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  const ctx: ToastContextValue = {
    success: (m, d) => push('success', m, d),
    error:   (m, d) => push('error',   m, d ?? 5000), // errors stay longer
    info:    (m, d) => push('info',    m, d),
    warning: (m, d) => push('warning', m, d),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}

      {/* Toast stack — bottom-center */}
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column-reverse',
          gap: 8,
          alignItems: 'center',
          pointerEvents: 'none',
          minWidth: 280,
          maxWidth: 480,
        }}
      >
        {toasts.map(toast => {
          const c = COLORS[toast.type];
          return (
            <div
              key={toast.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 16px',
                borderRadius: 12,
                background: `color-mix(in srgb, ${c.bg} 100%, var(--surface))`,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: `1px solid ${c.border}`,
                boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--fg-1)',
                lineHeight: 1.4,
                pointerEvents: 'auto',
                cursor: 'pointer',
                animation: 'toast-in 200ms cubic-bezier(0.32,0.72,0,1)',
                maxWidth: 460,
                wordBreak: 'break-word',
              }}
              onClick={() => dismiss(toast.id)}
            >
              <span style={{ fontSize: 14, color: c.icon, flexShrink: 0, fontWeight: 700 }}>
                {ICONS[toast.type]}
              </span>
              <span>{toast.message}</span>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(12px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
