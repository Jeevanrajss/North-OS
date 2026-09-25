import { test, expect, today, unique } from './fixtures';

test('create a habit, tick today, and it survives a reload', async ({ page, api }) => {
  const name = unique('Stretch');
  await page.goto('/app/habits');

  await page.getByRole('button', { name: 'Add habit', exact: true }).click();
  await page.getByPlaceholder(/Habit name/).fill(name);
  await page.getByRole('button', { name: 'Add Habit', exact: true }).click();

  const tick = page.getByRole('button', { name: `Tick ${name} on ${today()}` });
  await expect(tick).toBeVisible();
  await tick.click();
  await expect(page.getByRole('button', { name: `Untick ${name} on ${today()}` })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: `Untick ${name} on ${today()}` })).toBeVisible();

  const habit = (await (await api.get('habits')).json()).find((h: any) => h.name === name);
  const t = await (await api.get(`habits/today`)).json();
  expect(t.habits.find((x: any) => x.habit.id === habit.id).done).toBe(true);
});

test('unticking removes the check-in', async ({ page, api }) => {
  const name = unique('Floss');
  const habit = await (await api.post('habits', { data: { name } })).json();
  await api.put(`habits/${habit.id}/checkins/${today()}`);

  await page.goto('/app/habits');
  await page.getByRole('button', { name: `Untick ${name} on ${today()}` }).click();
  await expect(page.getByRole('button', { name: `Tick ${name} on ${today()}` })).toBeVisible();
  const t = await (await api.get('habits/today')).json();
  expect(t.habits.find((x: any) => x.habit.id === habit.id).done).toBe(false);
});

test('habit detail page opens from the list', async ({ page, api }) => {
  const name = unique('Walk');
  await api.post('habits', { data: { name } });
  await page.goto('/app/habits');
  await page.getByRole('link', { name: `View ${name} details` }).click();
  await expect(page).toHaveURL(/\/app\/habits\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(name) })).toBeVisible();
});
