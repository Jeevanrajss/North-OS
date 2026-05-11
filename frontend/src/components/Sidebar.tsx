import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, BookText, Wallet, Repeat, CheckSquare,
  Settings, ChevronLeft, ChevronRight, MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/cn';

const nav = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/journal', label: 'Journal', icon: BookText },
  { to: '/app/finance', label: 'Finance', icon: Wallet },
  { to: '/app/subscriptions', label: 'Subscriptions', icon: Repeat },
  { to: '/app/habits', label: 'Habits', icon: CheckSquare },
  { to: '/app/chat', label: 'AI Chat', icon: MessageSquare },
];

type Props = { collapsed: boolean; onToggle: () => void };

export function Sidebar({ collapsed, onToggle }: Props) {
  return (
    <aside className={cn(
      'shrink-0 border-r border-ink-900 bg-ink-950 flex flex-col transition-[width] duration-200 overflow-hidden',
      collapsed ? 'w-14' : 'w-60',
    )}>
      {/* Header */}
      <div className={cn(
        'border-b border-ink-900 flex items-center gap-2 py-4',
        collapsed ? 'flex-col px-0 py-4 justify-center' : 'px-4 justify-between',
      )}>
        {/* Logo mark */}
        <div className="flex items-center gap-2 min-w-0">
          <img src="/favicon.png" alt="North OS" className="w-6 h-6 shrink-0 rounded-md" />
          {!collapsed && (
            <span className="text-sm font-semibold tracking-tight truncate">North OS</span>
          )}
        </div>

        {/* Toggle button */}
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-ink-600 hover:text-ink-300 hover:bg-ink-800 transition-colors"
        >
          {collapsed
            ? <ChevronRight className="w-3.5 h-3.5" />
            : <ChevronLeft className="w-3.5 h-3.5" />
          }
        </button>
      </div>

      {/* Nav */}
      <nav className={cn('flex-1 space-y-0.5', collapsed ? 'p-2' : 'p-3')}>
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) => cn(
              'nav-link',
              isActive && 'nav-link-active',
              collapsed && 'justify-center px-0 gap-0',
            )}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className={cn('border-t border-ink-900', collapsed ? 'p-2' : 'p-3')}>
        <NavLink
          to="/settings"
          title={collapsed ? 'Settings' : undefined}
          className={({ isActive }) => cn(
            'nav-link',
            isActive && 'nav-link-active',
            collapsed && 'justify-center px-0 gap-0',
          )}
        >
          <Settings className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </NavLink>
      </div>
    </aside>
  );
}
