// Light / dark / follow-the-system theme. The choice lives in localStorage
// (per device, like any appearance setting); index.html applies it before the
// first paint so the app never flashes the wrong theme.
import { useSyncExternalStore } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const KEY = 'northos.theme';
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const listeners = new Set<() => void>();

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // storage unavailable — fall through to the default
  }
  return 'system';
}

let pref: ThemePref = readPref();

export function resolveTheme(p: ThemePref = pref): Theme {
  if (p === 'system') return media?.matches === false ? 'light' : 'dark';
  return p;
}

function apply() {
  document.documentElement.dataset.theme = resolveTheme();
  listeners.forEach((l) => l());
}

export function setThemePref(next: ThemePref) {
  pref = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // still applied for this session
  }
  apply();
}

// Follow macOS appearance changes live while on "system".
media?.addEventListener('change', () => {
  if (pref === 'system') apply();
});

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Current preference and the theme actually shown. */
export function useTheme(): { pref: ThemePref; theme: Theme; setPref: (p: ThemePref) => void } {
  const snapshot = useSyncExternalStore(subscribe, () => `${pref}:${resolveTheme()}`);
  const [p, t] = snapshot.split(':') as [ThemePref, Theme];
  return { pref: p, theme: t, setPref: setThemePref };
}

apply();
