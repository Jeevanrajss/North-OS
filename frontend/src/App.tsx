import { useState } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { FloatingChat } from '@/components/FloatingChat';
import { LockScreen, getLockHash } from '@/components/LockScreen';
import { Landing } from '@/routes/Landing';
import { Tutorials } from '@/routes/Tutorials';
import { Dashboard } from '@/routes/Dashboard';
import { Journal } from '@/routes/Journal';
import { Finance } from '@/routes/Finance';
import { Subscriptions } from '@/routes/Subscriptions';
import { Habits } from '@/routes/Habits';
import { HabitDetail } from '@/routes/HabitDetail';
import { Settings } from '@/routes/Settings';
import { Chat } from '@/routes/Chat';
import { Patterns } from '@/routes/Patterns';
import { Goals } from '@/routes/Goals';
import { Health } from '@/routes/Health';
import { BriefingProvider } from '@/contexts/BriefingContext';
import { AIContentProvider } from '@/contexts/AIContentContext';
import { ModulesProvider, useModules } from '@/contexts/ModulesContext';
import type { ModuleId } from '@/lib/modules';

/** Redirects to dashboard if the given module is disabled. */
function ModuleGuard({ moduleId, children }: { moduleId: ModuleId; children: React.ReactNode }) {
  const { isEnabled } = useModules();
  if (!isEnabled(moduleId)) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

function AppShell() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });
  const { pathname } = useLocation();
  const isJournal = pathname.endsWith('/journal');

  function toggleSidebar() {
    setCollapsed((prev) => {
      localStorage.setItem('sidebar_collapsed', String(!prev));
      return !prev;
    });
  }

  return (
    <div className="flex h-full">
      {/* Always-present drag handle strip at the very top edge of the window.
          Guarantees the macOS title bar is draggable even on routes (e.g.
          Journal) that don't render the Topbar, and even if other elements
          on a given page happen to cover the Topbar's drag region. Buttons/
          links keep their own no-drag (set globally), so this thin strip
          never blocks clicks — it only adds a drag handle. */}
      <div
        className="drag-region"
        style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 12, zIndex: 999999 }}
      />
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
      <main className="flex-1 overflow-hidden min-w-0 flex flex-col">
        {!isJournal && <Topbar />}
        <div className="flex-1 overflow-y-auto">
          {isJournal ? (
            /* Journal gets full-bleed layout — it renders its own topbar & padding */
            <Routes>
              <Route path="/journal" element={<ModuleGuard moduleId="journal"><Journal /></ModuleGuard>} />
            </Routes>
          ) : (
            <div className="max-w-[1240px] mx-auto px-12 pt-9 pb-24 h-full">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/finance" element={<ModuleGuard moduleId="finance"><Finance /></ModuleGuard>} />
                <Route path="/subscriptions" element={<ModuleGuard moduleId="subscriptions"><Subscriptions /></ModuleGuard>} />
                <Route path="/habits" element={<ModuleGuard moduleId="habits"><Habits /></ModuleGuard>} />
                <Route path="/habits/:id" element={<ModuleGuard moduleId="habits"><HabitDetail /></ModuleGuard>} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/chat" element={<ModuleGuard moduleId="chat"><Chat /></ModuleGuard>} />
                <Route path="/patterns" element={<ModuleGuard moduleId="patterns"><Patterns /></ModuleGuard>} />
                <Route path="/goals" element={<ModuleGuard moduleId="goals"><Goals /></ModuleGuard>} />
                <Route path="/health" element={<ModuleGuard moduleId="health"><Health /></ModuleGuard>} />
              </Routes>
            </div>
          )}
        </div>
      </main>
      <FloatingChat />
    </div>
  );
}

// Show the marketing landing page only when deployed to Netlify.
// When running locally (setup.sh / setup.bat), go straight to the app.
const SHOW_LANDING = import.meta.env.VITE_LANDING_PAGE === 'true';

export default function App() {
  const location = useLocation();
  // Session-scoped unlock state — re-locks on page refresh
  const [unlocked, setUnlocked] = useState(false);

  // If a lock is configured and the session isn't unlocked yet, gate everything
  if (getLockHash() && !unlocked) {
    return <LockScreen onUnlock={() => setUnlocked(true)} />;
  }

  // Root "/" — landing on Netlify, straight to app locally
  if (location.pathname === '/') {
    if (SHOW_LANDING) {
      return <Routes><Route path="/" element={<Landing />} /></Routes>;
    }
    return <Navigate to="/app" replace />;
  }

  // Tutorials page — always available on Netlify
  if (SHOW_LANDING && location.pathname === '/tutorials') {
    return <Routes><Route path="/tutorials" element={<Tutorials />} /></Routes>;
  }

  // App shell wraps /app/* routes
  if (location.pathname.startsWith('/app')) {
    return (
      <AIContentProvider>
        <BriefingProvider>
          <ModulesProvider>
            <Routes>
              <Route path="/app/*" element={<AppShell />} />
            </Routes>
          </ModulesProvider>
        </BriefingProvider>
      </AIContentProvider>
    );
  }

  // Legacy direct routes — redirect into /app/*
  return (
    <Routes>
      <Route path="/journal" element={<Navigate to="/app/journal" replace />} />
      <Route path="/finance" element={<Navigate to="/app/finance" replace />} />
      <Route path="/subscriptions" element={<Navigate to="/app/subscriptions" replace />} />
      <Route path="/habits" element={<Navigate to="/app/habits" replace />} />
      <Route path="/habits/:id" element={<Navigate to={`/app${location.pathname}`} replace />} />
      <Route path="/settings" element={<Navigate to="/app/settings" replace />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
