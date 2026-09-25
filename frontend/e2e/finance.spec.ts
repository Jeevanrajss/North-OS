import { test, expect, unique } from './fixtures';

test('add an expense through the form, see it listed, then delete it', async ({ page, api }) => {
  const payee = unique('E2E Cafe');
  await page.goto('/app/finance');

  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await page.getByPlaceholder('0.00').fill('321');
  await page.getByRole('combobox').filter({ hasText: 'Select category' }).selectOption('Food & Dining');
  await page.getByPlaceholder('e.g. Swiggy').fill(payee);
  await page.getByRole('button', { name: 'Add Transaction', exact: true }).click();

  const row = page.locator('div.group').filter({ hasText: payee }).first();
  await expect(row).toBeVisible();

  const saved = (await (await api.get('finance/transactions')).json()).find((t: any) => t.payee === payee);
  expect(saved).toMatchObject({ amount: 321, category: 'Food & Dining', type: 'expense' });

  page.once('dialog', (d) => d.accept());
  await row.hover();
  await row.getByRole('button', { name: 'Delete transaction' }).click();
  await expect(page.getByText(payee)).toHaveCount(0);
  const after = (await (await api.get('finance/transactions')).json()).find((t: any) => t.payee === payee);
  expect(after).toBeUndefined();
});

test('a transaction added via the API shows on the finance overview', async ({ page, api }) => {
  const payee = unique('Salary Co');
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  await api.post('finance/transactions', { data: { type: 'income', amount: 50000, date, category: 'Salary', payee } });
  await page.goto('/app/finance');
  await expect(page.getByText(payee)).toBeVisible();
});

test('monthly report downloads as CSV and PDF', async ({ api }) => {
  const d = new Date();
  for (const format of ['csv', 'pdf']) {
    const r = await api.get(`finance/report/${d.getFullYear()}/${d.getMonth() + 1}/export?format=${format}`);
    expect(r.status(), format).toBe(200);
  }
});
