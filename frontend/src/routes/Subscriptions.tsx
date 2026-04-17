import { PageHeader } from '@/components/PageHeader';

export function Subscriptions() {
  return (
    <>
      <PageHeader title="Subscriptions" subtitle="Renewals, cost-per-use, cancel candidates." />
      <div className="card">
        <div className="text-sm text-ink-400">
          Week 4 adds: auto-detect from transactions, renewal calendar, usage tracking.
        </div>
      </div>
    </>
  );
}
