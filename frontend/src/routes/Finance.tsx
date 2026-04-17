import { PageHeader } from '@/components/PageHeader';

export function Finance() {
  return (
    <>
      <PageHeader title="Finance" subtitle="Transactions, budgets, AI insights." />
      <div className="card">
        <div className="text-sm text-ink-400">
          Week 3 adds: manual entry, CSV import, categories, monthly dashboard.
        </div>
      </div>
    </>
  );
}
