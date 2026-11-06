const { test, expect } = require('@playwright/test');
const { setup } = require('./fixtures.cjs');
test.use({ serviceWorkers: 'allow' });

test('a first online visit prepares the shell for an offline reload and manual entry', async ({ page, context }) => {
  await setup(page);
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  await expect.poll(() => page.evaluate(() => caches.keys().then(keys => keys.filter(key => key.startsWith('ebt-web-')).length))).toBe(1);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: /Add note to queue/ })).toBeVisible();
  await page.getByRole('button', { name: 'Choose €20', exact: true }).click();
  await page.locator('#printer-code').fill('R001A1');
  await page.locator('#serial-number').fill('X00000000002');
  await page.getByLabel('Country', { exact: true }).fill('Slovakia');
  await page.getByLabel('City', { exact: true }).fill('Bratislava');
  await page.getByRole('button', { name: /Add note to queue/ }).click();
  await page.getByRole('button', { name: /^Queue/ }).click();
  await expect(page.locator('.note-list article')).toHaveCount(1);
  const keys = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(request => request.url)))).flat());
  expect(keys.some(key => key.includes('/_next/static/') && key.endsWith('.js'))).toBe(true);
  expect(keys.some(key => new URL(key).pathname.startsWith('/api/'))).toBe(false);
});
