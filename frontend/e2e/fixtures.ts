import { test as base, expect, type APIRequestContext } from '@playwright/test';

/**
 * `page` fails the test if the app logs a console error or any API call
 * returns a 5xx. `api` talks to the same backend through the Vite proxy, for
 * seeding data and asserting persistence.
 */
export const test = base.extend<{ api: APIRequestContext; problems: string[]; expectedErrors: RegExp[] }>({
  problems: async ({}, use) => {
    await use([]);
  },
  // Tests that deliberately trigger an error (e.g. AI offline) list it here.
  expectedErrors: async ({}, use) => {
    await use([]);
  },
  page: async ({ page, problems, expectedErrors }, use) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
    });
    page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
    page.on('response', (res) => {
      if (res.url().includes('/api/') && res.status() >= 500) {
        problems.push(`HTTP ${res.status()} ${res.request().method()} ${res.url()}`);
      }
    });
    await use(page);
    const unexpected = problems.filter((p) => !expectedErrors.some((re) => re.test(p)));
    expect(unexpected, 'console errors / server errors during the test').toEqual([]);
  },
  api: async ({ playwright, baseURL }, use) => {
    const ctx = await playwright.request.newContext({ baseURL: `${baseURL}/api/v1/` });
    await use(ctx);
    await ctx.dispose();
  },
});

export { expect };

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const unique = (label: string) => `${label} ${Date.now().toString(36)}`;
