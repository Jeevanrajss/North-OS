import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { SubscriptionList } from '@/components/subscriptions/SubscriptionList';
import { SubscriptionStatsCard } from '@/components/subscriptions/SubscriptionStatsCard';
import { SpendingByCategoryCard } from '@/components/subscriptions/SpendingByCategoryCard';
import { UpcomingRenewals } from '@/components/subscriptions/UpcomingRenewals';

export function Subscriptions() {
  const [displayCurrency, setDisplayCurrency] = useState(
    () => localStorage.getItem('sub_display_currency') ?? 'INR',
  );

  function handleCurrencyChange(c: string) {
    setDisplayCurrency(c);
    localStorage.setItem('sub_display_currency', c);
  }

  return (
    <>
      <PageHeader
        title="Subscriptions"
        subtitle="Track recurring spend. Never miss a renewal."
      />

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
        <div className="lg:col-span-7">
          <SubscriptionList />
        </div>
        <aside className="lg:col-span-3 space-y-5">
          <SubscriptionStatsCard
            displayCurrency={displayCurrency}
            onCurrencyChange={handleCurrencyChange}
          />
          <SpendingByCategoryCard displayCurrency={displayCurrency} />
          <UpcomingRenewals />
        </aside>
      </div>
    </>
  );
}
