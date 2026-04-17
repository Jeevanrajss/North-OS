import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { AiPingCard } from '@/components/AiPingCard';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 15_000,
  });

  const providerLabel =
    data?.llm.provider === 'lmstudio' ? 'LM Studio'
      : data?.llm.provider === 'ollama' ? 'Ollama'
      : data?.llm.provider ?? 'LLM';

  return (
    <>
      <PageHeader
        title="Good morning, Jeevan"
        subtitle="Your personal OS — local, private, AI-powered."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <div className="card">
          <div className="card-title">Backend</div>
          {isLoading ? (
            <div className="text-ink-400 text-sm">Checking…</div>
          ) : error ? (
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-4 h-4" /> <span className="text-sm">Backend offline</span>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 text-emerald-400 mb-2">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm font-medium">Online</span>
              </div>
              <dl className="text-sm text-ink-400 space-y-1">
                <div className="flex justify-between"><dt>Version</dt><dd className="text-ink-100">{data?.app.version}</dd></div>
                <div className="flex justify-between"><dt>Timezone</dt><dd className="text-ink-100">{data?.app.timezone}</dd></div>
                <div className="flex justify-between"><dt>Currency</dt><dd className="text-ink-100">{data?.app.currency}</dd></div>
              </dl>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Database</div>
          {data?.db.ok ? (
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm font-medium">Healthy</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{data?.db.error ?? 'Not ready'}</span>
            </div>
          )}
          <div className="text-xs text-ink-600 mt-3 font-mono truncate">{data?.db.path}</div>
        </div>

        <div className="card">
          <div className="card-title">{providerLabel}</div>
          {data?.llm.ok ? (
            <div>
              <div className="flex items-center gap-2 text-emerald-400 mb-2">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm font-medium">Connected</span>
              </div>
              <dl className="text-sm text-ink-400 space-y-1">
                <div className="flex justify-between">
                  <dt>Chat</dt>
                  <dd className={data.llm.chat_loaded ? 'text-ink-100' : 'text-amber-400'}>
                    {data.llm.chat_model}{data.llm.chat_loaded ? '' : ' (not loaded)'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Embed</dt>
                  <dd className={data.llm.embed_loaded ? 'text-ink-100' : 'text-amber-400'}>
                    {data.llm.embed_model}{data.llm.embed_loaded ? '' : ' (JIT)'}
                  </dd>
                </div>
                <div className="flex justify-between"><dt>Host</dt><dd className="text-ink-100 font-mono text-xs">{data.llm.host}</dd></div>
              </dl>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-amber-400">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{data?.llm.error ?? 'Not reachable'}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <AiPingCard />
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-5">
        <ModulePreview title="Journal" subtitle="Daily entries + mood" />
        <ModulePreview title="Finance" subtitle="Transactions + budgets" />
        <ModulePreview title="Subscriptions" subtitle="Renewals + cost/use" />
        <ModulePreview title="Habits" subtitle="Streaks + patterns" />
      </div>
    </>
  );
}

function ModulePreview({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="card">
      <div className="text-sm font-medium text-ink-100">{title}</div>
      <div className="text-xs text-ink-400 mt-1">{subtitle}</div>
      <div className="text-xs text-ink-600 mt-4">Coming Week 2+</div>
    </div>
  );
}
