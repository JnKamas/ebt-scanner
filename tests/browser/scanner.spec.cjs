const { test, expect } = require('@playwright/test');
const { setup } = require('./fixtures.cjs');
const item = (text, score = 0.95) => ({ text, score, poly: [[10,10],[100,10],[100,30],[10,30]] });

async function ready(page) {
  await setup(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose €20', exact: true }).click();
  await expect(page.locator('.ocr-progress')).toHaveCount(0);
}

async function attached(page) {
  await expect.poll(() => page.locator('video').evaluate(video => Boolean(video.srcObject))).toBe(true);
}

test('only explicit Scan opens the camera; valid I codes freeze the frame and continue to serial', async ({ page }) => {
  await ready(page);
  await page.locator('label[for="printer-code"]').click();
  await page.locator('#printer-code').click();
  expect(await page.evaluate(() => window.cameraRequests)).toBe(0);
  await page.getByLabel('Country', { exact: true }).fill('Slovakia');
  await page.getByLabel('City', { exact: true }).fill('Bratislava');
  await page.evaluate(value => { window.ocrItems = [value]; }, item('R00111'));
  await page.locator('.field-row').first().getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.locator('.scan-success strong')).toHaveText('R001I1');
  await expect(page.locator('.result-box')).toHaveCount(1);
  await expect(page.locator('#printer-code')).toHaveValue('R001I1');
  expect(await page.evaluate(() => window.cameraStops)).toBe(1);
  await page.evaluate(value => { window.ocrItems = [value]; }, item('X00000000002'));
  await page.getByRole('button', { name: /Scan serial number|Continue/ }).click();
  await expect(page.locator('.camera-sheet')).toHaveCount(0);
  await expect(page.locator('.note-list article')).toHaveCount(1);
  await expect(page.locator('.note-list')).toContainText('X00000000002');
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
  await attached(page);
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
  await attached(page);
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
  await expect(page.locator('.camera-preview')).toHaveAttribute('aria-busy', 'false');
  await page.clock.fastForward(15000);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('camera acquisition shows a stable loading cover before the live view', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const acquire = navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia = async constraints => {
      await new Promise(resolve => { window.allowCamera = resolve; });
      return acquire(constraints);
    };
  });
  await page.locator('.field-row').first().getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Preparing camera' })).toBeVisible();
  await expect(page.locator('.live-label')).toBeHidden();
  await expect(page.locator('.camera-frame')).toBeHidden();
  expect(await page.evaluate(() => window.ocrPredictions)).toBe(0);
  const before = await page.locator('.camera-preview').boundingBox();
  expect(await page.locator('.preview-loading').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(16, 35, 49)');
  await page.evaluate(() => window.allowCamera());
  await expect(page.locator('.camera-preview')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.preview-loading')).toHaveCount(0);
  const after = await page.locator('.camera-preview').boundingBox();
  for (const dimension of ['x', 'y', 'width', 'height']) expect(Math.abs(before[dimension] - after[dimension])).toBeLessThan(2);
  await page.getByRole('button', { name: 'Close camera' }).click();
});

test('switching to the serial camera keeps the same scanner panel behind loading', async ({ page }) => {
  await ready(page);
  await page.evaluate(value => {
    window.ocrItems = [value];
    const acquire = navigator.mediaDevices.getUserMedia;
    let calls = 0;
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (++calls === 2) await new Promise(resolve => { window.allowNextCamera = resolve; });
      return acquire(constraints);
    };
  }, item('R00111'));
  await page.locator('.field-row').first().getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.locator('.scan-success strong')).toHaveText('R001I1');
  await page.evaluate(() => { window.originalScanner = document.querySelector('.camera-sheet'); window.ocrItems = []; });
  await page.getByRole('button', { name: 'Continue now' }).click();
  await expect(page.locator('.preview-loading')).toBeVisible();
  expect(await page.evaluate(() => window.originalScanner === document.querySelector('.camera-sheet'))).toBe(true);
  await page.evaluate(() => window.allowNextCamera());
  await expect(page.locator('.camera-preview')).toHaveAttribute('aria-busy', 'false');
  expect(await page.evaluate(() => window.originalScanner === document.querySelector('.camera-sheet'))).toBe(true);
  await page.getByRole('button', { name: 'Close camera' }).click();
});

test('closing the loading panel stops a camera granted after cancellation', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const acquire = navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia = async constraints => {
      await new Promise(resolve => { window.allowCamera = resolve; });
      return acquire(constraints);
    };
  });
  await page.locator('.field-row').first().getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.locator('.preview-loading')).toBeVisible();
  await page.getByRole('button', { name: 'Close camera' }).click();
  await page.evaluate(() => window.allowCamera());
  await expect.poll(() => page.evaluate(() => window.cameraStops)).toBe(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('preview warmup does not consume any of the 15-second live scan window', async ({ page }) => {
  await ready(page);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.evaluate(() => {
    HTMLVideoElement.prototype.requestVideoFrameCallback = function(callback) {
      window.showReadyFrame = () => callback(performance.now(), {});
      return 1;
    };
  });
  await page.locator('.field-row').first().getByRole('button', { name: 'Scan', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.showReadyFrame))).toBe(true);
  await page.clock.fastForward(5000);
  await expect(page.locator('.preview-loading')).toBeVisible();
  await page.evaluate(() => window.showReadyFrame());
  await expect(page.locator('.camera-preview')).toHaveAttribute('aria-busy', 'false');
  await page.clock.fastForward(14999);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.clock.fastForward(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('browsers without video-frame callbacks still reveal a usable preview', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => { HTMLVideoElement.prototype.requestVideoFrameCallback = undefined; });
  await page.locator('.field-row').first().getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.locator('.camera-preview')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.preview-loading')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.ocrPredictions)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Close camera' }).click();
});
