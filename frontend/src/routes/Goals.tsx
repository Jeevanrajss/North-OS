import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { RightDrawer } from '@/components/ui/RightDrawer';
import { GoalCard } from '@/components/goals/GoalCard';
import { GoalForm } from '@/components/goals/GoalForm';
import { api, type Goal, type GoalIn } from '@/lib/api';

type StatusFilter = 'active' | 'completed' | 'all';

export function Goals() {
  const qc = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  const goalsQ = useQuery<Goal[]>({
    queryKey: ['goals', statusFilter],
    queryFn: () => api.goals.list(statusFilter === 'all' ? undefined : statusFilter),
    staleTime: 30_000,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['goals'] });
  }

  const createMut  = useMutation({ mutationFn: (p: GoalIn) => api.goals.create(p),          onSuccess: invalidate });
  const updateMut  = useMutation({ mutationFn: ({ id, p }: { id: string; p: GoalIn }) => api.goals.update(id, p), onSuccess: invalidate });
  const deleteMut  = useMutation({ mutationFn: (id: string) => api.goals.delete(id),         onSuccess: invalidate });
  const completeMut= useMutation({ mutationFn: (id: string) => api.goals.complete(id),       onSuccess: invalidate });
  const abandonMut = useMutation({ mutationFn: (id: string) => api.goals.abandon(id),        onSuccess: invalidate });

  function openAdd()        { setEditing(null); setDrawerOpen(true); }
  function openEdit(g: Goal){ setEditing(g);    setDrawerOpen(true); }
  function closeDrawer()    { setDrawerOpen(false); setEditing(null); }

  async function handleSave(payload: GoalIn) {
    if (editing) {
      await updateMut.mutateAsync({ id: editing.id, p: payload });
    } else {
      await createMut.mutateAsync(payload);
    }
    closeDrawer();
  }

  const goals = goalsQ.data ?? [];
  const activeCount    = goals.filter((g) => g.status === 'active').length;
  const completedCount = goals.filter((g) => g.status === 'completed').length;

  const STATUS_TABS: { id: StatusFilter; label: string; count?: number }[] = [
    { id: 'active',    label: 'Active',    count: activeCount },
    { id: 'completed', label: 'Completed', count: completedCount },
    { id: 'all',       label: 'All' },
  ];

  return (
    <>
      <PageHeader
        title="Goals"
        eyebrow="GOALS · OKRs"
        subtitle="Link what you want to achieve to your habits and finances."
        action={
          <button
            type="button"
            onClick={openAdd}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              height: 36, padding: '0 16px', borderRadius: 10,
              font: '500 13px/1 var(--font-sans)', color: 'white',
              background: 'var(--grad-primary)',
              boxShadow: 'var(--elev-1), var(--elev-glow)',
              border: 'none', cursor: 'pointer',
            }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            Add goal
          </button>
        }
      />

      <RightDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editing ? 'Edit Goal' : 'New Goal'}
        width={500}
      >
        <GoalForm
          initial={editing}
          onSave={handleSave}
          onCancel={closeDrawer}
        />
      </RightDrawer>

      {/* Status filter tabs */}
      <div
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 2,
          padding: 3, borderRadius: 10, marginBottom: 24,
          background: 'var(--surface)', border: '1px solid var(--border-default)',
        }}
      >
        {STATUS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setStatusFilter(t.id)}
            style={{
              height: 28, padding: '0 14px', borderRadius: 8,
              font: '500 12px/1 var(--font-sans)',
              color: statusFilter === t.id ? 'var(--fg-1)' : 'var(--fg-4)',
              background: statusFilter === t.id ? 'var(--surface-elev)' : 'transparent',
              border: 0, cursor: 'pointer', transition: 'var(--transition)',
            }}
          >
            {t.label}{t.count != null && t.count > 0 ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {/* Loading */}
      {goalsQ.isLoading && (
        <div style={{ color: 'var(--fg-4)', textAlign: 'center', padding: '48px 0' }}>
          Loading goals…
        </div>
      )}

      {/* Empty state */}
      {!goalsQ.isLoading && goals.length === 0 && (
        <div
          style={{
            borderRadius: 20, padding: '48px 32px',
            background: 'var(--surface)', border: '1px solid var(--border-default)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 14 }}>🎯</div>
          <div style={{ font: '500 20px/1.3 var(--font-display)', color: 'var(--fg-1)', marginBottom: 8 }}>
            {statusFilter === 'completed' ? 'No completed goals yet' : 'No active goals'}
          </div>
          <p style={{ fontSize: 14, color: 'var(--fg-3)', maxWidth: 380, margin: '0 auto 24px' }}>
            {statusFilter === 'completed'
              ? 'Complete a goal and it will appear here.'
              : 'Set your first goal to give your habits and tracking a north star.'}
          </p>
          {statusFilter === 'active' && (
            <button
              type="button"
              onClick={openAdd}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                height: 38, padding: '0 18px', borderRadius: 10,
                font: '500 13px/1 var(--font-sans)', color: 'white',
                background: 'var(--grad-primary)', border: 'none', cursor: 'pointer',
              }}
            >
              <Plus style={{ width: 14, height: 14 }} />
              Add your first goal
            </button>
          )}
        </div>
      )}

      {/* Goal cards grid */}
      {goals.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onEdit={() => openEdit(goal)}
              onComplete={() => completeMut.mutateAsync(goal.id).then(() => undefined)}
              onAbandon={() => abandonMut.mutateAsync(goal.id).then(() => undefined)}
              onDelete={() => deleteMut.mutateAsync(goal.id).then(() => undefined)}
            />
          ))}
        </div>
      )}
    </>
  );
}
