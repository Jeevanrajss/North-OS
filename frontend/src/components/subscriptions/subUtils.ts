import type { BillingCycle, PaymentType } from '@/lib/api';

export function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function urgencyClass(days: number): string {
  if (days < 0) return 'text-red-400';
  if (days <= 7) return 'text-amber-400';
  if (days <= 30) return 'text-yellow-300/80';
  return 'text-ink-500';
}

export function describeDaysUntil(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Tomorrow';
  return `in ${days}d`;
}

export const CYCLE_OPTS: { value: BillingCycle; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'weekly', label: 'Weekly' },
];

export const CURRENCY_OPTS: { value: string; label: string }[] = [
  { value: 'INR', label: '₹ INR — Indian Rupee' },
  { value: 'USD', label: '$ USD — US Dollar' },
  { value: 'EUR', label: '€ EUR — Euro' },
  { value: 'GBP', label: '£ GBP — British Pound' },
  { value: 'AUD', label: 'A$ AUD — Australian Dollar' },
  { value: 'CAD', label: 'C$ CAD — Canadian Dollar' },
  { value: 'SGD', label: 'S$ SGD — Singapore Dollar' },
  { value: 'JPY', label: '¥ JPY — Japanese Yen' },
];

export const PAYMENT_TYPE_OPTS: { value: PaymentType; label: string }[] = [
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'debit_card', label: 'Debit Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'net_banking', label: 'Net Banking' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'other', label: 'Other' },
];

export const PAYMENT_TYPE_LABELS: Record<string, string> = {
  credit_card: 'Credit Card',
  debit_card: 'Debit Card',
  upi: 'UPI',
  net_banking: 'Net Banking',
  wallet: 'Wallet',
  other: 'Other',
};

export const ACCOUNT_SUGGESTIONS = [
  // Banks (credit/debit)
  'HDFC', 'ICICI', 'IDFC First', 'SBI', 'Axis', 'Kotak', 'Yes Bank',
  'RBL', 'IndusInd', 'Federal', 'Amex', 'Citi',
  // UPI / Wallets
  'Amazon Pay', 'PhonePe', 'Google Pay', 'Paytm', 'BHIM',
];

export const CATEGORIES = [
  'Streaming',
  'Music',
  'Gaming',
  'Software',
  'Cloud',
  'Fitness',
  'News',
  'Utilities',
  'Shopping',
  'Other',
];
