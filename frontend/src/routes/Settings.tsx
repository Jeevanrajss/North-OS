import { PageHeader } from '@/components/PageHeader';

export function Settings() {
  return (
    <>
      <PageHeader title="Settings" subtitle="App preferences, backup, AI config." />
      <div className="card">
        <div className="text-sm text-ink-400">
          Week 6 adds: model picker, offline-mode toggle, backup/restore, theme.
        </div>
      </div>
    </>
  );
}
