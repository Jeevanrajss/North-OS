import { useState } from 'react';
import { addDays, format, getISOWeek } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MonthCalendar } from '@/components/journal/MonthCalendar';
import { StreakCard } from '@/components/journal/StreakCard';
import { MoodSparkline } from '@/components/journal/MoodSparkline';
import { TagCloud } from '@/components/journal/TagCloud';
import { JournalAnnualCard } from '@/components/journal/JournalAnnualCard';
import { MoodHabitCard } from '@/components/journal/MoodHabitCard';
import { NotificationBell } from '@/components/NotificationPanel';
import { JournalExportButton } from '@/components/journal/JournalExportButton';
import { JournalDayContent } from '@/components/journal/JournalDayContent';
import { startOfMonth } from '@/lib/date';

// ── helpers ────────────────────────────────────────────────────────────────

function getDayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((d.getTime() - start.getTime()) / 86_400_000) + 1;
}

function isToday(d: Date): boolean {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() &&
         d.getMonth()    === t.getMonth()    &&
         d.getDate()     === t.getDate();
}

// ── component ──────────────────────────────────────────────────────────────

type Tab = 'entries' | 'insights';

export function Journal() {
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [anchorMonth, setAnchorMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [activeTab, setActiveTab] = useState<Tab>('entries');

  function handleSelect(d: Date) {
    setSelectedDate(d);
    if (
      d.getMonth()    !== anchorMonth.getMonth() ||
      d.getFullYear() !== anchorMonth.getFullYear()
    ) {
      setAnchorMonth(startOfMonth(d));
    }
  }

  const dayOfYear  = getDayOfYear(selectedDate);
  const weekNum    = getISOWeek(selectedDate);
  const todayFlag  = isToday(selectedDate);

  return (
    <div>

      {/* ── Sticky Journal Topbar ──────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-20"
        style={{
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          background: 'rgba(14,16,24,0.80)',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <div
          className="flex items-center gap-4"
          style={{ maxWidth: 1200, margin: '0 auto', padding: '10px 48px' }}
        >
          {/* Breadcrumb */}
          <span style={{ color: 'var(--fg-4)', fontSize: 13, fontWeight: 500 }}>
            North OS{' '}
            <span style={{ color: 'var(--fg-2)' }}>/ Journal</span>
          </span>

          {/* Date stepper */}
          <div
            className="flex items-center gap-0.5"
            style={{
              marginLeft: 8,
              background: 'var(--surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 12,
              padding: 4,
            }}
          >
            <button
              type="button"
              onClick={() => handleSelect(addDays(selectedDate, -1))}
              className="flex items-center justify-center transition-colors"
              style={{
                width: 32, height: 32, borderRadius: 8,
                color: 'var(--fg-3)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)';
                (e.currentTarget as HTMLButtonElement).style.color = 'white';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-3)';
              }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div
              className="flex items-center gap-2"
              style={{ padding: '0 14px', height: 32, fontSize: 13, fontWeight: 500, color: 'white' }}
            >
              {/* Purple dot */}
              <span
                style={{
                  width: 6, height: 6, borderRadius: 999,
                  background: 'var(--primary-400)',
                  boxShadow: '0 0 8px var(--primary-500)',
                  flexShrink: 0,
                }}
              />
              {format(selectedDate, 'EEE, MMM d, yyyy')}
            </div>

            <button
              type="button"
              onClick={() => handleSelect(addDays(selectedDate, 1))}
              className="flex items-center justify-center transition-colors"
              style={{
                width: 32, height: 32, borderRadius: 8,
                color: 'var(--fg-3)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)';
                (e.currentTarget as HTMLButtonElement).style.color = 'white';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-3)';
              }}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Today button — only when not on today */}
          {!todayFlag && (
            <button
              type="button"
              onClick={() => handleSelect(new Date())}
              style={{
                height: 32, padding: '0 12px', borderRadius: 8,
                fontSize: 12, fontWeight: 500,
                color: 'var(--fg-3)',
                border: '1px solid var(--border-default)',
                background: 'transparent',
                transition: 'all 250ms ease',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-1)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-strong)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-3)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)';
              }}
            >
              Today
            </button>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Notifications */}
          <NotificationBell />

          {/* Export */}
          <JournalExportButton />
        </div>
      </header>

      {/* ── Page content ──────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '36px 48px 96px' }}>

        {/* ── Day header ──────────────────────────────────────────────────── */}
        <div className="mb-6">
          <div className="flex items-center gap-2.5 mb-2">
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
              DAY {dayOfYear} / {selectedDate.getFullYear()}
            </span>
            <span style={{ color: 'var(--fg-4)', opacity: 0.4 }}>·</span>
            <span
              style={{
                font: '500 10.5px/1 var(--font-mono)',
                letterSpacing: '0.04em',
                color: 'var(--fg-4)',
              }}
            >
              WEEK {weekNum}
            </span>
          </div>
          <h1
            style={{
              font: '500 56px/1.05 var(--font-display)',
              letterSpacing: '-0.025em',
              margin: '8px 0 4px',
              color: 'white',
            }}
          >
            <span style={{ color: 'var(--fg-3)', fontWeight: 300 }}>
              {format(selectedDate, 'EEEE')},{' '}
            </span>
            <span
              style={{
                background: 'linear-gradient(135deg, var(--primary-300) 0%, var(--primary-500) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {format(selectedDate, 'MMMM d')}
            </span>
          </h1>
        </div>

        {/* ── Tab bar ───────────────────────────────────────────────────────── */}
        <div
          className="flex items-center gap-1 mb-6"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 14,
            padding: 4,
            width: 'fit-content',
          }}
        >
          {(['entries', 'insights'] as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '7px 22px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 180ms ease',
                textTransform: 'capitalize',
                background: activeTab === tab ? 'rgba(139,124,255,0.15)' : 'transparent',
                color: activeTab === tab ? '#B8A5FF' : '#7B8498',
                border: activeTab === tab ? '1px solid rgba(139,124,255,0.25)' : '1px solid transparent',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* ── Entries tab ───────────────────────────────────────────────────── */}
        {activeTab === 'entries' && (
          <JournalDayContent date={selectedDate} />
        )}

        {/* ── Insights tab ──────────────────────────────────────────────────── */}
        {activeTab === 'insights' && (
          <>
            {/* 3-col: Calendar | Streak | Mood Trend */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <MonthCalendar
                anchorMonth={anchorMonth}
                onAnchorChange={setAnchorMonth}
                selectedDate={selectedDate}
                onSelect={handleSelect}
              />
              <StreakCard />
              <MoodSparkline />
            </div>

            {/* 2-col: Habits & mood | Top tags */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 mt-4">
              <MoodHabitCard />
              <TagCloud />
            </div>

            {/* Year in review */}
            <div className="mt-4">
              <JournalAnnualCard />
            </div>
          </>
        )}

      </div>
    </div>
  );
}
