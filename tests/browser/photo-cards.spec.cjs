const { test, expect } = require('@playwright/test');
const { setup, note } = require('./fixtures.cjs');
const item = text => ({ text, score: 0.95, poly: [[10, 10], [100, 10], [100, 30], [10, 30]] });

async function start(page, options) {
  await setup(page, options);
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose \u20ac20', exact: true }).click();
  await expect(page.locator('.ocr-progress')).toHaveCount(0);
}

async function printerScan(page) {
  await page.evaluate(value => { window.ocrItems = [value]; }, item('R001A1'));
  await page.locator('.field-row').first().getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.locator('.scan-success strong')).toHaveText('R001A1');
}

async function history(page) {
  await page.getByRole('button', { name: /^Queue/ }).click();
  await page.locator('.saved-scan-photos > summary').click();
  return page.locator('.saved-scan-photos');
}

test('scan cards pause, survive submission and reload, preserve originals after edits, and never enter API payloads', async ({ page }) => {
  await start(page, { signedIn: true });
  await page.clock.install();
  await printerScan(page);
  await page.getByRole('button', { name: 'Keep reviewing' }).click();
  await page.clock.fastForward(6000);
  await expect(page.locator('.scan-success strong')).toHaveText('R001A1');
  expect(await page.evaluate(() => window.cameraRequests)).toBe(1);
  await page.evaluate(() => { window.ocrItems = []; });
  await page.getByRole('button', { name: 'Continue now' }).click();
  await expect(page.locator('.previous-scan-photo img').first()).toBeVisible();
  await page.evaluate(value => { window.ocrItems = [value]; }, item(note.serial));
  await expect(page.locator('.scan-success strong')).toHaveText(note.serial);
  await page.getByRole('button', { name: 'Continue now' }).click();
  await expect(page.locator('.latest-scan-photos figure')).toHaveCount(2);
  await page.locator('#serial-number').fill('X00000000011');
  await expect(page.locator('.latest-scan-photos')).toContainText(note.serial);
  await page.getByLabel('Country', { exact: true }).fill('Slovakia');
  await page.getByLabel('City', { exact: true }).fill('Bratislava');
  await page.getByLabel('Comment').fill('Test shop');
  await page.getByRole('button', { name: /Add note to queue/ }).click();
  let submitted;
  await page.route('**/api/ebt/notes', route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { results: submitted.notes.map(note => ({ id: note.id, result: { status: 0 } })) } });
  });
  await page.getByRole('button', { name: /^Queue/ }).click();
  await expect(page.locator('.banknote-code-pair .code-photo')).toHaveCount(2);
  await expect(page.locator('.banknote-queue-card')).toContainText('Test shop');
  await page.getByRole('button', { name: 'Submit queue (1)' }).click();
  await expect(page.locator('.note-list article')).toHaveCount(0);
  expect(submitted.notes[0].serial).toBe('X00000000011');
  expect(JSON.stringify(submitted)).not.toContain('data:image');
  expect(JSON.stringify(submitted)).not.toContain('capturedAt');
  expect(await page.evaluate(() => Object.values(localStorage).some(value => value.includes('data:image')))).toBe(false);
  await page.locator('.saved-scan-photos > summary').click();
  await expect(page.locator('.saved-banknote-card .banknote-card-status')).toContainText('Submitted');
  await page.reload();
  const archive = await history(page);
  await expect(archive.locator('.saved-banknote-card .banknote-code-pair .code-photo')).toHaveCount(2);
  await expect(archive.locator('.saved-banknote-card')).toContainText('Test shop');
  await page.setViewportSize({ width: 320, height: 760 });
  await page.screenshot({ path: 'test-results/banknote-photos-mobile.png', fullPage: true });
  await archive.locator('.all-capture-photos > summary').click();
  await expect(archive.locator('.saved-photo')).toHaveCount(2);
  const storedCrops = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('ebt-scan-photos'); request.onsuccess = () => resolve(request.result); });
    const records = await new Promise(resolve => { const request = db.transaction('photos').objectStore('photos').getAll(); request.onsuccess = () => resolve(request.result); });
    db.close();
    return Promise.all(records.map(async record => {
      const image = new Image();
      image.src = record.image;
      await image.decode();
      return { width: record.width, height: record.height, actualWidth: image.naturalWidth, actualHeight: image.naturalHeight, cropVersion: record.cropVersion, box: record.boxes[0] };
    }));
  });
  expect(storedCrops).toHaveLength(2);
  for (const crop of storedCrops) expect(crop).toEqual({ width: 94, height: 24, actualWidth: 94, actualHeight: 24, cropVersion: 1, box: { x0: 2, y0: 2, x1: 92, y1: 22 } });
  await archive.getByLabel('Find a serial or printer code').fill(note.serial);
  await expect(archive.locator('.saved-photo')).toHaveCount(1);
  await expect(archive.locator('figcaption strong')).toHaveText(note.serial);
  const downloadReady = page.waitForEvent('download');
  await archive.getByRole('link', { name: 'Download photo' }).click();
  expect((await downloadReady).suggestedFilename()).toBe(`ebt-serial-${note.serial}.jpg`);
  await archive.locator('.photo-enlarge > summary').click();
  await expect(archive.getByAltText(`Enlarged serial number code crop: ${note.serial}`)).toBeVisible();
  await page.setViewportSize({ width: 320, height: 760 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/saved-scan-photos-mobile.png', fullPage: true });
});

test('Settings camera tests explicitly skip recognition and never save photos', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('Camera tests check the view and focus only.', { exact: false })).toBeVisible();
  await page.evaluate(value => { window.ocrItems = [value]; }, item('R001A1'));
  await page.getByRole('button', { name: 'Test camera: printer code (no recognition)', exact: true }).click();
  await expect(page.locator('.camera-hint')).toContainText('Recognition is off');
  expect(await page.evaluate(() => window.ocrPredictions)).toBe(0);
  await page.getByRole('button', { name: 'Close camera' }).click();
  const archive = await history(page);
  await expect(archive.getByText('No saved scan photos yet.')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ebt-web-draft'))).not.toContain('R001A1');
});

test('photo-storage failure offers retry and does not prevent queue entry or lose the capture', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const open = indexedDB.open.bind(indexedDB);
    window.failPhotoStorage = true;
    indexedDB.open = (...args) => {
      if (window.failPhotoStorage && args[0] === 'ebt-scan-photos') throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return open(...args);
    };
  });
  await printerScan(page);
  await page.getByRole('button', { name: 'Close camera' }).click();
  await expect(page.locator('main .notice[role="alert"]')).toContainText('could not be saved');
  await expect(page.locator('.latest-scan-photos figure')).toHaveCount(1);
  await page.locator('#serial-number').fill(note.serial);
  await page.getByLabel('Country', { exact: true }).fill(note.country);
  await page.getByLabel('City', { exact: true }).fill(note.city);
  await page.getByRole('button', { name: /Add note to queue/ }).click();
  await page.getByRole('button', { name: /^Queue/ }).click();
  await expect(page.locator('.note-list article')).toHaveCount(1);
  await page.evaluate(() => { window.failPhotoStorage = false; });
  await page.getByRole('button', { name: 'Retry saving photos' }).click();
  await expect(page.getByText('could not be saved', { exact: false })).toHaveCount(0);
  await page.reload();
  const archive = await history(page);
  await expect(archive.locator('.saved-photo')).toHaveCount(1);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByText('Local queue cleared.', { exact: true })).toBeVisible();
  const retained = await history(page);
  await expect(retained.locator('.saved-photo')).toHaveCount(1);
});

test('photo history paginates, filters and confirms individual and bulk deletion', async ({ page }) => {
  await start(page);
  const archive = await history(page);
  await expect(archive.getByText('No saved scan photos yet.')).toBeVisible();
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('ebt-scan-photos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const image = document.createElement('canvas').toDataURL('image/jpeg');
    await new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readwrite');
      for (let i = 0; i < 23; i++) tx.objectStore('photos').put({ id: String(i).padStart(2, '0'), value: `R${String(i).padStart(3, '0')}A1`, printerCode: '', target: 'printerCode', denomination: '20', capturedAt: '2026-11-10T10:00:00Z', image, width: 300, height: 150, cropVersion: 1, boxes: [], confidences: [0.95] });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await archive.locator('.all-capture-photos > summary').click();
  await archive.getByRole('button', { name: 'Refresh photos' }).click();
  await expect(archive.locator('.saved-photo')).toHaveCount(20);
  await archive.getByRole('button', { name: 'Load more photos' }).click();
  await expect(archive.locator('.saved-photo')).toHaveCount(23);
  await archive.getByLabel('Find a serial or printer code').fill('R005');
  await expect(archive.locator('.saved-photo')).toHaveCount(1);
  page.once('dialog', dialog => dialog.dismiss());
  await archive.getByRole('button', { name: 'Delete R005A1 photo', exact: true }).click();
  await expect(archive.locator('.saved-photo')).toHaveCount(1);
  page.once('dialog', dialog => dialog.accept());
  await archive.getByRole('button', { name: 'Delete R005A1 photo', exact: true }).click();
  await expect(archive.getByText('No matching photos.')).toBeVisible();
  await archive.getByLabel('Find a serial or printer code').fill('');
  await expect(archive.locator('.saved-photo')).toHaveCount(20);
  page.once('dialog', dialog => dialog.dismiss());
  await archive.getByRole('button', { name: 'Delete all photos' }).click();
  await expect(archive.locator('.saved-photo')).toHaveCount(20);
  page.once('dialog', dialog => dialog.accept());
  await archive.getByRole('button', { name: 'Delete all photos' }).click();
  await expect(archive.getByText('No saved scan photos yet.')).toBeVisible();
});

test('captures from simultaneous scanner tabs remain independently saved', async ({ page, context }) => {
  await start(page);
  const second = await context.newPage();
  await start(second);
  await Promise.all([printerScan(page), printerScan(second)]);
  await page.getByRole('button', { name: 'Close camera' }).click();
  await second.getByRole('button', { name: 'Close camera' }).click();
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('ebt-scan-photos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = await new Promise((resolve, reject) => {
      const request = db.transaction('photos', 'readonly').objectStore('photos').count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return count;
  })).toBe(2);
  const archive = await history(page);
  await expect(archive.locator('.saved-photo')).toHaveCount(2);
  await page.reload();
  const restored = await history(page);
  await expect(restored.locator('.saved-photo')).toHaveCount(2);
});

test('opening an older preview capture replaces the stored wider image with its code crop', async ({ page }) => {
  await start(page);
  const archive = await history(page);
  await expect(archive.getByText('No saved scan photos yet.')).toBeVisible();
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 150;
    const context = canvas.getContext('2d');
    context.fillStyle = 'red';
    context.fillRect(0, 0, 300, 150);
    context.fillStyle = 'green';
    context.fillRect(100, 50, 40, 20);
    const db = await new Promise(resolve => { const request = indexedDB.open('ebt-scan-photos'); request.onsuccess = () => resolve(request.result); });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('photos', 'readwrite');
      transaction.objectStore('photos').put({ id: 'older-preview', target: 'printerCode', value: 'R001A1', printerCode: 'R001A1', denomination: '20', capturedAt: '2026-11-10T10:00:00Z', image: canvas.toDataURL('image/jpeg'), width: 300, height: 150, boxes: [{ x0: 100, y0: 50, x1: 140, y1: 70 }], confidences: [0.95] });
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  });
  await archive.getByRole('button', { name: 'Refresh photos' }).click();
  await archive.locator('.all-capture-photos > summary').click();
  await expect(archive.locator('.saved-photo')).toHaveCount(1);
  await expect.poll(() => archive.locator('.scan-photo-image img').evaluate(image => image.naturalWidth)).toBe(44);
  const stored = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('ebt-scan-photos'); request.onsuccess = () => resolve(request.result); });
    const record = await new Promise(resolve => { const request = db.transaction('photos').objectStore('photos').get('older-preview'); request.onsuccess = () => resolve(request.result); });
    db.close();
    return { id: record.id, width: record.width, height: record.height, cropVersion: record.cropVersion };
  });
  expect(stored).toEqual({ id: 'older-preview', width: 44, height: 24, cropVersion: 1 });
});
