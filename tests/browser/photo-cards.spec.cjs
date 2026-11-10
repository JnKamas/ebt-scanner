const { test, expect } = require('@playwright/test');
const { setup, note } = require('./fixtures.cjs');
const item = text => ({ text, score: 0.95, poly: [[10, 10], [100, 10], [100, 30], [10, 30]] });

async function history(page) {
  await page.getByRole('button', { name: /^Queue/ }).click();
  return page.locator('.note-list');
}
async function start(page, options) {
  await setup(page, options);
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose \u20ac20', exact: true }).click();
  await expect(page.locator('.ocr-progress')).toHaveCount(0);
  await history(page);
  if (!options?.notes?.length) await expect(page.getByRole('heading', { name: 'No banknotes yet', exact: true })).toBeVisible();
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

test('complete scans retain paired crops for review and remove the banknote after confirmed submission', async ({ page }) => {
  await start(page, { signedIn: true });
  await fillLocation(page);
  await page.getByLabel('Comment').fill('Test shop');
  await printerScan(page);
  await expect(page.getByRole('button', { name: 'Keep reviewing' })).toHaveCount(0);
  expect(await counts(page)).toEqual({ banknotes: 0, crops: 0 });
  await page.evaluate(() => { window.ocrItems = []; });
  await page.getByRole('button', { name: 'Continue now' }).click();
  await expect(page.locator('.previous-scan-photo img')).toBeVisible();
  await page.evaluate(value => { window.ocrItems = [value]; }, item(note.serial));
  await expect(page.locator('.scan-success strong')).toHaveText(note.serial);
  await expect(page.locator('.scan-success')).toContainText('VALID EBT SERIAL CHECKSUM');
  await expect(page.locator('.result-preview img')).toBeVisible();
  expect(await counts(page)).toEqual({ banknotes: 0, crops: 0 });
  await page.getByRole('button', { name: 'Continue now' }).click();
  await expect(page.locator('.camera-sheet')).toHaveCount(0);
  await expect(page.locator('.note-list article')).toHaveCount(1);
  await expect(page.locator('.note-list .code-photo')).toHaveCount(2);
  await page.getByRole('button', { name: `Edit ${note.serial}`, exact: true }).click();
  const inline = page.locator('.banknote-inline-edit');
  await expect(inline).toHaveCount(1);
  await expect(inline.locator('.code-photo')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Submit queue (1)' })).toBeDisabled();
  await inline.getByLabel('Serial number', { exact: true }).fill('X00000000000');
  await inline.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(inline.getByRole('alert')).toContainText('checksum failed');
  await inline.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(inline).toHaveCount(0);
  await expect(page.locator('.note-list')).toContainText(note.serial);
  await page.getByRole('button', { name: `Edit ${note.serial}`, exact: true }).click();
  await inline.getByLabel('Serial number', { exact: true }).fill('X00000000011');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('.note-list')).toContainText(`Photo shows ${note.serial}`);
  await page.reload();
  const archive = await history(page);
  await expect(archive.locator('.banknote-queue-card')).toHaveCount(1);
  await expect(archive.locator('.code-photo')).toHaveCount(2);
  await expect(archive).toContainText('Test shop');
  await page.setViewportSize({ width: 320, height: 760 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const values = await archive.locator('.banknote-code-pair > div > strong').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, height: node.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(node).lineHeight), width: node.getBoundingClientRect().width, textWidth: node.scrollWidth })));
  expect(values.map(value => value.text)).toEqual(['R001A1', 'X00000000011']);
  for (const value of values) { expect(value.textWidth).toBeLessThanOrEqual(value.width + 1); }
  const matchedSizes = await archive.locator('.banknote-code-pair > div').evaluateAll(nodes => nodes.map(node => {
    const value = node.querySelector('.capture-code-value').getBoundingClientRect();
    const photo = node.querySelector('.code-photo').getBoundingClientRect();
    return { valueWidth: value.width, valueHeight: value.height, photoWidth: photo.width, photoHeight: photo.height };
  }));
  for (const size of matchedSizes) { expect(Math.abs(size.valueWidth - size.photoWidth)).toBeLessThanOrEqual(2); expect(Math.abs(size.valueHeight - size.photoHeight)).toBeLessThanOrEqual(2); }
  const crops = await archive.locator('.code-photo').evaluateAll(nodes => nodes.map(node => ({ top: node.getBoundingClientRect().top, height: node.getBoundingClientRect().height })));
  expect(Math.abs(crops[0].top - crops[1].top)).toBeLessThan(1);
  expect(crops[0].height).toBe(crops[1].height);
  await expect(archive.getByRole('img', { name: 'Location: Slovakia', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/banknote-record-mobile.png', fullPage: true });
  const sizes = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('ebt-scan-photos'); request.onsuccess = () => resolve(request.result); });
    const photos = await new Promise(resolve => { const request = db.transaction('photos').objectStore('photos').getAll(); request.onsuccess = () => resolve(request.result); });
    db.close();
    return Promise.all(photos.map(async photo => { const img = new Image(); img.src = photo.image; await img.decode(); return [photo.width, photo.height, img.naturalWidth, img.naturalHeight]; }));
  });
  expect(sizes).toEqual([[94, 24, 94, 24], [94, 24, 94, 24]]);
  let submitted;
  await page.route('**/api/ebt/notes', route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { results: submitted.notes.map(note => ({ id: note.id, result: { status: 0 } })) } });
  });
  await page.getByRole('button', { name: 'Submit queue (1)' }).click();
  await expect(page.locator('.note-list article')).toHaveCount(0);
  expect(JSON.stringify(submitted)).not.toContain('data:image');
  expect(await counts(page)).toEqual({ banknotes: 0, crops: 0 });
  await page.reload();
  await history(page);
  await expect(page.locator('.note-list article')).toHaveCount(0);
  expect(await counts(page)).toEqual({ banknotes: 0, crops: 0 });
});

test('camera tests do not recognize or save banknotes', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.evaluate(value => { window.ocrItems = [value]; }, item('R001A1'));
  await page.getByRole('button', { name: 'Test camera: printer code (no recognition)', exact: true }).click();
  await expect(page.locator('.camera-hint')).toContainText('Recognition is off');
  expect(await page.evaluate(() => window.ocrPredictions)).toBe(0);
  await page.getByRole('button', { name: 'Close camera' }).click();
  await history(page);
  await expect(page.getByRole('heading', { name: 'No banknotes yet', exact: true })).toBeVisible();
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
  await expect(archive.locator('.banknote-queue-card')).toHaveCount(1);
  await expect(archive.locator('.code-photo')).toHaveCount(1);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByText('Local queue cleared.', { exact: true })).toBeVisible();
  await expect((await history(page)).locator('.banknote-queue-card')).toHaveCount(1);
});

test('the unified list paginates and deletes a whole banknote while protecting shared printer crops', async ({ page }) => {
  await start(page, { notes: [note] });
  await seed(page, 23);
  const list = await history(page);
  await expect(list.locator('article')).toHaveCount(21);
  await page.getByRole('button', { name: 'Load more banknotes', exact: true }).click();
  await expect(list.locator('article')).toHaveCount(24);
  const target = list.locator('article').filter({ has: page.getByRole('button', { name: 'Remove X00000000005', exact: true }) });
  page.once('dialog', dialog => dialog.dismiss());
  await target.getByRole('button', { name: 'Remove X00000000005', exact: true }).click();
  expect(await counts(page)).toEqual({ banknotes: 23, crops: 24 });
  page.once('dialog', dialog => dialog.accept());
  await target.getByRole('button', { name: 'Remove X00000000005', exact: true }).click();
  await expect(target).toHaveCount(0);
  expect(await counts(page)).toEqual({ banknotes: 22, crops: 23 });
  await expect(list.getByRole('button', { name: `Edit ${note.serial}`, exact: true })).toHaveCount(1);
  await expect(list.locator('article').filter({ hasText: 'X00000000006' }).locator('.code-photo')).toHaveCount(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ebt-web-queue')).length)).toBe(1);
});

test('older submitted history is removed while a queued banknote keeps its shared printer crop', async ({ page }) => {
  await start(page);
  await seed(page, 2);
  await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('ebt-scan-photos'); request.onsuccess = () => resolve(request.result); });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('cards', 'readwrite');
      const store = tx.objectStore('cards');
      const request = store.get('banknote-0');
      request.onsuccess = () => store.put({ ...request.result, submittedAt: '2026-11-10T11:00:00Z' });
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  const list = await history(page);
  await expect(list.locator('article')).toHaveCount(1);
  await expect(list.locator('.code-photo')).toHaveCount(2);
  expect(await counts(page)).toEqual({ banknotes: 1, crops: 2 });
});

test('older paired banknotes retain their association while wider preview captures are cropped', async ({ page }) => {
  await start(page);
  await seed(page, 1, true);
  const archive = await history(page);
  await expect(archive.locator('.banknote-queue-card')).toHaveCount(1);
  await expect(archive.locator('.code-photo')).toHaveCount(2);
  const photos = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('ebt-scan-photos'); request.onsuccess = () => resolve(request.result); });
    const photos = await new Promise(resolve => { const request = db.transaction('photos').objectStore('photos').getAll(); request.onsuccess = () => resolve(request.result); });
    db.close(); return photos.map(photo => [photo.width, photo.height, photo.cropVersion]);
  });
  expect(photos).toEqual([[44, 24, 1], [44, 24, 1]]);
});

test('confirmed submission removes crops and pending saves after an initial record save failure', async ({ page }) => {
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
  expect(await counts(page)).toEqual({ banknotes: 0, crops: 0 });
  await expect(page.getByRole('button', { name: 'Retry saving banknotes' })).toHaveCount(0);
});

test('automatic next-note scanning waits for the serial preview before queuing and opening the next scan', async ({ page }) => {
  await page.clock.install();
  await start(page, { preferences: { 'ebt-web-auto-queue-next': 'true', 'ebt-web-result-display-seconds': '15' } });
  await fillLocation(page);
  await page.getByRole('checkbox', { name: 'Use this printer code for multiple notes' }).check();
  await printerScan(page);
  await page.evaluate(value => { window.ocrItems = [value]; }, item(note.serial));
  await page.getByRole('button', { name: 'Continue now' }).click();
  await expect(page.locator('.scan-success strong')).toHaveText(note.serial);
  expect(await page.evaluate(() => window.cameraRequests)).toBe(2);
  expect(await counts(page)).toEqual({ banknotes: 0, crops: 0 });
  await page.getByRole('button', { name: 'Redo scan', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.cameraRequests)).toBe(3);
  await expect(page.locator('.scan-success strong')).toHaveText(note.serial);
  expect(await counts(page)).toEqual({ banknotes: 0, crops: 0 });
  await page.getByRole('button', { name: 'Continue now' }).click();
  await expect.poll(() => page.evaluate(() => window.cameraRequests)).toBe(4);
  await expect(page.locator('.scan-success')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Keep reviewing' })).toHaveCount(0);
  await expect(page.locator('.camera-hint')).toContainText('already queued');
  await page.evaluate(value => { window.ocrItems = [value]; }, item('X00000000011'));
  await expect(page.locator('.scan-success strong')).toHaveText('X00000000011');
  await page.clock.fastForward(14000);
  await expect(page.locator('.scan-success strong')).toHaveText('X00000000011');
  expect(await page.evaluate(() => window.cameraRequests)).toBe(4);
  await page.clock.fastForward(1000);
  await expect.poll(() => page.evaluate(() => window.cameraRequests)).toBe(5);
  await page.getByRole('button', { name: 'Close camera' }).click();
  await page.getByRole('button', { name: /^Queue/ }).click();
  await expect(page.locator('.note-list article')).toHaveCount(2);
  await expect(page.locator('.note-list .code-photo')).toHaveCount(4);
});

test('a serial scan with missing required fields retains its values instead of queuing an invalid banknote', async ({ page }) => {
  await start(page);
  await page.locator('#printer-code').fill('R001A1');
  await page.evaluate(value => { window.ocrItems = [value]; }, item(note.serial));
  await page.locator('.field-row').last().getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.locator('.scan-success strong')).toHaveText(note.serial);
  await page.getByRole('button', { name: 'Continue now' }).click();
  await expect(page.locator('.camera-sheet')).toHaveCount(0);
  await expect(page.locator('#serial-number')).toHaveValue(note.serial);
  await expect(page.locator('.entry-panel [role="status"]')).toContainText('Country:');
  await fillLocation(page);
  await page.getByRole('button', { name: /Add note to queue/ }).click();
  await page.getByRole('button', { name: /^Queue/ }).click();
  await expect(page.locator('.note-list article')).toHaveCount(1);
});
