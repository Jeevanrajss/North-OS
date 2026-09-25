import type { Page } from '@playwright/test';
import { test, expect, today, unique } from './fixtures';

async function seedDinner(api: any, amount = 1000) {
  const payee = unique('Dinner');
  const t = await (await api.post('finance/transactions', { data: { type: 'expense', amount, date: today(), payee, category: 'Food & Dining' } })).json();
  const names = ['Asha', 'Bala', 'Chitra', 'Dev', 'Esha'].map((n) => unique(n));
  for (const name of names) await api.post('contacts', { data: { name } });
  return { txn: t, payee, names };
}

async function more(page: Page, name: string, times: number) {
  for (let i = 0; i < times; i++) await page.getByRole('button', { name: `One share more for ${name}` }).click();
}

test('split a transaction by shares from the list, then see and settle it in Splits', async ({ page, api }) => {
  const { payee, names: [asha, bala, glenn, dev, esha] } = await seedDinner(api);
  await page.goto('/app/finance');

  const row = page.locator('div.group').filter({ hasText: payee }).first();
  await row.hover();
  await row.getByRole('button', { name: 'Split transaction' }).click();

  // The dinner example: 10 shares of ₹100, ₹900 owed to you.
  await more(page, asha, 2);
  await more(page, bala, 1);
  await more(page, glenn, 1);
  await more(page, dev, 3);
  await more(page, esha, 2);
  await expect(page.getByText('10 shares')).toBeVisible();
  await expect(page.getByText('₹100 each')).toBeVisible();
  await expect(page.getByTestId('owed-total')).toHaveText('₹900');
  await page.getByRole('button', { name: 'Save split · ₹900 owed to you' }).click();
  await expect(page.getByText(/Split saved · ₹900 owed by 5 people/)).toBeVisible();

  await page.getByRole('button', { name: 'Splits', exact: true }).click();
  const card = page.locator('.card').filter({ hasText: dev }).first();
  await expect(card).toContainText('₹300');
  await card.getByRole('button', { expanded: false }).click();
  await expect(card).toContainText('3 shares · of ₹1,000');

  page.once('dialog', (d) => d.accept());
  await card.getByRole('button', { name: `${dev} paid all ₹300` }).click();
  await expect(page.getByText(`${dev} is all settled`)).toBeVisible();
  await expect(page.locator('.card').filter({ hasText: dev })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Paid back' }).click();
  await expect(page.getByText(`${dev} · ₹300`)).toBeVisible();
});

test('adding an expense with "Split with friends" opens the split for it', async ({ page }) => {
  const payee = unique('Team lunch');
  await page.goto('/app/finance');
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await page.getByPlaceholder('0.00').fill('600');
  await page.getByPlaceholder('e.g. Swiggy').fill(payee);
  await page.getByLabel(/Split with friends/).check();
  await page.getByRole('button', { name: 'Add & split' }).click();
  await expect(page.getByText('Split transaction')).toBeVisible();
  await expect(page.locator('aside').filter({ hasText: 'Split transaction' })).toContainText(payee);
});

test('theme toggle cycles system → light → dark and survives a reload', async ({ page }) => {
  await page.goto('/app');
  const html = page.locator('html');
  const toggle = page.getByRole('button', { name: /^Theme:/ });

  await page.evaluate(() => localStorage.setItem('northos.theme', 'system'));
  await page.reload();
  await toggle.click(); // → light
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(245, 246, 250)');

  await toggle.click(); // → dark
  await expect(html).toHaveAttribute('data-theme', 'dark');
});

test('Settings → Appearance picks the theme', async ({ page }) => {
  await page.goto('/app/settings');
  await page.getByRole('radio', { name: /Light/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('radio', { name: /Dark/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

// Every visible piece of text must stand out from what's behind it. Catches
// the "white text on a white card" class of bug in either theme. 3:1 is the
// floor for any text; body copy is designed to 4.5:1 via the tokens.
for (const theme of ['light', 'dark'] as const) {
  test(`all pages are readable in ${theme} mode`, async ({ page, api }) => {
    await seedDinner(api);
    await page.addInitScript((t) => localStorage.setItem('northos.theme', t), theme);
    const failures: string[] = [];
    for (const path of ['/app', '/app/finance', '/app/habits', '/app/journal', '/app/subscriptions', '/app/goals', '/app/patterns', '/app/chat', '/app/settings']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const bad = await page.evaluate(() => {
        const parse = (c: string) => {
          const m = c.match(/rgba?\(([^)]+)\)/);
          if (!m) return null;
          const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
          return { r, g, b, a };
        };
        const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
          const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const bgOf = (el: Element | null): { r: number; g: number; b: number } => {
          for (let e = el; e; e = e.parentElement) {
            const cs = getComputedStyle(e);
            if (cs.backgroundImage !== 'none') return { r: -1, g: 0, b: 0 }; // gradient/image — skip
            const c = parse(cs.backgroundColor);
            if (c && c.a > 0.85) return c;
          }
          return parse(getComputedStyle(document.body).backgroundColor)!;
        };
        const out: string[] = [];
        const walker = document.createTreeWalker(document.querySelector('#root')!, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const text = n.textContent?.trim();
          const el = n.parentElement;
          if (!text || !el || !/[\p{L}\p{N}]/u.test(text)) continue; // emoji-only: not text contrast
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || Number(cs.opacity) < 0.5) continue;
          if (el.closest('[aria-hidden="true"], button:disabled, [disabled]')) continue;
          if (cs.webkitTextFillColor && cs.webkitTextFillColor.includes('0, 0, 0, 0')) continue; // gradient text
          const fg = parse(cs.color);
          const bg = bgOf(el);
          if (!fg || bg.r < 0 || fg.a < 0.5) continue;
          const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
          const ratio = (hi + 0.05) / (lo + 0.05);
          if (ratio < 3) out.push(`"${text.slice(0, 40)}" ${ratio.toFixed(2)}:1`);
        }
        return [...new Set(out)].slice(0, 15);
      });
      failures.push(...bad.map((b) => `${path}: ${b}`));
    }
    expect(failures, `low-contrast text in ${theme} mode`).toEqual([]);
  });
}
