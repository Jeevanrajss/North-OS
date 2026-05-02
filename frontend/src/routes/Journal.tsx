import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { MonthCalendar } from '@/components/journal/MonthCalendar';
import { DayView } from '@/components/journal/DayView';
import { StreakCard } from '@/components/journal/StreakCard';
import { MoodSparkline } from '@/components/journal/MoodSparkline';
import { TagCloud } from '@/components/journal/TagCloud';
import { ReflectToday } from '@/components/journal/ReflectToday';
import { JournalSearch } from '@/components/journal/JournalSearch';
import { startOfMonth } from '@/lib/date';

export function Journal() {
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [anchorMonth, setAnchorMonth] = useState<Date>(() => startOfMonth(new Date()));

  function handleSelect(d: Date) {
    setSelectedDate(d);
    // If the user clicks into an adjacent-month cell, follow them.
    if (d.getMonth() !== anchorMonth.getMonth() || d.getFullYear() !== anchorMonth.getFullYear()) {
      setAnchorMonth(startOfMonth(d));
    }
  }

  return (
    <>
      <PageHeader
        title="Journal"
        subtitle="One page per day. Mood, tags, summary, and as many entries as you want."
      />
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
        <div className="lg:sticky lg:top-8 self-start space-y-5">
          <MonthCalendar
            anchorMonth={anchorMonth}
            onAnchorChange={setAnchorMonth}
            selectedDate={selectedDate}
            onSelect={handleSelect}
          />
          <StreakCard />
          <MoodSparkline />
          <TagCloud />
          <JournalSearch />
        </div>
        <div className="space-y-5">
          <ReflectToday date={selectedDate} />
          <DayView date={selectedDate} />
        </div>
      </div>
    </>
  );
}
