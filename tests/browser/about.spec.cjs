const { test, expect } = require('@playwright/test');
const { setup } = require('./fixtures.cjs');
const { version } = require('../../package.json');

test('the version footer stays accessible on every tab and Settings explains local preferences', async ({ page, context }) => {
  await setup(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const footer = page.locator('.app-footer');
  for (const tab of ['Entry', /^Queue/, 'Profile', 'Settings']) {
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: tab, exact: true }).click();
    await expect(footer.locator('.app-version')).toHaveText(`v${version}`);
    // The fixed navigation can cover an element scrolled to the viewport edge.
    // At the page bottom the shell's reserved space must keep the footer clear.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await footer.evaluate(element => element.getBoundingClientRect().bottom <= document.querySelector('.bottom-nav').getBoundingClientRect().top)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (tab === 'Entry') await page.screenshot({ path: 'test-results/entry-footer-mobile.png', fullPage: true });
  }
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.locator('.settings-panel')).toContainText('Settings are saved in this browser on this device and are not tied to your EuroBillTracker profile.');
  await expect(page.locator('.settings-panel .privacy-summary')).toHaveCount(0);
  await expect(page.getByText('Your queue and location stay in this browser.', { exact: false })).toHaveCount(0);
  const popupReady = context.waitForEvent('page');
  await footer.getByRole('link', { name: 'About & privacy', exact: true }).click();
  const about = await popupReady;
  await expect(about).toHaveURL(/\/about$/);
  await expect(about.locator('.app-version')).toHaveText(`v${version}`);
  expect(await page.evaluate(() => window.cameraRequests)).toBe(0);
  await page.screenshot({ path: 'test-results/settings-footer-mobile.png', fullPage: true });
});

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
  await expect(page.getByRole('region', { name: 'Who maintains it' }).getByRole('link', { name: 'GITHUB', exact: true })).toHaveAttribute('href', 'https://github.com/JnKamas/ebt-scanner');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('link', { name: 'Back to scanner' })).toHaveAttribute('href', '/');
});
