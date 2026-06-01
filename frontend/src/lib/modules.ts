// Module configuration — defines all toggleable features of the app.
// Dashboard is always on and not included here.

export type ModuleId = 'journal' | 'finance' | 'subscriptions' | 'habits' | 'chat' | 'patterns' | 'goals';

export interface ModuleConfig {
  id: ModuleId;
  label: string;
  description: string;
  icon: string;
  route: string;
}

export const MODULE_CONFIGS: ModuleConfig[] = [
  {
    id: 'journal',
    label: 'Journal',
    description: 'Daily notes, reflections, and writing streaks.',
    icon: '📓',
    route: '/app/journal',
  },
  {
    id: 'finance',
    label: 'Finance',
    description: 'Track income, expenses, and SMS-based transactions.',
    icon: '💳',
    route: '/app/finance',
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    description: 'Monitor recurring payments and upcoming renewals.',
    icon: '🔄',
    route: '/app/subscriptions',
  },
  {
    id: 'habits',
    label: 'Habits',
    description: 'Build daily habits and maintain streaks.',
    icon: '✅',
    route: '/app/habits',
  },
  {
    id: 'chat',
    label: 'AI Chat',
    description: 'Chat with your local or cloud AI assistant.',
    icon: '💬',
    route: '/app/chat',
  },
  {
    id: 'patterns',
    label: 'Patterns',
    description: 'Cross-module correlation charts — mood, habits, and spending over time.',
    icon: '📊',
    route: '/app/patterns',
  },
  {
    id: 'goals',
    label: 'Goals',
    description: 'Set personal goals linked to your habits and finances, and track progress.',
    icon: '🎯',
    route: '/app/goals',
  },
];

export const ALL_MODULE_IDS: ModuleId[] = MODULE_CONFIGS.map((m) => m.id);

const STORAGE_KEY = 'enabled_modules';

export function readEnabledModules(): Set<ModuleId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set(ALL_MODULE_IDS); // default: all on
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set(ALL_MODULE_IDS);
    return new Set((parsed as string[]).filter((id): id is ModuleId =>
      ALL_MODULE_IDS.includes(id as ModuleId),
    ));
  } catch {
    return new Set(ALL_MODULE_IDS);
  }
}

export function writeEnabledModules(enabled: Set<ModuleId>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...enabled]));
}
