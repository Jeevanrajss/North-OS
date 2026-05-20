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
import { useModules } from '@/contexts/ModulesContext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getHourInTz(tz?: string): number {
  try {
    if (!tz) return new Date().getHours();
    return parseInt(
      new Intl.DateTimeFormat('en', { hour: 'numeric', hour12: false, timeZone: tz }).format(new Date()),
      10,
    );
  } catch {
    return new Date().getHours();
  }
}

function getGreeting(): string {
  const tz = localStorage.getItem('user_timezone') || undefined;
  const h = getHourInTz(tz);
  if (h < 5)  return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

function formatDate(): string {
  const tz = localStorage.getItem('user_timezone') || undefined;
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    ...(tz ? { timeZone: tz } : {}),
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

  const { isEnabled } = useModules();

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
    enabled: isEnabled('habits'),
  });

  const { data: journalStats } = useQuery<StatsResponse>({
    queryKey: ['journal-stats', 30],
    queryFn: () => api.journal.stats(30),
    staleTime: 1000 * 60,
    enabled: isEnabled('journal'),
  });

  // Finance: this month's summary for the expense chip
  const { data: finSummary } = useQuery<MonthlySummary>({
    queryKey: ['finance-summary', y, m],
    queryFn: () => api.finance.summary(y, m),
    staleTime: 1000 * 60 * 5,
    enabled: isEnabled('finance'),
  });

  // Subscription stats (used for "Due this week" chip — reuses the same
  // query that DashSubsCard already fires, so no extra fetch)
  const { data: subStats } = useQuery({
    queryKey: ['subscription-stats'],
    queryFn: () => api.subscriptions.stats(),
    staleTime: 1000 * 30,
    enabled: isEnabled('subscriptions'),
  });

  const dueThisWeek = (subStats?.upcoming_30d ?? []).filter((u) => {
    return u.days_until >= 0 && u.days_until <= 7 && u.subscription.amount > 0;
  }).length;

  const trialsEndingSoon = (subStats?.upcoming_30d ?? []).filter((u) => {
    return u.subscription.amount === 0 && u.days_until >= 0 && u.days_until <= 30;
  }).length;

  const displayCurrency = localStorage.getItem('sub_display_currency') ?? 'INR';
  const backendOk = health?.db.ok && !health?.llm.error;

  // Day of year calculation
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000);

  return (
    <div className="space-y-6">
      {/* ── Hero greeting card — matches HTML reference ── */}
      <section
        className="relative overflow-hidden mb-6"
        style={{
          borderRadius: 24,
          background: `
            radial-gradient(420px 280px at 100% -10%, rgba(139,124,255,0.16), transparent 60%),
            radial-gradient(280px 200px at 0% 110%, rgba(62,190,255,0.12), transparent 60%),
            linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0)),
            var(--surface)
          `,
          border: '1px solid var(--border-default)',
          padding: '32px 36px',
        }}
      >
        {/* Corner halo */}
        <span
          className="pointer-events-none absolute rounded-full"
          style={{
            right: -80, top: -80,
            width: 280, height: 280,
            background: 'radial-gradient(circle, rgba(139,124,255,0.25), transparent 70%)',
            filter: 'blur(20px)',
          }}
        />

        {/* Meta row */}
        <div
          className="relative flex items-center gap-2.5 mb-2.5"
          style={{ color: 'var(--fg-4)', fontSize: 12, fontWeight: 500 }}
        >
          <span
            className="inline-flex items-center"
            style={{
              height: 22, padding: '0 10px', borderRadius: 999,
              background: 'rgba(139,124,255,0.12)',
              border: '1px solid rgba(139,124,255,0.24)',
              color: 'var(--primary-300)',
              font: '500 10.5px/1 var(--font-mono)',
              letterSpacing: '0.04em',
            }}
          >
            DAY {dayOfYear} / {now.getFullYear()}
          </span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>{formatDate()}</span>
        </div>

        {/* Big greeting */}
        <h1
          className="relative m-0"
          style={{ font: '500 56px/1.05 var(--font-display)', letterSpacing: '-0.025em', color: 'var(--fg-1)' }}
        >
          {getGreeting()}{userName
            ? <>,{' '}<span style={{
                background: 'linear-gradient(135deg, #B8A5FF 0%, #FF7AD9 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>{userName.split(' ')[0]}.</span></>
            : '.'}
        </h1>

        {/* Sub text */}
        <p
          className="relative mt-2.5 text-[14px]"
          style={{ color: 'var(--fg-3)', maxWidth: 560 }}
        >
          {isEnabled('habits') && habitStats && habitStats.overall_current_streak > 0
            ? `${habitStats.overall_current_streak} day habit streak — keep going. `
            : ''}
          {isEnabled('subscriptions') && dueThisWeek > 0
            ? `${dueThisWeek} renewal${dueThisWeek !== 1 ? 's' : ''} due this week. `
            : ''}
          {isEnabled('subscriptions') && trialsEndingSoon > 0
            ? `${trialsEndingSoon} trial${trialsEndingSoon !== 1 ? 's' : ''} ending soon. `
            : ''}
          Your personal OS is running locally.
        </p>

        {/* KPI tiles row — only render enabled modules */}
        {(() => {
          const tiles = [
            isEnabled('habits') && (
              <KpiTile
                key="habits"
                iconBg="rgba(255,184,107,0.12)"
                iconColor="var(--accent-yellow)"
                icon={<Flame className="w-[18px] h-[18px]" />}
                label="Habit Streak"
                value={`${habitStats?.overall_current_streak ?? '—'}`}
                unit={`day${(habitStats?.overall_current_streak ?? 0) !== 1 ? 's' : ''}`}
                to="/app/habits"
                tileBg="rgba(8,9,16,0.45)"
              />
            ),
            isEnabled('journal') && (
              <KpiTile
                key="journal"
                iconBg="rgba(139,124,255,0.14)"
                iconColor="var(--primary-300)"
                icon={<BookText className="w-[18px] h-[18px]" />}
                label="Journal Streak"
                value={`${journalStats?.current_streak ?? '—'}`}
                unit={`day${(journalStats?.current_streak ?? 0) !== 1 ? 's' : ''}`}
                to="/app/journal"
                tileBg="rgba(8,9,16,0.45)"
              />
            ),
            isEnabled('finance') && (
              <KpiTile
                key="finance"
                iconBg="rgba(184,165,255,0.10)"
                iconColor="var(--primary-300)"
                icon={<Wallet className="w-[18px] h-[18px]" />}
                label="Subs this month"
                value={finSummary ? fmtCurrency(finSummary.total_expense, displayCurrency) : '—'}
                to="/app/finance"
                tileBg="rgba(8,9,16,0.45)"
              />
            ),
            isEnabled('subscriptions') && (
              <KpiTile
                key="subscriptions"
                iconBg="rgba(255,215,106,0.12)"
                iconColor="var(--accent-yellow)"
                icon={<CalendarClock className="w-[18px] h-[18px]" />}
                label="Due this week"
                value={dueThisWeek === 0 && trialsEndingSoon === 0 ? '0' : `${dueThisWeek + trialsEndingSoon}`}
                unit={dueThisWeek > 0 || trialsEndingSoon > 0 ? 'renewals' : undefined}
                to="/app/subscriptions"
                tileBg="rgba(8,9,16,0.45)"
                highlight={dueThisWeek > 0 || trialsEndingSoon > 0}
              />
            ),
          ].filter(Boolean);

          if (tiles.length === 0) return null;
          return (
            <div
              className="relative grid gap-3 mt-7"
              style={{ gridTemplateColumns: `repeat(${tiles.length}, 1fr)` }}
            >
              {tiles}
            </div>
          );
        })()}
      </section>

      {/* Main grid */}
      {(() => {
        const hasLeft = isEnabled('habits') || isEnabled('journal');
        return (
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-5">
          {/* Left — analytics cards (only shown if habits or journal is enabled) */}
          {hasLeft && (
          <div className="lg:col-span-6 space-y-5">
            {isEnabled('habits') && <DashHabitsCard />}
            {isEnabled('journal') && <DashJournalCard />}
          </div>
          )}

          {/* Right — AI briefing + subscriptions + finance + system */}
          <div className={hasLeft ? 'lg:col-span-4 space-y-5' : 'lg:col-span-10 space-y-5'}>
            {isEnabled('chat') && <DashAIBriefing />}
            {isEnabled('subscriptions') && <DashSubsCard />}
            {isEnabled('finance') && <DashFinanceCard />}

          {/* System status — always visible */}
          <div className="card">
            <div className="card-title mb-2.5">System</div>
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
              <Link to="/app/settings" className="mt-2 inline-block text-[10px] text-accent hover:underline">
                Open settings →
              </Link>
            )}
          </div>
        </div>
      </div>
        );
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** KPI tile — matches app-chrome.css .kpi-tile exactly */
function KpiTile({
  icon, iconBg, iconColor, label, value, unit, highlight, to, tileBg,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  unit?: string;
  highlight?: boolean;
  to: string;
  tileBg?: string;
}) {
  return (
    <Link
      to={to}
      className="relative flex items-center gap-3.5 overflow-hidden no-underline transition-all"
      style={{
        padding: '18px 20px',
        background: tileBg ?? 'var(--surface)',
        border: `1px solid ${tileBg ? 'var(--border-subtle)' : 'var(--border-default)'}`,
        borderRadius: 16,
      }}
    >
      {/* Icon badge */}
      <div
        className="shrink-0 rounded-xl flex items-center justify-center"
        style={{ width: 40, height: 40, background: iconBg, color: iconColor }}
      >
        {icon}
      </div>
      {/* Text */}
      <div>
        <div
          className="font-medium uppercase truncate"
          style={{ font: '500 12px/1 var(--font-sans)', letterSpacing: '0.12em', color: 'var(--fg-4)' }}
        >
          {label}
        </div>
        <div
          className="mt-1 tabular-nums"
          style={{
            font: '500 22px/1.1 var(--font-display)',
            letterSpacing: '-0.01em',
            color: highlight ? 'var(--accent-yellow)' : 'var(--fg-1)',
          }}
        >
          {value}
          {unit && (
            <span
              className="font-normal ml-1"
              style={{ fontSize: 13, color: 'var(--fg-3)' }}
            >
              {unit}
            </span>
          )}
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
        <span className="text-[10px] text-ink-400 truncate">{detail}</span>
      )}
    </div>
  );
}
