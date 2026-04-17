import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BookText, Wallet, Repeat, Sparkles, Settings } from 'lucide-react';
import { cn } from '@/lib/cn';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/journal', label: 'Journal', icon: BookText },
  { to: '/finance', label: 'Finance', icon: Wallet },
  { to: '/subscriptions', label: 'Subscriptions', icon: Repeat },
  { to: '/habits', label: 'Habits', icon: Sparkles },
];

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 border-r border-ink-900 bg-ink-950 flex flex-col">
      <div className="px-5 py-5 border-b border-ink-900">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-accent/20 border border-accent/40 flex items-center justify-center">
            <span className="text-accent text-xs font-semibold">P</span>
          </div>
          <div className="text-sm font-semibold tracking-tight">Personal OS</div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => cn('nav-link', isActive && 'nav-link-active')}
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-ink-900">
        <NavLink to="/settings" className={({ isActive }) => cn('nav-link', isActive && 'nav-link-active')}>
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </NavLink>
      </div>
    </aside>
  );
}
