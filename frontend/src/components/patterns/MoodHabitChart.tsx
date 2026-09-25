import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { chartAxis, chartGrid, chartTooltip } from '@/lib/chart';
import type { AnalyticsSnapshot } from '@/lib/api';

type Props = { data: AnalyticsSnapshot[] };

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function MoodHabitChart({ data }: Props) {
  const chartData = data.map((s) => ({
    date: fmt(s.date),
    mood: s.mood_score != null ? Number(s.mood_score.toFixed(1)) : null,
    habits: s.habit_completion_rate != null ? Math.round(s.habit_completion_rate * 100) : null,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
        <CartesianGrid {...chartGrid} />
        <XAxis
          dataKey="date"
          {...chartAxis}
          interval={Math.floor(chartData.length / 6)}
        />
        {/* Left axis: mood score 0–5 */}
        <YAxis
          yAxisId="mood"
          orientation="left"
          domain={[0, 5]}
          {...chartAxis}
          tickFormatter={(v) => `${v}`}
        />
        {/* Right axis: habit % 0–100 */}
        <YAxis
          yAxisId="habits"
          orientation="right"
          domain={[0, 100]}
          {...chartAxis}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
            {...chartTooltip}
          formatter={(value, name) =>
            name === 'mood' ? [`${Number(value).toFixed(1)}/5`, 'Mood'] : [`${value}%`, 'Habits']
          }
        />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) => (
            <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>
              {value === 'mood' ? 'Mood score' : 'Habit completion'}
            </span>
          )}
        />
        <Bar
          yAxisId="habits"
          dataKey="habits"
          fill="rgb(var(--primary-rgb) / 0.25)"
          radius={[3, 3, 0, 0]}
          name="habits"
        />
        <Line
          yAxisId="mood"
          type="monotone"
          dataKey="mood"
          stroke="var(--accent-orange)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: 'var(--accent-orange)' }}
          connectNulls
          name="mood"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
