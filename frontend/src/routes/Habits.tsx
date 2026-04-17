import { PageHeader } from '@/components/PageHeader';

export function Habits() {
  return (
    <>
      <PageHeader title="Habits" subtitle="Streaks, patterns, AI-coached consistency." />
      <div className="card">
        <div className="text-sm text-ink-400">
          Week 2 adds: habit CRUD, daily check-off, streak calc, calendar heatmap.
        </div>
      </div>
    </>
  );
}
