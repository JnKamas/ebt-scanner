const { test, expect } = require('@playwright/test');
const { setup } = require('./fixtures.cjs');

test('privacy is available before sign-in without losing an unfinished entry', async ({ page, context }) => {
  await setup(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.test');
  const popupReady = context.waitForEvent('page');
  await page.getByRole('link', { name: /Who maintains this app/ }).click();
  const about = await popupReady;
  await expect(about).toHaveURL(/\/about$/);
  await expect(about.getByRole('heading', { name: 'Before you sign in' })).toBeVisible();
  await expect(about.getByText('Labrador10', { exact: true })).toBeVisible();
  await about.close();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('fixture@example.test');
  expect(await page.evaluate(() => window.cameraRequests)).toBe(0);
});

test('About can be shared directly and fits a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/about');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'JnKamas/ebt-scanner on GitHub' })).toHaveAttribute('href', 'https://github.com/JnKamas/ebt-scanner');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('link', { name: 'Back to scanner' })).toHaveAttribute('href', '/');
});
