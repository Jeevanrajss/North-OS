import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, CreditCard, RefreshCw,
  CheckSquare, MessageSquare, Settings, ChevronLeft, ChevronRight, TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useModules } from '@/contexts/ModulesContext';
import type { ModuleId } from '@/lib/modules';

const nav: Array<{
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
  moduleId?: ModuleId;
}> = [
  { to: '/app',               label: 'Dashboard',     icon: LayoutDashboard, end: true },
  { to: '/app/journal',       label: 'Journal',       icon: BookOpen,        moduleId: 'journal' },
  { to: '/app/finance',       label: 'Finance',       icon: CreditCard,      moduleId: 'finance' },
  { to: '/app/subscriptions', label: 'Subscriptions', icon: RefreshCw,       moduleId: 'subscriptions' },
  { to: '/app/habits',        label: 'Habits',        icon: CheckSquare,     moduleId: 'habits' },
  { to: '/app/chat',          label: 'AI Chat',       icon: MessageSquare,   moduleId: 'chat' },
  { to: '/app/patterns',     label: 'Patterns',      icon: TrendingUp,      moduleId: 'patterns' },
];

type Props = { collapsed: boolean; onToggle: () => void };

export function Sidebar({ collapsed, onToggle }: Props) {
  const { isEnabled } = useModules();
  const visibleNav = nav.filter((item) => !item.moduleId || isEnabled(item.moduleId));
  return (
    <aside
      className={cn(
        'shrink-0 flex flex-col transition-[width] duration-200 overflow-hidden',
        'sticky top-0 h-screen',
        collapsed ? 'w-16' : 'w-[248px]',
      )}
      style={{
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
      {/* Workspace header */}
      <div
        className={cn(
          'flex items-center gap-2.5 mb-6',
          collapsed ? 'px-3 py-5 justify-center' : 'px-3.5 py-5',
        )}
      >
        {/* Logo mark */}
        <div
          className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
          style={{
            background: 'var(--grad-primary)',
            boxShadow: 'var(--elev-glow)',
          }}
        >
          {/* North star / polygon icon */}
          <svg
            width="13" height="13"
            viewBox="0 0 24 24" fill="none"
            stroke="white" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <polygon points="12 2 19 21 12 17 5 21 12 2" />
          </svg>
        </div>

        {!collapsed && (
          <>
            <span
              className="flex-1 min-w-0 text-ink-50"
              style={{ font: '500 14px/1.2 var(--font-display)', letterSpacing: '-0.01em' }}
            >
              North OS
            </span>
            <button
              type="button"
              onClick={onToggle}
              title="Collapse sidebar"
              className="p-1 rounded-md transition-colors"
              style={{ color: 'var(--fg-4)' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-2)';
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)';
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {collapsed && (
          <button
            type="button"
            onClick={onToggle}
            title="Expand sidebar"
            className="p-1 rounded-md transition-colors"
            style={{ color: 'var(--fg-4)' }}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Nav section label */}
      {!collapsed && (
        <div
          className="px-3 mb-1.5"
          style={{
            font: '500 10px/1 var(--font-sans)',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--fg-4)',
          }}
        >
          Menu
        </div>
      )}

      {/* Nav items */}
      <nav className={cn('flex flex-col gap-0.5 flex-1 overflow-y-auto', collapsed ? 'px-2' : 'px-2')}>
        {visibleNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) => cn(
              'flex items-center gap-3 rounded-[10px] text-sm font-medium transition-all relative',
              collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-[9px]',
              isActive
                ? 'nav-link-active text-white'
                : 'text-[#A0A9BC] hover:text-white',
            )}
            style={({ isActive }) => isActive ? { background: 'var(--surface)' } : undefined}
          >
            <item.icon className="shrink-0 w-4 h-4" />
            {!collapsed && item.label}
          </NavLink>
        ))}
      </nav>

      {/* Divider */}
      <div className="mx-3.5 border-t" style={{ borderColor: 'var(--border-subtle)' }} />

      {/* Footer — Settings */}
      <div className={cn('py-3', collapsed ? 'px-2' : 'px-2')}>
        <NavLink
          to="/app/settings"
          title={collapsed ? 'Settings' : undefined}
          className={({ isActive }) => cn(
            'flex items-center gap-3 rounded-[10px] text-sm font-medium transition-all relative',
            collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-[9px]',
            isActive
              ? 'nav-link-active text-white'
              : 'text-[#A0A9BC] hover:text-white',
          )}
          style={({ isActive }) => isActive ? { background: 'var(--surface)' } : undefined}
        >
          <Settings className="shrink-0 w-4 h-4" />
          {!collapsed && 'Settings'}
        </NavLink>
      </div>
    </aside>
  );
}
