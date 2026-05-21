import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Trash2, X } from 'lucide-react';
import { api, type NotificationItem } from '@/lib/api';

const TYPE_ICON: Record<string, string> = {
  morning_briefing: '☀️',
  habit_reminder:   '🔥',
  sub_alert:        '🔄',
  budget_warning:   '💰',
  finance_alert:    '💳',
  system:           '🖥️',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function requestBrowserPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// Auto-request on first load so the OS dialog appears without needing Settings
requestBrowserPermission();

function fireBrowserNotification(title: string, body: string, type: string, id: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const icon = '/icon-192.png';
  // Use the notification's own id as tag so duplicate OS popups are deduplicated.
  // silent: true suppresses the OS sound — the app plays its own audio instead.
  new Notification(title, { body, icon, tag: id, silent: true });
}

let _notifAudio: HTMLAudioElement | null = null;

function playNotificationSound() {
  if (localStorage.getItem('notif.sound_enabled') === 'false') return;
  try {
    if (!_notifAudio) {
      _notifAudio = new Audio('/notification.mp3');
      _notifAudio.volume = 0.6;
    }
    _notifAudio.currentTime = 0;
    _notifAudio.play().catch(() => {/* autoplay blocked — ignore */});
  } catch {
    // audio not supported
  }
}

export function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef<number>(-1);
  // Tracks every notification ID we have already fired a browser popup for.
  // Populated silently on first load so existing unread items never re-fire.
  const seenIdsRef = useRef<Set<string>>(new Set());

  // Poll unread count every 30s
  const { data: countData } = useQuery({
    queryKey: ['notif-count'],
    queryFn: api.notifications.unreadCount,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  // List — only fetch when panel is open
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: api.notifications.list,
    enabled: open,
    staleTime: 5_000,
  });

  const unread = countData?.count ?? 0;

  // Fire browser notification + sound only for genuinely new notifications.
  useEffect(() => {
    if (prevCountRef.current === -1) {
      // First poll — silently seed seenIdsRef with all current unread IDs
      // so they never trigger popups on subsequent polls.
      if (unread > 0) {
        api.notifications.list().then((notifs) => {
          notifs.filter((n) => !n.read).forEach((n) => seenIdsRef.current.add(n.id));
        }).catch(() => {});
      }
      prevCountRef.current = unread;
      return;
    }

    if (unread > prevCountRef.current) {
      // Count went up — fetch the full list and fire only for IDs we haven't seen yet.
      api.notifications.list().then((notifs) => {
        const newOnes = notifs.filter((n) => !n.read && !seenIdsRef.current.has(n.id));
        if (newOnes.length > 0) {
          playNotificationSound();
          newOnes.slice(0, 3).forEach((n) => {
            fireBrowserNotification(n.title, n.body, n.type, n.id);
          });
        }
        // Mark ALL current unread as seen so they won't fire again later.
        notifs.filter((n) => !n.read).forEach((n) => seenIdsRef.current.add(n.id));
      }).catch(() => {});
    }
    prevCountRef.current = unread;
  }, [unread]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markReadMut = useMutation({
    mutationFn: api.notifications.markRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notif-count'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllMut = useMutation({
    mutationFn: api.notifications.markAllRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notif-count'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: api.notifications.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notif-count'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const clearReadMut = useMutation({
    mutationFn: api.notifications.clearRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notif-count'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  function handleBellClick() {
    requestBrowserPermission();
    setOpen((v) => !v);
    if (!open) {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    }
  }

  function handleItemClick(item: NotificationItem) {
    if (!item.read) markReadMut.mutate(item.id);
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        type="button"
        onClick={handleBellClick}
        className="relative rounded-[10px] flex items-center justify-center transition-all"
        style={{
          width: 36, height: 36,
          background: open ? 'var(--surface)' : 'var(--glass-bg)',
          border: `1px solid var(--border-default)`,
          color: unread > 0 ? 'var(--fg-2)' : 'var(--fg-3)',
        }}
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span
            className="absolute flex items-center justify-center rounded-full text-white"
            style={{
              top: -5, right: -5,
              minWidth: 16, height: 16,
              padding: '0 4px',
              background: 'var(--accent-red)',
              boxShadow: '0 0 6px rgba(255,91,110,0.6)',
              fontSize: 9, fontWeight: 700,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="absolute right-0 z-[9999] flex flex-col"
          style={{
            top: 'calc(100% + 8px)',
            width: 360,
            maxHeight: 480,
            background: 'var(--surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between shrink-0"
            style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border-subtle)' }}
          >
            <span style={{ font: '500 14px/1 var(--font-display)', color: 'var(--fg-1)' }}>
              Notifications {unread > 0 && (
                <span style={{ fontSize: 11, color: 'var(--accent-red)', marginLeft: 4 }}>
                  {unread} unread
                </span>
              )}
            </span>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markAllMut.mutate()}
                  disabled={markAllMut.isPending}
                  title="Mark all as read"
                  style={{
                    padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                    background: 'none', border: '1px solid var(--border-default)',
                    color: 'var(--fg-3)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <CheckCheck className="w-3 h-3" /> All read
                </button>
              )}
              {items.some((i) => i.read) && (
                <button
                  type="button"
                  onClick={() => clearReadMut.mutate()}
                  disabled={clearReadMut.isPending}
                  title="Clear read notifications"
                  style={{
                    padding: '4px 6px', borderRadius: 6,
                    background: 'none', border: '1px solid var(--border-default)',
                    color: 'var(--fg-4)', cursor: 'pointer',
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  padding: '4px 6px', borderRadius: 6,
                  background: 'none', border: 'none',
                  color: 'var(--fg-4)', cursor: 'pointer',
                }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--fg-4)', fontSize: 13 }}>
                Loading…
              </div>
            )}
            {!isLoading && items.length === 0 && (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-4)' }}>All caught up</p>
              </div>
            )}
            {items.map((item) => (
              <div
                key={item.id}
                onClick={() => handleItemClick(item)}
                onMouseEnter={(e) => {
                  (e.currentTarget.querySelector('.notif-del') as HTMLElement)?.style.setProperty('opacity', '1');
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget.querySelector('.notif-del') as HTMLElement)?.style.setProperty('opacity', '0');
                }}
                style={{
                  display: 'flex', gap: 12, padding: '12px 16px',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: item.read ? 'transparent' : 'rgba(139,124,255,0.05)',
                  cursor: item.read ? 'default' : 'pointer',
                  transition: 'background 150ms',
                }}
              >
                {/* Icon */}
                <div
                  style={{
                    width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16,
                    background: item.read ? 'var(--surface-elev)' : 'rgba(139,124,255,0.12)',
                    border: `1px solid ${item.read ? 'var(--border-subtle)' : 'rgba(139,124,255,0.2)'}`,
                  }}
                >
                  {TYPE_ICON[item.type] ?? '🔔'}
                </div>
                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    font: `${item.read ? 400 : 500} 13px/1.3 var(--font-sans)`,
                    color: item.read ? 'var(--fg-3)' : 'var(--fg-1)',
                    marginBottom: 2,
                  }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--fg-4)', lineHeight: 1.4 }}>
                    {item.body}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--fg-disabled)', marginTop: 4 }}>
                    {timeAgo(item.created_at)}
                  </div>
                </div>
                {/* Delete */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); deleteMut.mutate(item.id); }}
                  className="notif-del"
                  style={{
                    padding: 4, background: 'none', border: 'none',
                    color: 'var(--fg-disabled)', cursor: 'pointer', flexShrink: 0,
                    opacity: 0,
                  }}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
