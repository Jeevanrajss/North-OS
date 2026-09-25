import { test, expect, unique } from './fixtures';

test('add a subscription and it appears with its price', async ({ page, api }) => {
  const name = unique('StreamBox');
  await page.goto('/app/subscriptions');
  await page.getByRole('button', { name: 'Add subscription' }).click();
  await page.getByPlaceholder('Subscription name').fill(name);
  await page.getByPlaceholder('0.00').first().fill('499');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(page.getByText(name).first()).toBeVisible();
  const sub = (await (await api.get('subscriptions')).json()).find((s: any) => s.name === name);
  expect(sub).toMatchObject({ amount: 499, billing_cycle: 'monthly' });
});

test('create a custom goal', async ({ page, api }) => {
  const title = unique('Read 12 books');
  await page.goto('/app/goals');
  await page.getByRole('button', { name: /Add goal|Add your first goal/ }).first().click();
  await page.getByPlaceholder('Goal title').fill(title);
  await page.getByRole('button', { name: 'Add Goal', exact: true }).click();

  await expect(page.getByText(title)).toBeVisible();
  expect((await (await api.get('goals/')).json()).some((g: any) => g.title === title)).toBe(true);
});

test('settings page loads every section without server errors', async ({ page }) => {
  // Regression: GET /sms/status returned 500 and the fixture fails on any 5xx.
  await page.goto('/app/settings');
  for (const section of ['Profile', 'Connection', 'Phone']) {
    await expect(page.getByRole('heading', { name: section, exact: true }).first()).toBeVisible();
  }
  await page.waitForLoadState('networkidle');
});

test('pairing a phone shows a one-time code and the paired device appears', async ({ page, api }) => {
  await page.goto('/app/settings');
  await page.getByRole('button', { name: 'Pair a phone' }).click();
  const code = (await page.getByText(/^\d{6}$/).first().textContent())!.trim();
  expect(code).toMatch(/^\d{6}$/);

  // Claim it the way the phone does (through the same backend).
  const claim = await api.post('pair/claim', { data: { code, device_name: 'E2E phone' } });
  expect(claim.status()).toBe(200);
  await expect(page.getByText('Paired E2E phone')).toBeVisible({ timeout: 10_000 }); // panel polls every 3 s

  expect((await api.post('pair/claim', { data: { code, device_name: 'again' } })).status()).toBe(401); // single use

  // Remove just that phone from the list.
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Remove E2E phone' }).click();
  await expect(page.getByText('Removed E2E phone')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove E2E phone' })).toHaveCount(0);
});

test('AI chat reports the model is offline instead of crashing', async ({ page, expectedErrors }) => {
  expectedErrors.push(/503/, /Cannot reach LLM server/);
  await page.goto('/app/chat');
  const box = page.getByPlaceholder(/Ask (me )?anything/).last();
  await box.fill('How much did I spend this month?');
  await box.press('Enter');
  // 503 from the backend is expected (LLM unreachable in E2E) — the UI must say so.
  await expect(page.getByText(/couldn.t|unavailable|reach|offline|error/i).last()).toBeVisible({ timeout: 10_000 });
});
