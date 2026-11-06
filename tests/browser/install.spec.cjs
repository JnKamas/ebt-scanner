const { test, expect } = require('@playwright/test');
const { setup } = require('./fixtures.cjs');
for (const [platform, userAgent, expected] of [
  ['Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', null],
  ['Android', 'Mozilla/5.0 (Linux; Android 15; Pixel 9)', 'Install on Android'],
  ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'Install on iPhone or iPad'],
]) {
  test.describe(platform, () => {
    test.use({ userAgent });
    test('installation guidance matches the OS', async ({ page }) => {
      await setup(page);
      await page.goto('/');
      await expect(page).toHaveTitle('EBT Scanner');
      await expect(page.locator('.brand')).toContainText('EBT Scanner');
      if (platform === 'Windows') {
        const manifest = await (await page.request.get('/manifest.webmanifest')).json();
        expect(manifest.name).toBe('EBT Scanner');
        expect(manifest.short_name).toBe('EBT Scanner');
      }
      await page.getByRole('button', { name: 'Settings' }).click();
      const guidance = page.locator('.setting').filter({ hasText: /Install on/ });
      if (expected) await expect(guidance).toContainText(expected);
      else await expect(guidance).toHaveCount(0);
    });
  });
}
