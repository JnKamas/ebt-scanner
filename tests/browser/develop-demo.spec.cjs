const { test, expect } = require('@playwright/test');

test('production has no demo page or controls', async ({ page }) => {
  const response = await page.goto('/demo');
  expect(response.status()).toBe(404);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Open visual demo' })).toHaveCount(0);
});

test('the development demo uses real cards and hit journeys without EBT or banknote storage', async ({ page }) => {
  let apiRequests = 0;
  await page.route('**/api/ebt/**', route => { apiRequests++; return route.abort(); });
  await page.addInitScript(() => {
    localStorage.setItem('ebt-web-queue', 'real-queue-sentinel');
    window.demoDatabaseReads = 0;
    indexedDB.open = () => { window.demoDatabaseReads++; throw new Error('The demo must not use banknote storage'); };
  });
  await page.goto('http://localhost:3002/demo');
  await page.getByRole('button', { name: 'Add 5 fake banknotes', exact: true }).click();
  await expect(page.locator('.note-list article')).toHaveCount(5);
  await expect(page.locator('.note-list .code-photo')).toHaveCount(10);
  await page.getByRole('button', { name: 'Simulate rejection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Submit queue (5)', exact: true })).toBeEnabled();
  await page.locator('.queue-actions .edit-note').first().click();
  await page.locator('.banknote-inline-edit').getByLabel('Comment', { exact: true }).fill('Edited demo note');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('button', { name: 'Simulate hit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Last submission: 1 hit' })).toBeVisible();
  await expect(page.locator('.hit-journey')).toContainText('Vienna');
  await expect(page.locator('.hit-journey')).toContainText('Bratislava');
  await expect(page.locator('.note-list article')).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 760 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await expect(page.locator('.note-list article')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('ebt-web-queue'))).toBe('real-queue-sentinel');
  expect(await page.evaluate(() => window.demoDatabaseReads)).toBe(0);
  expect(apiRequests).toBe(0);
});
