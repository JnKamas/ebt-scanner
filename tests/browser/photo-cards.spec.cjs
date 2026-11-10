const { test, expect } = require('@playwright/test');
const { setup, note } = require('./fixtures.cjs');
const item = text => ({ text, score: 0.95, poly: [[10, 10], [100, 10], [100, 30], [10, 30]] });

async function history(page) {
  await page.getByRole('button', { name: /^Queue/ }).click();
  await page.locator('.saved-scan-photos > summary').click();
  return page.locator('.saved-scan-photos');
}
async function start(page, options) {
  await setup(page, options);
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose \u20ac20', exact: true }).click();
  await expect(page.locator('.ocr-progress')).toHaveCount(0);
  await expect((await history(page)).getByText('No saved banknotes yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Entry', exact: true }).click();
}
async function printerScan(page) {
  await page.evaluate(value => { window.ocrItems = [value]; }, item('R001A1'));
  await page.locator('.field-row').first().getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.locator('.scan-success strong')).toHaveText('R001A1');
}
async function fillLocation(page) {
  await page.getByLabel('Country', { exact: true }).fill(note.country);
  await page.getByLabel('City', { exact: true }).fill(note.city);
}
async function counts(page) {
  return page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('ebt-scan-photos'); request.onsuccess = () => resolve(request.result); });
    const tx = db.transaction(['cards', 'photos']);
    const values = await Promise.all(['cards', 'photos'].map(name => new Promise(resolve => { const request = tx.objectStore(name).count(); request.onsuccess = () => resolve(request.result); })));
    db.close();
    return { banknotes: values[0], crops: values[1] };
  });
}
async function seed(page, count, legacy = false) {
  await page.evaluate(async ({ count, legacy, note }) => {
    const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 150;
    const context = canvas.getContext('2d'); context.fillStyle = 'green'; context.fillRect(100, 50, 40, 20);
    const image = canvas.toDataURL('image/jpeg');
    const db = await new Promise(resolve => { const request = indexedDB.open('ebt-scan-photos'); request.onsuccess = () => resolve(request.result); });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['photos', 'cards'], 'readwrite');
      const photo = (id, target, value) => ({ id, target, value, printerCode: 'R001A1', denomination: '20', capturedAt: '2026-11-10T10:00:00Z', image, width: 300, height: 150, ...(legacy ? {} : { cropVersion: 1 }), boxes: [{ x0: 100, y0: 50, x1: 140, y1: 70 }], confidences: [0.95] });
      tx.objectStore('photos').put(photo('shared-printer', 'printerCode', 'R001A1'));
      for (let i = 0; i < count; i++) {
        const serial = `X${String(i).padStart(11, '0')}`;
        tx.objectStore('photos').put(photo(`serial-${i}`, 'serial', serial));
        tx.objectStore('cards').put({ ...note, id: `banknote-${i}`, serial, printerPhotoId: 'shared-printer', serialPhotoId: `serial-${i}` });
      }
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, { count, legacy, note });
}

test('one banknote keeps both box crops, one download and its metadata after submission and reload', async ({ page }) => {
  await start(page, { signedIn: true });
  await page.clock.install();
  await printerScan(page);
  await page.getByRole('button', { name: 'Keep reviewing' }).click();
  await page.clock.fastForward(6000);
  await expect(page.locator('.scan-success strong')).toHaveText('R001A1');
  expect(await counts(page)).toEqual({ banknotes: 0, crops: 0 });
  await page.evaluate(() => { window.ocrItems = []; });
  await page.getByRole('button', { name: 'Continue now' }).click();
  await expect(page.locator('.previous-scan-photo img')).toBeVisible();
  await page.evaluate(value => { window.ocrItems = [value]; }, item(note.serial));
  await expect(page.locator('.scan-success strong')).toHaveText(note.serial);
  await page.getByRole('button', { name: 'Continue now' }).click();
  await expect(page.locator('.latest-scan-photos .banknote-photo-card')).toHaveCount(1);
  await expect(page.locator('.latest-scan-photos .code-photo')).toHaveCount(2);
  await page.locator('#serial-number').fill('X00000000011');
  await expect(page.locator('.latest-scan-photos')).toContainText(`Photo shows ${note.serial}`);
  await fillLocation(page);
  await page.getByLabel('Comment').fill('Test shop');
  await page.getByRole('button', { name: /Add note to queue/ }).click();
  let submitted;
  await page.route('**/api/ebt/notes', route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { results: submitted.notes.map(note => ({ id: note.id, result: { status: 0 } })) } });
  });
  await page.getByRole('button', { name: /^Queue/ }).click();
  await expect(page.locator('.note-list .code-photo')).toHaveCount(2);
  await page.getByRole('button', { name: 'Submit queue (1)' }).click();
  await expect(page.locator('.note-list article')).toHaveCount(0);
  expect(JSON.stringify(submitted)).not.toContain('data:image');
  expect(await page.evaluate(() => Object.values(localStorage).some(value => value.includes('data:image')))).toBe(false);
  await page.locator('.saved-scan-photos > summary').click();
  await expect(page.locator('.saved-banknote-card .banknote-card-status')).toContainText('Submitted');
  await page.reload();
  const archive = await history(page);
  await expect(archive.locator('.saved-banknote-card')).toHaveCount(1);
  await expect(archive.locator('.code-photo')).toHaveCount(2);
  await expect(archive).toContainText('Test shop');
  await archive.getByLabel('Find a serial or printer code').fill('X00000000011');
  await expect(archive.locator('.saved-banknote-card')).toHaveCount(1);
  await expect(archive.getByRole('button', { name: 'Download banknote', exact: true })).toHaveCount(1);
  await expect(archive.getByText('All captured code photos', { exact: true })).toHaveCount(0);
  await expect(archive.getByRole('link', { name: 'Download photo' })).toHaveCount(0);
  const downloadReady = page.waitForEvent('download');
  await archive.getByRole('button', { name: 'Download banknote', exact: true }).click();
  const download = await downloadReady;
  expect(download.suggestedFilename()).toBe('ebt-banknote-X00000000011.png');
  expect(require('node:fs').readFileSync(await download.path()).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  await archive.getByText('Enlarge banknote crops', { exact: true }).click();
  await expect(archive.locator('.banknote-enlarged-crops img')).toHaveCount(2);
  await page.setViewportSize({ width: 320, height: 760 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/banknote-record-mobile.png', fullPage: true });
  const sizes = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('ebt-scan-photos'); request.onsuccess = () => resolve(request.result); });
    const photos = await new Promise(resolve => { const request = db.transaction('photos').objectStore('photos').getAll(); request.onsuccess = () => resolve(request.result); });
    db.close();
    return Promise.all(photos.map(async photo => { const img = new Image(); img.src = photo.image; await img.decode(); return [photo.width, photo.height, img.naturalWidth, img.naturalHeight]; }));
  });
  expect(sizes).toEqual([[94, 24, 94, 24], [94, 24, 94, 24]]);
});

test('camera tests do not recognize or save banknotes', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.evaluate(value => { window.ocrItems = [value]; }, item('R001A1'));
  await page.getByRole('button', { name: 'Test camera: printer code (no recognition)', exact: true }).click();
  await expect(page.locator('.camera-hint')).toContainText('Recognition is off');
  expect(await page.evaluate(() => window.ocrPredictions)).toBe(0);
  await page.getByRole('button', { name: 'Close camera' }).click();
  await expect((await history(page)).getByText('No saved banknotes yet.')).toBeVisible();
  expect(await counts(page)).toEqual({ banknotes: 0, crops: 0 });
});

test('banknote save failures retain the paired record for one retry without blocking queue entry', async ({ page }) => {
  await start(page);
  await printerScan(page);
  await page.getByRole('button', { name: 'Close camera' }).click();
  await page.locator('#serial-number').fill(note.serial);
  await fillLocation(page);
  await page.evaluate(() => {
    const open = indexedDB.open.bind(indexedDB); window.failBanknoteStorage = true;
    indexedDB.open = (...args) => { if (window.failBanknoteStorage && args[0] === 'ebt-scan-photos') throw new DOMException('Quota exceeded', 'QuotaExceededError'); return open(...args); };
  });
  await page.getByRole('button', { name: /Add note to queue/ }).click();
  await expect(page.locator('main .notice[role="alert"]')).toContainText('Banknote records could not be saved');
  await page.getByRole('button', { name: /^Queue/ }).click();
  await expect(page.locator('.note-list article')).toHaveCount(1);
  await page.evaluate(() => { window.failBanknoteStorage = false; });
  expect(await counts(page)).toEqual({ banknotes: 0, crops: 0 });
  await page.getByRole('button', { name: 'Retry saving banknotes' }).click();
  await expect(page.getByText('Banknote records could not be saved', { exact: false })).toHaveCount(0);
  await page.reload();
  const archive = await history(page);
  await expect(archive.locator('.saved-banknote-card')).toHaveCount(1);
  await expect(archive.locator('.code-photo')).toHaveCount(1);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByText('Local queue cleared.', { exact: true })).toBeVisible();
  await expect((await history(page)).locator('.saved-banknote-card')).toHaveCount(1);
});

test('history paginates and deletes whole banknotes while protecting shared printer crops and the queue', async ({ page }) => {
  await start(page, { notes: [note] });
  await seed(page, 23);
  const archive = await history(page);
  await expect(archive.locator('.saved-banknote-card')).toHaveCount(20);
  await archive.getByRole('button', { name: 'Load more banknote cards' }).click();
  await expect(archive.locator('.saved-banknote-card')).toHaveCount(23);
  await archive.getByLabel('Find a serial or printer code').fill('X00000000005');
  await expect(archive.locator('.saved-banknote-card')).toHaveCount(1);
  page.once('dialog', dialog => dialog.dismiss());
  await archive.getByRole('button', { name: 'Delete saved banknote X00000000005', exact: true }).click();
  expect(await counts(page)).toEqual({ banknotes: 23, crops: 24 });
  page.once('dialog', dialog => dialog.accept());
  await archive.getByRole('button', { name: 'Delete saved banknote X00000000005', exact: true }).click();
  await expect(archive.getByText('No matching banknotes.')).toBeVisible();
  expect(await counts(page)).toEqual({ banknotes: 22, crops: 23 });
  await archive.getByLabel('Find a serial or printer code').fill('');
  await expect(archive.locator('.saved-banknote-card')).toHaveCount(20);
  await expect(archive.locator('.saved-banknote-card').first().locator('.code-photo')).toHaveCount(2);
  page.once('dialog', dialog => dialog.dismiss());
  await archive.getByRole('button', { name: 'Delete all banknotes' }).click();
  expect((await counts(page)).banknotes).toBe(22);
  page.once('dialog', dialog => dialog.accept());
  await archive.getByRole('button', { name: 'Delete all banknotes' }).click();
  await expect(archive.getByText('No saved banknotes yet.')).toBeVisible();
  expect(await counts(page)).toEqual({ banknotes: 0, crops: 0 });
  await expect(page.locator('.note-list article')).toHaveCount(1);
});

test('older paired banknotes retain their association while wider preview captures are cropped', async ({ page }) => {
  await start(page);
  await seed(page, 1, true);
  const archive = await history(page);
  await expect(archive.locator('.saved-banknote-card')).toHaveCount(1);
  await expect(archive.locator('.code-photo')).toHaveCount(2);
  const photos = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('ebt-scan-photos'); request.onsuccess = () => resolve(request.result); });
    const photos = await new Promise(resolve => { const request = db.transaction('photos').objectStore('photos').getAll(); request.onsuccess = () => resolve(request.result); });
    db.close(); return photos.map(photo => [photo.width, photo.height, photo.cropVersion]);
  });
  expect(photos).toEqual([[44, 24, 1], [44, 24, 1]]);
});

test('submission recovery preserves a banknote crop after its initial archive save failed', async ({ page }) => {
  await start(page, { signedIn: true });
  await printerScan(page);
  await page.getByRole('button', { name: 'Close camera' }).click();
  await page.locator('#serial-number').fill(note.serial);
  await fillLocation(page);
  await page.evaluate(() => {
    const open = indexedDB.open.bind(indexedDB); window.failBanknoteStorage = true;
    indexedDB.open = (...args) => { if (window.failBanknoteStorage && args[0] === 'ebt-scan-photos') throw new DOMException('Quota exceeded', 'QuotaExceededError'); return open(...args); };
  });
  await page.getByRole('button', { name: /Add note to queue/ }).click();
  await expect(page.locator('main .notice[role="alert"]')).toContainText('Banknote records could not be saved');
  await page.evaluate(() => { window.failBanknoteStorage = false; });
  await page.route('**/api/ebt/notes', route => route.fulfill({ json: { results: route.request().postDataJSON().notes.map(note => ({ id: note.id, result: { status: 0 } })) } }));
  await page.getByRole('button', { name: /^Queue/ }).click();
  await page.getByRole('button', { name: 'Submit queue (1)' }).click();
  await expect(page.locator('.note-list article')).toHaveCount(0);
  await page.locator('.saved-scan-photos > summary').click();
  await expect(page.locator('.saved-banknote-card .banknote-card-status')).toContainText('Submitted');
  await expect(page.locator('.saved-banknote-card .code-photo')).toHaveCount(1);
  expect(await counts(page)).toEqual({ banknotes: 1, crops: 1 });
});
