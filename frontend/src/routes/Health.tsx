import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { PageHeader } from '@/components/PageHeader';
import { api, type HealthLog, type HealthLogIn } from '@/lib/api';

const TODAY = new Date().toISOString().slice(0, 10);

// ─────────────────────────────────────────────────────────────────────────────
// Energy star selector
// ─────────────────────────────────────────────────────────────────────────────
function EnergyPicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const LABELS = ['', 'Exhausted', 'Low', 'Okay', 'Good', 'Great!'];
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          style={{
            width: 36, height: 36, borderRadius: 10, fontSize: 18,
            display: 'grid', placeItems: 'center',
            background: value != null && n <= value ? 'rgba(255,184,107,0.20)' : 'var(--surface-elev)',
            border: value === n ? '1.5px solid rgba(255,184,107,0.50)' : '1px solid var(--border-default)',
            cursor: 'pointer', transition: 'var(--transition)',
          }}
          title={LABELS[n]}
        >
          {n <= (value ?? 0) ? '⭐' : '☆'}
        </button>
      ))}
      {value != null && (
        <span style={{ fontSize: 12, color: 'var(--accent-yellow)', fontWeight: 500 }}>
          {LABELS[value]}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sleep slider
// ─────────────────────────────────────────────────────────────────────────────
function SleepSlider({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <input
        type="range" min="0" max="12" step="0.5"
        value={value ?? 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || null)}
        style={{ flex: 1, accentColor: 'var(--primary-500)' }}
      />
      <span style={{ font: '500 20px/1 var(--font-display)', color: 'var(--fg-1)', minWidth: 50, textAlign: 'right' }}>
        {value != null ? `${value}h` : '—'}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat chip
// ─────────────────────────────────────────────────────────────────────────────
function StatChip({ label, value, unit, color }: { label: string; value: string; unit?: string; color: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 14, padding: '14px 18px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -16, right: -16, width: 70, height: 70, borderRadius: '50%', background: color, opacity: 0.12 }} />
      <div style={{ font: '500 10px/1 var(--font-sans)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 8 }}>{label}</div>
      <div style={{ font: '500 24px/1 var(--font-display)', letterSpacing: '-0.02em', color: 'var(--fg-1)' }}>
        {value}{unit && <span style={{ fontSize: 13, color: 'var(--fg-3)', marginLeft: 3 }}>{unit}</span>}
      </div>
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export function Health() {
  const qc = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saved, setSaved] = useState(false);

  // Today's log state
  const [sleep,    setSleep]    = useState<number | null>(null);
  const [energy,   setEnergy]   = useState<number | null>(null);
  const [exercise, setExercise] = useState<string>('');
  const [exType,   setExType]   = useState<string>('');
  const [water,    setWater]    = useState<number | null>(null);
  const [notes,    setNotes]    = useState<string>('');
  const [loaded,   setLoaded]   = useState(false);

  // Fetch today's log on mount
  const todayQ = useQuery<HealthLog>({
    queryKey: ['health-log', TODAY],
    queryFn: () => api.healthLog.get(TODAY),
    retry: false,
    staleTime: 30_000,
  });

  // Populate state when today's data loads
  useEffect(() => {
    if (todayQ.data && !loaded) {
      const d = todayQ.data;
      setSleep(d.sleep_hours);
      setEnergy(d.energy_level);
      setExercise(d.exercise_minutes != null ? String(d.exercise_minutes) : '');
      setExType(d.exercise_type ?? '');
      setWater(d.water_glasses);
      setNotes(d.notes ?? '');
      setLoaded(true);
    } else if (todayQ.isError) {
      setLoaded(true); // no log yet — start fresh
    }
  }, [todayQ.data, todayQ.isError, loaded]);

  // History for charts
  const histQ = useQuery<HealthLog[]>({
    queryKey: ['health-log-history', 30],
    queryFn: () => api.healthLog.list(30),
    staleTime: 60_000,
  });

  const statsQ = useQuery({
    queryKey: ['health-stats'],
    queryFn: () => api.healthLog.stats(30),
    staleTime: 60_000,
  });

  const upsertMut = useMutation({
    mutationFn: (body: HealthLogIn) => api.healthLog.upsert(TODAY, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['health-log'] });
      qc.invalidateQueries({ queryKey: ['health-log-history'] });
      qc.invalidateQueries({ queryKey: ['health-stats'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  // Debounced auto-save — fires 1s after last change
  const scheduleAutoSave = useCallback((patch: HealthLogIn) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      upsertMut.mutate(patch);
    }, 1000);
  }, [upsertMut]);

  // Build the patch object from current state and trigger save
  function autosave(overrides: Partial<{
    sleep: number | null; energy: number | null; exercise: string;
    exType: string; water: number | null; notes: string;
  }> = {}) {
    const s = overrides.sleep    !== undefined ? overrides.sleep    : sleep;
    const e = overrides.energy   !== undefined ? overrides.energy   : energy;
    const ex= overrides.exercise !== undefined ? overrides.exercise : exercise;
    const et= overrides.exType   !== undefined ? overrides.exType   : exType;
    const w = overrides.water    !== undefined ? overrides.water    : water;
    const n = overrides.notes    !== undefined ? overrides.notes    : notes;

    scheduleAutoSave({
      sleep_hours:      s,
      energy_level:     e,
      exercise_minutes: ex ? parseInt(ex, 10) || null : null,
      exercise_type:    et.trim() || null,
      water_glasses:    w,
      notes:            n.trim() || null,
    });
  }

  const stats = statsQ.data;
  const history = histQ.data ?? [];
  const chartData = history.map((h) => ({
    date:     fmtDate(h.log_date),
    sleep:    h.sleep_hours,
    energy:   h.energy_level,
    exercise: h.exercise_minutes,
  }));

  const hasHistory = history.length >= 3;

  return (
    <>
      <PageHeader
        title="Health"
        eyebrow="HEALTH · DAILY LOG"
        subtitle="Log sleep, energy, and exercise. Correlates with mood and habits in Patterns."
      />

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      {stats && stats.days_with_data > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          <StatChip label="Avg sleep"    value={stats.avg_sleep_hours != null ? `${stats.avg_sleep_hours}` : '—'} unit="hrs"  color="var(--primary-500)" />
          <StatChip label="Avg energy"   value={stats.avg_energy_level != null ? `${stats.avg_energy_level}` : '—'} unit="/ 5" color="var(--accent-yellow)" />
          <StatChip label="Exercise days"value={String(stats.exercise_days)} unit={`/ ${stats.days_with_data}d`} color="var(--accent-green)" />
          <StatChip label="Water (total)"value={String(stats.total_water_glasses)} unit="glasses"            color="var(--accent-blue, #3EBEFF)" />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 20, alignItems: 'start' }}>
        {/* ── Today quick-log ───────────────────────────────────────────── */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ font: '500 16px/1.2 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>
              Today
            </div>
            {saved && (
              <span style={{ fontSize: 11, color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>
                ✓ Saved
              </span>
            )}
            {upsertMut.isPending && (
              <span style={{ fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>
                Saving…
              </span>
            )}
          </div>

          {!loaded ? (
            <div style={{ color: 'var(--fg-4)', fontSize: 13 }}>Loading…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Sleep */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-3)', marginBottom: 8 }}>
                  😴 Sleep last night
                </div>
                <SleepSlider
                  value={sleep}
                  onChange={(v) => { setSleep(v); autosave({ sleep: v }); }}
                />
              </div>

              {/* Energy */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-3)', marginBottom: 8 }}>
                  ⚡ Energy level
                </div>
                <EnergyPicker
                  value={energy}
                  onChange={(v) => { setEnergy(v); autosave({ energy: v }); }}
                />
              </div>

              {/* Exercise */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-3)', marginBottom: 8 }}>
                  🏃 Exercise
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="number" placeholder="0" min="0" max="480"
                    value={exercise}
                    onChange={(e) => { setExercise(e.target.value); autosave({ exercise: e.target.value }); }}
                    style={{ width: 72 }}
                    className="rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60"
                  />
                  <span style={{ fontSize: 12, color: 'var(--fg-4)', alignSelf: 'center' }}>min</span>
                  <input
                    type="text" placeholder="e.g. walk, gym"
                    value={exType}
                    onChange={(e) => { setExType(e.target.value); autosave({ exType: e.target.value }); }}
                    className="flex-1 rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60"
                  />
                </div>
              </div>

              {/* Water */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-3)', marginBottom: 8 }}>
                  💧 Water
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button type="button"
                    onClick={() => { const v = Math.max(0, (water ?? 0) - 1); setWater(v || null); autosave({ water: v || null }); }}
                    style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-elev)', border: '1px solid var(--border-default)', color: 'var(--fg-2)', cursor: 'pointer', fontSize: 16 }}>
                    −
                  </button>
                  <span style={{ font: '500 20px/1 var(--font-display)', color: 'var(--fg-1)', minWidth: 30, textAlign: 'center' }}>
                    {water ?? 0}
                  </span>
                  <button type="button"
                    onClick={() => { const v = (water ?? 0) + 1; setWater(v); autosave({ water: v }); }}
                    style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-elev)', border: '1px solid var(--border-default)', color: 'var(--fg-2)', cursor: 'pointer', fontSize: 16 }}>
                    +
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--fg-4)' }}>glasses</span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-3)', marginBottom: 8 }}>
                  📝 Notes
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => { setNotes(e.target.value); autosave({ notes: e.target.value }); }}
                  placeholder="Any notes about today…"
                  rows={2}
                  maxLength={500}
                  className="w-full rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/60 resize-none"
                />
              </div>
            </div>
          )}

          {/* Empty state hint */}
          {loaded && !sleep && !energy && !exercise && !water && (
            <p style={{ marginTop: 16, fontSize: 12, color: 'var(--fg-4)', lineHeight: 1.5 }}>
              Start logging today. Even tracking sleep and energy for a week reveals patterns you wouldn't notice otherwise.
            </p>
          )}
        </div>

        {/* ── Charts ────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!hasHistory ? (
            <div className="card" style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📈</div>
              <div style={{ font: '500 15px/1.3 var(--font-display)', color: 'var(--fg-2)', marginBottom: 6 }}>
                Trend charts appear after 3+ days
              </div>
              <p style={{ fontSize: 13, color: 'var(--fg-4)' }}>
                Log sleep and energy daily and patterns will emerge here.
              </p>
            </div>
          ) : (
            <>
              {/* Sleep trend */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ font: '500 14px/1.2 var(--font-display)', color: 'var(--fg-1)', marginBottom: 14 }}>
                  Sleep (hours)
                </div>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fill: 'var(--fg-4)', fontSize: 9 }} tickLine={false} axisLine={false} interval={Math.floor(chartData.length / 5)} />
                    <YAxis domain={[0, 12]} tick={{ fill: 'var(--fg-4)', fontSize: 9 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: 'var(--surface-elev)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 11, color: 'var(--fg-1)' }} formatter={(v) => [`${v}h`, 'Sleep']} />
                    <Line type="monotone" dataKey="sleep" stroke="var(--primary-400)" strokeWidth={2} dot={false} activeDot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Energy trend */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ font: '500 14px/1.2 var(--font-display)', color: 'var(--fg-1)', marginBottom: 14 }}>
                  Energy level (1–5)
                </div>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fill: 'var(--fg-4)', fontSize: 9 }} tickLine={false} axisLine={false} interval={Math.floor(chartData.length / 5)} />
                    <YAxis domain={[0, 5]} ticks={[1,2,3,4,5]} tick={{ fill: 'var(--fg-4)', fontSize: 9 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: 'var(--surface-elev)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 11, color: 'var(--fg-1)' }} formatter={(v) => [`${v}/5`, 'Energy']} />
                    <Line type="monotone" dataKey="energy" stroke="var(--accent-yellow)" strokeWidth={2} dot={false} activeDot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Exercise bars */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ font: '500 14px/1.2 var(--font-display)', color: 'var(--fg-1)', marginBottom: 14 }}>
                  Exercise (minutes)
                </div>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: 'var(--fg-4)', fontSize: 9 }} tickLine={false} axisLine={false} interval={Math.floor(chartData.length / 5)} />
                    <YAxis tick={{ fill: 'var(--fg-4)', fontSize: 9 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: 'var(--surface-elev)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 11, color: 'var(--fg-1)' }} formatter={(v) => [`${v} min`, 'Exercise']} />
                    <Bar dataKey="exercise" fill="rgba(61,255,152,0.50)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
