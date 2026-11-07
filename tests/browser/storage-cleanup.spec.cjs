const { test, expect } = require('@playwright/test');
const { setup, note } = require('./fixtures.cjs');

test.use({ serviceWorkers: 'allow' });

test('old app caches are removed without deleting saved notes or registering an offline worker', async ({ page, request }) => {
  await setup(page, { notes: [note] });
  await page.goto('/icon.svg');
  await page.evaluate(async () => {
    for (const name of ['ebt-web-old', 'unrelated-cache']) {
      const cache = await caches.open(name);
      await cache.put('/cached-test', new Response('old asset'));
    }
  });
  await page.addInitScript(() => {
    window.workerRegistrations = 0;
    navigator.serviceWorker.register = async () => {
      window.workerRegistrations++;
      throw new Error('The app must not register an offline worker');
    };
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => caches.keys().then(keys => keys.filter(key => key.startsWith('ebt-web-')).length))).toBe(0);
  expect(await page.evaluate(() => caches.has('unrelated-cache'))).toBe(true);
  expect(await page.evaluate(() => window.workerRegistrations)).toBe(0);
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(list => list.length))).toBe(0);
  await page.getByRole('button', { name: /^Queue/ }).click();
  await expect(page.locator('.note-list article')).toHaveCount(1);
  const retirement = await request.get('/sw.js');
  expect(retirement.headers()['cache-control']).toContain('no-store');
});
