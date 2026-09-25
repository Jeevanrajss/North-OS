import { test, expect } from './fixtures';

const MONTH = new Date().toLocaleString('en-US', { month: 'long' });

const PAGES: [string, RegExp][] = [
  ['/app', /Good (morning|afternoon|evening|night)/],
  ['/app/journal', new RegExp(MONTH)],
  ['/app/finance', /^Finance$/],
  ['/app/subscriptions', /^Subscriptions$/],
  ['/app/habits', /^Habits$/],
  ['/app/chat', /^AI Chat$/],
  ['/app/patterns', /^Patterns$/],
  ['/app/goals', /^Goals$/],
  ['/app/health', /^Health$/],
  ['/app/settings', /^Settings$/],
];

test.describe('every page loads cleanly on an empty database', () => {
  for (const [path, heading] of PAGES) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await page.waitForLoadState('networkidle');
    });
  }
});

test('sidebar navigates between modules', async ({ page }) => {
  await page.goto('/app');
  for (const label of ['Finance', 'Habits', 'Goals', 'Settings']) {
    await page.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/app/${label.toLowerCase()}$`));
    await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible();
  }
});

test('legacy routes redirect into the app shell', async ({ page }) => {
  await page.goto('/finance');
  await expect(page).toHaveURL(/\/app\/finance$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/app$/);
});
