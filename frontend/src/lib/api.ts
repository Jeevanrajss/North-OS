// Minimal fetch client. All API calls route through /api (Vite proxy in dev).

const BASE = '/api/v1';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Health / AI (existing)
// ---------------------------------------------------------------------------
export type HealthResponse = {
  app: { name: string; version: string; env: string; timezone: string; currency: string };
  db: { ok: boolean; path: string; error: string | null };
  llm: {
    ok: boolean;
    provider?: string;
    host: string;
    chat_model?: string;
    fast_model?: string;
    embed_model?: string;
    models_available?: string[];
    chat_loaded?: boolean;
    embed_loaded?: boolean;
    error?: string;
  };
};

export type AiPingResponse = {
  model: string;
  response: string;
};

// ---------------------------------------------------------------------------
// Finance types
// ---------------------------------------------------------------------------
export type TransactionType = 'income' | 'expense' | 'transfer';

export type Transaction = {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  date: string; // YYYY-MM-DD
  category: string | null;
  account: string | null;
  payee: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TransactionIn = {
  type: TransactionType;
  amount: number;
  currency?: string;
  date: string;
  category?: string | null;
  account?: string | null;
  payee?: string | null;
  notes?: string | null;
};

export type CategoryStat = { category: string; total: number; count: number };

export type BudgetProgress = {
  category: string | null;
  budget: number;
  spent: number;
  pct: number;
};

export type MonthlySummary = {
  year: number;
  month: number;
  total_income: number;
  total_expense: number;
  net: number;
  by_category: CategoryStat[];
  transaction_count: number;
  budget_overall: BudgetProgress | null;
  budget_by_category: BudgetProgress[];
};

export type FinanceMeta = {
  expense_categories: string[];
  income_categories: string[];
  account_suggestions: string[];
  credit_card_options: string[];
  category_emoji: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Account types
// ---------------------------------------------------------------------------
export type AccountType = 'savings' | 'credit_card' | 'debit_card' | 'wallet' | 'upi' | 'cash';

export type Account = {
  id: string;
  name: string;          // auto-generated: "{bank} {variant}" or "{bank} {type}"
  nickname: string | null; // optional user label
  type: AccountType;
  bank: string | null;
  card_variant: string | null;
  last4: string | null;
  credit_limit: number | null;
  benefits_json: string | null;
  color: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AccountIn = {
  type: AccountType;
  bank?: string | null;
  card_variant?: string | null;
  nickname?: string | null;
  last4?: string | null;
  credit_limit?: number | null;
  benefits_json?: string | null;
  color?: string | null;
};

export type AccountPatch = {
  nickname?: string | null;
  bank?: string | null;
  card_variant?: string | null;
  last4?: string | null;
  credit_limit?: number | null;
  benefits_json?: string | null;
  color?: string | null;
  is_active?: boolean;
};

export type CardVariant = {
  variant: string;
  full_name: string;
  annual_fee: number;
  highlights: string[];
  perks: string[];
  cashback: Record<string, number>;
};

export type BankCatalog = Record<string, { credit: CardVariant[]; debit: CardVariant[] }>;

export type CardTipResponse = {
  tip: string | null;
  better_card: string | null;
  cashback_rate: number | null;
  current_rate: number | null;
};

// ---------------------------------------------------------------------------
// Budget types
// ---------------------------------------------------------------------------
export type BudgetOut = {
  id: string;
  year: number | null;
  month: number | null;
  category: string | null;
  amount: number;
  created_at: string;
  updated_at: string;
};

export type BudgetIn = {
  year?: number | null;
  month?: number | null;
  category?: string | null;
  amount: number;
};

// ---------------------------------------------------------------------------
// Journal types — mirror of app/schemas/journal.py
// ---------------------------------------------------------------------------
export type MoodCode = {
  code: string;
  label: string;
  emoji: string;
  valence: number; // -2..+2
  sort_order: number;
};

export type Tag = {
  name: string;
  seeded: boolean;
};

export type Entry = {
  id: string;
  day_date: string; // YYYY-MM-DD
  content_json: string; // JSON-stringified Tiptap doc
  content_text: string;
  created_at: string;
  updated_at: string;
};

export type EntryIn = {
  content_json: string;
  content_text: string;
};

export type Day = {
  date: string;
  mood_codes: string[];
  tags: string[];
  summary_highlights: string | null;
  summary_wins: string | null;
  summary_learnings: string | null;
  summary_gratitude: string | null;
  has_summary: boolean;
  entries: Entry[];
  created_at: string;
  updated_at: string;
};

export type DayPatch = {
  mood_codes?: string[];
  tags?: string[];
  summary_highlights?: string | null;
  summary_wins?: string | null;
  summary_learnings?: string | null;
  summary_gratitude?: string | null;
};

export type CalendarCell = {
  date: string;
  mood_codes: string[];
  valence_avg: number | null;
  entry_count: number;
  has_summary: boolean;
};

export type CalendarResponse = {
  start: string;
  end: string;
  cells: CalendarCell[];
};

export type TagSuggestionReason =
  | 'ok'
  | 'too_short'
  | 'llm_error'
  | 'parse_failed'
  | 'all_existing'
  | 'empty_response';

export type TagSuggestionResponse = {
  suggestions: string[];
  model: string;
  reason: TagSuggestionReason;
  raw: string | null;
};

export type DailyValencePoint = {
  date: string;
  valence_avg: number | null;
  entry_count: number;
};

export type TagCount = {
  name: string;
  count: number;
};

export type StatsResponse = {
  window_days: number;
  current_streak: number;
  longest_streak_in_window: number;
  active_days: number;
  total_entries: number;
  daily_valence: DailyValencePoint[];
  top_tags: TagCount[];
};

// Cap for the 3-mood limit (matches backend MAX_MOODS_PER_DAY).
export const MAX_MOODS_PER_DAY = 3;

// ---------------------------------------------------------------------------
// Habit types — mirror of app/schemas/habit.py
// ---------------------------------------------------------------------------
export type FrequencyKind = 'daily' | 'weekly';

export type Habit = {
  id: string;
  name: string;
  emoji: string;
  frequency_kind: FrequencyKind;
  frequency_target: number;
  weekdays: number[]; // ISO, 0=Mon..6=Sun. Empty for daily habits.
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type HabitIn = {
  name: string;
  emoji?: string;
  frequency_kind?: FrequencyKind;
  weekdays?: number[]; // required (non-empty) when frequency_kind is weekly
};

export type HabitPatch = {
  name?: string;
  emoji?: string;
  frequency_kind?: FrequencyKind;
  weekdays?: number[];
  sort_order?: number;
};

export type HabitCheckin = {
  id: string;
  habit_id: string;
  day_date: string; // YYYY-MM-DD
  value: number;
  note: string | null;
  created_at: string;
};

export type HabitTodayRow = {
  habit: Habit;
  done: boolean;
  checkin: HabitCheckin | null;
};

export type HabitsTodayResponse = {
  date: string;
  habits: HabitTodayRow[];
};

export type HabitStatRow = {
  habit_id: string;
  current_streak: number;
  longest_streak_in_window: number;
  completion_rate: number;
  done_count: number;
  last7: boolean[]; // oldest → newest
};

export type HabitDayDoneBit = {
  date: string; // YYYY-MM-DD
  any_done: boolean;
  done_count: number;
};

export type HabitStatsResponse = {
  window_days: number;
  per_habit: HabitStatRow[];
  overall_current_streak: number;
  overall_longest_streak_in_window: number;
  daily_any_done: HabitDayDoneBit[]; // last 7 days, oldest → newest
};

// --- Detail view ----------------------------------------------------------
export type HabitDayBit = {
  date: string; // YYYY-MM-DD
  done: boolean;
  value: number;
  note_preview: string | null;
};

export type HabitDowBucket = {
  weekday: number; // 0=Mon..6=Sun
  done_count: number;
  opportunities: number;
  completion_rate: number; // 0..1
};

export type HabitMonthlyPoint = {
  year_month: string; // "YYYY-MM"
  done_count: number;
  opportunities: number;
  completion_rate: number;
};

export type HabitDetailResponse = {
  habit: Habit;
  window_days: number;
  start: string;
  end: string;
  daily: HabitDayBit[];
  stats: HabitStatRow;
  dow: HabitDowBucket[]; // length 7, Mon..Sun
  monthly: HabitMonthlyPoint[]; // last 12 months, oldest → newest
  recent_notes: HabitCheckin[];
};

// ---------------------------------------------------------------------------
// Subscription types — mirror of app/schemas/subscription.py
// ---------------------------------------------------------------------------
export type BillingCycle = 'monthly' | 'yearly' | 'quarterly' | 'weekly';
export type PaymentType = 'credit_card' | 'debit_card' | 'upi' | 'net_banking' | 'wallet' | 'other';

export const CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: '/ mo',
  yearly: '/ yr',
  quarterly: '/ qtr',
  weekly: '/ wk',
};

export const MONTHLY_MULT: Record<BillingCycle, number> = {
  weekly: 52 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

export type Subscription = {
  id: string;
  name: string;
  emoji: string;
  amount: number;
  currency: string;
  billing_cycle: BillingCycle;
  next_billing_date: string; // YYYY-MM-DD
  monthly_equivalent: number;
  payment_type: PaymentType | null;
  account_name: string | null;
  category: string | null;
  notes: string | null;
  url: string | null;
  paused_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SubscriptionIn = {
  name: string;
  emoji?: string;
  amount: number;
  currency?: string;
  billing_cycle?: BillingCycle;
  next_billing_date: string;
  payment_type?: PaymentType | null;
  account_name?: string | null;
  category?: string | null;
  notes?: string | null;
  url?: string | null;
};

export type SubscriptionPatch = Partial<SubscriptionIn>;

export type UpcomingRenewal = {
  subscription: Subscription;
  days_until: number;
};

export type JournalSearchResult = {
  entry_id: string;
  day_date: string; // YYYY-MM-DD
  snippet: string;
  score: number;
};

export type SubscriptionStatsResponse = {
  active_count: number;
  monthly_total: number;
  yearly_total: number;
  upcoming_30d: UpcomingRenewal[];
};

// ---------------------------------------------------------------------------
// Import / Report types
// ---------------------------------------------------------------------------
export type ImportPreviewRow = {
  row_index: number;
  date: string;
  description: string;
  amount: number;
  tx_type: 'income' | 'expense';
  suggested_category: string;
  is_duplicate: boolean;
  duplicate_txn_id: string | null;
};

export type ImportPreviewResponse = {
  bank_detected: string | null;
  bank_key: string | null;
  needs_column_mapping: boolean;
  available_columns: string[];
  rows: ImportPreviewRow[];
  total_rows: number;
  duplicate_count: number;
};

export type ColumnMapping = {
  date: string;
  description: string;
  debit?: string;
  credit?: string;
  amount?: string;
};

export type ConfirmRow = {
  row_index: number;
  date: string;
  description: string;
  amount: number;
  tx_type: string;
  category: string;
  notes?: string;
  include: boolean;
};

export type ImportConfirmRequest = {
  account_id: string;
  account_name: string;
  rows: ConfirmRow[];
};

export type ImportConfirmResponse = {
  imported: number;
  skipped: number;
};

export type ReportCategoryStat = {
  category: string;
  total: number;
  count: number;
};

export type ReportBudgetRow = {
  category: string | null;
  budget: number;
  spent: number;
  pct: number;
};

export type MonthlyReport = {
  year: number;
  month: number;
  total_income: number;
  total_expense: number;
  net: number;
  savings_rate: number;
  transaction_count: number;
  by_category: ReportCategoryStat[];
  budget_overall: ReportBudgetRow | null;
  budget_by_category: ReportBudgetRow[];
  transactions: {
    id: string;
    date: string;
    type: string;
    amount: number;
    category: string | null;
    account: string | null;
    payee: string | null;
    notes: string | null;
  }[];
};

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Settings / AI provider types
// ---------------------------------------------------------------------------
export type ProviderPreset = {
  label: string;
  emoji: string;
  api_base: string;
  needs_key: boolean;
  is_anthropic: boolean;
  suggested_chat: string[];
  suggested_embed: string | null;
  embed_supported: boolean;
};

export type LLMTestResult = {
  ok: boolean;
  provider: string;
  model: string;
  response: string | null;
  error: string | null;
};

export const api = {
  settings: {
    getAll: () => request<Record<string, string>>('/settings'),
    getProviders: () => request<Record<string, ProviderPreset>>('/settings/providers'),
    update: (settings: Record<string, string>) =>
      request<{ ok: boolean }>('/settings', { method: 'PUT', body: JSON.stringify({ settings }) }),
    testLLM: () => request<LLMTestResult>('/settings/test-llm', { method: 'POST' }),
    listModels: () => request<{ models: string[]; error?: string }>('/settings/models'),
  },

  health: () => request<HealthResponse>('/health'),
  aiPing: (
    prompt: string,
    opts?: { system?: string; purpose?: string; temperature?: number; max_tokens?: number },
  ) =>
    request<AiPingResponse>('/ai/ping', {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        purpose: opts?.purpose ?? 'chat',
        system: opts?.system,
        temperature: opts?.temperature,
        max_tokens: opts?.max_tokens,
      }),
    }),

  journal: {
    listMoods: () => request<MoodCode[]>('/journal/moods'),
    listTags: () => request<Tag[]>('/journal/tags'),
    calendar: (start: string, end: string) =>
      request<CalendarResponse>(
        `/journal/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      ),
    getDay: (date: string) => request<Day>(`/journal/days/${date}`),
    patchDay: (date: string, patch: DayPatch) =>
      request<Day>(`/journal/days/${date}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    createEntry: (date: string, payload: EntryIn) =>
      request<Entry>(`/journal/days/${date}/entries`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateEntry: (entryId: string, payload: EntryIn) =>
      request<Entry>(`/journal/entries/${entryId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    deleteEntry: (entryId: string) =>
      request<void>(`/journal/entries/${entryId}`, { method: 'DELETE' }),
    suggestDayTags: (date: string) =>
      request<TagSuggestionResponse>(`/journal/days/${date}/suggest-tags`, {
        method: 'POST',
      }),
    summarize: (date: string) =>
      request<Day>(`/journal/days/${date}/summarize`, { method: 'POST' }),
    search: (query: string, limit = 5) =>
      request<JournalSearchResult[]>('/journal/search', {
        method: 'POST',
        body: JSON.stringify({ query, limit }),
      }),
    stats: (windowDays = 30) =>
      request<StatsResponse>(`/journal/stats?days=${windowDays}`),
  },

  habits: {
    list: (includeArchived = false) =>
      request<Habit[]>(`/habits${includeArchived ? '?include_archived=true' : ''}`),
    create: (payload: HabitIn) =>
      request<Habit>('/habits', { method: 'POST', body: JSON.stringify(payload) }),
    get: (id: string) => request<Habit>(`/habits/${id}`),
    patch: (id: string, patch: HabitPatch) =>
      request<Habit>(`/habits/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    archive: (id: string) => request<Habit>(`/habits/${id}`, { method: 'DELETE' }),
    restore: (id: string) => request<Habit>(`/habits/${id}/restore`, { method: 'POST' }),
    today: (date?: string) =>
      request<HabitsTodayResponse>(
        `/habits/today${date ? `?date=${encodeURIComponent(date)}` : ''}`,
      ),
    stats: (days = 30) => request<HabitStatsResponse>(`/habits/stats?days=${days}`),
    detail: (id: string, days = 90) =>
      request<HabitDetailResponse>(`/habits/${id}/detail?days=${days}`),
    listCheckins: (habitId: string, from: string, to: string) =>
      request<HabitCheckin[]>(
        `/habits/${habitId}/checkins?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    tick: (habitId: string, date: string, payload?: { value?: number; note?: string | null }) =>
      request<HabitCheckin>(`/habits/${habitId}/checkins/${date}`, {
        method: 'PUT',
        body: JSON.stringify(payload ?? {}),
      }),
    untick: (habitId: string, date: string) =>
      request<void>(`/habits/${habitId}/checkins/${date}`, { method: 'DELETE' }),
  },

  ai: {
    habitInsights: () =>
      request<{ insights: string[]; model: string }>('/ai/habit-insights', { method: 'POST' }),
    subscriptionInsights: () =>
      request<{ insights: string[]; model: string }>('/ai/subscription-insights', { method: 'POST' }),
    chat: (messages: { role: 'user' | 'assistant'; content: string }[]) =>
      request<{ response: string }>('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ messages }),
      }),
  },

  finance: {
    meta: () => request<FinanceMeta>('/finance/meta'),
    list: (year?: number, month?: number) => {
      const params = new URLSearchParams();
      if (year !== undefined) params.set('year', String(year));
      if (month !== undefined) params.set('month', String(month));
      const qs = params.toString();
      return request<Transaction[]>(`/finance/transactions${qs ? `?${qs}` : ''}`);
    },
    create: (payload: TransactionIn) =>
      request<Transaction>('/finance/transactions', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    update: (id: string, patch: Partial<TransactionIn>) =>
      request<Transaction>(`/finance/transactions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    delete: (id: string) =>
      request<void>(`/finance/transactions/${id}`, { method: 'DELETE' }),
    summary: (year: number, month: number) =>
      request<MonthlySummary>(`/finance/summary/${year}/${month}`),
    insights: () =>
      request<{ insights: string[]; model: string }>('/finance/insights', { method: 'POST' }),
    // Budgets
    listBudgets: (year?: number, month?: number) => {
      const params = new URLSearchParams();
      if (year !== undefined) params.set('year', String(year));
      if (month !== undefined) params.set('month', String(month));
      const qs = params.toString();
      return request<BudgetOut[]>(`/finance/budgets${qs ? `?${qs}` : ''}`);
    },
    upsertBudget: (payload: BudgetIn) =>
      request<BudgetOut>('/finance/budgets', { method: 'POST', body: JSON.stringify(payload) }),
    deleteBudget: (id: string) =>
      request<void>(`/finance/budgets/${id}`, { method: 'DELETE' }),

    // --- Import ---
    importBanks: () =>
      request<{ banks: { key: string; name: string }[] }>('/finance/import/banks'),
    importPreview: (form: FormData) =>
      fetch('/api/v1/finance/import/preview', { method: 'POST', body: form }).then(async (r) => {
        if (!r.ok) { const b = await r.text(); throw new Error(`API ${r.status}: ${b}`); }
        return r.json() as Promise<ImportPreviewResponse>;
      }),
    importConfirm: (payload: ImportConfirmRequest) =>
      request<ImportConfirmResponse>('/finance/import/confirm', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    // --- Reports ---
    report: (year: number, month: number) =>
      request<MonthlyReport>(`/finance/report/${year}/${month}`),
    reportExportUrl: (year: number, month: number, format: 'csv' | 'pdf') =>
      `/api/v1/finance/report/${year}/${month}/export?format=${format}`,
  },

  accounts: {
    list: (includeInactive = false) =>
      request<Account[]>(`/accounts${includeInactive ? '?include_inactive=true' : ''}`),
    create: (payload: AccountIn) =>
      request<Account>('/accounts', { method: 'POST', body: JSON.stringify(payload) }),
    get: (id: string) => request<Account>(`/accounts/${id}`),
    update: (id: string, patch: AccountPatch) =>
      request<Account>(`/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    delete: (id: string) => request<void>(`/accounts/${id}`, { method: 'DELETE' }),
    banks: () => request<{ banks: string[]; wallets: string[] }>('/accounts/banks'),
    catalog: () => request<BankCatalog>('/accounts/catalog'),
    bankCatalog: (bank: string) =>
      request<{ credit: CardVariant[]; debit: CardVariant[] }>(
        `/accounts/catalog/${encodeURIComponent(bank)}`,
      ),
    cardTip: (payload: { category: string; account: string; amount: number }) =>
      request<CardTipResponse>('/accounts/card-tip', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },

  subscriptions: {
    list: (includeCancelled = false) =>
      request<Subscription[]>(
        `/subscriptions${includeCancelled ? '?include_cancelled=true' : ''}`,
      ),
    create: (payload: SubscriptionIn) =>
      request<Subscription>('/subscriptions', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    patch: (id: string, patch: SubscriptionPatch) =>
      request<Subscription>(`/subscriptions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    cancel: (id: string) =>
      request<Subscription>(`/subscriptions/${id}`, { method: 'DELETE' }),
    restore: (id: string) =>
      request<Subscription>(`/subscriptions/${id}/restore`, { method: 'POST' }),
    pause: (id: string) =>
      request<Subscription>(`/subscriptions/${id}/pause`, { method: 'POST' }),
    unpause: (id: string) =>
      request<Subscription>(`/subscriptions/${id}/unpause`, { method: 'POST' }),
    stats: () => request<SubscriptionStatsResponse>('/subscriptions/stats'),
  },
};
