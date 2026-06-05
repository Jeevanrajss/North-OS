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
// Goal types
// ---------------------------------------------------------------------------
export type GoalType = 'habit_streak' | 'habit_rate' | 'finance_save' | 'finance_spend' | 'custom';
export type GoalStatus = 'active' | 'completed' | 'paused' | 'abandoned';

export type Goal = {
  id: string;
  title: string;
  description: string | null;
  emoji: string;
  goal_type: GoalType;
  linked_id: string | null;
  linked_label: string | null;
  target_value: number | null;
  target_period_days: number | null;
  currency: string;
  current_value: number | null;
  target_date: string | null;
  status: GoalStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Computed
  progress_pct: number | null;
  computed_current: number | null;
  days_remaining: number | null;
  overdue: boolean;
  linked_missing: boolean;
};

export type GoalIn = {
  title: string;
  description?: string | null;
  emoji?: string;
  goal_type?: GoalType;
  linked_id?: string | null;
  linked_label?: string | null;
  target_value?: number | null;
  target_period_days?: number | null;
  currency?: string;
  current_value?: number | null;
  target_date?: string | null;
  sort_order?: number;
};

export type GoalPatch = Partial<GoalIn> & { status?: GoalStatus };

// ---------------------------------------------------------------------------
// Health types
// ---------------------------------------------------------------------------
export type HealthLog = {
  id: string;
  log_date: string;
  sleep_hours: number | null;
  energy_level: number | null;
  exercise_minutes: number | null;
  exercise_type: string | null;
  water_glasses: number | null;
  notes: string | null;
};

export type HealthLogIn = {
  sleep_hours?: number | null;
  energy_level?: number | null;
  exercise_minutes?: number | null;
  exercise_type?: string | null;
  water_glasses?: number | null;
  notes?: string | null;
};

export type HealthStats = {
  days_with_data: number;
  avg_sleep_hours: number | null;
  avg_energy_level: number | null;
  avg_exercise_minutes: number | null;
  exercise_days: number;
  total_water_glasses: number;
};

// ---------------------------------------------------------------------------
// Analytics types
// ---------------------------------------------------------------------------
export type AnalyticsSnapshot = {
  date: string;
  mood_score: number | null;
  habit_completion_rate: number | null;
  daily_expense: number | null;
  daily_income: number | null;
  journal_written: boolean | null;
  habits_done: number | null;
  habits_scheduled: number | null;
  sleep_hours: number | null;
  energy_level: number | null;
};

export type AnalyticsCorrelations = {
  days_analysed: number;
  avg_mood_score: number | null;
  avg_habit_completion: number | null;
  avg_daily_expense: number | null;
  low_mood_days: number;
  high_mood_days: number;
  zero_habit_days: number;
  perfect_habit_days: number;
  mood_vs_habit_completion: {
    mood_on_high_completion_days: number;
    mood_on_low_completion_days: number;
    delta: number;
    sample_high: number;
    sample_low: number;
  } | null;
  expense_vs_mood: {
    avg_spend_high_mood: number;
    avg_spend_low_mood: number;
    delta: number;
  } | null;
  journal_habit_correlation: {
    habit_rate_with_journal: number;
    habit_rate_without_journal: number;
    delta: number;
  } | null;
  sleep_vs_mood: {
    mood_good_sleep: number;
    mood_poor_sleep: number;
    delta: number;
  } | null;
  best_day_of_week: { day: string; avg_completion: number } | null;
  worst_day_of_week: { day: string; avg_completion: number } | null;
};

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

export type FinanceCategoryType = 'expense' | 'income' | 'both';

export type FinanceCategoryOut = {
  id: string;
  name: string;
  emoji: string;
  type: FinanceCategoryType;
  is_system: boolean;
  sort_order: number;
};

export type FinanceCategoryIn = {
  name: string;
  emoji: string;
  type: FinanceCategoryType;
};

// ---------------------------------------------------------------------------
// Account types
// ---------------------------------------------------------------------------
export type SmsTransactionOut = {
  id: string;
  source: 'android' | 'imessage';
  sender: string | null;
  raw_body: string;
  received_at: string;
  parsed_ok: boolean;
  txn_type: 'income' | 'expense' | null;
  amount: number | null;
  currency: string | null;
  payee: string | null;
  account: string | null;
  balance: number | null;
  txn_date: string | null;
  status: 'pending' | 'confirmed' | 'dismissed';
};

export type SmsDebugThread = {
  contact: string;
  sim: string;
  is_bank: boolean;
};

export type SmsDebugParseSample = {
  sender: string;
  body_preview: string;
  parsed_ok: boolean;
  parsed_type?: string;
  parsed_amount?: number;
};

export type SmsDebugResult = {
  error?: string;
  verdict?: string;
  threads?: SmsDebugThread[];
  parse_samples?: SmsDebugParseSample[];
  encryption_key_set?: boolean;
  [key: string]: unknown; // allow raw step fields
};

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
// Annual review
// ---------------------------------------------------------------------------
export type MonthlyAnnualPoint = {
  year_month: string;        // "YYYY-MM"
  active_days: number;
  total_entries: number;
  valence_avg: number | null;
  top_tags: string[];
};

export type AnnualResponse = {
  months: MonthlyAnnualPoint[];
};

// ---------------------------------------------------------------------------
// Mood-habit correlation
// ---------------------------------------------------------------------------
export type HabitMoodCorrelation = {
  habit_id: string;
  habit_name: string;
  habit_emoji: string;
  days_done: number;
  avg_mood_with: number | null;
  avg_mood_without: number | null;
  mood_lift: number | null;
};

export type MoodHabitResponse = {
  window_days: number;
  correlations: HabitMoodCorrelation[];
};

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
  trial_end_date: string | null; // YYYY-MM-DD
  post_trial_amount: number | null; // price after free trial ends
  monthly_equivalent: number;
  payment_type: PaymentType | null;
  account_name: string | null;
  category: string | null;
  notes: string | null;
  url: string | null;
  is_autopay: boolean;
  last_renewed_at: string | null; // YYYY-MM-DD — when user last confirmed manual payment
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
  trial_end_date?: string | null;
  post_trial_amount?: number | null;
  payment_type?: PaymentType | null;
  account_name?: string | null;
  category?: string | null;
  notes?: string | null;
  url?: string | null;
  is_autopay?: boolean;
};

export type SubscriptionPatch = Partial<SubscriptionIn>;

// ---------------------------------------------------------------------------
// Subscription billing forecast
// ---------------------------------------------------------------------------
export type ForecastMonth = {
  year_month: string;  // "YYYY-MM"
  total: number;
  currency: string;
  bill_count: number;
};

export type ForecastResponse = {
  months: ForecastMonth[];
};

export type UpcomingRenewal = {
  subscription: Subscription;
  days_until: number;
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
  // Phase 7 detection fields
  is_emi: boolean;
  is_tax_fee: boolean;
  is_cc_payment: boolean;
  is_investment: boolean;
  suggested_debt_id: string | null;
  suggested_debt_name: string | null;
  suggested_investment_id: string | null;
  suggested_investment_name: string | null;
  installment_info: string | null;
  skip_by_default: boolean;
  skip_reason: string | null;
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
// Notification types
// ---------------------------------------------------------------------------
export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

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

export type LLMHealthResult = {
  ok: boolean | null;   // null = not applicable (Anthropic)
  provider: string;
  host: string;
  models: string[];
  error: string | null;
  note: string | null;
};

export const api = {
  settings: {
    getAll: () => request<Record<string, string>>('/settings'),
    getProviders: () => request<Record<string, ProviderPreset>>('/settings/providers'),
    update: (settings: Record<string, string>) =>
      request<{ ok: boolean }>('/settings', { method: 'PUT', body: JSON.stringify({ settings }) }),
    testLLM: () => request<LLMTestResult>('/settings/test-llm', { method: 'POST' }),
    llmHealth: () => request<LLMHealthResult>('/settings/health'),
    listModels: () => request<{ models: string[]; error?: string }>('/settings/models'),
  },

  health: () => request<HealthResponse>('/health'),
  appVersion: () => request<{ version: string }>('/app-version'),
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
    stats: (windowDays = 30) =>
      request<StatsResponse>(`/journal/stats?days=${windowDays}`),
    annual: () =>
      request<AnnualResponse>('/journal/annual'),
    moodHabits: (days = 90) =>
      request<MoodHabitResponse>(`/journal/mood-habits?days=${days}`),
    export: (start: string, end: string) => {
      const url = `/api/v1/journal/export?start=${start}&end=${end}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = `journal_${start}_${end}.md`;
      a.click();
    },
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

    // --- Categories ---
    listCategories: () => request<FinanceCategoryOut[]>('/finance/categories'),
    createCategory: (payload: FinanceCategoryIn) =>
      request<FinanceCategoryOut>('/finance/categories', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateCategory: (id: string, patch: Partial<FinanceCategoryIn>) =>
      request<FinanceCategoryOut>(`/finance/categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    deleteCategory: (id: string) =>
      request<void>(`/finance/categories/${id}`, { method: 'DELETE' }),
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

  sms: {
    status: () => request<{
      imessage_available: boolean;
      android_webhook_url: string;
      imessage_db_path: string;
      httpsms_configured: boolean;
      httpsms_last_sync: string | null;
      httpsms_encryption_enabled?: boolean;
    }>('/sms/status'),
    pending: () => request<SmsTransactionOut[]>('/sms/pending'),
    scanImessage: (daysBack = 7) => request<{
      scanned: boolean;
      new_transactions: number;
      error_code?: string;
      error?: string;
      debug?: { total_messages_in_window: number; bank_sender_matches: number; ingested: number; error?: string };
    }>(`/sms/scan-imessage?days_back=${daysBack}`, { method: 'POST' }),
    syncHttpSms: () => request<{ synced: boolean; new_transactions: number; messages_checked: number; synced_at: string }>('/sms/sync-httpsms', { method: 'POST' }),
    debug: () => request<SmsDebugResult>('/sms/debug'),
    confirm: (id: string, category?: string | null) => request<{ status: string; transaction: Transaction }>(`/sms/pending/${id}/confirm`, { method: 'POST', body: JSON.stringify({ category: category ?? null }), headers: { 'Content-Type': 'application/json' } }),
    dismiss: (id: string) => request<{ status: string }>(`/sms/pending/${id}/dismiss`, { method: 'POST' }),
  },

  notifications: {
    unreadCount: () => request<{ count: number }>('/notifications/unread-count'),
    list: () => request<NotificationItem[]>('/notifications/'),
    markRead: (id: string) => request<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'POST' }),
    markAllRead: () => request<{ ok: boolean }>('/notifications/read-all', { method: 'POST' }),
    delete: (id: string) => request<{ ok: boolean }>(`/notifications/${id}`, { method: 'DELETE' }),
    clearRead: () => request<{ ok: boolean }>('/notifications/clear-read', { method: 'DELETE' }),
    triggerHabitCheck: () => request<{ created: number }>('/notifications/trigger/habit-check', { method: 'POST' }),
    triggerSubCheck: () => request<{ created: number }>('/notifications/trigger/sub-check', { method: 'POST' }),
    triggerMorningBriefing: () => request<{ created: number }>('/notifications/trigger/morning-briefing', { method: 'POST' }),
    triggerBudgetCheck: () => request<{ created: number }>('/notifications/trigger/budget-check', { method: 'POST' }),
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
    renew: (id: string) =>
      request<Subscription>(`/subscriptions/${id}/renew`, { method: 'POST' }),
    stats: () => request<SubscriptionStatsResponse>('/subscriptions/stats'),
    forecast: () => request<ForecastResponse>('/subscriptions/forecast'),
  },

  data: {
    wipe: () => request<{ ok: boolean; message: string }>('/data/wipe', { method: 'DELETE' }),
  },

  debt: {
    list: (status?: string) => request<any[]>(`/finance/debt${status ? `?status=${status}` : ''}`),
    create: (body: any) => request<any>('/finance/debt', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: any) => request<any>(`/finance/debt/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => request<void>(`/finance/debt/${id}`, { method: 'DELETE' }),
    payment: (id: string, body: { amount: number; payment_date: string; notes?: string | null }) =>
      request<any>(`/finance/debt/${id}/payment`, { method: 'POST', body: JSON.stringify(body) }),
    payments: (id: string) => request<any[]>(`/finance/debt/${id}/payments`),
    summary: () => request<{ active_count: number; total_outstanding: number; total_emi_monthly: number; total_principal: number }>('/finance/debt/summary'),
    payoffStrategy: () => request<any>('/finance/debt/payoff-strategy'),
  },

  investments: {
    list: () => request<any[]>('/finance/investments'),
    create: (body: any) => request<any>('/finance/investments', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: any) => request<any>(`/finance/investments/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => request<void>(`/finance/investments/${id}`, { method: 'DELETE' }),
    addEntry: (id: string, body: { amount: number; entry_date: string; entry_type: string; notes?: string | null }) =>
      request<any>(`/finance/investments/${id}/entry`, { method: 'POST', body: JSON.stringify(body) }),
    entries: (id: string) => request<any[]>(`/finance/investments/${id}/entries`),
    summary: () => request<any>('/finance/investments/summary'),
  },

  financialGoals: {
    list: () => request<any[]>('/finance/goals'),
    create: (body: any) => request<any>('/finance/goals', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: any) => request<any>(`/finance/goals/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => request<void>(`/finance/goals/${id}`, { method: 'DELETE' }),
    achieve: (id: string) => request<any>(`/finance/goals/${id}/achieve`, { method: 'POST' }),
  },

  advisor: {
    generate: () => request<{ advice: string; generated_at: string }>('/finance/advisor', { method: 'POST' }),
  },

  healthLog: {
    list: (days = 30) => request<HealthLog[]>(`/health-log/?days=${days}`),
    get: (date: string) => request<HealthLog | null>(`/health-log/${date}`),
    upsert: (date: string, body: HealthLogIn) =>
      request<HealthLog>(`/health-log/${date}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (date: string) => request<void>(`/health-log/${date}`, { method: 'DELETE' }),
    stats: (days = 30) => request<HealthStats>(`/health-log/stats?days=${days}`),
  },

  goals: {
    list: (status?: string) =>
      request<Goal[]>(`/goals/${status ? `?status=${status}` : ''}`),
    get: (id: string) => request<Goal>(`/goals/${id}`),
    create: (body: GoalIn) =>
      request<Goal>('/goals/', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: GoalPatch) =>
      request<Goal>(`/goals/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<void>(`/goals/${id}`, { method: 'DELETE' }),
    complete: (id: string) =>
      request<Goal>(`/goals/${id}/complete`, { method: 'POST' }),
    abandon: (id: string) =>
      request<Goal>(`/goals/${id}/abandon`, { method: 'POST' }),
  },

  analytics: {
    correlations: (days = 30) =>
      request<AnalyticsCorrelations>(`/analytics/correlations?days=${days}`),
    snapshots: (params: { from_date?: string; to_date?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.from_date) q.set('from_date', params.from_date);
      if (params.to_date)   q.set('to_date',   params.to_date);
      return request<AnalyticsSnapshot[]>(`/analytics/snapshots?${q.toString()}`);
    },
    backfill: (days = 90) =>
      request<{ processed: number }>(`/analytics/backfill?days=${days}`, { method: 'POST' }),
    computeToday: () =>
      request<{ ok: boolean; date: string }>('/analytics/compute-today', { method: 'POST' }),
  },
};
