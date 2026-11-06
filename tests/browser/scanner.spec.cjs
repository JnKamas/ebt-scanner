const { test, expect } = require('@playwright/test');
const { setup } = require('./fixtures.cjs');
const item = (text, score = 0.95) => ({ text, score, poly: [[10,10],[100,10],[100,30],[10,30]] });

async function ready(page) {
  await setup(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose €20', exact: true }).click();
  await expect(page.locator('.ocr-progress')).toHaveCount(0);
}

test('only explicit Scan opens the camera; valid I codes freeze the frame and continue to serial', async ({ page }) => {
  await ready(page);
  await page.locator('label[for="printer-code"]').click();
  await page.locator('#printer-code').click();
  expect(await page.evaluate(() => window.cameraRequests)).toBe(0);
  await page.evaluate(value => { window.ocrItems = [value]; }, item('R00111'));
  await page.locator('.field-row').first().getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.locator('.scan-success strong')).toHaveText('R001I1');
  await expect(page.locator('.result-box')).toHaveCount(1);
  await expect(page.locator('#printer-code')).toHaveValue('R001I1');
  expect(await page.evaluate(() => window.cameraStops)).toBe(1);
  await page.evaluate(value => { window.ocrItems = [value]; }, item('X00000000002'));
  await page.getByRole('button', { name: /Scan serial number|Continue/ }).click();
  await expect(page.locator('.scan-success strong')).toHaveText('X00000000002');
  expect(await page.evaluate(() => window.cameraRequests)).toBe(2);
});

test('low-confidence text and all-digit false matches never stop a live scan', async ({ page }) => {
  await ready(page);
  await page.clock.install();
  await page.evaluate(values => { window.ocrItems = values; }, [item('R001I1', 0.69), item('111111')]);
  await page.locator('.field-row').first().getByRole('button', { name: 'Scan', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.ocrPredictions)).toBeGreaterThan(1);
  await expect(page.locator('.scan-success')).toHaveCount(0);
  await page.clock.fastForward(15000);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: '15 seconds' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByText(/No valid banknote/)).toHaveCount(0);
});

test('missing frames still close the camera after 15 seconds', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { get: () => 0, configurable: true }));
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.locator('.field-row').first().getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.clock.fastForward(14999);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.clock.fastForward(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.cameraStops)).toBe(1);
});

test('failed video playback still closes the camera after 15 seconds', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => { HTMLMediaElement.prototype.play = async () => { throw new Error('playback blocked'); }; });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.locator('.field-row').first().getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.clock.fastForward(15000);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('failed frame encoding still closes the camera after 15 seconds', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = callback => callback(null); });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.locator('.field-row').first().getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.clock.fastForward(15000);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
