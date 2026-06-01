import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts';
import type { AnalyticsSnapshot } from '@/lib/api';

type Props = { data: AnalyticsSnapshot[] };

function moodColor(mood: number | null): string {
  if (mood == null) return 'rgba(255,255,255,0.10)';
  if (mood >= 3.5) return 'rgba(61,255,152,0.65)';   // green — high mood
  if (mood >= 2.5) return 'rgba(255,184,107,0.65)';  // amber — neutral
  return 'rgba(255,91,110,0.65)';                     // red   — low mood
}

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function ExpensePatternChart({ data }: Props) {
  const chartData = data
    .filter((s) => s.daily_expense != null)
    .map((s) => ({
      date: fmt(s.date),
      expense: Math.round(s.daily_expense!),
      mood: s.mood_score,
    }));

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { color: 'rgba(61,255,152,0.65)', label: 'High mood (≥3.5)' },
          { color: 'rgba(255,184,107,0.65)', label: 'Neutral (2.5–3.5)' },
          { color: 'rgba(255,91,110,0.65)', label: 'Low mood (<2.5)' },
          { color: 'rgba(255,255,255,0.10)', label: 'No mood data' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--fg-4)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: 'inline-block' }} />
            {label}
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--fg-4)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval={Math.floor(chartData.length / 6)}
          />
          <YAxis
            tick={{ fill: 'var(--fg-4)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface-elev)',
              border: '1px solid var(--border-default)',
              borderRadius: 10,
              fontSize: 12,
              color: 'var(--fg-1)',
            }}
            formatter={(value, _name, props) => [
              `₹${Number(value).toLocaleString('en-IN')}`,
              `Spend (mood: ${(props.payload as { mood?: number })?.mood?.toFixed(1) ?? 'n/a'})`,
            ]}
          />
          <Bar dataKey="expense" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={moodColor(entry.mood)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
