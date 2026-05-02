import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar';
import { Dashboard } from '@/routes/Dashboard';
import { Journal } from '@/routes/Journal';
import { Finance } from '@/routes/Finance';
import { Subscriptions } from '@/routes/Subscriptions';
import { Habits } from '@/routes/Habits';
import { HabitDetail } from '@/routes/HabitDetail';
import { Settings } from '@/routes/Settings';

export default function App() {
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
      <main className="flex-1 overflow-y-auto min-w-0">
        <div className="max-w-6xl mx-auto px-8 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/finance" element={<Finance />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/habits" element={<Habits />} />
            <Route path="/habits/:id" element={<HabitDetail />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
