import { test, expect, today, unique } from './fixtures';

test('pick a mood and write an entry — both persist after reload', async ({ page, api }) => {
  const text = unique('Evening walk by the lake');
  await page.goto('/app/journal');

  const calm = page.getByRole('button', { name: /Calm/ });
  await calm.click();
  await expect(calm).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Add entry' }).click();
  const editor = page.locator('.ProseMirror').last();
  await editor.click();
  await editor.pressSequentially(text);
  await page.getByRole('button', { name: 'Save', exact: true }).last().click();
  await expect(page.getByText('Saved').last()).toBeVisible();

  await page.reload();
  await expect(page.getByText(text)).toBeVisible();
  await expect(page.getByRole('button', { name: /Calm/ })).toHaveAttribute('aria-pressed', 'true');

  const day = await (await api.get(`journal/days/${today()}`)).json();
  expect(day.mood_codes).toContain('calm');
  expect(day.entries.map((e: any) => e.content_text)).toContain(text);
});

test('legacy (non-TipTap) entries render their text instead of a blank editor', async ({ page, api }) => {
  const text = unique('Legacy entry from an older version');
  const legacyJson = JSON.stringify([{ id: 'x', type: 'paragraph', content: [{ type: 'text', text }] }]);
  await api.post(`journal/days/${today()}/entries`, { data: { content_json: legacyJson, content_text: text } });
  await page.goto('/app/journal');
  await expect(page.locator('.ProseMirror').filter({ hasText: text })).toBeVisible();
});

test('health log autosaves and reloads', async ({ page, api }) => {
  const note = unique('Slept well');
  await page.goto('/app/health');
  await page.getByPlaceholder('Any notes about today…').fill(note);
  await expect(page.getByText('✓ Saved')).toBeVisible({ timeout: 5000 });

  await page.reload();
  await expect(page.getByPlaceholder('Any notes about today…')).toHaveValue(note);
  expect((await (await api.get(`health-log/${today()}`)).json()).notes).toBe(note);
});

test.describe('just after midnight in India (UTC is still yesterday)', () => {
  test.use({ timezoneId: 'Asia/Kolkata' });

  test('health log is saved under the local date, not the UTC one', async ({ page, api }) => {
    const d = today(); // test runner's local date
    await page.clock.install({ time: new Date(`${d}T00:30:00+05:30`) });
    const note = unique('After midnight');
    await page.goto('/app/health');
    await page.getByPlaceholder('Any notes about today…').fill(note);
    await expect(page.getByText('✓ Saved')).toBeVisible({ timeout: 5000 });
    expect((await (await api.get(`health-log/${d}`)).json())?.notes).toBe(note);
  });
});
