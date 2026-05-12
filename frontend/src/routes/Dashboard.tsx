import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Flame, BookText, Wallet, CalendarClock } from 'lucide-react';
import { api, type HabitStatsResponse, type StatsResponse, type MonthlySummary } from '@/lib/api';
import { DashHabitsCard } from '@/components/dashboard/DashHabitsCard';
import { DashJournalCard } from '@/components/dashboard/DashJournalCard';
import { DashSubsCard } from '@/components/dashboard/DashSubsCard';
import { DashFinanceCard } from '@/components/dashboard/DashFinanceCard';
import { DashAIBriefing } from '@/components/dashboard/DashAIBriefing';
import { DashAIChat } from '@/components/dashboard/DashAIChat';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function fmtCurrency(amount: number, currency = 'INR'): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return String(Math.round(amount));
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export function Dashboard() {
  const now = useMemo(() => new Date(), []);
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  // Resolve user name from localStorage (user can set via Settings when built)
  const userName = localStorage.getItem('user_name')?.trim() || '';

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    staleTime: 1000 * 60,
  });

  const { data: habitStats } = useQuery<HabitStatsResponse>({
    queryKey: ['habits-stats', 30],
    queryFn: () => api.habits.stats(30),
    staleTime: 1000 * 60,
  });

  const { data: journalStats } = useQuery<StatsResponse>({
    queryKey: ['journal-stats', 30],
    queryFn: () => api.journal.stats(30),
    staleTime: 1000 * 60,
  });

  // Finance: this month's summary for the expense chip
  const { data: finSummary } = useQuery<MonthlySummary>({
    queryKey: ['finance-summary', y, m],
    queryFn: () => api.finance.summary(y, m),
    staleTime: 1000 * 60 * 5,
  });

  // Subscription stats (used for "Due this week" chip — reuses the same
  // query that DashSubsCard already fires, so no extra fetch)
  const { data: subStats } = useQuery({
    queryKey: ['subscription-stats'],
    queryFn: () => api.subscriptions.stats(),
    staleTime: 1000 * 30,
  });

  const dueThisWeek = (subStats?.upcoming_30d ?? []).filter((u) => {
    return u.days_until >= 0 && u.days_until <= 7 && u.subscription.amount > 0;
  }).length;

  const trialsEndingSoon = (subStats?.upcoming_30d ?? []).filter((u) => {
    return u.subscription.amount === 0 && u.days_until >= 0 && u.days_until <= 30;
  }).length;

  const displayCurrency = localStorage.getItem('sub_display_currency') ?? 'INR';
  const backendOk = health?.db.ok && !health?.llm.error;

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-50">
          {getGreeting()}{userName ? `, ${userName}` : ''}
        </h1>
        <p className="text-sm text-ink-500 mt-0.5">{formatDate()}</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatChip
          icon={<Flame className="w-3.5 h-3.5 text-orange-400" />}
          label="Habit streak"
          value={`${habitStats?.overall_current_streak ?? '—'} day${(habitStats?.overall_current_streak ?? 0) !== 1 ? 's' : ''}`}
          to="/habits"
        />
        <StatChip
          icon={<BookText className="w-3.5 h-3.5 text-sky-400" />}
          label="Journal streak"
          value={`${journalStats?.current_streak ?? '—'} day${(journalStats?.current_streak ?? 0) !== 1 ? 's' : ''}`}
          to="/journal"
        />
        <StatChip
          icon={<Wallet className="w-3.5 h-3.5 text-violet-400" />}
          label="This month"
          value={finSummary
            ? fmtCurrency(finSummary.total_expense, displayCurrency)
            : '—'}
          to="/finance"
        />
        <StatChip
          icon={<CalendarClock className="w-3.5 h-3.5 text-amber-400" />}
          label={trialsEndingSoon > 0 ? 'Due + trials' : 'Due this week'}
          value={
            dueThisWeek === 0 && trialsEndingSoon === 0
              ? 'All clear'
              : [
                  dueThisWeek > 0 && `${dueThisWeek} renewal${dueThisWeek !== 1 ? 's' : ''}`,
                  trialsEndingSoon > 0 && `${trialsEndingSoon} trial${trialsEndingSoon !== 1 ? 's' : ''}`,
                ].filter(Boolean).join(' · ')
          }
          highlight={dueThisWeek > 0 || trialsEndingSoon > 0}
          to="/subscriptions"
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-5">
        {/* Left — analytics cards */}
        <div className="lg:col-span-6 space-y-5">
          <DashHabitsCard />
          <DashJournalCard />
          <DashFinanceCard />
          <DashSubsCard />
        </div>

        {/* Right — AI briefing + chat + system */}
        <div className="lg:col-span-4 space-y-5">
          <DashAIBriefing />
          <DashAIChat />

          {/* System status */}
          <div className="card">
            <div className="card-title">System</div>
            <div className="space-y-1.5">
              <StatusRow label="Backend" ok={health?.db.ok ?? false} />
              <StatusRow label="Database" ok={health?.db.ok ?? false} detail={health?.db.error ?? undefined} />
              <StatusRow
                label={health?.llm.provider === 'lmstudio' ? 'LM Studio' : health?.llm.provider ?? 'LLM'}
                ok={health?.llm.ok ?? false}
                detail={health?.llm.ok ? health.llm.chat_model : (health?.llm.error ?? undefined)}
              />
            </div>
            {!backendOk && (
              <Link to="/settings" className="mt-2 inline-block text-[10px] text-accent hover:underline">
                Open settings →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function StatChip({
  icon,
  label,
  value,
  highlight,
  to,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="card flex items-center gap-3 hover:border-accent/30 transition-colors cursor-pointer group no-underline"
    >
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] text-ink-500 uppercase tracking-wide">{label}</div>
        <div className={`text-sm font-semibold tabular-nums truncate ${highlight ? 'text-amber-400' : 'text-ink-100'}`}>
          {value}
        </div>
      </div>
    </Link>
  );
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-center gap-2">
      {ok
        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        : <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
      }
      <span className="text-xs text-ink-300 shrink-0">{label}</span>
      {detail && (
        <span className="text-[10px] text-ink-600 truncate">{detail}</span>
      )}
    </div>
  );
}
