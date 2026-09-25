// Rupee formatting with Indian digit grouping (₹1,10,000).

const whole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const paise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,000 — whole rupees. */
export function inr(n: number): string {
  return whole.format(n);
}

/** ₹333.33 — keeps paise only when there are any (split shares), ₹100 otherwise. */
export function inrExact(n: number): string {
  return Number.isInteger(Math.round(n * 100) / 100) ? whole.format(n) : paise.format(n);
}

/** One person's share of [amount] when [shares] of [totalShares] are theirs, to the paisa. */
export function shareOf(amount: number, shares: number, totalShares: number): number {
  if (totalShares <= 0) return 0;
  return Math.round((amount * shares * 100) / totalShares) / 100;
}
