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
  const userName = localStorage.getItem('user_name')?.trim() || 'Jeevan';

  const firstName = userName.split(' ')[0];
  const initials = userName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <header
      className="shrink-0 sticky top-0 z-20 border-b"
      style={{
        background: 'rgba(14,16,24,0.72)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div
        className="max-w-[1240px] mx-auto px-12 flex items-center gap-4"
        style={{ height: 56 }}
      >
        {/* Breadcrumb */}
        <div
          className="font-medium text-[13px]"
          style={{ color: 'var(--fg-4)' }}
        >
          North OS{' '}
          <span style={{ opacity: 0.4, margin: '0 6px' }}>/</span>
          <b style={{ color: 'var(--fg-2)', fontWeight: 500 }}>{label}</b>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bell */}
        <NotificationBell />

        {/* Avatar pill */}
        <div
          className="inline-flex items-center gap-2"
          style={{
            height: 36,
            padding: '3px 12px 3px 3px',
            borderRadius: 999,
            background: 'var(--glass-bg)',
            border: '1px solid var(--border-default)',
          }}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0"
            style={{
              background: 'linear-gradient(135deg, #FF7AD9, #8B7CFF)',
              font: '500 11px/1 var(--font-display)',
            }}
          >
            {initials}
          </div>
          <span
            className="text-[12.5px] font-medium hidden sm:block"
            style={{ color: 'var(--fg-2)' }}
          >
            {firstName}
          </span>
        </div>
      </div>
    </header>
  );
}
