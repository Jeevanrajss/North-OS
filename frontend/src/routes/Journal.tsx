import { useState } from 'react';
import { addDays, format, getISOWeek } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MonthCalendar } from '@/components/journal/MonthCalendar';
import { StreakCard } from '@/components/journal/StreakCard';
import { MoodSparkline } from '@/components/journal/MoodSparkline';
import { TagCloud } from '@/components/journal/TagCloud';
import { JournalAnnualCard } from '@/components/journal/JournalAnnualCard';
import { MoodHabitCard } from '@/components/journal/MoodHabitCard';
import { JournalExportButton } from '@/components/journal/JournalExportButton';
import { NotificationBell } from '@/components/NotificationPanel';
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

export function Journal() {
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [anchorMonth, setAnchorMonth] = useState<Date>(() => startOfMonth(new Date()));

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
          <span style={{ color: '#7B8498', fontSize: 13, fontWeight: 500 }}>
            North OS{' '}
            <span style={{ color: '#C9D0E0' }}>/ Journal</span>
          </span>

          {/* Date stepper */}
          <div
            className="flex items-center gap-0.5"
            style={{
              marginLeft: 8,
              background: '#151827',
              border: '1px solid rgba(255,255,255,0.08)',
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
                color: '#A0A9BC',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = '#232734';
                (e.currentTarget as HTMLButtonElement).style.color = 'white';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = '#A0A9BC';
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
                  background: '#9D8DFF',
                  boxShadow: '0 0 8px #8B7CFF',
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
                color: '#A0A9BC',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = '#232734';
                (e.currentTarget as HTMLButtonElement).style.color = 'white';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = '#A0A9BC';
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
                height: 32, padding: '0 12px', borderRadius: 10,
                fontSize: 12, fontWeight: 500,
                color: '#A0A9BC',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'transparent',
                transition: 'all 250ms ease',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.color = 'white';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.16)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.color = '#A0A9BC';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)';
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
          <div
            className="flex items-center gap-2.5 mb-2"
            style={{ color: '#7B8498', fontSize: 12, fontWeight: 500 }}
          >
            <span>Day {dayOfYear} of {selectedDate.getFullYear()}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>Week {weekNum}</span>
          </div>
          <h1
            style={{
              font: '500 56px/1.05 "Clash Grotesk", Inter, sans-serif',
              letterSpacing: '-0.025em',
              margin: '8px 0 4px',
              color: 'white',
            }}
          >
            <span style={{ color: '#A0A9BC', fontWeight: 300 }}>
              {format(selectedDate, 'EEEE')},{' '}
            </span>
            <span
              style={{
                background: 'linear-gradient(135deg, #B8A5FF 0%, #8B7CFF 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {format(selectedDate, 'MMMM d')}
            </span>
          </h1>
          <p style={{ color: '#A0A9BC', fontSize: 14, margin: 0 }}>
            One page per day. Mood, tags, summary — and as many entries as you want.
          </p>
        </div>

        {/* ── Day content: mood+tags | reflect, summary, entries ──────────── */}
        <JournalDayContent date={selectedDate} />

        {/* ── Insights section header ──────────────────────────────────────── */}
        <div
          className="flex items-baseline"
          style={{ margin: '56px 0 18px' }}
        >
          <h2
            style={{
              margin: 0,
              font: '500 22px/1.2 "Clash Grotesk", Inter, sans-serif',
              letterSpacing: '-0.01em',
              color: 'white',
            }}
          >
            Insights
          </h2>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)', margin: '0 16px' }} />
          <span style={{ color: '#7B8498', fontSize: 12 }}>Last 30 days</span>
        </div>

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

      </div>
    </div>
  );
}
