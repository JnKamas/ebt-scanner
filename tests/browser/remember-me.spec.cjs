const { test, expect } = require('@playwright/test');
const { setup } = require('./fixtures.cjs');

for (const rememberMe of [false, true]) {
  test(`sign-in sends an explicit remember-me choice: ${rememberMe}`, async ({ page }) => {
    await setup(page);
    let submitted;
    await page.route('**/api/ebt/login', route => {
      submitted = route.request().postDataJSON();
      return route.fulfill({ json: { account: { username: 'Tracker', totalbills: 0, totalhits: 0, my_country: '', my_city: '', my_zip: '' } } });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Profile' }).click();
    const choice = page.getByRole('checkbox', { name: 'Remember me for up to 6 months' });
    await expect(choice).not.toBeChecked();
    await expect(page.locator('#remember-me-help')).toContainText('sign-in cookie');
    await expect(page.locator('#remember-me-help')).toContainText('sooner');
    await page.getByLabel('Email', { exact: true }).fill('fixture@example.test');
    await page.getByLabel('Password', { exact: true }).fill('fixture-only');
    if (rememberMe) await choice.check();
    await page.getByRole('button', { name: 'Sign in to EuroBillTracker', exact: true }).click();
    await expect(page.locator('.account-card')).toContainText('Tracker');
    expect(submitted.rememberMe).toBe(rememberMe);
    expect(await page.evaluate(() => Object.values(localStorage).some(value => value.includes('fixture-only')))).toBe(false);
  });
}
