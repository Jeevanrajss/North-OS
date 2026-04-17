import { PageHeader } from '@/components/PageHeader';

export function Journal() {
  return (
    <>
      <PageHeader
        title="Journal"
        subtitle="One page per day. Block editor coming in Week 2."
      />
      <div className="card">
        <div className="text-sm text-ink-400">
          Week 2 will add: BlockNote editor, mood slider, tags, semantic search.
        </div>
      </div>
    </>
  );
}
