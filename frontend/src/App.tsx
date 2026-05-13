import { useState } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar';
import { FloatingChat } from '@/components/FloatingChat';
import { Landing } from '@/routes/Landing';
import { Dashboard } from '@/routes/Dashboard';
import { Journal } from '@/routes/Journal';
import { Finance } from '@/routes/Finance';
import { Subscriptions } from '@/routes/Subscriptions';
import { Habits } from '@/routes/Habits';
import { HabitDetail } from '@/routes/HabitDetail';
import { Settings } from '@/routes/Settings';
import { Chat } from '@/routes/Chat';

function AppShell() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  function toggleSidebar() {
    setCollapsed((prev) => {
      localStorage.setItem('sidebar_collapsed', String(!prev));
      return !prev;
    });
  }

  return (
    <div className="flex h-full">
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
      <main className="flex-1 overflow-hidden min-w-0 flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-8 py-8 h-full">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/journal" element={<Journal />} />
              <Route path="/finance" element={<Finance />} />
              <Route path="/subscriptions" element={<Subscriptions />} />
              <Route path="/habits" element={<Habits />} />
              <Route path="/habits/:id" element={<HabitDetail />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/chat" element={<Chat />} />
            </Routes>
          </div>
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

  // Root "/" — landing on Netlify, straight to app locally
  if (location.pathname === '/') {
    if (SHOW_LANDING) {
      return <Routes><Route path="/" element={<Landing />} /></Routes>;
    }
    return <Navigate to="/app" replace />;
  }

  // App shell wraps /app/* routes
  if (location.pathname.startsWith('/app')) {
    return (
      <Routes>
        <Route path="/app/*" element={<AppShell />} />
      </Routes>
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
