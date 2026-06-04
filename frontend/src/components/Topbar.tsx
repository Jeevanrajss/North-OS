import { useLocation } from 'react-router-dom';
import { NotificationBell } from '@/components/NotificationPanel';

const ROUTE_LABELS: Record<string, string> = {
  '/app':               'Dashboard',
  '/app/journal':       'Journal',
  '/app/finance':       'Finance',
  '/app/subscriptions': 'Subscriptions',
  '/app/habits':        'Habits',
  '/app/chat':          'AI Chat',
  '/app/settings':      'Settings',
};

function getRouteLabel(pathname: string): string {
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname];
  const prefix = Object.keys(ROUTE_LABELS)
    .filter((k) => k !== '/app' && pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? ROUTE_LABELS[prefix] : 'North OS';
}

export function Topbar() {
  const { pathname } = useLocation();
  const label = getRouteLabel(pathname);

  return (
    <header
      className="drag-region shrink-0 sticky top-0 z-20 border-b"
      style={{
        background: 'rgba(14,16,24,0.72)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Inner wrapper must NOT have no-drag — the spacer in the middle must
          stay drag-region so users can grab the window there. Only the
          interactive elements (NotificationBell, etc.) get no-drag, which
          happens automatically via the global CSS rule on button/a. */}
      <div
        className="max-w-[1240px] mx-auto px-12 flex items-center gap-4"
        style={{ height: 56 }}
      >
        {/* Breadcrumb — drag-region inherited from header */}
        <div
          className="no-drag font-medium text-[13px]"
          style={{ color: 'var(--fg-4)', pointerEvents: 'none' }}
        >
          North OS{' '}
          <span style={{ opacity: 0.4, margin: '0 6px' }}>/</span>
          <b style={{ color: 'var(--fg-2)', fontWeight: 500 }}>{label}</b>
        </div>

        {/* Spacer — drag-region inherited, this is the primary drag target */}
        <div className="flex-1" />

        {/* Bell is a button so it gets no-drag automatically */}
        <NotificationBell />
      </div>
    </header>
  );
}
